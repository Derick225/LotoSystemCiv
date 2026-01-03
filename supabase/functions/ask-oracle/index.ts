
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.34.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { task, drawName, history, metrics } = await req.json();
    
    // Assurez-vous d'avoir défini API_KEY dans les secrets Supabase
    const apiKey = Deno.env.get('API_KEY');
    if (!apiKey) throw new Error("API_KEY manquante");
    
    const ai = new GoogleGenAI({ apiKey });
    let resultData;

    if (task === 'analyze') {
      // Analyse Logique Avancée
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview', 
        contents: {
            parts: [
                { text: `Tu es un expert en analyse stochastique pour le tirage de loterie ${drawName} (5/90).
                   Voici l'historique récent : ${JSON.stringify(history)}.
                   Analyse les tendances, les fréquences, les écarts et la loi de Benford.
                   Format JSON strict.` }
            ]
        },
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
            required: ['logicalAnalysis', 'suggestedFocus', 'intuitionScore']
          }
        }
      });
      resultData = JSON.parse(response.text || '{}');
    } else if (task === 'narrative') {
        // Rapport Narratif
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [{ text: `Rédige un rapport narratif court pour le tirage ${drawName}. Métriques: ${JSON.stringify(metrics)}.` }]
            },
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
    }

    return new Response(JSON.stringify(resultData), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});