
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/genai@1.34.0";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { task, drawName, history, metrics, report } = await req.json();

    // Utilisez 'API_KEY' ou 'GEMINI_API_KEY' défini dans les Secrets Supabase
    const apiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("API_KEY");
    if (!apiKey) {
      throw new Error("Clé API GEMINI manquante dans les secrets Supabase.");
    }

    const genAI = new GoogleGenerativeAI({ apiKey });
    let resultData;
    const modelName = "gemini-1.5-flash"; 

    if (task === "analyze") {
      const prompt = `
        Rôle : Tu es le "Nexus Quant Architect", une IA experte en dynamique stochastique.
        Contexte : Tirage "${drawName}" (5/90).
        Données :
        - Historique : ${JSON.stringify(history.slice(0, 15))}
        - Régime : ${metrics?.hurst || "N/A"}
        - Entropie : ${metrics?.entropy || "N/A"}
        
        Format de réponse JSON attendu :
        {
          "logicalAnalysis": "string (Markdown concis)",
          "patternType": "string",
          "nextSequence": "string",
          "anomalies": ["string"],
          "strategicAdvice": "string",
          "suggestedFocus": [number] (5 entiers),
          "intuitionScore": number (0-100)
        }
      `;

      const response = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      resultData = JSON.parse(response.text());

    } else if (task === "narrative") {
      const prompt = `
        Rédige un "Flash Report" pour le tirage ${drawName}.
        Métriques : ${JSON.stringify(metrics)}.
        
        Format JSON :
        {
          "summary": "string",
          "technicalVerdict": "string",
          "riskAssessment": "string",
          "confidence": number
        }
      `;

      const response = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      resultData = JSON.parse(response.text());

    } else if (task === "simulation-audit") {
        const prompt = `
            Analyse ce backtest : ${JSON.stringify(report)}.
            Critique le risque.
            Réponse JSON : { "audit": "string" }
        `;
        const response = await genAI.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        resultData = JSON.parse(response.text());
        
    } else {
      throw new Error(`Tâche inconnue : ${task}`);
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
