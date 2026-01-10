
import type { DrawResult, GeminiReasoning } from "../types";
import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * Nexus Oracle Engine v12.7 - Security Edition
 * Bridge sécurisé vers l'API Gemini via Supabase Edge Functions.
 */

const CACHE_PREFIX = 'nexus_reasoning_v12_';

// Validation du schéma de réponse pour éviter les hallucinations de format
const validateReasoningSchema = (data: any): GeminiReasoning => {
    if (!data || typeof data !== 'object') throw new Error("Format JSON corrompu ou incomplet.");
    
    // On s'assure que les champs minimaux sont présents
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
        logicalAnalysis: `**[MODE DÉCONNECTÉ]** Le lien avec le Cloud Nexus est inactif.\n\nL'analyse heuristique locale a pris le relais. Elle détecte une concentration statistique sur les vecteurs ${hotNumbers.slice(0,3).join(', ')}.`,
        patternType: "Heuristique Locale",
        nextSequence: "Projection Statistique Simple",
        anomalies: ["Connexion Cloud perdue", "Analyse simplifiée"],
        strategicAdvice: "Privilégiez les numéros chauds et la gestion de bankroll conservatrice.",
        suggestedFocus: hotNumbers,
        intuitionScore: 50
    };
};

/**
 * Analyse Logique (Texte) - Modèle Gemini 3 Pro via Proxy
 */
export const analyzeDrawLogic = async (drawName: string, history: DrawResult[]): Promise<GeminiReasoning> => {
    const signature = history.slice(0, 3).map(h => h.gagnants.join('-')).join('|');
    const cacheKey = `${CACHE_PREFIX}${drawName}_${signature}`;
    
    // 1. Vérification Cache
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) return validateReasoningSchema(JSON.parse(cached));
    } catch { localStorage.removeItem(cacheKey); }

    // 2. Vérification Configuration
    if (!navigator.onLine || !isSupabaseConfigured()) {
        return generateFallbackReasoning(drawName, history);
    }

    try {
        // 3. Appel Sécurisé via Edge Function
        // Le prompt complexe est géré côté serveur pour la sécurité et la maintenance
        const { data, error } = await supabase.functions.invoke('ask-oracle', {
            body: {
                task: 'analyze',
                drawName,
                history: history.slice(0, 20).map(h => ({ d: h.date, w: h.gagnants })), // Contexte optimisé
                metrics: { /* On laisse le serveur calculer ou utiliser les données brutes */ }
            }
        });

        if (error) throw new Error(error.message);
        if (!data) throw new Error("Réponse vide de l'Oracle.");

        const parsed = validateReasoningSchema(data);
        
        // Mise en cache
        localStorage.setItem(cacheKey, JSON.stringify(parsed));
        return parsed;

    } catch (e: any) {
        console.warn("Oracle Relay Failure:", e);
        return generateFallbackReasoning(drawName, history);
    }
};

/**
 * Audit de Simulation Financière - Modèle Flash via Proxy
 */
export const generateSimulationAudit = async (reportData: any): Promise<string> => {
    if (!isSupabaseConfigured()) return "Audit indisponible (Mode hors-ligne).";

    try {
        const { data, error } = await supabase.functions.invoke('ask-oracle', {
            body: {
                task: 'simulation-audit',
                report: {
                    netProfit: reportData.netProfit,
                    roi: reportData.roi,
                    maxDrawdown: reportData.maxDrawdown,
                    bankruptcyDraw: reportData.bankruptcyDraw
                }
            }
        });

        if (error) throw error;
        return data?.audit || "Aucune réponse d'audit.";
    } catch (e) {
        console.error("Audit Relay Error", e);
        return "Audit IA temporairement indisponible.";
    }
};

/**
 * OCR Ticket (Extraction de données) - Modèle Vision via Proxy
 */
export const parseResultFromImage = async (base64: string) => {
    if (!isSupabaseConfigured()) throw new Error("Connexion Cloud requise pour l'analyse visuelle.");

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
 * Analyse Visuelle Générique (Graphique/Spectre)
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
        return "Le cortex visuel est momentanément inaccessible.";
    }
};
