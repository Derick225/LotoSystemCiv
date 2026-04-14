
import { GoogleGenAI, Type } from "@google/genai";
import type { DrawResult, GeminiReasoning, AlgoWeights } from "../types";
import { AppError, logError } from '../utils/AppError';

// --- CONFIGURATION ---
const CACHE_TTL = 3600 * 1000; // 1 heure
const CACHE_CAPACITY = 20;

const analysisCache = new Map<string, { timestamp: number; data: GeminiReasoning }>();

// Initialize Gemini Client Lazily
export const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
        logError(new AppError("Gemini API Key not found in environment.", "GEMINI_KEY_MISSING", "high"), { source: 'getGeminiClient' });
        return null;
    }
    return new GoogleGenAI({ apiKey });
};

export async function generateWithFallback(ai: any, primaryModel: string, params: any, retries = 2) {
    const fallbackModel = "gemini-2.5-flash";
    const config = { ...params.config };

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            console.log(`Executing task with model: ${primaryModel} (Attempt ${attempt + 1})`);
            return await ai.models.generateContent({ ...params, model: primaryModel, config });
        } catch (e: any) {
            console.error(`Error with ${primaryModel}:`, e.message);
            
            // If it's a rate limit error (429), wait and retry
            if (e.message && e.message.includes('429') && attempt < retries) {
                console.warn(`Rate limit hit. Retrying in ${2000 * (attempt + 1)}ms...`);
                await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                continue;
            }
            
            if (primaryModel !== fallbackModel) {
                console.warn(`Falling back to ${fallbackModel}...`);
                try {
                    return await ai.models.generateContent({ ...params, model: fallbackModel, config });
                } catch (e2: any) {
                    console.error(`Error with ${fallbackModel}:`, e2.message);
                    if (e2.message && e2.message.includes('429') && attempt < retries) {
                        await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                        continue;
                    }
                    throw e2;
                }
            } else if (attempt === retries) {
                throw e;
            }
        }
    }
}

/**
 * Analyse logique approfondie du tirage via Gemini Flash.
 * IMPORTANT: Gemini ne doit PAS prédire de numéros. Il doit uniquement analyser les statistiques.
 */
export const analyzeDrawLogic = async (drawName: string, history: DrawResult[], metrics: any): Promise<GeminiReasoning> => {
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
        Agis comme l'Agent Tactique Nexus Apex v14.0, une IA experte en analyse stochastique pour la loterie (5/90).
        Analyse les 15 derniers tirages de "${drawName}" :
        ${JSON.stringify(historyPayload)}
        
        Métriques mathématiques calculées par le moteur déterministe :
        ${JSON.stringify(metrics || {})}

        CRITIQUE : Tu es un LLM, tu es mauvais en mathématiques pures. Tu ne dois SOUS AUCUN PRÉTEXTE essayer de deviner ou de prédire les prochains numéros.
        Ta seule tâche est de fournir une analyse sémantique et narrative basée sur les métriques qu'on te fournit.

        Fournis une analyse logique détaillée, identifie le type de pattern dominant (ex: Haute Entropie, Retour à la moyenne), liste les anomalies détectées (écarts types, ruptures de symétrie), donne un conseil stratégique froid et technique, et un score d'intuition (0-100).
        `;

        const response = await generateWithFallback(ai, "gemini-2.5-flash", {
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        logicalAnalysis: { type: Type.STRING },
                        patternType: { type: Type.STRING },
                        nextSequence: { type: Type.STRING, description: "Description textuelle de la tendance (ex: 'Hausse de la volatilité'), PAS DE NUMÉROS" },
                        anomalies: { type: Type.ARRAY, items: { type: Type.STRING } },
                        strategicAdvice: { type: Type.STRING },
                        suggestedFocus: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Laisse ce tableau VIDE. C'est le moteur mathématique qui s'en charge." },
                        intuitionScore: { type: Type.NUMBER }
                    },
                    required: ["logicalAnalysis", "patternType", "nextSequence", "anomalies", "strategicAdvice", "suggestedFocus", "intuitionScore"]
                }
            }
        });

        const jsonText = response.text;
        if (!jsonText) throw new Error("Empty response from Gemini");

        const result = JSON.parse(jsonText) as GeminiReasoning;
        
        // Force empty focus array to prevent AI hallucinations
        result.suggestedFocus = [];

        // Gestion du cache LRU
        if (analysisCache.size >= CACHE_CAPACITY) {
            const firstKey = analysisCache.keys().next().value;
            if (firstKey) analysisCache.delete(firstKey);
        }
        analysisCache.set(cacheKey, { timestamp: Date.now(), data: result });

        return result;
    } catch (e: any) {
        logError(new AppError(e.message || "Gemini Analysis Error", "GEMINI_ANALYSIS_ERROR", "medium", { error: e }), { source: 'analyzeDrawLogic' });
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

/**
 * Génère un rapport narratif (NarrativeReport) via Gemini Flash.
 */
export const getNarrativeAnalysis = async (drawName: string, history: DrawResult[], metrics: any): Promise<any | null> => {
    if (!navigator.onLine) return null;

    const ai = getGeminiClient();
    if (!ai) return null;

    try {
        const prompt = `
        Agis comme l'Agent Tactique Nexus Apex v14.0, une IA experte en analyse stochastique et fractale pour la loterie (5/90).
        
        CONTEXTE :
        Jeu : "${drawName}".
        Historique Récent (5 derniers tirages) : ${JSON.stringify(history.slice(0, 5).map(h => h.gagnants))}.
        Métriques actuelles : ${JSON.stringify(metrics || {})}.
        
        ANALYSE REQUISE :
        Génère une analyse stochastique profonde et structurée. Utilise un ton froid, technique, cyberpunk et probabiliste.
        
        Retourne un objet JSON strict avec les propriétés suivantes :
        - summary: Résumé de l'analyse (texte).
        - technicalVerdict: Verdict technique court (ex: "Suivi de Tendance").
        - riskAssessment: Évaluation du risque (ex: "Modéré").
        - confidence: Score de confiance (nombre entre 0 et 100).
        `;

        const response = await generateWithFallback(ai, "gemini-2.5-flash", {
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        summary: { type: Type.STRING },
                        technicalVerdict: { type: Type.STRING },
                        riskAssessment: { type: Type.STRING },
                        confidence: { type: Type.NUMBER }
                    },
                    required: ["summary", "technicalVerdict", "riskAssessment", "confidence"]
                }
            }
        });

        const jsonText = response.text;
        if (!jsonText) return null;

        return JSON.parse(jsonText);
    } catch (e: any) {
        logError(new AppError(e.message || "Gemini Narrative Error", "GEMINI_NARRATIVE_ERROR", "medium", { error: e }), { source: 'getNarrativeAnalysis' });
        return null;
    }
};

/**
 * Génère un script Python et une analyse via Gemini Flash.
 */
export const getPythonKernelAnalysis = async (drawName: string, history: DrawResult[], modelType: string, computedContext: any): Promise<any | null> => {
    if (!navigator.onLine) return null;

    const ai = getGeminiClient();
    if (!ai) return null;

    try {
        const prompt = `
        Agis comme un Data Scientist Senior spécialisé en modélisation stochastique.
        
        CONTEXTE :
        Jeu : "${drawName}".
        Historique Récent : ${JSON.stringify(history.map(h => h.gagnants))}.
        Modèle demandé : ${modelType}.
        Contexte calculé : ${JSON.stringify(computedContext || {})}.
        
        TÂCHE :
        1. Génère un script Python (utilisant pandas, numpy, scikit-learn, xgboost, ou pymc3 selon le modèle) qui modéliserait ce comportement.
        2. Fournis une analyse (insight) des résultats attendus.
        
        Retourne un objet JSON strict avec les propriétés suivantes :
        - script: Le code Python généré (string).
        - stdout: Les lignes de sortie console simulées (array de strings).
        - insight: L'analyse des résultats (string).
        `;

        const response = await generateWithFallback(ai, "gemini-2.5-flash", {
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        script: { type: Type.STRING },
                        stdout: { type: Type.ARRAY, items: { type: Type.STRING } },
                        insight: { type: Type.STRING }
                    },
                    required: ["script", "stdout", "insight"]
                }
            }
        });

        const jsonText = response.text;
        if (!jsonText) return null;

        return JSON.parse(jsonText);
    } catch (e: any) {
        logError(new AppError(e.message || "Gemini Python Kernel Error", "GEMINI_PYTHON_ERROR", "medium", { error: e }), { source: 'getPythonKernelAnalysis' });
        return null;
    }
};

/**
 * Génère une analyse d'autopsie (Forensic) via Gemini Flash.
 */
export const generateAutopsyAnalysis = async (predicted: number[], actual: number[], machine: number[], exactHits: number, nearMissesCount: number, machineHits: number): Promise<any | null> => {
    if (!navigator.onLine) return null;

    const ai = getGeminiClient();
    if (!ai) return null;

    try {
        const prompt = `Agis comme un expert en data science et analyse de loterie.
Analyse cette prédiction par rapport au résultat réel.
Prédiction: ${predicted.join(', ')}
Résultat: ${actual.join(', ')}
Machine: ${machine.join(', ')}
Hits exacts: ${exactHits}
Near Misses (+/- 1): ${nearMissesCount}
Numéros tombés en machine: ${machineHits}

Fournis une analyse technique courte (2 phrases max) expliquant pourquoi la prédiction a réussi ou échoué, et donne 1 à 2 recommandations d'ajustement algorithmique.`;

        const response = await generateWithFallback(ai, "gemini-2.5-flash", {
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        analysis: { type: Type.STRING, description: "Analyse technique courte" },
                        recommendations: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Recommandations d'ajustement" },
                        confidence: { type: Type.NUMBER, description: "Niveau de confiance dans l'analyse (0.0 à 1.0)" }
                    },
                    required: ["analysis", "recommendations", "confidence"]
                }
            }
        });

        const jsonText = response.text;
        if (!jsonText) return null;

        return JSON.parse(jsonText);
    } catch (e: any) {
        logError(new AppError(e.message || "Gemini Autopsy Error", "GEMINI_AUTOPSY_ERROR", "medium", { error: e }), { source: 'generateAutopsyAnalysis' });
        return null;
    }
};
export const scanTicket = async (imageBase64: string): Promise<any | null> => {
    if (!navigator.onLine) throw new AppError("Mode hors-ligne : Scanner indisponible.", "OFFLINE_MODE", "low");

    const ai = getGeminiClient();
    if (!ai) throw new AppError("Clé API Gemini manquante.", "GEMINI_KEY_MISSING", "high");

    try {
        const response = await generateWithFallback(ai, 'gemini-2.5-flash', {
            contents: {
                parts: [
                    { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
                    { text: "ANALYSE OCR LOTO. Extrais les données de ce ticket ou résultat. Format strict: Date (YYYY-MM-DD), 5 Numéros Gagnants, 5 Numéros Machine (si présents). Si illisible, renvoie des tableaux vides. Retourne uniquement un objet JSON valide avec les clés 'date', 'gagnants' et 'machine'." }
                ]
            }
        });

        const jsonStr = response.text;
        if (!jsonStr) throw new AppError("Réponse OCR vide.", "OCR_EMPTY_RESPONSE", "medium");

        // Clean JSON string
        const cleanedJsonStr = jsonStr.replace(/```json\n?|\n?```/g, '').trim();
        return JSON.parse(cleanedJsonStr);
    } catch (e: any) {
        logError(new AppError(e.message || "Gemini OCR Error", "GEMINI_OCR_ERROR", "high", { error: e }), { source: 'scanTicket' });
        throw e;
    }
};
