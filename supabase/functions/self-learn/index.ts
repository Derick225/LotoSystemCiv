
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration contrainte pour respecter les limites du Edge
const CONFIG = {
    POPULATION_SIZE: 15,
    GENERATIONS: 10,
    SAMPLE_DEPTH: 20,
    TIME_LIMIT_MS: 9000 // Arrêt forcé avant 10s
};

const backtestFitness = (weights: any, history: any[]) => {
    let totalScore = 0;
    const testDraws = history.slice(0, 10); 
    const wFreq = weights.frequency || 0.1;
    const wGap = weights.gap || 0.1;

    testDraws.forEach((targetDraw, index) => {
        const context = history.slice(index + 1, index + 15);
        if (context.length < 5) return;
        targetDraw.gagnants.forEach((winningNum: number) => {
            const freq = context.filter(d => d.gagnants.includes(winningNum)).length;
            totalScore += (freq * wFreq);
            // Calcul simplifié du gap pour performance
            const lastIdx = context.findIndex(d => d.gagnants.includes(winningNum));
            if (lastIdx >= 8 && lastIdx <= 18) totalScore += (wGap * 5);
        });
    });
    return totalScore;
};

const mutate = (weights: any) => {
    const newW = { ...weights };
    const keys = Object.keys(newW);
    if (keys.length === 0) return newW;
    const key = keys[Math.floor(Math.random() * keys.length)];
    newW[key] = Math.max(0.01, Math.min(1.0, (newW[key] || 0.1) + (Math.random() - 0.5) * 0.3));
    return newW;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const startTime = Date.now();
    const { drawName } = await req.json();
    
    if (!drawName) throw new Error("drawName required");

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: history } = await supabase
        .from('draw_results')
        .select('gagnants')
        .eq('draw_name', drawName)
        .order('date', { ascending: false })
        .limit(40);

    if (!history || history.length < 20) throw new Error("Insufficient history");

    const { data: currentW } = await supabase
        .from('algo_weights')
        .select('weights')
        .eq('draw_name', drawName)
        .single();

    let bestWeights = currentW?.weights || { frequency: 0.2, gap: 0.2, spectral: 0.1 };
    let bestScore = backtestFitness(bestWeights, history);
    let population = Array(CONFIG.POPULATION_SIZE).fill(null).map((_, i) => i === 0 ? {...bestWeights} : mutate(bestWeights));
    let improved = false;

    // Boucle génétique avec sécurité temps
    for (let g = 0; g < CONFIG.GENERATIONS; g++) {
        if (Date.now() - startTime > CONFIG.TIME_LIMIT_MS) break;

        const scored = population.map(w => ({ w, score: backtestFitness(w, history) })).sort((a, b) => b.score - a.score);
        
        if (scored[0].score > bestScore) {
            bestScore = scored[0].score;
            bestWeights = scored[0].w;
            improved = true;
        }

        const survivors = scored.slice(0, 3).map(p => p.w);
        population = [...survivors];
        while(population.length < CONFIG.POPULATION_SIZE) {
            population.push(mutate(survivors[Math.floor(Math.random() * survivors.length)]));
        }
    }

    if (improved) {
        await supabase.from('algo_weights').upsert({ draw_name: drawName, weights: bestWeights, updated_at: new Date().toISOString() });
        await supabase.from('learning_logs').insert({ draw_name: drawName, new_fitness: bestScore, applied_weights: bestWeights });
    }

    return new Response(JSON.stringify({ success: true, improved, weights: bestWeights }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
});
