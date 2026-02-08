
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Définition des outils pour l'Agent de Décision Actionnable
const toolDeclarations: FunctionDeclaration[] = [
    {
        name: "analyzeDrawDynamics",
        description: "Analyse en profondeur les dynamiques d'un tirage spécifique (volatilité, cycles, régime). Ouvre le module Signaux.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                drawName: { type: Type.STRING, description: "Nom du tirage" },
                depth: { type: Type.INTEGER, description: "Nombre de tirages passés à analyser (max 50)" }
            },
            required: ["drawName"]
        }
    },
    {
        name: "requestTicketSynthesis",
        description: "Génère des combinaisons optimisées (tickets) basées sur des critères spécifiques. Ouvre le module Architecte.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                drawName: { type: Type.STRING, description: "Nom du tirage" },
                ticketCount: { type: Type.INTEGER, description: "Nombre de tickets à générer (1-5)" },
                riskProfile: { type: Type.STRING, enum: ["PRUDENT", "BALANCED", "CHAOS"], description: "Profil de risque" }
            },
            required: ["drawName", "ticketCount"]
        }
    },
    {
        name: "openForensicAudit",
        description: "Ouvre le module Forensic pour une analyse balistique et stochastique post-tirage.",
        parameters: {
            type: Type.OBJECT,
            properties: {},
        }
    },
    {
        name: "showHistory",
        description: "Affiche le registre historique global (Flux) des tirages.",
        parameters: {
            type: Type.OBJECT,
            properties: {},
        }
    }
];

function cleanJson(text: string) {
    if (!text) return '{}';
    return text.replace(/```json\n?|\n?```/g, '').trim();
}

async function generateWithFallback(genAI: GoogleGenAI, primaryModel: string, params: any) {
    const fallbackModel = "gemini-3-flash-preview";
    const config: any = { ...params.config };
    
    if (primaryModel.includes('pro')) {
        config.thinkingConfig = { thinkingBudget: 4000 }; 
    }

    try {
        return await genAI.models.generateContent({ 
            ...params, 
            model: primaryModel,
            config 
        });
    } catch (e: any) {
        const isQuotaError = e.status === 429 || 
                             (e.message && (e.message.includes('429') || e.message.includes('quota')));
        
        if (isQuotaError && primaryModel !== fallbackModel) {
            console.warn(`Quota exceeded for ${primaryModel}. Switching to fallback.`);
            return await genAI.models.generateContent({ ...params, model: fallbackModel });
        }
        throw e;
    }
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { task, drawName, history, metrics, dataset, modelType, userInput, currentContext } = await req.json();
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) throw new Error("API_KEY manquante.");

    const genAI = new GoogleGenAI({ apiKey });

    if (task === "chat") {
        const systemPrompt = `Tu es l'Agent Tactique Nexus Apex v13.0, l'intelligence suprême de LotoPro Platinum.
        Ton rôle est d'assister les utilisateurs dans leur prise de décision décisionnelle.
        Contexte actuel pour ${drawName} :
        - Régime détecté : ${currentContext?.regime || 'Inconnu'}
        - Prédiction IA : ${JSON.stringify(currentContext?.lastPrediction)}
        - Capital utilisateur (Bankroll) : ${currentContext?.bankroll ? currentContext.bankroll + ' FCFA' : 'Non spécifié'}
        
        Tu as accès à des outils pour piloter l'interface (Forensic, Architecte, Historique, Signaux).
        Si l'utilisateur demande une analyse, une génération de ticket ou un audit, UTILISE LES OUTILS fournis (Function Calling).
        Si le capital est bas (< 5000 FCFA), conseille impérativement la prudence et des mises réduites.
        Ton ton est industriel, précis et ultra-professionnel. Pas de blabla inutile.`;

        const response = await generateWithFallback(genAI, "gemini-3-pro-preview", {
            contents: userInput,
            config: { 
                systemInstruction: systemPrompt,
                tools: [{ functionDeclarations: toolDeclarations }]
            }
        });

        // Gemini peut retourner du texte OU des appels de fonctions
        return new Response(JSON.stringify({ 
            response: response.text,
            functionCalls: response.functionCalls
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } else if (task === "analyze") {
      const prompt = `Rôle: Oracle Nexus Platinum. Analyse du tirage "${drawName}". Historique: ${JSON.stringify(history.slice(0, 15))}. Effectue une analyse stochastique profonde incluant l'entropie spectrale.`;
      
      const response = await generateWithFallback(genAI, "gemini-3-pro-preview", {
        contents: prompt,
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
                required: ["logicalAnalysis", "suggestedFocus", "intuitionScore"]
            }
        }
      });
      return new Response(JSON.stringify(JSON.parse(cleanJson(response.text) || '{}')), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (task === "python_kernel") {
        const prompt = `Simule un script Python scientifique (${modelType}) sur : ${JSON.stringify(dataset.slice(0, 40))}.`;
        const response = await generateWithFallback(genAI, "gemini-3-pro-preview", {
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        script: { type: Type.STRING },
                        stdout: { type: Type.ARRAY, items: { type: Type.STRING } },
                        findings: {
                            type: Type.OBJECT,
                            properties: {
                                result_vector: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                                confidence_score: { type: Type.NUMBER },
                                p_value: { type: Type.NUMBER }
                            }
                        },
                        insight: { type: Type.STRING }
                    },
                    required: ["script", "stdout", "findings", "insight"]
                }
            }
        });
        return new Response(JSON.stringify(JSON.parse(cleanJson(response.text) || '{}')), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ error: "Task not found" }), { status: 404, headers: corsHeaders });

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
