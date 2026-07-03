
import { supabase } from './supabaseClient';
import { PredictionHistoryItem, ForensicReport, LearningSession, Prediction, PredictionFeedback } from '../types';
import { AppError, logError } from '../utils/AppError';
import { set } from 'idb-keyval';

const BATCH_SIZE = 50;

/**
 * Service de synchronisation bidirectionnelle Cloud <-> Local
 * Gère les Prédictions, Rapports Forensic et Sessions d'Apprentissage.
 */

// --- PREDICTIONS ---

export const syncPredictions = async (localItems: PredictionHistoryItem[]): Promise<PredictionHistoryItem[]> => {
    if (!navigator.onLine) return localItems; // Mode hors ligne

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return localItems; // Mode hors ligne

    try {
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
            ? cloudMetaList.filter(c => !localItems.some(l => l.id === c.id)).map(c => c.id)
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
            const localMatch = localItems.find(l => l.id === meta.id);

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
        localItems.forEach(item => {
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
        const toPush = localItems.filter(l => {
            const cloudMatch = cloudMetaList?.find((c: { id: string }) => c.id === l.id);
            if (!cloudMatch) return true; // Complètement absent du Cloud
            
            // Différence de liaison ou de retour utilisateur (RLHF)
            if (l.drawResultId !== cloudMatch.draw_result_id) return true;
            if (JSON.stringify(l.feedback) !== JSON.stringify(cloudMatch.feedback)) return true;
            return false;
        });
        
        if (toPush.length > 0) {
            const payload = toPush.map(p => ({
                id: p.id,
                user_id: user.id,
                draw_name: p.drawName,
                timestamp: p.timestamp,
                prediction: p.prediction,
                draw_result_id: p.drawResultId,
                feedback: p.feedback
            }));

            for (let i = 0; i < payload.length; i += BATCH_SIZE) {
                const batch = payload.slice(i, i + BATCH_SIZE);
                await supabase.from('predictions').upsert(batch);
            }
        }

        return mergedList;
    } catch (err: unknown) {
        logError(new AppError((err instanceof Error ? err.message : String(err)) || "Sync Predictions Error", "SYNC_PREDICTIONS_ERROR", "medium", { error: err }), { source: 'syncPredictions' });
        return localItems;
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
            .select('id, draw_date, draw_name, prediction_id, draw_result_id')
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

        cloudMetaList?.forEach((meta: { id: string; draw_date: string; draw_name: string; prediction_id?: string; draw_result_id?: string }) => {
            const hasFull = loadedFullMap.has(meta.id);
            const localMatch = localReports.find(l => l.id === meta.id);

            const reportData = hasFull
                ? (loadedFullMap.get(meta.id).report_data as unknown as ForensicReport)
                : (localMatch || {
                    id: meta.id,
                    drawName: meta.draw_name,
                    date: meta.draw_date,
                    predictionId: meta.prediction_id,
                    drawResultId: meta.draw_result_id,
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
        logError(new AppError((err instanceof Error ? err.message : String(err)) || "Sync Forensic Error", "SYNC_FORENSIC_ERROR", "medium", { error: err }), { source: 'syncForensicReports' });
        return localReports;
    }
};

// --- LEARNING SESSIONS ---

export const syncLearningSessions = async (localSessions: LearningSession[]): Promise<LearningSession[]> => {
    if (!navigator.onLine) return localSessions;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return localSessions;

    try {
        // 1. PULL METADATA: Évite de charger le bloc de données d'apprentissage complet (Phase 3)
        const { data: cloudMetaList, error } = await supabase
            .from('learning_sessions')
            .select('id, timestamp, draw_name')
            .eq('user_id', user.id)
            .order('timestamp', { ascending: false })
            .limit(20);

        if (error) throw error;

        const missingIds = cloudMetaList
            ? cloudMetaList.filter(c => !localSessions.some(l => l.id === c.id)).map(c => c.id)
            : [];

        const loadedFullMap = new Map<string, any>();
        if (missingIds.length > 0) {
            const { data: fullRows, error: fetchErr } = await supabase
                .from('learning_sessions')
                .select('*')
                .in('id', missingIds);
            if (fetchErr) throw fetchErr;
            fullRows?.forEach(row => {
                loadedFullMap.set(row.id, row);
            });
        }

        const mergedMap = new Map<string, LearningSession>();

        cloudMetaList?.forEach((meta: { id: string; timestamp: number; draw_name: string }) => {
            const hasFull = loadedFullMap.has(meta.id);
            const localMatch = localSessions.find(l => l.id === meta.id);

            const sessionData = hasFull
                ? (loadedFullMap.get(meta.id).session_data as unknown as LearningSession)
                : (localMatch || {
                    id: meta.id,
                    drawName: meta.draw_name,
                    timestamp: meta.timestamp,
                    improvement: false,
                    oldScore: 0,
                    newScore: 0,
                    weightsBefore: {} as any,
                    weightsAfter: {} as any
                  });

            mergedMap.set(meta.id, {
                ...sessionData,
                id: meta.id,
                timestamp: meta.timestamp
            });
        });

        localSessions.forEach(item => {
            if (!mergedMap.has(item.id)) mergedMap.set(item.id, item);
        });

        const mergedList = Array.from(mergedMap.values()).sort((a, b) => b.timestamp - a.timestamp);

        const toPush = localSessions.filter(l => !cloudMetaList?.some((c: { id: string }) => c.id === l.id));

        if (toPush.length > 0) {
            const payload = toPush.map(s => ({
                id: s.id,
                user_id: user.id,
                draw_name: s.drawName,
                timestamp: s.timestamp,
                session_data: s
            }));

            await supabase.from('learning_sessions').upsert(payload);
        }

        return mergedList;
    } catch (err: unknown) {
        logError(new AppError((err instanceof Error ? err.message : String(err)) || "Sync Learning Error", "SYNC_LEARNING_ERROR", "medium", { error: err }), { source: 'syncLearningSessions' });
        return localSessions;
    }
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
