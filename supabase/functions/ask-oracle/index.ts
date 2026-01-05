
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI } from "https://esm.sh/@google/genai@1.34.0";

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

    const apiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("API_KEY");
    if (!apiKey) {
      throw new Error("Clé API GEMINI manquante dans les secrets Supabase.");
    }

    const genAI = new GoogleGenAI({ apiKey });
    let resultData;
    const modelName = "gemini-1.5-flash"; 

    if (task === "analyze") {
      const prompt = `
        Rôle : Tu es le "Nexus Quant Architect", une IA experte en dynamique stochastique appliquée aux séries temporelles de loto (5/90).
        Contexte : Tirage "${drawName}".
        
        Données d'entrée (25 derniers tirages): 
        ${JSON.stringify(history.slice(0, 25))}
        
        Métriques Clés (Si dispo):
        - Exposant de Hurst: ${metrics?.hurst || "Non fourni"} (Rappel: >0.5 = Tendance, <0.5 = Retour moyenne)
        - Entropie Shannon: ${metrics?.entropy || "Non fourni"}
        
        Tâche :
        1. Identifie la "Signature Temporelle" actuelle (Est-ce que les numéros se répètent ou est-ce le chaos total ?).
        2. Détecte les "Zones Mortes" (Dizaines qui ne sortent pas depuis longtemps).
        3. Suggère 5 numéros ("Vecteurs") basés sur la logique détectée.
        4. Donne un score d'intuition (0-100) sur la fiabilité de ce pattern.

        Réponds UNIQUEMENT avec ce JSON strict :
        {
          "logicalAnalysis": "string (Markdown concis, max 300 mots. Parle en expert : mentionne 'écart-type', 'rupture de symétrie', 'attracteurs'. Sois mystérieux mais précis.)",
          "patternType": "string (ex: 'Compression de Volatilité', 'Expansion Fractale', 'Retour à la Moyenne')",
          "nextSequence": "string (ex: 'Focus sur les termin 3 et 7')",
          "anomalies": ["string (Liste 2-3 anomalies statistiques détectées)"],
          "strategicAdvice": "string (Conseil de mise : Kelly, Martingale, ou Prudence)",
          "suggestedFocus": [number] (Tableau de 5 entiers),
          "intuitionScore": number
        }
      `;

      const response = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      resultData = JSON.parse(response.text || '{}');

    } else if (task === "narrative") {
      const prompt = `
        Rédige un "Flash Report" pour le tirage ${drawName}.
        Métriques contextuelles : ${JSON.stringify(metrics)}.
        Historique récent : ${JSON.stringify(history)}.
        
        Ton style doit être celui d'un analyste financier de haut vol qui parle de "Marché" et de "Liquidité" pour les numéros.
        
        Format JSON :
        {
          "summary": "string",
          "technicalVerdict": "string (ex: 'Signal Achat Fort', 'Marché Bearish')",
          "riskAssessment": "string",
          "confidence": number
        }
      `;

      const response = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      resultData = JSON.parse(response.text || '{}');

    } else if (task === "simulation-audit") {
        const prompt = `
            Analyse ce rapport de backtesting (Monte Carlo) : ${JSON.stringify(report)}.
            Critique le risque de ruine (Bankruptcy) et le Drawdown.
            Donne un avis tranché : Est-ce une stratégie viable ou suicidaire ?
            Réponse JSON : { "audit": "string" }
        `;
        const response = await genAI.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        resultData = JSON.parse(response.text || '{}');
        
    } else if (task === "vision-analysis") {
        // Handle vision task if passed to this function or separate
        // Based on provided code, vision tasks might be handled here or in separate functions
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
