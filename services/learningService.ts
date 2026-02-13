
import { isSupabaseConfigured } from './supabaseClient';
import { invokeEdgeFunction } from './apiClient';
import { DrawResult, PredictionHistoryItem, AlgoWeights } from '../types';

export interface LearningStatus {
    lastRun: string | null;
    improvement: boolean;
    message: string;
    delta?: string;
    weights?: AlgoWeights;
}

const MIN_IMPROVEMENT_DELTA = 0.5; // Gain minimum requis (%) pour valider une mutation

export const LearningService = {
    triggerAutoLearning: async (drawName: string, customWeights?: AlgoWeights): Promise<LearningStatus> => {
        if (!isSupabaseConfigured()) {
            await new Promise(r => setTimeout(r, 2000));
            return { lastRun: new Date().toISOString(), improvement: false, message: "Simulation locale uniquement." };
        }

        try {
            const { data, error } = await invokeEdgeFunction('self-learn', {
                body: {
                    drawName,
                    currentWeights: customWeights // Injection des poids actuels pour guidage
                }
            });

            if (error) throw error;

            if (data?.success) {
                const delta = parseFloat(data.delta || "0");
                // On ne considère une amélioration que si le gain dépasse le seuil de bruit (0.5%)
                const isSignificant = data.improved && delta >= MIN_IMPROVEMENT_DELTA;

                return {
                    lastRun: new Date().toISOString(),
                    improvement: isSignificant,
                    message: isSignificant
                        ? `Optimisation ADN : +${data.delta}% (Validée)`
                        : `Stagnation (Delta +${data.delta}% < ${MIN_IMPROVEMENT_DELTA}%).`,
                    delta: data.delta,
                    weights: data.weights
                };
            }
            throw new Error("Échec du noyau.");
        } catch (e: any) {
            return { lastRun: null, improvement: false, message: e.message };
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

        // On crée une Map pour accès O(1) aux résultats par date
        const resultsMap = new Map<string, number[]>();
        results.forEach(r => resultsMap.set(r.date, r.gagnants));

        predictions.forEach(p => {
            const dateStr = new Date(p.timestamp).toLocaleDateString('fr-FR');
            const winningNumbers = resultsMap.get(dateStr);
            
            if (winningNumbers) {
                const hits = p.prediction.suggestedNumbers.filter(n => winningNumbers.includes(n)).length;
                totalHitsHistory += hits;
                countHistory++;
            }
        });

        if (countHistory < 5) return false;

        const historicalAverage = totalHitsHistory / countHistory;

        // 2. Calcul des hits sur la fenêtre récente (5 derniers)
        const recentPreds = predictions.slice(0, 5);
        let recentHits = 0;
        let recentCount = 0;

        recentPreds.forEach(p => {
            const dateStr = new Date(p.timestamp).toLocaleDateString('fr-FR');
            const winningNumbers = resultsMap.get(dateStr);
            if (winningNumbers) {
                recentHits += p.prediction.suggestedNumbers.filter(n => winningNumbers.includes(n)).length;
                recentCount++;
            }
        });

        if (recentCount === 0) return false;

        const recentAverage = recentHits / recentCount;

        // 3. Détection de rupture (Drift)
        // Si la perf récente chute de plus de 20% par rapport à la moyenne historique
        // Ou si on tombe sous un seuil critique absolu (ex: 0.6 hit/tirage)
        const driftThreshold = Math.max(0.6, historicalAverage * 0.8);
        
        return recentAverage < driftThreshold;
    }
};
