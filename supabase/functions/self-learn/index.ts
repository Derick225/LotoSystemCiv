import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GENOME_KEYS = [
    'frequency', 'gap', 'spectral', 'markov', 'wavelet', 
    'momentum', 'equilibrium', 'orchestration', 'anti_consensus',
    'machine_transfer'
]

// Évaluation robuste avec validation croisée (Cross-Validation)
const evaluateGenome = (weights: any, foldsData: { signalMatrix: Record<number, any>, targets: number[][] }[]) => {
    let totalScore = 0
    
    for (const fold of foldsData) {
        const { signalMatrix, targets } = fold
        let candidates = []
        
        for (let i = 1; i <= 90; i++) {
            const sig = signalMatrix[i]
            if (!sig) continue

            const val = 
                (sig.freq * (weights.frequency || 0.1)) +
                (sig.isGapMatch ? (weights.gap || 0.2) * 50 : 0) +
                (sig.markov * (weights.markov || 0.1) * 20) +
                (sig.momentum * (weights.momentum || 0.05) * 10) +
                (sig.machineTransfer ? (weights.machine_transfer || 0.1) * 30 : 0)
                
            candidates.push({ n: i, v: val })
        }
        
        candidates.sort((a,b) => b.v - a.v)
        const top10 = candidates.slice(0, 10).map(c => c.n)
        
        let foldScore = 0
        // Évaluation tirage par tirage pour éviter le "curve-fitting" sur un bloc aplati
        for (const drawTargets of targets) {
            let exactHits = 0
            let nearMisses = 0
            
            top10.forEach(n => {
                if (drawTargets.includes(n)) {
                    exactHits++
                } else if (drawTargets.includes(n - 1) || drawTargets.includes(n + 1)) {
                    nearMisses++
                }
            })
            
            foldScore += Math.pow(exactHits, 2) * 100 + (nearMisses * 25)
        }
        totalScore += foldScore / (targets.length || 1)
    }
    
    return totalScore / (foldsData.length || 1)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const startTime = Date.now()
    const body = await req.json()
    const rawDrawName = body.drawName || 'Global'
    const drawName = rawDrawName.trim().charAt(0).toUpperCase() + rawDrawName.trim().slice(1).toLowerCase().replace(/(\s[a-z])/g, (c: string) => c.toUpperCase());
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if(!supabaseUrl || !supabaseKey) throw new Error("Config Supabase manquante")
    
    const supabase = createClient(supabaseUrl, supabaseKey)

    // On récupère plus d'historique pour la validation croisée (Walk-Forward)
    const { data: rawHistory } = await supabase
        .from('draw_results')
        .select('gagnants, machine')
        .eq('draw_name', drawName)
        .order('date', { ascending: false })
        .limit(100)

    const history = rawHistory as { gagnants: number[], machine: number[] }[] | null

    if (!history || history.length < 40) {
        return new Response(JSON.stringify({ success: false, message: "Historique insuffisant pour l'apprentissage (minimum 40 tirages)." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Création des Folds (Plis) pour la validation croisée temporelle
    const FOLDS = 3;
    const FOLD_SIZE = 5; // On valide sur 5 tirages par fold
    const TRAIN_SIZE = 50; // On s'entraîne sur 50 tirages
    const foldsData = [];

    for (let k = 0; k < FOLDS; k++) {
        const startIdx = k * FOLD_SIZE;
        const validationSet = history.slice(startIdx, startIdx + FOLD_SIZE);
        const trainingContext = history.slice(startIdx + FOLD_SIZE, startIdx + FOLD_SIZE + TRAIN_SIZE);

        if (trainingContext.length < 30 || validationSet.length === 0) break;

        const signalMatrix: Record<number, any> = {};
        for (let i = 1; i <= 90; i++) {
            const freq = trainingContext.filter(d => d.gagnants.includes(i)).length;
            const lastIdx = trainingContext.findIndex(d => d.gagnants.includes(i));
            const gap = lastIdx === -1 ? 50 : lastIdx;
            const momentum = trainingContext.slice(0, 5).filter(d => d.gagnants.includes(i)).length;
            const wasInLastMachine = trainingContext[0]?.machine?.includes(i) || false;

            signalMatrix[i] = {
                freq: freq / trainingContext.length,
                isGapMatch: gap >= 8 && gap <= 22,
                markov: 0.1,
                momentum: momentum,
                machineTransfer: wasInLastMachine
            };
        }

        const targets = validationSet.map(d => d.gagnants);
        foldsData.push({ signalMatrix, targets });
    }

    if (foldsData.length === 0) {
        return new Response(JSON.stringify({ success: false, message: "Données insuffisantes pour créer les folds de validation." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const { data: current } = await supabase.from('algo_weights').select('weights, updated_at').eq('draw_name', drawName).maybeSingle()
    
    let lockAcquired = false
    if (current) {
        const { data: lockData } = await supabase
            .from('algo_weights')
            .update({ updated_at: new Date().toISOString() })
            .eq('draw_name', drawName)
            .eq('updated_at', current.updated_at)
            .select()
            
        if (lockData && lockData.length > 0) {
            lockAcquired = true
        }
    } else {
        const { error: insertError } = await supabase.from('algo_weights').insert({
            draw_name: drawName,
            weights: { frequency: 0.2, gap: 0.2, markov: 0.2, momentum: 0.1 },
            updated_at: new Date().toISOString()
        })
        if (!insertError) lockAcquired = true
    }

    if (!lockAcquired) {
        return new Response(JSON.stringify({ success: false, message: "Apprentissage déjà en cours (Lock)" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    let bestW = current?.weights || { frequency: 0.2, gap: 0.2, markov: 0.2, momentum: 0.1 }
    let bestScore = evaluateGenome(bestW, foldsData)
    let improved = false
    
    let population = Array(25).fill(null).map((_, i) => {
        if (i === 0) return { ...bestW }
        const mutant = { ...bestW }
        const gene = GENOME_KEYS[Math.floor(Math.random() * GENOME_KEYS.length)]
        mutant[gene] = Math.max(0.01, Math.min(1.0, (mutant[gene] || 0.1) + (Math.random() - 0.5) * 0.3))
        return mutant
    })

    const MAX_TIME_MS = 1500

    for (let g = 0; g < 100; g++) {
        if (Date.now() - startTime > MAX_TIME_MS) {
            console.log(`Self-learn watchdog triggered at generation ${g}`)
            break
        }

        const scored = population.map(w => ({ w, s: evaluateGenome(w, foldsData) }))
        scored.sort((a, b) => b.s - a.s)
        
        if (scored[0].s > bestScore) {
            bestScore = scored[0].s
            bestW = scored[0].w
            improved = true
        }

        const survivors = scored.slice(0, 5).map(x => x.w)
        population = [...survivors]

        while(population.length < 25) {
            const parent1 = survivors[Math.floor(Math.random() * survivors.length)]
            const parent2 = survivors[Math.floor(Math.random() * survivors.length)]
            const child: any = {}
            
            // Crossover uniforme
            for (const key of GENOME_KEYS) {
                child[key] = Math.random() > 0.5 ? (parent1[key] || 0.1) : (parent2[key] || 0.1)
            }
            
            // Mutation adaptative (diminue avec les générations pour affiner)
            const mutationRate = Math.max(0.02, 0.3 * (1 - (g/100)))
            if (Math.random() < 0.8) {
                // Muter 1 à 3 gènes
                const numMutations = Math.floor(Math.random() * 3) + 1;
                for (let m = 0; m < numMutations; m++) {
                    const gene = GENOME_KEYS[Math.floor(Math.random() * GENOME_KEYS.length)]
                    child[gene] = Math.max(0.01, Math.min(1.0, (child[gene] || 0.1) + (Math.random() - 0.5) * mutationRate))
                }
            }
            population.push(child)
        }
    }

    if (improved) {
        await supabase.from('algo_weights').upsert({ 
            draw_name: drawName, 
            weights: bestW, 
            updated_at: new Date().toISOString() 
        })
    }

    return new Response(JSON.stringify({ 
        success: true, 
        improved, 
        weights: bestW,
        delta: improved ? (bestScore - evaluateGenome(current?.weights || {}, foldsData)).toFixed(2) : "0"
    }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
    })

  } catch (error: any) {
    console.error("Self Learn Error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ success: false, message: errorMessage, error: errorMessage }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
