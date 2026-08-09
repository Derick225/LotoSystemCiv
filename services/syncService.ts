
import { db } from './firebaseClient';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, writeBatch, limit, orderBy } from 'firebase/firestore';
import { authService } from './authService';
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

    const user = await authService.getUser();
    if (!user) return localItems; // Mode hors ligne

    // Assainissement préalable de toutes les prédictions locales pour garantir des UUID conformes
    const sanitizedLocalItems = localItems.map(item => sanitizeAndMapPrediction(item));

    const executeSync = async (): Promise<PredictionHistoryItem[]> => {
        const q = query(
            collection(db, 'predictions'),
            where('user_id', '==', user.id),
            limit(100)
        );
        const snap = await getDocs(q);
        const cloudMetaList = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

        const mergedMap = new Map<string, PredictionHistoryItem>();

        cloudMetaList.forEach((row) => {
            const localMatch = sanitizedLocalItems.find(l => l.id === row.id);
            const predictionObject = row.prediction || (localMatch?.prediction || { suggestedNumbers: [], candidates: [], confidence: 50, analysis: "", breakdown: {}, timestamp: row.timestamp });

            mergedMap.set(row.id, {
                id: row.id,
                timestamp: row.timestamp,
                drawName: row.draw_name,
                prediction: predictionObject,
                drawResultId: row.draw_result_id || localMatch?.drawResultId || null,
                feedback: row.feedback || localMatch?.feedback || undefined
            });
        });

        sanitizedLocalItems.forEach(item => {
            if (!mergedMap.has(item.id)) {
                mergedMap.set(item.id, item);
            } else {
                const cloudItem = mergedMap.get(item.id)!;
                if (item.drawResultId && !cloudItem.drawResultId) {
                    cloudItem.drawResultId = item.drawResultId;
                }
                if (item.feedback && !cloudItem.feedback) {
                    cloudItem.feedback = item.feedback;
                }
            }
        });

        const mergedList = Array.from(mergedMap.values()).sort((a, b) => b.timestamp - a.timestamp);

        const toPush = sanitizedLocalItems.filter(l => {
            const cloudMatch = cloudMetaList.find((c) => c.id === l.id);
            if (!cloudMatch) return true;
            if (l.drawResultId !== cloudMatch.draw_result_id) return true;
            if (JSON.stringify(l.feedback) !== JSON.stringify(cloudMatch.feedback)) return true;
            return false;
        });
        
        if (toPush.length > 0) {
            const batch = writeBatch(db);
            toPush.forEach(p => {
                const docRef = doc(db, 'predictions', p.id);
                batch.set(docRef, {
                    id: p.id,
                    user_id: user.id,
                    draw_name: p.drawName,
                    timestamp: p.timestamp,
                    prediction: p.prediction,
                    draw_result_id: p.drawResultId || null,
                    feedback: p.feedback || null
                }, { merge: true });
            });
            await batch.commit();
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

    const user = await authService.getUser();
    if (!user) return localReports;

    try {
        const q = query(
            collection(db, 'forensic_reports'),
            where('user_id', '==', user.id),
            limit(50)
        );
        const snap = await getDocs(q);
        const cloudMetaList = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

        const mergedMap = new Map<string, ForensicReport>();

        cloudMetaList.forEach((row) => {
            const localMatch = localReports.find(l => l.id === row.id);
            const reportData = row.report_data || localMatch || {
                id: row.id,
                drawName: row.draw_name,
                date: row.draw_date,
                predictionId: row.prediction_id,
                drawResultId: undefined,
                matches: [],
                missedOpportunities: [],
                scoreDivergence: []
            };

            mergedMap.set(row.id, {
                ...reportData,
                id: row.id,
                date: row.draw_date || reportData.date
            });
        });

        localReports.forEach(item => {
            if (!mergedMap.has(item.id)) {
                mergedMap.set(item.id, item);
            }
        });

        const mergedList = Array.from(mergedMap.values());

        const toPush = localReports.filter(l => !cloudMetaList.some((c) => c.id === l.id));

        if (toPush.length > 0) {
            const batch = writeBatch(db);
            toPush.forEach(r => {
                const docRef = doc(db, 'forensic_reports', r.id);
                batch.set(docRef, {
                    id: r.id,
                    user_id: user.id,
                    prediction_id: r.predictionId || null,
                    draw_name: r.drawName,
                    draw_date: r.date,
                    report_data: r
                }, { merge: true });
            });
            await batch.commit();
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
    if (!navigator.onLine) return localSessions;

    const user = await authService.getUser();
    if (!user) return localSessions;

    try {
        const q = query(
            collection(db, 'learning_sessions'),
            where('user_id', '==', user.id),
            limit(20)
        );
        const snap = await getDocs(q);
        const cloudMetaList = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

        const mergedMap = new Map<string, LearningSession>();

        cloudMetaList.forEach((row) => {
            const localMatch = localSessions.find(l => l.id === row.id);
            const sessionData = row.session_data || localMatch || {
                id: row.id,
                drawName: row.draw_name,
                timestamp: row.timestamp,
                improvement: false,
                oldScore: 0,
                newScore: 0,
                weightsBefore: {} as any,
                weightsAfter: {} as any
            };

            mergedMap.set(row.id, {
                ...sessionData,
                id: row.id,
                timestamp: row.timestamp
            });
        });

        localSessions.forEach(item => {
            if (!mergedMap.has(item.id)) mergedMap.set(item.id, item);
        });

        const mergedList = Array.from(mergedMap.values()).sort((a, b) => b.timestamp - a.timestamp);

        const toPush = localSessions.filter(l => !cloudMetaList.some((c) => c.id === l.id));

        if (toPush.length > 0) {
            const batch = writeBatch(db);
            toPush.forEach(s => {
                const docRef = doc(db, 'learning_sessions', s.id);
                batch.set(docRef, {
                    id: s.id,
                    user_id: user.id,
                    draw_name: s.drawName,
                    timestamp: s.timestamp,
                    session_data: s
                }, { merge: true });
            });
            await batch.commit();
        }

        return mergedList;
    } catch (err: unknown) {
        const errorMsg = err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string'
            ? (err as any).message
            : String(err);
        const severity = (errorMsg.toLowerCase().includes('fetch') || errorMsg.toLowerCase().includes('network')) ? 'low' : 'medium';
        logError(new AppError(errorMsg || "Sync Learning Error", "SYNC_LEARNING_ERROR", severity, { error: err }), { source: 'syncLearningSessions' });
        return localSessions;
    }
};

// --- DELETE OPERATIONS ---

export const syncPredictionSnapshots = async (drawName: string) => {
    if (!navigator.onLine) return;

    try {
        const user = await authService.getUser();
        if (!user) return;

        const q = query(
            collection(db, 'prediction_snapshots'),
            where('user_id', '==', user.id),
            where('draw_name', '==', drawName),
            limit(10)
        );
        const snap = await getDocs(q);
        
        for (const docSnap of snap.docs) {
            const key = `prediction_snapshot_${docSnap.id}`;
            await set(key, JSON.stringify({ id: docSnap.id, ...docSnap.data() }));
        }
    } catch (e) {
        console.error("Sync prediction snapshots error:", e);
    }
};

export const deletePredictionCloud = async (id: string) => {
    try {
        const user = await authService.getUser();
        if (!user) return;
        await deleteDoc(doc(db, 'predictions', id));
    } catch (e) {
        // ignore cloud delete error
    }
};

export const deleteForensicReportCloud = async (id: string) => {
    try {
        const user = await authService.getUser();
        if (!user) return;
        await deleteDoc(doc(db, 'forensic_reports', id));
    } catch (e) {
        // ignore cloud delete error
    }
};
