
import { z } from 'zod';
import type { DrawResult, GeminiReasoning } from "../types";
import { isSupabaseConfigured } from './supabaseClient';
import { invokeEdgeFunction } from './apiClient';

// --- CONFIGURATION ---
const CACHE_TTL = 3600 * 1000; // 1 Heure (ms)
const CACHE_CAPACITY = 20;     // Nombre max d'entrées
const MAX_RETRIES = 3;         // Tentatives réseau
const BASE_DELAY = 1000;       // Délai initial (ms)

// --- VALIDATION SCHEMA (ZOD) ---
const ReasoningSchema = z.object({
    logicalAnalysis: z.string().default("Analyse indisponible."),
    patternType: z.string().default("Non spécifié"),
    nextSequence: z.string().default("Inconnue"),
    anomalies: z.array(z.string()).default([]),
    strategicAdvice: z.string().default("Prudence recommandée."),
    suggestedFocus: z.array(z.number().int().min(1).max(90)).default([]).transform(arr => arr.slice(0, 5)),
    intuitionScore: z.number().min(0).max(100).default(50)
});

// --- CACHE LRU ---
class LRUCache<T> {
    private map: Map<string, { value: T; expires: number }>;
    private capacity: number;
    private ttl: number;

    constructor(capacity: number, ttl: number) {
        this.map = new Map();
        this.capacity = capacity;
        this.ttl = ttl;
    }

    get(key: string): T | null {
        const item = this.map.get(key);
        if (!item) return null;

        if (Date.now() > item.expires) {
            this.map.delete(key);
            return null;
        }

        // Refresh (LRU behavior)
        this.map.delete(key);
        this.map.set(key, item);
        return item.value;
    }

    set(key: string, value: T): void {
        if (this.map.size >= this.capacity) {
            const firstKey = this.map.keys().next().value;
            if (firstKey) this.map.delete(firstKey);
        }
        this.map.set(key, { value, expires: Date.now() + this.ttl });
    }
}

const reasoningCache = new LRUCache<GeminiReasoning>(CACHE_CAPACITY, CACHE_TTL);

// --- RETRY LOGIC ---
const invokeWithRetry = async <T>(
    operation: () => Promise<T>, 
    retries: number = MAX_RETRIES, 
    delay: number = BASE_DELAY
): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
        if (retries <= 0) throw error;
        
        // On ne retry pas les erreurs 4xx (client) sauf 429 (Rate Limit)
        const isRetryable = !error.status || error.status >= 500 || error.status === 429;
        if (!isRetryable) throw error;

        console.warn(`[Gemini] Retry (${retries} left) in ${delay}ms...`, error.message);
        await new Promise(res => setTimeout(res, delay));
        return invokeWithRetry(operation, retries - 1, delay * 2); // Exponential backoff
    }
};

// --- OPTIMIZED FALLBACK (VECTOR) ---
const generateFallbackReasoning = (drawName: string, history: DrawResult[]): GeminiReasoning => {
    // Utilisation de TypedArray pour performance mémoire
    const frequencies = new Uint16Array(91); 
    const limit = Math.min(history.length, 20);

    // Calcul vectoriel simple
    for (let i = 0; i < limit; i++) {
        const d = history[i].gagnants;
        for (let j = 0; j < d.length; j++) {
            frequencies[d[j]]++;
        }
    }

    // Extraction des indices triés (Top 5)
    const indices = Array.from({ length: 90 }, (_, i) => i + 1);
    // Sort in-place est lent sur grands tableaux, mais ok pour 90 éléments
    indices.sort((a, b) => frequencies[b] - frequencies[a]);
    
    const hotNumbers = indices.slice(0, 5);

    return {
        logicalAnalysis: `**[MODE HORS-LIGNE]** Analyse heuristique locale sur ${limit} tirages.\n\nConcentration fréquentielle sur les vecteurs : ${hotNumbers.join(', ')}.`,
        patternType: "Heuristique Locale (Vectorielle)",
        nextSequence: "Projection Fréquentielle",
        anomalies: ["Connexion Cloud Inactive"],
        strategicAdvice: "Prudence, données IA non disponibles.",
        suggestedFocus: hotNumbers,
        intuitionScore: 50
    };
};

// --- MAIN SERVICES ---

export const analyzeDrawLogic = async (drawName: string, history: DrawResult[]): Promise<GeminiReasoning> => {
    // 1. Génération de clé unique pour le cache (basée sur les 3 derniers résultats)
    const signature = history.slice(0, 3).map(h => h.id).join('|');
    const cacheKey = `${drawName}_${signature}`;
    
    // 2. Vérification Cache
    const cached = reasoningCache.get(cacheKey);
    if (cached) return cached;

    // 3. Vérification Disponibilité
    if (!navigator.onLine || !isSupabaseConfigured()) {
        return generateFallbackReasoning(drawName, history);
    }

    try {
        const responseData = await invokeWithRetry(async () => {
            const { data, error } = await invokeEdgeFunction('ask-oracle', {
                body: {
                    task: 'analyze',
                    drawName,
                    // Optimisation payload: On n'envoie que le nécessaire
                    history: history.slice(0, 15).map(h => ({ d: h.date, w: h.gagnants })) 
                }
            });
            if (error) throw new Error(error.message || "Oracle Error");
            return data;
        });

        // 4. Validation Stricte avec Zod
        const parsed = ReasoningSchema.safeParse(responseData);
        
        if (!parsed.success) {
            console.error("[Gemini] Schema Validation Failed:", parsed.error);
            // On tente de récupérer ce qu'on peut ou fallback
            return generateFallbackReasoning(drawName, history); 
        }

        // 5. Mise en cache
        reasoningCache.set(cacheKey, parsed.data);
        return parsed.data;

    } catch (e: any) {
        console.warn("[Gemini] Analysis Failed:", e);
        return generateFallbackReasoning(drawName, history);
    }
};

export const generateSimulationAudit = async (reportData: any): Promise<string> => {
    if (!isSupabaseConfigured()) return "Audit indisponible (Mode hors-ligne).";
    
    try {
        const data = await invokeWithRetry(async () => {
            const { data, error } = await invokeEdgeFunction('ask-oracle', {
                body: {
                    task: 'simulation-audit',
                    report: reportData
                }
            });
            if (error) throw error;
            return data;
        });
        
        return typeof data?.audit === 'string' ? data.audit : "Aucune réponse d'audit.";
    } catch (e) { 
        console.error("[Gemini] Simulation Audit Error:", e);
        return "Audit IA temporairement indisponible."; 
    }
};

export const parseResultFromImage = async (base64: string) => {
    if (!isSupabaseConfigured()) throw new Error("Connexion Cloud requise pour la vision.");
    
    try {
        const data = await invokeWithRetry(async () => {
            const { data, error } = await invokeEdgeFunction('vision-ocr', {
                body: { imageBase64: base64 }
            });
            if (error) throw error;
            return data;
        });
        return data;
    } catch (e) { 
        console.error("[Gemini] OCR Error:", e);
        throw new Error("Échec de l'analyse d'image après tentatives."); 
    }
};

export const analyzeChartSnapshot = async (base64Image: string, context: string): Promise<string> => {
    if (!isSupabaseConfigured()) return "Analyse visuelle indisponible.";
    
    try {
        const data = await invokeWithRetry(async () => {
            const { data, error } = await invokeEdgeFunction('ask-oracle', {
                body: { task: 'vision-analysis', context, imageBase64: base64Image }
            });
            if (error) throw error;
            return data;
        });
        return data?.analysis || "Erreur analyse.";
    } catch (e) { 
        return "Cortex visuel inaccessible."; 
    }
};
