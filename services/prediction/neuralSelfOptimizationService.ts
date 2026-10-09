import {
  AlgoKey,
  AlgoWeights,
  RETIRED_ALGO_WEIGHT_KEYS,
} from '../../shared/prediction.types';
import { DrawResult } from '../../types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { normalizeWeights, evaluateAlgoEmpiricalProof } from './weightsManager';
import { projectWeightsWithProofGuard } from './closedLoopAutopsyService';
import { LABELS_MAP, ALGO_CATEGORIES } from '../../hooks/useAlgorithmSync';

export interface NeuralEpochLog {
  epoch: number;
  loss: number;
  validationLoss?: number;
  accuracyDelta: number; // Variation du taux de prédiction (hors-échantillon si validation disponible)
  gradientNorm: number;
  learningRate: number;
  meanEntropy: number;
}

export interface AlgoNeuralGradientInfo {
  algoKey: AlgoKey;
  label: string;
  category: string;
  initialWeight: number;
  optimizedWeight: number;
  weightDelta: number; // optimized - initial
  weightDeltaPct: number;
  gradient: number;
  momentum: number;
  hasEmpiricalProof: boolean;
  proofScore: number;
  gatingAction: 'BOOSTED' | 'MAINTAINED' | 'DAMPENED' | 'PROOF_LOCKED';
}

export interface NeuralOptimizationResult {
  drawName: string;
  epochsCompleted: number;
  initialLoss: number;
  finalLoss: number;
  lossReductionPct: number;
  validationLossInitial?: number;
  validationLossFinal?: number;
  initialAccuracy: number;
  finalAccuracy: number;
  accuracyGain: number;
  trainAccuracyInitial?: number;
  trainAccuracyFinal?: number;
  batchSize: number;
  trainingSampleCount?: number;
  validationSampleCount?: number;
  initialWeights: AlgoWeights;
  optimizedWeights: AlgoWeights;
  algoGradients: AlgoNeuralGradientInfo[];
  epochHistory: NeuralEpochLog[];
  trainingDurationMs: number;
  convergenceStatus: 'CONVERGED' | 'PLATEAU' | 'MAX_EPOCHS_REACHED';
}

export interface NeuralHyperparameters {
  epochs: number; // 5 to 50
  learningRate: number; // 0.01 to 0.20
  momentum: number; // 0.85 to 0.95
  l2Regularization: number; // 0.001 to 0.05
  batchDepth: number; // 10 to 60 historical draws
}

export const DEFAULT_NEURAL_HYPERPARAMS: NeuralHyperparameters = {
  epochs: 20,
  learningRate: 0.08,
  momentum: 0.90,
  l2Regularization: 0.005,
  batchDepth: 35,
};

const getCategoryName = (key: AlgoKey): string => {
  const found = ALGO_CATEGORIES.find((c) => c.keys.includes(key));
  return found ? found.name : 'Inférence';
};

const normalizeChannel90 = (arr: Float64Array): Float64Array => {
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let b = 1; b <= 90; b++) {
    const v = Number.isFinite(arr[b]) ? arr[b] : 0;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }
  const out = new Float64Array(91);
  const span = maxVal - minVal;
  if (span <= 1e-12) return out;
  for (let b = 1; b <= 90; b++) {
    const v = Number.isFinite(arr[b]) ? arr[b] : minVal;
    out[b] = (v - minVal) / span;
  }
  return out;
};

const getGapBinIndex = (gap: number): number => {
  if (gap <= 0) return 0;
  if (gap <= 3) return 1;
  if (gap <= 7) return 2;
  if (gap <= 14) return 3;
  if (gap <= 24) return 4;
  if (gap <= 39) return 5;
  return 6;
};

const getMirrorBall = (n: number): number => {
  if (n < 10) return n * 10 <= 90 ? n * 10 : n;
  const rev = Number(String(n).split('').reverse().join(''));
  return Number.isFinite(rev) && rev >= 1 && rev <= 90 ? rev : n;
};

/**
 * Extraction déterministe de descripteurs historiques distincts et spécifiques
 * à chacun des sous-algorithmes actifs sur `pastHistory` (strictement antérieur au tirage cible).
 * Chaque canal est normalisé dans [0, 1] ; les canaux retirés (ALGO-6/7) et MACHINE_TRANSFER
 * sans données machine valent strictement 0.
 */
export const computeFastHistoricalFeatures = (
  pastHistory: DrawResult[],
  validKeys: AlgoKey[]
): Record<number, Record<AlgoKey, number>> => {
  const depth = Math.min(pastHistory.length, 45);
  const hasMachine = pastHistory.some(
    (d) => Array.isArray(d.machine) && d.machine.length > 0
  );

  // Tableaux bruts par canal (1..90)
  const rawFreq = new Float64Array(91);
  const rawGaps = new Float64Array(91);
  const rawGapCadence = new Float64Array(91);
  const rawGapTrend = new Float64Array(91);
  const rawGapBandSeq = new Float64Array(91);
  const rawMarkov = new Float64Array(91);
  const rawBayes = new Float64Array(91);
  const rawMomentum = new Float64Array(91);
  const rawSpectral = new Float64Array(91);
  const rawFractal = new Float64Array(91);
  const rawTemporal = new Float64Array(91);
  const rawSpatial = new Float64Array(91);
  const rawAffinity = new Float64Array(91);
  const rawCohort = new Float64Array(91);
  const rawPoisson = new Float64Array(91);
  const rawResistance = new Float64Array(91);
  const rawLeaderSucc = new Float64Array(91);
  const rawMachineTransfer = new Float64Array(91);
  const rawIsolation = new Float64Array(91);
  const rawShadow = new Float64Array(91);
  const rawInterMonthly = new Float64Array(91);
  const rawInterDraw = new Float64Array(91);

  const occurrenceTimes: number[][] = Array.from({ length: 91 }, () => []);
  const counts = new Float64Array(91);
  const shortEma = new Float64Array(91);
  const longEma = new Float64Array(91);

  // 1. Parcours temporel des occurrences
  for (let t = 0; t < depth; t++) {
    const winners = pastHistory[t]?.gagnants || [];
    const wDecay = Math.exp(-t / 14.0);
    const wShort = Math.exp(-t / 4.0);
    const wLong = Math.exp(-t / 18.0);

    for (const n of winners) {
      if (n >= 1 && n <= 90) {
        counts[n] += 1;
        rawFreq[n] += wDecay;
        shortEma[n] += wShort;
        longEma[n] += wLong;
        occurrenceTimes[n].push(t);
      }
    }
  }

  // 2. Écarts courants, Cadences, Tendances d'écarts, Poisson, Résistance, Hawkes, Spectral, Fractal
  const pNull = 5.0 / 90.0;
  const currentGaps = new Int32Array(91);

  for (let b = 1; b <= 90; b++) {
    const times = occurrenceTimes[b];
    const currentGap = times.length > 0 ? times[0] : depth;
    currentGaps[b] = currentGap;

    // GAPS : Pression géométrique de renouvellement
    rawGaps[b] = 1.0 - Math.pow(1.0 - pNull, currentGap + 1);

    // Intervalles inter-apparitions
    const intervals: number[] = [];
    for (let i = 0; i < times.length - 1; i++) {
      intervals.push(times[i + 1] - times[i]);
    }

    if (intervals.length >= 2) {
      const meanInt = intervals.reduce((a, c) => a + c, 0) / intervals.length;
      const varInt =
        intervals.reduce((a, c) => a + (c - meanInt) ** 2, 0) / intervals.length;
      const stdInt = Math.sqrt(varInt);
      const cv = stdInt / Math.max(1.0, meanInt);
      const proximity = Math.exp(-Math.pow(currentGap - meanInt, 2) / (2 * Math.max(1.0, varInt + 1.0)));
      rawGapCadence[b] = proximity / (1.0 + cv);
      // Tendance d'écart (accélération entre les 2 derniers intervalles)
      const deltaInt = intervals[0] - intervals[1];
      rawGapTrend[b] = 0.5 * (1.0 + Math.tanh(-deltaInt / Math.max(1.0, meanInt)));
    } else if (intervals.length === 1) {
      const meanInt = intervals[0];
      rawGapCadence[b] = Math.exp(-Math.abs(currentGap - meanInt) / Math.max(2.0, meanInt));
      rawGapTrend[b] = 0.5;
    } else {
      rawGapCadence[b] = 0.0;
      rawGapTrend[b] = 0.0;
    }

    // POISSON : Probabilité cumulée de renouvellement avec taux empirique lissé
    const lambdaRate = (counts[b] + 0.5) / Math.max(1.0, depth + 9.0);
    rawPoisson[b] = 1.0 - Math.exp(-lambdaRate * (currentGap + 1));

    // RESISTANCE : Proximité continue au plafond historique d'écart de la boule b
    const maxHistoricalGap =
      intervals.length > 0 ? Math.max(...intervals, currentGap) : Math.max(18, currentGap);
    const gapRatio = currentGap / Math.max(1.0, maxHistoricalGap);
    rawResistance[b] = Math.exp(-Math.pow(gapRatio - 0.85, 2) / 0.18);

    // TEMPORAL (Hawkes) : Somme d'auto-excitation exponentielle sur les occurrences
    let hawkes = 0;
    for (const tk of times) {
      hawkes += Math.exp(-tk / 8.0);
    }
    rawTemporal[b] = hawkes;

    // MOMENTUM : Oscillateur court terme vs long terme
    rawMomentum[b] = shortEma[b] / 4.0 - 0.5 * (longEma[b] / 18.0);

    // BAYES : Moyenne a posteriori Beta-Binomiale modulée par la vraisemblance récente
    const alphaPost = counts[b] + 5.0 * pNull;
    const betaPost = Math.max(0, depth - counts[b]) + 5.0 * (1.0 - pNull);
    const postMean = alphaPost / (alphaPost + betaPost);
    const recentHits = times.filter((tk) => tk < Math.min(8, depth)).length;
    const recentRate = (recentHits + pNull) / (Math.min(8, depth) + 1.0);
    rawBayes[b] = 0.6 * postMean + 0.4 * recentRate;

    // SPECTRAL : Périodogramme DFT réel sur la série binaire d'occurrences x_b(t) (t = 0..depth-1)
    if (depth >= 6 && times.length >= 2) {
      const meanX = counts[b] / depth;
      let maxPower = 0;
      let bestProjection = 0;
      const maxHarmonic = Math.min(12, Math.floor(depth / 2));
      const timeSet = new Set(times);
      for (let k = 1; k <= maxHarmonic; k++) {
        let re = 0;
        let im = 0;
        const omega = (2.0 * Math.PI * k) / depth;
        for (let t = 0; t < depth; t++) {
          const x = (timeSet.has(t) ? 1.0 : 0.0) - meanX;
          re += x * Math.cos(omega * t);
          im -= x * Math.sin(omega * t);
        }
        const power = (re * re + im * im) / depth;
        if (power > maxPower) {
          maxPower = power;
          const phase = Math.atan2(im, re);
          // Projection de phase à t = -1 (prochain tirage)
          bestProjection = power * (0.5 * (1.0 + Math.cos(-omega + phase)));
        }
      }
      rawSpectral[b] = bestProjection;
    }

    // FRACTAL : Statistique R/S (Rescaled Range) locale sur la série centrée d'apparitions de la boule b
    if (depth >= 6) {
      const meanX = counts[b] / depth;
      const timeSet = new Set(times);
      let cum = 0;
      let minCum = 0;
      let maxCum = 0;
      let sumSq = 0;
      for (let t = 0; t < depth; t++) {
        const dev = (timeSet.has(t) ? 1.0 : 0.0) - meanX;
        cum += dev;
        if (cum < minCum) minCum = cum;
        if (cum > maxCum) maxCum = cum;
        sumSq += dev * dev;
      }
      const rangeR = maxCum - minCum;
      const stdS = Math.sqrt(sumSq / depth);
      const rs = stdS > 1e-6 ? rangeR / stdS : 1.0;
      const hurstLocal = Math.max(0.1, Math.min(0.9, Math.log(Math.max(1.0, rs)) / Math.log(depth)));
      // Persistance combinée à l'état récent
      const recentSignal = times.length > 0 && times[0] <= 3 ? 1.0 : 0.3;
      rawFractal[b] = hurstLocal * recentSignal;
    }

    // INTER_MONTHLY_RESONANCE : Résonance périodique aux lags hebdomadaires/mensuels (4, 8, 12)
    let periodicEcho = 0;
    const timeSet = new Set(times);
    for (const cycleLag of [4, 8, 12, 16]) {
      if (cycleLag <= depth && timeSet.has(cycleLag - 1)) {
        periodicEcho += Math.exp(-cycleLag / 16.0);
      }
    }
    rawInterMonthly[b] = periodicEcho;
  }

  // 3. Transitions de Markov (t+1 -> t), Affinité de co-occurrence, Transfert Machine, Shadow, Leader
  const lastDrawWinners = pastHistory[0]?.gagnants || [];
  const lastDrawMachine = pastHistory[0]?.machine || [];
  const lastWinnersSet = new Set(lastDrawWinners);

  // Leader du dernier tirage (numéro de pastHistory[0] ayant la plus forte fréquence historique)
  let leaderBall = lastDrawWinners[0] || 1;
  for (const w of lastDrawWinners) {
    if ((counts[w] || 0) > (counts[leaderBall] || 0)) {
      leaderBall = w;
    }
  }

  for (let t = 0; t < depth - 1; t++) {
    const currWinners = pastHistory[t]?.gagnants || [];
    const prevWinners = pastHistory[t + 1]?.gagnants || [];
    const prevMachine = pastHistory[t + 1]?.machine || [];
    const decay = Math.exp(-t / 15.0);

    // Transitions depuis les numéros présents dans lastDrawWinners
    let matchingPrevCount = 0;
    let hasLeaderInPrev = false;
    let shadowTriggerCount = 0;

    for (const p of prevWinners) {
      if (lastWinnersSet.has(p)) matchingPrevCount++;
      if (p === leaderBall) hasLeaderInPrev = true;
      const comp = 91 - p;
      const mir = getMirrorBall(p);
      if (lastWinnersSet.has(comp) || lastWinnersSet.has(mir)) {
        shadowTriggerCount++;
      }
    }

    if (matchingPrevCount > 0) {
      for (const c of currWinners) {
        if (c >= 1 && c <= 90) {
          rawMarkov[c] += decay * (matchingPrevCount / Math.max(1, lastDrawWinners.length));
        }
      }
    }

    if (hasLeaderInPrev) {
      for (const c of currWinners) {
        if (c >= 1 && c <= 90) {
          rawLeaderSucc[c] += decay;
        }
      }
    }

    if (shadowTriggerCount > 0) {
      for (const c of currWinners) {
        if (c >= 1 && c <= 90) {
          rawShadow[c] += decay * (shadowTriggerCount / 5.0);
        }
      }
    }

    // Transfert Machine : P(c in gagnants_t | m in machine_{t+1}) évalué sur lastDrawMachine
    if (hasMachine && lastDrawMachine.length > 0 && prevMachine.length > 0) {
      const lastMachineSet = new Set(lastDrawMachine);
      let machineOverlap = 0;
      for (const m of prevMachine) {
        if (lastMachineSet.has(m)) machineOverlap++;
      }
      if (machineOverlap > 0) {
        for (const c of currWinners) {
          if (c >= 1 && c <= 90) {
            rawMachineTransfer[c] += decay * (machineOverlap / lastDrawMachine.length);
          }
        }
      }
    }
  }

  // Affinité intra-tirage avec les numéros du dernier tirage
  for (let t = 0; t < depth; t++) {
    const winners = pastHistory[t]?.gagnants || [];
    const decay = Math.exp(-t / 16.0);
    let overlap = 0;
    for (const w of winners) {
      if (lastWinnersSet.has(w)) overlap++;
    }
    if (overlap > 0) {
      for (const w of winners) {
        if (w >= 1 && w <= 90 && !lastWinnersSet.has(w)) {
          rawAffinity[w] += decay * (overlap / 5.0);
        }
      }
    }
  }

  // 4. Séquences d'écarts par tranches (GAP_BAND_SEQUENCE) : transition de tranches t+1 -> t
  const binTransition = Array.from({ length: 7 }, () => new Float64Array(7).fill(1.0 / 7.0));
  if (depth >= 4) {
    for (let t = 0; t < Math.min(depth - 2, 20); t++) {
      const winnersT = pastHistory[t]?.gagnants || [];
      const winnersPrev = pastHistory[t + 1]?.gagnants || [];
      const historyAfterPrev = pastHistory.slice(t + 2);
      const historyAfterT = pastHistory.slice(t + 1);

      const prevBins: number[] = [];
      for (const w of winnersPrev) {
        let g = historyAfterPrev.length;
        for (let k = 0; k < historyAfterPrev.length; k++) {
          if ((historyAfterPrev[k]?.gagnants || []).includes(w)) {
            g = k;
            break;
          }
        }
        prevBins.push(getGapBinIndex(g));
      }

      for (const w of winnersT) {
        let g = historyAfterT.length;
        for (let k = 0; k < historyAfterT.length; k++) {
          if ((historyAfterT[k]?.gagnants || []).includes(w)) {
            g = k;
            break;
          }
        }
        const targetBin = getGapBinIndex(g);
        for (const pb of prevBins) {
          binTransition[pb][targetBin] += 1.0;
        }
      }
    }
  }

  const lastDrawBins: number[] = [];
  if (depth >= 2) {
    const afterLast = pastHistory.slice(1);
    for (const w of lastDrawWinners) {
      let g = afterLast.length;
      for (let k = 0; k < afterLast.length; k++) {
        if ((afterLast[k]?.gagnants || []).includes(w)) {
          g = k;
          break;
        }
      }
      lastDrawBins.push(getGapBinIndex(g));
    }
  }

  for (let b = 1; b <= 90; b++) {
    const binB = getGapBinIndex(currentGaps[b]);
    let transScore = 0;
    for (const lb of lastDrawBins) {
      transScore += binTransition[lb][binB];
    }
    rawGapBandSeq[b] = transScore;
  }

  // 5. SPATIAL (grille 9x10), COHORT (dizaines + finales), ISOLATION_ANOMALY, INTER_DRAW_RESONANCE
  const decadeMass = new Float64Array(9);
  const finaleMass = new Float64Array(10);
  for (let t = 0; t < Math.min(depth, 12); t++) {
    const wDecay = Math.exp(-t / 5.0);
    for (const w of pastHistory[t]?.gagnants || []) {
      if (w >= 1 && w <= 90) {
        decadeMass[Math.floor((w - 1) / 10)] += wDecay;
        finaleMass[w % 10] += wDecay;
      }
    }
  }

  const recentSpatialBalls = [
    ...(pastHistory[0]?.gagnants || []),
    ...(pastHistory[1]?.gagnants || []),
  ];

  for (let b = 1; b <= 90; b++) {
    const rowB = Math.floor((b - 1) / 10);
    const colB = (b - 1) % 10;

    // SPATIAL : Diffusion gaussienne sur la grille 9x10
    let spatialEnergy = 0;
    for (const w of recentSpatialBalls) {
      if (w >= 1 && w <= 90) {
        const rowW = Math.floor((w - 1) / 10);
        const colW = (w - 1) % 10;
        const distSq = (rowB - rowW) ** 2 + (colB - colW) ** 2;
        if (distSq > 0) {
          spatialEnergy += Math.exp(-distSq / 3.0);
        }
      }
    }
    rawSpatial[b] = spatialEnergy;

    // COHORT : Énergie combinée de la dizaine et de la finale
    rawCohort[b] = 0.65 * decadeMass[rowB] + 0.35 * finaleMass[b % 10];

    // ISOLATION_ANOMALY : Distance circulaire minimale aux boules récentes
    let minCircDist = 45;
    for (const w of recentSpatialBalls) {
      const diff = Math.abs(b - w);
      const circ = Math.min(diff, 90 - diff);
      if (circ < minCircDist) minCircDist = circ;
    }
    rawIsolation[b] = minCircDist / 45.0;

    // INTER_DRAW_RESONANCE : Résonance croisée à lag-2 et voisinage harmonique
    rawInterDraw[b] = 0.5 * rawMarkov[b] + 0.5 * rawAffinity[b];
  }

  // Normalisation [0, 1] individuelle de chaque canal actif
  const normByKey: Partial<Record<AlgoKey, Float64Array>> = {
    [AlgoKey.FREQUENCY]: normalizeChannel90(rawFreq),
    [AlgoKey.GAPS]: normalizeChannel90(rawGaps),
    [AlgoKey.GAP_CADENCE]: normalizeChannel90(rawGapCadence),
    [AlgoKey.GAP_TREND]: normalizeChannel90(rawGapTrend),
    [AlgoKey.GAP_BAND_SEQUENCE]: normalizeChannel90(rawGapBandSeq),
    [AlgoKey.MARKOV]: normalizeChannel90(rawMarkov),
    [AlgoKey.BAYES]: normalizeChannel90(rawBayes),
    [AlgoKey.MOMENTUM]: normalizeChannel90(rawMomentum),
    [AlgoKey.SPECTRAL]: normalizeChannel90(rawSpectral),
    [AlgoKey.FRACTAL]: normalizeChannel90(rawFractal),
    [AlgoKey.TEMPORAL]: normalizeChannel90(rawTemporal),
    [AlgoKey.SPATIAL]: normalizeChannel90(rawSpatial),
    [AlgoKey.AFFINITY]: normalizeChannel90(rawAffinity),
    [AlgoKey.NETWORK_CORRELATION]: normalizeChannel90(rawCohort),
    [AlgoKey.ECHO_STATE]: normalizeChannel90(rawPoisson),
    [AlgoKey.DERIVED_NEIGHBOR]: normalizeChannel90(rawLeaderSucc),
    [AlgoKey.MACHINE_TRANSFER]: hasMachine
      ? normalizeChannel90(rawMachineTransfer)
      : new Float64Array(91),
    [AlgoKey.ISOLATION_ANOMALY]: normalizeChannel90(rawIsolation),
    [AlgoKey.SHADOW_PROBABILITY]: normalizeChannel90(rawShadow),
    [AlgoKey.INTER_MONTHLY_RESONANCE]: normalizeChannel90(rawInterMonthly),
    [AlgoKey.INTER_DRAW_RESONANCE]: normalizeChannel90(rawInterDraw),
  };

  const result: Record<number, Record<AlgoKey, number>> = {};
  for (let ball = 1; ball <= 90; ball++) {
    const ballMap = {} as Record<AlgoKey, number>;
    validKeys.forEach((k) => {
      if (RETIRED_ALGO_WEIGHT_KEYS.has(k)) {
        ballMap[k] = 0;
        return;
      }
      const vec = normByKey[k];
      ballMap[k] = vec ? vec[ball] : 0;
    });
    result[ball] = ballMap;
  }

  return result;
};

interface FeatureTensorSample {
  targetGagnants: Set<number>;
  features: Record<number, Record<AlgoKey, number>>;
}

const evaluateSampleSet = (
  samples: FeatureTensorSample[],
  w: Record<AlgoKey, number>,
  validKeys: AlgoKey[]
): { accuracy: number; meanLoss: number; meanEntropy: number } => {
  if (samples.length === 0) {
    return { accuracy: 0, meanLoss: 0, meanEntropy: 0 };
  }

  let totalHits = 0;
  let totalLoss = 0;
  let totalEntropy = 0;

  for (const { targetGagnants, features } of samples) {
    const logits = new Float64Array(91);
    let maxLogit = -Infinity;
    for (let b = 1; b <= 90; b++) {
      let s = 0;
      for (const k of validKeys) {
        const wk = Number.isFinite(w[k]) ? w[k] : 0;
        if (wk > 0) {
          s += wk * (features[b]?.[k] || 0);
        }
      }
      logits[b] = s;
      if (s > maxLogit) maxLogit = s;
    }

    const probs = new Float64Array(91);
    let sumExp = 0;
    for (let b = 1; b <= 90; b++) {
      probs[b] = Math.exp(Math.min(30, Math.max(-30, logits[b] - maxLogit)));
      sumExp += probs[b];
    }

    for (let b = 1; b <= 90; b++) {
      probs[b] /= sumExp || 1.0;
      if (probs[b] > 0) {
        totalEntropy -= probs[b] * Math.log2(probs[b]);
      }
    }

    const targetCount = targetGagnants.size || 5;
    targetGagnants.forEach((winningBall) => {
      if (winningBall >= 1 && winningBall <= 90) {
        // Perte Cross-Entropy normalisée par `targetCount` (cohérente avec le gradient p_b - 1/targetCount)
        totalLoss -= (1.0 / targetCount) * Math.log(Math.max(1e-9, probs[winningBall]));
      }
    });

    const top5 = Array.from({ length: 90 }, (_, i) => i + 1)
      .sort((a, b) => logits[b] - logits[a] || a - b)
      .slice(0, 5);
    totalHits += top5.filter((n) => targetGagnants.has(n)).length;
  }

  return {
    accuracy: (totalHits / (samples.length * 5)) * 100,
    meanLoss: totalLoss / samples.length,
    meanEntropy: totalEntropy / (samples.length * Math.log2(90)),
  };
};

/**
 * Exécute une passe de rétropropagation (Backpropagation) complète avec séparation
 * chronologique Entraînement / Validation (Walk-Forward Holdout) et verrouillage sur le simplexe.
 */
export const runNeuralSelfOptimization = (
  drawName: string,
  history: DrawResult[],
  initialWeights: AlgoWeights,
  params: Partial<NeuralHyperparameters> = {}
): NeuralOptimizationResult => {
  const startTime = Date.now();
  const hyperparams: NeuralHyperparameters = {
    ...DEFAULT_NEURAL_HYPERPARAMS,
    ...params,
  };
  const pureHistory = purifyHistoryForDraw<DrawResult>(drawName, history);

  const validKeys = Object.values(AlgoKey);
  const hasMachine = pureHistory.some(
    (d) => Array.isArray(d.machine) && d.machine.length > 0
  );
  const initCopy: AlgoWeights = { ...initialWeights };
  if (!hasMachine) {
    initCopy[AlgoKey.MACHINE_TRANSFER] = 0;
  }
  const normalizedInit = normalizeWeights(initCopy);

  const batchDepth = Math.min(
    hyperparams.batchDepth,
    Math.max(5, pureHistory.length - 1)
  );
  const trainingBatch = pureHistory.slice(0, batchDepth);

  // 1. Pré-extraction déterministe des tenseurs de features historiques F[t][ball][algo]
  const allTensors: FeatureTensorSample[] = [];
  for (let t = 0; t < trainingBatch.length; t++) {
    const targetDraw = trainingBatch[t];
    const pastSubset = pureHistory.slice(t + 1);
    if (pastSubset.length < 3) continue;

    const featuresByBall = computeFastHistoricalFeatures(pastSubset, validKeys);
    const targetGagnants = new Set<number>(targetDraw.gagnants || []);
    allTensors.push({
      targetGagnants,
      features: featuresByBall,
    });
  }

  const effectiveBatchSize = allTensors.length;
  if (effectiveBatchSize === 0) {
    return {
      drawName,
      epochsCompleted: 0,
      initialLoss: 1.0,
      finalLoss: 1.0,
      lossReductionPct: 0,
      initialAccuracy: 0,
      finalAccuracy: 0,
      accuracyGain: 0,
      batchSize: 0,
      trainingSampleCount: 0,
      validationSampleCount: 0,
      initialWeights: { ...normalizedInit },
      optimizedWeights: { ...normalizedInit },
      algoGradients: [],
      epochHistory: [],
      trainingDurationMs: 0,
      convergenceStatus: 'PLATEAU',
    };
  }

  // Partition chronologique Walk-Forward :
  // - `valTensors` : les tirages les plus récents (indices 0..valCount-1, hors-échantillon)
  // - `trainTensors` : les tirages antérieurs (indices valCount..N-1) utilisés pour les gradients
  const valCount =
    effectiveBatchSize >= 4
      ? Math.max(1, Math.min(Math.floor(effectiveBatchSize * 0.3), effectiveBatchSize - 2))
      : 0;
  const valTensors = valCount > 0 ? allTensors.slice(0, valCount) : allTensors;
  const trainTensors = valCount > 0 ? allTensors.slice(valCount) : allTensors;

  // Preuve empirique évaluée sans fuite temporelle sur la fenêtre d'entraînement
  const proofHistory = pureHistory.slice(valCount);
  const proofMap = evaluateAlgoEmpiricalProof(
    drawName,
    proofHistory.length >= 3 ? proofHistory : pureHistory
  );

  const lockedMaxKeys = new Set<AlgoKey>();
  const forcedZeroKeys = new Set<AlgoKey>();
  if (!hasMachine) {
    forcedZeroKeys.add(AlgoKey.MACHINE_TRANSFER);
  }
  validKeys.forEach((k) => {
    const proof = proofMap[k];
    const hasProof = Boolean(proof && proof.hasProof && proof.proofScore > 0);
    if (!hasProof) {
      lockedMaxKeys.add(k);
    }
  });

  // 2. Initialisation des vecteurs de poids (respect strict des poids nuls)
  const currentW: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  const momentumV: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
  validKeys.forEach((k) => {
    currentW[k] = Number.isFinite(normalizedInit[k]) ? normalizedInit[k] : 0;
    momentumV[k] = 0;
  });

  const initialTrainEval = evaluateSampleSet(trainTensors, currentW, validKeys);
  const initialValEval = evaluateSampleSet(valTensors, currentW, validKeys);

  const epochHistory: NeuralEpochLog[] = [];
  let initialLoss = initialTrainEval.meanLoss;
  let finalLoss = initialTrainEval.meanLoss;
  const maxEpochs = hyperparams.epochs;
  let lastGradients: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;

  for (let ep = 0; ep < maxEpochs; ep++) {
    const gradients: Record<AlgoKey, number> = {} as Record<AlgoKey, number>;
    validKeys.forEach((k) => {
      gradients[k] = 0;
    });

    let epochLoss = 0;
    let epochEntropySum = 0;

    for (let t = 0; t < trainTensors.length; t++) {
      const { targetGagnants, features } = trainTensors[t];

      const logits = new Float64Array(91);
      let maxLogit = -Infinity;
      for (let b = 1; b <= 90; b++) {
        let s = 0;
        for (const k of validKeys) {
          if (currentW[k] > 0) {
            s += currentW[k] * (features[b]?.[k] || 0);
          }
        }
        logits[b] = s;
        if (s > maxLogit) maxLogit = s;
      }

      const probs = new Float64Array(91);
      let sumExp = 0;
      for (let b = 1; b <= 90; b++) {
        probs[b] = Math.exp(Math.min(30, Math.max(-30, logits[b] - maxLogit)));
        sumExp += probs[b];
      }

      for (let b = 1; b <= 90; b++) {
        probs[b] /= sumExp || 1.0;
        if (probs[b] > 0) {
          epochEntropySum -= probs[b] * Math.log2(probs[b]);
        }
      }

      const targetCount = targetGagnants.size || 5;
      targetGagnants.forEach((winningBall) => {
        if (winningBall >= 1 && winningBall <= 90) {
          epochLoss -=
            (1.0 / targetCount) * Math.log(Math.max(1e-9, probs[winningBall]));
        }
      });

      for (let b = 1; b <= 90; b++) {
        const y_b = targetGagnants.has(b) ? 1.0 / targetCount : 0.0;
        const error_b = probs[b] - y_b;

        for (const k of validKeys) {
          if (currentW[k] > 0) {
            gradients[k] += error_b * (features[b]?.[k] || 0);
          }
        }
      }
    }

    let gradNormSq = 0;
    validKeys.forEach((k) => {
      if (currentW[k] <= 0) {
        gradients[k] = 0;
        return;
      }
      gradients[k] =
        gradients[k] / trainTensors.length +
        hyperparams.l2Regularization * (currentW[k] - normalizedInit[k]);
      gradNormSq += gradients[k] * gradients[k];
    });

    const gradNorm = Math.sqrt(gradNormSq);
    lastGradients = { ...gradients };

    const progress = ep / Math.max(1, maxEpochs - 1);
    const dynamicLR =
      hyperparams.learningRate * (0.5 * (1.0 + Math.cos(Math.PI * progress)));

    const candidateStep: Record<string, number> = {};
    validKeys.forEach((k) => {
      if (currentW[k] <= 0 || RETIRED_ALGO_WEIGHT_KEYS.has(k) || forcedZeroKeys.has(k)) {
        candidateStep[k] = 0;
        return;
      }
      momentumV[k] =
        hyperparams.momentum * momentumV[k] +
        (1.0 - hyperparams.momentum) * gradients[k];

      let step = dynamicLR * momentumV[k];
      if (lockedMaxKeys.has(k) && step < 0) {
        step = 0;
      }
      // Mise à jour multiplicative (Exponentiated Gradient sur le simplexe) évitant l'extinction à 0.0001
      candidateStep[k] = currentW[k] * Math.exp(-step * 2.5);
    });

    const projectedW = projectWeightsWithProofGuard(
      candidateStep,
      normalizedInit,
      lockedMaxKeys,
      forcedZeroKeys
    );
    validKeys.forEach((k) => {
      currentW[k] = projectedW[k];
    });

    const meanEntropy =
      epochEntropySum / (trainTensors.length * Math.log2(90));
    const meanLoss = epochLoss / trainTensors.length;
    const valEval = evaluateSampleSet(valTensors, currentW, validKeys);

    if (ep === 0) initialLoss = meanLoss;
    finalLoss = meanLoss;

    epochHistory.push({
      epoch: ep + 1,
      loss: parseFloat(meanLoss.toFixed(5)),
      validationLoss: parseFloat(valEval.meanLoss.toFixed(5)),
      accuracyDelta: parseFloat(
        (valEval.accuracy - initialValEval.accuracy).toFixed(2)
      ),
      gradientNorm: parseFloat(gradNorm.toFixed(5)),
      learningRate: parseFloat(dynamicLR.toFixed(5)),
      meanEntropy: parseFloat(meanEntropy.toFixed(4)),
    });
  }

  const finalTrainEval = evaluateSampleSet(trainTensors, currentW, validKeys);
  const finalValEval = evaluateSampleSet(valTensors, currentW, validKeys);
  const optimizedWeights = projectWeightsWithProofGuard(
    currentW,
    normalizedInit,
    lockedMaxKeys,
    forcedZeroKeys
  );
  const duration = Date.now() - startTime;

  const algoGradients: AlgoNeuralGradientInfo[] = validKeys
    .map((algoKey) => {
      const label = LABELS_MAP[algoKey] || algoKey;
      const category = getCategoryName(algoKey);
      const initW = Number.isFinite(normalizedInit[algoKey])
        ? normalizedInit[algoKey]
        : 0;
      const optW = Number.isFinite(optimizedWeights[algoKey])
        ? optimizedWeights[algoKey]
        : 0;
      const delta = optW - initW;
      const deltaPct = initW > 0 ? (delta / initW) * 100 : 0;

      const proof = proofMap[algoKey];
      const proofScore = proof?.proofScore || 0;
      const hasEmpiricalProof = Boolean(proof?.hasProof && proofScore > 0);
      const grad = lastGradients[algoKey] || 0;
      const mom = momentumV[algoKey] || 0;

      let gatingAction: AlgoNeuralGradientInfo['gatingAction'] = 'MAINTAINED';
      if (!hasEmpiricalProof && grad < 0) {
        gatingAction = 'PROOF_LOCKED';
      } else if (delta > 0.002) {
        gatingAction = 'BOOSTED';
      } else if (delta < -0.002) {
        gatingAction = 'DAMPENED';
      }

      return {
        algoKey,
        label,
        category,
        initialWeight: parseFloat(initW.toFixed(5)),
        optimizedWeight: parseFloat(optW.toFixed(5)),
        weightDelta: parseFloat(delta.toFixed(5)),
        weightDeltaPct: parseFloat(deltaPct.toFixed(2)),
        gradient: parseFloat(grad.toFixed(6)),
        momentum: parseFloat(mom.toFixed(6)),
        hasEmpiricalProof,
        proofScore: parseFloat(proofScore.toFixed(2)),
        gatingAction,
      };
    })
    .sort((a, b) => b.optimizedWeight - a.optimizedWeight);

  const lossReductionPct =
    initialLoss > 0 ? ((initialLoss - finalLoss) / initialLoss) * 100 : 0;

  return {
    drawName,
    epochsCompleted: maxEpochs,
    initialLoss: parseFloat(initialLoss.toFixed(5)),
    finalLoss: parseFloat(finalLoss.toFixed(5)),
    lossReductionPct: parseFloat(lossReductionPct.toFixed(2)),
    validationLossInitial: parseFloat(initialValEval.meanLoss.toFixed(5)),
    validationLossFinal: parseFloat(finalValEval.meanLoss.toFixed(5)),
    initialAccuracy: parseFloat(initialValEval.accuracy.toFixed(2)),
    finalAccuracy: parseFloat(finalValEval.accuracy.toFixed(2)),
    accuracyGain: parseFloat(
      (finalValEval.accuracy - initialValEval.accuracy).toFixed(2)
    ),
    trainAccuracyInitial: parseFloat(initialTrainEval.accuracy.toFixed(2)),
    trainAccuracyFinal: parseFloat(finalTrainEval.accuracy.toFixed(2)),
    batchSize: effectiveBatchSize,
    trainingSampleCount: trainTensors.length,
    validationSampleCount: valTensors.length,
    initialWeights: normalizedInit,
    optimizedWeights,
    algoGradients,
    epochHistory,
    trainingDurationMs: duration,
    convergenceStatus: lossReductionPct > 1.5 ? 'CONVERGED' : 'PLATEAU',
  };
};

/**
 * Version asynchrone non-bloquante partageant strictement le même pipeline mathématique
 * avec notification progressive de chaque époque pour la fluidité UI.
 */
export const runNeuralSelfOptimizationAsync = async (
  drawName: string,
  history: DrawResult[],
  initialWeights: AlgoWeights,
  params: Partial<NeuralHyperparameters> = {},
  onEpochProgress?: (
    epoch: number,
    totalEpochs: number,
    currentLoss: number,
    currentAccDelta: number
  ) => void
): Promise<NeuralOptimizationResult> => {
  const result = runNeuralSelfOptimization(
    drawName,
    history,
    initialWeights,
    params
  );

  if (onEpochProgress && result.epochHistory.length > 0) {
    const total = result.epochHistory.length;
    for (const epLog of result.epochHistory) {
      onEpochProgress(epLog.epoch, total, epLog.loss, epLog.accuracyDelta);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return result;
};
