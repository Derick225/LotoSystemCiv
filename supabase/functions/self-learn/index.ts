
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WEIGHT_KEYS = ['frequency', 'gap', 'spectral', 'markov', 'wavelet', 'momentum', 'equilibrium', 'orchestration', 'anti_consensus'];

const evaluateFitness = (weights: any, signalMatrix: any) => {
    let totalScore = 0;
    for (let i = 1; i <= 90; i++) {
        const sig = signalMatrix[i];
        if (!sig) continue;
        const nScore = (sig.freq * (weights.frequency || 0.1)) + (sig.isGapMatch ? (weights.gap || 0.2) * 50 : 0) + (sig.markov * (weights.markov || 0.1) * 15) + (sig.momentum * (weights.momentum || 0.05) * 8);
        if (sig.wasRecentlyOut) totalScore += nScore; else totalScore -= nScore * 0.15;
    }
    return totalScore;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const start = Date.now();
    const { drawName } = await req.json();
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: history } = await supabase.from('draw_results').select('gagnants').eq('draw_name', drawName).order('date', { ascending: false }).limit(60);
    if (!history || history.length < 20) throw new Error("Historique insuffisant");

    // PRÉ-CALCUL MATRICE
    const signalMatrix: Record<number, any> = {};
    const recent = history.slice(0, 15);
    const context = history.slice(15, 60);

    for (let i = 1; i <= 90; i++) {
        const freq = context.filter(d => d.gagnants.includes(i)).length;
        const lastSeen = context.findIndex(d => d.gagnants.includes(i));
        signalMatrix[i] = { 
            freq: freq / 45, 
            isGapMatch: lastSeen >= 8 && lastSeen <= 20, 
            markov: 0.1, 
            momentum: history.slice(0, 5).filter(d => d.gagnants.includes(i)).length, 
            wasRecentlyOut: recent.some(d => d.gagnants.includes(i)) 
        };
    }

    const { data: current } = await supabase.from('algo_weights').select('weights').eq('draw_name', drawName).single();
    let bestW = current?.weights || { frequency: 0.1, gap: 0.2 };
    
    let population = Array(15).fill(null).map((_, i) => i === 0 ? bestW : { ...bestW, frequency: Math.random() });

    for (let g = 0; g < 40; g++) {
        if (Date.now() - start > 8000) break; // Watchdog
        population.sort((a, b) => evaluateFitness(b, signalMatrix) - evaluateFitness(a, signalMatrix));
        bestW = population[0];
        const survivors = population.slice(0, 4);
        population = [...survivors];
        while(population.length < 15) {
            const p = survivors[Math.floor(Math.random() * survivors.length)];
            population.push({ ...p, gap: Math.max(0.01, (p.gap || 0.1) + (Math.random() - 0.5) * 0.2) });
        }
    }

    await supabase.from('algo_weights').upsert({ draw_name: drawName, weights: bestW, updated_at: new Date().toISOString() });

    return new Response(JSON.stringify({ success: true, improved: true, weights: bestW }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 200, headers: corsHeaders });
  }
});
