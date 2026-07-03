import { isSupabaseConfigured } from './supabaseClient';
import { DrawResult, GeminiReasoning } from '../types';
import { AppError, logError } from '../utils/AppError';
import { z } from 'zod';
import { apiClient } from '../core/api/apiClient';

// Cache LRU ultra-simple local
const logicCache: Record<string, { data: GeminiReasoning; expiry: number }> = {};
const narrativeCache: Record<string, { data: string; expiry: number }> = {};

/**
 * Analyse la logique structurelle via Edge Function (ask-oracle).
 */
export const analyzeDrawLogic = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: Record<string, unknown>
): Promise<GeminiReasoning> => {
    const cacheKey = `${drawName}_${history.length}`;
    if (logicCache[cacheKey] && logicCache[cacheKey].expiry > Date.now()) {
        return logicCache[cacheKey].data;
    }

    if (!isSupabaseConfigured() || !navigator.onLine) {
        return {
            logicalAnalysis: "Mode hors-ligne ou Supabase non configuré. Oracle inaccessible.",
            patternType: "Indéterminé",
            nextSequence: "Aucune",
            anomalies: [],
            strategicAdvice: "Connectez-vous pour accéder à l'Oracle.",
            suggestedFocus: [],
            intuitionScore: 0
        };
    }

    try {
        const historyPayload = history.slice(0, 15).map(h => ({ date: h.date, gagnants: h.gagnants }));
        
        const response = await apiClient.post<{ success: boolean; result: unknown; error?: string }>('ask-oracle', {
            task: 'analyzeDrawLogic',
            payload: { drawName, historyPayload, metrics }
        });

        if (!response?.success || !response.result) {
            throw new Error(response?.error || 'Empty response from Oracle');
        }

        const GeminiReasoningSchema = z.object({
            logicalAnalysis: z.string().optional().default(""),
            patternType: z.string().optional().default("Indéterminé"),
            nextSequence: z.string().optional().default("Aucune"),
            anomalies: z.array(z.string()).optional().default([]),
            strategicAdvice: z.string().optional().default(""),
            suggestedFocus: z.array(z.number()).optional().default([]),
            intuitionScore: z.number().optional().default(0)
        }).catchall(z.unknown());

        const parsedResult = GeminiReasoningSchema.safeParse(response.result);
        if (!parsedResult.success) {
            throw new Error("Invalid Oracle Result Format: " + parsedResult.error.message);
        }
        const result = parsedResult.data as unknown as GeminiReasoning;

        // Gestion du cache LRU
        logicCache[cacheKey] = {
            data: result,
            expiry: Date.now() + 1000 * 60 * 30 // 30 mins caching
        };

        return result;
    } catch (e: unknown) {
        logError(new AppError((e instanceof Error ? e.message : String(e)) || "Gemini Logic Error", "GEMINI_LOGIC_ERROR", "medium", { error: e }), { source: 'analyzeDrawLogic' });
        return {
            logicalAnalysis: "Oracle indisponible.",
            patternType: "Indéterminé",
            nextSequence: "Aucune",
            anomalies: [],
            strategicAdvice: "Le noyau n'a pas pu communiquer avec l'Oracle. Réessayez plus tard.",
            suggestedFocus: [],
            intuitionScore: 0
        };
    }
};

/**
 * Génère l'analyse narrative globale via Edge Function (ask-oracle).
 */
export const getNarrativeAnalysis = async (drawName: string, history: DrawResult[], metrics?: Record<string, unknown>): Promise<string | null> => {
    const cacheKey = `${drawName}_${history.length}`;
    if (narrativeCache[cacheKey] && narrativeCache[cacheKey].expiry > Date.now()) {
        return narrativeCache[cacheKey].data;
    }

    if (!navigator.onLine) return null;

    try {
        const historyPayload = history.slice(0, 10).map(h => ({ date: h.date, gagnants: h.gagnants }));
        const response = await apiClient.post<{ success: boolean; result: string; error?: string }>('ask-oracle', {
            task: 'getNarrativeAnalysis',
            payload: { drawName, historyPayload, metrics }
        });

        const textOutput = response?.result || null;
        if (textOutput) {
            narrativeCache[cacheKey] = {
                data: textOutput,
                expiry: Date.now() + 1000 * 60 * 15 // 15 mins cache
            };
        }

        return textOutput;
    } catch (e: unknown) {
        logError(new AppError((e instanceof Error ? e.message : String(e)) || "Gemini Narrative Error", "GEMINI_NARRATIVE_ERROR", "medium", { error: e }), { source: 'getNarrativeAnalysis' });
        return null;
    }
};

/**
 * Génère un script Python et une analyse via Edge Function (ask-oracle).
 */
export const getPythonKernelAnalysis = async (
    drawName: string, 
    history: DrawResult[], 
    modelType: string, 
    computedContext: unknown
): Promise<{ script?: string; stdout?: string[]; insight?: string } | null> => {
    if (!navigator.onLine) return null;

    try {
        const historyPayload = history.map(h => h.gagnants);
        const response = await apiClient.post<{ success: boolean; result: { script?: string; stdout?: string[]; insight?: string }; error?: string }>('ask-oracle', {
            task: 'getPythonKernelAnalysis',
            payload: { drawName, historyPayload, modelType, computedContext }
        });

        return response?.result || null;
    } catch (e: unknown) {
        logError(new AppError((e instanceof Error ? e.message : String(e)) || "Gemini Python Kernel Error", "GEMINI_PYTHON_ERROR", "medium", { error: e }), { source: 'getPythonKernelAnalysis' });
        return null;
    }
};

/**
 * Génère une analyse d'autopsie (Forensic) via Edge Function (ask-oracle).
 */
export const generateAutopsyAnalysis = async (
    drawName: string,
    predicted: number[], 
    actual: number[], 
    machine: number[], 
    exactHits: number, 
    nearMissesCount: number, 
    machineHits: number,
    rmse: number = 0,
    spectralDeviations: unknown[] = [],
    entropyCollapse?: boolean,
    benfordCompliance?: number
): Promise<{ analysis: string; recommendations: string[]; confidence: number; isBlackSwan: boolean } | null> => {
    if (!navigator.onLine) return null;

    try {
        const response = await apiClient.post<{ success: boolean; result: { analysis: string; recommendations: string[]; confidence: number; isBlackSwan: boolean }; error?: string }>('ask-oracle', {
            task: 'generateAutopsyAnalysis',
            payload: { drawName, predicted, actual, machine, exactHits, nearMissesCount, machineHits, rmse, spectralDeviations, entropyCollapse, benfordCompliance }
        });

        return response?.result || null;
    } catch (e: unknown) {
        logError(new AppError((e instanceof Error ? e.message : String(e)) || "Gemini Autopsy Error", "GEMINI_AUTOPSY_ERROR", "medium", { error: e }), { source: 'generateAutopsyAnalysis' });
        return null;
    }
};

/**
 * Génère une synthèse stratégique globale à partir de plusieurs rapports Forensic.
 */
export const generateGlobalForensicSynthesis = async (reports: Array<unknown>): Promise<{ synthesis: string; focalPoints: string[]; overallCalibration: string } | null> => {
    if (!navigator.onLine || reports.length < 2) return null;

    try {
        const typedReports = reports as Array<Record<string, unknown>>;
        const summary = typedReports.slice(0, 10).map(r => {
            const matches = r.matches as Array<{ errorType: string }> | undefined;
            return {
                date: r.date as string | undefined,
                hits: matches ? (Array.isArray(matches) ? matches.filter((m) => m.errorType === 'Hit').length : 0) : 0,
                rmse: r.rmse as number | undefined,
                brier_score: r.brier_score as number | undefined,
                kl_divergence: r.kl_divergence as number | undefined,
                shannon_entropy: r.shannon_entropy as number | undefined
            };
        });

        const response = await apiClient.post<{ success: boolean; result: { synthesis: string; focalPoints: string[]; overallCalibration: string }; error?: string }>('ask-oracle', {
            task: 'generateGlobalForensicSynthesis',
            payload: { summary }
        });

        return response?.result || null;
    } catch (e: unknown) {
        logError(new AppError((e instanceof Error ? e.message : String(e)) || "Gemini Synthesis Error", "GEMINI_SYNTHESIS_ERROR", "medium", { error: e }), { source: 'generateGlobalForensicSynthesis' });
        return null;
    }
};

export const scanTicket = async (imageBase64: string): Promise<{ gagnants?: number[]; date?: string; machine?: number[] } | null> => {
    if (!navigator.onLine) throw new AppError("Mode hors-ligne : Scanner indisponible.", "OFFLINE_MODE", "low");

    try {
        const response = await apiClient.post<{ success: boolean; result: { gagnants?: number[]; date?: string; machine?: number[] }; error?: string }>('ask-oracle', {
            task: 'scanTicket',
            payload: { imageBase64 }
        });

        if (!response?.success) {
            throw new Error(response?.error || 'OCR failed');
        }

        return response.result;
    } catch (e: unknown) {
        logError(new AppError((e instanceof Error ? e.message : String(e)) || "Gemini OCR Error", "GEMINI_OCR_ERROR", "high", { error: e }), { source: 'scanTicket' });
        throw e;
    }
};
