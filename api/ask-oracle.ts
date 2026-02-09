import { GoogleGenAI, Type, FunctionDeclaration, GenerateContentResponse } from "@google/genai";

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

async function generateWithFallback(genAI: GoogleGenAI, primaryModel: string, params: any): Promise<GenerateContentResponse> {
    const fallbackModel = "gemini-3-flash-preview";
    const config: any = { ...params.config };
    
    // Activation du mode Thinking pour les modèles Pro (Raisonnement profond)
    if (primaryModel.includes('pro')) {
        config.thinkingConfig = { thinkingBudget: 4096 }; 
    }

    try {
        console.log(`[Oracle] Execution sur ${primaryModel}...`);
        return await genAI.models.generateContent({ 
            ...params, 
            model: primaryModel,
            config 
        });
    } catch (e: any) {
        console.warn(`[Oracle] Echec sur ${primaryModel}:`, e.message);
        const isQuotaError = e.status === 429 || 
                             (e.message && (e.message.includes('429') || e.message.includes('quota') || e.message.includes('resource_exhausted')));
        
        if (isQuotaError && primaryModel !== fallbackModel) {
            console.warn(`[Oracle] Fallback vers ${fallbackModel}.`);
            // On retire thinkingConfig pour le modèle Flash s'il ne le supporte pas ou pour économiser
            const fallbackConfig = { ...config };
            delete fallbackConfig.thinkingConfig;
            
            return await genAI.models.generateContent({ 
                ...params, 
                model: fallbackModel,
                config: fallbackConfig
            });
        }
        throw e;
    }
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { task, drawName, history, metrics, dataset, modelType, userInput, currentContext } = await req.json();
    
    // Sécurité: Utilisation exclusive de process.env.API_KEY
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API_KEY manquante. Vérifiez la configuration serveur.");

    const genAI = new GoogleGenAI({ apiKey });

    // --- TÂCHE 1 : CHAT TACTIQUE ---
    if (task === "chat") {
        const systemPrompt = `Tu es l'Agent Tactique Nexus Apex v14.0, une IA financière experte en loterie stochastique.
        
        CONTEXTE ACTUEL :
        - Tirage Cible : ${drawName}
        - Régime de Jeu : ${currentContext?.regime || 'Inconnu'} (Hurst Index)
        - Dernière Prédiction : ${JSON.stringify(currentContext?.lastPrediction || [])}
        - Capital (Bankroll) : ${currentContext?.bankroll ? currentContext.bankroll + ' FCFA' : 'Non défini'}

        DIRECTIVES :
        1. Analyse la demande de l'opérateur avec froideur et précision mathématique.
        2. Si le capital est faible (< 5000 FCFA), impose une stratégie défensive (Kelly Fractionnel).
        3. UTILISE LES OUTILS (Function Calling) pour piloter l'interface si l'utilisateur demande une action (analyse, audit, ticket).
        4. Ne donne jamais de certitudes ("Garantie 100%"), parle en probabilités et vecteurs de risque.
        5. Sois concis. Tu es un outil professionnel.`;

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

    // --- TÂCHE 2 : ANALYSE PROFONDE (INTELLIGENCE TAB) ---
    } else if (task === "analyze") {
      const prompt = `Rôle: Oracle Nexus Platinum. Analyse Stochastique pour "${drawName}".
      
      DONNÉES D'ENTRÉE :
      - Historique Récent : ${JSON.stringify(history.slice(0, 10))}
      - Métriques HPC : ${JSON.stringify(metrics)} (Entropie, Hurst, Chi2)
      
      MISSION :
      Génère un rapport d'intelligence stratégique structuré. Détecte les anomalies de symétrie et les ruptures de séquence.
      
      FORMAT DE SORTIE (JSON STRICT) :
      {
        "logicalAnalysis": "Analyse textuelle détaillée (Markdown autorisé)",
        "patternType": "Nom du pattern (ex: 'Rupture de Tendance', 'Cycle Harmonique')",
        "nextSequence": "Description courte de la projection",
        "anomalies": ["Liste", "des", "anomalies"],
        "strategicAdvice": "Conseil de mise concret",
        "suggestedFocus": [12, 45, ...], // 5 vecteurs prioritaires
        "intuitionScore": 85 // Confiance 0-100
      }`;
      
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
      return new Response(JSON.stringify(JSON.parse(cleanJson(response.text || '{}'))), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // --- TÂCHE 3 : KERNEL PYTHON (SIMULATION DATA SCIENCE) ---
    } else if (task === "python_kernel") {
        const prompt = `Agis comme un environnement Jupyter Notebook Senior Data Science.
        Tâche : Générer une analyse prédictive avancée en Python pour une série temporelle de loto.
        Modèle : ${modelType} (ex: XGBoost, LSTM, Poisson).
        Données : ${JSON.stringify(dataset.slice(0, 20))}.
        
        Génère :
        1. Le code Python (utilisant pandas, numpy, scipy, sklearn) qui aurait produit l'analyse.
        2. La sortie standard simulée (stdout) de ce script.
        3. Les résultats structurés (vecteurs trouvés).
        
        Format JSON strict.`;

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
        return new Response(JSON.stringify(JSON.parse(cleanJson(response.text || '{}'))), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // --- TÂCHE 4 : GÉNÉRATION NARRATIVE ---
    else if (task === "narrative") {
        const prompt = `Rédige un "Bulletin Météo Stochastique" pour le tirage "${drawName}".
        Métriques : ${JSON.stringify(metrics)}.
        Ton : Expert, concis, style "Finance de marché".`;
        
        const response = await generateWithFallback(genAI, "gemini-3-flash-preview", {
             contents: prompt,
             config: {
                 responseMimeType: "application/json",
                 responseSchema: {
                     type: Type.OBJECT,
                     properties: {
                         summary: { type: Type.STRING },
                         technicalVerdict: { type: Type.STRING },
                         riskAssessment: { type: Type.STRING }
                     }
                 }
             }
        });
        return new Response(JSON.stringify(JSON.parse(cleanJson(response.text || '{}'))), {
             headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ error: "Task not found" }), { status: 404, headers: corsHeaders });

  } catch (error: any) {
    console.error("[Oracle API Error]", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}