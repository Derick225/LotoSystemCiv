
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@0.1.1";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { task, drawName, history, metrics, report, imageBase64, context } = await req.json();
    
    const apiKey = Deno.env.get('API_KEY');
    if (!apiKey) throw new Error("API_KEY manquante dans les secrets Supabase");
    
    const ai = new GoogleGenAI({ apiKey });
    let resultData;

    // --- Tâche 1 : Rapport Narratif (IntelligenceTab) ---
    if (task === 'narrative') {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: {
            parts: [
                { text: `Génère un rapport d'analyse stochastique court et percutant pour le tirage ${drawName}.
                   Métriques Clés: Entropie=${metrics?.entropy}, Hurst=${metrics?.hurst}, Chi2=${metrics?.chiSquare}, Régime=${metrics?.regime}.
                   Ta mission : Interpréter ces métriques pour un joueur expert.
                   Format JSON attendu.` }
            ]
        },
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

    // --- Tâche 2 : Analyse Logique Profonde (IntelligenceTab / PythonAnalyst) ---
    } else if (task === 'analyze') {
      // Pour une analyse complexe, on utilise le modèle Pro
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-pro', 
        contents: {
            parts: [
                { text: `Analyse les patterns logiques pour le tirage ${drawName}.
                   Historique récent (JSON): ${JSON.stringify(history)}.
                   Identifie les anomalies, les séquences et propose une stratégie.
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

    // --- Tâche 3 : Audit de Simulation (SimulationTab) ---
    } else if (task === 'simulation-audit') {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: {
            parts: [
                { text: `Tu es un auditeur de risque financier. Critique cette simulation de stratégie de loterie.
                   Données du rapport : ${JSON.stringify(report)}.
                   Donne un avis franc (maximum 2 phrases) sur la viabilité.` }
            ]
        }
      });
      resultData = { audit: response.text };

    // --- Tâche 4 : Vision (Analyse de graphique ou autre) ---
    } else if (task === 'vision-analysis') {
       const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash', // Modèle multimodal
        contents: {
            parts: [
                { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
                { text: `Analyse cette image dans le contexte suivant : ${context}. Sois bref et technique.` }
            ]
        }
      });
      resultData = { analysis: response.text };
    }

    return new Response(JSON.stringify(resultData), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
