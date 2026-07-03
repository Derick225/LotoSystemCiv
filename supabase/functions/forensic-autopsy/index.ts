import { createClient } from 'supabase'
import { GoogleGenAI, Type } from 'genai'
import { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts";

const AutopsyRequestSchema = z.object({
    snapshotId: z.string().uuid(),
    drawResultId: z.string().uuid()
});

// Fonction de fallback déterministe si Gemini échoue
const generateWithFallback = (metrics: { hits: number, nearMisses: number, scoreDivergence: number, machineTransfer: number, signalStrength: number }) => {
    const { hits, nearMisses, scoreDivergence, machineTransfer, signalStrength } = metrics;
    
    let analysis = "";
    if (hits >= 3) analysis = "Excellente convergence des signaux. Le modèle a parfaitement capté la tendance.";
    else if (hits === 2 && nearMisses >= 2) analysis = "Forte proximité. Léger décalage de phase détecté.";
    else if (nearMisses >= 3) analysis = "Décalage spectral important. Les numéros étaient adjacents.";
    else analysis = "Divergence totale. Le cycle a probablement subi une rupture brutale.";

    let recommendations = [];
    if (scoreDivergence > 30) recommendations.push("Réduire le poids de l'historique long terme.");
    if (machineTransfer > 0) recommendations.push("Augmenter la sensibilité aux transferts machine.");
    if (signalStrength < 0.5) recommendations.push("Attendre des signaux plus forts avant de valider.");
    if (recommendations.length === 0) recommendations.push("Maintenir les paramètres actuels.");

    return {
        analysis,
        recommendations,
        confidence: Math.max(0.1, 1 - (scoreDivergence / 100)),
        modelUsed: "deterministic-fallback-v1"
    };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json();
    const validation = AutopsyRequestSchema.safeParse(body);
    
    if (!validation.success) {
        return new Response(JSON.stringify({ error: "Invalid payload", details: validation.error.format() }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }

    const { snapshotId, drawResultId } = validation.data;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if(!supabaseUrl || !supabaseKey) throw new Error("Config Supabase manquante")
    
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Récupérer le snapshot
    const { data: snapData, error: snapError } = await supabase
        .from('prediction_snapshots')
        .select('*')
        .eq('id', snapshotId)
        .single()

    if (snapError || !snapData) throw new Error("Snapshot introuvable")
    if (snapData.status === 'COMPLETED') return new Response(JSON.stringify({ message: "Déjà traité" }), { headers: corsHeaders })

    // 2. Récupérer le résultat réel
    const { data: resultData, error: resError } = await supabase
        .from('draw_results')
        .select('*')
        .eq('id', drawResultId)
        .single()

    if (resError || !resultData) throw new Error("Résultat introuvable")

    // 3. Calculs Mathématiques Purs (Déterministes) et Perte Topologique Continue
    const predicted = snapData.predicted_numbers || []
    const actual = resultData.gagnants || []
    const machine = resultData.machine || []

    let exactHits = 0
    let nearMissesCount = 0
    let machineHits = 0
    const nearMissesDetails: Array<{predicted: number, actual: number, type: string}> = []

    const getGridPos = (val: number) => {
        const row = Math.floor((val - 1) / 10);
        const col = (val - 1) % 10;
        return { row, col };
    };

    let totalContinLoss = 0;
    actual.forEach((w: number) => {
        let maxSimForWinner = 1e-9;
        predicted.forEach((p: number) => {
            let sim = 0.0;
            if (p === w) {
                sim = 1.0;
            } else {
                const linSim = Math.exp(-0.25 * Math.abs(p - w));
                const posP = getGridPos(p);
                const posW = getGridPos(w);
                const gridDist = Math.sqrt(Math.pow(posP.row - posW.row, 2) + Math.pow(posP.col - posW.col, 2));
                const gridSim = Math.exp(-0.35 * gridDist);

                let mirrorSim = 0.0;
                if (p + w === 91) mirrorSim = 0.45;
                const strP = p.toString();
                const revP = parseInt(strP.split("").reverse().join(""), 10);
                if (revP >= 1 && revP <= 90 && revP === w) mirrorSim = Math.max(mirrorSim, 0.40);

                let harmonicSim = 0.0;
                if (p % 10 === w % 10) harmonicSim = 0.35;

                let decadeSim = 0.0;
                if (Math.floor((p - 1) / 10) === Math.floor((w - 1) / 10)) decadeSim = 0.25;

                sim = Math.max(linSim, gridSim, mirrorSim, harmonicSim, decadeSim);
            }
            if (sim > maxSimForWinner) maxSimForWinner = sim;
        });
        totalContinLoss += (1.0 - maxSimForWinner);
    });

    const continuousTopologicalLoss = totalContinLoss;

    predicted.forEach((p: number) => {
        if (actual.includes(p)) {
            exactHits++
        } else {
            if (actual.includes(p - 1)) { nearMissesCount++; nearMissesDetails.push({ predicted: p, actual: p - 1, type: '-1' }) }
            if (actual.includes(p + 1)) { nearMissesCount++; nearMissesDetails.push({ predicted: p, actual: p + 1, type: '+1' }) }
        }
        if (machine.includes(p)) machineHits++
    })

    const metrics = {
        hits: exactHits,
        nearMisses: nearMissesCount,
        machineTransfer: machineHits,
        scoreDivergence: Math.abs(5 - exactHits) * 20,
        signalStrength: snapData.metrics_snapshot?.confidence || 0.5,
        continuousLoss: continuousTopologicalLoss
    }

    // 4. Génération du Rapport (IA ou Fallback)
    let reportData
    let modelUsed = "gemini-3.5-flash"

    const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('API_KEY')

    if (geminiKey) {
        try {
            const ai = new GoogleGenAI({ apiKey: geminiKey })
            const prompt = `Agis comme un expert en data science et analyse de loterie.
Analyse cette prédiction par rapport au résultat réel.
Prédiction: ${predicted.join(', ')}
Résultat: ${actual.join(', ')}
Machine: ${machine.join(', ')}
Hits exacts: ${exactHits}
Near Misses (+/- 1): ${nearMissesCount}
Perte Topologique Continue (0.0 = parfait): ${continuousTopologicalLoss.toFixed(3)}
Numéros tombés en machine: ${machineHits}

Fournis une analyse technique courte (2 phrases max) expliquant pourquoi la prédiction a réussi ou échoué, et donne 1 à 2 recommandations d'ajustement algorithmique.`

            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            analysis: { type: Type.STRING, description: "Analyse technique courte" },
                            recommendations: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Recommandations d'ajustement" },
                            confidence: { type: Type.NUMBER, description: "Niveau de confiance dans l'analyse (0.0 à 1.0)" }
                        },
                        required: ["analysis", "recommendations", "confidence"]
                    }
                }
            })

            if (response.text) {
                const ForensicResponseSchema = z.object({
                    analysis: z.string(),
                    recommendations: z.array(z.string()),
                    confidence: z.number().min(0).max(1)
                });
                
                // Zod validation acts as our strict client-side border against Gemini hallucinations
                const parsedJSON = JSON.parse(response.text);
                reportData = ForensicResponseSchema.parse(parsedJSON);
                reportData.modelUsed = modelUsed;
            } else {
                throw new Error("Réponse Gemini vide")
            }
        } catch (aiError) {
            console.error("Erreur Gemini, utilisation du fallback:", aiError)
            reportData = generateWithFallback(metrics)
        }
    } else {
        console.log("Pas de clé Gemini, utilisation du fallback")
        reportData = generateWithFallback(metrics)
    }

    // 5. Sauvegarde du Rapport
    const finalReport = {
        matches: exactHits,
        nearMisses: nearMissesCount,
        scoreDivergence: metrics.scoreDivergence,
        aiAnalysis: reportData.analysis,
        recommendations: reportData.recommendations,
        modelUsed: reportData.modelUsed
    }

    // Insérer dans forensic_reports
    await supabase.from('forensic_reports').insert({
        user_id: snapData.user_id,
        prediction_id: snapshotId,
        draw_name: snapData.draw_name,
        draw_date: resultData.date,
        draw_result_id: resultData.id,
        report_data: finalReport,
        ai_model_used: reportData.modelUsed
    })

    // Mettre à jour le snapshot
    await supabase.from('prediction_snapshots').update({
        status: 'COMPLETED',
        actual_numbers: actual,
        near_misses: nearMissesDetails,
        autopsy_report: finalReport,
        updated_at: new Date().toISOString()
    }).eq('id', snapshotId)

    // Lier la prédiction si elle existe
    const { data: predictions } = await supabase
        .from('predictions')
        .select('id, prediction')
        .eq('user_id', snapData.user_id)
        .eq('draw_name', snapData.draw_name)
        .order('timestamp', { ascending: false })
        .limit(5)

    if (predictions && predictions.length > 0) {
        for (const pred of predictions) {
            if (JSON.stringify(pred.prediction.suggestedNumbers) === JSON.stringify(predicted)) {
                await supabase.from('predictions').update({
                    draw_result_id: resultData.id,
                    feedback: {
                        matches: exactHits,
                        nearMisses: nearMissesCount,
                        autopsyId: snapshotId
                    }
                }).eq('id', pred.id)
                break
            }
        }
    }

    return new Response(JSON.stringify({ success: true, report: finalReport }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    const err = error as Error;
    console.error("Forensic Autopsy Error:", err)
    return new Response(JSON.stringify({ success: false, error: err.message || "Unknown error" }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
