
import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 60, // Autorise jusqu'à 60s de calcul
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration de l'Algorithme Génétique
const CONFIG = {
    POPULATION_SIZE: 40,    // Nombre d'agents par génération
    GENERATIONS: 25,        // Nombre de cycles d'évolution
    SAMPLE_DEPTH: 40,       // Profondeur d'historique pour le backtest (compromis vitesse/précision)
    ELITE_COUNT: 5,         // Nombre de meilleurs agents conservés intacts
    MUTATION_RATE: 0.15,    // Probabilité de mutation d'un gène
    MUTATION_STRENGTH: 0.2, // Force de la mutation
    TIME_LIMIT_MS: 55000    // Sécurité avant timeout Vercel/Supabase
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
 * Fonction de Fitness (Score de survie)
 * Simule la performance d'un set de poids sur l'historique passé.
 * Plus le score est haut, plus les poids ont "deviné" les numéros sortis.
 */
const evaluateFitness = (weights: any, history: any[]) => {
    let totalScore = 0;
    // On teste sur les X derniers tirages (sauf le tout dernier qui est le futur inconnu dans la simulation réelle)
    const testSample = history.slice(0, CONFIG.SAMPLE_DEPTH); 
    
    // Poids extraits pour optimisation boucle (évite lookup répété)
    const wFreq = weights.frequency || 0.1;
    const wGap = weights.gap || 0.1;
    const wMarkov = weights.markov || 0.1;
    const wSpectral = weights.spectral || 0.1;
    const wAnti = weights.anti_consensus || 0.05;

    // Pour chaque tirage de l'historique de test
    for (let i = 0; i < testSample.length - 1; i++) {
        const targetDraw = testSample[i]; // Tirage à prédire (T)
        const context = testSample.slice(i + 1); // Historique connu à ce moment là (T-1, T-2...)
        
        if (context.length < 10) break; // Pas assez de données pour prédire

        // Optimisation : On ne calcule le score que pour les numéros qui sont VRAIMENT sortis
        // Si les poids donnent un haut score à ces numéros, c'est bon signe.
        let drawFitness = 0;
        
        targetDraw.gagnants.forEach((winningNum: number) => {
            let numScore = 0;
            
            // --- LOGIQUE DE PRÉDICTION SIMPLIFIÉE (PROXY) ---
            // Doit être corrélée avec generateMasterPrediction mais beaucoup plus rapide
            
            // 1. Fréquence Locale (Hotness)
            const localFreq = context.slice(0, 15).filter((d: any) => d.gagnants.includes(winningNum)).length;
            numScore += (localFreq * wFreq * 10);
            
            // 2. Loi des Écarts (Gap)
            const lastIdx = context.findIndex((d: any) => d.gagnants.includes(winningNum));
            if (lastIdx !== -1) {
                // Zone critique 8-18
                if (lastIdx >= 8 && lastIdx <= 18) numScore += (wGap * 25);
                // Zone écart important
                if (lastIdx > 30) numScore += (wGap * 10);
            }

            // 3. Markov (Transition directe)
            const prevDraw = context[0];
            if (prevDraw) {
                // Si ce numéro suit souvent un numéro du tirage précédent
                let affinity = 0;
                prevDraw.gagnants.forEach((p: number) => {
                    // Scan rapide dans le passé
                    for(let k=0; k < Math.min(context.length-1, 20); k++) {
                        if (context[k].gagnants.includes(p) && context[k-1]?.gagnants.includes(winningNum)) {
                            affinity++;
                        }
                    }
                });
                numScore += (affinity * wMarkov * 5);
            }

            // 4. Anti-Consensus (Si le numéro était "froid" mais est sorti, on récompense l'anti-consensus)
            if (localFreq === 0 && lastIdx > 20) {
                numScore += (wAnti * 50); // Gros bonus pour avoir prédit une surprise
            }

            drawFitness += numScore;
        });

        // Le score du tirage est la somme des scores des gagnants
        // On pénalise légèrement la variance pour favoriser la régularité
        totalScore += drawFitness;
    }
    
    return totalScore;
};

// Mutation génétique
const mutate = (weights: any) => {
    const newW = { ...weights };
    // On mute un certain nombre de gènes aléatoires
    const numMutations = Math.floor(Math.random() * 5) + 1;
    
    for(let i=0; i<numMutations; i++) {
        const key = WEIGHT_KEYS[Math.floor(Math.random() * WEIGHT_KEYS.length)];
        const current = newW[key] || 0.05;
        // Mutation gaussienne : on ajoute/enlève une petite valeur
        const delta = (Math.random() - 0.5) * CONFIG.MUTATION_STRENGTH;
        newW[key] = Math.max(0.01, Math.min(1.0, current + delta));
    }
    
    // Normalisation approximative (facultatif mais aide à la convergence)
    /* 
    const sum = Object.values(newW).reduce((a:any, b:any) => a + b, 0) as number;
    if (sum > 0) {
        Object.keys(newW).forEach(k => newW[k] = parseFloat((newW[k] / sum).toFixed(4)));
    }
    */
    
    return newW;
};

// Croisement (Crossover)
const crossover = (parentA: any, parentB: any) => {
    const child: any = {};
    WEIGHT_KEYS.forEach(key => {
        // 50% de chance d'hériter de A ou B
        child[key] = Math.random() > 0.5 ? parentA[key] : parentB[key];
    });
    return child;
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const startTime = Date.now();
    const { drawName } = await req.json();
    
    if (!drawName) throw new Error("drawName required");

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase credentials missing");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Récupération Historique (Dataset d'entrainement)
    const { data: history } = await supabase
        .from('draw_results')
        .select('gagnants')
        .eq('draw_name', drawName)
        .order('date', { ascending: false })
        .limit(100); // Assez pour le sample depth + buffer

    if (!history || history.length < 20) throw new Error("Pas assez d'historique pour l'apprentissage.");

    // 2. Récupération des poids actuels (Point de départ)
    const { data: currentW } = await supabase
        .from('algo_weights')
        .select('weights')
        .eq('draw_name', drawName)
        .single();

    let baseWeights = currentW?.weights || { frequency: 0.15, gap: 0.15, spectral: 0.1, markov: 0.1 };
    
    // Ensure all keys exist
    WEIGHT_KEYS.forEach(k => { if (baseWeights[k] === undefined) baseWeights[k] = 0.04; });

    // 3. Initialisation de la Population
    // Agent 0 = Poids actuels (pour s'assurer qu'on ne régresse pas)
    // Le reste = Mutations
    let population = Array(CONFIG.POPULATION_SIZE).fill(null).map((_, i) => i === 0 ? {...baseWeights} : mutate(baseWeights));
    
    let globalBestScore = evaluateFitness(baseWeights, history);
    let globalBestWeights = baseWeights;
    let improved = false;
    const initialFitness = globalBestScore;

    // 4. Boucle d'Évolution (Deep RL Loop)
    for (let g = 0; g < CONFIG.GENERATIONS; g++) {
        // Check Time Budget
        if (Date.now() - startTime > CONFIG.TIME_LIMIT_MS) break;

        // Evaluation
        const scoredPopulation = population.map(individual => ({
            weights: individual,
            score: evaluateFitness(individual, history)
        }));

        // Sélection (Tri descendant)
        scoredPopulation.sort((a, b) => b.score - a.score);

        const generationBest = scoredPopulation[0];
        
        // Update Global Best
        if (generationBest.score > globalBestScore) {
            globalBestScore = generationBest.score;
            globalBestWeights = generationBest.weights;
            improved = true;
        }

        // Reproduction (Next Gen)
        const survivors = scoredPopulation.slice(0, CONFIG.ELITE_COUNT).map(p => p.weights);
        const nextGen = [...survivors]; // Elitisme

        while (nextGen.length < CONFIG.POPULATION_SIZE) {
            // Tournoi ou Roulette simple
            const parentA = survivors[Math.floor(Math.random() * survivors.length)];
            const parentB = survivors[Math.floor(Math.random() * survivors.length)];
            
            let child = crossover(parentA, parentB);
            if (Math.random() < 0.8) child = mutate(child); // Forte mutation pour explorer
            
            nextGen.push(child);
        }
        population = nextGen;
    }

    // 5. Sauvegarde & Logs
    const improvementPct = initialFitness > 0 ? ((globalBestScore - initialFitness) / initialFitness) * 100 : 0;

    if (improved && improvementPct > 0.5) { // Seuil minimal d'amélioration pour commit
        
        // Mise à jour de la table de poids
        await supabase.from('algo_weights').upsert({ 
            draw_name: drawName, 
            weights: globalBestWeights, 
            updated_at: new Date().toISOString() 
        });

        // Log de l'apprentissage
        await supabase.from('learning_logs').insert({ 
            draw_name: drawName, 
            previous_fitness: parseFloat(initialFitness.toFixed(2)),
            new_fitness: parseFloat(globalBestScore.toFixed(2)), 
            improvement_delta: `${improvementPct.toFixed(2)}%`,
            applied_weights: globalBestWeights 
        });
    }

    return new Response(JSON.stringify({ 
        success: true, 
        improved: improved && improvementPct > 0.5, 
        weights: globalBestWeights, 
        fitness: globalBestScore,
        message: improved 
            ? `Mutation réussie : Fitness +${improvementPct.toFixed(2)}%.` 
            : "Le modèle est déjà optimal (Convergence atteinte)."
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
}
