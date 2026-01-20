import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 60,
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WEIGHT_KEYS = [
    'frequency', 'gap', 'spectral', 'fractal', 'wavelet', 
    'resistance', 'markov', 'spatial', 'momentum', 'equilibrium', 
    'bayes', 'orchestration', 'transformer', 'temporal', 
    'ai_intuition', 'digital_root', 'gap_velocity', 'poisson', 
    'leader_succession', 'anti_consensus', 
    'monte_carlo', 'lstm_pattern', 'isolation_anomaly'
];

/**
 * Calcul de la Complexité AC (Arithmetic Complexity)
 */
const calculateAC = (nums: number[]) => {
    const diffs = new Set();
    const sorted = [...nums].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            diffs.add(Math.abs(sorted[j] - sorted[i]));
        }
    }
    return diffs.size - (nums.length - 1);
};

/**
 * FITNESS V12 : Multi-Objectif
 * Score = (0.6 * HitRate) + (0.2 * SigmaMatch) + (0.2 * AC_Alignment)
 */
const evaluateFitness = (weights: any, history: any[]) => {
    let hitScore = 0;
    let structureScore = 0;
    const testDepth = 25; 
    const sample = history.slice(0, testDepth);

    for (let i = 0; i < sample.length - 1; i++) {
        const target = sample[i];
        const context = sample.slice(i + 1, i + 31);
        if (context.length < 10) break;

        const targetSum = target.gagnants.reduce((a:number, b:number) => a + b, 0);
        const targetAC = calculateAC(target.gagnants);

        let drawHits = 0;
        target.gagnants.forEach((n: number) => {
            // Proxy de prédiction rapide
            const f = context.filter((d:any) => d.gagnants.includes(n)).length;
            const lastIdx = context.findIndex((d:any) => d.gagnants.includes(n));
            
            let val = (f * (weights.frequency || 0.1)) + 
                      ((lastIdx >= 8 && lastIdx <= 18 ? 1 : 0) * (weights.gap || 0.1) * 10);
            
            if (val > 1.2) drawHits++;
        });

        hitScore += (drawHits / 5);
        
        // Structure Alignment (Bonus si les poids favorisent le bon Sigma/AC)
        // Note: C'est une approximation heuristique pour le Edge
        const sigmaWeight = (weights.digital_root || 0.05) + (weights.equilibrium || 0.05);
        if (targetSum > 200 && targetSum < 250) structureScore += sigmaWeight;
        
        const acWeight = (weights.anti_consensus || 0.05) + (weights.ai_intuition || 0.05);
        if (targetAC >= 8) structureScore += acWeight;
    }

    return (hitScore * 10) + (structureScore * 5);
};

const mutate = (w: any, strength: number) => {
    const next = { ...w };
    const num = Math.floor(Math.random() * 4) + 1;
    for(let i=0; i<num; i++) {
        const k = WEIGHT_KEYS[Math.floor(Math.random() * WEIGHT_KEYS.length)];
        next[k] = Math.max(0.01, Math.min(1.0, (next[k] || 0.05) + (Math.random() - 0.5) * strength));
    }
    return next;
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const start = Date.now();
    const { drawName } = await req.json();
    const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const { data: history } = await supabase.from('draw_results').select('gagnants').eq('draw_name', drawName).order('date', { ascending: false }).limit(60);
    if (!history || history.length < 20) throw new Error("Dataset insuffisant");

    const { data: current } = await supabase.from('algo_weights').select('weights').eq('draw_name', drawName).single();
    let bestW = current?.weights || { frequency: 0.2, gap: 0.2, markov: 0.1 };
    WEIGHT_KEYS.forEach(k => { if(bestW[k] === undefined) bestW[k] = 0.04; });

    let bestScore = evaluateFitness(bestW, history);
    const initialScore = bestScore;
    let population = Array(30).fill(null).map((_, i) => i === 0 ? bestW : mutate(bestW, 0.5));

    let improved = false;
    let patience = 0;

    for (let g = 0; g < 30; g++) {
        if (Date.now() - start > 50000) break; // Safety timeout

        const scored = population.map(w => ({ w, s: evaluateFitness(w, history) })).sort((a, b) => b.s - a.s);
        
        if (scored[0].s > bestScore) {
            bestScore = scored[0].s;
            bestW = scored[0].w;
            improved = true;
            patience = 0;
        } else {
            patience++;
        }

        if (patience > 8) break; // Convergence précoce

        const elite = scored.slice(0, 5).map(x => x.w);
        population = [...elite];
        while(population.length < 30) {
            const p = elite[Math.floor(Math.random() * elite.length)];
            population.push(mutate(p, 0.2 * (1 - g/30)));
        }
    }

    if (improved) {
        await supabase.from('algo_weights').upsert({ draw_name: drawName, weights: bestW, updated_at: new Date().toISOString() });
    }

    return new Response(JSON.stringify({ 
        success: true, 
        improved, 
        weights: bestW,
        delta: initialScore > 0 ? ((bestScore - initialScore) / initialScore * 100).toFixed(2) : "0"
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}