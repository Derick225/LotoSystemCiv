import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration "Lite" pour Edge Function (Timeout 2s CPU)
const CONFIG = {
    POPULATION_SIZE: 15, // Réduit de 50 à 15
    GENERATIONS: 8,      // Réduit de 20 à 8
    SAMPLE_DEPTH: 20     // Profondeur d'historique analysée
};

// Fitness function ultra-optimisée (évite les calculs complexes)
const quickFitness = (weights: any, history: any[], metrics: any) => {
    let score = 0;
    const wFreq = weights.frequency || 0.1;
    
    // On utilise les métriques pré-calculées
    for(const num of metrics.hotNumbers) {
        score += wFreq * 10;
    }
    return score;
};

const mutate = (weights: any) => {
    const newW = { ...weights };
    const keys = Object.keys(newW);
    const key = keys[Math.floor(Math.random() * keys.length)];
    const noise = (Math.random() - 0.5) * 0.3;
    newW[key] = Math.max(0.01, Math.min(1.0, (newW[key] || 0.1) + noise));
    return newW;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { drawName } = await req.json();

    const { data: history } = await supabase
        .from('draw_results')
        .select('gagnants')
        .eq('draw_name', drawName)
        .order('date', { ascending: false })
        .limit(CONFIG.SAMPLE_DEPTH + 5);

    const { data: currentW } = await supabase
        .from('algo_weights')
        .select('weights')
        .eq('draw_name', drawName)
        .single();

    if (!history || history.length < 10) {
        return new Response(JSON.stringify({ success: false, message: "Historique insuffisant." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const counts: Record<number, number> = {};
    history.forEach((d: any) => d.gagnants.forEach((n: number) => counts[n] = (counts[n]||0)+1));
    const hotNumbers = Object.entries(counts).sort((a:any, b:any) => b[1]-a[1]).slice(0, 10).map(x => parseInt(x[0]));
    const metrics = { hotNumbers };

    let bestWeights = currentW?.weights || { frequency: 0.2, gap: 0.2, spectral: 0.1, markov: 0.2, spatial: 0.1 };
    let bestScore = quickFitness(bestWeights, history, metrics);
    let improved = false;

    for (let g = 0; g < CONFIG.GENERATIONS; g++) {
        for (let p = 0; p < CONFIG.POPULATION_SIZE; p++) {
            const candidate = mutate(bestWeights);
            const score = quickFitness(candidate, history, metrics);
            
            if (score > bestScore) {
                bestScore = score;
                bestWeights = candidate;
                improved = true;
            }
        }
    }

    if (improved) {
        await supabase.from('algo_weights').upsert({
            draw_name: drawName,
            weights: bestWeights,
            updated_at: new Date().toISOString()
        });
    }

    return new Response(JSON.stringify({ 
        success: true, 
        improved, 
        message: improved ? "Optimisation réussie." : "Modèle stable.",
        weights: bestWeights 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});