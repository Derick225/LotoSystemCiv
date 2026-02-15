
import { z } from 'zod';
import type { DrawResult, GeminiReasoning, AlgoWeights } from "../types";
import { isSupabaseConfigured } from './supabaseClient';
import { invokeEdgeFunction } from './apiClient';

// --- CONFIGURATION ---
const CACHE_TTL = 3600 * 1000; // 1 heure
const CACHE_CAPACITY = 20;

const analysisCache = new Map<string, { timestamp: number; data: GeminiReasoning }>();

/**
 * Récupère des poids algorithmiques optimisés par l'IA (Edge Function).
 */
export const getOptimizedWeights = async (drawName: string, history: DrawResult[]): Promise<AlgoWeights | null> => {
    // Vérification de base
    if (!isSupabaseConfigured() || !navigator.onLine) {
        console.warn("Mode hors-ligne : Optimisation IA indisponible.");
        return null;
    }

    try {
        // On envoie un sous-ensemble de l'historique pour ne pas saturer le prompt
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

/**
 * Analyse logique approfondie du tirage via Gemini (Edge Function).
 */
export const analyzeDrawLogic = async (drawName: string, history: DrawResult[]): Promise<GeminiReasoning> => {
    const cacheKey = `${drawName}_${history[0]?.id}`;
    const cached = analysisCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        return cached.data;
    }

    if (!isSupabaseConfigured() || !navigator.onLine) {
         return {
            logicalAnalysis: "Mode hors-ligne. L'analyse IA nécessite une connexion internet et une configuration Supabase active.",
            patternType: "Inconnu",
            nextSequence: "Non calculable",
            anomalies: [],
            strategicAdvice: "Connectez-vous pour accéder à l'Oracle.",
            suggestedFocus: [],
            intuitionScore: 0
        };
    }

    try {
        const { data, error } = await invokeEdgeFunction('ask-oracle', {
            body: {
                task: 'analyze',
                drawName,
                history: history.slice(0, 15) // On envoie les 15 derniers tirages pour contexte
            }
        });

        if (error) throw new Error(error.message);
        
        const result = data as GeminiReasoning;

        // Gestion du cache LRU
        if (analysisCache.size >= CACHE_CAPACITY) {
            const firstKey = analysisCache.keys().next().value;
            if (firstKey) analysisCache.delete(firstKey);
        }
        analysisCache.set(cacheKey, { timestamp: Date.now(), data: result });

        return result;
    } catch (e: any) {
        console.error("Gemini Analysis Error:", e);
        return {
            logicalAnalysis: "Erreur de connexion à l'Oracle Neural. Le système a basculé en mode protection.",
            patternType: "Erreur",
            nextSequence: "N/A",
            anomalies: ["Perte de signal IA"],
            strategicAdvice: "Réessayez ultérieurement.",
            suggestedFocus: [],
            intuitionScore: 0
        };
    }
};
