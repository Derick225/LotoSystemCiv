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
    const config: any = { ...params.config };
    
    // Activer la réflexion profonde pour les modèles Pro
    if (primaryModel.includes('pro')) {
        config.thinkingConfig = { thinkingBudget: 4000 };
    }

    try {
        return await genAI.models.generateContent({ 
            ...params, 
            model: primaryModel,
            config 
        });
    } catch (e: any) {
        const isQuotaError = e.status === 429 || 
                             (e.message && (e.message.includes('429') || e.message.includes('quota')));
        
        if (isQuotaError && primaryModel !== fallbackModel) {
            console.warn(`Quota exceeded for ${primaryModel}. Switching to fallback.`);
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
    
    if (!apiKey) throw new Error("API_KEY manquante.");

    const genAI = new GoogleGenAI({ apiKey });
    let resultData;

    if (task === "analyze") {
      const prompt = `Rôle: Oracle Nexus Platinum. Analyse du tirage "${drawName}". Historique: ${JSON.stringify(history.slice(0, 15))}. Effectue une analyse stochastique profonde. Identifie les anomalies de cycle et propose une stratégie. JSON strict requis.`;
      
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
      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Rédige un rapport flash narratif. Métriques: ${JSON.stringify(metrics)}.`,
        config: { responseMimeType: "application/json" }
      });
      resultData = JSON.parse(cleanJson(response.text) || '{}');

    } else if (task === "python_kernel") {
        const prompt = `Simule un script Python scientifique (${modelType}) sur : ${JSON.stringify(dataset.slice(0, 40))}. Retourne findings JSON.`;
        const response = await generateWithFallback(genAI, "gemini-3-pro-preview", {
            contents: prompt,
            config: { responseMimeType: "application/json" }
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
}