
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.34.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { task, drawName, history, metrics, report } = await req.json();
    
    // Initialisation Gemini avec la clé d'environnement Supabase
    const apiKey = Deno.env.get('API_KEY');
    if (!apiKey) throw new Error("API_KEY manquante dans les secrets Supabase");
    
    const ai = new GoogleGenAI({ apiKey });
    let resultData;

    if (task === 'narrative') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Génère un rapport d'analyse stochastique pour le tirage ${drawName}. 
                   Métriques: Entropie=${metrics?.entropy}, Hurst=${metrics?.hurst}, Chi2=${metrics?.chiSquare}.
                   Ton: Expert Data Scientist, précis, sans fausses promesses.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              technicalVerdict: { type: Type.STRING },
              riskAssessment: { type: Type.STRING },
              confidence: { type: Type.NUMBER }
            },
            required: ['summary', 'technicalVerdict', 'riskAssessment', 'confidence']
          }
        }
      });
      resultData = JSON.parse(response.text || '{}');

    } else if (task === 'analyze') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview', 
        contents: `Analyse les patterns logiques pour ${drawName}. Historique récent: ${JSON.stringify(history)}.`,
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

    } else if (task === 'simulation-audit') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Audit de simulation financière: ${JSON.stringify(report)}`,
        config: { systemInstruction: "Tu es un auditeur de risque financier. Critique la stratégie." }
      });
      resultData = { audit: response.text };
    }

    return new Response(JSON.stringify(resultData), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
