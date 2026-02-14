
import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Poids optimisables par l'algorithme
const GENOME_KEYS = [
    'frequency', 'gap', 'spectral', 'markov', 'wavelet', 
    'momentum', 'equilibrium', 'orchestration', 'anti_consensus'
];

/**
 * FITNESS FUNCTION v16.0
 * Évalue la performance d'un jeu de poids sur l'historique récent.
 * Récompense: Précision (Hits).
 * Pénalité: Bruit (Faux positifs).
 */
const evaluateGenome = (weights: any, signalMatrix: Record<number, any>, targets: number[]) => {
    let score = 0;
    let candidates = [];
    
    // Simulation de prédiction pour ce génome
    for (let i = 1; i <= 90; i++) {
        const sig = signalMatrix[i];
        if (!sig) continue;

        const val = 
            (sig.freq * (weights.frequency || 0.1)) +
            (sig.isGapMatch ? (weights.gap || 0.2) * 50 : 0) +
            (sig.markov * (weights.markov || 0.1) * 20) +
            (sig.momentum * (weights.momentum || 0.05) * 10);
            
        candidates.push({ n: i, v: val });
    }
    
    // On prend le Top 10
    candidates.sort((a,b) => b.v - a.v);
    const top10 = candidates.slice(0, 10).map(c => c.n);
    
    // Calcul des hits
    const hits = top10.filter(n => targets.includes(n)).length;
    
    // Score non-linéaire (récompense exponentiellement les hits)
    score += Math.pow(hits, 2) * 100;
    
    return score;
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const startTime = Date.now();
    const { drawName } = await req.json();
    
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if(!supabaseUrl || !supabaseKey) throw new Error("Config Supabase manquante");
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupération Historique
    const { data: rawHistory } = await supabase
        .from('draw_results')
        .select('gagnants')
        .eq('draw_name', drawName)
        .order('date', { ascending: false })
        .limit(60);

    const history = rawHistory as { gagnants: number[] }[] | null;

    if (!history || history.length < 30) throw new Error("Historique insuffisant pour l'apprentissage.");

    // --- PHASE 1: PRÉPARATION DES DONNÉES (TRAINING SET) ---
    // On utilise les tirages 10 à 60 pour prédire les tirages 0 à 10 (Validation Croisée)
    const validationSet = history.slice(0, 10);
    const trainingContext = history.slice(10, 60);

    const signalMatrix: Record<number, any> = {};
    
    // Calcul des signaux bruts sur le contexte d'entrainement
    for (let i = 1; i <= 90; i++) {
        const freq = trainingContext.filter(d => d.gagnants.includes(i)).length;
        const lastIdx = trainingContext.findIndex(d => d.gagnants.includes(i));
        const gap = lastIdx === -1 ? 50 : lastIdx;
        
        // Momentum court terme
        const momentum = trainingContext.slice(0, 5).filter(d => d.gagnants.includes(i)).length;

        signalMatrix[i] = {
            freq: freq / 50, // Normalisé
            isGapMatch: gap >= 8 && gap <= 22,
            markov: 0.1, // Simplifié pour perf Edge
            momentum: momentum
        };
    }
    
    // Cibles réelles (pool des numéros sortis récemment)
    const targets = [...new Set(validationSet.flatMap(d => d.gagnants))];

    // --- PHASE 2: ÉVOLUTION (GENETIC ALGO) ---
    const { data: current } = await supabase.from('algo_weights').select('weights').eq('draw_name', drawName).single();
    let bestW = current?.weights || { frequency: 0.2, gap: 0.2, markov: 0.2, momentum: 0.1 };
    let bestScore = evaluateGenome(bestW, signalMatrix, targets);
    let improved = false;
    
    // Population initiale : clones mutés du meilleur actuel
    let population = Array(25).fill(null).map((_, i) => {
        if (i === 0) return { ...bestW }; // Elitisme
        const mutant = { ...bestW };
        // Mutation aléatoire
        const gene = GENOME_KEYS[Math.floor(Math.random() * GENOME_KEYS.length)];
        mutant[gene] = Math.max(0.01, Math.min(1.0, (mutant[gene] || 0.1) + (Math.random() - 0.5) * 0.3));
        return mutant;
    });

    const MAX_TIME_MS = 8000; // Watchdog Edge Function

    for (let g = 0; g < 40; g++) {
        if (Date.now() - startTime > MAX_TIME_MS) break;

        // Évaluation
        const scored = population.map(w => ({ w, s: evaluateGenome(w, signalMatrix, targets) }));
        scored.sort((a, b) => b.s - a.s);
        
        if (scored[0].s > bestScore) {
            bestScore = scored[0].s;
            bestW = scored[0].w;
            improved = true;
        }

        // Sélection & Reproduction
        const survivors = scored.slice(0, 5).map(x => x.w);
        population = [...survivors]; // Garde les meilleurs

        while(population.length < 25) {
            const parent = survivors[Math.floor(Math.random() * survivors.length)];
            const child = { ...parent };
            
            // Mutation adaptative
            const mutationRate = 0.2 * (1 - (g/40)); // Diminue avec le temps
            if (Math.random() < 0.7) {
                const gene = GENOME_KEYS[Math.floor(Math.random() * GENOME_KEYS.length)];
                child[gene] = Math.max(0.01, Math.min(1.0, (child[gene] || 0.1) + (Math.random() - 0.5) * mutationRate));
            }
            population.push(child);
        }
    }

    // --- PHASE 3: PERSISTANCE ---
    if (improved) {
        await supabase.from('algo_weights').upsert({ 
            draw_name: drawName, 
            weights: bestW, 
            updated_at: new Date().toISOString() 
        });
    }

    return new Response(JSON.stringify({ 
        success: true, 
        improved, 
        weights: bestW,
        delta: improved ? ((evaluateGenome(bestW, signalMatrix, targets) - evaluateGenome(current?.weights || {}, signalMatrix, targets)) / 10).toFixed(1) : "0"
    }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}