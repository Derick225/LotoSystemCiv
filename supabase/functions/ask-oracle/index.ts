
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.34.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Clé de secours OpenRouter fournie
const OPENROUTER_KEY = "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";

function cleanJson(text: string) {
    if (!text) return '{}';
    return text.replace(/```json\n?|\n?```/g, '').trim();
}

/**
 * Fallback vers OpenRouter (Llama 3.3) si Gemini est KO
 */
async function generateWithOpenRouter(params: any) {
    console.log("[Oracle] Bascule sur OpenRouter (Llama 3.3)...");
    
    const messages = [];
    
    // 1. Gestion System Prompt
    if (params.config?.systemInstruction) {
        messages.push({ role: 'system', content: params.config.systemInstruction });
    } else {
        // Prompt par défaut pour assurer la cohérence
        messages.push({ role: 'system', content: "Tu es un expert en analyse de données et statistiques. Tu dois répondre au format JSON strict quand cela est demandé." });
    }

    // 2. Gestion User Content (String ou Parts)
    let userContent = "";
    if (typeof params.contents === 'string') {
        userContent = params.contents;
    } else if (Array.isArray(params.contents)) {
        // Cas chat history simple
        // Note: L'historique chat est géré différemment dans 'chat', ici on simplifie pour le prompt principal
        userContent = params.contents.map((p: any) => typeof p === 'string' ? p : JSON.stringify(p)).join('\n');
    } else if (params.contents?.parts) {
        userContent = params.contents.parts.map((p: any) => p.text).join('\n');
    } else {
        userContent = JSON.stringify(params.contents);
    }

    // Force JSON instruction si nécessaire (car Llama n'a pas de mode JSON strict natif comme Gemini)
    if (params.config?.responseMimeType === "application/json") {
        userContent += "\n\nIMPORTANT : Réponds UNIQUEMENT avec un objet JSON valide. Pas de texte avant ou après, pas de markdown.";
    }

    messages.push({ role: 'user', content: userContent });

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                // Modèle puissant et rapide, bon en JSON
                model: "meta-llama/llama-3.3-70b-instruct", 
                messages: messages,
                temperature: params.config?.temperature || 0.7,
                top_p: 0.9,
                // On simule un output JSON pour le parser
                response_format: params.config?.responseMimeType === "application/json" ? { type: "json_object" } : undefined
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenRouter Error: ${response.status} - ${err}`);
        }

        const json = await response.json();
        // On retourne un objet qui imite la structure de réponse Gemini pour la compatibilité
        return { text: json.choices[0].message.content };

    } catch (e: any) {
        console.error("OpenRouter Failed:", e.message);
        throw e;
    }
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
        
        // Premier Fallback : Gemini Flash
        if (primaryModel !== fallbackModel) {
            console.warn(`Falling back to ${fallbackModel}...`);
            try {
                // On retire thinkingConfig pour Flash s'il est présent (par sécurité)
                const flashConfig = { ...config };
                delete flashConfig.thinkingConfig;
                return await genAI.models.generateContent({ ...params, model: fallbackModel, config: flashConfig });
            } catch (e2: any) {
                console.error(`Error with ${fallbackModel}:`, e2.message);
                // Deuxième Fallback : OpenRouter (Llama)
                return await generateWithOpenRouter(params);
            }
        } else {
            // Si on était déjà sur Flash et que ça a planté -> OpenRouter
            return await generateWithOpenRouter(params);
        }
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
    } else if (task === "narrative") {
        const prompt = `Rédige un "Bulletin Météo Stochastique" pour le tirage "${drawName}".
        Métriques : ${JSON.stringify(metrics)}.
        Ton : Expert, concis, style "Finance de marché".`;
        
        const response = await generateWithFallback(genAI, "gemini-3-flash-preview", {
             contents: prompt,
             config: {
                 responseMimeType: "application/json",
                 responseSchema: {
                     type: Type.OBJECT,
                     properties: {
                         summary: { type: Type.STRING },
                         technicalVerdict: { type: Type.STRING },
                         riskAssessment: { type: Type.STRING }
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
