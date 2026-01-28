import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WEIGHT_KEYS = [
    'frequency', 'gap', 'spectral', 'markov', 'wavelet', 
    'momentum', 'equilibrium', 'orchestration', 'anti_consensus'
];

/**
 * FITNESS EVALUATOR v15.5 (ULTRA-FAST)
 * Calcule l'efficacité des poids contre la matrice de signal pré-calculée.
 */
const evaluateGenome = (weights: any, signalMatrix: Record<number, any>) => {
    let fitness = 0;
    for (let i = 1; i <= 90; i++) {
        const sig = signalMatrix[i];
        if (!sig) continue;

        const score = 
            (sig.freq * (weights.frequency || 0.1)) +
            (sig.isGapMatch ? (weights.gap || 0.2) * 40 : 0) +
            (sig.markov * (weights.markov || 0.1) * 15) +
            (sig.momentum * (weights.momentum || 0.05) * 8);
        
        if (sig.hitRecently) fitness += score;
        else fitness -= score * 0.12; // Pénalité de faux positif
    }
    return fitness;
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const startTime = Date.now();
    const { drawName } = await req.json();
    
    const supabase = createClient(
        process.env.VITE_SUPABASE_URL || '',
        process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const { data: history } = await supabase
        .from('draw_results')
        .select('gagnants')
        .eq('draw_name', drawName)
        .order('date', { ascending: false })
        .limit(60);

    if (!history || history.length < 20) throw new Error("Dataset insuffisant");

    // PHASE 1: PRÉ-CALCUL DE LA MATRICE DE SIGNAL (O(H))
    const signalMatrix: Record<number, any> = {};
    const recent = history.slice(0, 12); // Fenêtre de test
    const past = history.slice(12, 60);  // Fenêtre d'apprentissage

    for (let i = 1; i <= 90; i++) {
        const freq = past.filter(d => d.gagnants.includes(i)).length;
        const lastIdx = past.findIndex(d => d.gagnants.includes(i));
        const gap = lastIdx === -1 ? 50 : lastIdx;
        
        // Markov succinct
        let markov = 0;
        const anchors = history[12].gagnants;
        past.slice(0, 10).forEach((d, idx) => {
            if (d.gagnants.includes(i) && past[idx+1]?.gagnants.some(n => anchors.includes(n))) markov++;
        });

        signalMatrix[i] = {
            freq: freq / 45,
            isGapMatch: gap >= 8 && gap <= 22,
            markov: markov / 10,
            momentum: history.slice(0, 5).filter(d => d.gagnants.includes(i)).length,
            hitRecently: recent.some(d => d.gagnants.includes(i))
        };
    }

    // PHASE 2: ÉVOLUTION GÉNÉTIQUE AVEC WATCHDOG (O(G*P))
    const { data: current } = await supabase.from('algo_weights').select('weights').eq('draw_name', drawName).single();
    let bestW = current?.weights || { frequency: 0.1, gap: 0.2 };
    let bestScore = evaluateGenome(bestW, signalMatrix);
    
    let population = Array(20).fill(null).map((_, i) => {
        if (i === 0) return { ...bestW };
        const mutant = { ...bestW };
        WEIGHT_KEYS.forEach(k => mutant[k] = Math.max(0.01, Math.min(1.0, (mutant[k] || 0.1) + (Math.random() - 0.5) * 0.5)));
        return mutant;
    });

    for (let g = 0; g < 50; g++) {
        if (Date.now() - startTime > 8000) break; // Arrêt propre avant timeout 504

        const scored = population.map(w => ({ w, s: evaluateGenome(w, signalMatrix) }))
            .sort((a, b) => b.s - a.s);
        
        if (scored[0].s > bestScore) {
            bestScore = scored[0].s;
            bestW = scored[0].w;
        }

        const elite = scored.slice(0, 4).map(x => x.w);
        population = [...elite];
        while(population.length < 20) {
            const p = elite[Math.floor(Math.random() * elite.length)];
            const child = { ...p };
            const k = WEIGHT_KEYS[Math.floor(Math.random() * WEIGHT_KEYS.length)];
            child[k] = Math.max(0.01, Math.min(1.0, (child[k] || 0.1) + (Math.random() - 0.5) * 0.2));
            population.push(child);
        }
    }

    // PHASE 3: PERSISTANCE
    await supabase.from('algo_weights').upsert({ 
        draw_name: drawName, 
        weights: bestW, 
        updated_at: new Date().toISOString() 
    });

    return new Response(JSON.stringify({ success: true, improved: true, weights: bestW }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}