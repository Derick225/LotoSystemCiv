
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI, Type } from "@google/genai";

// Déclaration pour satisfaire le compilateur TypeScript
declare const Deno: any;
declare const process: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { task, drawName, history, metrics, report } = await req.json();
    
    // Utilisation stricte de process.env.API_KEY selon les directives
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let resultData;

    if (task === 'narrative') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Génère un rapport de synthèse pour le tirage ${drawName}. Metrics: Entropy=${metrics?.entropy}, Hurst=${metrics?.hurst}.`,
        config: {
          systemInstruction: "Tu es l'Oracle Nexus. Ton ton est technique et souverain. Analyse sans promettre de gain.",
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
        contents: `Analyse logique du flux ${drawName}. Data: ${JSON.stringify(history)}.`,
        config: {
          systemInstruction: "Expert cryptographe en systèmes stochastiques. Isole les vecteurs de convergence.",
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
        contents: `Audit financier Nexus Simulation: ${JSON.stringify(report)}`,
        config: { systemInstruction: "Tu es un gestionnaire de risque quantitatif. Critique la simulation." }
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
