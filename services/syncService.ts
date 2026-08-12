
import { supabase } from './supabaseClient';
import { PredictionHistoryItem, ForensicReport, LearningSession, Prediction, PredictionFeedback } from '../types';
import { AppError, logError } from '../utils/AppError';
import { set, del } from 'idb-keyval';
import { getDeterministicUUID } from '../utils/mathUtils';

const BATCH_SIZE = 50;

/**
 * Service de synchronisation bidirectionnelle Cloud <-> Local
 * Gère les Prédictions, Rapports Forensic et Sessions d'Apprentissage.
 */

// --- PREDICTIONS ---

/**
 * Assainit et mappe un objet PredictionHistoryItem client-side vers le schéma Postgres attendu.
 * Garantit que les identifiants de prédiction et de résultat de tirage sont convertis en UUID RFC 4122 valides.
 */
export const sanitizeAndMapPrediction = (item: PredictionHistoryItem): PredictionHistoryItem => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    let sanitizedId = item.id;
    if (!uuidRegex.test(sanitizedId)) {
        const newUuid = getDeterministicUUID(sanitizedId);
        console.warn(`[SYNC SANITIZATION] Conversion de l'ID non-UUID "${sanitizedId}" vers "${newUuid}"`);
        
        // Suppression asynchrone de l'ancienne clé IndexedDB pour éviter les doublons polluants
        del(`pred_${sanitizedId}`).catch(err => 
            console.error(`[SYNC SANITIZATION] Échec du nettoyage de la clé obsolète pred_${sanitizedId}:`, err)
        );
        sanitizedId = newUuid;
    }

    let sanitizedDrawResultId: string | null = null;
    if (item.drawResultId) {
        if (uuidRegex.test(item.drawResultId)) {
            sanitizedDrawResultId = item.drawResultId.toLowerCase();
        } else {
            const newResultUuid = getDeterministicUUID(item.drawResultId);
            console.warn(`[SYNC SANITIZATION] Conversion du drawResultId non-UUID "${item.drawResultId}" vers "${newResultUuid}"`);
            sanitizedDrawResultId = newResultUuid;
        }
    }

    return {
        ...item,
        id: sanitizedId,
        drawResultId: sanitizedDrawResultId
    };
};

/**
 * Exécute une fonction asynchrone avec un mécanisme de retry et exponential backoff déterministe
 * (conforme aux exigences d'AGENTS.md : sans utilisation de Math.random() ou hasard).
 */
const retryWithBackoff = async <T>(
    fn: () => Promise<T>,
    retries = 3,
    delay = 1000,
    backoffFactor = 2
): Promise<T> => {
    try {
        return await fn();
    } catch (err: any) {
        const errorMsg = err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
            ? err.message
            : String(err);

        // Détection des erreurs réseau intermittentes (comme "Failed to fetch", "network", "timeout")
        const isNetworkError = 
            err instanceof TypeError || 
            errorMsg.toLowerCase().includes('failed to fetch') ||
            errorMsg.toLowerCase().includes('network') ||
            errorMsg.toLowerCase().includes('timeout') ||
            errorMsg.toLowerCase().includes('fetch');

        if (retries > 0 && isNetworkError) {
            console.warn(`[SYNC RETRY] Échec temporaire détecté ("${errorMsg}"). Tentatives restantes : ${retries}. Nouvelle tentative dans ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            return retryWithBackoff(fn, retries - 1, delay * backoffFactor, backoffFactor);
        }
        throw err;
    }
};

export const syncPredictions = async (localItems: PredictionHistoryItem[]): Promise<PredictionHistoryItem[]> => {
    if (!navigator.onLine) return localItems; // Mode hors ligne

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return localItems; // Mode hors ligne

    // Assainissement préalable de toutes les prédictions locales pour garantir des UUID conformes
    const sanitizedLocalItems = localItems.map(item => sanitizeAndMapPrediction(item));

    const executeSync = async (): Promise<PredictionHistoryItem[]> => {
        // 1. PULL METADATA ONLY: Solution différentielle hautement optimisée pour minimiser la consommation réseau (Phase 3)
        // En sélectionnant uniquement les clés d'identification, nous évitons de télécharger les lourds tableaux de breakdown/candidates/analytics.
        const { data: cloudMetaList, error } = await supabase
            .from('predictions')
            .select('id, timestamp, draw_name, draw_result_id, feedback')
            .eq('user_id', user.id)
            .order('timestamp', { ascending: false })
            .limit(100);

        if (error) throw error;

        // Identifier les prédictions entièrement manquantes en local pour ne charger le plein JSON que pour elles
        const missingIds = cloudMetaList
            ? cloudMetaList.filter(c => !sanitizedLocalItems.some(l => l.id === c.id)).map(c => c.id)
            : [];

        const loadedFullMap = new Map<string, any>();
        if (missingIds.length > 0) {
            for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
                const batchIds = missingIds.slice(i, i + BATCH_SIZE);
                const { data: fullRows, error: fetchErr } = await supabase
                    .from('predictions')
                    .select('*')
                    .in('id', batchIds);
                if (fetchErr) throw fetchErr;
                fullRows?.forEach(row => {
                    loadedFullMap.set(row.id, row);
                });
            }
        }

        // 2. MERGE: Fusionner les états locaux et distants différentiellement
        const mergedMap = new Map<string, PredictionHistoryItem>();

        // Intégration du Cloud (en utilisant l'objet complet s'il vient d'être chargé, ou en fusionnant les caractéristiques)
        cloudMetaList?.forEach((meta: { id: string; timestamp: number; draw_name: string; draw_result_id?: string; feedback?: unknown }) => {
            const hasFull = loadedFullMap.has(meta.id);
            const localMatch = sanitizedLocalItems.find(l => l.id === meta.id);

            const predictionObject = hasFull 
                ? (loadedFullMap.get(meta.id).prediction as unknown as Prediction)
                : (localMatch?.prediction || { suggestedNumbers: [], candidates: [], confidence: 50, analysis: "", breakdown: {}, timestamp: meta.timestamp });

            mergedMap.set(meta.id, {
                id: meta.id,
                timestamp: meta.timestamp,
                drawName: meta.draw_name,
                prediction: predictionObject,
                drawResultId: meta.draw_result_id || localMatch?.drawResultId || null,
                feedback: meta.feedback 
                    ? (meta.feedback as unknown as PredictionFeedback) 
                    : (localMatch?.feedback || undefined)
            });
        });

        // Ajouter les items locaux restants (qui n'existent pas encore sur le Cloud)
        sanitizedLocalItems.forEach(item => {
            if (!mergedMap.has(item.id)) {
                mergedMap.set(item.id, item);
            } else {
                const cloudItem = mergedMap.get(item.id)!;
                // Si la version locale est plus récente ou enrichie, on consolide
                if (item.drawResultId && !cloudItem.drawResultId) {
                    cloudItem.drawResultId = item.drawResultId;
                }
                if (item.feedback && !cloudItem.feedback) {
                    cloudItem.feedback = item.feedback;
                }
            }
        });

        const mergedList = Array.from(mergedMap.values()).sort((a, b) => b.timestamp - a.timestamp);

        // 3. DIFF-PUSH: N'envoyer vers le Cloud que les items locaux réellement absents ou modifiés
        const toPush = sanitizedLocalItems.filter(l => {
            const cloudMatch = cloudMetaList?.find((c: { id: string }) => c.id === l.id);
            if (!cloudMatch) return true; // Complètement absent du Cloud
            
            // Différence de liaison ou de retour utilisateur (RLHF)
            if (l.drawResultId !== cloudMatch.draw_result_id) return true;
            if (JSON.stringify(l.feedback) !== JSON.stringify(cloudMatch.feedback)) return true;
            return false;
        });
        
        if (toPush.length > 0) {
            // Optionnel mais extrêmement robuste : valider que les draw_result_id référencés existent réellement
            const referencedResultIds = Array.from(new Set(
                toPush.map(p => p.drawResultId).filter((id): id is string => !!id)
            ));

            const validResultIds = new Set<string>();
            if (referencedResultIds.length > 0) {
                const { data: existingResults, error: resultsErr } = await supabase
                    .from('draw_results')
                    .select('id')
                    .in('id', referencedResultIds);
                
                if (!resultsErr && existingResults) {
                    existingResults.forEach(r => validResultIds.add(r.id));
                }
            }

            const payload = toPush.map(p => ({
                id: p.id,
                user_id: user.id,
                draw_name: p.drawName,
                timestamp: p.timestamp,
                prediction: p.prediction,
                draw_result_id: (p.drawResultId && validResultIds.has(p.drawResultId)) ? p.drawResultId : null,
                feedback: p.feedback
            }));

            for (let i = 0; i < payload.length; i += BATCH_SIZE) {
                const batch = payload.slice(i, i + BATCH_SIZE);
                const { error: pushErr } = await supabase.from('predictions').upsert(batch);
                if (pushErr) throw pushErr;
            }
        }

        return mergedList;
    };

    try {
        return await retryWithBackoff(executeSync, 3, 1000, 2);
    } catch (err: unknown) {
        const errorMsg = err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string'
            ? (err as any).message
            : String(err);
        const severity = (errorMsg.toLowerCase().includes('fetch') || errorMsg.toLowerCase().includes('network')) ? 'low' : 'medium';
        logError(new AppError(errorMsg || "Sync Predictions Error", "SYNC_PREDICTIONS_ERROR", severity, { error: err }), { source: 'syncPredictions' });
        return sanitizedLocalItems;
    }
};

// --- FORENSIC REPORTS ---

export const syncForensicReports = async (localReports: ForensicReport[]): Promise<ForensicReport[]> => {
    if (!navigator.onLine) return localReports;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return localReports;

    try {
        // 1. PULL METADATA: Évite de charger les lourds journaux de preuves (Phase 3)
        const { data: cloudMetaList, error } = await supabase
            .from('forensic_reports')
            .select('id, draw_date, draw_name, prediction_id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        const missingIds = cloudMetaList
            ? cloudMetaList.filter(c => !localReports.some(l => l.id === c.id)).map(c => c.id)
            : [];

        const loadedFullMap = new Map<string, any>();
        if (missingIds.length > 0) {
            for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
                const batchIds = missingIds.slice(i, i + BATCH_SIZE);
                const { data: fullRows, error: fetchErr } = await supabase
                    .from('forensic_reports')
                    .select('*')
                    .in('id', batchIds);
                if (fetchErr) throw fetchErr;
                fullRows?.forEach(row => {
                    loadedFullMap.set(row.id, row);
                });
            }
        }

        const mergedMap = new Map<string, ForensicReport>();

        cloudMetaList?.forEach((meta: { id: string; draw_date: string; draw_name: string; prediction_id?: string }) => {
            const hasFull = loadedFullMap.has(meta.id);
            const localMatch = localReports.find(l => l.id === meta.id);

            const reportData = hasFull
                ? (loadedFullMap.get(meta.id).report_data as unknown as ForensicReport)
                : (localMatch || {
                    id: meta.id,
                    drawName: meta.draw_name,
                    date: meta.draw_date,
                    predictionId: meta.prediction_id,
                    drawResultId: undefined,
                    matches: [],
                    missedOpportunities: [],
                    scoreDivergence: []
                  });

            mergedMap.set(meta.id, {
                ...reportData,
                id: meta.id,
                date: meta.draw_date
            });
        });

        localReports.forEach(item => {
            if (!mergedMap.has(item.id)) {
                mergedMap.set(item.id, item);
            }
        });

        const mergedList = Array.from(mergedMap.values());

        // 2. PUSH: Seulement s'il manque complètement sur le Cloud
        const toPush = localReports.filter(l => !cloudMetaList?.some((c: { id: string }) => c.id === l.id));

        if (toPush.length > 0) {
            const payload = toPush.map(r => ({
                id: r.id,
                user_id: user.id,
                prediction_id: r.predictionId,
                draw_name: r.drawName,
                draw_date: r.date,
                report_data: r
            }));

            for (let i = 0; i < payload.length; i += BATCH_SIZE) {
                const batch = payload.slice(i, i + BATCH_SIZE);
                await supabase.from('forensic_reports').upsert(batch);
            }
        }

        return mergedList;
    } catch (err: unknown) {
        const errorMsg = err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string'
            ? (err as any).message
            : String(err);
        const severity = (errorMsg.toLowerCase().includes('fetch') || errorMsg.toLowerCase().includes('network')) ? 'low' : 'medium';
        logError(new AppError(errorMsg || "Sync Forensic Error", "SYNC_FORENSIC_ERROR", severity, { error: err }), { source: 'syncForensicReports' });
        return localReports;
    }
};

// --- LEARNING SESSIONS ---

export const syncLearningSessions = async (localSessions: LearningSession[]): Promise<LearningSession[]> => {
    // Désactivé de façon permanente pour éviter la synchronisation des données lourdes d'apprentissage machine
    // et protéger les quotas de lecture/écriture gratuits de Supabase.
    return localSessions;
};

// --- DELETE OPERATIONS ---

export const syncPredictionSnapshots = async (drawName: string) => {
    if (!navigator.onLine) return;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch cloud snapshots
        const { data: cloudSnaps, error } = await supabase
            .from('prediction_snapshots')
            .select('*')
            .eq('user_id', user.id)
            .eq('draw_name', drawName)
            .order('created_at', { ascending: false })
            .limit(10);
            
        if (error) return;
        
        // Save to indexed db for offline forensic use
        if (cloudSnaps) {
            for (const snap of cloudSnaps) {
                 const key = `prediction_snapshot_${snap.id}`;
                 await set(key, JSON.stringify(snap));
            }
        }
    } catch (e) {
        console.error("Sync prediction snapshots error:", e);
    }
};

export const deletePredictionCloud = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('predictions').delete().eq('id', id).eq('user_id', user.id);
};

export const deleteForensicReportCloud = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('forensic_reports').delete().eq('id', id).eq('user_id', user.id);
};
