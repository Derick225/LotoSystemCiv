
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.34.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function cleanJson(text: string) {
    if (!text) return '{}';
    return text.replace(/```json\n?|\n?```/g, '').trim();
}

async function generateWithFallback(genAI: any, primaryModel: string, params: any) {
    const fallbackModel = "gemini-3-flash-preview";
    const config = { ...params.config };
    
    // Activer le mode "Thinking" pour les modèles Pro pour plus de rigueur mathématique
    if (primaryModel.includes('pro')) {
        config.thinkingConfig = { thinkingBudget: 8000 }; 
    }

    try {
        console.log(`Executing task with model: ${primaryModel}`);
        return await genAI.models.generateContent({ ...params, model: primaryModel, config });
    } catch (e: any) {
        console.error(`Error with ${primaryModel}:`, e.message);
        if (primaryModel !== fallbackModel) {
            console.warn(`Falling back to ${fallbackModel}...`);
            return await genAI.models.generateContent({ ...params, model: fallbackModel });
        }
        throw e;
    }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { task, drawName, history, metrics, dataset, modelType, userInput, currentContext } = await req.json();
    const apiKey = Deno.env.get("API_KEY");
    if (!apiKey) throw new Error("API_KEY non configurée.");

    const genAI = new GoogleGenAI({ apiKey });
    let resultData;

    if (task === "chat") {
        const systemPrompt = `Tu es l'Agent Tactique Nexus Apex v14.0. Expert en stochastique et théorie des jeux.
        Ton rôle est d'analyser les risques financiers et les vecteurs de probabilité pour "${drawName}".
        Contexte : Capital ${currentContext?.bankroll} F. Prédiction active: ${JSON.stringify(currentContext?.lastPrediction)}.
        Sois technique, froid, et précis. Utilise des termes comme 'Entropie', 'Hurst', 'Markov'.`;

        const response = await generateWithFallback(genAI, "gemini-3-pro-preview", {
            contents: userInput,
            config: { systemInstruction: systemPrompt }
        });
        resultData = { response: response.text };

    } else if (task === "analyze") {
      const prompt = `Analyse stochastique profonde du flux loto 5/90 pour "${drawName}". 
      Historique récent : ${JSON.stringify(history.slice(0, 15))}.
      Métriques locales : ${JSON.stringify(metrics)}.
      Identifie les cycles spectraux et propose 3 vecteurs cibles. Format JSON strict.`;

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
                }
            }
        }
      });
      resultData = JSON.parse(cleanJson(response.text) || '{}');

    } else if (task === "python_kernel") {
        const prompt = `Agis comme un environnement Python Data Science distant. Modèle: ${modelType}.
        Dataset : ${JSON.stringify(dataset.slice(0, 50))}.
        Génère un script réaliste (pandas, XGBoost, scipy) et retourne les findings statistiques.`;

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

    return new Response(JSON.stringify(resultData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
