
import { GoogleGenAI, Type } from "@google/genai";
import { DrawResult, PythonAnalysisResult } from "../types";

export const runDeepPythonAnalysis = async (drawName: string, history: DrawResult[]): Promise<PythonAnalysisResult> => {
    // La clé est injectée via vite.config.ts define: { 'process.env': ... }
    // TypeScript reconnaitra process.env via src/vite-env.d.ts
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) {
        throw new Error("Clé API Google Gemini manquante. Vérifiez VITE_API_KEY dans votre fichier .env.");
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Dataset allégé pour optimiser les tokens
    const dataset = history.slice(0, 50).map(d => ({ date: d.date, winners: d.gagnants }));

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Tu es un Senior Quant Analyst. Dataset: ${JSON.stringify(dataset)}. Implémente un modèle VAR ou Random Forest en Python pour le tirage ${drawName}.`,
        config: {
            systemInstruction: "Tu es le Nexus Python Kernel. Réponds UNIQUEMENT en JSON selon le schéma.",
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    script: { type: Type.STRING },
                    stdout: { type: Type.ARRAY, items: { type: Type.STRING } },
                    findings: {
                        type: Type.OBJECT,
                        properties: {
                            method: { type: Type.STRING },
                            result_vector: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                            confidence_score: { type: Type.NUMBER },
                            p_value: { type: Type.NUMBER }
                        }
                    },
                    insight: { type: Type.STRING }
                },
                required: ["script", "stdout", "findings", "insight"]
            }
        }
    });

    try {
        if (!response.text) throw new Error("Réponse vide du modèle.");
        return JSON.parse(response.text) as PythonAnalysisResult;
    } catch (e) {
        console.error("Python Kernel Parsing Error:", e);
        throw new Error("Kernel Panic: Échec du parsing de la réponse IA.");
    }
};