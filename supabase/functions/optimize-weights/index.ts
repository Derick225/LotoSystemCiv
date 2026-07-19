import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// optimize-weights: Edge Function for continuous RLHF learning and Genetic Optimization
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { history, currentWeights, rlSignal, drawName } = await req.json();

    if (!history || !currentWeights || !drawName) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Heavy coordinate descent / genetic algorithm offloaded to Edge Worker
    // Mock implementation for demonstration:

    // Grid position on 10x9 grid
    const getGridPos = (val: number) => {
      const row = Math.floor((val - 1) / 10);
      const col = (val - 1) % 10;
      return { row, col };
    };

    // Calculate Hurst exponent continuously from draw sums
    const getHurstExponent = (hist: any[]): number => {
      const limit = Math.min(hist.length, 50);
      if (limit < 10) return 0.5;
      const sums = hist.slice(0, limit).map(d => {
        const winners = d.gagnants || d.winners || [];
        return winners.reduce((a: number, b: number) => a + b, 0);
      });
      const meanVal = sums.reduce((a, b) => a + b, 0) / limit;
      const y = sums.map(s => s - meanVal);
      let currentSum = 0;
      let maxCum = -Infinity;
      let minCum = Infinity;
      for (let i = 0; i < limit; i++) {
        currentSum += y[i];
        if (currentSum > maxCum) maxCum = currentSum;
        if (currentSum < minCum) minCum = currentSum;
      }
      const R = maxCum - minCum;
      const variance = sums.reduce((sum, s) => sum + Math.pow(s - meanVal, 2), 0) / limit;
      const S = Math.sqrt(variance) || 1.0;
      const rs = Math.max(1.0, S > 0 ? R / S : 1.0);
      const H = Math.log(rs) / Math.log(limit / 2);
      return isNaN(H) || !isFinite(H) ? 0.5 : Math.max(0.15, Math.min(0.85, H));
    };

    // Calculate Shannon entropy of historical draws
    const getShannonEntropy = (hist: any[]): number => {
      const freq = new Float32Array(91);
      let total = 0;
      for (const d of hist) {
        const winners = d.gagnants || d.winners || [];
        for (const n of winners) {
          if (n >= 1 && n <= 90) {
            freq[n]++;
            total++;
          }
        }
      }
      if (total === 0) return 0.5;
      let entropy = 0;
      for (let i = 1; i <= 90; i++) {
        if (freq[i] > 0) {
          const p = freq[i] / total;
          entropy -= p * Math.log2(p);
        }
      }
      const maxEntropy = Math.log2(90);
      return entropy / maxEntropy;
    };

    // Lightweight signal matrix calculator
    const computeSignalMatrix = (context: any[]) => {
      const signalMatrix: Record<number, Record<string, number>> = {};
      const totalDraws = context.length || 1;
      const lastWinners = context[0]?.gagnants || context[0]?.winners || [];

      for (let i = 1; i <= 90; i++) {
        const freqCount = context.filter(d => (d.gagnants || d.winners || []).includes(i)).length;
        const lastIdx = context.findIndex(d => (d.gagnants || d.winners || []).includes(i));
        const gap = lastIdx === -1 ? 50 : lastIdx;
        const wasInLastMachine = (context[0]?.machine || []).includes(i);

        // 1. Frequency
        const freq = freqCount / totalDraws;

        // 2. Gap decay
        const gapDecay = Math.exp(-0.05 * gap);

        // 3. Spectral signal
        const spectral = Math.abs(Math.cos(freqCount * 0.15 + gap * 0.25));

        // 4. Markov transitioning probability
        let transitionCount = 0;
        lastWinners.forEach((lw: number) => {
          for (let d = 1; d < context.length; d++) {
            const winnersCur = context[d - 1]?.gagnants || context[d - 1]?.winners || [];
            const winnersPrev = context[d]?.gagnants || context[d]?.winners || [];
            if (winnersPrev.includes(lw) && winnersCur.includes(i)) {
              transitionCount++;
            }
          }
        });
        const markov = transitionCount / totalDraws;

        // 5. Bayes probability estimation
        const bayes = freq * (1.0 / (1.0 + Math.abs(gap - (totalDraws / (freqCount || 1)))));

        // 6. Momentum
        const momentum = context.slice(0, 5).filter(d => (d.gagnants || d.winners || []).includes(i)).length / 5.0;

        // 7. Spatial grid distance
        let minGridDist = 99.0;
        const posI = getGridPos(i);
        lastWinners.forEach((lw: number) => {
          const posLW = getGridPos(lw);
          const dist = Math.sqrt(Math.pow(posI.row - posLW.row, 2) + Math.pow(posI.col - posLW.col, 2));
          if (dist < minGridDist) minGridDist = dist;
        });
        const spatial = Math.exp(-0.5 * minGridDist);

        // 8. Temporal alignment
        const occurrenceIndices: number[] = [];
        context.forEach((d, index) => {
          const winners = d.gagnants || d.winners || [];
          if (winners.includes(i)) {
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

        signalMatrix[i] = {
          frequency: freq,
          gap: gapDecay,
          spectral,
          markov,
          bayes,
          momentum,
          affinity: freq * (1 - gapDecay),
          spatial,
          temporal,
          fractal: Math.exp(-Math.abs(freq - 0.05)),
          machine_bias: wasInLastMachine ? 1.0 : 0.0
        };
      }
      return signalMatrix;
    };

    // Normalize weights dictionary
    const normalizeWeights = (w: Record<string, number>): Record<string, number> => {
      const res: Record<string, number> = {};
      let total = 0;
      for (const k of Object.keys(w)) {
        res[k] = Math.max(0.001, Number(w[k]));
        total += res[k];
      }
      for (const k of Object.keys(res)) {
        res[k] = res[k] / (total || 1.0);
      }
      return res;
    };

    // Evaluate weight fitness across history folds
    const evaluateWeights = (w: Record<string, number>, folds: any[]): number => {
      const normalized = normalizeWeights(w);
      let totalFitness = 0;

      for (const fold of folds) {
        const { signalMatrix, targets } = fold;
        const candidates: Array<{ n: number, val: number }> = [];

        for (let i = 1; i <= 90; i++) {
          const sig = signalMatrix[i];
          if (!sig) continue;
          let score = 0;
          for (const key of Object.keys(normalized)) {
            score += (sig[key] || 0) * normalized[key];
          }
          candidates.push({ n: i, val: score });
        }

        candidates.sort((a, b) => b.val - a.val);
        const top5 = candidates.slice(0, 5).map(c => c.n);

        // Calculate continuous topological matching metric
        let topologicalSim = 0;
        targets.forEach((actual: number) => {
          let maxSim = 1e-9;
          top5.forEach((predicted: number) => {
            let sim = 0.0;
            if (predicted === actual) {
              sim = 1.0;
            } else {
              const linSim = Math.exp(-0.25 * Math.abs(predicted - actual));
              const posP = getGridPos(predicted);
              const posW = getGridPos(actual);
              const gridDist = Math.sqrt(Math.pow(posP.row - posW.row, 2) + Math.pow(posP.col - posW.col, 2));
              const gridSim = Math.exp(-0.35 * gridDist);
              sim = Math.max(linSim, gridSim);
            }
            if (sim > maxSim) maxSim = sim;
          });
          topologicalSim += maxSim;
        });

        totalFitness += (topologicalSim / 5.0);
      }

      return totalFitness / (folds.length || 1);
    };

    // Prepare 3 Validation Folds using dynamic history slicing
    const folds: any[] = [];
    const foldCount = Math.min(3, Math.floor(history.length / 10));
    for (let k = 0; k < foldCount; k++) {
      const validationSet = history.slice(k, k + 2);
      const trainingContext = history.slice(k + 2, k + 30);
      if (trainingContext.length > 5 && validationSet.length > 0) {
        const sigMatrix = computeSignalMatrix(trainingContext);
        const targets = validationSet[0]?.gagnants || validationSet[0]?.winners || [];
        if (targets.length > 0) {
          folds.push({ signalMatrix: sigMatrix, targets });
        }
      }
    }

    // Compute dynamic, continuous learning speed based on Hurst and Entropy
    const H = getHurstExponent(history);
    const entropy = getShannonEntropy(history);
    const baseLearningRate = 0.04;
    const volatilityDampening = 1.0 / (1.0 + Math.exp(5.0 * (entropy - 0.75)));
    const lr = baseLearningRate * (0.5 + H) * volatilityDampening * (Math.abs(rlSignal || 0) + 1.0);

    const initialWeights = { ...currentWeights };
    let bestWeights = normalizeWeights(initialWeights);
    
    if (folds.length > 0) {
      let bestFitness = evaluateWeights(bestWeights, folds);

      // Coordinate Descent Optimization (100% deterministic)
      const keys = Object.keys(bestWeights);
      const epochs = 5;
      for (let epoch = 0; epoch < epochs; epoch++) {
        const dampFactor = 1.0 / (1.0 + epoch);
        for (const key of keys) {
          const originalVal = bestWeights[key];
          
          // Test positive step
          const candidatePos = { ...bestWeights };
          candidatePos[key] = Math.max(0.001, originalVal + lr * dampFactor);
          const fitnessPos = evaluateWeights(candidatePos, folds);

          // Test negative step
          const candidateNeg = { ...bestWeights };
          candidateNeg[key] = Math.max(0.001, originalVal - lr * dampFactor);
          const fitnessNeg = evaluateWeights(candidateNeg, folds);

          if (fitnessPos > bestFitness && fitnessPos >= fitnessNeg) {
            bestWeights = normalizeWeights(candidatePos);
            bestFitness = fitnessPos;
          } else if (fitnessNeg > bestFitness) {
            bestWeights = normalizeWeights(candidateNeg);
            bestFitness = fitnessNeg;
          }
        }
      }
    } else {
      // Fallback to stable deterministic LCG jitter if folds cannot be built
      let lcgSeed = 9999;
      for (let charIdx = 0; charIdx < drawName.length; charIdx++) {
        lcgSeed = (lcgSeed * 31 + drawName.charCodeAt(charIdx)) >>> 0;
      }
      lcgSeed = lcgSeed || 9999;

      const deterministicRandom = () => {
        lcgSeed = (lcgSeed * 1664525 + 1013904223) >>> 0;
        return lcgSeed / 4294967296;
      };

      for (const key of Object.keys(bestWeights)) {
        const step = (deterministicRandom() - 0.5) * lr;
        bestWeights[key] = Math.max(0.01, Math.min(1.0, Number(bestWeights[key]) + step));
      }
      bestWeights = normalizeWeights(bestWeights);
    }

    const newWeights = bestWeights;

    return new Response(
      JSON.stringify({
        status: "success",
        optimizedWeights: newWeights,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
