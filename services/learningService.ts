
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { saveAlgoWeights } from './predictionEngine';
import { DrawResult } from '../types';

export interface LearningStatus {
    lastRun: string | null;
    improvement: boolean;
    message: string;
}

export const LearningService = {
    /**
     * Déclenche le processus d'auto-apprentissage sur le Cloud (Edge Function).
     */
    triggerAutoLearning: async (drawName: string): Promise<LearningStatus> => {
        if (!isSupabaseConfigured()) {
            return { lastRun: new Date().toISOString(), improvement: false, message: "Mode Hors-Ligne (Simulation)" };
        }

        try {
            console.log(`[NeuralNet] Initiating Self-Learning sequence for ${drawName}...`);
            
            const { data, error } = await supabase.functions.invoke('self-learn', {
                body: { drawName }
            });

            if (error) {
                // Gestion spécifique des erreurs d'invocation
                throw new Error(error.message || "Erreur de communication avec le Cloud.");
            }

            if (data?.error) {
                // Erreur renvoyée par la fonction elle-même (logique)
                throw new Error(data.error);
            }

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
            let msg = `Erreur d'apprentissage: ${e.message}`;
            
            if (e.message?.includes('Failed to send a request')) {
                msg = "Connexion au Cloud échouée. Vérifiez vos secrets Supabase (SERVICE_ROLE_KEY).";
            }
            
            return {
                lastRun: null,
                improvement: false,
                message: msg
            };
        }
    },

    /**
     * Vérifie si un apprentissage est nécessaire (ex: après un nouveau tirage).
     */
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
    