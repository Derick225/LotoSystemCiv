
import { isSupabaseConfigured } from './supabaseClient';
import { apiClient } from '../core/api/apiClient';
import { DrawResult, PredictionHistoryItem, AlgoWeights } from '../types';
import { appConfig } from '../config/app.config';
import { auditLogger } from '../utils/auditLogger';

export interface LearningStatus {
    lastRun: string | null;
    improvement: boolean;
    message: string;
    delta?: string;
    weights?: AlgoWeights;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, body: any, retries = 3, backoff = 1000): Promise<any> => {
    try {
        return await apiClient.post<any>(url, body);
    } catch (error) {
        if (retries > 0) {
            auditLogger('warn', 'LearningService', `API call failed, retrying in ${backoff}ms...`);
            await sleep(backoff);
            return fetchWithRetry(url, body, retries - 1, backoff * 2);
        }
        throw error;
    }
};

export const LearningService = {
    triggerAutoLearning: async (drawName: string, customWeights?: AlgoWeights): Promise<LearningStatus> => {
        if (!isSupabaseConfigured()) {
            await sleep(2000);
            return { lastRun: new Date().toISOString(), improvement: false, message: "Simulation locale uniquement." };
        }

        try {
            const data = await fetchWithRetry('self-learn', {
                drawName,
                currentWeights: customWeights // Injection des poids actuels pour guidage
            });

            if (data?.success) {
                const delta = parseFloat(data.delta || "0");
                // On ne considère une amélioration que si le gain dépasse le seuil de bruit
                const isSignificant = data.improved && delta >= appConfig.learning.minImprovementDelta;

                return {
                    lastRun: new Date().toISOString(),
                    improvement: isSignificant,
                    message: isSignificant
                        ? `Optimisation ADN : +${data.delta}% (Validée)`
                        : `Stagnation (Delta +${data.delta}% < ${appConfig.learning.minImprovementDelta}%).`,
                    delta: data.delta,
                    weights: data.weights
                };
            }
            throw new Error("Échec du noyau.");
        } catch (e: unknown) {
            const err = e as Error;
            auditLogger('error', 'LearningService', err.message);
            return { lastRun: null, improvement: false, message: err.message };
        }
    },

    /**
     * Détecte une dérive (Concept Drift) en comparant la performance récente
     * à la performance historique moyenne.
     */
    checkDrift: async (drawName: string, predictions: PredictionHistoryItem[], results: DrawResult[]) => {
        // Besoin d'un échantillon significatif
        if (predictions.length < 10 || results.length < 10) return false;

        // 1. Calcul des hits pour toutes les prédictions archivées (Baseline)
        let totalHitsHistory = 0;
        let countHistory = 0;

        // On crée une Map pour accès O(1) aux résultats par date (ISO yyyy-MM-dd)
        const resultsMap = new Map<string, number[]>();
        results.forEach(r => {
            // Assuming r.date is either DD/MM/YYYY or YYYY-MM-DD
            let isoDate = r.date;
            if (r.date.includes('/')) {
                const [d, m, y] = r.date.split('/');
                isoDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
            resultsMap.set(isoDate, r.gagnants);
        });

        // Ensure predictions are sorted chronologically (oldest first)
        const sortedPredictions = [...predictions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        sortedPredictions.forEach(p => {
            const dateStr = new Date(p.timestamp).toISOString().split('T')[0];
            const winningNumbers = resultsMap.get(dateStr);
            
            if (winningNumbers) {
                const hits = p.prediction.suggestedNumbers.filter(n => winningNumbers.includes(n)).length;
                totalHitsHistory += hits;
                countHistory++;
            }
        });

        if (countHistory < appConfig.learning.recentWindowSize) return false;

        const historicalAverage = totalHitsHistory / countHistory;

        // 2. Calcul des hits sur la fenêtre récente (5 derniers)
        const recentPreds = sortedPredictions.slice(-appConfig.learning.recentWindowSize);
        let recentEma = historicalAverage; // Initialize EMA with historical average

        recentPreds.forEach(p => {
            const dateStr = new Date(p.timestamp).toISOString().split('T')[0];
            const winningNumbers = resultsMap.get(dateStr);
            if (winningNumbers) {
                const hits = p.prediction.suggestedNumbers.filter(n => winningNumbers.includes(n)).length;
                // Exponential Moving Average
                recentEma = (appConfig.learning.emaAlpha * hits) + ((1 - appConfig.learning.emaAlpha) * recentEma);
            }
        });

        // 3. Détection de rupture (Drift)
        // Si la perf récente chute de plus de 20% par rapport à la moyenne historique
        // Ou si on tombe sous un seuil critique absolu (ex: 0.6 hit/tirage)
        const driftThreshold = Math.max(0.6, historicalAverage * appConfig.learning.driftThresholdFactor);
        
        return recentEma < driftThreshold;
    }
};
