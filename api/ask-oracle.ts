
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function cleanJson(text: string) {
    if (!text) return '{}';
    return text.replace(/```json\n?|\n?```/g, '').trim();
}

/**
 * Fallback vers un modèle plus léger si le Pro échoue ou pour des tâches simples
 */
async function generateWithFallback(genAI: GoogleGenAI, primaryModel: string, params: any): Promise<any> {
    const fallbackModel = "gemini-3-flash-preview";
    const config: any = { ...params.config };
    
    // Activation du mode Thinking pour les modèles Pro (Calcul intensif)
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
        
        if (primaryModel !== fallbackModel) {
            console.warn(`[Oracle] Fallback vers ${fallbackModel}.`);
            // On retire thinkingConfig pour Flash
            const fallbackConfig = { ...config };
            delete fallbackConfig.thinkingConfig;
            
            try {
                return await genAI.models.generateContent({ 
                    ...params, 
                    model: fallbackModel,
                    config: fallbackConfig
                });
            } catch (e2: any) {
                throw e2; // Si Flash échoue aussi, on remonte l'erreur
            }
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
    let resultData;

    // --- TÂCHE 1 : CHAT TACTIQUE ---
    if (task === "chat") {
        const systemPrompt = `
        Tu es l'Agent Tactique Nexus Apex v14.0, une IA financière experte en analyse stochastique pour les loteries (5/90).
        
        CONTEXTE ACTUEL :
        - Tirage Cible : ${currentContext?.draw || drawName}
        - Capital (Bankroll) : ${currentContext?.bankroll}
        - Stratégie Active : ${currentContext?.strategy}
        - Poids dominants : ${currentContext?.weights}
        - Météo Fractale : ${currentContext?.regime}
        - Dernière Prédiction : ${currentContext?.prediction}

        DIRECTIVES :
        1. Sois extrêmement technique, froid et précis (Style Cyberpunk/Trader).
        2. Utilise des termes comme : "Variance", "Entropie", "Hurst", "Vecteur", "Convergence".
        3. Si l'utilisateur demande un conseil de mise, base-toi sur le critère de Kelly (fractionnel).
        4. Ne donne jamais de certitude absolue ("Gain garanti"), parle toujours en "Probabilités" et "Espérance mathématique".
        5. Sois concis. Pas de blabla. Droit au but.
        `;

        const response = await generateWithFallback(genAI, "gemini-3-pro-preview", {
            contents: userInput,
            config: { 
                systemInstruction: systemPrompt,
            }
        });
        resultData = { response: response.text };

    // --- TÂCHE 2 : OPTIMISATION DE POIDS (DATA SCIENTIST) ---
    } else if (task === "optimize_weights") {
        const prompt = `Agis comme un Data Scientist Expert en optimisation d'hyperparamètres pour un modèle stochastique de loterie (5/90).
        
        CONTEXTE :
        Jeu : ${drawName}.
        Historique Récent (20 derniers tirages) : ${JSON.stringify(history)}.
        
        ANALYSE REQUISE :
        1. Détermine le régime actuel du flux (Répétitif ? Chaotique ? Écart ?).
        2. Suggère des poids (0.0 à 1.0) pour chaque algorithme. La somme doit être approximativement 1.0.
        
        ALGORITHMES DISPONIBLES :
        - frequency: Tendance lourde (Numéros chauds).
        - gap: Chasse aux écarts (Numéros froids).
        - spectral: Cycles périodiques (Ondes).
        - markov: Suites logiques (T-1 -> T).
        - momentum: Vélocité court terme.
        - equilibrium: Retour à la moyenne.
        - anti_consensus: Jouer contre la foule (Chaos).
        - spatial: Géométrie de la grille.
        
        SORTIE : JSON STRICT (AlgoWeights).`;

        const response = await generateWithFallback(genAI, "gemini-3-pro-preview", {
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        frequency: { type: Type.NUMBER },
                        gap: { type: Type.NUMBER },
                        spectral: { type: Type.NUMBER },
                        markov: { type: Type.NUMBER },
                        momentum: { type: Type.NUMBER },
                        equilibrium: { type: Type.NUMBER },
                        anti_consensus: { type: Type.NUMBER },
                        spatial: { type: Type.NUMBER }
                    },
                    required: ["frequency", "gap", "markov"]
                }
            }
        });
        resultData = JSON.parse(cleanJson(response.text || '{}'));

    // --- AUTRES TÂCHES ---
    } else if (task === "analyze") {
         const prompt = `Agis comme l'Agent Tactique Nexus Apex v14.0, une IA experte en analyse stochastique et fractale pour la loterie (5/90).
         
         CONTEXTE :
         Jeu : "${drawName}".
         Historique Récent (10 derniers tirages) : ${JSON.stringify(history.slice(0,10))}.
         Métriques actuelles : ${JSON.stringify(metrics || {})}.
         
         ANALYSE REQUISE :
         Génère une analyse stochastique profonde et structurée. Utilise un ton froid, technique, cyberpunk et probabiliste.
         
         FORMAT DE SORTIE ATTENDU (JSON STRICT) :
         {
             "trend": "BULLISH" | "BEARISH" | "CHAOTIC" | "STABLE",
             "regime": "Description du régime fractal actuel (ex: Haute Entropie, Retour à la moyenne)",
             "hotNumbers": [array de 3 à 5 numéros chauds],
             "coldNumbers": [array de 3 à 5 numéros froids en écart],
             "recommendedStrategy": "Nom de la stratégie recommandée (ex: Chasse aux Écarts, Suivi de Tendance)",
             "confidenceScore": nombre entre 0 et 100,
             "analysisText": "Texte détaillé de l'analyse (max 4 phrases, style très technique)",
             "warnings": ["Avertissement 1", "Avertissement 2"]
         }`;
         
         const response = await generateWithFallback(genAI, "gemini-3-pro-preview", {
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        trend: { type: Type.STRING },
                        regime: { type: Type.STRING },
                        hotNumbers: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                        coldNumbers: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                        recommendedStrategy: { type: Type.STRING },
                        confidenceScore: { type: Type.NUMBER },
                        analysisText: { type: Type.STRING },
                        warnings: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["trend", "regime", "hotNumbers", "coldNumbers", "recommendedStrategy", "confidenceScore", "analysisText"]
                }
            } 
         });
         resultData = JSON.parse(cleanJson(response.text || '{}'));
    } 
    // ... Ajouter les autres handlers (narrative, python_kernel) ici si nécessaire ...

    return new Response(JSON.stringify(resultData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[Oracle API Error]", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
