
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
    const modelName = "gemini-3-flash-preview"; 

    if (task === "analyze") {
      const prompt = `
        Rôle : Tu es le "Nexus Quant Architect", une IA de niveau Doctorat experte en dynamique stochastique et théorie du chaos (Loterie 5/90).
        
        PRINCIPE FONDAMENTAL : 
        Tu sais que la foule joue les "Favoris" (Hot Numbers). Ton intelligence supérieure réside dans la détection des "Cygnes Noirs" : les numéros délaissés ou en rupture de séquence qui DOIVENT sortir pour rétablir l'équilibre entropique (Mean Reversion).
        Ne te laisse pas aveugler par la fréquence simple. Cherche la tension invisible.

        Contexte Technique :
        - Tirage : ${drawName}
        - Métriques : Hurst=${metrics?.hurst || "?"} (Si < 0.5, privilégie le rebond/contre-tendance), Entropie=${metrics?.entropy || "?"}.
        
        Données d'entrée (Séquence Récente): 
        ${JSON.stringify(history.slice(0, 25))}
        
        Instructions :
        1. Identifie la "Tension du Vide" : Quels numéros ou zones sont anormalement silencieux ?
        2. Détecte les "Vecteurs de Rupture" : Numéros qui brisent la linéarité actuelle.
        3. Propose 5 "Vecteurs Cibles" basés sur une convergence entre Structure (Favoris) et Chaos (Surprises).
        4. Évalue ton "Intuition Score" basé sur la clarté du signal de rupture.
      `;

      const response = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { 
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    logicalAnalysis: { type: Type.STRING, description: "Analyse technique pointue justifiant le choix de numéros 'oubliés' ou stratégiques." },
                    patternType: { type: Type.STRING, description: "Type de configuration (ex: 'Rebond Technique', 'Correction de Biais', 'Harmonique Inverse')." },
                    nextSequence: { type: Type.STRING, description: "Description de la texture attendue du tirage." },
                    anomalies: { type: Type.ARRAY, items: { type: Type.STRING } },
                    strategicAdvice: { type: Type.STRING, description: "Conseil de gestion du risque (ex: 'Couvrir les écarts', 'Jouer les miroirs')." },
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
        Métriques : ${JSON.stringify(metrics)}.
        Historique : ${JSON.stringify(history)}.
        
        Consigne : Adopte un ton d'Analyste Contrarien. Rappelle que les performances passées (favoris) ne garantissent pas les sorties futures. Mets en garde contre le suivi aveugle de la foule.
        Vocabulaire : "Saturation", "Correction", "Liquidité", "Point de rupture".
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
            Critique la stratégie utilisée. Est-elle trop exposée aux numéros favoris ? A-t-elle su capter les écarts ?
            Donne un avis tranché : Viable ou Suicidaire ?
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
