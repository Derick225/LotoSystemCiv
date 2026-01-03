
import type { DrawResult, GeminiReasoning } from "../types";
import { supabase, isSupabaseConfigured } from './supabaseClient';

const CACHE_PREFIX = 'nexus_oracle_v10_';

// Générateur de fallback local en cas de panne Cloud ou Network
const generateFallbackReasoning = (drawName: string, history: DrawResult[]): GeminiReasoning => {
    const freq: Record<number, number> = {};
    const recent = history.slice(0, 15);
    recent.forEach(d => d.gagnants.forEach(n => freq[n] = (freq[n] || 0) + 1));
    
    const hotNumbers = Object.entries(freq)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 5)
        .map(x => parseInt(x[0]));

    return {
        logicalAnalysis: `**[MODE DÉCONNECTÉ]** Le lien avec le Cloud Nexus est inactif ou instable.\n\nL'analyse heuristique locale a pris le relais. Elle détecte une concentration statistique sur les vecteurs ${hotNumbers.slice(0,3).join(', ')}. La structure des 15 derniers tirages suggère une persistance des signaux récents.\n\n*Note: L'intelligence artificielle Gemini n'a pas pu être sollicitée pour cette analyse.*`,
        patternType: "Heuristique Locale",
        nextSequence: "Projection Statistique Simple",
        anomalies: ["Connexion Cloud perdue", "Analyse simplifiée"],
        strategicAdvice: "Privilégiez les numéros chauds et la gestion de bankroll conservatrice en attendant le rétablissement du service.",
        suggestedFocus: hotNumbers,
        intuitionScore: 50
    };
};

/**
 * Analyse Logique (Texte)
 * Délègue l'analyse à la Edge Function 'ask-oracle'.
 * En cas d'échec, bascule silencieusement sur le fallback local.
 */
export const analyzeDrawLogic = async (drawName: string, history: DrawResult[]): Promise<GeminiReasoning> => {
    const signature = history.slice(0, 10).map(h => h.gagnants.join('-')).join('|');
    const cacheKey = `${CACHE_PREFIX}${drawName}_${signature}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
        try { return JSON.parse(cached); } catch (e) { localStorage.removeItem(cacheKey); }
    }

    // Tentative Cloud (Si en ligne et configuré)
    if (navigator.onLine && isSupabaseConfigured()) {
        try {
            const { data, error } = await supabase.functions.invoke('ask-oracle', {
                body: {
                    task: 'analyze',
                    drawName,
                    history: history.slice(0, 25)
                }
            });

            if (error) throw new Error(error.message);
            if (!data) throw new Error("Réponse vide de l'Oracle.");

            localStorage.setItem(cacheKey, JSON.stringify(data));
            return data as GeminiReasoning;

        } catch (e: any) {
            console.warn("Oracle Relay Failure (Switching to Fallback):", e);
            // On continue vers le fallback sans throw
        }
    }

    // Fallback Local
    return generateFallbackReasoning(drawName, history);
};

/**
 * Analyse Visuelle (Graphique/Spectre)
 */
export const analyzeChartSnapshot = async (base64Image: string, context: string): Promise<string> => {
    if (!isSupabaseConfigured()) return "Analyse visuelle indisponible hors-ligne.";

    try {
        const { data, error } = await supabase.functions.invoke('ask-oracle', {
            body: {
                task: 'vision-analysis',
                context: context,
                imageBase64: base64Image
            }
        });

        if (error) throw new Error(error.message);
        return data?.analysis || "Analyse visuelle impossible.";
    } catch (e: any) {
        console.error("Vision Relay Error", e);
        return "Le cortex visuel est momentanément inaccessible. Vérifiez votre connexion.";
    }
};

/**
 * OCR Ticket (Extraction de données)
 */
export const parseResultFromImage = async (base64: string) => {
    if (!isSupabaseConfigured()) throw new Error("Supabase non configuré.");

    try {
        const { data, error } = await supabase.functions.invoke('vision-ocr', {
            body: { imageBase64: base64 }
        });

        if (error) throw new Error(error.message);
        return data;
    } catch (e) {
        throw new Error("Échec du relais OCR. Vérifiez la connexion.");
    }
};

/**
 * Audit de Simulation Financière
 */
export const generateSimulationAudit = async (reportData: any): Promise<string> => {
    if (!isSupabaseConfigured()) return "Audit indisponible (Mode hors-ligne).";

    try {
        const { data, error } = await supabase.functions.invoke('ask-oracle', {
            body: {
                task: 'simulation-audit',
                report: reportData
            }
        });

        if (error) throw error;
        return data?.audit || "Aucune réponse d'audit.";
    } catch (e) {
        console.error("Audit Relay Error", e);
        return "Audit IA temporairement indisponible (Erreur réseau).";
    }
};
