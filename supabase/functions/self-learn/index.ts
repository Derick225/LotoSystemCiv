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

const evaluateGenome = (weights: any, signalMatrix: Record<number, any>, targets: number[]) => {
    let score = 0
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
    
    let exactHits = 0
    let nearMisses = 0
    
    top10.forEach(n => {
        if (targets.includes(n)) {
            exactHits++
        } else if (targets.includes(n - 1) || targets.includes(n + 1)) {
            nearMisses++
        }
    })
    
    score += Math.pow(exactHits, 2) * 100 + (nearMisses * 25)
    return score
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const startTime = Date.now()
    const { drawName } = await req.json()
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if(!supabaseUrl || !supabaseKey) throw new Error("Config Supabase manquante")
    
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: rawHistory } = await supabase
        .from('draw_results')
        .select('gagnants, machine')
        .eq('draw_name', drawName)
        .order('date', { ascending: false })
        .limit(60)

    const history = rawHistory as { gagnants: number[], machine: number[] }[] | null

    if (!history || history.length < 30) throw new Error("Historique insuffisant pour l'apprentissage.")

    const validationSet = history.slice(0, 10)
    const trainingContext = history.slice(10, 60)

    const signalMatrix: Record<number, any> = {}
    
    for (let i = 1; i <= 90; i++) {
        const freq = trainingContext.filter(d => d.gagnants.includes(i)).length
        const lastIdx = trainingContext.findIndex(d => d.gagnants.includes(i))
        const gap = lastIdx === -1 ? 50 : lastIdx
        
        const momentum = trainingContext.slice(0, 5).filter(d => d.gagnants.includes(i)).length
        const wasInLastMachine = trainingContext[0]?.machine?.includes(i) || false

        signalMatrix[i] = {
            freq: freq / 50,
            isGapMatch: gap >= 8 && gap <= 22,
            markov: 0.1,
            momentum: momentum,
            machineTransfer: wasInLastMachine
        }
    }
    
    const targets = [...new Set(validationSet.flatMap(d => d.gagnants))]

    const { data: current } = await supabase.from('algo_weights').select('weights, updated_at').eq('draw_name', drawName).single()
    
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
    let bestScore = evaluateGenome(bestW, signalMatrix, targets)
    let improved = false
    
    let population = Array(25).fill(null).map((_, i) => {
        if (i === 0) return { ...bestW }
        const mutant = { ...bestW }
        const gene = GENOME_KEYS[Math.floor(Math.random() * GENOME_KEYS.length)]
        mutant[gene] = Math.max(0.01, Math.min(1.0, (mutant[gene] || 0.1) + (Math.random() - 0.5) * 0.3))
        return mutant
    })

    const MAX_TIME_MS = 45000

    for (let g = 0; g < 200; g++) {
        if (Date.now() - startTime > MAX_TIME_MS) {
            console.log(`Self-learn watchdog triggered at generation ${g}`)
            break
        }

        const scored = population.map(w => ({ w, s: evaluateGenome(w, signalMatrix, targets) }))
        scored.sort((a, b) => b.s - a.s)
        
        if (scored[0].s > bestScore) {
            bestScore = scored[0].s
            bestW = scored[0].w
            improved = true
        }

        const survivors = scored.slice(0, 5).map(x => x.w)
        population = [...survivors]

        while(population.length < 25) {
            const parent = survivors[Math.floor(Math.random() * survivors.length)]
            const child = { ...parent }
            
            const mutationRate = 0.2 * (1 - (g/40))
            if (Math.random() < 0.7) {
                const gene = GENOME_KEYS[Math.floor(Math.random() * GENOME_KEYS.length)]
                child[gene] = Math.max(0.01, Math.min(1.0, (child[gene] || 0.1) + (Math.random() - 0.5) * mutationRate))
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
        delta: improved ? ((evaluateGenome(bestW, signalMatrix, targets) - evaluateGenome(current?.weights || {}, signalMatrix, targets)) / 10).toFixed(1) : "0"
    }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
    })

  } catch (error: any) {
    console.error("Self Learn Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
