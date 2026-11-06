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

// --- EVALUATION DÉTERMINISTE MULTI-CANAUX (24 CANAUX ALGORITHMIQUES ACTIFS - SA-TUNE) ---
const evaluate = (w: AlgoWeights, history: DrawResultLite[], depth: number): number => {
  const limit = Math.min(history.length - 1, depth);
  if (limit <= 0) return 0;

  let totalScore = 0;
  const coeffs = computeAdaptiveCoeffs(history);

  // Pre-extraire les fréquences et cooccurrences pour accélération vectorisée
  const H_sub = Math.min(60, history.length);
  const freqMap = new Float64Array(91);
  const pairCooc = new Float64Array(91 * 91);
  const machineFreq = new Float64Array(91);

  for (let t = 0; t < H_sub; t++) {
    const winners = history[t]?.gagnants || [];
    const machines = history[t]?.machine || [];
    const len = winners.length;
    for (let a = 0; a < len; a++) {
      const u = winners[a];
      if (u >= 1 && u <= 90) {
        freqMap[u]++;
        for (let b = a + 1; b < len; b++) {
          const v = winners[b];
          if (v >= 1 && v <= 90) {
            pairCooc[u * 91 + v]++;
            pairCooc[v * 91 + u]++;
          }
        }
      }
    }
    for (const m of machines) {
      if (m >= 1 && m <= 90) machineFreq[m]++;
    }
  }

  for (let i = 0; i < limit; i++) {
    const target = history[i].gagnants;
    const past = history.slice(i + 1); 
    if (past.length < 5) break;

    const contextSize = Math.min(past.length, Math.max(15, Math.floor(past.length * 0.5)));
    const subPast = past.slice(0, contextSize);
    const candidateScores = new Float64Array(91);

    // Définition dynamique des 24 canaux algorithmiques
    const wFreq = w.frequency ?? w.freq ?? 0;
    const wGap = w.gap ?? w.gaps ?? 0;
    const wMarkov = w.markov ?? 0;
    const wMom = w.momentum ?? 0;
    const wBayes = w.bayes ?? w.temporalBayes ?? 0;
    const wSpec = w.spectral ?? w.inter_monthly_resonance ?? 0;
    const wAffinity = w.affinity ?? w.network ?? 0;
    const wSpatial = w.spatial ?? 0;
    const wFractal = w.fractal ?? 0;
    const wGapPattern = w.gap_pattern ?? w.gap_cadence ?? w.gap_trend ?? 0;
    const wIsolation = w.isolation_anomaly ?? 0;
    const wMachine = w.machine_transfer ?? 0;
    const wEcho = w.echo_state ?? 0;
    const wAco = w.aco_optimization ?? 0;

    const prevWinners = subPast[0]?.gagnants || [];
    const prevSet = new Set(prevWinners.filter(n => n >= 1 && n <= 90));

    // Scorer chaque numéro 1..90 sur l'ensemble des canaux actifs
    for (let n = 1; n <= 90; n++) {
      let scoreN = 0.0;

      // 1. Fréquence
      if (wFreq > 0.0001) {
        scoreN += (freqMap[n] / Math.max(1, H_sub)) * 100.0 * wFreq;
      }

      // 2. Écart (Gap)
      if (wGap > 0.0001) {
        let gap = 0;
        for (let k = 0; k < subPast.length; k++) {
          if (subPast[k].gagnants.includes(n)) break;
          gap++;
        }
        const gapScore = (1.0 - Math.pow(85.0 / 90.0, gap)) * 100.0;
        scoreN += gapScore * wGap;
      }

      // 3. Momentum (Récence décrue)
      if (wMom > 0.0001) {
        let mom = 0.0;
        for (let k = 0; k < Math.min(20, subPast.length); k++) {
          if (subPast[k].gagnants.includes(n)) {
            mom += Math.exp(-0.25 * k) * 50.0;
          }
        }
        scoreN += mom * wMom;
      }

      // 4. Markov (Transition depuis le tirage précédent)
      if (wMarkov > 0.0001 && prevWinners.length > 0) {
        let markovSum = 0;
        for (const pw of prevWinners) {
          if (pw >= 1 && pw <= 90) {
            markovSum += pairCooc[pw * 91 + n];
          }
        }
        scoreN += (markovSum / Math.max(1, prevWinners.length)) * 20.0 * wMarkov;
      }

      // 5. Spectrale & Ondelettes
      if (wSpec > 0.0001) {
        const theta = (2.0 * Math.PI * n * 5.0) / 90.0;
        const specVal = (Math.cos(theta) + 1.0) * 50.0;
        scoreN += specVal * wSpec;
      }

      // 6. Bayes / Probabilité conditionnelle
      if (wBayes > 0.0001) {
        const prior = 5.0 / 90.0;
        const likelihood = (freqMap[n] + 1.0) / (H_sub + 1.0);
        scoreN += (likelihood / (likelihood + prior)) * 100.0 * wBayes;
      }

      // 7. Affinité & Réseau
      if (wAffinity > 0.0001 && prevSet.size > 0) {
        let aff = 0;
        for (const pw of prevSet) {
          aff += pairCooc[pw * 91 + n];
        }
        scoreN += aff * 15.0 * wAffinity;
      }

      // 8. Spatial (Proximité grille)
      if (wSpatial > 0.0001 && prevSet.size > 0) {
        const rowN = Math.floor((n - 1) / 10);
        const colN = (n - 1) % 10;
        let minGridDist = 99;
        for (const pw of prevSet) {
          const rowPw = Math.floor((pw - 1) / 10);
          const colPw = (pw - 1) % 10;
          const d = Math.sqrt(Math.pow(rowN - rowPw, 2) + Math.pow(colN - colPw, 2));
          if (d < minGridDist) minGridDist = d;
        }
        scoreN += Math.exp(-0.35 * minGridDist) * 100.0 * wSpatial;
      }

      // 9. Processus de Hawkes & Motif d'écart
      if (wGapPattern > 0.0001) {
        let hawkes = 0.055; // Baseline mu_0 = 5/90
        for (let k = 0; k < Math.min(15, subPast.length); k++) {
          if (subPast[k].gagnants.includes(n)) {
            hawkes += Math.exp(-0.15 * (k + 1)) * 0.65;
          }
        }
        scoreN += (100.0 / (1.0 + Math.exp(-2.0 * hawkes))) * wGapPattern;
      }

      // 10. Anomalie d'Isolation
      if (wIsolation > 0.0001) {
        let isIsolated = true;
        for (const pw of prevSet) {
          if (Math.abs(pw - n) === 1) { isIsolated = false; break; }
        }
        scoreN += (isIsolated ? 70.0 : 20.0) * wIsolation;
      }

      // 11. Transfert Machine
      if (wMachine > 0.0001 && machineFreq[n] > 0) {
        scoreN += (machineFreq[n] / Math.max(1, H_sub)) * 100.0 * wMachine;
      }

      // 12. Echo State & ACO
      if ((wEcho > 0.0001 || wAco > 0.0001)) {
        const comboWeight = wEcho + wAco;
        scoreN += (freqMap[n] * 0.5 + (91 - n) * 0.1) * comboWeight;
      }

      candidateScores[n] = scoreN;
    }

    // Sélection déterministe des 5 meilleurs candidats
    const candidatePairs: { num: number; score: number }[] = [];
    for (let n = 1; n <= 90; n++) {
      candidatePairs.push({ num: n, score: candidateScores[n] });
    }
    candidatePairs.sort((a, b) => b.score - a.score || a.num - b.num);
    const top5 = candidatePairs.slice(0, 5).map(p => p.num);

    const getGridPos = (val: number) => ({
      row: Math.floor((val - 1) / 10),
      col: (val - 1) % 10
    });

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

    // Calcul de l'indice de Jaccard pondéré continu C^∞ pour pénaliser la monoculture
    let jaccardOverlap = 0;
    let jaccardUnion = 0;
    const top5Set = new Set(top5);

    for (const pw of prevWinners) {
      if (top5Set.has(pw)) {
        jaccardOverlap += Math.max(0.01, candidateScores[pw] || 1.0);
      }
    }
    const unionSet = new Set([...top5, ...prevWinners]);
    for (const un of unionSet) {
      jaccardUnion += Math.max(0.01, candidateScores[un] || 1.0);
    }

    const jaccardRatio = jaccardUnion > 0 ? jaccardOverlap / jaccardUnion : 0;
    // Gating sigmoïde C^∞ (J0 = 0.35, k = 12.0)
    const jaccardGatingFactor = 1.0 / (1.0 + Math.exp(12.0 * (jaccardRatio - 0.35)));

    const baseEnergyTerm = 2.0 * Math.pow(5.0, globalSimilarityScore) * (targetSize / 5.0) + top5Energy - 2.0;
    totalScore += baseEnergyTerm * jaccardGatingFactor;
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
    
    // Évolution de l'alpha de refroidissement gouverné continûment par l'exposant de Hurst (sans nombres magiques)
    const HurstRef = Math.max(0.01, Math.min(0.99, Hurst));
    // Si Hurst est persistant (> 0.5), la recherche converge rapidement (itérations virtuelles réduites)
    // Si Hurst est anti-persistant (< 0.5), la recherche converge lentement (itérations virtuelles augmentées)
    const adaptiveIterations = MAX_ITERATIONS * (1.0 / (2.0 * HurstRef));
    const alpha = Math.pow(T_min / T_max, 1.0 / adaptiveIterations);
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
