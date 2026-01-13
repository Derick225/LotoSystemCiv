
import { GoogleGenAI, Type } from "@google/genai";

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function cleanJson(text: string) {
    if (!text) return '{}';
    return text.replace(/```json\n?|\n?```/g, '').trim();
}

async function generateWithFallback(genAI: GoogleGenAI, primaryModel: string, params: any) {
    const fallbackModel = "gemini-3-flash-preview";
    try {
        // First attempt with primary model (usually Pro)
        return await genAI.models.generateContent({ ...params, model: primaryModel });
    } catch (e: any) {
        const isQuotaError = e.status === 429 || 
                             (e.message && (e.message.includes('429') || e.message.includes('quota') || e.message.includes('RESOURCE_EXHAUSTED')));
        
        if (isQuotaError && primaryModel !== fallbackModel) {
            console.warn(`Quota exceeded for ${primaryModel}. Switching to fallback: ${fallbackModel}.`);
            // Add a small delay before retry to be safe
            await new Promise(r => setTimeout(r, 1000));
            return await genAI.models.generateContent({ ...params, model: fallbackModel });
        }
        throw e;
    }
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { task, drawName, history, metrics, dataset, modelType, imageBase64, context, report } = await req.json();
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) throw new Error("Clé API GEMINI non configurée.");

    const genAI = new GoogleGenAI({ apiKey });
    let resultData;

    if (task === "analyze") {
      const prompt = `
        Rôle: Oracle Nexus, Expert Loterie (5/90).
        Contexte: Analyse du tirage "${drawName}".
        Données: ${JSON.stringify(history.slice(0, 10))}.
        Tâche: Analyse stochastique concise.
        Format JSON strict.
      `;

      const response = await generateWithFallback(genAI, "gemini-3-pro-preview", {
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
      resultData = JSON.parse(cleanJson(response.text) || '{}');

    } else if (task === "narrative") {
      // Narrative uses Flash by default, no need for fallback logic from Pro
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
      resultData = JSON.parse(cleanJson(response.text) || '{}');

    } else if (task === "simulation-audit") {
        const response = await genAI.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Agis comme un auditeur de risques financiers. Analyse ce rapport de backtesting de loterie et donne un avis critique court (3 phrases max) sur la viabilité de la stratégie.
            Rapport: ${JSON.stringify(report).substring(0, 2000)}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        audit: { type: Type.STRING }
                    }
                }
            }
        });
        resultData = JSON.parse(cleanJson(response.text) || '{}');

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
        const prompt = `Simule un script Python Data Science (${modelType}) sur ce dataset réduit: ${JSON.stringify(dataset.slice(0, 30))}. Génère les logs (stdout) et les résultats JSON.`;
        
        const response = await generateWithFallback(genAI, "gemini-3-pro-preview", {
            contents: prompt,
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
        resultData = JSON.parse(cleanJson(response.text) || '{}');
    }

    if (!resultData) {
        throw new Error(`Task '${task}' non gérée ou réponse vide.`);
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
