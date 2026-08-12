import { createClient } from 'supabase'
import { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts"

const SelfLearnRequestSchema = z.object({
    drawName: z.string().default('Global')
});

const GENOME_KEYS = [
    'frequency', 'gap', 'spectral', 'markov', 'bayes', 
    'momentum', 'affinity', 'spatial', 'temporal',
    'fractal'
]

// Grid position helper on Loto 5/90 grid (10 columns, 9 rows)
const getGridPos = (val: number) => {
    const row = Math.floor((val - 1) / 10);
    const col = (val - 1) % 10;
    return { row, col };
};

// Normalize weight genomes to sum to 1.0 continuously
const normalizeGenomeWeights = (weights: Record<string, number>) => {
    const normalized: Record<string, number> = {};
    let total = 0;
    
    for (const key of GENOME_KEYS) {
        normalized[key] = Math.max(0.01, weights[key] !== undefined ? weights[key] : 0.1);
        total += normalized[key];
    }
    
    const mBias = Math.max(0.01, weights.machine_bias !== undefined ? weights.machine_bias : 0.05);
    total += mBias;
    
    for (const key of GENOME_KEYS) {
        normalized[key] = normalized[key] / total;
    }
    normalized.machine_bias = mBias / total;
    return normalized;
};

// Extract features and build signals for all 10 algorithms dynamically
const computeSignalMatrix = (trainingContext: { gagnants: number[], machine?: number[] }[]) => {
    const signalMatrix: Record<number, any> = {};
    const totalDraws = trainingContext.length || 1;
    const lastDrawWinners = trainingContext[0]?.gagnants || [];

    for (let i = 1; i <= 90; i++) {
        const freqCount = trainingContext.filter(d => d.gagnants?.includes(i)).length;
        const lastIdx = trainingContext.findIndex(d => d.gagnants?.includes(i));
        const gap = lastIdx === -1 ? 50 : lastIdx;
        const momentumCount = trainingContext.slice(0, 5).filter(d => d.gagnants?.includes(i)).length;
        const wasInLastMachine = trainingContext[0]?.machine?.includes(i) || false;

        // 1. frequency
        const freq = freqCount / totalDraws;

        // 2. gap decay (continuous exponential)
        const gapDecay = Math.exp(-0.05 * gap);

        // 3. spectral periodic wave
        const spectral = Math.abs(Math.cos(freqCount * 0.15 + gap * 0.25));

        // 4. markov transition probability
        let markovTransitionCount = 0;
        lastDrawWinners.forEach((lastNum: number) => {
            for (let d = 1; d < trainingContext.length; d++) {
                if (trainingContext[d].gagnants?.includes(lastNum) && trainingContext[d - 1].gagnants?.includes(i)) {
                    markovTransitionCount++;
                }
            }
        });
        const markov = markovTransitionCount / totalDraws;

        // 5. bayes conditional probability relative to expected average gap
        const baseLikelihood = freqCount / totalDraws;
        const bayes = baseLikelihood * (1.0 / (1.0 + Math.abs(gap - (totalDraws / (freqCount || 1)))));

        // 6. momentum
        const momentum = momentumCount / 5.0;

        // 7. affinity (co-occurrence with last winners)
        let correlationSum = 0;
        lastDrawWinners.forEach((lw: number) => {
            if (lw !== i) {
                const coOccurrences = trainingContext.filter(d => d.gagnants?.includes(i) && d.gagnants?.includes(lw)).length;
                correlationSum += coOccurrences;
            }
        });
        const affinity = correlationSum / totalDraws;

        // 8. spatial grid proximity to last winners
        let minGridDist = 99.0;
        const posI = getGridPos(i);
        lastDrawWinners.forEach((lw: number) => {
            const posLW = getGridPos(lw);
            const dist = Math.sqrt(Math.pow(posI.row - posLW.row, 2) + Math.pow(posI.col - posLW.col, 2));
            if (dist < minGridDist) minGridDist = dist;
        });
        const spatial = Math.exp(-0.5 * minGridDist);

        // 9. temporal cycle period alignment
        const occurrenceIndices: number[] = [];
        trainingContext.forEach((d, index) => {
            if (d.gagnants?.includes(i)) {
                occurrenceIndices.push(index);
            }
        });
        let avgCycle = 0;
        if (occurrenceIndices.length > 1) {
            let sumDiffs = 0;
            for (let o = 0; o < occurrenceIndices.length - 1; o++) {
                sumDiffs += (occurrenceIndices[o + 1] - occurrenceIndices[o]);
            }
            avgCycle = sumDiffs / (occurrenceIndices.length - 1);
        }
        const cycleDev = avgCycle > 0 ? (gap % avgCycle) : gap;
        const temporal = Math.exp(-0.2 * cycleDev);

        // 10. fractal multi-scale self-similarity (short vs long frequency matching)
        const shortFreq = trainingContext.slice(0, 10).filter(d => d.gagnants?.includes(i)).length / 10.0;
        const longFreq = freqCount / totalDraws;
        const fractal = Math.exp(-Math.abs(shortFreq - longFreq));

        signalMatrix[i] = {
            frequency: freq,
            gap: gapDecay,
            spectral,
            markov,
            bayes,
            momentum,
            affinity,
            spatial,
            temporal,
            fractal,
            machine_bias: wasInLastMachine ? 1.0 : 0.0
        };
    }

    return signalMatrix;
};

// Advanced evaluation with Cross-Validation and continuous Forensic Reward
const evaluateGenome = (weights: Record<string, number>, foldsData: { signalMatrix: Record<number, any>, targets: number[][] }[]) => {
    let totalScore = 0;
    const normW = normalizeGenomeWeights(weights);

    for (const fold of foldsData) {
        const { signalMatrix, targets } = fold;
        let foldScore = 0;
        
        for (const drawTargets of targets) {
            // Calculate final scored candidates [1..90] for this genome
            const candidates: Array<{ n: number, v: number }> = [];
            for (let i = 1; i <= 90; i++) {
                const sig = signalMatrix[i];
                if (!sig) continue;

                let score_i = 0;
                for (const key of GENOME_KEYS) {
                    score_i += (sig[key] || 0) * (normW[key] || 0.1);
                }
                score_i += (sig.machine_bias || 0) * (normW.machine_bias || 0.1) * 30.0;

                candidates.push({ n: i, v: score_i });
            }

            // Sort and take top 5 predicted numbers (matches 5/90 structure)
            candidates.sort((a, b) => b.v - a.v);
            const top5 = candidates.slice(0, 5).map(c => c.n);

            // 1. Hits (Exact overlaps in top 5)
            const hits = top5.filter(n => drawTargets.includes(n)).length;

            // 2. Continuous Topological Loss
            let totalContinLoss = 0;
            drawTargets.forEach((w: number) => {
                let maxSimForWinner = 1e-9;
                top5.forEach((p: number) => {
                    let sim = 0.0;
                    if (p === w) {
                        sim = 1.0;
                    } else {
                        const linSim = Math.exp(-0.25 * Math.abs(p - w));
                        const posP = getGridPos(p);
                        const posW = getGridPos(w);
                        const gridDist = Math.sqrt(Math.pow(posP.row - posW.row, 2) + Math.pow(posP.col - posW.col, 2));
                        const gridSim = Math.exp(-0.35 * gridDist);

                        let mirrorSim = 0.0;
                        if (p + w === 91) mirrorSim = 0.45;
                        const strP = p.toString();
                        const revP = parseInt(strP.split("").reverse().join(""), 10);
                        if (revP >= 1 && revP <= 90 && revP === w) mirrorSim = Math.max(mirrorSim, 0.40);

                        let harmonicSim = 0.0;
                        if (p % 10 === w % 10) harmonicSim = 0.35;

                        let decadeSim = 0.0;
                        if (Math.floor((p - 1) / 10) === Math.floor((w - 1) / 10)) decadeSim = 0.25;

                        sim = Math.max(linSim, gridSim, mirrorSim, harmonicSim, decadeSim);
                    }
                    if (sim > maxSimForWinner) maxSimForWinner = sim;
                });
                totalContinLoss += (1.0 - maxSimForWinner);
            });
            const continuousTopologicalLoss = totalContinLoss / (drawTargets.length || 5);

            // 3. Brier Score (Probabilistic Calibration)
            const temp = 1.0;
            const expScores = new Float64Array(91);
            let sumExp = 0;
            for (let i = 1; i <= 90; i++) {
                const cand = candidates.find(c => c.n === i);
                const score_i = cand ? cand.v : 0.0;
                expScores[i] = Math.exp(score_i / temp);
                sumExp += expScores[i];
            }
            
            let brierScore = 0;
            for (let i = 1; i <= 90; i++) {
                const p_i = expScores[i] / (sumExp || Number.EPSILON);
                const targetState = drawTargets.includes(i) ? 1.0 : 0.0;
                brierScore += Math.pow(p_i - targetState, 2);
            }
            brierScore = brierScore / 90.0;

            // 4. Spectral Deviation Penalty (centroid drift)
            const meanPosP = top5.reduce((acc, p) => {
                const pos = getGridPos(p);
                acc.row += pos.row;
                acc.col += pos.col;
                return acc;
            }, { row: 0, col: 0 });
            meanPosP.row /= top5.length;
            meanPosP.col /= top5.length;

            const meanPosW = drawTargets.reduce((acc, w) => {
                const pos = getGridPos(w);
                acc.row += pos.row;
                acc.col += pos.col;
                return acc;
            }, { row: 0, col: 0 });
            meanPosW.row /= drawTargets.length;
            meanPosW.col /= drawTargets.length;

            const spectralDevPenalty = Math.sqrt(
                Math.pow(meanPosP.row - meanPosW.row, 2) + 
                Math.pow(meanPosP.col - meanPosW.col, 2)
            ) / 10.0;

            // 5. Counterfactual Improvement (compared to baseline flat weights)
            let baseTotalContinLoss = 0;
            drawTargets.forEach((w: number) => {
                let maxSimForWinner = 1e-9;
                const baseCandidates: Array<{ n: number, v: number }> = [];
                for (let i = 1; i <= 90; i++) {
                    const sig = signalMatrix[i];
                    if (!sig) continue;
                    let score_i = 0;
                    for (const key of GENOME_KEYS) {
                        score_i += (sig[key] || 0) * (1.0 / GENOME_KEYS.length);
                    }
                    baseCandidates.push({ n: i, v: score_i });
                }
                baseCandidates.sort((a, b) => b.v - a.v);
                const baseTop5 = baseCandidates.slice(0, 5).map(c => c.n);
                
                baseTop5.forEach((p: number) => {
                    let sim = 0.0;
                    if (p === w) {
                        sim = 1.0;
                    } else {
                        const linSim = Math.exp(-0.25 * Math.abs(p - w));
                        const posP = getGridPos(p);
                        const posW = getGridPos(w);
                        const gridDist = Math.sqrt(Math.pow(posP.row - posW.row, 2) + Math.pow(posP.col - posW.col, 2));
                        const gridSim = Math.exp(-0.35 * gridDist);

                        let mirrorSim = 0.0;
                        if (p + w === 91) mirrorSim = 0.45;
                        const strP = p.toString();
                        const revP = parseInt(strP.split("").reverse().join(""), 10);
                        if (revP >= 1 && revP <= 90 && revP === w) mirrorSim = Math.max(mirrorSim, 0.40);

                        let harmonicSim = 0.0;
                        if (p % 10 === w % 10) harmonicSim = 0.35;

                        let decadeSim = 0.0;
                        if (Math.floor((p - 1) / 10) === Math.floor((w - 1) / 10)) decadeSim = 0.25;

                        sim = Math.max(linSim, gridSim, mirrorSim, harmonicSim, decadeSim);
                    }
                    if (sim > maxSimForWinner) maxSimForWinner = sim;
                });
                baseTotalContinLoss += (1.0 - maxSimForWinner);
            });
            const baseTopologicalLoss = baseTotalContinLoss / (drawTargets.length || 5);
            const counterfactualImprovement = Math.max(-1.0, Math.min(1.0, baseTopologicalLoss - continuousTopologicalLoss));

            // --- MULTI-OBJECTIVE CONTINUOUS FORENSIC REWARD ---
            const w_hits = 0.35;
            const w_topological = 0.25;
            const w_brier = 0.15;
            const w_spectral = 0.15;
            const w_counterfactual = 0.10;

            const forensicReward = (
                (hits / 5.0) * w_hits +
                (1.0 - continuousTopologicalLoss) * w_topological +
                (1.0 - brierScore) * w_brier +
                (1.0 - spectralDevPenalty) * w_spectral +
                counterfactualImprovement * w_counterfactual
            );

            // Scale to a matching fitness value
            foldScore += Math.max(0.0, forensicReward) * 1000.0;
        }
        
        totalScore += foldScore / (targets.length || 1);
    }

    return totalScore / (foldsData.length || 1);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const startTime = Date.now()
    const body = await (req.method === 'POST' ? req.json().catch(() => ({})) : {});
    const validation = SelfLearnRequestSchema.safeParse(body);

    if (!validation.success) {
        return new Response(JSON.stringify({ error: "Invalid payload", details: validation.error.format() }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }

    const { drawName: rawDrawName } = validation.data;
    const drawName = rawDrawName.trim().charAt(0).toUpperCase() + rawDrawName.trim().slice(1).toLowerCase().replace(/(\s[a-z])/g, (c: string) => c.toUpperCase());
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if(!supabaseUrl || !supabaseKey) throw new Error("Config Supabase manquante")
    
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Retrieve historical results isolated strictly by drawName
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

    // Dynamic Time-Series Cross-Validation Folds
    const FOLDS = 3;
    const FOLD_SIZE = 5;
    const TRAIN_SIZE = 50;
    const foldsData = [];

    for (let k = 0; k < FOLDS; k++) {
        const startIdx = k * FOLD_SIZE;
        const validationSet = history.slice(startIdx, startIdx + FOLD_SIZE);
        const trainingContext = history.slice(startIdx + FOLD_SIZE, startIdx + FOLD_SIZE + TRAIN_SIZE);

        if (trainingContext.length < 30 || validationSet.length === 0) break;

        const signalMatrix = computeSignalMatrix(trainingContext);
        const targets = validationSet.map(d => d.gagnants);
        foldsData.push({ signalMatrix, targets });
    }

    if (foldsData.length === 0) {
        return new Response(JSON.stringify({ success: false, message: "Données insuffisantes pour créer les folds de validation." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Try to acquire lock
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
            weights: { frequency: 0.15, gap: 0.15, spectral: 0.1, markov: 0.1, bayes: 0.1, momentum: 0.1, affinity: 0.1, spatial: 0.05, temporal: 0.05, fractal: 0.05, machine_bias: 0.05 },
            updated_at: new Date().toISOString()
        })
        if (!insertError) lockAcquired = true
    }

    if (!lockAcquired) {
        return new Response(JSON.stringify({ success: false, message: "Apprentissage déjà en cours (Lock)" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const defaultWeights: Record<string, number> = {
        frequency: 0.15,
        gap: 0.15,
        spectral: 0.1,
        markov: 0.1,
        bayes: 0.1,
        momentum: 0.1,
        affinity: 0.1,
        spatial: 0.05,
        temporal: 0.05,
        fractal: 0.05,
        machine_bias: 0.05
    };

    let bestW = { ...defaultWeights, ...(current?.weights || {}) };
    let bestScore = evaluateGenome(bestW, foldsData)
    let improved = false
    
    // Seed LCG Random Generator deterministically based on the active drawName
    let lcgSeed = 9999;
    for (let charIdx = 0; charIdx < drawName.length; charIdx++) {
        lcgSeed = (lcgSeed * 31 + drawName.charCodeAt(charIdx)) >>> 0;
    }
    lcgSeed = lcgSeed || 9999;

    const selfLearnRandom = () => {
        lcgSeed = (lcgSeed * 1664525 + 1013904223) >>> 0;
        return lcgSeed / 4294967296;
    }

    const allMutationKeys = [...GENOME_KEYS, 'machine_bias'];

    let population = Array(25).fill(null).map((_, i) => {
        if (i === 0) return { ...bestW }
        const mutant = { ...bestW }
        const gene = allMutationKeys[Math.floor(selfLearnRandom() * allMutationKeys.length)]
        mutant[gene] = Math.max(0.01, Math.min(1.0, (mutant[gene] || 0.1) + (selfLearnRandom() - 0.5) * 0.3))
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
            const parent1 = survivors[Math.floor(selfLearnRandom() * survivors.length)]
            const parent2 = survivors[Math.floor(selfLearnRandom() * survivors.length)]
            const child: Record<string, number> = {}
            for (const key of allMutationKeys) {
                child[key] = selfLearnRandom() > 0.5 ? (parent1[key] || 0.1) : (parent2[key] || 0.1)
            }
            const mutationRate = Math.max(0.02, 0.3 * (1 - (g/100)))
            if (selfLearnRandom() < 0.8) {
                const numMutations = Math.floor(selfLearnRandom() * 3) + 1;
                for (let m = 0; m < numMutations; m++) {
                    const gene = allMutationKeys[Math.floor(selfLearnRandom() * allMutationKeys.length)]
                    child[gene] = Math.max(0.01, Math.min(1.0, (child[gene] || 0.1) + (selfLearnRandom() - 0.5) * mutationRate))
                }
            }
            population.push(child)
        }
    }

    if (improved) {
        // Ensure weights are completely normalized prior to storing
        const normalizedBestW = normalizeGenomeWeights(bestW);
        await supabase.from('algo_weights').upsert({ 
            draw_name: drawName, 
            weights: normalizedBestW, 
            updated_at: new Date().toISOString() 
        })
        bestW = normalizedBestW;
    }

    return new Response(JSON.stringify({ 
        success: true, 
        improved, 
        weights: bestW,
        delta: improved ? (bestScore - evaluateGenome(current?.weights || {}, foldsData)).toFixed(2) : "0"
    }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
    })

  } catch (error: unknown) {
    console.error("Self Learn Error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ success: false, message: errorMessage, error: errorMessage }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
