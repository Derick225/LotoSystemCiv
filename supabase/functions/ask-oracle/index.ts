
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.18.0";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Gestion du preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { task, drawName, history, metrics } = await req.json();

    // Récupération sécurisée de la clé API
    const apiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("API_KEY");
    if (!apiKey) {
      throw new Error("Clé API GEMINI manquante dans les secrets Supabase.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    let resultData;

    // Configuration commune du modèle (JSON Mode)
    const modelConfig = {
      model: "gemini-1.5-flash", // Modèle rapide et stable pour Deno
      generationConfig: {
        responseMimeType: "application/json",
      },
    };

    const model = genAI.getGenerativeModel(modelConfig);

    if (task === "analyze") {
      const prompt = `
        Tu es un expert en analyse stochastique pour le tirage de loterie ${drawName} (5/90).
        Historique récent : ${JSON.stringify(history)}.
        
        Tâche : Analyse les tendances, fréquences, écarts et la loi de Benford.
        
        Format de réponse JSON attendu :
        {
          "logicalAnalysis": "string (analyse détaillée en markdown)",
          "patternType": "string (ex: Série Chaude, Retour à la moyenne)",
          "nextSequence": "string (ex: Alternance Pair/Impair)",
          "anomalies": ["string"],
          "strategicAdvice": "string",
          "suggestedFocus": [number] (liste de 5 entiers),
          "intuitionScore": number (0-100)
        }
      `;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      resultData = JSON.parse(text);

    } else if (task === "narrative") {
      const prompt = `
        Rédige un rapport narratif court et percutant pour le tirage ${drawName}.
        Métriques contextuelles : ${JSON.stringify(metrics)}.
        
        Format de réponse JSON attendu :
        {
          "summary": "string",
          "technicalVerdict": "string",
          "riskAssessment": "string",
          "confidence": number (0-100)
        }
      `;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      resultData = JSON.parse(text);

    } else if (task === "simulation-audit") {
        const { report } = await req.json(); // Récupération spécifique pour ce task
        const prompt = `
            Agis comme un auditeur financier algorithmique.
            Analyse ce rapport de simulation de trading : ${JSON.stringify(report)}.
            Donne un avis critique sur la viabilité de la stratégie (Profitable, Risquée, Ruine probable).
            Réponds en un paragraphe court sous la clé "audit".
            Format JSON : { "audit": "string" }
        `;
        const result = await model.generateContent(prompt);
        resultData = JSON.parse(result.response.text());
        
    } else {
      throw new Error(`Tâche inconnue : ${task}`);
    }

    return new Response(JSON.stringify(resultData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Erreur Edge Function:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Erreur interne de l'Oracle",
        details: error.toString() 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});