import { isSupabaseConfigured } from './supabaseClient';
import { invokeEdgeFunction } from './apiClient';
import { saveAlgoWeights } from './predictionEngine';
import { DrawResult, PredictionHistoryItem } from '../types';

export interface LearningStatus {
    lastRun: string | null;
    improvement: boolean;
    message: string;
    delta?: string;
}

export const LearningService = {
    triggerAutoLearning: async (drawName: string): Promise<LearningStatus> => {
        if (!isSupabaseConfigured()) {
            await new Promise(r => setTimeout(r, 2000));
            return { lastRun: new Date().toISOString(), improvement: false, message: "Simulation locale uniquement." };
        }

        try {
            const { data, error } = await invokeEdgeFunction('self-learn', {
                body: { drawName }
            });

            if (error) throw error;

            if (data?.success) {
                if (data.improved && data.weights) {
                    saveAlgoWeights(drawName, data.weights);
                }
                return {
                    lastRun: new Date().toISOString(),
                    improvement: data.improved,
                    message: data.improved ? `Optimisation ADN : +${data.delta}%` : "L'ADN actuel est optimal.",
                    delta: data.delta
                };
            }
            throw new Error("Échec du noyau.");
        } catch (e: any) {
            return { lastRun: null, improvement: false, message: e.message };
        }
    },

    /**
     * Analyse si l'IA a perdu en précision récemment
     */
    checkDrift: async (drawName: string, predictions: PredictionHistoryItem[], results: DrawResult[]) => {
        if (predictions.length < 5 || results.length < 5) return false;
        
        // On prend les 5 dernières tentatives documentées
        const recent = predictions.slice(0, 5);
        let totalHits = 0;
        
        recent.forEach(p => {
            const date = new Date(p.timestamp).toLocaleDateString('fr-FR');
            const match = results.find(r => r.date === date);
            if (match) {
                totalHits += p.prediction.suggestedNumbers.filter(n => match.gagnants.includes(n)).length;
            }
        });

        const avgHits = totalHits / 5;
        // Si on descend sous 0.6 hits par tirage (moyenne basse pour Nexus), on a un "Drift"
        return avgHits < 0.6;
    }
};