
import { z } from 'zod';
import type { DrawResult, GeminiReasoning, AlgoWeights } from "../types";
import { isSupabaseConfigured } from './supabaseClient';
import { invokeEdgeFunction } from './apiClient';

// --- CONFIGURATION ---
const CACHE_TTL = 3600 * 1000;
const CACHE_CAPACITY = 20;

// ... (Garder le code de cache et validation existant) ...

// --- NOUVELLE FONCTION ---
export const getOptimizedWeights = async (drawName: string, history: DrawResult[]): Promise<AlgoWeights | null> => {
    // Vérification de base
    if (!isSupabaseConfigured() || !navigator.onLine) {
        console.warn("Mode hors-ligne : Optimisation IA indisponible.");
        return null;
    }

    try {
        // On envoie un sous-ensemble de l'historique pour ne pas saturer le prompt
        // Seuls les numéros gagnants sont pertinents pour cette analyse
        const historyPayload = history.slice(0, 20).map(h => ({ 
            date: h.date, 
            gagnants: h.gagnants 
        }));

        const { data, error } = await invokeEdgeFunction('ask-oracle', {
            body: {
                task: 'optimize_weights',
                drawName,
                history: historyPayload
            }
        });

        if (error) throw new Error(error.message);

        // Validation basique du retour
        if (data && typeof data.frequency === 'number') {
            return data as AlgoWeights;
        }
        return null;

    } catch (e: any) {
        console.error("Optimized Weights Error:", e);
        return null;
    }
};

// ... (Garder les autres exports existants: analyzeDrawLogic, etc.) ...
export const analyzeDrawLogic = async (drawName: string, history: DrawResult[]): Promise<GeminiReasoning> => {
    // ... Implementation existante ou placeholder si fichier tronqué ...
    return {
        logicalAnalysis: "Analyse placeholder",
        patternType: "Standard",
        nextSequence: "Inconnue",
        anomalies: [],
        strategicAdvice: "Prudence",
        suggestedFocus: [],
        intuitionScore: 50
    };
};
