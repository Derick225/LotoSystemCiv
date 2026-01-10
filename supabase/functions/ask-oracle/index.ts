
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
    const { task, drawName, history, metrics, report, dataset, modelType, config, context, imageBase64 } = await req.json();

    const apiKey = Deno.env.get("API_KEY");
    if (!apiKey) throw new Error("Clé API GEMINI manquante.");

    const genAI = new GoogleGenAI({ apiKey });
    let resultData;

    if (task === "analyze") {
      const modelName = "gemini-3-pro-preview";
      const prompt = `
        Tu es l'Oracle Nexus, une IA spécialisée dans la cryptanalyse de systèmes de loterie (5/90).
        Analyse cette séquence de tirages pour le jeu "${drawName}" : ${JSON.stringify(history)}.
        
        Tâche :
        1. Détecte les anomalies de séquence (répétitions, miroirs, suites, transferts machine).
        2. Identifie 2 à 3 numéros "Attracteurs" qui semblent mathématiquement dus.
        3. Estime un score d'intuition (0-100) sur la lisibilité actuelle du flux.
        
        Réponds EXCLUSIVEMENT en JSON respectant ce schéma précis.
      `;

      const response = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { 
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    logicalAnalysis: { type: Type.STRING, description: "Analyse technique concise avec Markdown (Gras pour les points clés)." },
                    patternType: { type: Type.STRING, description: "Nom du pattern dominant (ex: 'Miroir', 'Suite', 'Repetition')." },
                    nextSequence: { type: Type.STRING, description: "Brève description de la texture attendue." },
                    anomalies: { type: Type.ARRAY, items: { type: Type.STRING } },
                    strategicAdvice: { type: Type.STRING, description: "Conseil de gestion de mise." },
                    suggestedFocus: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: "2 à 5 numéros cibles." },
                    intuitionScore: { type: Type.NUMBER, description: "Confiance 0-100." }
                },
                required: ["logicalAnalysis", "patternType", "suggestedFocus", "intuitionScore", "strategicAdvice"]
            }
        }
      });
      resultData = JSON.parse(response.text || '{}');

    } else if (task === "simulation-audit") {
        const modelName = "gemini-3-flash-preview";
        const prompt = `
            Agis comme un auditeur financier expert en risques stochastiques. 
            Audite ce rapport de simulation Monte Carlo (Loterie 5/90) : 
            ${JSON.stringify(report)}. 
            
            Donne un verdict tranchant en 2 phrases maximum sur la viabilité de la stratégie (Rentable, Dangereuse, ou Neutre).
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

    } else if (task === "narrative") {
      const modelName = "gemini-3-flash-preview";
      const prompt = `
        Rédige un "Flash Report" exécutif pour le tirage ${drawName}.
        Métriques : ${JSON.stringify(metrics)}.
        Historique Récent : ${JSON.stringify(history)}.
        
        Consigne : Adopte un ton d'Analyste Contrarien. Rappelle que les performances passées ne garantissent pas les sorties futures.
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

    } else if (task === "python_kernel") {
        const modelName = "gemini-3-pro-preview";
        const prompt = `
            Tu es un Data Scientist Senior utilisant Python.
            Dataset (5/90 Loto): ${JSON.stringify(dataset.slice(0, 50))}.
            Modèle demandé: ${modelType}.
            
            Tâche:
            1. Écris un script Python (fictif mais réaliste) utilisant pandas/sklearn pour prédire les 5 prochains numéros.
            2. Simule l'exécution de ce script et génère les logs de sortie (stdout).
            3. Extrais les "Findings" (Résultats clés).
            
            Le but est de trouver des corrélations non-linéaires invisibles à l'oeil nu.
        `;

        const response = await genAI.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        script: { type: Type.STRING, description: "Le code Python utilisé." },
                        stdout: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Les logs d'exécution simulés (training steps, loss, etc.)." },
                        findings: {
                            type: Type.OBJECT,
                            properties: {
                                method: { type: Type.STRING },
                                result_vector: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                                confidence_score: { type: Type.NUMBER },
                                p_value: { type: Type.NUMBER }
                            },
                            required: ["result_vector", "confidence_score"]
                        },
                        insight: { type: Type.STRING, description: "Conclusion humaine en une phrase." }
                    },
                    required: ["script", "stdout", "findings", "insight"]
                }
            }
        });
        resultData = JSON.parse(response.text || '{}');

    } else if (task === "vision-analysis") {
        const modelName = "gemini-2.5-flash-image";
        const response = await genAI.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
                    { text: `Analyse cette image dans le contexte suivant : ${context}. Donne une interprétation technique concise.` }
                ]
            }
        });
        resultData = { analysis: response.text };
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
