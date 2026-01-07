
import { GoogleGenAI, Type } from "@google/genai";
import { DrawResult, PythonAnalysisResult } from "../types";

export const runDeepPythonAnalysis = async (drawName: string, history: DrawResult[]): Promise<PythonAnalysisResult> => {
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) {
        console.error("API Key missing. Please check .env file.");
        throw new Error("Clé API manquante. Vérifiez le fichier .env (VITE_API_KEY).");
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Dataset allégé pour optimiser les tokens et la rapidité
    const dataset = history.slice(0, 40).map(d => ({ date: d.date, winners: d.gagnants }));

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview', 
            contents: `Tu es un Senior Quant Analyst. Dataset: ${JSON.stringify(dataset)}. Implémente un modèle VAR ou Random Forest en Python pour le tirage ${drawName}.`,
            config: {
                systemInstruction: "Tu es le Nexus Python Kernel. Réponds UNIQUEMENT avec un JSON pur. Pas de balises markdown, pas de texte avant ou après.",
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

        let text = response.text;
        
        if (!text) throw new Error("Réponse vide du modèle.");

        // --- NETTOYAGE ROBUSTE DU JSON ---
        // 1. Suppression des balises Markdown code blocks
        text = text.replace(/```json/g, '').replace(/```/g, '');
        
        // 2. Extraction chirurgicale de l'objet JSON (entre la première { et la dernière })
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1) {
            text = text.substring(firstBrace, lastBrace + 1);
        }

        // 3. Parsing sécurisé
        try {
            return JSON.parse(text) as PythonAnalysisResult;
        } catch (parseError) {
            console.error("JSON PARSE ERROR. Raw text received:", text);
            throw new Error("Le format JSON reçu de l'IA est invalide.");
        }

    } catch (e: any) {
        console.error("Python Kernel Error:", e);
        // Propagation d'un message d'erreur plus clair vers l'UI
        if (e.message.includes('401') || e.message.includes('API key')) {
            throw new Error("Clé API invalide ou expirée.");
        }
        if (e.message.includes('JSON')) {
            throw new Error("Erreur de formatage IA (JSON invalide).");
        }
        throw new Error(`Échec Kernel: ${e.message}`);
    }
};
