
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlgoWeights { [key: string]: number; }
interface DrawData { gagnants: number[]; }

// Normalisation sécurisée
const normalizeWeights = (w: AlgoWeights): AlgoWeights => {
    if (!w || typeof w !== 'object') return {};
    const keys = Object.keys(w);
    const total = Object.values(w).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
    const normalized: AlgoWeights = { ...w };
    if (total <= 0) return w; 
    keys.forEach(k => normalized[k] = parseFloat((normalized[k] / total).toFixed(4)));
    return normalized;
};

const calculateFitness = (weights: AlgoWeights, history: DrawData[], metrics: any): number => {
  const SAMPLE_SIZE = Math.min(history.length - 1, 30); // Limité pour perf
  let totalScore = 0;

  for (let t = 0; t < SAMPLE_SIZE; t++) {
    const target = history[t].gagnants;
    const prev = history[t + 1].gagnants;
    
    target.forEach(num => {
      let nScore = 0;
      // Fréquence
      nScore += (metrics.freqMap[num] || 0) * (weights.frequency || 0.1);
      // Markov
      let markov = 0;
      prev.forEach(p => markov += (metrics.transitions[p]?.[num] || 0));
      nScore += markov * (weights.markov || 0.1) * 5;
      
      totalScore += nScore;
    });
  }
  return totalScore;
};

const mutate = (weights: AlgoWeights): AlgoWeights => {
  const mutant = { ...weights };
  const keys = Object.keys(mutant);
  // Mutation légère
  for(let i=0; i<2; i++) {
      const keyToMutate = keys[Math.floor(Math.random() * keys.length)];
      if (keyToMutate) {
          mutant[keyToMutate] = Math.max(0.01, Math.min(1, (mutant[keyToMutate] || 0) + (Math.random() - 0.5) * 0.3));
      }
  }
  return normalizeWeights(mutant);
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { drawName, baseWeights, config } = await req.json();
    
    if (!drawName) throw new Error("Paramètre 'drawName' requis.");

    // Time budget: 8 secondes max pour éviter le timeout de 10s
    const startTime = Date.now();
    const TIME_LIMIT_MS = 8000;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: historyData } = await supabase
        .from('draw_results')
        .select('gagnants')
        .eq('draw_name', drawName)
        .order('date', { ascending: false })
        .limit(100);

    if (!historyData || historyData.length < 10) throw new Error("Historique insuffisant pour l'optimisation.");

    const metrics = {
        transitions: {} as Record<number, Record<number, number>>,
        freqMap: {} as Record<number, number>
    };
    
    // Pré-calculs légers
    for (let i = 0; i < historyData.length - 1; i++) {
        const prev = historyData[i + 1].gagnants;
        const current = historyData[i].gagnants;
        current.forEach((n: number) => metrics.freqMap[n] = (metrics.freqMap[n] || 0) + 1);
        prev.forEach((p: number) => {
            if (!metrics.transitions[p]) metrics.transitions[p] = {};
            current.forEach((c: number) => metrics.transitions[p][c] = (metrics.transitions[p][c] || 0) + 1);
        });
    }

    let bestWeights = normalizeWeights(baseWeights || { frequency: 0.5, markov: 0.5 });
    let bestFitness = calculateFitness(bestWeights, historyData, metrics);

    const generations = config?.generations || 20;
    const popSize = config?.populationSize || 15;

    // Boucle d'évolution avec sécurité temps
    for (let g = 0; g < generations; g++) {
      // Check Time Budget
      if (Date.now() - startTime > TIME_LIMIT_MS) {
          console.warn("Time budget exceeded, stopping evolution early.");
          break;
      }

      for (let p = 0; p < popSize; p++) {
        const candidate = mutate(bestWeights);
        const fitness = calculateFitness(candidate, historyData, metrics);
        if (fitness > bestFitness) {
          bestFitness = fitness;
          bestWeights = candidate;
        }
      }
    }

    // Sauvegarde asynchrone (on n'attend pas forcément le retour pour répondre si on est pressé, mais ici on le fait proprement)
    await supabase.from('algo_weights').upsert({
        draw_name: drawName,
        weights: bestWeights,
        updated_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({ 
      bestWeights, 
      bestFitness,
      generations 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
