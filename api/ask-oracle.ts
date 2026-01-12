
import { GoogleGenAI, Type } from "@google/genai";

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { task, drawName, history, metrics, dataset, modelType, imageBase64, context } = await req.json();
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) throw new Error("Clé API GEMINI non configurée (Vercel Env).");

    const genAI = new GoogleGenAI({ apiKey });
    let resultData;

    if (task === "analyze") {
      const modelName = "gemini-3-pro-preview";
      const prompt = `
        Rôle: Oracle Nexus, Expert Loterie (5/90).
        Contexte: Analyse du tirage "${drawName}".
        Données: ${JSON.stringify(history.slice(0, 10))}.
        
        Tâche: Analyse stochastique concise.
        1. Identifie le pattern dominant.
        2. Suggère 3 numéros cibles.
        3. Donne un score d'intuition.
        4. Rédige une analyse logique Markdown.
        Format JSON strict.
      `;

      const response = await genAI.models.generateContent({
        model: modelName,
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
                    suggestedFocus: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                    intuitionScore: { type: Type.NUMBER }
                },
                required: ["logicalAnalysis", "suggestedFocus", "intuitionScore"]
            }
        }
      });
      resultData = JSON.parse(response.text || '{}');

    } else if (task === "narrative") {
      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Rédige un rapport flash exécutif pour le tirage ${drawName}. Métriques: ${JSON.stringify(metrics)}.`,
        config: { 
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    summary: { type: Type.STRING },
                    technicalVerdict: { type: Type.STRING },
                    riskAssessment: { type: Type.STRING },
                    confidence: { type: Type.NUMBER }
                }
            }
        }
      });
      resultData = JSON.parse(response.text || '{}');

    } else if (task === "vision-analysis") {
        const response = await genAI.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
                    { text: `Analyse cette image : ${context}. Interprétation technique courte.` }
                ]
            }
        });
        resultData = { analysis: response.text };

    } else if (task === "python_kernel") {
        const response = await genAI.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: `Simule un script Python Data Science (${modelType}) sur ce dataset réduit: ${JSON.stringify(dataset.slice(0, 30))}. Génère les logs (stdout) et les résultats JSON.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        script: { type: Type.STRING },
                        stdout: { type: Type.ARRAY, items: { type: Type.STRING } },
                        findings: {
                            type: Type.OBJECT,
                            properties: {
                                result_vector: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                                confidence_score: { type: Type.NUMBER },
                                p_value: { type: Type.NUMBER }
                            }
                        },
                        insight: { type: Type.STRING }
                    }
                }
            }
        });
        resultData = JSON.parse(response.text || '{}');
    }

    return new Response(JSON.stringify(resultData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Oracle Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
