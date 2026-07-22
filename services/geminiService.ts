import { isSupabaseConfigured } from './supabaseClient';
import { DrawResult, GeminiReasoning } from '../types';
import { AppError, logError } from '../utils/AppError';
import { z } from 'zod';
import { apiClient } from '../core/api/apiClient';
import { CACHE_TTL } from './cache/CacheService';

// Cache LRU ultra-simple local
const logicCache: Record<string, { data: GeminiReasoning; expiry: number }> = {};
const narrativeCache: Record<string, { data: string; expiry: number }> = {};

/**
 * Calcule la température continue de génération en fonction de l'exposant de Hurst (H).
 * T(H) = 0.10 + 0.85 / (1 + exp(12 * (H - 0.5)))
 * - Si H > 0.55 (déterministe) -> T in [0.10, 0.35]
 * - Si H < 0.45 (chaotique) -> T in [0.65, 0.95]
 */
export const computeContinuousTemperature = (hurst: number = 0.5): number => {
    const val = 0.10 + (0.85 / (1.0 + Math.exp(12.0 * (hurst - 0.50))));
    return parseFloat(Math.max(0.10, Math.min(0.95, val)).toFixed(2));
};

/**
 * Calcule le Score de Récurrence Bayésienne du Discours (B_score).
 */
export const computeBayesianRecurrenceScore = (brier: number = 0.18, vol: number = 0.2, entropy: number = 0.85): number => {
    const brierFactor = Math.max(0, 1 - Math.min(1, brier));
    const volFactor = Math.max(0, 1 - Math.min(1, vol));
    const entropyFactor = Math.max(0, 1 - Math.min(1, entropy));
    const score = 100 * (0.40 * brierFactor + 0.35 * volFactor + 0.25 * entropyFactor);
    return Math.round(Math.max(1, Math.min(99, score)));
};

/**
 * Analyse la logique structurelle via Edge Function (ask-oracle).
 */
export const analyzeDrawLogic = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: Record<string, unknown>
): Promise<GeminiReasoning> => {
    const lastDrawDate = history[0]?.date || 'nodate';
    const regimeStr = (metrics?.regime as string) || (metrics?.gameRegime as string) || 'STABLE';
    const hurstVal = typeof metrics?.hurst === 'number' ? metrics.hurst : 0.50;
    const spectralEntropy = typeof metrics?.spectralEntropy === 'number' ? metrics.spectralEntropy : 0.82;
    const volatility = typeof metrics?.volatility === 'number' ? metrics.volatility : 0.20;
    const brierScore = typeof metrics?.brierScore === 'number' ? metrics.brierScore : 0.18;
    
    // Strict isolation par tirage: drawName + lastDrawDate + regime
    const cacheKey = `${drawName}_${lastDrawDate}_${regimeStr}`.replace(/\s+/g, '_');
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
            intuitionScore: 0,
            counterfactualExplanation: "L'analyse contrefactuelle requiert une connexion active au noyau Oracle.",
            bayesianRecurrenceScore: computeBayesianRecurrenceScore(brierScore, volatility, spectralEntropy)
        };
    }

    try {
        const historyPayload = history.slice(0, 15).map(h => ({ date: h.date, gagnants: h.gagnants }));
        const temperature = computeContinuousTemperature(hurstVal);
        const brierRecurrenceScore = computeBayesianRecurrenceScore(brierScore, volatility, spectralEntropy);

        const structuredContext = {
            drawName,
            lastDrawDate,
            regime: regimeStr,
            hurst: hurstVal,
            spectralEntropy,
            volatility,
            conceptDrift: metrics?.conceptDrift || 0.05,
            brierScore,
            affinityTop3: metrics?.affinityTop3 || [],
            temperature
        };

        const response = await apiClient.post<{ success: boolean; result: unknown; error?: string }>('ask-oracle', {
            task: 'analyzeDrawLogic',
            payload: { 
                drawName, 
                historyPayload, 
                metrics: { ...metrics, ...structuredContext },
                structuredContext,
                temperature
            }
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
            intuitionScore: z.number().optional().default(0),
            counterfactualExplanation: z.string().optional().default(""),
            bayesianRecurrenceScore: z.number().optional().default(brierRecurrenceScore)
        }).catchall(z.unknown());

        const parsedResult = GeminiReasoningSchema.safeParse(response.result);
        if (!parsedResult.success) {
            throw new Error("Invalid Oracle Result Format: " + parsedResult.error.message);
        }
        const result = parsedResult.data as unknown as GeminiReasoning;
        if (!result.bayesianRecurrenceScore) {
            result.bayesianRecurrenceScore = brierRecurrenceScore;
        }

        // Gestion du cache LRU avec clé isolée par tirage
        logicCache[cacheKey] = {
            data: result,
            expiry: Date.now() + CACHE_TTL.MEDIUM
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
            intuitionScore: 0,
            counterfactualExplanation: "Erreur de transmission contrefactuelle.",
            bayesianRecurrenceScore: computeBayesianRecurrenceScore(brierScore, volatility, spectralEntropy)
        };
    }
};

/**
 * Génère l'analyse narrative globale via Edge Function (ask-oracle).
 */
export const getNarrativeAnalysis = async (drawName: string, history: DrawResult[], metrics?: Record<string, unknown>): Promise<string | null> => {
    const lastDrawDate = history[0]?.date || 'nodate';
    const regimeStr = (metrics?.regime as string) || (metrics?.gameRegime as string) || 'STABLE';
    const cacheKey = `${drawName}_${lastDrawDate}_${regimeStr}`.replace(/\s+/g, '_');
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
                expiry: Date.now() + CACHE_TTL.SHORT
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
