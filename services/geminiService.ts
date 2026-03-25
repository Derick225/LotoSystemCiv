
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

/**
 * Récupère des poids algorithmiques optimisés par l'IA via Gemini Flash.
 */
export const getOptimizedWeights = async (drawName: string, history: DrawResult[]): Promise<AlgoWeights | null> => {
    if (!navigator.onLine) {
        logError(new AppError("Mode hors-ligne : Optimisation IA indisponible.", "OFFLINE_MODE", "low"), { source: 'getOptimizedWeights' });
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
        Les algorithmes sont : frequency, gap, spectral, fractal, markov, poisson, momentum, equilibrium, ai_intuition, decision_forest, wavelet, resistance, spatial, orchestration, gap_velocity, anti_consensus, lstm, shadow_factor, quantum_entanglement, fractal_resonance.
        
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
                        quantum_entanglement: { type: Type.NUMBER },
                        fractal_resonance: { type: Type.NUMBER },
                        shadow_factor: { type: Type.NUMBER }
                    },
                    required: ["frequency", "gap", "spectral", "fractal", "markov", "poisson", "momentum", "equilibrium", "ai_intuition", "decision_forest", "wavelet", "resistance", "spatial", "orchestration", "gap_velocity", "anti_consensus", "lstm", "quantum_entanglement", "fractal_resonance", "shadow_factor"]
                }
            }
        });

        const jsonText = response.text;
        if (!jsonText) return null;
        
        const data = JSON.parse(jsonText);
        return data as AlgoWeights;

    } catch (e: any) {
        logError(new AppError(e.message || "Optimized Weights Error", "GEMINI_OPTIMIZE_ERROR", "medium", { error: e }), { source: 'getOptimizedWeights' });
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
        Agis comme l'Agent Tactique Nexus Apex v14.0, une IA experte en analyse stochastique et fractale pour la loterie (5/90).
        Analyse les 15 derniers tirages de "${drawName}" :
        ${JSON.stringify(historyPayload)}

        Fournis une analyse logique détaillée et probabiliste, identifie le type de pattern dominant (ex: Haute Entropie, Retour à la moyenne), suggère la prochaine séquence probable, liste les anomalies détectées (écarts types, ruptures de symétrie), donne un conseil stratégique froid et technique, suggère des numéros à surveiller (focus), et un score d'intuition (0-100).
        `;

        const response = await ai.models.generateContent({
            model: "gemini-3.1-pro-preview",
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

        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
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

        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
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
 * Analyse OCR d'un ticket de loterie via Gemini Flash Image.
 */
export const scanTicket = async (imageBase64: string): Promise<any | null> => {
    if (!navigator.onLine) throw new AppError("Mode hors-ligne : Scanner indisponible.", "OFFLINE_MODE", "low");

    const ai = getGeminiClient();
    if (!ai) throw new AppError("Clé API Gemini manquante.", "GEMINI_KEY_MISSING", "high");

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image', 
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
