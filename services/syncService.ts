
import { supabase } from './supabaseClient';
import { PredictionHistoryItem, ForensicReport, LearningSession } from '../types';
import { AppError, logError } from '../utils/AppError';

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
        // 1. PULL: Récupérer les dernières prédictions du Cloud
        const { data: cloudItems, error } = await supabase
            .from('predictions')
            .select('*')
            .eq('user_id', user.id)
            .order('timestamp', { ascending: false })
            .limit(100);

        if (error) throw error;

        // 2. MERGE: Fusionner Cloud et Local (Priorité au plus récent par ID)
        const mergedMap = new Map<string, PredictionHistoryItem>();

        // Ajouter Cloud
        cloudItems?.forEach((item: any) => {
            mergedMap.set(item.id, {
                id: item.id,
                timestamp: item.timestamp,
                drawName: item.draw_name,
                prediction: item.prediction,
                drawResultId: item.draw_result_id,
                feedback: item.feedback
            });
        });

        // Ajouter Local (écraser si conflit et local plus récent ou plus complet)
        localItems.forEach(item => {
            if (!mergedMap.has(item.id)) {
                mergedMap.set(item.id, item);
            } else {
                const cloudItem = mergedMap.get(item.id)!;
                // Si le local a un drawResultId ou un feedback que le cloud n'a pas, on met à jour
                if (item.drawResultId && !cloudItem.drawResultId) {
                    cloudItem.drawResultId = item.drawResultId;
                }
                if (item.feedback && !cloudItem.feedback) {
                    cloudItem.feedback = item.feedback;
                }
            }
        });

        const mergedList = Array.from(mergedMap.values()).sort((a, b) => b.timestamp - a.timestamp);

        // 3. PUSH: Envoyer les nouveaux items locaux ou mis à jour vers le Cloud
        const toPush = localItems.filter(l => {
            const cloudItem = cloudItems?.find((c: any) => c.id === l.id);
            if (!cloudItem) return true; // Nouveau
            // Modifié (ex: link result, feedback)
            if (l.drawResultId !== cloudItem.draw_result_id) return true;
            if (JSON.stringify(l.feedback) !== JSON.stringify(cloudItem.feedback)) return true;
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

            // Batch insert
            for (let i = 0; i < payload.length; i += BATCH_SIZE) {
                const batch = payload.slice(i, i + BATCH_SIZE);
                await supabase.from('predictions').upsert(batch);
            }
        }

        return mergedList;
    } catch (err: any) {
        logError(new AppError(err.message || "Sync Predictions Error", "SYNC_PREDICTIONS_ERROR", "medium", { error: err }), { source: 'syncPredictions' });
        return localItems; // Fallback local
    }
};

// --- FORENSIC REPORTS ---

export const syncForensicReports = async (localReports: ForensicReport[]): Promise<ForensicReport[]> => {
    if (!navigator.onLine) return localReports; // Mode hors ligne

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return localReports;

    try {
        // 1. PULL
        const { data: cloudReports, error } = await supabase
            .from('forensic_reports')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        const mergedMap = new Map<string, ForensicReport>();

        cloudReports?.forEach((item: any) => {
            // Mapping DB -> Type
            const report: ForensicReport = {
                ...item.report_data,
                id: item.id, // Ensure ID matches
                date: item.draw_date
            };
            mergedMap.set(item.id, report);
        });

        localReports.forEach(item => {
            if (!mergedMap.has(item.id)) {
                mergedMap.set(item.id, item);
            }
        });

        const mergedList = Array.from(mergedMap.values());

        // 2. PUSH
        const toPush = localReports.filter(l => !cloudReports?.some((c: any) => c.id === l.id));

        if (toPush.length > 0) {
            const payload = toPush.map(r => ({
                id: r.id,
                user_id: user.id,
                prediction_id: r.predictionId,
                draw_name: r.drawName,
                draw_date: r.date,
                report_data: r // On stocke tout l'objet JSON
            }));

            for (let i = 0; i < payload.length; i += BATCH_SIZE) {
                const batch = payload.slice(i, i + BATCH_SIZE);
                await supabase.from('forensic_reports').upsert(batch);
            }
        }

        return mergedList;
    } catch (err: any) {
        logError(new AppError(err.message || "Sync Forensic Error", "SYNC_FORENSIC_ERROR", "medium", { error: err }), { source: 'syncForensicReports' });
        return localReports;
    }
};

// --- LEARNING SESSIONS ---

export const syncLearningSessions = async (localSessions: LearningSession[]): Promise<LearningSession[]> => {
    if (!navigator.onLine) return localSessions; // Mode hors ligne

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return localSessions;

    try {
        const { data: cloudSessions, error } = await supabase
            .from('learning_sessions')
            .select('*')
            .eq('user_id', user.id)
            .order('timestamp', { ascending: false })
            .limit(20);

        if (error) throw error;

        const mergedMap = new Map<string, LearningSession>();

        cloudSessions?.forEach((item: any) => {
            mergedMap.set(item.id, {
                ...item.session_data,
                id: item.id,
                timestamp: item.timestamp
            });
        });

        localSessions.forEach(item => {
            if (!mergedMap.has(item.id)) mergedMap.set(item.id, item);
        });

        const mergedList = Array.from(mergedMap.values()).sort((a, b) => b.timestamp - a.timestamp);

        const toPush = localSessions.filter(l => !cloudSessions?.some((c: any) => c.id === l.id));

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
    } catch (err: any) {
        logError(new AppError(err.message || "Sync Learning Error", "SYNC_LEARNING_ERROR", "medium", { error: err }), { source: 'syncLearningSessions' });
        return localSessions;
    }
};

// --- DELETE OPERATIONS ---

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
