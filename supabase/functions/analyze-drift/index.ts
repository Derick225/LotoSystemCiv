import { createClient } from 'supabase'
import { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts"

// Schéma de validation pour déclencher l'analyse de dérive
const DriftAnalysisSchema = z.object({
    drawName: z.string().default('Global'),
    userId: z.string().uuid().optional() // Optionnel si on veut affiner par utilisateur (bien que les poids soient globaux par jeu)
});

const GENOME_KEYS = [
    'frequency', 'gap', 'spectral', 'markov', 'bayes', 
    'momentum', 'affinity', 'spatial', 'temporal',
    'fractal'
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await (req.method === 'POST' ? req.json().catch(() => ({})) : {});
    const validation = DriftAnalysisSchema.safeParse(body);
    
    if (!validation.success) {
        return new Response(JSON.stringify({ error: "Invalid payload", details: validation.error.format() }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }

    const { drawName } = validation.data;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if(!supabaseUrl || !supabaseKey) throw new Error("Config Supabase manquante")
    
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Auth Check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        return new Response(JSON.stringify({ error: "Non autorisé." }), { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
        return new Response(JSON.stringify({ error: "Non autorisé." }), { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
    }

    // 1. Récupération de l'historique d'audit (Forensic Reports)
    const { data: reports, error: reportError } = await supabase
        .from('forensic_reports')
        .select('report_data, draw_date')
        .eq('draw_name', drawName)
        .order('draw_date', { ascending: false })
        .limit(20);

    if (reportError) throw reportError;
    
    if (!reports || reports.length < 10) {
        return new Response(JSON.stringify({ 
            success: true, 
            driftDetected: false,
            message: "Historique d'audit insuffisant pour détecter une dérive." 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. Traitement des métriques (Séparation Récent vs Ligne de base)
    // Récent : 5 derniers tirages. Baseline : les 15 précédents (ou moins si < 20 dispos).
    const recentWindow = reports.slice(0, 5);
    const baselineWindow = reports.slice(5);

    const getAverageMetric = (window: Array<{ report_data: Record<string, number> }>, metricKey: string) => {
        if (window.length === 0) return 0;
        const sum = window.reduce((acc, rep) => acc + (rep.report_data[metricKey] || 0), 0);
        return sum / window.length;
    };

    // Tolère la rétrocompatibilité (fallback sur scoreDivergence si continuousLoss n'est pas encore là)
    const recentDivergence = getAverageMetric(recentWindow, 'continuousLoss') || getAverageMetric(recentWindow, 'scoreDivergence');
    const baselineDivergence = getAverageMetric(baselineWindow, 'continuousLoss') || getAverageMetric(baselineWindow, 'scoreDivergence');
    
    const recentMatches = getAverageMetric(recentWindow, 'matches');
    const baselineMatches = getAverageMetric(baselineWindow, 'matches');

    // 3. Détection de la Dérive
    // Si la divergence (erreur continue ou ponctuelle) augmente significativement ou si la précision s'effondre
    const divergenceRatio = baselineDivergence > 0 ? (recentDivergence - baselineDivergence) / baselineDivergence : 0;
    const matchesRatio = baselineMatches > 0 ? (recentMatches - baselineMatches) / baselineMatches : 0;

    // Dérive calculée de façon continue via sigmoïde
    // Poids dynamique : on pénalise la baisse globale
    const driftSeverity = (Math.max(0, divergenceRatio) * 1.5) + (Math.max(0, -matchesRatio) * 2.0);
    const driftProbability = 1.0 / (1.0 + Math.exp(-8.0 * (driftSeverity - 0.2)));

    const isDrifting = driftProbability > Math.exp(-1.0);

    let adjustmentLog = null;
    let oldWeights = null;
    let newWeights = null;

    // 4. Ajustement Dynamique (Correction de la dérive proportionnelle)
    if (isDrifting) {
        const { data: weightsData } = await supabase
            .from('algo_weights')
            .select('weights')
            .eq('draw_name', drawName)
            .single();

        if (weightsData && weightsData.weights) {
            oldWeights = { ...weightsData.weights };
            newWeights = { ...weightsData.weights };

            // Logique de correction continue :
            // La correction est proportionnelle à driftProbability.
            const penalty = 1.0 - (0.25 * driftProbability);
            const boost = 1.0 + (0.30 * driftProbability);
            const fallbackWeight = 1.0 / GENOME_KEYS.length;

            newWeights['frequency'] = Math.max(Math.exp(-4.0), (newWeights['frequency'] || fallbackWeight) * penalty);
            newWeights['gap'] = Math.max(Math.exp(-4.0), (newWeights['gap'] || fallbackWeight) * penalty);
            
            newWeights['momentum'] = Math.min(1.0, (newWeights['momentum'] || fallbackWeight) * boost);
            newWeights['wavelet'] = Math.min(1.0, (newWeights['wavelet'] || fallbackWeight) * boost);

            // Normalisation des poids pour assurer un total logique
            let sum = 0;
            GENOME_KEYS.forEach(key => {
                if (!newWeights[key]) newWeights[key] = fallbackWeight;
                sum += newWeights[key];
            });

            if (sum > 0) {
                GENOME_KEYS.forEach(key => {
                    newWeights[key] = parseFloat((newWeights[key] / sum).toFixed(4));
                });
            }

            // 5. Sauvegarde des nouveaux Poids
            await supabase
                .from('algo_weights')
                .update({ weights: newWeights, updated_at: new Date().toISOString() })
                .eq('draw_name', drawName);

            // 6. Log dans la base de données
            const { data: logEntry } = await supabase
                .from('learning_logs')
                .insert({
                    draw_name: drawName,
                    previous_fitness: baselineDivergence,
                    new_fitness: recentDivergence,
                    improvement_delta: `DriftDetected: RatioDivergence=${(divergenceRatio * 100).toFixed(1)}%`,
                    applied_weights: newWeights
                })
                .select()
                .single();
            
            adjustmentLog = logEntry;
        }
    }

    return new Response(JSON.stringify({ 
        success: true, 
        driftDetected: isDrifting,
        metrics: {
            baseline: { divergence: baselineDivergence.toFixed(2), matches: baselineMatches.toFixed(2) },
            recent: { divergence: recentDivergence.toFixed(2), matches: recentMatches.toFixed(2) }
        },
        weightsAdjusted: isDrifting && newWeights !== null,
        oldWeights,
        newWeights,
        logId: adjustmentLog?.id
    }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    const err = error as Error;
    console.error("Analyze Drift Error:", err)
    return new Response(JSON.stringify({ success: false, error: err.message || "Unknown error" }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
