
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONFIG = {
    POPULATION_SIZE: 20,
    GENERATIONS: 12,
    SAMPLE_DEPTH: 25 // Profondeur d'analyse
};

// Fonction de Fitness Avancée : Simulation de Backtesting
// Évalue la performance des poids sur les N derniers tirages
const backtestFitness = (weights: any, history: any[], metrics: any) => {
    let totalScore = 0;
    const testDraws = history.slice(0, 10); // On teste sur les 10 plus récents

    // Poids normalisés pour éviter l'explosion
    const wFreq = weights.frequency || 0.1;
    const wGap = weights.gap || 0.1;
    const wMarkov = weights.markov || 0.1;

    testDraws.forEach((targetDraw, index) => {
        // Le contexte est ce qui s'est passé AVANT ce tirage (donc indices > index)
        const context = history.slice(index + 1, index + 20);
        if (context.length < 5) return;

        let drawFitness = 0;
        
        targetDraw.gagnants.forEach((winningNum: number) => {
            // 1. Score Fréquence (Sur le contexte)
            const freq = context.filter(d => d.gagnants.includes(winningNum)).length;
            drawFitness += (freq * wFreq);

            // 2. Score Gap (Écart au moment du tirage)
            let gap = 0;
            for(const d of context) {
                if (d.gagnants.includes(winningNum)) break;
                gap++;
            }
            // Bonus si le gap est dans la "zone critique" (8-18)
            if (gap >= 8 && gap <= 18) drawFitness += (wGap * 5);

            // 3. Score Markov (Transition depuis le tirage précédent)
            const prevDraw = context[0]; // T-1 par rapport au target
            if (prevDraw) {
                // Si le numéro gagnant était un "voisin" ou "miroir" d'un numéro de T-1
                const isLinked = prevDraw.gagnants.some((p: number) => 
                    Math.abs(p - winningNum) === 1 || p === (91 - winningNum)
                );
                if (isLinked) drawFitness += (wMarkov * 3);
            }
        });

        totalScore += drawFitness;
    });

    return totalScore;
};

const mutate = (weights: any) => {
    const newW = { ...weights };
    const keys = Object.keys(newW);
    if (keys.length === 0) return newW;
    
    // Mutation de 1 à 3 gènes
    const mutationCount = Math.floor(Math.random() * 3) + 1;
    for(let i=0; i<mutationCount; i++) {
        const key = keys[Math.floor(Math.random() * keys.length)];
        const noise = (Math.random() - 0.5) * 0.4; // +/- 0.2
        newW[key] = Math.max(0.01, Math.min(1.0, (newW[key] || 0.1) + noise));
    }
    return newW;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
        throw new Error("Configuration Serveur Incomplète.");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    let body;
    try { body = await req.json(); } catch (e) { throw new Error("JSON invalide."); }
    
    const { drawName } = body;
    if (!drawName) throw new Error("Paramètre 'drawName' requis.");

    // 2. Récupération Données
    const { data: history, error: dbError } = await supabase
        .from('draw_results')
        .select('gagnants')
        .eq('draw_name', drawName)
        .order('date', { ascending: false })
        .limit(CONFIG.SAMPLE_DEPTH + 15);

    if (dbError) throw new Error(`Erreur DB: ${dbError.message}`);

    const { data: currentW } = await supabase
        .from('algo_weights')
        .select('weights')
        .eq('draw_name', drawName)
        .single();

    if (!history || history.length < 20) {
        return new Response(JSON.stringify({ 
            success: false, 
            message: "Historique insuffisant pour l'apprentissage (<20)." 
        }), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    // 3. Logique Métier (Optimisation Génétique)
    // Pré-calcul de métriques globales si nécessaire (ici simplifié dans backtestFitness)
    const metrics = {}; 

    let bestWeights = currentW?.weights || { 
        frequency: 0.2, gap: 0.2, spectral: 0.1, markov: 0.2, spatial: 0.1,
        momentum: 0.1, anti_consensus: 0.05, leader_succession: 0.05
    };
    
    let previousScore = backtestFitness(bestWeights, history, metrics);
    let bestScore = previousScore;
    let improved = false;

    // Population initiale : Le champion actuel + des mutants
    let population = Array(CONFIG.POPULATION_SIZE).fill(null).map((_, i) => 
        i === 0 ? { ...bestWeights } : mutate(bestWeights)
    );

    // Boucle évolutionnaire
    for (let g = 0; g < CONFIG.GENERATIONS; g++) {
        // Évaluation
        const scoredPop = population.map(w => ({
            w,
            score: backtestFitness(w, history, metrics)
        }));

        // Sélection (Top 20%)
        scoredPop.sort((a, b) => b.score - a.score);
        
        if (scoredPop[0].score > bestScore) {
            bestScore = scoredPop[0].score;
            bestWeights = scoredPop[0].w;
            improved = true;
        }

        // Reproduction (Élitisme + Mutation)
        const survivors = scoredPop.slice(0, Math.floor(CONFIG.POPULATION_SIZE * 0.2)).map(p => p.w);
        const nextGen = [...survivors];
        
        while (nextGen.length < CONFIG.POPULATION_SIZE) {
            const parent = survivors[Math.floor(Math.random() * survivors.length)];
            nextGen.push(mutate(parent));
        }
        population = nextGen;
    }

    // 4. Sauvegarde & Logs
    if (improved) {
        // Mise à jour des poids
        await supabase.from('algo_weights').upsert({
            draw_name: drawName,
            weights: bestWeights,
            updated_at: new Date().toISOString()
        });

        // Journalisation (Traçabilité IA)
        const delta = previousScore > 0 
            ? ((bestScore - previousScore) / previousScore * 100).toFixed(2)
            : "N/A";

        await supabase.from('learning_logs').insert({
            draw_name: drawName,
            previous_fitness: parseFloat(previousScore.toFixed(2)),
            new_fitness: parseFloat(bestScore.toFixed(2)),
            improvement_delta: `+${delta}%`,
            applied_weights: bestWeights,
            created_at: new Date().toISOString()
        });
    }

    return new Response(JSON.stringify({ 
        success: true, 
        improved, 
        message: improved 
            ? `Optimisation réussie (Score: ${previousScore.toFixed(1)} -> ${bestScore.toFixed(1)}).` 
            : "Modèle stable (Aucune mutation bénéfique détectée).",
        weights: bestWeights 
    }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: any) {
    console.error("Self-Learn Error:", error);
    return new Response(JSON.stringify({ 
        success: false, 
        error: error.message || "Erreur interne inconnue" 
    }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});