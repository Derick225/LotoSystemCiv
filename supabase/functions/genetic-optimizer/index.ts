
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
  const SAMPLE_SIZE = Math.min(history.length - 1, 40); // Augmenté pour meilleure précision
  let totalScore = 0;

  for (let t = 0; t < SAMPLE_SIZE; t++) {
    const target = history[t].gagnants;
    const prev = history[t + 1].gagnants;
    
    target.forEach(num => {
      let nScore = 0;
      // Fréquence pondérée
      nScore += (metrics.freqMap[num] || 0) * (weights.frequency || 0.1);
      // Markov
      let markov = 0;
      prev.forEach(p => markov += (metrics.transitions[p]?.[num] || 0));
      nScore += markov * (weights.markov || 0.1) * 5;
      
      // Monte Carlo Boost (Simulation simple)
      if (weights.monte_carlo && weights.monte_carlo > 0) {
          // Si le numéro a une forte fréquence et un gap moyen, on considère qu'il aurait été "choisi" par MC
          const freq = metrics.freqMap[num] || 0;
          if (freq > 5) nScore += weights.monte_carlo * 20;
      }

      // Isolation Anomaly (Bonus si rare)
      if (weights.isolation_anomaly && weights.isolation_anomaly > 0) {
          const freq = metrics.freqMap[num] || 0;
          if (freq < 2) nScore += weights.isolation_anomaly * 50; // Récompense la prédiction de rareté
      }
      
      totalScore += nScore;
    });
  }
  return totalScore;
};

const mutate = (weights: AlgoWeights, intensity: number = 0.3): AlgoWeights => {
  const mutant = { ...weights };
  const keys = Object.keys(mutant);
  // Mutation sur 20% des gènes
  const mutationsCount = Math.max(1, Math.floor(keys.length * 0.2));
  
  for(let i=0; i<mutationsCount; i++) {
      const keyToMutate = keys[Math.floor(Math.random() * keys.length)];
      if (keyToMutate) {
          mutant[keyToMutate] = Math.max(0.01, Math.min(1, (mutant[keyToMutate] || 0) + (Math.random() - 0.5) * intensity));
      }
  }
  return normalizeWeights(mutant);
};

const crossover = (parent1: AlgoWeights, parent2: AlgoWeights): AlgoWeights => {
    const child: AlgoWeights = {};
    const keys = Object.keys(parent1);
    
    keys.forEach(k => {
        // Mélange uniforme
        child[k] = Math.random() > 0.5 ? parent1[k] : parent2[k];
    });
    return normalizeWeights(child);
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { drawName, baseWeights, config } = await req.json();
    
    if (!drawName) throw new Error("Paramètre 'drawName' requis.");

    // Time budget: 9 secondes max pour éviter le timeout de 10s
    const startTime = Date.now();
    const TIME_LIMIT_MS = 9000;

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

    // Initialisation Population
    let population: { weights: AlgoWeights, fitness: number }[] = [];
    const generations = config?.generations || 30;
    const popSize = config?.populationSize || 20;
    
    // On garde toujours les poids de base
    population.push({ weights: normalizeWeights(baseWeights), fitness: calculateFitness(baseWeights, historyData, metrics) });
    
    // Remplissage avec mutations
    for(let i=1; i<popSize; i++) {
        const w = mutate(baseWeights, 0.8); // Mutation forte initiale
        population.push({ weights: w, fitness: calculateFitness(w, historyData, metrics) });
    }

    let bestSolution = population[0];

    // Boucle d'évolution
    for (let g = 0; g < generations; g++) {
      if (Date.now() - startTime > TIME_LIMIT_MS) {
          console.warn("Time budget exceeded, stopping evolution early.");
          break;
      }

      // Sélection (Tri par fitness décroissante)
      population.sort((a, b) => b.fitness - a.fitness);
      
      // Elitisme (On garde le top 20% intact)
      const eliteSize = Math.max(1, Math.floor(popSize * 0.2));
      const nextGen = population.slice(0, eliteSize);
      
      if (population[0].fitness > bestSolution.fitness) {
          bestSolution = population[0];
      }

      // Reproduction
      while (nextGen.length < popSize) {
          // Tournoi simple pour choisir les parents
          const p1 = population[Math.floor(Math.random() * (popSize / 2))]; // Top 50% chance
          const p2 = population[Math.floor(Math.random() * popSize)];
          
          let childWeights = crossover(p1.weights, p2.weights);
          
          // Mutation adaptative (plus on avance, moins on mute)
          const mutationIntensity = 0.5 * (1 - (g / generations));
          if (Math.random() < 0.4) {
              childWeights = mutate(childWeights, mutationIntensity);
          }
          
          nextGen.push({
              weights: childWeights,
              fitness: calculateFitness(childWeights, historyData, metrics)
          });
      }
      population = nextGen;
    }

    // Sauvegarde asynchrone
    await supabase.from('algo_weights').upsert({
        draw_name: drawName,
        weights: bestSolution.weights,
        updated_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({ 
      bestWeights: bestSolution.weights, 
      bestFitness: bestSolution.fitness,
      generations 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
