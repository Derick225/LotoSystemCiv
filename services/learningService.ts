
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getAlgoWeights, saveAlgoWeights } from './predictionEngine';
import { DrawResult } from '../types';

export interface LearningStatus {
    lastRun: string | null;
    improvement: boolean;
    message: string;
}

export const LearningService = {
    /**
     * Déclenche le processus d'auto-apprentissage sur le Cloud (Edge Function).
     * C'est une opération asynchrone lourde déléguée au serveur.
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

            if (error) throw error;

            if (data.success && data.improved && data.weights) {
                // Mise à jour immédiate du cache local pour que l'utilisateur en profite tout de suite
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
                message: "Modèle stable (Pas d'amélioration nécessaire)"
            };

        } catch (e: any) {
            console.error("Auto-Learning Error:", e);
            return {
                lastRun: null,
                improvement: false,
                message: `Erreur d'apprentissage: ${e.message}`
            };
        }
    },

    /**
     * Vérifie si un apprentissage est nécessaire (ex: après un nouveau tirage).
     */
    checkAndLearn: async (drawName: string, latestDraw: DrawResult) => {
        const lastLearnKey = `nexus_last_learn_${drawName}`;
        const lastLearn = localStorage.getItem(lastLearnKey);
        
        // Si on n'a jamais appris ou si le dernier apprentissage date d'avant le dernier tirage
        // On utilise la date du tirage comme versioning
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
