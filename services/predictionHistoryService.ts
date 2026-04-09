
import type { Prediction, LearningSession, PredictionHistoryItem, OrchestrationPattern, PredictionFeedback, PatternType, DrawResult } from '../types';
import { syncPredictions, syncLearningSessions } from './syncService';
import { supabase } from './supabaseClient';
import { getAlgoWeights } from './predictionEngine';

const ORCHESTRATION_PREFIX = 'orch_patterns_';
const LEARNING_SESSION_KEY_PREFIX = 'learning_sess_';
const HISTORY_KEY_PREFIX = 'pred_';

// Helper interne pour lire l'historique local (remplace cacheService)
const getLocalHistory = (): PredictionHistoryItem[] => {
    const items: PredictionHistoryItem[] = [];
    if (typeof localStorage === 'undefined') return [];
    
    for(let i=0; i<localStorage.length; i++) {
        const k = localStorage.key(i);
        if(k && k.startsWith(HISTORY_KEY_PREFIX)) {
            try {
                const item = JSON.parse(localStorage.getItem(k) || '{}');
                if (item && item.timestamp) {
                    items.push(item);
                }
            } catch(e) {
                // Ignore corrupt items
            }
        }
    }
    return items.sort((a,b) => b.timestamp - a.timestamp);
};

// ... (existing imports)

export const syncAllHistory = async (drawName: string): Promise<PredictionHistoryItem[]> => {
    const local = getLocalHistory().filter(p => p.drawName === drawName);
    try {
        const synced = await syncPredictions(local);
        
        // Mettre à jour le localStorage avec les données fusionnées
        synced.forEach(item => {
            const key = `${HISTORY_KEY_PREFIX}${item.id}`;
            localStorage.setItem(key, JSON.stringify(item));
        });
        
        return synced;
    } catch (e) {
        console.error("Sync failed, returning local", e);
        return local;
    }
};

export const getPredictionHistoryAsync = async (drawName: string): Promise<PredictionHistoryItem[]> => {
    // On tente une synchro rapide en arrière-plan si on est en ligne ?
    // Pour l'instant, on retourne le local, et l'UI déclenchera la synchro explicite.
    const all = getLocalHistory();
    return all.filter(p => p.drawName === drawName);
};

export const findPredictionsByDate = async (drawName: string, date: string): Promise<PredictionHistoryItem[]> => {
    const all = await getPredictionHistoryAsync(drawName);
    return all.filter(p => {
        const predDate = new Date(p.timestamp).toLocaleDateString('fr-FR');
        return predDate === date;
    });
};

export const savePredictionSnapshot = async (id: string, drawName: string, prediction: Prediction, metrics?: any) => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return; // Only save snapshots for authenticated users

        const weights = await getAlgoWeights(drawName);
        
        // Calculate target date (usually today or tomorrow depending on the draw)
        // For simplicity, we assume the prediction is for the next occurrence of this draw.
        // If the draw is today and hasn't happened yet, it's today. Otherwise, it's the next day it occurs.
        // To avoid complex logic here, we'll just use the current date. 
        // BUT to be safe with automation, we should match by draw_name and status='PENDING' 
        // regardless of the exact target_date, or just use today's date.
        const targetDate = new Date().toISOString().split('T')[0];

        await supabase.from('prediction_snapshots').insert({
            id: id,
            user_id: user.id,
            draw_name: drawName,
            target_date: targetDate,
            predicted_numbers: prediction.suggestedNumbers,
            decision_dna: weights,
            metrics_snapshot: metrics || {},
            status: 'PENDING'
        });
    } catch (e) {
        console.error("Failed to save prediction snapshot", e);
    }
};

export const savePredictionToHistory = async (drawName: string, prediction: Prediction, drawResultId?: string, metrics?: any): Promise<PredictionHistoryItem> => {
  const newItem: PredictionHistoryItem = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    drawName,
    prediction,
    drawResultId: drawResultId || null
  };

  const key = `${HISTORY_KEY_PREFIX}${newItem.id}`;
  localStorage.setItem(key, JSON.stringify(newItem));
  
  // Automate sync in background
  syncAllHistory(drawName).catch(e => console.error("Auto-sync prediction history failed", e));
  
  // Save forensic snapshot
  savePredictionSnapshot(newItem.id, drawName, prediction, metrics).catch(e => console.error("Snapshot save failed", e));
  
  return newItem;
};

export const updatePredictionFeedback = async (id: string, feedback: PredictionFeedback): Promise<void> => {
    const key = `${HISTORY_KEY_PREFIX}${id}`;
    const raw = localStorage.getItem(key);
    if (raw) {
        const item: PredictionHistoryItem = JSON.parse(raw);
        const updatedItem = { ...item, feedback };
        localStorage.setItem(key, JSON.stringify(updatedItem));
        // Automate sync in background
        syncAllHistory(item.drawName).catch(e => console.error("Auto-sync prediction feedback failed", e));
    }
};

export const clearPredictionHistory = async (drawName: string) => {
    const all = getLocalHistory();
    const toDelete = all.filter(p => p.drawName === drawName);
    toDelete.forEach(p => localStorage.removeItem(`${HISTORY_KEY_PREFIX}${p.id}`));
};

export const saveLearningSession = async (drawName: string, sessionData: any) => {
    const session: LearningSession = {
        id: crypto.randomUUID(),
        drawName,
        timestamp: Date.now(),
        ...sessionData
    };
    
    const key = `${LEARNING_SESSION_KEY_PREFIX}${session.id}`;
    localStorage.setItem(key, JSON.stringify(session));
    
    // Sync background
    try {
        await syncLearningSessions([session]);
    } catch (e) {
        console.error("Learning session sync failed", e);
    }
    
    return session;
};

export const getLearningSessions = (drawName: string): LearningSession[] => {
    const sessions: LearningSession[] = [];
    if (typeof localStorage === 'undefined') return [];
    
    for(let i=0; i<localStorage.length; i++) {
        const k = localStorage.key(i);
        if(k && k.startsWith(LEARNING_SESSION_KEY_PREFIX)) {
            try {
                const item = JSON.parse(localStorage.getItem(k) || '{}');
                if (item.drawName === drawName) {
                    sessions.push(item);
                }
            } catch(e) {}
        }
    }
    return sessions.sort((a,b) => b.timestamp - a.timestamp);
};

export const syncLearningSessionsWithCloud = async (drawName: string) => {
    const local = getLearningSessions(drawName);
    try {
        const synced = await syncLearningSessions(local);
        synced.forEach(s => {
            localStorage.setItem(`${LEARNING_SESSION_KEY_PREFIX}${s.id}`, JSON.stringify(s));
        });
        return synced;
    } catch (e) {
        return local;
    }
};

export const getOrchestrationPatterns = (drawName: string): OrchestrationPattern[] => {
    try {
        const raw = localStorage.getItem(`${ORCHESTRATION_PREFIX}${drawName}`);
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
};

export const getPatternIntensity = (drawName: string): { subject: string, A: number, fullMark: number }[] => {
    const patterns = getOrchestrationPatterns(drawName);
    const types: PatternType[] = ['Miroir', 'Voisin', 'Transfert Machine', 'Répétition', 'Leurre Machine', 'Suite', 'Finale', 'Dizaine'];
    const maxCount = Math.max(...patterns.map(p => p.count), 1); 
    return types.map(type => ({
        subject: type,
        A: Math.round(((patterns.find(p => p.type === type)?.count || 0) / maxCount) * 100),
        fullMark: 100
    }));
};

export const linkPredictionToResult = async (predictionId: string, drawResultId: string): Promise<void> => {
    const key = `${HISTORY_KEY_PREFIX}${predictionId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
        const item: PredictionHistoryItem = JSON.parse(raw);
        if (item.drawResultId !== drawResultId) {
            const updatedItem = { ...item, drawResultId };
            localStorage.setItem(key, JSON.stringify(updatedItem));
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
        const dateStr = new Date(pred.timestamp).toLocaleDateString('fr-FR');
        
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
