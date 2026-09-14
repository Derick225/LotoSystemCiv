
import type { Prediction, LearningSession, PredictionHistoryItem, OrchestrationPattern, PredictionFeedback, PatternType, DrawResult } from '../types';
import { syncPredictions, syncLearningSessions, syncPredictionSnapshots } from './syncService';
import { supabase } from './supabaseClient';
import { getAlgoWeights } from './predictionEngine';
import { ALL_DRAWS } from '../constants';
import { get, set, del, keys } from "idb-keyval";
import { EnhancedMetrics } from './prediction/metrics.types';
import { getDeterministicUUID } from '../utils/mathUtils';
import { offlineQueueService } from './offlineQueueService';
import { parseDateSafely, formatDateSafely } from '../utils/dateUtils';
import { logActivePredictionDna } from './prediction/dnaAuditLogService';

const ORCHESTRATION_PREFIX = 'orch_patterns_';
const LEARNING_SESSION_KEY_PREFIX = 'learning_sess_';
const HISTORY_KEY_PREFIX = 'pred_';

// CONSTANTES TEMPORELLES DÉTERMINISTES (Zéro Nombre Magique)
const TIME_CONSTANTS = {
  GRACE_PERIOD_MS: 15 * 60 * 1000,       // 15 minutes de tolérance avant le tirage
  MAX_LOOKAHEAD_DAYS: 7,
  MAX_LOOKAHEAD_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

// CONSTANTES DE RÉTENTION TEMPORELLE & OPTIMISATION DU STOCKAGE LOCAL
export const STORAGE_RETENTION_CONSTANTS = {
  RETENTION_DAYS_DEFAULT: 90,
  DAY_IN_MS: 24 * 60 * 60 * 1000,
  RETENTION_PERIOD_MS: 90 * 24 * 60 * 60 * 1000,
  AUTO_PURGE_ENABLED_KEY: 'lotopro_auto_purge_90d_enabled',
  LAST_PURGE_TIMESTAMP_KEY: 'lotopro_last_prediction_purge_ts',
} as const;

/**
 * Vérifie si l'option de purge automatique des logs > 90 jours est activée (actif par défaut pour optimiser le stockage).
 */
export const isAutoPurgeEnabled = (): boolean => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = window.localStorage.getItem(STORAGE_RETENTION_CONSTANTS.AUTO_PURGE_ENABLED_KEY);
      if (val === null) return true; // Actif par défaut pour protéger l'espace de stockage
      return val === 'true';
    }
  } catch (e) {
    console.warn('[Storage] Erreur lecture statut auto-purge:', e);
  }
  return true;
};

/**
 * Active ou désactive l'option de purge automatique des logs > 90 jours.
 */
export const setAutoPurgeEnabled = (enabled: boolean): void => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_RETENTION_CONSTANTS.AUTO_PURGE_ENABLED_KEY, enabled ? 'true' : 'false');
    }
  } catch (e) {
    console.warn('[Storage] Erreur écriture statut auto-purge:', e);
  }
};

/**
 * Récupère l'horodatage de la dernière purge de logs exécutée.
 */
export const getLastPurgeTimestamp = (): number | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = window.localStorage.getItem(STORAGE_RETENTION_CONSTANTS.LAST_PURGE_TIMESTAMP_KEY);
      return val ? parseInt(val, 10) : null;
    }
  } catch (e) {
    console.warn('[Storage] Erreur lecture horodatage purge:', e);
  }
  return null;
};

/**
 * Calcule le nombre d'inférences ayant plus de 90 jours (ou maxAgeDays) dans le stockage local.
 */
export const getOldPredictionsCount = async (
  drawName?: string,
  maxAgeDays: number = STORAGE_RETENTION_CONSTANTS.RETENTION_DAYS_DEFAULT
): Promise<{ oldItemsCount: number; totalCount: number; oldestTimestamp: number | null; cutoffTimestamp: number }> => {
  const cutoffTimestamp = Date.now() - maxAgeDays * STORAGE_RETENTION_CONSTANTS.DAY_IN_MS;
  const all = await getLocalHistory();
  const filtered = drawName ? all.filter(p => p.drawName?.toLowerCase() === drawName.toLowerCase()) : all;
  
  const oldItems = filtered.filter(p => p.timestamp < cutoffTimestamp);
  const oldestTimestamp = filtered.length > 0 ? filtered[filtered.length - 1].timestamp : null;

  return {
    oldItemsCount: oldItems.length,
    totalCount: filtered.length,
    oldestTimestamp,
    cutoffTimestamp,
  };
};

/**
 * Purge les logs de prédictions ayant plus de 90 jours pour optimiser le stockage local.
 * Respecte l'isolation stricte par tirage si drawName est spécifié.
 */
export const purgeOldPredictionLogs = async (
  drawName?: string,
  maxAgeDays: number = STORAGE_RETENTION_CONSTANTS.RETENTION_DAYS_DEFAULT
): Promise<{ purgedCount: number; remainingCount: number }> => {
  const cutoffTimestamp = Date.now() - maxAgeDays * STORAGE_RETENTION_CONSTANTS.DAY_IN_MS;
  const all = await getLocalHistory();
  const targetItems = drawName ? all.filter(p => p.drawName?.toLowerCase() === drawName.toLowerCase()) : all;
  const oldItems = targetItems.filter(p => p.timestamp < cutoffTimestamp);

  if (oldItems.length > 0) {
    const { delMany } = await import('idb-keyval');
    const keysToDelete: string[] = [];
    for (const item of oldItems) {
      keysToDelete.push(`${HISTORY_KEY_PREFIX}${item.id}`);
      keysToDelete.push(`prediction_snapshot_${item.id}`);
    }
    if (keysToDelete.length > 0) {
      await delMany(keysToDelete);
    }

    // Tentative de suppression distante sur Supabase si l'utilisateur est connecté
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const ids = oldItems.map(p => p.id);
        await supabase.from('predictions').delete().in('id', ids);
        await supabase.from('prediction_snapshots').delete().in('id', ids);
      }
    } catch (e) {
      // Ignorer silencieusement en mode hors-ligne
    }
  }

  // Enregistrer l'horodatage de la purge
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_RETENTION_CONSTANTS.LAST_PURGE_TIMESTAMP_KEY, String(Date.now()));
    }
  } catch (e) {
    // Ignorer
  }

  return {
    purgedCount: oldItems.length,
    remainingCount: targetItems.length - oldItems.length,
  };
};

/**
 * Exécute la purge automatique en arrière-plan si l'option est activée.
 */
export const autoPurgePredictionLogsIfEnabled = async (
  drawName?: string,
  maxAgeDays: number = STORAGE_RETENTION_CONSTANTS.RETENTION_DAYS_DEFAULT
): Promise<{ purgedCount: number }> => {
  if (!isAutoPurgeEnabled()) {
    return { purgedCount: 0 };
  }
  const result = await purgeOldPredictionLogs(drawName, maxAgeDays);
  if (result.purgedCount > 0) {
    console.info(`[Storage Optimizer] Purge automatique : ${result.purgedCount} log(s) de prédictions (> ${maxAgeDays} jours) nettoyé(s) pour optimiser le stockage local.`);
  }
  return { purgedCount: result.purgedCount };
};

const getLocalHistory = async (): Promise<PredictionHistoryItem[]> => {
  const items: PredictionHistoryItem[] = [];
  if (typeof indexedDB === 'undefined') {
    return items;
  }
  try {
    const allKeys = await keys();
    const histKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(HISTORY_KEY_PREFIX)) as string[];
    if (histKeys.length > 0) {
        const { getMany } = await import('idb-keyval');
        const values = await getMany(histKeys);
        for (let i = 0; i < values.length; i++) {
            const itemStr = values[i];
            if (itemStr) {
                try {
                    const item = (typeof itemStr === 'string' ? JSON.parse(itemStr) : itemStr);
                    if (item && item.timestamp) items.push(item);
                } catch (e) {
                    console.warn("Error parsing history item", e);
                }
            }
        }
    }
  } catch (e) {
    console.warn("Error getting local history", e);
  }
  // Tri déterministe : timestamp décroissant, puis ID croissant en cas d'égalité
  return items.sort((a, b) => {
    if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
    return a.id.localeCompare(b.id);
  });
};

export const findMatchingResultForPrediction = (prediction: PredictionHistoryItem, historyUpdates: DrawResult[]): DrawResult | null => {
  if (!historyUpdates || historyUpdates.length === 0) return null;
  const predTime = prediction.timestamp;
  const drawInfo = ALL_DRAWS.find(d => d.name === prediction.drawName);
  const timeStr = drawInfo ? drawInfo.time : "21:00";
  const [drawHour, drawMinute] = timeStr.split(':').map(Number);

  let bestMatch: DrawResult | null = null;
  let bestDiff = Infinity;

  for (const d of historyUpdates) {
    if (!d.date) continue;
    const resultDrawName = d.drawName || (d as unknown as Record<string, unknown>).draw_name as string;
    if (resultDrawName && prediction.drawName && resultDrawName.trim().toLowerCase() !== prediction.drawName.trim().toLowerCase()) {
      continue;
    }
    const parsedDate = parseDateSafely(d.date);
    const drawOccurrence = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), drawHour || 21, drawMinute || 0, 0).getTime();
    const diff = drawOccurrence - predTime;
    
    if (diff >= -TIME_CONSTANTS.GRACE_PERIOD_MS && diff < TIME_CONSTANTS.MAX_LOOKAHEAD_MS) {
        // We want the draw that is closest in the future (smallest positive diff, or smallest absolute diff if negative)
        const absDiff = Math.abs(diff);
        if (absDiff < bestDiff) {
            bestDiff = absDiff;
            bestMatch = d;
        }
    }
  }
  
  return bestMatch;
};

// ... (existing imports)

export const syncAllHistory = async (drawName: string): Promise<PredictionHistoryItem[]> => {
    const all = await getLocalHistory();
    const local = all.filter(p => p.drawName?.toLowerCase() === drawName?.toLowerCase());
    try {
        const synced = await syncPredictions(local);
        
        // Mettre à jour le localStorage (IndexedDB) avec les données fusionnées en une seule transaction
        const { setMany } = await import( 'idb-keyval');
        const entries: [string, any][] = synced.map(item => [`${HISTORY_KEY_PREFIX}${item.id}`, JSON.stringify(item)]);
        if (entries.length > 0) {
            await setMany(entries);
        }
        
        // Sync snapshots implicitly
        syncPredictionSnapshots(drawName).catch(e => console.error(e));
        
        return synced;
    } catch (e) {
        console.error("Sync failed, returning local", e);
        return local;
    }
};

export const getPredictionHistoryAsync = async (drawName: string): Promise<PredictionHistoryItem[]> => {
    // On tente une synchro rapide en arrière-plan si on est en ligne ?
    // Pour l'instant, on retourne le local, et l'UI déclenchera la synchro explicite.
    const all = await getLocalHistory();
    return all.filter(p => p.drawName?.toLowerCase() === drawName?.toLowerCase());
};

const LATEST_PRED_KEY_PREFIX = 'nexus_latest_prediction_';

/**
 * Récupère la dernière prédiction persistée pour un tirage donné (IndexedDB + localStorage fallback).
 * Permet un chargement instantané hors-ligne (Offline Fallback) avec isolation stricte du tirage.
 */
export const getLatestPredictionForDraw = async (drawName: string): Promise<Prediction | null> => {
    if (!drawName) return null;
    const cleanDraw = drawName.trim().toLowerCase();
    const key = `${LATEST_PRED_KEY_PREFIX}${cleanDraw}`;
    
    // 1. Essai IndexedDB
    try {
        const cached = await get(key);
        if (cached) {
            const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
            if (parsed && Array.isArray(parsed.suggestedNumbers)) {
                return parsed as Prediction;
            }
        }
    } catch (e) {
        console.warn(`[Storage] Échec lecture IndexedDB pour ${key}:`, e);
    }

    // 2. Essai localStorage de secours
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = window.localStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.suggestedNumbers)) {
                    return parsed as Prediction;
                }
            }
        }
    } catch (e) {
        console.warn(`[Storage] Échec lecture localStorage pour ${key}:`, e);
    }

    // 3. Fallback sur l'historique local complet
    try {
        const history = await getPredictionHistoryAsync(drawName);
        if (history.length > 0 && history[0]?.prediction) {
            return history[0].prediction;
        }
    } catch (e) {
        console.warn(`[Storage] Échec lecture fallback historique pour ${drawName}:`, e);
    }

    return null;
};

/**
 * Sauvegarde la dernière prédiction générée pour un tirage (IndexedDB + localStorage).
 * 100% Déterministe et strictement isolé par drawName.
 */
export const saveLatestPredictionForDraw = async (drawName: string, prediction: Prediction): Promise<void> => {
    if (!drawName || !prediction) return;
    const cleanDraw = drawName.trim().toLowerCase();
    const key = `${LATEST_PRED_KEY_PREFIX}${cleanDraw}`;
    const payload = JSON.stringify(prediction);

    // IndexedDB persistant
    try {
        await set(key, payload);
    } catch (e) {
        console.warn(`[Storage] Échec écriture IndexedDB pour ${key}:`, e);
    }

    // localStorage persistant synchrone
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, payload);
        }
    } catch (e) {
        console.warn(`[Storage] Échec écriture localStorage pour ${key}:`, e);
    }
};

export const findPredictionsByDate = async (drawName: string, date: string): Promise<PredictionHistoryItem[]> => {
    const all = await getPredictionHistoryAsync(drawName);
    return all.filter(p => {
        const d = parseDateSafely(p.timestamp);
        const predDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        return predDate === date;
    });
};

export const savePredictionSnapshot = async (id: string, drawName: string, prediction: Prediction, metrics?: EnhancedMetrics) => {
    const weights = await getAlgoWeights(drawName);
    const targetDate = new Date().toISOString().split('T')[0];
    
    // Enrich metrics_snapshot with full mathematical and model context
    const enrichedMetrics: Record<string, any> = { ...(metrics || {}) };
    
    enrichedMetrics.app_version = "v12.0";
    
    const currentEntropy = metrics?.statisticalBounds?.shannonEntropy !== undefined
        ? metrics.statisticalBounds.shannonEntropy
        : 0.5; // Fallback
        
    enrichedMetrics.shannon_entropy = currentEntropy;
    enrichedMetrics.hurst_exponent = metrics?.statisticalBounds?.hurstExponent !== undefined
        ? metrics.statisticalBounds.hurstExponent
        : 0.5; // Fallback
        
    enrichedMetrics.fft_spectral_metrics = metrics?.spectral || [];
    
    enrichedMetrics.hyperparameters = prediction.hyperparameters || {
        sigmoid_slope: 1.2 - 0.8 * currentEntropy,
        sigmoid_intercept: -0.5 - 1.5 * currentEntropy,
        boosting_multiplier: 1.0,
        prudence_mode_active: false
    };

    const snapshotData = {
        id: id,
        draw_name: drawName,
        target_date: targetDate,
        predicted_numbers: prediction.suggestedNumbers,
        decision_dna: weights,
        metrics_snapshot: enrichedMetrics,
        status: 'PENDING'
    };

    try {
        await set(`prediction_snapshot_${id}`, JSON.stringify(snapshotData));
    } catch (e) {
        console.error("Local save snapshot failed", e);
    }

    // Offline-first enqueue with automatic background reconciliation
    offlineQueueService.enqueue('prediction_snapshot', drawName, snapshotData).catch(e => {
        console.error("Failed to enqueue prediction snapshot for offline sync", e);
    });
};

export const savePredictionToHistory = async (drawName: string, prediction: Prediction, drawResultId?: string, metrics?: EnhancedMetrics): Promise<PredictionHistoryItem> => {
  const seed = `${drawName}_${Date.now()}_${prediction.suggestedNumbers.join(',')}`;
  let hashVal = 0;
  for (let i = 0; i < seed.length; i++) {
    hashVal = (hashVal << 5) - hashVal + seed.charCodeAt(i);
    hashVal |= 0;
  }
  const deterministicId = getDeterministicUUID(`pred_${Math.abs(hashVal)}_${Date.now()}`);

  const resolvedEngineType: "local" | "cloud" =
    prediction.engineType ||
    (prediction.isLocalFallback
      ? "local"
      : prediction.aiRationale || prediction.aiStrategicAdvice || (prediction.mathModelSummary && (prediction.mathModelSummary.includes("Cloud") || prediction.mathModelSummary.includes("Gemini")))
      ? "cloud"
      : "local");

  const normalizedPrediction: Prediction = {
    ...prediction,
    engineType: resolvedEngineType,
  };

  const newItem: PredictionHistoryItem = {
    id: deterministicId,
    timestamp: Date.now(),
    drawName,
    prediction: normalizedPrediction,
    engineType: resolvedEngineType,
    drawResultId: drawResultId || null
  };

  const key = `${HISTORY_KEY_PREFIX}${newItem.id}`;
  
  try {
      await set(key, JSON.stringify(newItem));
  } catch (e) {
       console.error("Critical storage error:", e);
  }

  // Enregistrement persistant transparent dans le cache local indexé par drawName (Offline Fallback)
  saveLatestPredictionForDraw(drawName, prediction).catch(e => console.warn("Latest prediction cache failed", e));
  
  // Automate sync in background
  syncAllHistory(drawName).catch(e => console.error("Auto-sync prediction history failed", e));
  
  // Save forensic snapshot
  savePredictionSnapshot(newItem.id, drawName, prediction, metrics).catch(e => console.error("Snapshot save failed", e));

  // Enregistrement systématique de l'ADN actif de la prédiction pour l'audit post-tirage
  getAlgoWeights(drawName)
    .then(weights => logActivePredictionDna(drawName, newItem.id, prediction.suggestedNumbers, weights, [], {
      entropy: metrics?.statisticalBounds?.shannonEntropy,
      hurst: metrics?.statisticalBounds?.hurstExponent,
      confidence: prediction.confidence
    }))
    .catch(e => console.warn("[DnaAudit] Échec de l'enregistrement automatique de l'ADN actif:", e));
  
  // Purge automatique en tâche de fond des logs de plus de 90 jours
  autoPurgePredictionLogsIfEnabled(drawName).catch(e => console.warn("Auto-purge background task warning:", e));

  return newItem;
};

export const updatePredictionFeedback = async (id: string, feedback: PredictionFeedback): Promise<void> => {
    const key = `${HISTORY_KEY_PREFIX}${id}`;
    const raw = await get(key);
    if (raw) {
        const item: PredictionHistoryItem = (typeof raw === 'string' ? JSON.parse(raw) : raw);
        const updatedItem = { ...item, feedback };
        await set(key, JSON.stringify(updatedItem));

        // Mettre à jour l'index centralisé de feedback pour optimiser weightsManager / applyMetaLearning
        try {
            const feedbackIndexStr = await get('feedback_index_map');
            const indexObj = feedbackIndexStr 
                ? (typeof feedbackIndexStr === 'string' ? JSON.parse(feedbackIndexStr) : feedbackIndexStr)
                : {};
            indexObj[id] = { id, feedback };
            await set('feedback_index_map', JSON.stringify(indexObj));
        } catch (err) {
            console.error("Failed to update feedback_index_map:", err);
        }

        // Automate sync in background
        syncAllHistory(item.drawName).catch(e => console.error("Auto-sync prediction feedback failed", e));
    }
};

export const clearPredictionHistory = async (drawName: string) => {
    const all = await getLocalHistory();
    const toDelete = all.filter(p => p.drawName?.toLowerCase() === drawName?.toLowerCase());
    const { delMany } = await import( 'idb-keyval');
    const keysToDelete = toDelete.map(p => `${HISTORY_KEY_PREFIX}${p.id}`);
    if (keysToDelete.length > 0) {
        await delMany(keysToDelete);
    }
};

export const deletePrediction = async (id: string): Promise<void> => {
    await del(`${HISTORY_KEY_PREFIX}${id}`);
    await del(`prediction_snapshot_${id}`);
    
    // Also delete any forensic report associated with this prediction to avoid orphans
    try {
        const { deleteForensicReportLocal } = await import('./postPredictionAnalysisService');
        await deleteForensicReportLocal(`forensic_${id}`, id);
    } catch {
        // ignore
    }
    
    // Attempt to delete from cloud if syncing is enabled
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('predictions').delete().eq('id', id);
            await supabase.from('prediction_snapshots').delete().eq('id', id);
        }
    } catch(e) {
        // ignore cloud delete error silently
    }
};

export const deleteMultiplePredictions = async (ids: string[]): Promise<void> => {
    if (!ids || ids.length === 0) return;
    const { delMany } = await import('idb-keyval');
    const keysToDelete = ids.flatMap(id => [
        `${HISTORY_KEY_PREFIX}${id}`,
        `prediction_snapshot_${id}`
    ]);
    await delMany(keysToDelete);

    try {
        const { deleteMultipleForensicReportsLocal } = await import('./postPredictionAnalysisService');
        await deleteMultipleForensicReportsLocal(ids.map(id => ({ id: `forensic_${id}`, predictionId: id })));
    } catch {
        // ignore
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('predictions').delete().in('id', ids);
            await supabase.from('prediction_snapshots').delete().in('id', ids);
        }
    } catch(e) {
        // ignore cloud delete error silently
    }
};

export const getAllLearningSessions = async (): Promise<LearningSession[]> => {
  const sessions: LearningSession[] = [];
  if (typeof indexedDB === 'undefined') {
    return sessions;
  }
  try {
    const allKeys = await keys();
    const sessKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(LEARNING_SESSION_KEY_PREFIX)) as string[];
    
    if (sessKeys.length > 0) {
        const { getMany } = await import( 'idb-keyval');
        const values = await getMany(sessKeys);
        for (let i = 0; i < values.length; i++) {
            const itemStr = values[i];
            if (itemStr) {
                try {
                    const item = (typeof itemStr === 'string' ? JSON.parse(itemStr) : itemStr);
                    if (item && item.timestamp) sessions.push(item);
                } catch (e) {
                    console.warn("Error parsing session item", e);
                }
            }
        }
    }
  } catch (e) {
    console.warn("Error getting learning sessions", e);
  }
  return sessions.sort((a, b) => {
    if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
    return a.id.localeCompare(b.id);
  });
};

export const saveLearningSession = async (drawName: string, sessionData: Omit<LearningSession, 'id' | 'timestamp' | 'drawName'>) => {
    const seed = `${drawName}_${Date.now()}_calibration`;
    let hashVal = 0;
    for (let i = 0; i < seed.length; i++) {
        hashVal = (hashVal << 5) - hashVal + seed.charCodeAt(i);
        hashVal |= 0;
    }
    const deterministicId = getDeterministicUUID(`sess_${Math.abs(hashVal)}_${Date.now()}`);

    const session: LearningSession = {
        id: deterministicId,
        drawName,
        timestamp: Date.now(),
        ...sessionData
    };

    const key = `${LEARNING_SESSION_KEY_PREFIX}${session.id}`;
    
    try {
        await set(key, JSON.stringify(session));
    } catch (e) {
        console.error("Storage error:", e);
    }
    
    // Sync background via offline queue
    offlineQueueService.enqueue('learning_session', drawName, session).catch(e => {
        console.error("Learning session offline enqueue failed", e);
    });
    
    return session;
};

export const getLearningSessions = async (drawName: string): Promise<LearningSession[]> => {
    const all = await getAllLearningSessions();
    return all.filter(s => s.drawName?.toLowerCase() === drawName?.toLowerCase());
};

export const syncLearningSessionsWithCloud = async (drawName: string) => {
    const local = await getLearningSessions(drawName);
    try {
        const synced = await syncLearningSessions(local);
        const { setMany } = await import( 'idb-keyval');
        const entries: [string, any][] = synced.map(s => [`${LEARNING_SESSION_KEY_PREFIX}${s.id}`, JSON.stringify(s)]);
        if (entries.length > 0) {
            await setMany(entries);
        }
        return synced;
    } catch (e) {
        return local;
    }
};

export const getOrchestrationPatternsAsync = async (drawName: string): Promise<OrchestrationPattern[]> => {
    try {
        const raw = await get(`${ORCHESTRATION_PREFIX}${drawName}`);
        return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    } catch (e) { return []; }
};

export const getPatternIntensityAsync = async (drawName: string): Promise<{ subject: string, A: number, fullMark: number }[]> => {
    const patterns = await getOrchestrationPatternsAsync(drawName);
    const types: PatternType[] = ['Miroir', 'Voisin', 'Transfert Machine', 'Répétition', 'Leurre Machine', 'Suite', 'Finale', 'Dizaine'];
    
    // safe maxCount
    const validCounts = patterns.map(p => p.count).filter(c => typeof c === 'number' && !isNaN(c));
    const maxCount = validCounts.length > 0 ? Math.max(...validCounts) : 1;
    
    return types.map(type => {
        const match = patterns.find(p => p.type === type);
        const count = match && typeof match.count === 'number' ? match.count : 0;
        return {
            subject: type,
            A: Math.round((count / (maxCount || 1)) * 100) || 0,
            fullMark: 100
        };
    });
};

export const linkPredictionToResult = async (predictionId: string, drawResultId: string): Promise<void> => {
    const key = `${HISTORY_KEY_PREFIX}${predictionId}`;
    const raw = await get(key);
    if (raw) {
        const item: PredictionHistoryItem = (typeof raw === 'string' ? JSON.parse(raw) : raw);
        if (item.drawResultId !== drawResultId) {
            const updatedItem = { ...item, drawResultId };
            await set(key, JSON.stringify(updatedItem));
            // Automate sync in background
            syncAllHistory(item.drawName).catch(e => console.error("Auto-sync prediction link failed", e));
        }
    }
};

/**
 * Calcule des statistiques de performance de l'IA sur l'historique
 * Utilise le résultat directement lié (drawResultId) ou l'algorithme robuste findMatchingResultForPrediction
 */
export const calculateHistoricalPerformance = (predictions: PredictionHistoryItem[], results: DrawResult[]) => {
    let totalPredictedNumbers = 0;
    let totalHits = 0;
    let perfectDraws = 0; // 3 hits ou plus
    const trendData: { date: string; hits: number; confidence: number }[] = [];

    // On parcourt les prédictions
    for (const pred of predictions) {
        // On cherche le résultat correspondant (par ID lié ou par matching temporel robuste)
        const result = (pred.drawResultId ? results.find(r => r.id === pred.drawResultId) : null) || findMatchingResultForPrediction(pred, results);
        
        if (result) {
            // Calcul des hits
            const hits = pred.prediction.suggestedNumbers.filter(n => result.gagnants.includes(n)).length;
            
            totalPredictedNumbers += pred.prediction.suggestedNumbers.length;
            totalHits += hits;
            
            if (hits >= 3) perfectDraws++;
            
            const displayDate = result.date ? (result.date.includes('/') ? result.date.slice(0, 5) : result.date) : formatDateSafely(pred.timestamp).slice(0, 5);
            trendData.push({
                date: displayDate,
                hits: hits,
                confidence: pred.prediction.confidence
            });
        }
    }
    
    // Tri chronologique pour le graphique (du plus vieux au plus récent)
    trendData.reverse();

    return {
        accuracy: totalPredictedNumbers > 0 ? (totalHits / totalPredictedNumbers) * 100 : 0,
        totalHits,
        perfectDraws,
        analyzedDrawsCount: trendData.length,
        trend: trendData
    };
};

export interface PredictionHistoryFilter {
  drawName?: string;
  startDate?: string;
  endDate?: string;
  minConfidence?: number;
  maxConfidence?: number;
  minHits?: number;
  containsNumbers?: number[];
  regime?: string;
  sortBy?: 'timestamp' | 'confidence' | 'hits';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface IndexedQueryResult {
  items: (PredictionHistoryItem & { hits?: number; matchedResult?: DrawResult | null })[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  aggregateStats: {
    averageHits: number;
    averageConfidence: number;
    hitRatePercent: number;
    matchCount: number;
  };
}

/**
 * Système d'indexation et d'interrogation performant pour l'historique des prédictions.
 * Permet un filtrage multi-critères rapide avec calcul d'agrégats statistiques continus.
 */
export const queryPredictionHistoryIndexed = async (
  filter: PredictionHistoryFilter,
  resultsHistory?: DrawResult[]
): Promise<IndexedQueryResult> => {
  const all = await getLocalHistory();
  let filtered = all;

  if (filter.drawName) {
    const targetDraw = filter.drawName.trim().toLowerCase();
    filtered = filtered.filter(p => p.drawName?.toLowerCase() === targetDraw);
  }

  if (filter.startDate) {
    const startTs = parseDateSafely(filter.startDate).getTime();
    filtered = filtered.filter(p => p.timestamp >= startTs);
  }

  if (filter.endDate) {
    const endTs = parseDateSafely(filter.endDate).getTime();
    filtered = filtered.filter(p => p.timestamp <= endTs);
  }

  if (typeof filter.minConfidence === 'number') {
    filtered = filtered.filter(p => (p.prediction?.confidence ?? 0) >= filter.minConfidence!);
  }

  if (typeof filter.maxConfidence === 'number') {
    filtered = filtered.filter(p => (p.prediction?.confidence ?? 0) <= filter.maxConfidence!);
  }

  if (filter.containsNumbers && filter.containsNumbers.length > 0) {
    const searchNums = filter.containsNumbers;
    filtered = filtered.filter(p => {
      const suggested = p.prediction?.suggestedNumbers || [];
      return searchNums.every(num => suggested.includes(num));
    });
  }

  if (filter.regime) {
    const targetRegime = filter.regime.toUpperCase();
    filtered = filtered.filter(p => {
      const rContext = (p.prediction?.regimeContext?.regime || '').toUpperCase();
      const pPhase = (p.prediction?.cyclicPhaseProfile?.phase || '').toUpperCase();
      return rContext.includes(targetRegime) || pPhase.includes(targetRegime);
    });
  }

  // Enrichissement avec les résultats de tirages pour le filtrage par hits
  const enrichedItems: (PredictionHistoryItem & { hits?: number; matchedResult?: DrawResult | null })[] = [];
  let totalHitsSum = 0;
  let totalConfidenceSum = 0;
  let matchesCount = 0;

  for (const item of filtered) {
    let hits: number | undefined;
    let matchedResult: DrawResult | null = null;
    if (resultsHistory && resultsHistory.length > 0) {
      matchedResult = (item.drawResultId ? resultsHistory.find(r => r.id === item.drawResultId) : null) || findMatchingResultForPrediction(item, resultsHistory);
      if (matchedResult && Array.isArray(matchedResult.gagnants)) {
        hits = (item.prediction?.suggestedNumbers || []).filter(n => matchedResult!.gagnants.includes(n)).length;
        totalHitsSum += hits;
        matchesCount++;
      }
    }
    totalConfidenceSum += item.prediction?.confidence ?? 0;
    enrichedItems.push({ ...item, hits, matchedResult });
  }

  let finalItems = enrichedItems;
  if (typeof filter.minHits === 'number') {
    finalItems = finalItems.filter(item => typeof item.hits === 'number' && item.hits >= filter.minHits!);
  }

  // Tri déterministe
  const sortBy = filter.sortBy || 'timestamp';
  const sortOrder = filter.sortOrder || 'desc';
  const orderMultiplier = sortOrder === 'asc' ? 1 : -1;

  finalItems.sort((a, b) => {
    if (sortBy === 'confidence') {
      const cA = a.prediction?.confidence ?? 0;
      const cB = b.prediction?.confidence ?? 0;
      return (cA - cB) * orderMultiplier;
    }
    if (sortBy === 'hits') {
      const hA = a.hits ?? -1;
      const hB = b.hits ?? -1;
      return (hA - hB) * orderMultiplier;
    }
    return (a.timestamp - b.timestamp) * orderMultiplier;
  });

  const totalCount = finalItems.length;
  const pageSize = Math.max(1, filter.pageSize || 20);
  const page = Math.max(1, filter.page || 1);
  const totalPages = Math.ceil(totalCount / pageSize);
  const paginatedItems = finalItems.slice((page - 1) * pageSize, page * pageSize);

  const averageConfidence = filtered.length > 0 ? totalConfidenceSum / filtered.length : 0;
  const averageHits = matchesCount > 0 ? totalHitsSum / matchesCount : 0;
  const hitRatePercent = matchesCount > 0 ? (totalHitsSum / (matchesCount * 5.0)) * 100.0 : 0;

  return {
    items: paginatedItems,
    totalCount,
    page,
    pageSize,
    totalPages,
    aggregateStats: {
      averageHits: parseFloat(averageHits.toFixed(3)),
      averageConfidence: parseFloat(averageConfidence.toFixed(2)),
      hitRatePercent: parseFloat(hitRatePercent.toFixed(2)),
      matchCount: matchesCount,
    },
  };
};

/**
 * Calcul complet des indicateurs avancés de suivi de la performance des prédictions dans le temps
 */
export const calculateExtendedHistoricalPerformance = (
  predictions: PredictionHistoryItem[],
  results: DrawResult[]
) => {
  const basePerf = calculateHistoricalPerformance(predictions, results);
  
  const hitDistribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let brierErrorSum = 0;
  let scoredDrawsCount = 0;
  const rollingHits: number[] = [];
  const rollingAccuracy5: { date: string; rate: number }[] = [];

  for (const pred of predictions) {
    const result = (pred.drawResultId ? results.find(r => r.id === pred.drawResultId) : null) || findMatchingResultForPrediction(pred, results);
    if (result && Array.isArray(result.gagnants)) {
      const hits = (pred.prediction?.suggestedNumbers || []).filter(n => result.gagnants.includes(n)).length;
      hitDistribution[Math.min(5, Math.max(0, hits))] = (hitDistribution[Math.min(5, Math.max(0, hits))] || 0) + 1;
      
      // Brier score empirique continu pour la prédiction
      const observedRate = hits / 5.0;
      const expectedProb = (pred.prediction?.confidence ?? 50) / 100.0;
      brierErrorSum += Math.pow(expectedProb - observedRate, 2);
      scoredDrawsCount++;

      rollingHits.push(hits);
      if (rollingHits.length >= 5) {
        const last5 = rollingHits.slice(-5);
        const avgLast5 = last5.reduce((a, b) => a + b, 0) / 25.0;
        rollingAccuracy5.push({
          date: result.date || formatDateSafely(pred.timestamp),
          rate: parseFloat((avgLast5 * 100).toFixed(2)),
        });
      }
    }
  }

  const meanBrierScore = scoredDrawsCount > 0 ? brierErrorSum / scoredDrawsCount : 0.05;

  // Calcul du ratio de Sharpe simplifié sur la régularité des hits
  const hitValues = Object.entries(hitDistribution).flatMap(([h, count]) => Array(count).fill(Number(h)));
  const meanHits = hitValues.length > 0 ? hitValues.reduce((a, b) => a + b, 0) / hitValues.length : 0;
  const varianceHits = hitValues.length > 0 ? hitValues.reduce((s, h) => s + Math.pow(h - meanHits, 2), 0) / hitValues.length : 0;
  const stdDevHits = Math.sqrt(varianceHits);
  const sharpeRatio = stdDevHits > 0 ? (meanHits - 0.278) / stdDevHits : 0; // 0.278 = espérance théorique uniforme (5 * 5/90)

  return {
    ...basePerf,
    hitDistribution,
    meanBrierScore: parseFloat(meanBrierScore.toFixed(4)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(3)),
    rollingAccuracy5,
    scoredDrawsCount,
  };
};
