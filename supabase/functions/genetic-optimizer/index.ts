
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlgoWeights { [key: string]: number; }
interface DrawData { gagnants: number[]; }

// Helper: Précalcul des métriques
const precomputeMetrics = (history: DrawData[]) => {
  const transitions: Record<number, Record<number, number>> = {};
  const freqMap: Record<number, number> = {};
  
  for (let i = 0; i < history.length - 1; i++) {
    const prev = history[i + 1].gagnants;
    const current = history[i].gagnants;

    current.forEach(n => freqMap[n] = (freqMap[n] || 0) + 1);

    prev.forEach(p => {
      if (!transitions[p]) transitions[p] = {};
      current.forEach(c => {
        transitions[p][c] = (transitions[p][c] || 0) + 1;
      });
    });
  }
  return { transitions, freqMap };
};

// Helper: Calcul du score de fitness d'un set de poids
const calculateFitness = (weights: AlgoWeights, history: DrawData[], metrics: any): number => {
  const SAMPLE_SIZE = Math.min(history.length - 1, 40);
  let totalScore = 0;

  for (let t = 0; t < SAMPLE_SIZE; t++) {
    const target = history[t].gagnants;
    const prev = history[t + 1].gagnants;
    const past = history.slice(t + 1);

    target.forEach(num => {
      let nScore = 0;
      nScore += (metrics.freqMap[num] || 0) * (weights.frequency || 0.1);
      
      let markov = 0;
      prev.forEach(p => markov += (metrics.transitions[p]?.[num] || 0));
      nScore += markov * (weights.markov || 0.1) * 5;
      
      // Gap basique
      const lastIdx = past.findIndex(d => d.gagnants.includes(num));
      const gapScore = (lastIdx >= 5 && lastIdx <= 15) ? 100 : 10;
      nScore += gapScore * (weights.equilibrium || 0.1);
      
      totalScore += nScore;
    });
  }
  return totalScore;
};

// Helper: Mutation d'un gène (poids)
const mutate = (weights: AlgoWeights): AlgoWeights => {
  const mutant = { ...weights };
  const keys = Object.keys(mutant);
  const keyToMutate = keys[Math.floor(Math.random() * keys.length)];
  mutant[keyToMutate] = Math.max(0.01, Math.min(1, mutant[keyToMutate] + (Math.random() - 0.5) * 0.2));
  
  // Normalisation
  const total = Object.values(mutant).reduce((a, b) => a + b, 0);
  keys.forEach(k => mutant[k] = Number((mutant[k] / total).toFixed(4)));
  return mutant;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { history, baseWeights, config } = await req.json();
    if (!history || history.length < 10) throw new Error("Historique insuffisant pour l'optimisation.");

    const metrics = precomputeMetrics(history);
    
    let bestWeights = { ...baseWeights };
    let bestFitness = calculateFitness(bestWeights, history, metrics);

    const generations = config?.generations || 20;
    const popSize = config?.populationSize || 15;

    // Boucle d'évolution
    for (let g = 0; g < generations; g++) {
      for (let p = 0; p < popSize; p++) {
        const candidate = mutate(bestWeights);
        const fitness = calculateFitness(candidate, history, metrics);
        if (fitness > bestFitness) {
          bestFitness = fitness;
          bestWeights = candidate;
        }
      }
    }

    const initialFitness = calculateFitness(baseWeights, history, metrics);
    const improvement = initialFitness > 0 ? Math.round(((bestFitness / initialFitness) - 1) * 100) : 0;

    return new Response(JSON.stringify({ 
      bestWeights, 
      bestFitness, 
      improvement 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
