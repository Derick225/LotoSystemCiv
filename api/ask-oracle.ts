
import { GoogleGenAI, Type, FunctionDeclaration, GenerateContentResponse } from "@google/genai";

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Clé de secours OpenRouter fournie
const OPENROUTER_KEY = "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";

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

/**
 * Fallback vers OpenRouter (Llama 3.3) si Gemini est KO
 */
async function generateWithOpenRouter(params: any) {
    console.log("[Oracle] Bascule sur OpenRouter (Llama 3.3)...");
    
    const messages = [];
    
    // 1. Gestion System Prompt
    if (params.config?.systemInstruction) {
        messages.push({ role: 'system', content: params.config.systemInstruction });
    } else {
        messages.push({ role: 'system', content: "Tu es un expert en analyse de données et statistiques. Tu dois répondre au format JSON strict quand cela est demandé." });
    }

    // 2. Gestion User Content
    let userContent = "";
    if (typeof params.contents === 'string') {
        userContent = params.contents;
    } else if (Array.isArray(params.contents)) {
        userContent = params.contents.map((p: any) => typeof p === 'string' ? p : JSON.stringify(p)).join('\n');
    } else if (params.contents?.parts) {
        userContent = params.contents.parts.map((p: any) => p.text).join('\n');
    } else {
        userContent = JSON.stringify(params.contents);
    }

    if (params.config?.responseMimeType === "application/json") {
        userContent += "\n\nIMPORTANT : Réponds UNIQUEMENT avec un objet JSON valide. Pas de texte avant ou après.";
    }

    messages.push({ role: 'user', content: userContent });

    // 3. Mapping Tools (Function Calling)
    let tools = undefined;
    // Vérification de la structure tools (Gemini utilise un tableau d'objets avec functionDeclarations)
    if (params.config?.tools?.[0]?.functionDeclarations) {
        tools = params.config.tools[0].functionDeclarations.map((fn: any) => ({
            type: "function",
            function: {
                name: fn.name,
                description: fn.description,
                parameters: fn.parameters
            }
        }));
    }

    const body: any = {
        model: "meta-llama/llama-3.3-70b-instruct", 
        messages: messages,
        temperature: params.config?.temperature || 0.7,
        top_p: 0.9
    };

    if (tools) body.tools = tools;
    if (params.config?.responseMimeType === "application/json") {
        body.response_format = { type: "json_object" };
    }

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenRouter Error: ${response.status} - ${err}`);
        }

        const json = await response.json();
        const choice = json.choices[0];
        
        // Reconstruction d'un objet compatible Gemini Response
        const result: any = {
            text: choice.message.content
        };

        if (choice.message.tool_calls) {
            result.functionCalls = choice.message.tool_calls.map((tc: any) => ({
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments)
            }));
        }

        return result;

    } catch (e: any) {
        console.error("OpenRouter Failed:", e.message);
        throw e;
    }
}

async function generateWithFallback(genAI: GoogleGenAI, primaryModel: string, params: any): Promise<any> {
    const fallbackModel = "gemini-3-flash-preview";
    const config: any = { ...params.config };
    
    // Activation du mode Thinking pour les modèles Pro
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
        
        // Premier Fallback : Gemini Flash
        if (primaryModel !== fallbackModel) {
            console.warn(`[Oracle] Fallback vers ${fallbackModel}.`);
            const fallbackConfig = { ...config };
            delete fallbackConfig.thinkingConfig;
            
            try {
                return await genAI.models.generateContent({ 
                    ...params, 
                    model: fallbackModel,
                    config: fallbackConfig
                });
            } catch (e2: any) {
                console.warn(`[Oracle] Echec Flash:`, e2.message);
                // Deuxième Fallback : OpenRouter
                return await generateWithOpenRouter(params);
            }
        } else {
            // Si on était déjà sur Flash
            return await generateWithOpenRouter(params);
        }
    }
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { task, drawName, history, metrics, dataset, modelType, userInput, currentContext } = await req.json();
    
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

        // Gemini retourne .text et .functionCalls
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
