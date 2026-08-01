import { LCG } from '../../utils/mathUtils';
import { unpackHistory, computeAdaptiveCoeffs, AdaptiveCoeffs } from './zeroCopy';

export {};

interface DrawResultLite { gagnants: number[]; machine?: number[]; }
interface AlgoWeights { [key: string]: number | undefined; }

const ctx = self as unknown as Worker;

// Norme L1 stricte avec bornes dynamiques
const normalizeWeights = (w: AlgoWeights): AlgoWeights => {
  const keys = Object.keys(w);
  const numKeys = keys.length || 1;
  const total = Object.values(w).reduce<number>((acc, val) => acc + Math.abs(val ?? 0), 0);
  const normalized: AlgoWeights = { ...w };
  
  if (total <= 0) {
    keys.forEach(k => { normalized[k] = 1.0 / numKeys; });
    return normalized;
  }

  const uniformWeight = 1.0 / numKeys;
  const FLOOR = Math.max(1e-6, uniformWeight * 0.10);
  const CEILING = Math.min(0.90, uniformWeight * 3.0);

  keys.forEach(k => {
    const val = normalized[k];
    if (typeof val === 'number') {
      let normVal = Math.abs(val) / total;
      normVal = Math.max(FLOOR, Math.min(CEILING, normVal));
      normalized[k] = parseFloat(normVal.toFixed(6));
    }
  });

  const currentSum = keys.reduce((acc, key) => acc + (normalized[key] || 0), 0);
  if (Math.abs(currentSum - 1.0) > 1e-6) {
      normalized[keys[0]] = parseFloat(((normalized[keys[0]] || 0) + (1.0 - currentSum)).toFixed(6));
  }
  return normalized;
};

// Box-Muller déterministe via LCG instance
const randomGaussian = (prng: LCG, mean: number = 0, stdev: number = 1): number => {
  const u = 1 - prng.next(); 
  const v = prng.next();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
};

// Perturber les poids à l'aide d'un bruit gaussien déterministe
const perturbWeights = (prng: LCG, w: AlgoWeights, temperatureRatio: number, stepSize: number): AlgoWeights => {
  const perturbed = { ...w };
  const keys = Object.keys(perturbed);
  
  keys.forEach(k => {
    const noise = randomGaussian(prng, 0, stepSize * temperatureRatio);
    const currentVal = perturbed[k] || 0;
    perturbed[k] = Math.max(0, currentVal + noise);
  });
  
  return normalizeWeights(perturbed);
};

// --- COPIE CONFORME DE L'ÉVALUATION DÉTERMINISTE POUR SÉCURISER L'ISOLATION ET LA REPRODUCTIBILITÉ ---
const evaluate = (w: AlgoWeights, history: DrawResultLite[], depth: number): number => {
  const limit = Math.min(history.length - 1, depth);
  let totalScore = 0;
  const coeffs = computeAdaptiveCoeffs(history);
  
  const weightsToUse = {
    freq: w.frequency || 0,
    markov: w.markov || 0,
    gap: w.gap || 0,
    mom: w.momentum || 0,
    bayes: w.bayes || 0,
    temporal: w.temporal || 0,
    spec: w.spectral || 0,
    affinity: w.affinity || 0,
    spatial: w.spatial || 0,
    fractal: w.fractal || 0
  };

  for (let i = 0; i < limit; i++) {
    const target = history[i].gagnants;
    const past = history.slice(i + 1); 
    if (past.length < 20) break;

    const contextSize = Math.min(past.length, Math.max(20, Math.floor(past.length * 0.4)));
    const subPast = past.slice(0, contextSize);
    const candidates = new Map<number, number>();

    if (weightsToUse.freq > 0.01) {
      const freqMap = new Map<number, number>();
      subPast.forEach(d => d.gagnants.forEach(n => freqMap.set(n, (freqMap.get(n) || 0) + 1)));
      const maxFreq = Math.max(1, ...Array.from(freqMap.values()));
      freqMap.forEach((count, n) => {
        const normalizedFreq = (count / maxFreq) * 100;
        candidates.set(n, (candidates.get(n) || 0) + (normalizedFreq * weightsToUse.freq));
      });
    }

    if (weightsToUse.gap > 0.01) {
      for (let n = 1; n <= 90; n++) {
        let gap = 0;
        for (let k = 0; k < subPast.length; k++) {
          if (subPast[k].gagnants.includes(n)) break;
          gap++;
        }
        const p = 5 / 90;
        const score = (1 - Math.pow(1 - p, gap)) * 100;
        candidates.set(n, (candidates.get(n) || 0) + (score * weightsToUse.gap));
      }
    }

    const top5 = Array.from(candidates.entries())
      .sort((a, b) => b[1] !== a[1] ? b[1] - a[1] : a[0] - b[0])
      .slice(0, 5)
      .map(x => x[0]);
    
    const getGridPos = (val: number) => {
      const row = Math.floor((val - 1) / 10);
      const col = (val - 1) % 10;
      return { row, col };
    };

    let lyapunovSum = 0;
    let validSteps = 0;
    const horizon = Math.min(30, past.length);
    for (let k = 0; k < horizon - 1; k++) {
      const t0 = past[k]?.gagnants;
      const t1 = past[k + 1]?.gagnants;
      if (!t0 || !t1) continue;
      
      let topologicalDist = 0;
      for (const c1 of t1) {
        let minDist = 999;
        const pos1 = getGridPos(c1);
        for (const c0 of t0) {
          const pos0 = getGridPos(c0);
          const d = Math.sqrt(Math.pow(pos1.row - pos0.row, 2) + Math.pow(pos1.col - pos0.col, 2));
          if (d < minDist) minDist = d;
        }
        topologicalDist += minDist;
      }
      lyapunovSum += Math.log(topologicalDist + 1e-4);
      validSteps++;
    }
    const lambda = validSteps > 0 ? lyapunovSum / validSteps : 0.0;
    const isChaotic = lambda > 0;
    const divergenceForce = Math.tanh(Math.abs(lambda));

    let totalContinLoss = 0;
    target.forEach((wVal) => {
      let maxSimForWinner = 1e-9;
      top5.forEach((p) => {
        let sim = 0.0;
        if (p === wVal) {
          sim = 1.0;
        } else {
          const linSim = Math.exp(-0.25 * Math.abs(p - wVal)) * (coeffs.cLinear / 0.25);
          const posP = getGridPos(p);
          const posW = getGridPos(wVal);
          const gridDist = Math.sqrt(Math.pow(posP.row - posW.row, 2) + Math.pow(posP.col - posW.col, 2));
          const gridSim = Math.exp(-0.35 * gridDist) * (coeffs.cGrid / 0.35);

          let mirrorSim = 0.0;
          if (p + wVal === 91) mirrorSim = coeffs.cMirror;
          const strP = p.toString();
          const revP = parseInt(strP.split("").reverse().join(""), 10);
          if (revP >= 1 && revP <= 90 && revP === wVal) mirrorSim = Math.max(mirrorSim, coeffs.cMirror * 0.9);

          let harmonicSim = 0.0;
          if (p % 10 === wVal % 10) harmonicSim = coeffs.cHarmonic;

          let decadeSim = 0.0;
          if (Math.floor((p - 1) / 10) === Math.floor((wVal - 1) / 10)) decadeSim = coeffs.cDecade;

          sim = Math.max(linSim, gridSim, mirrorSim, harmonicSim, decadeSim);
        }
        if (sim > maxSimForWinner) maxSimForWinner = sim;
      });
      
      if (isChaotic) {
        totalContinLoss += maxSimForWinner * divergenceForce; 
      } else {
        totalContinLoss += (1.0 - maxSimForWinner) * (1.0 - divergenceForce);
      }
    });
    
    const targetSize = target.length || 5;
    const globalSimilarityScore = targetSize - totalContinLoss;

    let top5Energy = 0;
    target.forEach(wVal => {
        let nodeEnergy = 0;
        top5.forEach((p, idx) => {
            const rankWeight = Math.exp(-0.2 * idx); 
            const proximity = Math.exp(-0.15 * Math.abs(p - wVal));
            nodeEnergy += proximity * rankWeight;
        });
        top5Energy += Math.tanh(nodeEnergy);
    });

    totalScore += 2.0 * Math.pow(5.0, globalSimilarityScore) * (targetSize / 5.0) + top5Energy - 2.0;
  }

  return totalScore;
};

ctx.onmessage = (e) => {
  if (e.data.type === 'start') {
    const { drawName, baseWeights, config, history, historyBuffer, drawCount, winningCount, totalCols, timeSignature } = e.data.payload;
    const hist = historyBuffer ? unpackHistory(historyBuffer, drawCount, winningCount, totalCols) : unpackHistory(history);
    
    // Isolation du PRNG avec un seed déterministe canonique
    const prng = new LCG(`sa_${timeSignature || drawName}_${config.maxIterations || 150}`);

    const numWeights = Object.keys(baseWeights).length;
    const MAX_ITERATIONS = config.maxIterations || Math.max(50, Math.ceil(numWeights * Math.sqrt(hist.length) * 0.8));
    const historyDepth = config.historyDepth || Math.max(20, Math.floor(hist.length * 0.5));
    
    // Régime Thermo-Statistique
    const Hurst = config.regimeMetrics?.hurst ?? 0.5;
    const Entropy = config.regimeMetrics?.entropy ?? 0.5;

    // Évaluation du point de départ
    const baseNormalized = normalizeWeights(baseWeights);
    let currentWeights = { ...baseNormalized };
    let currentScore = evaluate(currentWeights, hist, historyDepth);
    
    let bestWeights = { ...currentWeights };
    let bestScore = currentScore;

    // Calibration adaptative de la Température Initiale (sans nombres magiques)
    const probeScores: number[] = [];
    const stepSize = 1.0 / numWeights;
    
    for (let i = 0; i < 20; i++) {
      const probe = perturbWeights(prng, currentWeights, 1.0, stepSize);
      probeScores.push(evaluate(probe, hist, historyDepth));
    }
    
    const meanProbe = probeScores.reduce((a, b) => a + b, 0) / probeScores.length;
    const varianceProbe = probeScores.reduce((a, b) => a + Math.pow(b - meanProbe, 2), 0) / probeScores.length;
    const stdDevProbe = Math.sqrt(varianceProbe) || 1.0;

    let T_max = stdDevProbe * (1.0 + Entropy);
    const T_min = 1e-4 * T_max;
    
    const alpha = Math.pow(T_min / T_max, 1.0 / MAX_ITERATIONS);
    let T = T_max;

    let acceptedCount = 0;
    let improvementCount = 0;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const tempRatio = T / T_max;
      
      const candidate = perturbWeights(prng, currentWeights, tempRatio, stepSize);
      const candidateScore = evaluate(candidate, hist, historyDepth);
      
      const deltaE = -(candidateScore - currentScore);

      if (deltaE < 0) {
        currentWeights = candidate;
        currentScore = candidateScore;
        acceptedCount++;
        
        if (candidateScore > bestScore) {
          bestWeights = { ...candidate };
          bestScore = candidateScore;
          improvementCount++;
        }
      } else {
        const P = Math.exp(-deltaE / T);
        const r = prng.next();
        if (r < P) {
          currentWeights = candidate;
          currentScore = candidateScore;
          acceptedCount++;
        }
      }

      T *= alpha;

      ctx.postMessage({
        type: 'progress',
        data: {
          iteration: iter + 1,
          totalIterations: MAX_ITERATIONS,
          progress: Math.round(((iter + 1) / MAX_ITERATIONS) * 100),
          bestScore,
          currentScore,
          temperature: T,
          acceptedCount,
          improvementCount
        }
      });
    }

    ctx.postMessage({
      type: 'result',
      data: {
        bestWeights,
        bestScore,
        improvement: bestScore - evaluate(baseNormalized, hist, historyDepth),
        iterations: MAX_ITERATIONS
      }
    });
  }
};
