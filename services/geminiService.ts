
import { GoogleGenAI, Type } from "@google/genai";
import type { DrawResult, GeminiReasoning, AlgoWeights } from "../types";

// --- CONFIGURATION ---
const CACHE_TTL = 3600 * 1000; // 1 heure
const CACHE_CAPACITY = 20;

const analysisCache = new Map<string, { timestamp: number; data: GeminiReasoning }>();

// Initialize Gemini Client Lazily
const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
        console.warn("Gemini API Key not found in environment.");
        return null;
    }
    return new GoogleGenAI({ apiKey });
};

/**
 * Récupère des poids algorithmiques optimisés par l'IA via Gemini Flash.
 */
export const getOptimizedWeights = async (drawName: string, history: DrawResult[]): Promise<AlgoWeights | null> => {
    if (!navigator.onLine) {
        console.warn("Mode hors-ligne : Optimisation IA indisponible.");
        return null;
    }

    const ai = getGeminiClient();
    if (!ai) return null;

    try {
        // On envoie un sous-ensemble de l'historique pour ne pas saturer le prompt
        const historyPayload = history.slice(0, 20).map(h => ({ 
            date: h.date, 
            gagnants: h.gagnants 
        }));

        const prompt = `
        Tu es un expert en optimisation stochastique pour les systèmes de loterie.
        Analyse les 20 derniers tirages suivants pour le jeu "${drawName}" :
        ${JSON.stringify(historyPayload)}

        Ta tâche est de déterminer les poids optimaux (entre 0.0 et 1.0) pour chaque algorithme de prédiction afin de maximiser la précision pour le prochain tirage.
        Les algorithmes sont : frequency, gap, spectral, fractal, markov, poisson, momentum, equilibrium, ai_intuition, decision_forest, wavelet, resistance, spatial, orchestration, gap_velocity, anti_consensus, lstm, shadow_factor.
        
        Retourne un objet JSON strict correspondant à l'interface AlgoWeights.
        `;

        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        frequency: { type: Type.NUMBER },
                        gap: { type: Type.NUMBER },
                        spectral: { type: Type.NUMBER },
                        fractal: { type: Type.NUMBER },
                        markov: { type: Type.NUMBER },
                        poisson: { type: Type.NUMBER },
                        momentum: { type: Type.NUMBER },
                        equilibrium: { type: Type.NUMBER },
                        ai_intuition: { type: Type.NUMBER },
                        decision_forest: { type: Type.NUMBER },
                        wavelet: { type: Type.NUMBER },
                        resistance: { type: Type.NUMBER },
                        spatial: { type: Type.NUMBER },
                        orchestration: { type: Type.NUMBER },
                        gap_velocity: { type: Type.NUMBER },
                        anti_consensus: { type: Type.NUMBER },
                        lstm: { type: Type.NUMBER },
                        shadow_factor: { type: Type.NUMBER }
                    }
                }
            }
        });

        const jsonText = response.text;
        if (!jsonText) return null;
        
        const data = JSON.parse(jsonText);
        return data as AlgoWeights;

    } catch (e: any) {
        console.error("Optimized Weights Error:", e);
        return null;
    }
};

/**
 * Analyse logique approfondie du tirage via Gemini Flash.
 */
export const analyzeDrawLogic = async (drawName: string, history: DrawResult[]): Promise<GeminiReasoning> => {
    const cacheKey = `${drawName}_${history[0]?.id}`;
    const cached = analysisCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        return cached.data;
    }

    if (!navigator.onLine) {
         return {
            logicalAnalysis: "Mode hors-ligne. L'analyse IA nécessite une connexion internet.",
            patternType: "Inconnu",
            nextSequence: "Non calculable",
            anomalies: [],
            strategicAdvice: "Connectez-vous pour accéder à l'Oracle.",
            suggestedFocus: [],
            intuitionScore: 0
        };
    }

    const ai = getGeminiClient();
    if (!ai) {
        return {
            logicalAnalysis: "Clé API Gemini manquante. Veuillez configurer l'environnement.",
            patternType: "Configuration Requise",
            nextSequence: "N/A",
            anomalies: ["API Key Missing"],
            strategicAdvice: "Vérifiez la configuration.",
            suggestedFocus: [],
            intuitionScore: 0
        };
    }

    try {
        const historyPayload = history.slice(0, 15).map(h => ({ date: h.date, gagnants: h.gagnants }));
        
        const prompt = `
        Analyse les 15 derniers tirages de "${drawName}" :
        ${JSON.stringify(historyPayload)}

        Fournis une analyse logique détaillée, identifie le type de pattern dominant, suggère la prochaine séquence probable, liste les anomalies détectées, donne un conseil stratégique, suggère des numéros à surveiller (focus), et un score d'intuition (0-100).
        `;

        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        logicalAnalysis: { type: Type.STRING },
                        patternType: { type: Type.STRING },
                        nextSequence: { type: Type.STRING },
                        anomalies: { type: Type.ARRAY, items: { type: Type.STRING } },
                        strategicAdvice: { type: Type.STRING },
                        suggestedFocus: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                        intuitionScore: { type: Type.NUMBER }
                    },
                    required: ["logicalAnalysis", "patternType", "nextSequence", "anomalies", "strategicAdvice", "suggestedFocus", "intuitionScore"]
                }
            }
        });

        const jsonText = response.text;
        if (!jsonText) throw new Error("Empty response from Gemini");

        const result = JSON.parse(jsonText) as GeminiReasoning;

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
