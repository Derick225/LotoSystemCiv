
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

/**
 * Fonction de génération avec gestion de fallback et de réflexion (Thinking)
 */
async function generateWithFallback(genAI: GoogleGenAI, primaryModel: string, params: any, useThinking: boolean = false) {
    const fallbackModel = "gemini-3-flash-preview";
    
    // Configuration enrichie
    const config: any = { ...params.config };
    if (useThinking && primaryModel.includes('pro')) {
        config.thinkingConfig = { thinkingBudget: 2000 };
    }

    try {
        return await genAI.models.generateContent({ 
            ...params, 
            model: primaryModel,
            config 
        });
    } catch (e: any) {
        const isQuotaError = e.status === 429 || 
                             (e.message && (e.message.includes('429') || e.message.includes('quota') || e.message.includes('RESOURCE_EXHAUSTED')));
        
        if (isQuotaError && primaryModel !== fallbackModel) {
            console.warn(`Quota exceeded for ${primaryModel}. Switching to fallback: ${fallbackModel}.`);
            await new Promise(r => setTimeout(r, 500)); // Pause courte
            return await genAI.models.generateContent({ ...params, model: fallbackModel });
        }
        throw e;
    }
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { task, drawName, history, metrics, dataset, modelType, imageBase64, context, report } = await req.json();
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) throw new Error("Clé API GEMINI non configurée.");

    const genAI = new GoogleGenAI({ apiKey });
    let resultData;

    // TÂCHE : ANALYSE LOGIQUE (Raisonnement profond requis)
    if (task === "analyze") {
      const prompt = `Rôle: Oracle Nexus, Expert Loterie (5/90). Analyse du tirage "${drawName}". Historique: ${JSON.stringify(history.slice(0, 10))}. Identifie patterns, suggère 3 focus, score intuition (0-100), analyse Markdown. JSON strict.`;
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
      }, true);
      resultData = JSON.parse(cleanJson(response.text) || '{}');

    // TÂCHE : RAPPORT NARRATIF (Vitesse requise)
    } else if (task === "narrative") {
      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Rédige un rapport flash exécutif court pour le tirage ${drawName}. Métriques: ${JSON.stringify(metrics)}.`,
        config: { responseMimeType: "application/json" }
      });
      resultData = JSON.parse(cleanJson(response.text) || '{}');

    // TÂCHE : SIMULATION KERNEL PYTHON (Précision de code requise)
    } else if (task === "python_kernel") {
        const prompt = `Simule un script Python scientifique (${modelType}) sur : ${JSON.stringify(dataset.slice(0, 30))}. Génère logs stdout et conclusions JSON (result_vector, confidence_score, p_value).`;
        const response = await generateWithFallback(genAI, "gemini-3-pro-preview", {
            contents: prompt,
            config: { responseMimeType: "application/json" }
        }, true);
        resultData = JSON.parse(cleanJson(response.text) || '{}');

    // TÂCHE : AUDIT DE SIMULATION
    } else if (task === "simulation-audit") {
        const response = await genAI.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Analyse ce rapport de backtesting et donne un verdict critique (3 phrases max) : ${JSON.stringify(report).substring(0, 1500)}`,
            config: { responseMimeType: "application/json" }
        });
        resultData = JSON.parse(cleanJson(response.text) || '{}');
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
