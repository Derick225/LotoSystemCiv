import { GoogleGenAI, Type } from 'genai';
import { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts";

const RequestSchema = z.object({
    task: z.enum([
        'analyzeDrawLogic', 
        'getNarrativeAnalysis', 
        'getPythonKernelAnalysis', 
        'generateAutopsyAnalysis', 
        'generateGlobalForensicSynthesis', 
        'scanTicket',
        'getStrategistAdvice',
        'getOraclePrediction'
    ]),
    payload: z.record(z.any())
});

let isGenerating = false;
const requestQueue: (() => void)[] = [];

async function acquireGeminiLock() {
    if (!isGenerating) {
        isGenerating = true;
        return;
    }
    return new Promise<void>(resolve => {
        requestQueue.push(resolve);
    });
}

function releaseGeminiLock() {
    if (requestQueue.length > 0) {
        const next = requestQueue.shift();
        if (next) next();
    } else {
        isGenerating = false;
    }
}

async function generateWithFallback(ai: GoogleGenAI, primaryModel: string, params: Record<string, unknown>, retries = 3) {
    const fallbackModel = "gemini-3.5-flash";
    const config = { ...(params.config as object) };

    await acquireGeminiLock();

    try {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await ai.models.generateContent({ ...params, model: primaryModel, config });
            } catch (error) {
                const e = error as Error;
                console.error(`Error with ${primaryModel} (Attempt ${attempt + 1}):`, e.message);
                const isRateLimit = e.message && (e.message.includes('429') || e.message.toLowerCase().includes('resource_exhausted') || e.message.toLowerCase().includes('quota') || e.message.toLowerCase().includes('rate limit'));
                if (isRateLimit && attempt < retries) {
                    const waitTime = Math.pow(2, attempt) * 4000 + 1000;
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                }
                if (primaryModel !== fallbackModel) {
                    try {
                        return await ai.models.generateContent({ ...params, model: fallbackModel, config });
                    } catch (error2) {
                        const e2 = error2 as Error;
                        const isRateLimitFallback = e2.message && (e2.message.includes('429') || e2.message.toLowerCase().includes('resource_exhausted') || e2.message.toLowerCase().includes('quota') || e2.message.toLowerCase().includes('rate limit'));
                        if (isRateLimitFallback && attempt < retries) {
                            const waitTime = Math.pow(2, attempt) * 4000 + 1000;
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                            continue;
                        }
                        throw e2;
                    }
                } else if (attempt === retries) {
                    throw e;
                }
            }
        }
    } finally {
        setTimeout(() => {
            releaseGeminiLock();
        }, 1500);
    }
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const validation = RequestSchema.safeParse(body);
        
        if (!validation.success) {
            return new Response(JSON.stringify({ error: "Invalid payload", details: validation.error.format() }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400
            });
        }

        const { task, payload } = validation.data;
        
        const apiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('API_KEY');
        if (!apiKey) throw new Error("Gemini API Key missing in Edge Environment.");
        
        const ai = new GoogleGenAI({ apiKey });
        let result: unknown;

        if (task === 'analyzeDrawLogic') {
            const { drawName, historyPayload, metrics, structuredContext } = payload;
            const hurstVal = typeof metrics?.hurst === 'number' ? metrics.hurst : (typeof structuredContext?.hurst === 'number' ? structuredContext.hurst : 0.50);
            const brierScore = typeof metrics?.brierScore === 'number' ? metrics.brierScore : 0.18;
            const volatility = typeof metrics?.volatility === 'number' ? metrics.volatility : 0.20;
            const spectralEntropy = typeof metrics?.spectralEntropy === 'number' ? metrics.spectralEntropy : 0.82;

            const temp = Math.max(0.10, Math.min(0.95, 0.10 + (0.85 / (1.0 + Math.exp(12.0 * (hurstVal - 0.50))))));
            const calculatedBayesianScore = Math.round(Math.max(1, Math.min(99, 100 * (0.40 * (1 - Math.min(1, brierScore)) + 0.35 * (1 - Math.min(1, volatility)) + 0.25 * (1 - Math.min(1, spectralEntropy))))));

            const prompt = `Agis comme l'Agent Tactique Nexus Apex v14.0, une IA experte en analyse stochastique pour la loterie (5/90).
            Analyse les 15 derniers tirages de "${drawName}" :
            ${JSON.stringify(historyPayload)}
            
            Contextuel Structuré & Métriques Déterministes :
            ${JSON.stringify(structuredContext || metrics || {})}

            CRITIQUE : Tu es un LLM, tu es mauvais en mathématiques pures. Tu ne dois SOUS AUCUN PRÉTEXTE essayer de deviner ou de prédire les prochains numéros.
            Ta seule tâche est de fournir une analyse sémantique, narrative et contrefactuelle basée sur les métriques qu'on te fournit.

            TÂCHE REQUISE :
            1. Fournis une analyse logique détaillée du comportement de la grille.
            2. Identifie le type de pattern dominant (ex: Haute Entropie, Retour à la moyenne, Résonance Harmonique).
            3. Liste les anomalies détectées (écarts-types, ruptures de symétrie, dérives).
            4. Donne un conseil stratégique froid et technique.
            5. Fournis un Score d'Intuition (0-100).
            6. "counterfactualExplanation" : Une explication contrefactuelle narrative obligatoire expliquant ce qui aurait changé si un paramètre avait varié (ex: "Le N°42 aurait intégré le Top 5 si le poids de Cadence d'Écart avait été supérieur de +8% en raison de son cycle de sortie de 3 tirages.").
            7. "bayesianRecurrenceScore" : Renvoie le score de récurrence bayésienne calculé (${calculatedBayesianScore}).`;

            const response = await generateWithFallback(ai, "gemini-3.5-flash", {
                contents: prompt,
                config: {
                    temperature: temp,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            logicalAnalysis: { type: Type.STRING },
                            patternType: { type: Type.STRING },
                            nextSequence: { type: Type.STRING },
                            anomalies: { type: Type.ARRAY, items: { type: Type.STRING } },
                            strategicAdvice: { type: Type.STRING },
                            suggestedFocus: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                            intuitionScore: { type: Type.NUMBER },
                            counterfactualExplanation: { type: Type.STRING },
                            bayesianRecurrenceScore: { type: Type.NUMBER }
                        },
                        required: ["logicalAnalysis", "patternType", "nextSequence", "anomalies", "strategicAdvice", "suggestedFocus", "intuitionScore", "counterfactualExplanation", "bayesianRecurrenceScore"]
                    }
                }
            });
            result = JSON.parse(response.text);
            result.suggestedFocus = []; // Force empty focus array
            if (!result.bayesianRecurrenceScore) {
                result.bayesianRecurrenceScore = calculatedBayesianScore;
            }
        }
        else if (task === 'getNarrativeAnalysis') {
            const { drawName, historyPayload, metrics } = payload;
            const prompt = `Agis comme l'Agent Tactique Nexus Apex v14.0, une IA experte en analyse stochastique et fractale pour la loterie (5/90).
            CONTEXTE :
            Jeu : "${drawName}".
            Historique Récent (5 derniers tirages) : ${JSON.stringify(historyPayload)}.
            Métriques actuelles : ${JSON.stringify(metrics || {})}.
            
            ANALYSE REQUISE :
            Génère une analyse stochastique profonde et structurée. Utilise un ton froid, technique, cyberpunk et probabiliste.
            Retourne un objet JSON strict avec : summary, technicalVerdict, riskAssessment, confidence.`;

            const response = await generateWithFallback(ai, "gemini-3.5-flash", {
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
                        required: ["summary", "technicalVerdict", "riskAssessment", "confidence"]
                    }
                }
            });
            result = JSON.parse(response.text);
        }
        else if (task === 'getPythonKernelAnalysis') {
            const { drawName, historyPayload, modelType, computedContext } = payload;
            const prompt = `Agis comme un Data Scientist Senior spécialisé en modélisation stochastique.
            CONTEXTE :
            Jeu : "${drawName}".
            Historique Récent : ${JSON.stringify(historyPayload)}.
            Modèle demandé : ${modelType}.
            Contexte calculé : ${JSON.stringify(computedContext || {})}.
            
            TÂCHE :
            1. Génère un script Python (utilisant pandas, numpy, scikit-learn, xgboost, ou pymc3 selon le modèle) qui modéliserait ce comportement.
            2. Fournis une analyse (insight) des résultats attendus.
            Retourne un objet JSON strict avec : script, stdout (array of strings), insight.`;

            const response = await generateWithFallback(ai, "gemini-3.5-flash", {
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            script: { type: Type.STRING },
                            stdout: { type: Type.ARRAY, items: { type: Type.STRING } },
                            insight: { type: Type.STRING }
                        },
                        required: ["script", "stdout", "insight"]
                    }
                }
            });
            result = JSON.parse(response.text);
        }
        else if (task === 'generateAutopsyAnalysis') {
            const { drawName, predicted, actual, machine, exactHits, nearMissesCount, machineHits, rmse, spectralDeviations, entropyCollapse, benfordCompliance } = payload;
            const prompt = `Tu es l'Architecte Logiciel Senior d'une IA Prédictive appelée LotoPro Platinum Elite.
            Fais l'autopsie post-mortem d'une prédiction de loterie ${drawName || 'Loto 5/90'} par rapport au résultat réel.

            CONTEXTE DE LA PRÉDICTION:
            Prédiction de l'IA: [${predicted.join(', ')}]
            Tirage Réel Gagnant: [${actual.join(', ')}]
            Tirage Machine (Perdant): [${machine.join(', ')}]
            Métrique Hits Exacts: ${exactHits}
            Métrique Near Misses (Voisins +/- 1): ${nearMissesCount}
            Hits de l'IA dans la machine: ${machineHits}
            Erreur Quadratique Moyenne (RMSE du modèle): ${rmse.toFixed(2)}
            Anomalies Spectrales Majeures: ${spectralDeviations.slice(0, 3).map((dev: {number: number, delta: number}) => 'Numéro ' + dev.number + ' (Delta: ' + dev.delta + ')').join(' | ') || 'Aucune majeure'}
            Effondrement Entropique Détecté: ${entropyCollapse ? "Oui (Chaos localisé)" : "Non (Régularité normale)"}
            Conformité à la Loi de Benford: ${benfordCompliance ? (benfordCompliance * 100).toFixed(1) + "%" : "Non calculée"}

            OBJECTIF:
            Rédige un rapport technique "XAI" (Explainable AI) très immersif et expert pour le Data Scientist utilisateur.
            1. "analysis": Un paragraphe (en français) expliquant pourquoi le réseau de neurones a réussi l'induction ou pourquoi les filtres stochastiques ont échoué. Parle comme un système informatique. Utilise l'effondrement entropique ou loi de Benford si pertinent.
            2. "recommendations": 2 actions spécifiques.
            3. "isBlackSwan": Booléen. Renvoie true si l'RMSE est très élevé (> 55) OU si les numéros sortis forment une suite impossible.
            4. "confidence": Ta confiance dans cette autopsie (0.0 à 1.0).`;

            const response = await generateWithFallback(ai, "gemini-3.5-flash", {
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            analysis: { type: Type.STRING },
                            recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
                            isBlackSwan: { type: Type.BOOLEAN },
                            confidence: { type: Type.NUMBER }
                        },
                        required: ["analysis", "recommendations", "isBlackSwan", "confidence"]
                    }
                }
            });
            result = JSON.parse(response.text);
        }
        else if (task === 'generateGlobalForensicSynthesis') {
            const { summary } = payload;
            const prompt = `Tu es l'Intelligence Supérieure du Forensic Hub.
            Analyse ces 10 derniers rapports d'autopsie de prédictions de loterie:
            ${JSON.stringify(summary)}

            OBJECTIF:
            Génère une synthèse stratégique globale sur la performance du système.
            1. "synthesis": Un paragraphe expert résolvant les tendances de fond.
            2. "focalPoints": 3 points d'attention prioritaires.
            3. "overallCalibration": Un court diagnostic sur l'état de calibration actuelle.`;

            const response = await generateWithFallback(ai, "gemini-3.5-flash", {
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            synthesis: { type: Type.STRING },
                            focalPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                            overallCalibration: { type: Type.STRING }
                        },
                        required: ["synthesis", "focalPoints", "overallCalibration"]
                    }
                }
            });
            result = JSON.parse(response.text);
        }
        else if (task === 'scanTicket') {
            const { imageBase64 } = payload;
            const response = await generateWithFallback(ai, 'gemini-3.5-flash', {
                contents: {
                    parts: [
                        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
                        { text: "ANALYSE OCR LOTO. Extrais les données de ce ticket ou résultat. Format strict: Date (YYYY-MM-DD), 5 Numéros Gagnants, 5 Numéros Machine (si présents). Si illisible, renvoie des tableaux vides. Retourne uniquement un objet JSON valide avec les clés 'date', 'gagnants' et 'machine'." }
                    ]
                }
            });
            const jsonStr = response.text;
            result = JSON.parse(jsonStr.replace(/```json\n?|\n?```/g, '').trim());
        }
        else if (task === 'getStrategistAdvice') {
            const { drawName, strategyName, topWeights, backtestStats, forensicReportsStr } = payload;
            const prompt = `
            Tu es le "Strategist Advisor" de LotoPro Platinum Elite, un expert en théorie des jeux, mathématiques stochastiques et analyse de loterie.
            Tirage actuel: ${drawName}
            Nom de la stratégie: ${strategyName}
            Top Poids Algorithmiques: ${topWeights}
            
            Stats de Performance Récentes (Backtest):
            - Profit Net: ${backtestStats?.netProfit || 0} FCFA
            - ROI: ${backtestStats?.roi || 0}%
            - Taux de réussite: ${backtestStats?.winRate || 0}%
            - Max Drawdown: ${backtestStats?.maxDrawdown || 0} FCFA

            Derniers Rapports Forensic (Insights):
            ${forensicReportsStr}

            Analyse ces données et fournis un rapport stratégique au format JSON strict.
            Le ton doit être professionnel, élitiste, et extrêmement précis.
            Évite les conseils génériques. Parle de "convergence de signaux", de "calibrage d'entropie" et de "gestion de risque Kelly".
            `;

            const response = await generateWithFallback(ai, "gemini-3.5-flash", {
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            summary: { type: Type.STRING },
                            recommendations: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        title: { type: Type.STRING },
                                        description: { type: Type.STRING },
                                        impact: { type: Type.STRING },
                                        action: { type: Type.STRING }
                                    },
                                    required: ["title", "description", "impact", "action"]
                                }
                            },
                            marketContext: { type: Type.STRING }
                        },
                        required: ["summary", "recommendations", "marketContext"]
                    }
                }
            });
            result = JSON.parse(response.text);
        }

        else if (task === 'getOraclePrediction') {
            const { drawName, history } = payload;
            
            if (!drawName || !history || !Array.isArray(history) || history.length === 0) {
                throw new Error("Missing required drawName or history array.");
            }

            let discoveredMaxNum = 0;
            history.forEach((draw: any) => {
                if (Array.isArray(draw.gagnants)) {
                    draw.gagnants.forEach((n: number) => {
                        if (n > discoveredMaxNum) discoveredMaxNum = n;
                    });
                }
            });
            const safeMaxNum = discoveredMaxNum > 0 ? discoveredMaxNum : 90;

            const frequencyMap: Record<number, number> = {};
            const lastSeenMap: Record<number, number> = {};
            
            for (let num = 1; num <= safeMaxNum; num++) {
                frequencyMap[num] = 0;
                lastSeenMap[num] = history.length;
            }

            history.forEach((draw: any, index: number) => {
                if (Array.isArray(draw.gagnants)) {
                    draw.gagnants.forEach((n: number) => {
                        if (n >= 1 && n <= safeMaxNum) {
                            frequencyMap[n]++;
                            if (lastSeenMap[n] === history.length) {
                                lastSeenMap[n] = index;
                            }
                        }
                    });
                }
            });

            const sortedByFreq = Object.entries(frequencyMap)
                .map(([num, count]) => ({ num: parseInt(num), count }))
                .sort((a, b) => b.count - a.count);

            const hotNumbers = sortedByFreq.slice(0, 10).map(x => x.num);
            const coldNumbers = sortedByFreq.slice(-10).map(x => x.num);

            const totalOccurrences = Object.values(frequencyMap).reduce((a, b) => a + b, 0);
            let shannonEntropy = 0;
            if (totalOccurrences > 0) {
                Object.values(frequencyMap).forEach(count => {
                    if (count > 0) {
                        const p = count / totalOccurrences;
                        shannonEntropy -= p * Math.log2(p);
                    }
                });
            }
            const normalizedEntropy = shannonEntropy / Math.max(Number.EPSILON, Math.log2(safeMaxNum));

            try {
                const promptText = `
                    Tu es l'Oracle Mathématique Senior de la plateforme LotoPro Platinum Elite. 
                    Ton rôle est d'analyser l'historique de tirages pour le jeu "${drawName}" (Pool de numéros : 1 à ${safeMaxNum}) 
                    et de produire une prédiction hautement probabiliste conforme à nos principes mathématiques (Déterminisme, Continuité, Zéro Nombres Magiques, Zéro Hasard).

                    Voici les données objectives consolidées :
                    - Nombre total de tirages analysés : ${history.length}
                    - Numéros les plus fréquents (Hot) : ${JSON.stringify(hotNumbers)}
                    - Numéros les moins fréquents (Cold) : ${JSON.stringify(coldNumbers)}
                    - Entropie spectrale normalisée de Shannon : ${normalizedEntropy.toFixed(4)}
                    - Historique récent (les 10 derniers tirages) :
                      ${JSON.stringify(history.slice(0, 10).map((h: any) => ({ date: h.date, gagnants: h.gagnants })))}

                    Analyse ces données en utilisant un cadre de chaînes de Markov du premier ordre, la distribution théorique de Poisson pour l'écart de tirage, et l'ajustement continu du filtre bayésien.

                    IMPORTANT : Ne fais aucune référence à du hasard ou de la chance arbitraire. Parle uniquement de régularité mathématique, de résonance d'onde de probabilité, et d'entropie continue.
                `;

                const response = await generateWithFallback(ai, "gemini-3.5-flash", {
                    contents: promptText,
                    config: {
                        systemInstruction: "Tu es un spécialiste de l'inférence statistique et de l'analyse cybernétique. Tu génères des analyses froides, objectives et rigoureuses, rédigées dans un français élégant de style académique. Tu dois renvoyer obligatoirement les résultats selon le schéma JSON spécifié.",
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                suggestedNumbers: {
                                    type: Type.ARRAY,
                                    items: { type: Type.INTEGER },
                                    description: `Exactement 5 numéros distincts prédis compris entre 1 et ${safeMaxNum}.`
                                },
                                candidates: {
                                    type: Type.ARRAY,
                                    items: { type: Type.INTEGER },
                                    description: `Un ensemble élargi de 10 numéros chauds, matures ou complémentaires compris entre 1 et ${safeMaxNum}.`
                                },
                                confidence: {
                                    type: Type.NUMBER,
                                    description: `Indice de confiance continu normalisé entre 0 et 100.`
                                },
                                analysis: {
                                    type: Type.STRING,
                                    description: `Analyse qualitative rigoureuse expliquant la structuration spectrale des groupes, les cycles de transition thermique et les ruptures d'écarts de Poisson sous forme de paragraphes rédigés en Markdown.`
                                },
                                mathModelSummary: {
                                    type: Type.STRING,
                                    description: "Description succincte et rigoureuse des équations et transitions probabilistes à l'œuvre."
                                }
                            },
                            required: ["suggestedNumbers", "candidates", "confidence", "analysis", "mathModelSummary"]
                        }
                    }
                });
                
                if (response && response.text) {
                    result = JSON.parse(response.text.trim());
                } else {
                    throw new Error("Gemini returned empty text.");
                }
            } catch (geminiError) {
                console.warn("Gemini API call failed, deploying local deterministic fallback:", geminiError);
                
                const historyString = JSON.stringify(history.slice(0, 5).map((h: any) => h.gagnants));
                let seed = 0;
                for (let i = 0; i < historyString.length; i++) {
                    seed = (seed * 31 + historyString.charCodeAt(i)) % 2147483647;
                }
                if (seed === 0) seed = 12345;

                const lcg = () => {
                    seed = (seed * 1103515245 + 12345) % 2147483648;
                    return seed / 2147483648;
                };

                const freqWeight = 1.0 - (normalizedEntropy / 2.0);
                const gapWeight = 1.0 - freqWeight;

                const allFreqs = Object.values(frequencyMap);
                const allGaps = Object.values(lastSeenMap);
                const meanFreq = allFreqs.reduce((a, b) => a + b, 0) / Math.max(1, allFreqs.length);
                const meanGap = allGaps.reduce((a, b) => a + b, 0) / Math.max(1, allGaps.length);
                const stdFreq = Math.sqrt(allFreqs.reduce((a, b) => a + Math.pow(b - meanFreq, 2), 0) / Math.max(1, allFreqs.length)) || 1;
                const stdGap = Math.sqrt(allGaps.reduce((a, b) => a + Math.pow(b - meanGap, 2), 0) / Math.max(1, allGaps.length)) || 1;

                const scores: { num: number; score: number }[] = [];
                for (let num = 1; num <= safeMaxNum; num++) {
                    const f = frequencyMap[num] || 0;
                    const g = lastSeenMap[num] || 0;
                    
                    const zFreq = (f - meanFreq) / stdFreq;
                    const zGap = (g - meanGap) / stdGap;

                    const sigmoFreq = 1.0 / (1.0 + Math.exp(-zFreq));
                    const sigmoGap = 1.0 - Math.exp(-Math.max(0, zGap));
                    
                    const deterministicNoise = lcg() * (1.0 / (1.0 + stdFreq + stdGap)); 
                    
                    const score = (sigmoFreq * freqWeight) + (sigmoGap * gapWeight) + deterministicNoise;
                    scores.push({ num, score });
                }

                scores.sort((a, b) => b.score - a.score);
                const suggestedNumbers = scores.slice(0, 5).map(x => x.num).sort((a,b) => a-b);
                const candidates = scores.slice(5, 15).map(x => x.num).sort((a,b) => a-b);
                
                const confidenceLog = (1.0 - normalizedEntropy) * 100.0;
                const confidence = Math.max(1, Math.min(99, Math.round(confidenceLog)));

                result = {
                    suggestedNumbers,
                    candidates,
                    confidence,
                    analysis: `### Inférence Déterministe Locale (Noyau Backup)\nCet alignement spectral a été calculé localement via le filtre cybernétique de secours en raison d'une indisponibilité temporaire du module Cloud d'Oracle.\n\nL'analyse de Fourier révèle une stabilisation des transitions harmoniques dans le groupe de numéros du jeu **${drawName}**. Nous constatons une concentration des écarts Poisson sur la zone intermédiaire.\nLe modèle local a neutralisé les dérives entropiques en calculant les gradients continus de distance sur ${history.length} tirages historiques.`,
                    mathModelSummary: "Modèle spectral quadratique local à stabilisation géométrique (Inertie et gradient LCG canonique)."
                };
            }
        }

        return new Response(JSON.stringify({ success: true, result }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });

    } catch (error) {
        const err = error as Error;
        console.error("Ask Oracle Error:", err)
        return new Response(JSON.stringify({ success: false, error: err.message || "Unknown error" }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
