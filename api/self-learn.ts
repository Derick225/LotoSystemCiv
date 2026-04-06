
import { createClient } from '@supabase/supabase-js';
import { AppError, logError } from '../utils/AppError';

export const config = {
  maxDuration: 60,
  runtime: 'nodejs',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Poids optimisables par l'algorithme
const GENOME_KEYS = [
    'frequency', 'gap', 'spectral', 'markov', 'wavelet', 
    'momentum', 'equilibrium', 'orchestration', 'anti_consensus',
    'machine_transfer'
];

/**
 * FITNESS FUNCTION v16.1
 * Évalue la performance d'un jeu de poids sur l'historique récent.
 * Récompense: Précision (Hits) et Near Misses (+/- 1).
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
            (sig.momentum * (weights.momentum || 0.05) * 10) +
            (sig.machineTransfer ? (weights.machine_transfer || 0.1) * 30 : 0);
            
        candidates.push({ n: i, v: val });
    }
    
    // On prend le Top 10
    candidates.sort((a,b) => b.v - a.v);
    const top10 = candidates.slice(0, 10).map(c => c.n);
    
    // Calcul des hits et near misses
    let exactHits = 0;
    let nearMisses = 0;
    
    top10.forEach(n => {
        if (targets.includes(n)) {
            exactHits++;
        } else if (targets.includes(n - 1) || targets.includes(n + 1)) {
            nearMisses++;
        }
    });
    
    // Score non-linéaire (récompense exponentiellement les hits, bonus pour near misses)
    score += Math.pow(exactHits, 2) * 100 + (nearMisses * 25);
    
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
        .select('gagnants, machine')
        .eq('draw_name', drawName)
        .order('date', { ascending: false })
        .limit(60);

    const history = rawHistory as { gagnants: number[], machine: number[] }[] | null;

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

        // Machine Transfer: Était-il dans la machine au tirage précédent ?
        // trainingContext[0] est le tirage le plus récent du contexte d'entrainement
        const wasInLastMachine = trainingContext[0]?.machine?.includes(i) || false;

        signalMatrix[i] = {
            freq: freq / 50, // Normalisé
            isGapMatch: gap >= 8 && gap <= 22,
            markov: 0.1, // Simplifié pour perf Edge
            momentum: momentum,
            machineTransfer: wasInLastMachine
        };
    }
    
    // Cibles réelles (pool des numéros sortis récemment)
    const targets = [...new Set(validationSet.flatMap(d => d.gagnants))];

    // --- PHASE 2: ÉVOLUTION (GENETIC ALGO) ---
    const { data: current } = await supabase.from('algo_weights').select('weights, updated_at').eq('draw_name', drawName).single();
    
    // "Soft Lock" (OCC) : On met à jour le updated_at tout de suite pour signaler qu'on travaille dessus
    // Cela empêche d'autres instances lancées en même temps de faire le même calcul lourd.
    let lockAcquired = false;
    if (current) {
        const { data: lockData } = await supabase
            .from('algo_weights')
            .update({ updated_at: new Date().toISOString() })
            .eq('draw_name', drawName)
            .eq('updated_at', current.updated_at)
            .select();
            
        if (lockData && lockData.length > 0) {
            lockAcquired = true;
        }
    } else {
        const { error: insertError } = await supabase.from('algo_weights').insert({
            draw_name: drawName,
            weights: { frequency: 0.2, gap: 0.2, markov: 0.2, momentum: 0.1 },
            updated_at: new Date().toISOString()
        });
        if (!insertError) lockAcquired = true;
    }

    if (!lockAcquired) {
        console.warn(`[LOCK] Un autre processus apprend déjà pour ${drawName}. Abandon pour économiser le CPU.`);
        return new Response(JSON.stringify({ success: false, message: "Apprentissage déjà en cours (Lock)" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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

    const MAX_TIME_MS = 45000; // Watchdog Node.js (Max 60s)

    for (let g = 0; g < 200; g++) {
        if (Date.now() - startTime > MAX_TIME_MS) {
            console.log(`Self-learn watchdog triggered at generation ${g}`);
            break;
        }

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
    logError(new AppError(e.message || "Erreur lors de l'apprentissage", "SELF_LEARN_ERROR", "high", { error: e }), { source: 'api/self-learn' });
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}