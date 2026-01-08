
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Moteur de Fitness (Optimisé pour Deno)
const simulatePredictionScore = (weights: any, history: any[], targetNumbers: number[]): number => {
    let score = 0;
    // Extraction locale pour éviter les lookups couteux
    const wFreq = weights.frequency || 0.1;
    const wGap = weights.gap || 0.1;
    
    // Heuristique simplifiée : On vérifie juste si les poids favorisent la fréquence ou le gap
    // (Simulation complète trop lourde pour le Edge Timeout)
    
    targetNumbers.forEach(n => {
        // Fréquence sur les 10 derniers tirages
        let freq = 0;
        for(let i=0; i<10 && i<history.length; i++) {
            if (history[i].gagnants.includes(n)) freq++;
        }
        
        // Gap actuel
        let gap = 0;
        for(const d of history) {
            if (d.gagnants.includes(n)) break;
            gap++;
        }

        if (freq >= 2) score += (wFreq * 50);
        if (gap > 10 && gap < 20) score += (wGap * 50);
    });

    // Pénalité régularisation (évite les poids extrêmes)
    if (wFreq > 0.8 || wGap > 0.8) score -= 20;

    return score;
};

// Mutation optimisée
const mutateWeights = (weights: any) => {
    const newWeights = { ...weights };
    const keys = Object.keys(newWeights);
    // Mutation d'un seul gène pour aller vite
    const key = keys[Math.floor(Math.random() * keys.length)];
    const noise = (Math.random() - 0.5) * 0.2; 
    let val = newWeights[key] + noise;
    newWeights[key] = Math.max(0.01, Math.min(1.0, val));
    
    // Normalisation approximative
    return newWeights;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. Validation de l'environnement
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant.");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { drawName } = await req.json();

    // 2. Récupération Historique (Limité à 30 pour vitesse)
    const [historyReq, weightsReq] = await Promise.all([
        supabase.from('draw_results').select('gagnants').eq('draw_name', drawName).order('date', { ascending: false }).limit(30),
        supabase.from('algo_weights').select('weights').eq('draw_name', drawName).single()
    ]);

    if (!historyReq.data || historyReq.data.length < 15) {
        return new Response(JSON.stringify({ success: false, message: "Historique insuffisant (<15)" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let currentWeights = weightsReq.data?.weights || {
        frequency: 0.15, gap: 0.10, spectral: 0.10, fractal: 0.05,
        markov: 0.15, spatial: 0.05, momentum: 0.05, equilibrium: 0.05,
        ai_intuition: 0.05, anti_consensus: 0.05
    };

    // 3. Algorithme Génétique "Lite" (Budget Temps < 1s)
    const validationSet = historyReq.data.slice(0, 5); // Test sur les 5 derniers
    const trainHistory = historyReq.data.slice(5);

    let bestWeights = currentWeights;
    let bestFitness = -Infinity;

    // POPULATION ET GÉNÉRATIONS RÉDUITES
    const POPULATION_SIZE = 15; 
    const GENERATIONS = 8;
    let improved = false;

    // Fitness initiale
    validationSet.forEach((target: any, idx: number) => {
        const context = [...validationSet.slice(idx+1), ...trainHistory];
        bestFitness += simulatePredictionScore(currentWeights, context, target.gagnants);
    });

    for (let g = 0; g < GENERATIONS; g++) {
        for (let i = 0; i < POPULATION_SIZE; i++) {
            const mutant = mutateWeights(bestWeights);
            let fitness = 0;
            
            // Calcul fitness rapide
            for(let j=0; j<validationSet.length; j++) {
                const target = validationSet[j];
                const context = [...validationSet.slice(j+1), ...trainHistory];
                fitness += simulatePredictionScore(mutant, context, target.gagnants);
            }

            if (fitness > bestFitness) {
                bestFitness = fitness;
                bestWeights = mutant;
                improved = true;
            }
        }
    }

    // 4. Sauvegarde
    if (improved) {
        await supabase.from('algo_weights').upsert({
            draw_name: drawName,
            weights: bestWeights,
            updated_at: new Date().toISOString()
        });
        
        await supabase.from('learning_logs').insert({
            draw_name: drawName,
            new_fitness: bestFitness,
            improvement_delta: 'Optimized via Edge Lite',
            applied_weights: bestWeights
        });
    }

    return new Response(JSON.stringify({ 
        success: true, 
        improved, 
        message: improved ? "Optimisation réussie." : "Pas d'amélioration trouvée.", 
        weights: bestWeights 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
