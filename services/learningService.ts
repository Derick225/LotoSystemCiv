
import { isSupabaseConfigured } from './supabaseClient';
import { invokeEdgeFunction } from './apiClient';
import { saveAlgoWeights } from './predictionEngine';
import { DrawResult } from '../types';

export interface LearningStatus {
    lastRun: string | null;
    improvement: boolean;
    message: string;
}

export const LearningService = {
    triggerAutoLearning: async (drawName: string): Promise<LearningStatus> => {
        if (!isSupabaseConfigured()) {
            return { lastRun: new Date().toISOString(), improvement: false, message: "Mode Hors-Ligne (Simulation)" };
        }

        try {
            console.log(`[NeuralNet] Initiating Self-Learning sequence for ${drawName}...`);
            
            const { data, error } = await invokeEdgeFunction('self-learn', {
                body: { drawName }
            });

            if (error) throw new Error(error.message);

            if (data?.error) throw new Error(data.error);

            if (data && data.success) {
                if (data.improved && data.weights) {
                    saveAlgoWeights(drawName, data.weights);
                    return {
                        lastRun: new Date().toISOString(),
                        improvement: true,
                        message: data.message
                    };
                }
                return {
                    lastRun: new Date().toISOString(),
                    improvement: false,
                    message: data.message || "Modèle stable."
                };
            }

            throw new Error("Réponse inattendue du serveur.");

        } catch (e: any) {
            console.error("Auto-Learning Error:", e);
            return {
                lastRun: null,
                improvement: false,
                message: `Erreur: ${e.message}`
            };
        }
    },

    checkAndLearn: async (drawName: string, latestDraw: DrawResult) => {
        const lastLearnKey = `nexus_last_learn_${drawName}`;
        const lastLearn = localStorage.getItem(lastLearnKey);
        
        if (!lastLearn || lastLearn !== latestDraw.date) {
            const result = await LearningService.triggerAutoLearning(drawName);
            if (result.lastRun) {
                localStorage.setItem(lastLearnKey, latestDraw.date);
            }
            return result;
        }
        return null;
    }
};
