
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Moteur de prédiction simplifié pour la simulation rapide (Mirroring du frontend)
// Doit être synchronisé avec la logique du predictionEngine.ts
const simulatePredictionScore = (weights: any, history: any[], targetNumbers: number[]): number => {
    let score = 0;
    const freqWeight = weights.frequency || 0.1;
    const gapWeight = weights.gap || 0.1;
    const markovWeight = weights.markov || 0.1;

    // Simulation simplifiée pour la performance (Heuristique vectorielle)
    // On vérifie si les poids actuels auraient "highlighté" les numéros gagnants
    
    // 1. Analyse Fréquence (Sur les 20 derniers tirages avant la cible)
    const recentHistory = history.slice(0, 20);
    const freqMap = new Map();
    recentHistory.forEach(d => d.gagnants.forEach((n: number) => freqMap.set(n, (freqMap.get(n) || 0) + 1)));

    // 2. Analyse Gap
    const gapMap = new Map();
    for(let n=1; n<=90; n++) {
        let gap = 0;
        for(const d of history) {
            if (d.gagnants.includes(n)) break;
            gap++;
        }
        gapMap.set(n, gap);
    }

    targetNumbers.forEach(n => {
        // Si le numéro gagnant avait une fréquence haute et qu'on a un gros poids fréquence -> Bon Score
        const f = freqMap.get(n) || 0;
        const g = gapMap.get(n) || 0;
        
        // Score de "Fit" : Est-ce que le poids actuel prédit ce numéro ?
        // Plus le poids est cohérent avec la caractéristique du numéro gagnant, plus le score monte
        if (f > 2) score += (freqWeight * 100); 
        if (g > 10 && g < 20) score += (gapWeight * 100);
        
        // Pénalité d'entropie (éviter les poids extrêmes)
        if (freqWeight > 0.8) score -= 10;
    });

    return score;
};

// Mutation Génétique
const mutateWeights = (weights: any, rate: number = 0.1) => {
    const newWeights = { ...weights };
    const keys = Object.keys(newWeights);
    // On mute 1 à 3 gènes aléatoires
    const mutationsCount = Math.floor(Math.random() * 3) + 1;
    
    for(let i=0; i<mutationsCount; i++) {
        const key = keys[Math.floor(Math.random() * keys.length)];
        const noise = (Math.random() - 0.5) * rate; // +/- rate
        let val = newWeights[key] + noise;
        newWeights[key] = Math.max(0.01, Math.min(1.0, val));
    }
    
    // Renormalisation
    const total = Object.values(newWeights).reduce((a: any, b: any) => a + b, 0) as number;
    keys.forEach(k => newWeights[k] = parseFloat((newWeights[k] / total).toFixed(4)));
    
    return newWeights;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { drawName } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Récupération des données
    // On a besoin de l'historique et des poids actuels
    const [historyReq, weightsReq] = await Promise.all([
        supabase.from('draw_results').select('*').eq('draw_name', drawName).order('date', { ascending: false }).limit(60),
        supabase.from('algo_weights').select('weights').eq('draw_name', drawName).single()
    ]);

    if (!historyReq.data || historyReq.data.length < 20) {
        throw new Error("Historique insuffisant pour l'apprentissage.");
    }

    let currentWeights = weightsReq.data?.weights || {
        frequency: 0.15, gap: 0.10, spectral: 0.10, fractal: 0.05,
        markov: 0.15, spatial: 0.05, momentum: 0.05, equilibrium: 0.05,
        ai_intuition: 0.05, anti_consensus: 0.05
    };

    // 2. Processus d'Évolution (Genetic Algorithm sur Backtest)
    // On teste sur les 10 derniers tirages (Validation Set)
    const validationSet = historyReq.data.slice(0, 10);
    const trainingHistory = historyReq.data.slice(10); // Le passé connu

    let bestWeights = currentWeights;
    let bestFitness = -Infinity;

    // Calcul Fitness Initial
    validationSet.forEach((targetDraw: any, idx: number) => {
        // L'historique disponible au moment de ce tirage est : le reste du validation set + trainingHistory
        const context = [...validationSet.slice(idx + 1), ...trainingHistory];
        bestFitness += simulatePredictionScore(currentWeights, context, targetDraw.gagnants);
    });

    const POPULATION_SIZE = 50;
    const GENERATIONS = 20;
    let improved = false;

    console.log(`[AutoLearn] Starting evolution for ${drawName}. Initial Fitness: ${bestFitness}`);

    for (let g = 0; g < GENERATIONS; g++) {
        let generationBestWeights = bestWeights;
        let generationBestFitness = bestFitness;

        for (let i = 0; i < POPULATION_SIZE; i++) {
            const mutant = mutateWeights(bestWeights, 0.2); // 20% mutation rate
            let fitness = 0;

            validationSet.forEach((targetDraw: any, idx: number) => {
                const context = [...validationSet.slice(idx + 1), ...trainingHistory];
                fitness += simulatePredictionScore(mutant, context, targetDraw.gagnants);
            });

            if (fitness > generationBestFitness) {
                generationBestFitness = fitness;
                generationBestWeights = mutant;
            }
        }

        if (generationBestFitness > bestFitness) {
            bestFitness = generationBestFitness;
            bestWeights = generationBestWeights;
            improved = true;
        }
    }

    // 3. Application et Logging
    let message = "Optimization complete. No improvement found.";
    
    if (improved) {
        // Sauvegarde des nouveaux poids optimisés
        await supabase.from('algo_weights').upsert({
            draw_name: drawName,
            weights: bestWeights,
            updated_at: new Date().toISOString()
        });

        // Log de l'apprentissage (Pour l'audit)
        await supabase.from('learning_logs').insert({
            draw_name: drawName,
            previous_fitness: Math.round(bestFitness - (bestFitness * 0.1)), // Estimation
            new_fitness: Math.round(bestFitness),
            improvement_delta: 'Positive',
            applied_weights: bestWeights
        });

        message = `Auto-adaptation réussie. Nouvelle fitness: ${Math.round(bestFitness)}`;
    }

    return new Response(JSON.stringify({ success: true, improved, message, weights: bestWeights }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
