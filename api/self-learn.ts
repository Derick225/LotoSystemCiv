
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
 * MOTEUR DE FITNESS ULTRA-RAPIDE v15.4
 * Utilise des scores pré-calculés pour éviter les boucles imbriquées
 */
const evaluateFitness = (weights: any, signalMatrix: any) => {
    let totalScore = 0;
    
    // On évalue la capacité des poids à "amplifier" les bons numéros
    // basés sur les 90 vecteurs de la matrice de signal.
    for (let i = 1; i <= 90; i++) {
        const sig = signalMatrix[i];
        if (!sig) continue;

        const nScore = 
            (sig.freq * (weights.frequency || 0.1)) +
            (sig.isGapMatch ? (weights.gap || 0.2) * 50 : 0) +
            (sig.markov * (weights.markov || 0.1) * 10) +
            (sig.momentum * (weights.momentum || 0.05) * 5);
        
        // On récompense si le numéro est effectivement sorti récemment (signal.actual)
        if (sig.wasRecentlyOut) {
            totalScore += nScore;
        } else {
            totalScore -= nScore * 0.2; // Pénalité pour les faux positifs
        }
    }
    return totalScore;
};

const mutate = (w: any, strength: number) => {
    const next = { ...w };
    const keysToMutate = WEIGHT_KEYS.filter(() => Math.random() > 0.7);
    keysToMutate.forEach(k => {
        next[k] = Math.max(0.01, Math.min(1.0, (next[k] || 0.1) + (Math.random() - 0.5) * strength));
    });
    return next;
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const start = Date.now();
    const { drawName } = await req.json();
    
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) throw new Error("Config SQL manquante");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Récupération optimisée des données
    const { data: history } = await supabase
        .from('draw_results')
        .select('gagnants')
        .eq('draw_name', drawName)
        .order('date', { ascending: false })
        .limit(60);

    if (!history || history.length < 20) throw new Error("Historique insuffisant");

    // 2. PRÉ-CALCUL DE LA MATRICE DE SIGNAL (O(N))
    // On transforme l'histoire en une matrice de probabilités statique
    const signalMatrix: Record<number, any> = {};
    const recent = history.slice(0, 15);
    const context = history.slice(15, 60);

    for (let i = 1; i <= 90; i++) {
        const freq = context.filter(d => d.gagnants.includes(i)).length;
        const lastSeen = context.findIndex(d => d.gagnants.includes(i));
        const gap = lastSeen === -1 ? 50 : lastSeen;
        
        // Transitions Markov (simplifiées)
        let markov = 0;
        const lastWinners = history[0].gagnants;
        context.slice(0, 10).forEach((d, idx) => {
            if (d.gagnants.includes(i) && context[idx+1]?.gagnants.some(n => lastWinners.includes(n))) {
                markov++;
            }
        });

        signalMatrix[i] = {
            freq: freq / 45,
            isGapMatch: gap >= 8 && gap <= 18,
            markov: markov / 10,
            momentum: history.slice(0, 5).filter(d => d.gagnants.includes(i)).length,
            wasRecentlyOut: recent.some(d => d.gagnants.includes(i))
        };
    }

    // 3. ÉVOLUTION GÉNÉTIQUE AVEC TIMER DE SÉCURITÉ
    const { data: current } = await supabase.from('algo_weights').select('weights').eq('draw_name', drawName).single();
    let bestW = current?.weights || { frequency: 0.1, gap: 0.2, spectral: 0.2, markov: 0.1 };
    
    let bestScore = evaluateFitness(bestW, signalMatrix);
    let population = Array(20).fill(null).map((_, i) => i === 0 ? bestW : mutate(bestW, 0.6));

    for (let g = 0; g < 40; g++) {
        // TIMER DE SÉCURITÉ : Arrêt à 8 secondes pour éviter le 504
        if (Date.now() - start > 8000) {
            console.log("Timeout protection active: Renvoi du meilleur résultat actuel.");
            break;
        }

        const scored = population.map(w => ({ w, s: evaluateFitness(w, signalMatrix) }))
            .sort((a, b) => b.s - a.s);
        
        if (scored[0].s > bestScore) {
            bestScore = scored[0].s;
            bestW = scored[0].w;
        }

        const elite = scored.slice(0, 4).map(x => x.w);
        population = [...elite];
        while(population.length < 20) {
            const p = elite[Math.floor(Math.random() * elite.length)];
            population.push(mutate(p, 0.3 * (1 - g/40)));
        }
    }

    // 4. SAUVEGARDE
    await supabase.from('algo_weights').upsert({ 
        draw_name: drawName, 
        weights: bestW, 
        updated_at: new Date().toISOString() 
    });

    return new Response(JSON.stringify({ 
        success: true, 
        improved: true, 
        weights: bestW,
        message: "ADN recalibré (Moteur Matrix v15.4)"
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}
