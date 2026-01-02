
import type { Prediction, LearningSession, PredictionHistoryItem, OrchestrationPattern, PredictionFeedback, PatternType, DrawResult } from '../types';

const ORCHESTRATION_PREFIX = 'orch_patterns_';
const LEARNING_SESSION_KEY = 'learning_session_latest';
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

export const getPredictionHistoryAsync = async (drawName: string): Promise<PredictionHistoryItem[]> => {
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

export const savePredictionToHistory = async (drawName: string, prediction: Prediction, drawResultId?: string): Promise<PredictionHistoryItem> => {
  const newItem: PredictionHistoryItem = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    drawName,
    prediction,
    drawResultId: drawResultId || null
  };

  const key = `${HISTORY_KEY_PREFIX}${newItem.id}`;
  localStorage.setItem(key, JSON.stringify(newItem));
  
  return newItem;
};

export const updatePredictionFeedback = async (id: string, feedback: PredictionFeedback): Promise<void> => {
    const key = `${HISTORY_KEY_PREFIX}${id}`;
    const raw = localStorage.getItem(key);
    if (raw) {
        const item: PredictionHistoryItem = JSON.parse(raw);
        const updatedItem = { ...item, feedback };
        localStorage.setItem(key, JSON.stringify(updatedItem));
    }
};

export const clearPredictionHistory = async (drawName: string) => {
    const all = getLocalHistory();
    const toDelete = all.filter(p => p.drawName === drawName);
    toDelete.forEach(p => localStorage.removeItem(`${HISTORY_KEY_PREFIX}${p.id}`));
};

export const saveLearningSession = (drawName: string, session: LearningSession) => {
    localStorage.setItem(`${LEARNING_SESSION_KEY}_${drawName}`, JSON.stringify(session));
};

export const getLearningSession = (drawName: string): LearningSession | null => {
    try {
        const raw = localStorage.getItem(`${LEARNING_SESSION_KEY}_${drawName}`);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
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
