
import type { Prediction, LearningSession, PredictionHistoryItem, OrchestrationPattern, PredictionFeedback, PatternType, DrawResult } from '../types';
import { syncPredictions, syncLearningSessions, syncPredictionSnapshots } from './syncService';
import { supabase } from './supabaseClient';
import { getAlgoWeights } from './predictionEngine';
import { ALL_DRAWS } from '../constants';
import { get, set, del, keys } from "idb-keyval";
import { EnhancedMetrics } from './prediction/metrics.types';
import { getDeterministicUUID } from '../utils/mathUtils';
import { offlineQueueService } from './offlineQueueService';

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

// ============================================================================
// INDEXATION MÉMOIRE HAUTE PERFORMANCE (L1) - ISOLATION STRICTE PAR TIRAGE
// ============================================================================
interface HistoryMemoryIndex {
  all: PredictionHistoryItem[];
  byDraw: Map<string, PredictionHistoryItem[]>;
  byId: Map<string, PredictionHistoryItem>;
  lastLoaded: number;
}

let historyIndex: HistoryMemoryIndex | null = null;

export const invalidateHistoryIndex = (): void => {
  historyIndex = null;
};

const getLocalHistory = async (): Promise<PredictionHistoryItem[]> => {
  // Vérification de l'index mémoire L1 (validité 15 secondes ou jusqu'à invalidation)
  if (historyIndex && (Date.now() - historyIndex.lastLoaded < 15000)) {
    return historyIndex.all;
  }

  const items: PredictionHistoryItem[] = [];
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
  const sorted = items.sort((a, b) => {
    if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
    return a.id.localeCompare(b.id);
  });

  // Construction des index secondaires isolés
  const byDraw = new Map<string, PredictionHistoryItem[]>();
  const byId = new Map<string, PredictionHistoryItem>();
  for (const item of sorted) {
    byId.set(item.id, item);
    const drawKey = (item.drawName || '').trim().toLowerCase();
    if (!byDraw.has(drawKey)) {
      byDraw.set(drawKey, []);
    }
    byDraw.get(drawKey)!.push(item);
  }

  historyIndex = {
    all: sorted,
    byDraw,
    byId,
    lastLoaded: Date.now(),
  };

  return sorted;
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
    const [day, month, year] = d.date.split('/').map(Number);
    const drawOccurrence = new Date(year, month - 1, day, drawHour, drawMinute, 0).getTime();
    const diff = drawOccurrence - predTime;
    
    if (diff >= -TIME_CONSTANTS.GRACE_PERIOD_MS && diff < TIME_CONSTANTS.MAX_LOOKAHEAD_MS) {
        // We want the draw that is closest in the future (smallest positive diff, or smallest absolute diff if negative)
        // Wait, if it's the exact draw, diff should be small.
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
    if (!drawName) return [];
    await getLocalHistory();
    const cleanDraw = drawName.trim().toLowerCase();
    if (historyIndex && historyIndex.byDraw.has(cleanDraw)) {
        return historyIndex.byDraw.get(cleanDraw)!;
    }
    const all = await getLocalHistory();
    return all.filter(p => p.drawName?.toLowerCase() === cleanDraw);
};

export interface PredictionQueryOptions {
  drawName?: string;
  startDate?: string;
  endDate?: string;
  minHits?: number;
  limit?: number;
  offset?: number;
}

/**
 * Moteur de requête indexé haute performance avec pagination et filtres temporels
 */
export const queryPredictionsFast = async (
  options: PredictionQueryOptions = {}
): Promise<{ items: PredictionHistoryItem[]; total: number }> => {
  const all = options.drawName 
    ? await getPredictionHistoryAsync(options.drawName)
    : await getLocalHistory();

  let filtered = all;

  if (options.startDate) {
    const startMs = new Date(options.startDate).getTime();
    if (!isNaN(startMs)) {
      filtered = filtered.filter(p => p.timestamp >= startMs);
    }
  }

  if (options.endDate) {
    const endMs = new Date(options.endDate).getTime();
    if (!isNaN(endMs)) {
      filtered = filtered.filter(p => p.timestamp <= endMs);
    }
  }

  const total = filtered.length;
  const offset = options.offset || 0;
  const limit = options.limit || 50;
  const paginated = filtered.slice(offset, offset + limit);

  return { items: paginated, total };
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
        const d = new Date(p.timestamp);
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
 */
export const calculateHistoricalPerformance = (predictions: PredictionHistoryItem[], results: DrawResult[]) => {
    let totalPredictedNumbers = 0;
    let totalHits = 0;
    let perfectDraws = 0; // 3 hits ou plus
    const trendData: { date: string; hits: number; confidence: number }[] = [];

    // On parcourt les prédictions
    for (const pred of predictions) {
        const d = new Date(pred.timestamp);
        const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        
        // On cherche le résultat correspondant (par ID lié ou par date)
        const result = results.find(r => r.id === pred.drawResultId || r.date === dateStr);
        
        if (result) {
            // Calcul des hits
            const hits = pred.prediction.suggestedNumbers.filter(n => result.gagnants.includes(n)).length;
            
            totalPredictedNumbers += pred.prediction.suggestedNumbers.length;
            totalHits += hits;
            
            if (hits >= 3) perfectDraws++;
            
            trendData.push({
                date: dateStr.slice(0, 5), // JJ/MM
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

export interface AdvancedPredictionPerformanceTimeline {
  drawName: string;
  totalPredictions: number;
  evaluatedPredictions: number;
  hitDistribution: {
    hits0: number;
    hits1: number;
    hits2: number;
    hits3: number;
    hits4: number;
    hits5: number;
  };
  hitRateTop5Pct: number; // % avec >= 1 hit
  exact3PlusPct: number;  // % avec >= 3 hits
  averageConfidence: number;
  rollingAccuracyTrend: 'improving' | 'stable' | 'degrading';
  timeline: {
    date: string;
    timestamp: number;
    hits: number;
    confidence: number;
    hitRateCumulPct: number;
  }[];
}

/**
 * Calcule une série temporelle complète et quantifiée des métriques de précision des prédictions passées.
 * 100% Déterministe et strictement isolé par tirage (Tirage Isolation Rule).
 */
export const calculateAdvancedPerformanceTimeline = (
  drawName: string,
  predictions: PredictionHistoryItem[],
  results: DrawResult[]
): AdvancedPredictionPerformanceTimeline => {
  const cleanDraw = (drawName || '').trim().toLowerCase();
  const isolatedPreds = predictions.filter(p => (p.drawName || '').trim().toLowerCase() === cleanDraw);
  const isolatedResults = results.filter(r => (r.drawName || '').trim().toLowerCase() === cleanDraw);

  const hitDistribution = { hits0: 0, hits1: 0, hits2: 0, hits3: 0, hits4: 0, hits5: 0 };
  let totalEvaluated = 0;
  let totalHitsCount = 0;
  let confSum = 0;
  let exact3PlusCount = 0;

  const timelineItems: AdvancedPredictionPerformanceTimeline['timeline'] = [];

  // Tri chronologique croissant pour suivre l'évolution cumulative dans le temps
  const chronologicalPreds = [...isolatedPreds].sort((a, b) => a.timestamp - b.timestamp);

  for (const pred of chronologicalPreds) {
    const d = new Date(pred.timestamp);
    const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const result = isolatedResults.find(r => r.id === pred.drawResultId || r.date === dateStr);

    if (result) {
      totalEvaluated++;
      const suggested = Array.isArray(pred.prediction?.suggestedNumbers) ? pred.prediction.suggestedNumbers : [];
      const winners = Array.isArray(result.gagnants) ? result.gagnants : [];
      const hits = suggested.filter(n => winners.includes(n)).length;

      if (hits === 0) hitDistribution.hits0++;
      else if (hits === 1) hitDistribution.hits1++;
      else if (hits === 2) hitDistribution.hits2++;
      else if (hits === 3) hitDistribution.hits3++;
      else if (hits === 4) hitDistribution.hits4++;
      else if (hits >= 5) hitDistribution.hits5++;

      if (hits >= 3) exact3PlusCount++;
      totalHitsCount += hits;
      const conf = pred.prediction?.confidence || 50;
      confSum += conf;

      const hitRateCumul = (totalHitsCount / (totalEvaluated * 5)) * 100;

      timelineItems.push({
        date: dateStr,
        timestamp: pred.timestamp,
        hits,
        confidence: conf,
        hitRateCumulPct: parseFloat(hitRateCumul.toFixed(2)),
      });
    }
  }

  // Évaluation de la tendance temporelle sur les 10 dernières évaluations
  let rollingAccuracyTrend: AdvancedPredictionPerformanceTimeline['rollingAccuracyTrend'] = 'stable';
  if (timelineItems.length >= 6) {
    const mid = Math.floor(timelineItems.length / 2);
    const firstHalfAvg = timelineItems.slice(0, mid).reduce((s, t) => s + t.hits, 0) / mid;
    const secondHalfAvg = timelineItems.slice(mid).reduce((s, t) => s + t.hits, 0) / (timelineItems.length - mid);
    if (secondHalfAvg > firstHalfAvg + 0.3) {
      rollingAccuracyTrend = 'improving';
    } else if (secondHalfAvg < firstHalfAvg - 0.3) {
      rollingAccuracyTrend = 'degrading';
    }
  }

  const hitRateTop5Pct = totalEvaluated > 0 
    ? parseFloat((((totalEvaluated - hitDistribution.hits0) / totalEvaluated) * 100).toFixed(2)) 
    : 0;

  const exact3PlusPct = totalEvaluated > 0 
    ? parseFloat(((exact3PlusCount / totalEvaluated) * 100).toFixed(2)) 
    : 0;

  const averageConfidence = totalEvaluated > 0 
    ? parseFloat((confSum / totalEvaluated).toFixed(1)) 
    : 0;

  return {
    drawName,
    totalPredictions: isolatedPreds.length,
    evaluatedPredictions: totalEvaluated,
    hitDistribution,
    hitRateTop5Pct,
    exact3PlusPct,
    averageConfidence,
    rollingAccuracyTrend,
    timeline: timelineItems,
  };
};
