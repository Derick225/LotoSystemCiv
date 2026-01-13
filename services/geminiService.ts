
import type { DrawResult, GeminiReasoning } from "../types";
import { isSupabaseConfigured } from './supabaseClient';
import { invokeEdgeFunction } from './apiClient';

const CACHE_PREFIX = 'nexus_reasoning_v12_';

const storage = {
    getItem: (key: string) => {
        if (typeof window !== 'undefined' && window.localStorage) return localStorage.getItem(key);
        return null;
    },
    setItem: (key: string, value: string) => {
        if (typeof window !== 'undefined' && window.localStorage) try { localStorage.setItem(key, value); } catch (e) {}
    },
    removeItem: (key: string) => {
        if (typeof window !== 'undefined' && window.localStorage) localStorage.removeItem(key);
    }
};

const validateReasoningSchema = (data: any): GeminiReasoning => {
    if (!data || typeof data !== 'object') throw new Error("Format JSON corrompu ou incomplet.");
    return {
        logicalAnalysis: String(data.logicalAnalysis || "Analyse indisponible."),
        patternType: String(data.patternType || "Non spécifié"),
        nextSequence: String(data.nextSequence || "Inconnue"),
        anomalies: Array.isArray(data.anomalies) ? data.anomalies : [],
        strategicAdvice: String(data.strategicAdvice || "Prudence recommandée."),
        suggestedFocus: Array.isArray(data.suggestedFocus) ? data.suggestedFocus.slice(0, 5) : [],
        intuitionScore: typeof data.intuitionScore === 'number' ? data.intuitionScore : 50
    };
};

const generateFallbackReasoning = (drawName: string, history: DrawResult[]): GeminiReasoning => {
    const freq: Record<number, number> = {};
    const recent = history.slice(0, 15);
    recent.forEach(d => d.gagnants.forEach(n => freq[n] = (freq[n] || 0) + 1));
    const hotNumbers = Object.entries(freq).sort((a,b) => b[1] - a[1]).slice(0, 5).map(x => parseInt(x[0]));

    return {
        logicalAnalysis: `**[MODE HORS-LIGNE]** L'Oracle Cloud est inaccessible.\n\nAnalyse heuristique locale : concentration sur les fréquences récentes ${hotNumbers.slice(0,3).join(', ')}.`,
        patternType: "Heuristique Locale",
        nextSequence: "Projection Fréquentielle",
        anomalies: ["Connexion perdue"],
        strategicAdvice: "Prudence, données IA non disponibles.",
        suggestedFocus: hotNumbers,
        intuitionScore: 50
    };
};

export const analyzeDrawLogic = async (drawName: string, history: DrawResult[]): Promise<GeminiReasoning> => {
    const signature = history.slice(0, 3).map(h => h.gagnants.join('-')).join('|');
    const cacheKey = `${CACHE_PREFIX}${drawName}_${signature}`;
    
    try {
        const cached = storage.getItem(cacheKey);
        if (cached) return validateReasoningSchema(JSON.parse(cached));
    } catch { storage.removeItem(cacheKey); }

    if (!navigator.onLine || !isSupabaseConfigured()) {
        return generateFallbackReasoning(drawName, history);
    }

    try {
        const { data, error } = await invokeEdgeFunction('ask-oracle', {
            body: {
                task: 'analyze',
                drawName,
                history: history.slice(0, 20).map(h => ({ d: h.date, w: h.gagnants }))
            }
        });

        if (error) {
            console.warn("Oracle Edge Error:", error);
            return generateFallbackReasoning(drawName, history);
        }
        
        if (!data) throw new Error("Réponse vide de l'Oracle");

        const parsed = validateReasoningSchema(data);
        storage.setItem(cacheKey, JSON.stringify(parsed));
        return parsed;

    } catch (e: any) {
        console.warn("Oracle Logic Error:", e);
        return generateFallbackReasoning(drawName, history);
    }
};

export const generateSimulationAudit = async (reportData: any): Promise<string> => {
    if (!isSupabaseConfigured()) return "Audit indisponible (Mode hors-ligne).";
    try {
        const { data, error } = await invokeEdgeFunction('ask-oracle', {
            body: {
                task: 'simulation-audit',
                report: reportData
            }
        });
        if (error) throw error;
        return data?.audit || "Aucune réponse d'audit.";
    } catch (e) { 
        console.error("Simulation Audit Error:", e);
        return "Audit IA temporairement indisponible."; 
    }
};

export const parseResultFromImage = async (base64: string) => {
    if (!isSupabaseConfigured()) throw new Error("Connexion Cloud requise pour la vision.");
    try {
        const { data, error } = await invokeEdgeFunction('vision-ocr', {
            body: { imageBase64: base64 }
        });
        if (error) throw error;
        return data;
    } catch (e) { 
        console.error("OCR Error:", e);
        throw new Error("Échec de l'analyse d'image."); 
    }
};

export const analyzeChartSnapshot = async (base64Image: string, context: string): Promise<string> => {
    if (!isSupabaseConfigured()) return "Analyse visuelle indisponible.";
    try {
        const { data, error } = await invokeEdgeFunction('ask-oracle', {
            body: { task: 'vision-analysis', context, imageBase64: base64Image }
        });
        if (error) throw error;
        return data?.analysis || "Erreur analyse.";
    } catch (e) { return "Cortex visuel inaccessible."; }
};
