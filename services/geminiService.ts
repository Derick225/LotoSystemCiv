
import type { DrawResult, GeminiReasoning } from "../types";
import { supabase, isSupabaseConfigured } from './supabaseClient';

const CACHE_PREFIX = 'nexus_oracle_v10_';

/**
 * Analyse Logique (Texte)
 * Délègue l'analyse à la Edge Function 'ask-oracle'.
 */
export const analyzeDrawLogic = async (drawName: string, history: DrawResult[]): Promise<GeminiReasoning> => {
    const signature = history.slice(0, 10).map(h => h.gagnants.join('-')).join('|');
    const cacheKey = `${CACHE_PREFIX}${drawName}_${signature}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
        try { return JSON.parse(cached); } catch (e) { localStorage.removeItem(cacheKey); }
    }

    if (!navigator.onLine || !isSupabaseConfigured()) throw new Error("Relais Oracle inaccessible (Hors-ligne ou config manquante).");

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
        console.error("Oracle Relay Failure:", e);
        throw new Error(`Inférence interrompue : ${e.message}`);
    }
};

/**
 * Analyse Visuelle (Graphique/Spectre)
 */
export const analyzeChartSnapshot = async (base64Image: string, context: string): Promise<string> => {
    if (!isSupabaseConfigured()) throw new Error("Supabase non configuré.");

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
        throw new Error("Le cortex visuel de l'Oracle ne répond pas.");
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
        throw new Error("Échec du relais OCR.");
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
        throw new Error("Audit IA échoué.");
    }
};
