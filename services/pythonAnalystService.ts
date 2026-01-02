
import { GoogleGenAI, Type } from "@google/genai";
import { DrawResult, PythonAnalysisResult } from "../types";

export const runDeepPythonAnalysis = async (drawName: string, history: DrawResult[]): Promise<PythonAnalysisResult> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
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
        return JSON.parse(response.text || "{}") as PythonAnalysisResult;
    } catch (e) {
        throw new Error("Kernel Panic: Échec du parsing JSON.");
    }
};
