
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
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
    const { task, drawName, history, metrics } = await req.json();

    const apiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("API_KEY");
    if (!apiKey) {
      throw new Error("Clé API GEMINI manquante dans les secrets Supabase.");
    }

    const genAI = new GoogleGenerativeAI({ apiKey });
    let resultData;

    // Modèle Pro pour le raisonnement complexe
    const modelName = "gemini-1.5-flash"; 

    if (task === "analyze") {
      const prompt = `
        Rôle : Tu es le "Nexus Quant Architect", une IA experte en dynamique stochastique et finance quantitative.
        Contexte : Analyse du tirage de loterie "${drawName}" (5/90).
        Données :
        - Historique récent : ${JSON.stringify(history.slice(0, 15))}
        - Régime Fractal (Hurst) : ${metrics?.hurst || "N/A"}
        - Entropie de Shannon : ${metrics?.entropy || "N/A"}
        
        Objectif : Détecter les anomalies statistiques invisibles à l'œil nu. Ne fais pas de prédictions magiques, mais des probabilités conditionnelles basées sur les données.
        
        Format de réponse JSON attendu :
        {
          "logicalAnalysis": "string (Analyse technique détaillée en Markdown. Utilise des termes comme 'Rupture de variance', 'Oscillateur stochastique', 'Convergence'). Sois concis et percutant.",
          "patternType": "string (ex: 'Compression de Volatilité', 'Retour à la Moyenne', 'Momentum Inertiel')",
          "nextSequence": "string (ex: 'Probable rebond sur la zone 40-50')",
          "anomalies": ["string"],
          "strategicAdvice": "string (Conseil de Money Management type Kelly)",
          "suggestedFocus": [number] (liste de 5 entiers vecteurs),
          "intuitionScore": number (0-100, basé sur la clarté du signal)
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
        Rédige un "Flash Report" exécutif pour le tirage ${drawName}.
        Métriques : ${JSON.stringify(metrics)}.
        Style : Cyberpunk Financier, professionnel, urgent.
        
        Format de réponse JSON attendu :
        {
          "summary": "string (1 phrase choc)",
          "technicalVerdict": "string (Analyse de la structure)",
          "riskAssessment": "string (Évaluation de la volatilité)",
          "confidence": number (0-100)
        }
      `;

      const response = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      resultData = JSON.parse(response.text());

    } else if (task === "simulation-audit") {
        const { report } = await req.json();
        const prompt = `
            Agis comme un Auditeur de Risque Algorithmique.
            Analyse ce backtest : ${JSON.stringify(report)}.
            Critique la stratégie (Drawdown, ROI). Si le risque de ruine est élevé, sois sévère.
            Réponse courte et directe JSON : { "audit": "string" }
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
