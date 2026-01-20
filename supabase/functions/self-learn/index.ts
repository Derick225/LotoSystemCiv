
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONFIG = {
    POPULATION_SIZE: 20,
    GENERATIONS: 15,
    SAMPLE_DEPTH: 25,
    TIME_LIMIT_MS: 9000
};

const WEIGHT_KEYS = [
    'frequency', 'gap', 'spectral', 'fractal', 'wavelet', 
    'resistance', 'markov', 'spatial', 'momentum', 'equilibrium', 
    'bayes', 'orchestration', 'transformer', 'temporal', 
    'ai_intuition', 'digital_root', 'gap_velocity', 'poisson', 
    'leader_succession', 'anti_consensus', 
    'monte_carlo', 'lstm_pattern', 'isolation_anomaly'
];

const backtestFitness = (weights: any, history: any[]) => {
    let totalScore = 0;
    const testDraws = history.slice(0, 10); 
    
    const wFreq = weights.frequency || 0.08; // Réduit
    const wGap = weights.gap || 0.15;
    const wMarkov = weights.markov || 0.15;
    const wMonte = weights.monte_carlo || 0.05;
    const wLstm = weights.lstm_pattern || 0.05;
    const wAnomaly = weights.isolation_anomaly || 0.05;

    testDraws.forEach((targetDraw, index) => {
        const context = history.slice(index + 1, index + 35);
        if (context.length < 10) return;
        
        targetDraw.gagnants.forEach((winningNum: number) => {
            let numScore = 0;
            
            // Fréquence amortie
            const freq = context.slice(0, 25).filter(d => d.gagnants.includes(winningNum)).length;
            numScore += (Math.sqrt(freq) * wFreq * 2);
            
            // Gap (priorité augmentée)
            const lastIdx = context.findIndex(d => d.gagnants.includes(winningNum));
            if (lastIdx >= 8 && lastIdx <= 18) numScore += (wGap * 8);
            
            const prevDraw = context[0];
            if (prevDraw) {
                let linkCount = 0;
                prevDraw.gagnants.forEach(p => {
                    for(let i=1; i<context.length-1; i++) {
                        if (context[i].gagnants.includes(p) && context[i-1].gagnants.includes(winningNum)) {
                            linkCount++;
                        }
                    }
                });
                if (linkCount > 0) numScore += (wMarkov * linkCount * 2.5);
            }

            if (freq > 3 && lastIdx > 5) numScore += wMonte * 10;
            if (prevDraw && prevDraw.gagnants.some(p => Math.abs(p - winningNum) === 1)) {
                numScore += wLstm * 12;
            }
            if (lastIdx > 25) numScore += wAnomaly * 15;

            totalScore += numScore;
        });
    });
    return totalScore;
};

const mutate = (weights: any) => {
    const newW = { ...weights };
    const numMutations = Math.floor(Math.random() * 3) + 1;
    for(let i=0; i<numMutations; i++) {
        const key = WEIGHT_KEYS[Math.floor(Math.random() * WEIGHT_KEYS.length)];
        const current = newW[key] || 0.05;
        newW[key] = Math.max(0.01, Math.min(1.0, current + (Math.random() - 0.5) * 0.2));
    }
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
        .limit(50);

    if (!history || history.length < 20) throw new Error("Insufficient history");

    const { data: currentW } = await supabase
        .from('algo_weights')
        .select('weights')
        .eq('draw_name', drawName)
        .single();

    let bestWeights = currentW?.weights || { frequency: 0.1, gap: 0.15, spectral: 0.15 };
    WEIGHT_KEYS.forEach(k => { if (bestWeights[k] === undefined) bestWeights[k] = 0.05; });

    let bestScore = backtestFitness(bestWeights, history);
    let population = Array(CONFIG.POPULATION_SIZE).fill(null).map((_, i) => i === 0 ? {...bestWeights} : mutate(bestWeights));
    let improved = false;
    let initialScore = bestScore;

    for (let g = 0; g < CONFIG.GENERATIONS; g++) {
        if (Date.now() - startTime > CONFIG.TIME_LIMIT_MS) break;
        const scored = population.map(w => ({ w, score: backtestFitness(w, history) })).sort((a, b) => b.score - a.score);
        if (scored[0].score > bestScore) {
            bestScore = scored[0].score;
            bestWeights = scored[0].w;
            improved = true;
        }
        const survivors = scored.slice(0, 4).map(p => p.w);
        population = [...survivors];
        while(population.length < CONFIG.POPULATION_SIZE) {
            const p1 = survivors[Math.floor(Math.random() * survivors.length)];
            const p2 = survivors[Math.floor(Math.random() * survivors.length)];
            const child = { ...p1 };
            WEIGHT_KEYS.forEach(k => { if (Math.random() > 0.5) child[k] = p2[k]; });
            population.push(mutate(child));
        }
    }

    const improvementPct = initialScore > 0 ? ((bestScore - initialScore) / initialScore) * 100 : 0;

    if (improved) {
        await supabase.from('algo_weights').upsert({ draw_name: drawName, weights: bestWeights, updated_at: new Date().toISOString() });
    }

    return new Response(JSON.stringify({ 
        success: true, 
        improved, 
        weights: bestWeights, 
        message: improved ? `Équilibre stochastique optimisé (+${improvementPct.toFixed(1)}%)` : "Noyau équilibré."
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
});
