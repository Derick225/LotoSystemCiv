
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.34.0";

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
        Rôle : Tu es le "Nexus Quant Architect", une IA de niveau Doctorat experte en dynamique stochastique et théorie du chaos appliquée aux séries temporelles de loterie (5/90).
        Ta mission : Déconstruire la structure du tirage "${drawName}" pour identifier les biais mécaniques ou statistiques invisibles.
        
        Contexte Technique :
        - Tirage : ${drawName}
        - Métriques Avancées : Hurst=${metrics?.hurst || "?"}, Entropie=${metrics?.entropy || "?"}.
        
        Données d'entrée (Séquence Récente): 
        ${JSON.stringify(history.slice(0, 25))}
        
        Instructions :
        1. Analyse la "Signature Temporelle" : Identifie si le régime est Persistant (Tendance) ou Anti-Persistant (Rebond).
        2. Détecte les "Vecteurs de Rupture" : Numéros qui brisent la linéarité actuelle.
        3. Propose 5 "Vecteurs Cibles" (Numéros) basés sur une convergence algorithmique stricte.
        4. Évalue ton "Intuition Score" (0-100) basé sur la clarté du signal.
      `;

      const response = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { 
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    logicalAnalysis: { type: Type.STRING, description: "Analyse technique détaillée style 'Quant Hedge Fund'." },
                    patternType: { type: Type.STRING, description: "Nom du pattern identifié (ex: 'Fibonacci Retracement', 'Poisson Decay')." },
                    nextSequence: { type: Type.STRING, description: "Description brève de la séquence attendue." },
                    anomalies: { type: Type.ARRAY, items: { type: Type.STRING } },
                    strategicAdvice: { type: Type.STRING, description: "Conseil de mise (Kelly, Martingale, Flat)." },
                    suggestedFocus: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                    intuitionScore: { type: Type.NUMBER }
                },
                required: ["logicalAnalysis", "patternType", "suggestedFocus", "intuitionScore", "strategicAdvice"]
            }
        }
      });
      resultData = JSON.parse(response.text || '{}');

    } else if (task === "narrative") {
      const prompt = `
        Rédige un "Flash Report" exécutif pour le tirage ${drawName}.
        Métriques contextuelles : ${JSON.stringify(metrics)}.
        Historique récent : ${JSON.stringify(history)}.
        Ton : Analyste Financier Senior. Vocabulaire : "Liquidité", "Volatilité", "Support", "Résistance", "Correction Technique".
        Objectif : Donner confiance au joueur avec une rationalisation pseudo-scientifique robuste.
      `;

      const response = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { 
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    summary: { type: Type.STRING },
                    technicalVerdict: { type: Type.STRING },
                    riskAssessment: { type: Type.STRING },
                    confidence: { type: Type.NUMBER }
                },
                required: ["summary", "technicalVerdict", "confidence"]
            }
        }
      });
      resultData = JSON.parse(response.text || '{}');

    } else if (task === "simulation-audit") {
        const prompt = `
            Analyse ce rapport de backtesting (Monte Carlo) : ${JSON.stringify(report)}.
            Critique le risque de ruine (Bankruptcy) et le Drawdown.
            Donne un avis tranché : Est-ce une stratégie viable ou suicidaire ?
        `;
        const response = await genAI.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        audit: { type: Type.STRING }
                    },
                    required: ["audit"]
                }
            }
        });
        resultData = JSON.parse(response.text || '{}');
        
    } else if (task === "vision-analysis") {
        // Placeholder for future vision tasks
        resultData = { analysis: "Module Vision non activé sur ce endpoint." };
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
