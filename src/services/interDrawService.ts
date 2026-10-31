import {
  INTER_DRAW_FAMILIES,
  INTER_DRAW_NETWORKS,
  InterDrawFamilyConfig,
  InterDrawFamilyId,
  InterDrawNetworkId,
  InterDrawSequenceItem,
  getFamilyPredecessorAndSuccessor,
  getInterDrawFamiliesForDraw,
  getPrimaryInterDrawFamily,
  isDrawInInterDrawFamily,
  getDrawNetworkId,
  areDrawsInSameNetwork,
  normalizeDrawName,
  getMirrorNumber,
  getComplement90,
  THEORETICAL_CARRYOVER_PROB,
  THEORETICAL_CARRYOVER_RATE_PERCENT,
  getDrawFullTimestamp,
} from '../constants';
import { DrawResult } from '../types';
import {
  lotteryService,
  LOTTERY_CONSTANTS,
  getDrawTimestamp
} from './lotteryService';
import { globalCache, CACHE_TTL } from './cache/CacheService';
import {
  computeCrossHawkesKernelHpc,
  computeRobustHurstHpc,
  computeBivariateCrossDyadsHpc,
  BivariateDyadsReportHpc,
  InterDrawCrossDyadHpc
} from './wasm/lotoEngineBridge';
import { purifyHistoryForDraw } from '../utils/arrayUtils';
import {
  computeInterDrawComplexDynamics,
  InterDrawComplexDynamicsReport
} from './interDrawDynamicsService';
import {
  analyzeInterDrawCooccurrences,
  analyzeInterDrawPatterns,
  InterDrawCooccurrenceReport,
  InterDrawPatternReport,
  InterDrawTargetPairCooccurrence,
  InterDrawCrossDyad,
  InterDrawBivariateTrigger,
  InterDrawParityPattern,
  InterDrawDecadePattern,
  InterDrawDecadeFlux,
  InterDrawCascadePattern,
  InterDrawCascadeNeighbour,
  InterDrawCentroidPattern,
  InterDrawRetentionPattern
} from './interDrawPatternService';
import {
  buildWeightedTransitionMatrix,
  WeightedTransitionMatrix,
  TransitionPairSource
} from './interDrawTransitionMatrix';

// Probabilité marginale théorique exacte d'un numéro : 5/90.
const THEORETICAL_SINGLE_PROB =
  LOTTERY_CONSTANTS.NUMBERS_PER_DRAW / LOTTERY_CONSTANTS.TOTAL_NUMBERS;

// Décroissance Hawkes neutre (Hurst = 0.5) : cas mémoire non dilatée de la formule
// de demi-vie ln2 / (1.5 · dilatation mémoire) — sert de repli exact lorsque le moteur
// n'expose pas sa propre valeur calculée.
const HAWKES_NEUTRAL_BETA_DECAY = Math.LN2 / 1.5;

export type {
  InterDrawCooccurrenceReport,
  InterDrawPatternReport,
  InterDrawTargetPairCooccurrence,
  InterDrawCrossDyad,
  InterDrawBivariateTrigger,
  InterDrawParityPattern,
  InterDrawDecadePattern,
  InterDrawDecadeFlux,
  InterDrawCascadePattern,
  InterDrawCascadeNeighbour,
  InterDrawCentroidPattern,
  InterDrawRetentionPattern
};

export interface InterDrawCandidateScore {
  number: number;
  compositeScore: number; // 0 à 100
  transitionScore: number; // 0 à 100 (Markov conditionnel bayésien continu)
  repeatScore: number; // 0 à 100 (Report direct carry-over)
  harmonicScore: number; // 0 à 100 (Miroir décimal / Complémentaire 91)
  hawkesScore?: number; // 0 à 100 (Processus de Hawkes croisé vectorisé)
  hawkesExcitation?: number;
  confidence: number; // 0 à 1 (Indice bayésien continu)
  flags: string[];
  rawTransitionProb: number;
  // Explicabilité & Fiabilité Statistique
  signalStatus?: 'SIGNAL_DETECTE' | 'INDISCERNABLE_BRUIT';
  confidenceInterval?: [number, number]; // [IC_inf, IC_sup] en %
  sourceContributions?: { sourceName: string; weight: number; logLift: number }[];
}

export interface InterDrawPairCombination {
  numbers: [number, number];
  affinity: number; // 0 à 100
  confidence: number; // 0 à 1
  label: string;
}

export interface SourceTransitionItem {
  targetNumber: number;
  probability: number;
  lift: number;
  occurrences: number;
}

export interface SourceTransitions {
  sourceNumber: number;
  transitions: SourceTransitionItem[];
}

export interface InterDrawTransitionCell {
  from: number;
  to: number;
  probability: number;
  occurrences: number;
}

export interface HarmonicPairDetail {
  from: number;
  to: number;
  type: 'MIROIR' | 'COMPLEMENT';
  occurrences: number;
  empiricalRate: number; // % réel observé dans le cycle
  lift: number; // Ratio observé / théorique (5/90 ~ 5.55%)
  isActiveInCurrentDraw: boolean;
  score: number; // 0 à 100
}

export interface HarmonicResonanceMetrics {
  mirrorObservedRate: number; // % réel d'attraction miroir inter-tirages
  mirrorExpectedRate: number; // % théorique (5.55%)
  mirrorLift: number; // Lift multiplicatif miroir
  complementObservedRate: number; // % réel d'attraction complément 91
  complementExpectedRate: number; // % théorique (5.55%)
  complementLift: number; // Lift multiplicatif complément 91
  overallHarmonicAttractionRate: number;
  harmonicPairs: HarmonicPairDetail[];
}

export interface InterDrawIndirectPath {
  sourceName: string;
  bridgeName: string;
  targetName: string;
  directWeight: number;
  indirectStrength: number;
  amplificationRatio: number;
}

export interface InterDrawCommunity {
  id: string;
  label: string;
  timeSlot: string;
  drawNames: string[];
  meanInternalCoupling: number;
}

export interface InterDrawNodeCoupling {
  sourceName: string;
  targetName: string;
  correlation: number; // Pearson r [-1, 1]
  weight: number; // [0, 1] continue
  carryOverRate: number; // %
  machineTransferRate?: number; // % transfert machine(source) -> gagnants(cible)
  samplePairs: number;
  predictiveLogLossGain?: number; // Delta LogLoss hors-échantillon (walk-forward vs marginal)
  lagHours?: number; // Lag temporel moyen en heures
  timeSlotRelation?: 'CONSECUTIVE_SLOT' | 'SAME_SLOT' | 'CROSS_DAY';
}

export interface InterDrawNetworkMatrix {
  networkId: InterDrawNetworkId;
  drawNames: string[];
  weights: Record<string, Record<string, number>>; // W[target][source]
  couplings: InterDrawNodeCoupling[];
  meanNetworkCoupling: number;
  communities?: InterDrawCommunity[];
  indirectPaths?: InterDrawIndirectPath[];
  networkFingerprint?: string;
}

export interface InterDrawNetworkContribution {
  sourceName: string;
  weight: number;
  normalizedWeight: number;
  correlation: number;
  carryOverRate: number;
  machineTransferRate?: number;
  samplePairs: number;
  latestWinners: number[];
  latestMachine?: number[];
  isImmediatePredecessor: boolean;
  influenceScore: number;
  topTransmittedNumbers: number[];
}

/**
 * Matrices de transition 90×90 par portée de sources (même code de calcul, cf. interDrawTransitionMatrix.ts) :
 * - immediate : prédécesseur immédiat uniquement ;
 * - network   : tous les tirages du réseau fermé, pondérés par leur couplage continu.
 */
export interface InterDrawNetworkTransitionReport {
  immediate: WeightedTransitionMatrix;
  network: WeightedTransitionMatrix;
}

export interface InterDrawReport {
  targetDraw: string;
  family: InterDrawFamilyConfig;
  networkId: InterDrawNetworkId;
  networkMatrix?: InterDrawNetworkMatrix;
  networkCouplings?: InterDrawNodeCoupling[];
  networkContributions?: InterDrawNetworkContribution[];
  isNetworkWideAggregated?: boolean;
  networkInfluenceWeight?: number;
  predecessor: InterDrawSequenceItem;
  successor: InterDrawSequenceItem;
  currentIndex: number;
  totalInFamily: number;
  predecessorResult: DrawResult | null;
  targetLatestResult: DrawResult | null;
  carryOverRate: number; // % réel de tirages consécutifs partageant >= 1 numéro
  carryOverExpected: number; // % théorique nul (25/90 ~ 27.78%)
  carryOverLift: number; // Ratio observé / théorique
  harmonicMetrics: HarmonicResonanceMetrics;
  totalDrawsAnalyzed: number;
  topCandidates: InterDrawCandidateScore[];
  recommendedRepeats: InterDrawCandidateScore[];
  recommendedHarmonics: InterDrawCandidateScore[];
  recommendedPairs: InterDrawPairCombination[];
  topTransitions: InterDrawTransitionCell[];
  sourceTransitions: SourceTransitions[];
  fullCandidateScores: number[];
  hawkesMetrics?: {
    totalEnergy: number;
    betaDecay: number;
    lagExcitations: number[];
  };
  cooccurrenceMetrics?: InterDrawCooccurrenceReport;
  patternMetrics?: InterDrawPatternReport;
  complexDynamics?: InterDrawComplexDynamicsReport;
  bivariateHpcReport?: BivariateDyadsReportHpc;
  networkTransition?: InterDrawNetworkTransitionReport;
  indirectPaths?: InterDrawIndirectPath[];
  communities?: InterDrawCommunity[];
  networkFingerprint?: string;
  generationTimestamp: number;
}

export type { BivariateDyadsReportHpc, InterDrawCrossDyadHpc };
export { getMirrorNumber, getComplement90 };

/**
 * Fonction logistique continue pour projeter des scores normalisés sur [0, 100]
 * sans discontinuité ni nombre magique arbitraire.
 */
const continuousSigmoid = (z: number): number => {
  return 100 / (1 + Math.exp(-z));
};

/**
 * Aligne chronologiquement de manière stricte les historiques du tirage cible et de son prédécesseur direct.
 * Élimine tout décalage temporel d'un cran d'indice (look-ahead leak ou déphasage de cycle).
 */
export interface ConsecutiveDrawPair {
  predWinners: number[];
  targetWinners: number[];
  predMachine?: number[];
  targetMachine?: number[];
  targetDate: string;
  predDate: string;
}

export const alignConsecutiveDrawHistories = (
  targetHistory: DrawResult[],
  predHistory: DrawResult[],
  targetDrawName?: string,
  predDrawName?: string
): ConsecutiveDrawPair[] => {
  const paired: ConsecutiveDrawPair[] = [];
  if (!targetHistory || !predHistory || targetHistory.length === 0 || predHistory.length === 0) {
    return paired;
  }

  // Vérification de la présence de dates valides avec heure pour alignement chronologique strict
  const tHasDates = targetHistory.some(d => getDrawTimestamp(d.date, d.drawName || d.draw_name || targetDrawName) > 0);
  const pHasDates = predHistory.some(d => getDrawTimestamp(d.date, d.drawName || d.draw_name || predDrawName) > 0);

  if (tHasDates && pHasDates) {
    const sortedTargets = [...targetHistory]
      .filter(d => (d.gagnants || []).length === LOTTERY_CONSTANTS.NUMBERS_PER_DRAW)
      .map(d => ({ draw: d, ts: getDrawTimestamp(d.date, d.drawName || d.draw_name || targetDrawName) }))
      .filter(d => d.ts > 0)
      .sort((a, b) => b.ts - a.ts);

    const sortedPreds = [...predHistory]
      .filter(d => (d.gagnants || []).length === LOTTERY_CONSTANTS.NUMBERS_PER_DRAW)
      .map(d => ({ draw: d, ts: getDrawTimestamp(d.date, d.drawName || d.draw_name || predDrawName) }))
      .filter(d => d.ts > 0)
      .sort((a, b) => b.ts - a.ts);

    // Fenêtre maximale pour considérer 2 tirages comme consécutifs (14 jours en ms, couvre cycles hebdo et quotidien)
    const MAX_GAP_MS = 14 * 24 * 3600 * 1000;
    let predSearchIndex = 0;

    for (const tItem of sortedTargets) {
      let matchedPred: typeof sortedPreds[0] | null = null;
      for (let pIdx = predSearchIndex; pIdx < sortedPreds.length; pIdx++) {
        const pItem = sortedPreds[pIdx];
        if (pItem.ts < tItem.ts) {
          const delta = tItem.ts - pItem.ts;
          if (delta <= MAX_GAP_MS) {
            matchedPred = pItem;
            predSearchIndex = pIdx + 1; // Un tirage prédécesseur ne peut servir qu'une fois
          }
          break;
        }
      }

      if (matchedPred) {
        paired.push({
          predWinners: matchedPred.draw.gagnants,
          targetWinners: tItem.draw.gagnants,
          predMachine: Array.isArray(matchedPred.draw.machine) ? matchedPred.draw.machine : [],
          targetMachine: Array.isArray(tItem.draw.machine) ? tItem.draw.machine : [],
          targetDate: tItem.draw.date || '',
          predDate: matchedPred.draw.date || ''
        });
      }
    }

    if (paired.length > 0) {
      return paired;
    }
  }

  // Repli déterministe par décalage d'indices si les horodatages sont absents ou synthétiques
  const t0Time = getDrawTimestamp(targetHistory[0]?.date, targetHistory[0]?.drawName || targetDrawName);
  const p0Time = getDrawTimestamp(predHistory[0]?.date, predHistory[0]?.drawName || predDrawName);

  let predOffset = 0;
  if (p0Time > t0Time && p0Time > 0 && t0Time > 0) {
    predOffset = 1;
  }

  const maxPairs = Math.min(targetHistory.length, predHistory.length - predOffset);
  for (let i = 0; i < maxPairs; i++) {
    const t = targetHistory[i];
    const p = predHistory[i + predOffset];
    const tGagnants = t?.gagnants || [];
    const pGagnants = p?.gagnants || [];
    if (tGagnants.length === LOTTERY_CONSTANTS.NUMBERS_PER_DRAW && pGagnants.length === LOTTERY_CONSTANTS.NUMBERS_PER_DRAW) {
      paired.push({
        predWinners: pGagnants,
        targetWinners: tGagnants,
        predMachine: Array.isArray(p?.machine) ? p.machine : [],
        targetMachine: Array.isArray(t?.machine) ? t.machine : [],
        targetDate: t.date || '',
        predDate: p.date || ''
      });
    }
  }

  return paired;
};

/**
 * Moteur mathématique bayésien continu unifié pour les résonances inter-tirages.
 * ZÉRO NOMBRE MAGIQUE, CONTINUITÉ DIFFÉRENTIABLE, SANS PORTE D'ACTIVATION BRUSQUE.
 */
interface BayesianEngineResult {
  sampleSize: number;
  laplaceAlpha: number;
  carryOverRate: number;
  carryOverExpected: number;
  carryOverLift: number;
  mirrorObservedRate: number;
  mirrorExpectedRate: number;
  mirrorLift: number;
  complementObservedRate: number;
  complementExpectedRate: number;
  complementLift: number;
  overallHarmonicAttractionRate: number;
  transitionsCount: number[][];
  fromTotals: number[];
  targetMarginalCounts: number[];
  repeatCounts: number[];
  mirrorPairOccurrences: Record<string, number>;
  compPairOccurrences: Record<string, number>;
  scoredCandidates: InterDrawCandidateScore[];
  fullCandidateScores: number[];
  hawkesTotalEnergy?: number;
  hawkesBetaDecay?: number;
  hawkesLagExcitations?: number[];
}

export const runBayesianResonanceEngine = (
  pairedPairs: { predWinners: number[]; targetWinners: number[] }[],
  activePredNumbers: number[],
  predLaggedHistory?: number[][],
  optimalAlpha?: number,
  targetHurst?: number,
  targetDrawName?: string,
  predDrawName?: string
): BayesianEngineResult => {
  const K = LOTTERY_CONSTANTS.NUMBERS_PER_DRAW; // 5
  const N = LOTTERY_CONSTANTS.TOTAL_NUMBERS; // 90
  const p0 = K / N; // 5/90 ~ 0.055555...
  const logitP0 = Math.log(p0 / (1.0 - p0)); // ln(1/17) ~ -2.833213

  const sampleSize = pairedPairs.length;
  // Paramètre d'échelle combinatoire dérivé de l'espace d'état (N/K = 90/5 = 18.0)
  const sampleScale = N / K;
  // Paramètre de lissage de Laplace continu auto-calibré en boucle fermée via shrinkage de James-Stein
  const priorAlpha = 1.0 / (1.0 + Math.log(1.0 + sampleSize));
  const laplaceAlpha = (typeof optimalAlpha === 'number' && !isNaN(optimalAlpha) && optimalAlpha > 0)
    ? (sampleSize / (sampleSize + sampleScale)) * optimalAlpha + (sampleScale / (sampleSize + sampleScale)) * priorAlpha
    : priorAlpha;

  // Matrices de dénombrement des transitions et répétitions
  const transitionsCount: number[][] = Array.from({ length: 91 }, () => new Array(91).fill(0));
  const fromTotals: number[] = new Array(91).fill(0);
  const targetMarginalCounts: number[] = new Array(91).fill(0);
  const repeatCounts: number[] = new Array(91).fill(0);

  let totalConsecutivePairs = 0;
  let carryOverOccurrences = 0;

  for (const pair of pairedPairs) {
    totalConsecutivePairs++;
    let hasCommon = false;

    for (const tw of pair.targetWinners) {
      if (tw >= 1 && tw <= 90) {
        targetMarginalCounts[tw]++;
      }
    }

    for (const pw of pair.predWinners) {
      if (pw >= 1 && pw <= 90) {
        fromTotals[pw]++;
        if (pair.targetWinners.includes(pw)) {
          hasCommon = true;
          repeatCounts[pw]++;
        }
        for (const tw of pair.targetWinners) {
          if (tw >= 1 && tw <= 90) {
            transitionsCount[pw][tw]++;
          }
        }
      }
    }

    if (hasCommon) {
      carryOverOccurrences++;
    }
  }

  // Taux de carry-over empirique et espérance théorique exacte (format 5/90 : 1 - C(85,5)/C(90,5) = 25.37%)
  const carryOverExpected = THEORETICAL_CARRYOVER_RATE_PERCENT; // 25.37%
  const carryOverRate = totalConsecutivePairs > 0
    ? (carryOverOccurrences / totalConsecutivePairs) * 100
    : carryOverExpected;
  const carryOverLift = carryOverRate / carryOverExpected;

  // Calcul du taux d'attraction empirique des Résonances Harmoniques (Miroirs & Compléments)
  let mirrorOccurrences = 0;
  let mirrorAttempts = 0;
  let complementOccurrences = 0;
  let compAttempts = 0;
  const mirrorPairOccurrences: Record<string, number> = {};
  const compPairOccurrences: Record<string, number> = {};

  for (const pair of pairedPairs) {
    const targetSet = new Set(pair.targetWinners);
    for (const pw of pair.predWinners) {
      const mir = getMirrorNumber(pw);
      if (mir !== pw) {
        mirrorAttempts++;
        if (targetSet.has(mir)) {
          mirrorOccurrences++;
          const k = `${pw}_${mir}`;
          mirrorPairOccurrences[k] = (mirrorPairOccurrences[k] || 0) + 1;
        }
      }
      const comp = getComplement90(pw);
      if (comp !== pw) {
        compAttempts++;
        if (targetSet.has(comp)) {
          complementOccurrences++;
          const k = `${pw}_${comp}`;
          compPairOccurrences[k] = (compPairOccurrences[k] || 0) + 1;
        }
      }
    }
  }

  const mirrorExpectedRate = (K / N) * 100; // 5.5556%
  const mirrorObservedRate = mirrorAttempts > 0 ? (mirrorOccurrences / mirrorAttempts) * 100 : mirrorExpectedRate;
  const mirrorLift = mirrorObservedRate / mirrorExpectedRate;

  const complementExpectedRate = (K / N) * 100; // 5.5556%
  const complementObservedRate = compAttempts > 0 ? (complementOccurrences / compAttempts) * 100 : complementExpectedRate;
  const complementLift = complementObservedRate / complementExpectedRate;

  const totalHarmonicAttempts = mirrorAttempts + compAttempts;
  const totalHarmonicHits = mirrorOccurrences + complementOccurrences;
  const overallHarmonicAttractionRate = totalHarmonicAttempts > 0 ? (totalHarmonicHits / totalHarmonicAttempts) * 100 : mirrorExpectedRate;

  // Numéros actifs du prédécesseur
  const validPred = activePredNumbers.filter(n => n >= 1 && n <= 90);
  const activePredSet = new Set(validPred);
  const activeMirrors = new Set(validPred.map(getMirrorNumber));
  const activeComplements = new Set(validPred.map(getComplement90));

  // Noyau de Hawkes Croisé Vectorisé Multi-Lags
  const lagHistory = (predLaggedHistory && predLaggedHistory.length > 0)
    ? predLaggedHistory
    : [activePredNumbers, ...(pairedPairs.slice(0, 4).map(p => p.predWinners))];
  const lagCount = Math.max(1, Math.min(5, lagHistory.length));
  const predLaggedOccurrences = new Int32Array(lagCount * K);
  for (let l = 0; l < lagCount; l++) {
    const g = (lagHistory[l] || []).filter(n => Number.isInteger(n) && n >= 1 && n <= N);
    for (let col = 0; col < K; col++) {
      predLaggedOccurrences[l * K + col] = g[col] ?? 0;
    }
  }

  const targetBaseline = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) {
    targetBaseline[i] = (targetMarginalCounts[i] + laplaceAlpha * p0) / (sampleSize + laplaceAlpha);
  }

  const stride = N + 1;
  const crossCouplingMatrix = new Float64Array(stride * stride);
  const logCarry = Math.log(Math.max(1e-4, carryOverLift));
  const logHarm = Math.log(Math.max(1e-4, (mirrorLift + complementLift) / 2.0));
  // Poids continus des canaux dérivés par contraste d'évidence (softmax régularisé, zéro constante arbitraire)
  const expTrans = 1.0;
  const expCarry = Math.exp(Math.max(-2, Math.min(2, logCarry)));
  const expHarm = Math.exp(Math.max(-2, Math.min(2, logHarm)));
  const totalCouplingWeight = expTrans + expCarry + expHarm;
  const wTrans = expTrans / totalCouplingWeight;
  const wCarry = expCarry / totalCouplingWeight;
  const wHarm = expHarm / totalCouplingWeight;

  for (let j = 1; j <= N; j++) {
    const rowOffset = j * stride;
    const transDenom = fromTotals[j] + laplaceAlpha;
    const mirJ = getMirrorNumber(j);
    const compJ = getComplement90(j);

    for (let i = 1; i <= N; i++) {
      const pTrans = transDenom > 0 ? (transitionsCount[j][i] + laplaceAlpha * p0) / transDenom : p0;
      const liftTrans = Math.max(1e-4, pTrans / p0);

      let liftCarry = 1.0;
      if (i === j) {
        const pDenom = (fromTotals[j] + laplaceAlpha) * p0;
        const empLift = pDenom > 0 ? (repeatCounts[j] + laplaceAlpha * p0) / pDenom : 1.0;
        liftCarry = Math.max(1e-4, carryOverLift * empLift);
      }

      const dMir = Math.min(Math.abs(i - mirJ), 90 - Math.abs(i - mirJ));
      const dComp = Math.min(Math.abs(i - compJ), 90 - Math.abs(i - compJ));
      const kMir = Math.exp(-(dMir * dMir) / 2.0) * mirrorLift;
      const kComp = Math.exp(-(dComp * dComp) / 2.0) * complementLift;
      const liftHarm = 1.0 + kMir + kComp;

      crossCouplingMatrix[rowOffset + i] =
        wTrans * Math.log(Math.max(1e-4, liftTrans)) +
        wCarry * Math.log(Math.max(1e-4, liftCarry)) +
        wHarm * Math.log(Math.max(1e-4, liftHarm));
    }
  }

  // Modulation continue C^∞ de la demi-vie en fonction du régime de mémoire fractale (Hurst)
  let effectiveHurst = 0.5;
  if (typeof targetHurst === 'number' && !isNaN(targetHurst)) {
    effectiveHurst = targetHurst;
  } else if (pairedPairs.length >= 10) {
    const sampleSignal = new Float64Array(pairedPairs.map(p => p.targetWinners.length > 0 ? p.targetWinners[0] : 45));
    effectiveHurst = computeRobustHurstHpc(sampleSignal);
  }

  // H > 0.5 (persistance) -> demi-vie plus longue (décroissance plus lente)
  // H < 0.5 (anti-persistance) -> amortissement rapide
  const memoryDilation = 1.0 + 2.0 * Math.tanh(effectiveHurst - 0.5);
  const betaDecay = HAWKES_NEUTRAL_BETA_DECAY / Math.max(0.2, memoryDilation);

  const hawkesRes = computeCrossHawkesKernelHpc({
    predOccurrences: predLaggedOccurrences,
    lagCount,
    winCols: K,
    targetBaseline,
    couplingMatrix: crossCouplingMatrix,
    betaDecay
  });

  // Excitation relative signée du noyau : r = (λ_c - μ_c)/μ_c ∈ ℝ, compressée par un
  // log1p signé (croissance logarithmique dans les deux sens, continue en 0, pente 1).
  // L'ancienne forme log(max(1e-4, λ/μ)) écrasait toute intensité négative (possible
  // avec des couplages inhibiteurs signés) sur un plancher artificiel ≈ -9.21.
  const rawHawkes = new Float64Array(N + 1);
  for (let c = 1; c <= N; c++) {
    const mu = targetBaseline[c] > 0 ? targetBaseline[c] : p0;
    const excitationRatio = (hawkesRes.intensities[c] - mu) / mu;
    rawHawkes[c] = Math.sign(excitationRatio) * Math.log(1.0 + Math.abs(excitationRatio));
  }

  // Poids adaptatif continu du canal de Hawkes, dérivé de l'énergie ABSOLUE d'excitation.
  // La somme signée (totalEnergy) est typiquement négative (les pénalités de lissage des
  // cellules non observées dominent), ce qui saturait tanh() à ≈ -1 et INVERSAIT la
  // contribution du canal dans la fusion — l'excitation devenait une pénalité. Le poids
  // est une fiabilité de canal : il doit rester dans [0, 1), le signe vit dans rawHawkes.
  let absExcitationEnergy = 0;
  for (let c = 1; c <= N; c++) {
    absExcitationEnergy += Math.abs(hawkesRes.netExcitations[c]);
  }
  const hawkesWeight = Math.tanh(absExcitationEnergy / Math.max(1.0, Math.sqrt(sampleSize)));

  // Rétrécissement bayésien continu gamma basé sur l'échelle combinatoire de l'espace d'état
  const gamma = sampleSize / (sampleSize + sampleScale);

  // Inférence bayésienne pour chaque numéro candidat c in [1..90]
  const candidateMetrics: {
    num: number;
    probTrans: number;
    probRepeat: number;
    probHarmonic: number;
    probHawkes: number;
    probComposite: number;
    evidenceTrans: number;
    evidenceRepeat: number;
    evidenceHarmonic: number;
    flags: string[];
  }[] = [];

  for (let c = 1; c <= 90; c++) {
    // 1. Évidence de transition markovienne conjointe (symétrique, sans biais artificiel)
    let evidenceTrans = 0;
    const isDirectCandidate = activePredSet.has(c);

    for (const p of validPred) {
      if (isDirectCandidate && p === c) continue; // Pour un candidat direct, la transition vers soi-même est modélisée par le carry-over (evidenceRepeat)
      const count = transitionsCount[p][c];
      const denom = fromTotals[p] + laplaceAlpha;
      const condProb = denom > 0 ? (count + laplaceAlpha * p0) / denom : p0;
      const transLift = Math.max(1e-4, condProb / p0);
      evidenceTrans += Math.log(transLift);
    }

    const logitTrans = logitP0 + gamma * evidenceTrans;
    const probTrans = 1.0 / (1.0 + Math.exp(-logitTrans));

    // 2. Évidence de report direct (carry-over)
    // ZÉRO BIAIS ARTIFICIEL : multiplication stricte par le Lift empirique sans ajouter +1
    let evidenceRepeat = 0;
    let probRepeat = p0;

    if (isDirectCandidate) {
      const pDenom = (fromTotals[c] + laplaceAlpha) * p0;
      const empiricalLift = pDenom > 0 ? (repeatCounts[c] + laplaceAlpha * p0) / pDenom : 1.0;
      evidenceRepeat = Math.log(Math.max(1e-4, carryOverLift * empiricalLift));
      const logitRepeat = logitP0 + gamma * evidenceRepeat;
      probRepeat = 1.0 / (1.0 + Math.exp(-logitRepeat));
    }

    // 3. Évidence de résonance harmonique (Miroir & Complément 91)
    let evidenceHarmonic = 0;
    const flags: string[] = [];

    if (isDirectCandidate) {
      flags.push('REPORT_DIRECT');
    }

    for (const p of validPred) {
      const mir = getMirrorNumber(p);
      if (mir === c && mir !== p) {
        const occ = mirrorPairOccurrences[`${p}_${c}`] || 0;
        const pDenom = (fromTotals[p] + laplaceAlpha) * p0;
        const empiricalLift = pDenom > 0 ? (occ + laplaceAlpha * p0) / pDenom : 1.0;
        evidenceHarmonic += Math.log(Math.max(1e-4, mirrorLift * empiricalLift));
        if (!flags.includes('MIROIR_DECIMAL')) flags.push('MIROIR_DECIMAL');
      }

      const comp = getComplement90(p);
      if (comp === c && comp !== p) {
        const occ = compPairOccurrences[`${p}_${c}`] || 0;
        const pDenom = (fromTotals[p] + laplaceAlpha) * p0;
        const empiricalLift = pDenom > 0 ? (occ + laplaceAlpha * p0) / pDenom : 1.0;
        evidenceHarmonic += Math.log(Math.max(1e-4, complementLift * empiricalLift));
        if (!flags.includes('COMPLEMENT_90')) flags.push('COMPLEMENT_90');
      }
    }

    const logitHarmonic = logitP0 + gamma * evidenceHarmonic;
    const probHarmonic = 1.0 / (1.0 + Math.exp(-logitHarmonic));

    // 4. Évidence du Noyau de Hawkes Croisé Vectorisé
    const logitHawkes = logitP0 + gamma * rawHawkes[c];
    const probHawkes = 1.0 / (1.0 + Math.exp(-logitHawkes));

    // 5. Probabilité conjointe totale bayésienne (fusion différentiable continue du canal primaire)
    const logitTotal = logitP0 + gamma * (evidenceTrans + evidenceRepeat + evidenceHarmonic + hawkesWeight * rawHawkes[c]);
    const probComposite = 1.0 / (1.0 + Math.exp(-logitTotal));

    candidateMetrics.push({
      num: c,
      probTrans,
      probRepeat: isDirectCandidate ? probRepeat : 0,
      probHarmonic: evidenceHarmonic !== 0 ? probHarmonic : 0,
      probHawkes,
      probComposite,
      evidenceTrans,
      evidenceRepeat,
      evidenceHarmonic,
      flags
    });
  }

  // Standardisation z-score continue sur la distribution complète
  const compProbs = candidateMetrics.map(m => m.probComposite);
  const meanComp = compProbs.reduce((a, b) => a + b, 0) / compProbs.length;
  const varComp = compProbs.reduce((a, b) => a + Math.pow(b - meanComp, 2), 0) / compProbs.length;
  const stdComp = Math.max(Math.sqrt(varComp), 1e-6);

  const transProbs = candidateMetrics.map(m => m.probTrans);
  const meanTrans = transProbs.reduce((a, b) => a + b, 0) / transProbs.length;
  const varTrans = transProbs.reduce((a, b) => a + Math.pow(b - meanTrans, 2), 0) / transProbs.length;
  const stdTrans = Math.max(Math.sqrt(varTrans), 1e-6);

  const hawkesProbs = candidateMetrics.map(m => m.probHawkes);
  const meanHawkes = hawkesProbs.reduce((a, b) => a + b, 0) / hawkesProbs.length;
  const varHawkes = hawkesProbs.reduce((a, b) => a + Math.pow(b - meanHawkes, 2), 0) / hawkesProbs.length;
  const stdHawkes = Math.max(Math.sqrt(varHawkes), 1e-6);

  // Part d'énergie retardée (dt ≥ 2) attendue sous le modèle ajusté : le noyau pondère
  // le lag l par exp(-β·(l+1)), donc E[part queue] = r(1-r^(L-1))/(1-r^L) avec r = e^{-β}
  // — et non 1/L (uniforme), qui surestimait la barre. La part observée est mesurée sur
  // les énergies ABSOLUES par lag, robuste aux annulations de signe des couplages
  // inhibiteurs (une somme signée pouvait rendre la barre max(1e-6, totalEnergy) ≈ 0).
  const decayRatio = Math.exp(-betaDecay);
  const expectedLagTailShare = (decayRatio * (1.0 - Math.pow(decayRatio, lagCount - 1))) / (1.0 - Math.pow(decayRatio, lagCount));
  let absTotalLagEnergy = 0;
  let absTailLagEnergy = 0;
  for (let l = 0; l < hawkesRes.lagExcitations.length; l++) {
    const lagEnergy = Math.abs(hawkesRes.lagExcitations[l]);
    absTotalLagEnergy += lagEnergy;
    if (l >= 1) absTailLagEnergy += lagEnergy;
  }
  const observedLagTailShare = absTotalLagEnergy > 0 ? absTailLagEnergy / absTotalLagEnergy : 0;

  const seChannel = Math.sqrt((p0 * (1.0 - p0)) / Math.max(1, sampleSize));

  const scoredCandidates: InterDrawCandidateScore[] = candidateMetrics.map(item => {
    const zComp = (item.probComposite - meanComp) / stdComp;
    const compositeScore = Math.round(continuousSigmoid(zComp) * 10) / 10;

    const zTrans = (item.probTrans - meanTrans) / stdTrans;
    const transitionScore = Math.round(continuousSigmoid(zTrans) * 10) / 10;

    let repeatScore = 50.0;
    if (activePredSet.has(item.num)) {
      const zRepeat = (item.probRepeat - p0) / Math.max(1e-6, seChannel);
      repeatScore = Math.round(continuousSigmoid(zRepeat) * 10) / 10;
    }

    let harmonicScore = 50.0;
    if (item.evidenceHarmonic !== 0) {
      const zHarm = (item.probHarmonic - p0) / Math.max(1e-6, seChannel);
      harmonicScore = Math.round(continuousSigmoid(zHarm) * 10) / 10;
    }

    const zHawkes = (item.probHawkes - meanHawkes) / stdHawkes;
    const hawkesScore = Math.round(continuousSigmoid(zHawkes) * 10) / 10;

    // Confiance bayésienne continue : fonction de la certitude empirique (sampleSize) et de la séparation de signal
    const sampleConfidence = Math.sqrt(sampleSize / (sampleSize + sampleScale));
    const signalContrast = Math.tanh(Math.abs(zComp) / 2.0);
    const confidence = Math.round((sampleConfidence * 0.7 + signalContrast * 0.3) * 100) / 100;

    // Seuils statistiques dérivés des quantiles gaussiens (z90 = 1.28155, z75 = 0.67449)
    const z90 = 1.28155;
    const z75 = 0.67449;

    if (zTrans > z90 && !item.flags.includes('HAUTE_TRANSITION')) {
      item.flags.push('HAUTE_TRANSITION');
    }

    if (zHawkes > z90 && !item.flags.includes('HAWKES_EXCITATION')) {
      item.flags.push('HAWKES_EXCITATION');
    }

    // Rémanence = excès d'énergie retardée par rapport au modèle de décroissance ajusté
    if (lagCount > 1 && observedLagTailShare > expectedLagTailShare && zHawkes > z75 && !item.flags.includes('HAWKES_REMANENCE')) {
      item.flags.push('HAWKES_REMANENCE');
    }

    return {
      number: item.num,
      compositeScore,
      transitionScore,
      repeatScore,
      harmonicScore,
      hawkesScore,
      hawkesExcitation: Number(hawkesRes.netExcitations[item.num].toFixed(4)),
      confidence,
      flags: item.flags,
      rawTransitionProb: item.probTrans
    };
  });

  scoredCandidates.sort((a, b) => b.compositeScore - a.compositeScore || a.number - b.number);

  // Vecteur complet d'inférence 1..90 normalisé [0.01, 0.99]
  const fullCandidateScores = new Array(91).fill(THEORETICAL_SINGLE_PROB);
  for (const item of scoredCandidates) {
    fullCandidateScores[item.number] = Math.max(0.01, Math.min(0.99, item.compositeScore / 100));
  }

  return {
    sampleSize,
    laplaceAlpha,
    carryOverRate,
    carryOverExpected,
    carryOverLift,
    mirrorObservedRate,
    mirrorExpectedRate,
    mirrorLift,
    complementObservedRate,
    complementExpectedRate,
    complementLift,
    overallHarmonicAttractionRate,
    transitionsCount,
    fromTotals,
    targetMarginalCounts,
    repeatCounts,
    mirrorPairOccurrences,
    compPairOccurrences,
    scoredCandidates,
    fullCandidateScores,
    hawkesTotalEnergy: Number(hawkesRes.totalEnergy.toFixed(4)),
    hawkesBetaDecay: Number(betaDecay.toFixed(4)),
    hawkesLagExcitations: Array.from(hawkesRes.lagExcitations).map((e: number) => Number(e.toFixed(4)))
  };
};

/**
 * Calcule l'amortissement bayésien optimal (alpha_opt) en boucle fermée rétrospective
 * sur les tirages appariés passés.
 * 100% Déterministe, C^∞, zéro nombre magique.
 */
export const deriveRetrospectiveOptimalAlpha = (
  pairedPairs: { predWinners: number[]; targetWinners: number[] }[],
  predLaggedHistory?: number[][],
  targetDrawName?: string,
  predecessorName?: string
): number | undefined => {
  // Rétro-injection continue de l'Alpha post-mortem si archivé en cache (conforme AGENTS.md, zéro fuite)
  let cachedPostMortemAlpha: number | null = null;
  if (targetDrawName && predecessorName) {
    const family = getPrimaryInterDrawFamily(targetDrawName);
    if (family) {
      const predSlug = predecessorName.toLowerCase().trim().replace(/[\s-]+/g, '_');
      const cacheKey = globalCache.getInterDrawKey(
        family.id,
        targetDrawName,
        `optimal_laplace_${predSlug}`
      );
      cachedPostMortemAlpha = globalCache.getSync<number>(cacheKey, targetDrawName);
    }
  }

  if (pairedPairs.length < 6) {
    return cachedPostMortemAlpha ?? undefined;
  }

  const testPair = pairedPairs[0];
  const trainPairs = pairedPairs.slice(1);
  const testPredWinners = testPair.predWinners;
  const testActualWinnersSet = new Set(testPair.targetWinners.filter(n => n >= 1 && n <= 90));

  const retroEngine = runBayesianResonanceEngine(
    trainPairs,
    testPredWinners,
    predLaggedHistory?.slice(1)
  );

  let totalScore = 0;
  for (let n = 1; n <= 90; n++) {
    totalScore += retroEngine.fullCandidateScores[n] || (5.0 / 90.0);
  }

  const eps = 1e-6;
  let logLossSum = 0;
  let varP = 0;
  const meanP = 5.0 / 90.0;

  for (let n = 1; n <= 90; n++) {
    const rawP = ((retroEngine.fullCandidateScores[n] || meanP) / (totalScore || 1.0)) * 5.0;
    const p = Math.min(1.0, Math.max(1.0 / 90.0, rawP));
    const y = testActualWinnersSet.has(n) ? 1.0 : 0.0;
    logLossSum += -(y * Math.log(p + eps) + (1.0 - y) * Math.log(1.0 - p + eps));
    varP += Math.pow(p - meanP, 2);
  }

  const logLoss = logLossSum / 90.0;
  varP /= 90.0;

  const sampleDerivedAlpha = Math.max(
    1.0 / (1.0 + trainPairs.length),
    Math.min(1.5, (1.0 + Math.sqrt(varP)) / (1.0 + logLoss))
  );

  // Fusion bayésienne continue entre la calibration post-mortem antérieure et la mesure empirique immédiate
  if (typeof cachedPostMortemAlpha === 'number' && Number.isFinite(cachedPostMortemAlpha) && cachedPostMortemAlpha > 0) {
    const n = trainPairs.length;
    // Poids de shrinkage bayésien continu dérivé du volume d'échantillons n / (n + 10)
    const weightSample = n / (n + 10.0);
    return weightSample * sampleDerivedAlpha + (1.0 - weightSample) * cachedPostMortemAlpha;
  }

  return sampleDerivedAlpha;
};

/**
 * Calcule la corrélation de Pearson entre deux vecteurs de fréquences [1..90].
 * ZÉRO HASARD, 100% DÉTERMINISTE.
 */
export const computeFrequencyPearsonCorrelation = (
  freqA: number[] | Float64Array | Float32Array,
  freqB: number[] | Float64Array | Float32Array
): number => {
  let sumA = 0;
  let sumB = 0;
  for (let i = 1; i <= 90; i++) {
    sumA += freqA[i] || 0;
    sumB += freqB[i] || 0;
  }
  const meanA = sumA / 90;
  const meanB = sumB / 90;

  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 1; i <= 90; i++) {
    const da = (freqA[i] || 0) - meanA;
    const db = (freqB[i] || 0) - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  if (den <= 1e-12) return 0;
  return Math.max(-1.0, Math.min(1.0, num / den));
};

/**
 * Calcule l'intensité continue de couplage entre deux tirages d'un même réseau fermé.
 * ZÉRO NOMBRE MAGIQUE & ZÉRO SEUIL BINAIRE (AGENTS.md).
 * W(A, B) ∈ ]0, 1] calculé par sigmoïde logistique continue :
 * W(A, B) = 1 / (1 + exp(-(r + tanh(L - 1.0))))
 * où r est la corrélation de Pearson des fréquences et L est le lift empirique de report.
 */
export const computeContinuousInterDrawCoupling = (
  historySource: DrawResult[],
  historyTarget: DrawResult[],
  networkPairCount?: number
): {
  correlation: number;
  weight: number;
  carryOverRate: number;
  machineTransferRate: number;
  samplePairs: number;
  predictiveLogLossGain: number;
  lagHours: number;
  timeSlotRelation: 'CONSECUTIVE_SLOT' | 'SAME_SLOT' | 'CROSS_DAY';
} => {
  if (!historySource || historySource.length === 0 || !historyTarget || historyTarget.length === 0) {
    return {
      correlation: 0,
      weight: 0.0,
      carryOverRate: THEORETICAL_CARRYOVER_RATE_PERCENT,
      machineTransferRate: 0,
      samplePairs: 0,
      predictiveLogLossGain: 0,
      lagHours: 24.0,
      timeSlotRelation: 'CROSS_DAY'
    };
  }

  // 1. Alignement chronologique strict des tirages consécutifs source -> cible
  const paired = alignConsecutiveDrawHistories(historyTarget, historySource);
  const nPairs = paired.length;
  if (nPairs < 2) {
    return {
      correlation: 0,
      weight: 0.0,
      carryOverRate: THEORETICAL_CARRYOVER_RATE_PERCENT,
      machineTransferRate: 0,
      samplePairs: nPairs,
      predictiveLogLossGain: 0,
      lagHours: 24.0,
      timeSlotRelation: 'CROSS_DAY'
    };
  }

  // 2. Mesure empirique du report direct (carry-over), des résonances harmoniques et du canal machine
  let carryOverCount = 0;
  let harmonicCount = 0;
  let expectedHarmonicSum = 0;
  let varianceHarmonicSum = 0;
  let machineTransferCount = 0;
  let machinePairsCount = 0;
  let expectedMachineSum = 0;
  let varianceMachineSum = 0;

  for (const p of paired) {
    const pSet = new Set(p.predWinners);
    const hasShared = p.targetWinners.some(n => pSet.has(n));
    if (hasShared) carryOverCount++;

    const harmTargets = new Set<number>();
    for (const pw of p.predWinners) {
      const mir = getMirrorNumber(pw);
      const comp = getComplement90(pw);
      if (mir >= 1 && mir <= 90) harmTargets.add(mir);
      if (comp >= 1 && comp <= 90) harmTargets.add(comp);
    }
    const hasHarmonic = p.targetWinners.some(n => harmTargets.has(n));
    if (hasHarmonic) harmonicCount++;

    // Probabilité nulle exacte par paire sous H0 (hypergéométrique / combinatoire)
    // P(X >= 1) = 1 - C(90 - H, 5) / C(90, 5)
    const H = harmTargets.size;
    let probNoHarmHit = 1.0;
    for (let step = 0; step < 5; step++) {
      probNoHarmHit *= Math.max(0, (90 - H - step)) / (90 - step);
    }
    const pHarm0 = 1.0 - probNoHarmHit;
    expectedHarmonicSum += pHarm0;
    varianceHarmonicSum += pHarm0 * (1.0 - pHarm0);

    // Canal Machine : Transfert Machine(source) -> Gagnants(cible)
    // Exclut naturellement les tirages sans machine (ex. Fortune Thursday) où predMachine est vide
    if (Array.isArray(p.predMachine) && p.predMachine.length >= 1) {
      const pMachSet = new Set(p.predMachine.filter(n => typeof n === 'number' && n >= 1 && n <= 90));
      if (pMachSet.size > 0) {
        machinePairsCount++;
        const hasMachTransfer = p.targetWinners.some(n => pMachSet.has(n));
        if (hasMachTransfer) machineTransferCount++;

        const M_size = pMachSet.size;
        let probNoMachHit = 1.0;
        for (let step = 0; step < 5; step++) {
          probNoMachHit *= Math.max(0, (90 - M_size - step)) / (90 - step);
        }
        const pMach0 = 1.0 - probNoMachHit;
        expectedMachineSum += pMach0;
        varianceMachineSum += pMach0 * (1.0 - pMach0);
      }
    }
  }

  // Probabilité théorique nulle exacte pour carry-over 5/90 (P(X >= 1) = 25.3694%)
  const p0Carry = THEORETICAL_CARRYOVER_PROB; // ~0.253694
  const empiricalCarryRate = (carryOverCount / nPairs) * 100.0;
  const expectedCarry = nPairs * p0Carry;
  const varCarry = nPairs * p0Carry * (1.0 - p0Carry);

  // Z-scores continus exacts sous hypothèse nulle (AGENTS.md)
  const zCarry = (carryOverCount - expectedCarry) / Math.sqrt(Math.max(1e-9, varCarry));
  const zHarm = (harmonicCount - expectedHarmonicSum) / Math.sqrt(Math.max(1e-9, varianceHarmonicSum));

  let zMach = 0;
  let empiricalMachineRate = 0;
  if (machinePairsCount >= 2 && varianceMachineSum > 1e-9) {
    zMach = (machineTransferCount - expectedMachineSum) / Math.sqrt(varianceMachineSum);
    empiricalMachineRate = (machineTransferCount / machinePairsCount) * 100.0;
  }

  const zMax = Math.max(Math.abs(zCarry), Math.abs(zHarm), Math.abs(zMach));

  // Seuil universel dérivé du nombre de paires du réseau fermé choisi : M = |V|(|V| - 1)
  const M = Math.max(2, networkPairCount ?? 462);
  const zThresh = Math.sqrt(2.0 * Math.log(M));

  // Transition douce C^infinity : excès centré au-dessus du seuil critique (beta = 2.0)
  const beta = 2.0;
  const excessSignificance = (1.0 / beta) * Math.log(1.0 + Math.exp(Math.min(25.0, beta * (zMax - zThresh))));

  // 3. Mesure hors-échantillon par Walk-Forward (Log-Loss Reduction)
  // Évalue la capacité réelle de prédiction de la source vers la cible par rapport à la marginale 5/90
  let walkForwardLogLossGain = 0;
  if (nPairs >= 4) {
    const chronoPairs = [...paired].reverse(); // De l'ancien vers le récent
    let totalLogLossGain = 0;
    let evalSteps = 0;
    const maxSteps = Math.min(25, chronoPairs.length);

    for (let k = 3; k < maxSteps; k++) {
      const train = chronoPairs.slice(0, k);
      const test = chronoPairs[k];
      const testTargetSet = new Set(test.targetWinners);

      let trainCarryHits = 0;
      let trainHarmHits = 0;
      let trainHarmAtt = 0;
      let trainMachHits = 0;
      let trainMachPairs = 0;

      for (const tp of train) {
        const tpSet = new Set(tp.predWinners);
        if (tp.targetWinners.some(n => tpSet.has(n))) trainCarryHits++;
        for (const pw of tp.predWinners) {
          const mir = getMirrorNumber(pw);
          const comp = getComplement90(pw);
          if (mir >= 1 && mir <= 90) { trainHarmAtt++; if (tp.targetWinners.includes(mir)) trainHarmHits++; }
          if (comp >= 1 && comp <= 90) { trainHarmAtt++; if (tp.targetWinners.includes(comp)) trainHarmHits++; }
        }
        if (Array.isArray(tp.predMachine) && tp.predMachine.length > 0) {
          trainMachPairs++;
          const mSet = new Set(tp.predMachine);
          if (tp.targetWinners.some(n => mSet.has(n))) trainMachHits++;
        }
      }

      const trainCarryLift = (trainCarryHits / train.length) / THEORETICAL_CARRYOVER_PROB;
      const trainHarmLift = trainHarmAtt > 0 ? (trainHarmHits / trainHarmAtt) / (5.0 / 90.0) : 1.0;
      const trainMachLift = trainMachPairs > 0 ? (trainMachHits / trainMachPairs) / THEORETICAL_CARRYOVER_PROB : 1.0;

      const predSet = new Set(test.predWinners);
      const harmSet = new Set<number>();
      for (const pw of test.predWinners) {
        const mir = getMirrorNumber(pw);
        const comp = getComplement90(pw);
        if (mir >= 1 && mir <= 90) harmSet.add(mir);
        if (comp >= 1 && comp <= 90) harmSet.add(comp);
      }
      const machSet = new Set(Array.isArray(test.predMachine) ? test.predMachine : []);

      let sumMult = 0;
      const mults = new Float64Array(91);
      for (let n = 1; n <= 90; n++) {
        let m = 1.0;
        if (predSet.has(n)) m *= Math.max(0.2, Math.min(5.0, trainCarryLift));
        if (harmSet.has(n)) m *= Math.max(0.2, Math.min(5.0, trainHarmLift));
        if (machSet.has(n)) m *= Math.max(0.2, Math.min(5.0, trainMachLift));
        mults[n] = m;
        sumMult += m;
      }

      const eps = 1e-6;
      let lossMarginal = 0;
      let lossModel = 0;
      const p0 = 5.0 / 90.0;

      for (let n = 1; n <= 90; n++) {
        const y = testTargetSet.has(n) ? 1.0 : 0.0;
        const pModel = Math.max(0.001, Math.min(0.999, (mults[n] / (sumMult || 1.0)) * 5.0));
        lossMarginal += -(y * Math.log(p0 + eps) + (1.0 - y) * Math.log(1.0 - p0 + eps));
        lossModel += -(y * Math.log(pModel + eps) + (1.0 - y) * Math.log(1.0 - pModel + eps));
      }

      totalLogLossGain += (lossMarginal - lossModel) / 90.0;
      evalSteps++;
    }

    if (evalSteps > 0) {
      walkForwardLogLossGain = totalLogLossGain / evalSteps;
    }
  }

  // Shrinkage bayésien empirique continu gamma = n / (n + 18.0)
  const gammaShrink = nPairs / (nPairs + 18.0);
  const shrinkedGain = gammaShrink * walkForwardLogLossGain;

  // Modulation continue : fonction sigmoïde sur le gain hors-échantillon
  const gainModulation = 2.0 / (1.0 + Math.exp(-Math.min(20.0, Math.max(-20.0, 40.0 * shrinkedGain))));

  // 4. Analyse du lag temporel structurel et de la relation de créneau
  let sumLagHours = 0;
  let lagCount = 0;
  for (const p of paired) {
    if (p.targetDate && p.predDate) {
      const tTarget = new Date(p.targetDate).getTime();
      const tPred = new Date(p.predDate).getTime();
      if (!isNaN(tTarget) && !isNaN(tPred) && tTarget > tPred) {
        sumLagHours += (tTarget - tPred) / (3600 * 1000);
        lagCount++;
      }
    }
  }
  const avgLagHours = lagCount > 0 ? Math.round((sumLagHours / lagCount) * 10) / 10 : 24.0;
  let timeSlotRelation: 'CONSECUTIVE_SLOT' | 'SAME_SLOT' | 'CROSS_DAY' = 'CROSS_DAY';
  if (avgLagHours <= 6.5) {
    timeSlotRelation = 'CONSECUTIVE_SLOT';
  } else if (avgLagHours >= 20.0 && avgLagHours <= 28.0) {
    timeSlotRelation = 'SAME_SLOT';
  }

  // Poids de couplage continu discriminant W ∈ [0, 1[ modulé par la capacité prédictive hors-échantillon
  const weight = Math.tanh(excessSignificance * gainModulation);
  // Corrélation de transition normalisée dans [-1, 1]
  const correlation = Math.max(-1.0, Math.min(1.0, zCarry / Math.sqrt(nPairs)));

  return {
    correlation: Math.round(correlation * 1000) / 1000,
    weight: Math.round(weight * 1000) / 1000,
    carryOverRate: Math.round(empiricalCarryRate * 10) / 10,
    machineTransferRate: Math.round(empiricalMachineRate * 10) / 10,
    samplePairs: nPairs,
    predictiveLogLossGain: Math.round(walkForwardLogLossGain * 10000) / 10000,
    lagHours: avgLagHours,
    timeSlotRelation
  };
};

/**
 * Génère la matrice d'interconnexion continue (graphe complet) au sein d'un réseau fermé.
 * ZÉRO POLLUTION INTER-RÉSEAUX (AGENTS.md).
 */
export const generateNetworkInterconnectionMatrix = async (
  networkId: InterDrawNetworkId,
  cachedHistories?: Map<string, DrawResult[]>
): Promise<InterDrawNetworkMatrix> => {
  const net = INTER_DRAW_NETWORKS[networkId] || INTER_DRAW_FAMILIES[networkId];
  const drawNames = net?.drawNames || [];
  const networkPairCount = Math.max(2, drawNames.length * (drawNames.length - 1));

  const histories = new Map<string, DrawResult[]>();
  await Promise.all(
    drawNames.map(async (name) => {
      if (cachedHistories && cachedHistories.has(name)) {
        histories.set(name, cachedHistories.get(name)!);
      } else {
        const hist = await lotteryService.fetchHistory(name);
        histories.set(name, purifyHistoryForDraw(name, hist));
      }
    })
  );

  // Empreinte unique continue du réseau basée sur l'état le plus récent de chaque source (AGENTS.md)
  const networkFingerprint = `${networkId}_${drawNames.map(name => {
    const h = histories.get(name) || [];
    const top = h[0];
    return `${name}:${top?.id || top?.date || '0'}`;
  }).join('|')}`;

  const matrixCacheKey = globalCache.getInterDrawKey(networkId, 'network', 'matrix');
  const cached = globalCache.getSync<InterDrawNetworkMatrix>(matrixCacheKey);
  if (cached && cached.drawNames && cached.drawNames.length === drawNames.length && cached.networkFingerprint === networkFingerprint) {
    return cached;
  }

  const weights: Record<string, Record<string, number>> = {};
  const couplings: InterDrawNodeCoupling[] = [];
  let totalWeight = 0;
  let pairCount = 0;

  for (const target of drawNames) {
    weights[target] = {};
    const histTarget = histories.get(target) || [];

    for (const source of drawNames) {
      if (source === target) {
        weights[target][source] = 1.0;
        continue;
      }
      const histSource = histories.get(source) || [];
      const res = computeContinuousInterDrawCoupling(histSource, histTarget, networkPairCount);
      weights[target][source] = res.weight;
      couplings.push({
        sourceName: source,
        targetName: target,
        correlation: res.correlation,
        weight: res.weight,
        carryOverRate: res.carryOverRate,
        machineTransferRate: res.machineTransferRate,
        samplePairs: res.samplePairs,
        predictiveLogLossGain: res.predictiveLogLossGain,
        lagHours: res.lagHours,
        timeSlotRelation: res.timeSlotRelation
      });
      totalWeight += res.weight;
      pairCount++;
    }
  }

  // 1. Détection des communautés continues par créneau horaire
  const slotGroups: Record<string, { label: string; names: string[] }> = {
    '10:00': { label: 'Créneau 10:00 (Matinée)', names: [] },
    '13:00': { label: 'Créneau 13:00 (Midi)', names: [] },
    '16:00': { label: 'Créneau 16:00 (Après-Midi)', names: [] },
    '19:55': { label: 'Créneau 19:55 (Soirée)', names: [] }
  };

  for (const name of drawNames) {
    const seqItem = net?.sequence?.find(s => normalizeDrawName(s.name) === normalizeDrawName(name));
    const slot = seqItem?.time || '13:00';
    if (slotGroups[slot]) {
      slotGroups[slot].names.push(name);
    } else {
      slotGroups['13:00'].names.push(name);
    }
  }

  const communities: InterDrawCommunity[] = [];
  for (const [slot, group] of Object.entries(slotGroups)) {
    if (group.names.length === 0) continue;
    const intraPairs = couplings.filter(c => group.names.includes(c.sourceName) && group.names.includes(c.targetName));
    const meanInternal = intraPairs.length > 0
      ? Math.round((intraPairs.reduce((s, p) => s + p.weight, 0) / intraPairs.length) * 1000) / 1000
      : 0.0;
    communities.push({
      id: `comm_${slot.replace(':', 'h')}`,
      label: group.label,
      timeSlot: slot,
      drawNames: group.names,
      meanInternalCoupling: meanInternal
    });
  }

  // 2. Détection des chemins indirects de conduction A -> B -> C (amplification multi-chemins)
  const indirectPaths: InterDrawIndirectPath[] = [];
  for (const src of drawNames) {
    for (const tgt of drawNames) {
      if (src === tgt) continue;
      const directW = weights[tgt]?.[src] ?? 0.0;

      let bestBridge = '';
      let bestIndirectStrength = 0;

      for (const bridge of drawNames) {
        if (bridge === src || bridge === tgt) continue;
        const wAB = weights[bridge]?.[src] ?? 0.0;
        const wBC = weights[tgt]?.[bridge] ?? 0.0;
        const strength = wAB * wBC;
        if (strength > bestIndirectStrength) {
          bestIndirectStrength = strength;
          bestBridge = bridge;
        }
      }

      if (bestIndirectStrength > 0.01 && bestBridge) {
        indirectPaths.push({
          sourceName: src,
          bridgeName: bestBridge,
          targetName: tgt,
          directWeight: directW,
          indirectStrength: Math.round(bestIndirectStrength * 1000) / 1000,
          amplificationRatio: Math.round((bestIndirectStrength / Math.max(0.01, directW)) * 100) / 100
        });
      }
    }
  }
  indirectPaths.sort((a, b) => b.indirectStrength - a.indirectStrength);

  const matrix: InterDrawNetworkMatrix = {
    networkId,
    drawNames,
    weights,
    couplings,
    meanNetworkCoupling: pairCount > 0 ? Math.round((totalWeight / pairCount) * 1000) / 1000 : 0.5,
    communities,
    indirectPaths: indirectPaths.slice(0, 16),
    networkFingerprint
  };

  const adaptiveTtl = globalCache.getAdaptiveInterDrawTTL(50);
  await globalCache.set(matrixCacheKey, matrix, adaptiveTtl);

  return matrix;
};

/**
 * Calcule l'analyse complète des relations inter-tirages pour un tirage et une famille/réseau donnés.
 * Respecte rigoureusement le principe de ZÉRO POLLUTION INTER-RÉSEAUX (AGENTS.md).
 */
export const generateInterDrawReport = async (
  targetDrawName: string,
  forcedFamilyId?: InterDrawFamilyId,
  forceRefresh: boolean = false
): Promise<InterDrawReport | null> => {
  const networkId: InterDrawNetworkId =
    (forcedFamilyId === 'hebdomadaire' || forcedFamilyId === 'FAMILY_19H55')
      ? 'hebdomadaire'
      : (forcedFamilyId === 'quotidien' || forcedFamilyId === 'FAMILY_10H_16H_SUN19H55' || forcedFamilyId === 'FAMILY_13H')
      ? 'quotidien'
      : (getDrawNetworkId(targetDrawName) || 'quotidien');

  const activeFamily = INTER_DRAW_NETWORKS[networkId] || INTER_DRAW_FAMILIES[networkId];
  if (!activeFamily) {
    return null;
  }

  const relation = getFamilyPredecessorAndSuccessor(targetDrawName, activeFamily.id);
  if (!relation) {
    return null;
  }

  const cacheKey = globalCache.getInterDrawKey(
    networkId,
    normalizeDrawName(targetDrawName)
  );

  if (!forceRefresh) {
    // Accès ultra-rapide L1 synchrone (< 0.1 ms) pour éliminer la latence
    const fastSync = globalCache.getSync<InterDrawReport>(cacheKey, targetDrawName);
    if (fastSync && fastSync.predecessor?.name && fastSync.successor?.name && Array.isArray(fastSync.topCandidates) && fastSync.networkTransition) {
      return fastSync;
    }

    const cached = await globalCache.get<InterDrawReport>(cacheKey, targetDrawName);
    if (cached && cached.predecessor?.name && cached.successor?.name && Array.isArray(cached.topCandidates) && cached.networkTransition) {
      return cached;
    }
  }

  // 1. Récupération des historiques de l'ENSEMBLE du réseau choisi (AGENTS.md)
  const networkDrawNames = activeFamily.drawNames || [];
  const networkHistories = new Map<string, DrawResult[]>();

  // Récupérer en parallèle tous les tirages du réseau choisi
  await Promise.all(
    networkDrawNames.map(async (name) => {
      const h = await lotteryService.fetchHistory(name, forceRefresh);
      networkHistories.set(name, purifyHistoryForDraw(name, h));
    })
  );

  const targetHistory = networkHistories.get(targetDrawName) || await lotteryService.fetchHistory(targetDrawName, forceRefresh);
  const predHistory = networkHistories.get(relation.predecessor.name) || await lotteryService.fetchHistory(relation.predecessor.name, forceRefresh);
  const networkMatrix = await generateNetworkInterconnectionMatrix(networkId, networkHistories);

  const targetLatestResult = targetHistory.length > 0 ? targetHistory[0] : null;
  const predLatestResult = predHistory.length > 0 ? predHistory[0] : null;

  // 2. Alignement temporel des tirages consécutifs prédécesseur -> cible
  const pairedPairs = alignConsecutiveDrawHistories(targetHistory, predHistory);

  // Numéros actifs du prédécesseur qui polarisent le tirage cible
  const activePredNumbers = predLatestResult?.gagnants || [1, 2, 3, 4, 5];

  // Historique multi-lags du prédécesseur pour le noyau de Hawkes
  const predLaggedHistory = predHistory.slice(0, 5).map(d => d.gagnants);

  // 3. Exécution du moteur mathématique bayésien continu avec auto-calibration en boucle fermée
  const retroAlpha = deriveRetrospectiveOptimalAlpha(pairedPairs, predLaggedHistory, targetDrawName, relation.predecessor.name);
  const engine = runBayesianResonanceEngine(pairedPairs, activePredNumbers, predLaggedHistory, retroAlpha, undefined, targetDrawName, relation.predecessor.name);
  const {
    sampleSize,
    laplaceAlpha,
    carryOverRate,
    carryOverExpected,
    carryOverLift,
    mirrorObservedRate,
    mirrorExpectedRate,
    mirrorLift,
    complementObservedRate,
    complementExpectedRate,
    complementLift,
    overallHarmonicAttractionRate,
    transitionsCount,
    fromTotals,
    targetMarginalCounts,
    mirrorPairOccurrences,
    compPairOccurrences,
    scoredCandidates,
    fullCandidateScores
  } = engine;

  // 3b. Intégration continue de l'ENSEMBLE du réseau de tirage choisi (AGENTS.md)
  const networkContributions: InterDrawNetworkContribution[] = [];
  const rawCouplingWeights = new Map<string, number>();
  let totalNetworkWeight = 0;
  const networkPairCount = Math.max(2, networkDrawNames.length * (networkDrawNames.length - 1));

  for (const sourceName of networkDrawNames) {
    if (normalizeDrawName(sourceName) === normalizeDrawName(targetDrawName)) continue;

    const sHist = networkHistories.get(sourceName) || [];
    const isImmPred = normalizeDrawName(sourceName) === normalizeDrawName(relation.predecessor.name);
    // Récupération du couplage calculé par la matrice ou calcul à la volée avec le seuil réseau exact M
    const coupling = networkMatrix.couplings.find(
      c => normalizeDrawName(c.sourceName) === normalizeDrawName(sourceName) &&
           normalizeDrawName(c.targetName) === normalizeDrawName(targetDrawName)
    ) || computeContinuousInterDrawCoupling(sHist, targetHistory, networkPairCount);

    const weight = coupling.weight;
    rawCouplingWeights.set(sourceName, weight);
    const latestWinners = (sHist[0]?.gagnants || []).filter(n => n >= 1 && n <= 90);
    const latestMachine = (sHist[0]?.machine || []).filter(n => n >= 1 && n <= 90);

    totalNetworkWeight += weight;

    networkContributions.push({
      sourceName,
      weight: Math.round(weight * 1000) / 1000,
      normalizedWeight: 0,
      correlation: coupling.correlation,
      carryOverRate: coupling.carryOverRate,
      machineTransferRate: coupling.machineTransferRate,
      samplePairs: coupling.samplePairs,
      latestWinners,
      latestMachine,
      isImmediatePredecessor: isImmPred,
      influenceScore: Math.round(weight * (coupling.carryOverRate / THEORETICAL_CARRYOVER_RATE_PERCENT) * 100) / 100,
      topTransmittedNumbers: latestWinners.slice(0, 5)
    });
  }

  // Normalisation L1 continue des poids du réseau
  if (totalNetworkWeight > 0.001) {
    for (const contrib of networkContributions) {
      contrib.normalizedWeight = Math.round((contrib.weight / totalNetworkWeight) * 1000) / 1000;
    }
  } else {
    // Distribution uniforme a priori continue sur le simplexe (cold start sans données)
    const uniformWeight = 1.0 / Math.max(1, networkContributions.length);
    for (const contrib of networkContributions) {
      contrib.normalizedWeight = Math.round(uniformWeight * 1000) / 1000;
    }
  }
  networkContributions.sort((a, b) => b.weight - a.weight);

  // Fusion multi-sources continue sur l'ensemble du réseau (AGENTS.md)
  // Pooling log-linéaire : logit(p_combined) = logit(p_pred) + gamma * sum_s w_s * Delta_LLR(s, c)
  const gammaShrinkage = sampleSize / (sampleSize + 18.0); // Échelle combinatoire N/K = 18.0
  const networkCombinedScores = new Float64Array(91);
  const candidateSourceContribs: Record<number, { sourceName: string; weight: number; logLift: number }[]> = {};
  for (let c = 1; c <= 90; c++) {
    candidateSourceContribs[c] = [];
  }

  for (let c = 1; c <= 90; c++) {
    const predScore = fullCandidateScores[c] || 50.0;
    const predProb = Math.max(0.001, Math.min(0.999, predScore / 100.0));
    const logitPred = Math.log(predProb / (1.0 - predProb));

    let networkLLR = 0;

    for (const contrib of networkContributions) {
      if (contrib.isImmediatePredecessor) continue; // Déjà intégré dans le modèle du prédécesseur direct
      if (contrib.normalizedWeight <= 0.0001) continue;

      const sWinners = contrib.latestWinners;
      const sSet = new Set(sWinners);
      let contribLLR = 0;

      // Report direct depuis ce nœud : LLR signé ln(Lift_carry)
      if (sSet.has(c)) {
        const carryLift = (contrib.carryOverRate / 100.0) / THEORETICAL_CARRYOVER_PROB;
        // Si carryLift < 1, ln(carryLift) est négatif (effet de déficit/répulsion)
        const logCarryLift = Math.log(Math.max(1e-4, carryLift));
        networkLLR += contrib.normalizedWeight * logCarryLift;
        contribLLR += logCarryLift;
      }

      // Harmoniques miroirs / compléments depuis ce nœud : LLR signé ln(Lift_harm)
      const mirC = getMirrorNumber(c);
      const compC = getComplement90(c);
      if (sSet.has(mirC) || sSet.has(compC)) {
        const harmLift = (contrib.carryOverRate > 0)
          ? Math.max(0.1, (contrib.carryOverRate / 100.0) / THEORETICAL_CARRYOVER_PROB)
          : 1.0;
        const logHarmLift = Math.log(Math.max(1e-4, harmLift));
        networkLLR += contrib.normalizedWeight * 0.5 * logHarmLift;
        contribLLR += 0.5 * logHarmLift;
      }

      // Canal Machine : Transfert Machine(source) -> Gagnants(cible)
      if (contrib.latestMachine && contrib.latestMachine.length > 0 && (contrib.machineTransferRate || 0) > 0) {
        const sMachineSet = new Set(contrib.latestMachine);
        if (sMachineSet.has(c)) {
          const machLift = (contrib.machineTransferRate! / 100.0) / THEORETICAL_CARRYOVER_PROB;
          const logMachLift = Math.log(Math.max(1e-4, machLift));
          networkLLR += contrib.normalizedWeight * 0.5 * logMachLift;
          contribLLR += 0.5 * logMachLift;
        }
      }

      if (Math.abs(contribLLR) > 1e-4) {
        candidateSourceContribs[c].push({
          sourceName: contrib.sourceName,
          weight: contrib.normalizedWeight,
          logLift: Math.round(contribLLR * 1000) / 1000
        });
      }
    }

    // Combinaison continue avec rétrécissement bayésien gamma (zéro magic number, zéro seuil binaire)
    const logitCombined = logitPred + gammaShrinkage * networkLLR;
    const probCombined = 1.0 / (1.0 + Math.exp(-logitCombined));
    networkCombinedScores[c] = Math.round(probCombined * 1000) / 10.0;
  }

  const fullAggregatedCandidateScores: number[] = [0];
  for (let c = 1; c <= 90; c++) {
    fullAggregatedCandidateScores.push(Math.round(networkCombinedScores[c] * 10) / 10);
  }

  // Candidats enrichis par la convergence de l'ensemble du réseau
  const networkEnhancedCandidates: InterDrawCandidateScore[] = scoredCandidates.map(c => {
    const fusedScore = networkCombinedScores[c.number] ?? c.compositeScore;
    const flags = [...c.flags];
    const supportingNodes = networkContributions.filter(
      node => !node.isImmediatePredecessor && node.latestWinners.includes(c.number)
    );
    if (supportingNodes.length > 0 && !flags.includes('RESEAU_CONVERGENCE')) {
      flags.push('RESEAU_CONVERGENCE');
    }

    const machineNodes = networkContributions.filter(
      node => node.latestMachine && node.latestMachine.includes(c.number) && (node.machineTransferRate || 0) > 0
    );
    if (machineNodes.length > 0 && !flags.includes('TRANSFERT_MACHINE')) {
      flags.push('TRANSFERT_MACHINE');
    }

    // Intervalle de confiance 95% continu dérivé de l'écart type d'échantillonnage
    const p = Math.max(0.001, Math.min(0.999, fusedScore / 100.0));
    const effectiveN = Math.max(2, sampleSize);
    const se = Math.sqrt((p * (1.0 - p)) / effectiveN);
    const ciLow = Math.round(Math.max(0.001, p - 1.96 * se) * 1000) / 10;
    const ciHigh = Math.round(Math.min(0.999, p + 1.96 * se) * 1000) / 10;

    // Statut signal statistique vs bruit i.i.d.
    const hasSignificantCoupling = (c.flags.length > 0 && c.confidence > 0.55) || supportingNodes.some(n => n.weight > 0.05);
    const isDepartingFromNull = ciLow > 50.0 || (ciHigh < 50.0 && fusedScore < 40.0);
    const signalStatus: 'SIGNAL_DETECTE' | 'INDISCERNABLE_BRUIT' =
      (hasSignificantCoupling || isDepartingFromNull) ? 'SIGNAL_DETECTE' : 'INDISCERNABLE_BRUIT';

    return {
      ...c,
      compositeScore: Math.round(fusedScore * 10) / 10,
      flags,
      signalStatus,
      confidenceInterval: [ciLow, ciHigh] as [number, number],
      sourceContributions: candidateSourceContribs[c.number] || []
    };
  }).sort((a, b) => b.compositeScore - a.compositeScore);

  // 4. Cartographie des paires harmoniques actives pour le tirage courant
  const harmonicPairs: HarmonicPairDetail[] = [];
  for (const pw of activePredNumbers) {
    const mir = getMirrorNumber(pw);
    if (mir !== pw) {
      const occ = mirrorPairOccurrences[`${pw}_${mir}`] || 0;
      const rate = (occ + laplaceAlpha) / (fromTotals[pw] + 2 * laplaceAlpha) * 100;
      const pLift = rate / mirrorExpectedRate;
      harmonicPairs.push({
        from: pw,
        to: mir,
        type: 'MIROIR',
        occurrences: occ,
        empiricalRate: Math.round(rate * 10) / 10,
        lift: Math.round(pLift * 100) / 100,
        isActiveInCurrentDraw: true,
        score: Math.round(continuousSigmoid((pLift - 1.0) * 2.0) * 10) / 10
      });
    }
    const comp = getComplement90(pw);
    if (comp !== pw) {
      const occ = compPairOccurrences[`${pw}_${comp}`] || 0;
      const rate = (occ + laplaceAlpha) / (fromTotals[pw] + 2 * laplaceAlpha) * 100;
      const pLift = rate / complementExpectedRate;
      harmonicPairs.push({
        from: pw,
        to: comp,
        type: 'COMPLEMENT',
        occurrences: occ,
        empiricalRate: Math.round(rate * 10) / 10,
        lift: Math.round(pLift * 100) / 100,
        isActiveInCurrentDraw: true,
        score: Math.round(continuousSigmoid((pLift - 1.0) * 2.0) * 10) / 10
      });
    }
  }

  // 5. Construction des flux markoviens individuels par numéro source
  const sourceTransitions: SourceTransitions[] = activePredNumbers.map(pw => {
    const denom = fromTotals[pw] + 90 * laplaceAlpha;
    const items: SourceTransitionItem[] = [];
    for (let c = 1; c <= 90; c++) {
      const occ = transitionsCount[pw][c];
      const prob = denom > 0 ? (occ + laplaceAlpha) / denom : 1 / 90;
      const targetMarginalProb = Math.max(1e-5, (targetMarginalCounts[c] + laplaceAlpha) / (sampleSize * LOTTERY_CONSTANTS.NUMBERS_PER_DRAW + 90 * laplaceAlpha));
      const lift = prob / targetMarginalProb;
      items.push({
        targetNumber: c,
        probability: Math.round(prob * 1000) / 10,
        lift: Math.round(lift * 100) / 100,
        occurrences: occ
      });
    }
    items.sort((a, b) => b.lift - a.lift || b.probability - a.probability);
    return {
      sourceNumber: pw,
      transitions: items.slice(0, 10)
    };
  });

  // Recommandations enrichies par la convergence de l'ensemble du réseau
  const topCandidates = networkEnhancedCandidates.slice(0, 10);
  const recommendedRepeats = networkEnhancedCandidates
    .filter(c => c.flags.includes('REPORT_DIRECT') || c.flags.includes('RESEAU_CONVERGENCE'))
    .slice(0, 5);
  const recommendedHarmonics = networkEnhancedCandidates
    .filter(c => c.flags.includes('MIROIR_DECIMAL') || c.flags.includes('COMPLEMENT_90'))
    .slice(0, 5);

  // 6. Top Couplages 2-sur-2 (paires)
  const topNumbersPool = topCandidates.slice(0, 6).map(c => c.number);
  const pairCandidates: InterDrawPairCombination[] = [];

  for (let i = 0; i < topNumbersPool.length; i++) {
    for (let j = i + 1; j < topNumbersPool.length; j++) {
      const n1 = topNumbersPool[i];
      const n2 = topNumbersPool[j];
      const s1 = networkEnhancedCandidates.find(c => c.number === n1)?.compositeScore || 50;
      const s2 = networkEnhancedCandidates.find(c => c.number === n2)?.compositeScore || 50;
      const geomAffinity = Math.sqrt(s1 * s2);
      const conf = ((networkEnhancedCandidates.find(c => c.number === n1)?.confidence || 0.5) +
                    (networkEnhancedCandidates.find(c => c.number === n2)?.confidence || 0.5)) / 2;

      pairCandidates.push({
        numbers: [n1, n2],
        affinity: Math.round(geomAffinity * 10) / 10,
        confidence: Math.round(conf * 100) / 100,
        label: `${n1 < 10 ? '0' + n1 : n1} - ${n2 < 10 ? '0' + n2 : n2}`
      });
    }
  }
  pairCandidates.sort((a, b) => b.affinity - a.affinity);
  const recommendedPairs = pairCandidates.slice(0, 5);

  // 7. Top transitions unitaires observées
  const transitionCells: InterDrawTransitionCell[] = [];
  for (const p of activePredNumbers) {
    for (let c = 1; c <= 90; c++) {
      const occ = transitionsCount[p][c];
      if (occ > 0) {
        const denom = fromTotals[p] + 90 * laplaceAlpha;
        const prob = denom > 0 ? (occ + laplaceAlpha) / denom : 0;
        transitionCells.push({
          from: p,
          to: c,
          probability: prob,
          occurrences: occ
        });
      }
    }
  }
  transitionCells.sort((a, b) => b.occurrences - a.occurrences || b.probability - a.probability);
  const topTransitions = transitionCells.slice(0, 10);

  // 8. Calcul approfondi des Cooccurrences et Patterns Structurels Inter-Tirages
  const cooccurrenceMetrics = analyzeInterDrawCooccurrences(
    pairedPairs,
    activePredNumbers,
    sampleSize,
    laplaceAlpha
  );

  const patternMetrics = analyzeInterDrawPatterns(
    pairedPairs,
    activePredNumbers,
    sampleSize,
    laplaceAlpha
  );

  let complexDynamics: InterDrawComplexDynamicsReport | undefined = undefined;
  try {
    complexDynamics = await computeInterDrawComplexDynamics(
      targetDrawName,
      networkId,
      targetHistory,
      predHistory,
      networkMatrix
    );
  } catch (e) {
    console.error('[INTER-DRAW] Erreur calcul complexDynamics :', e);
  }

  // 9. Dyades Croisées & Matrice de Transition Bivariée 90x90 (Moteur Rust WASM HPC)
  let bivariateHpcReport: BivariateDyadsReportHpc | undefined = undefined;
  try {
    const predName = relation.predecessor?.name || '';
    if (predName) {
      bivariateHpcReport = computeBivariateCrossDyadsHpc(predName, targetDrawName, 0.0);
    }
  } catch (e) {
    console.warn('[INTER-DRAW] Erreur calcul bivariateHpcReport :', e);
  }

  // 10. Matrice de transition 90x90 : prédécesseur immédiat ET réseau complet pondéré (AGENTS.md).
  // Les paires sont alignées chronologiquement (source strictement avant cible) pour chaque tirage du réseau.
  let networkTransition: InterDrawNetworkTransitionReport | undefined = undefined;
  try {
    const predName = relation.predecessor?.name || 'Prédécesseur';
    const immediateSource: TransitionPairSource = {
      name: predName,
      weight: 1,
      pairs: pairedPairs
    };
    const networkSources: TransitionPairSource[] = [];
    for (const sourceName of networkDrawNames) {
      if (normalizeDrawName(sourceName) === normalizeDrawName(targetDrawName)) continue;
      const sHist = networkHistories.get(sourceName) || [];
      const pairs = alignConsecutiveDrawHistories(targetHistory, sHist, targetDrawName, sourceName);
      if (pairs.length === 0) continue;
      networkSources.push({
        name: sourceName,
        weight: rawCouplingWeights.get(sourceName) ?? 0,
        pairs
      });
    }
    networkTransition = {
      immediate: buildWeightedTransitionMatrix([immediateSource], 'IMMEDIATE'),
      network: buildWeightedTransitionMatrix(networkSources, 'NETWORK')
    };
  } catch (e) {
    console.warn('[INTER-DRAW] Erreur calcul networkTransition :', e);
  }

  const report: InterDrawReport = {
    targetDraw: targetDrawName,
    family: activeFamily,
    networkId,
    networkMatrix,
    networkCouplings: networkMatrix?.couplings,
    networkContributions,
    isNetworkWideAggregated: true,
    networkInfluenceWeight: Math.round(totalNetworkWeight * 100) / 100,
    predecessor: relation.predecessor,
    successor: relation.successor,
    currentIndex: relation.currentIndex,
    totalInFamily: activeFamily.sequence.length,
    predecessorResult: predLatestResult,
    targetLatestResult,
    carryOverRate: Math.round(carryOverRate * 10) / 10,
    carryOverExpected: Math.round(carryOverExpected * 10) / 10,
    carryOverLift: Math.round(carryOverLift * 100) / 100,
    harmonicMetrics: {
      mirrorObservedRate: Math.round(mirrorObservedRate * 10) / 10,
      mirrorExpectedRate: Math.round(mirrorExpectedRate * 10) / 10,
      mirrorLift: Math.round(mirrorLift * 100) / 100,
      complementObservedRate: Math.round(complementObservedRate * 10) / 10,
      complementExpectedRate: Math.round(complementExpectedRate * 10) / 10,
      complementLift: Math.round(complementLift * 100) / 100,
      overallHarmonicAttractionRate: Math.round(overallHarmonicAttractionRate * 10) / 10,
      harmonicPairs
    },
    totalDrawsAnalyzed: sampleSize,
    topCandidates,
    recommendedRepeats,
    recommendedHarmonics,
    recommendedPairs,
    topTransitions,
    sourceTransitions,
    fullCandidateScores: fullAggregatedCandidateScores,
    hawkesMetrics: engine.hawkesTotalEnergy !== undefined ? {
      totalEnergy: engine.hawkesTotalEnergy,
      betaDecay: engine.hawkesBetaDecay || HAWKES_NEUTRAL_BETA_DECAY,
      lagExcitations: engine.hawkesLagExcitations || []
    } : undefined,
    cooccurrenceMetrics,
    patternMetrics,
    complexDynamics,
    bivariateHpcReport,
    networkTransition,
    indirectPaths: networkMatrix?.indirectPaths,
    communities: networkMatrix?.communities,
    networkFingerprint: networkMatrix?.networkFingerprint,
    generationTimestamp: Date.now()
  };

  const adaptiveTtl = globalCache.getAdaptiveInterDrawTTL(sampleSize);
  await globalCache.set(cacheKey, report, adaptiveTtl, targetDrawName);
  return report;
};

/**
 * Simulateur interactif : calcule instantanément la résonance inter-tirages
 * pour un tirage cible à partir de n'importe quel ensemble de 5 numéros au tirage précédent.
 */
export const simulateInterDrawTransmission = async (
  targetDrawName: string,
  predecessorNumbers: number[],
  forcedFamilyId?: InterDrawFamilyId,
  forceRefresh: boolean = false
): Promise<{
  candidates: InterDrawCandidateScore[];
  recommendedPairs: InterDrawPairCombination[];
  harmonicResonances: { from: number; to: number; type: 'MIROIR' | 'COMPLEMENT' }[];
  cooccurrenceMetrics?: InterDrawCooccurrenceReport;
  patternMetrics?: InterDrawPatternReport;
} | null> => {
  if (!predecessorNumbers || predecessorNumbers.length === 0) return null;

  const validNumbers = Array.from(
    new Set(predecessorNumbers.filter(n => n >= 1 && n <= 90))
  ).slice(0, 5);

  const families = getInterDrawFamiliesForDraw(targetDrawName);
  const activeFamily = forcedFamilyId
    ? INTER_DRAW_FAMILIES[forcedFamilyId]
    : (families.length > 0 ? families[0] : getPrimaryInterDrawFamily(targetDrawName));

  if (!activeFamily) return null;

  const relation = getFamilyPredecessorAndSuccessor(targetDrawName, activeFamily.id);
  if (!relation) return null;

  const [targetHistory, predHistory] = await Promise.all([
    lotteryService.fetchHistory(targetDrawName, forceRefresh),
    lotteryService.fetchHistory(relation.predecessor.name, forceRefresh)
  ]);

  const pairedPairs = alignConsecutiveDrawHistories(targetHistory, predHistory);
  const predLaggedHistory = predHistory.slice(0, 5).map(d => d.gagnants);
  const retroAlpha = deriveRetrospectiveOptimalAlpha(pairedPairs, predLaggedHistory, targetDrawName, relation.predecessor.name);
  const engine = runBayesianResonanceEngine(pairedPairs, validNumbers, predLaggedHistory, retroAlpha, undefined, targetDrawName, relation.predecessor.name);
  const candidates = engine.scoredCandidates;

  const topNums = candidates.slice(0, 5).map(c => c.number);
  const recommendedPairs: InterDrawPairCombination[] = [];
  for (let i = 0; i < topNums.length; i++) {
    for (let j = i + 1; j < topNums.length; j++) {
      const s1 = candidates.find(c => c.number === topNums[i])?.compositeScore || 50;
      const s2 = candidates.find(c => c.number === topNums[j])?.compositeScore || 50;
      const conf1 = candidates.find(c => c.number === topNums[i])?.confidence || 0.5;
      const conf2 = candidates.find(c => c.number === topNums[j])?.confidence || 0.5;
      recommendedPairs.push({
        numbers: [topNums[i], topNums[j]],
        affinity: Math.round(Math.sqrt(s1 * s2) * 10) / 10,
        confidence: Math.round(((conf1 + conf2) / 2) * 100) / 100,
        label: `${topNums[i] < 10 ? '0' + topNums[i] : topNums[i]} - ${topNums[j] < 10 ? '0' + topNums[j] : topNums[j]}`
      });
    }
  }

  const harmonicResonances: { from: number; to: number; type: 'MIROIR' | 'COMPLEMENT' }[] = [];
  for (const n of validNumbers) {
    const mir = getMirrorNumber(n);
    if (mir !== n) {
      harmonicResonances.push({ from: n, to: mir, type: 'MIROIR' });
    }
    const comp = getComplement90(n);
    if (comp !== n) {
      harmonicResonances.push({ from: n, to: comp, type: 'COMPLEMENT' });
    }
  }

  const laplaceAlpha = 1.0 / (1.0 + Math.log(1.0 + pairedPairs.length));
  const cooccurrenceMetrics = analyzeInterDrawCooccurrences(
    pairedPairs,
    validNumbers,
    pairedPairs.length,
    laplaceAlpha
  );
  const patternMetrics = analyzeInterDrawPatterns(
    pairedPairs,
    validNumbers,
    pairedPairs.length,
    laplaceAlpha
  );

  return {
    candidates: candidates.slice(0, 10),
    recommendedPairs,
    harmonicResonances,
    cooccurrenceMetrics,
    patternMetrics
  };
};

/**
 * Calcule de façon synchrone et 100% déterministe le vecteur continu d'affinité inter-tirages (1 à 90)
 * pour l'intégration directe dans le Tamis ADN et les arbres de décision.
 * ZÉRO NOMBRE MAGIQUE, FONCTIONS DIFFÉRENTIABLES CONTINUES.
 */
export const calculateInterDrawVector = (
  history: DrawResult[],
  drawName?: string,
  predecessorHistory?: DrawResult[],
  forcedFamilyId?: InterDrawFamilyId
): Float32Array => {
  const vec = new Float32Array(91);
  if (!history || history.length === 0 || !drawName) {
    vec.fill(THEORETICAL_SINGLE_PROB); // 5/90 uniforme
    return vec;
  }

  // ISOLATION PAR TIRAGE (AGENTS.md) : l'historique aligné sur le prédécesseur doit être
  // l'historique PROPRE du tirage cible. On purifie pour neutraliser tout appelant qui
  // passerait un historique mixte/actif (ex. fusionService), source de pollution inter-familles.
  history = purifyHistoryForDraw(drawName, history);
  if (history.length === 0) {
    vec.fill(THEORETICAL_SINGLE_PROB);
    return vec;
  }

  const families = getInterDrawFamiliesForDraw(drawName);
  const activeFamily = forcedFamilyId
    ? INTER_DRAW_FAMILIES[forcedFamilyId]
    : (families.length > 0 ? families[0] : getPrimaryInterDrawFamily(drawName));

  if (!activeFamily) {
    vec.fill(THEORETICAL_SINGLE_PROB);
    return vec;
  }

  const relation = getFamilyPredecessorAndSuccessor(drawName, activeFamily.id);
  if (!relation) {
    vec.fill(THEORETICAL_SINGLE_PROB);
    return vec;
  }

  // 1. Vérification du cache L1 synchrone : s'il existe déjà un rapport complet
  if (!predecessorHistory) {
    const cacheKey = globalCache.getInterDrawKey(activeFamily.id, normalizeDrawName(drawName));
    const cachedReport = globalCache.getSync<InterDrawReport>(cacheKey, drawName);
    if (cachedReport?.fullCandidateScores && cachedReport.fullCandidateScores.length >= 91) {
      for (let n = 1; n <= 90; n++) {
        vec[n] = cachedReport.fullCandidateScores[n];
      }
      return vec;
    }
  }

  // 2. Récupération de l'historique du prédécesseur (Zéro autocorrélation avec soi-même)
  let predHistory: DrawResult[] = [];
  if (predecessorHistory && predecessorHistory.length > 0) {
    predHistory = predecessorHistory;
  } else {
    const predHistoryKey = globalCache.generateKey('history', relation.predecessor.name);
    const cachedPredHistory = (globalCache.getSync<DrawResult[]>(predHistoryKey, relation.predecessor.name) || [])
      .filter(d => !d.id?.startsWith('deterministic-'));
    if (cachedPredHistory.length > 0) {
      predHistory = cachedPredHistory;
    } else {
      // ZÉRO FAUSSE DONNÉE : sans historique réel du prédécesseur, le vecteur de report
      // reste neutre et inopérant plutôt que d'inférer sur une base fictive.
      console.warn(`[InterDrawService] Données prédécesseur non synchronisées pour '${relation.predecessor.name}' : vecteur inter-tirages neutre (aucune donnée simulée).`);
      vec.fill(THEORETICAL_SINGLE_PROB);
      return vec;
    }
  }

  // Les numéros actifs qui polarisent le tirage cible sont les gagnants du dernier tirage du prédécesseur
  const predLatest = predHistory[0];
  const lastWinners = predLatest?.gagnants || [];
  if (lastWinners.length === 0) {
    vec.fill(THEORETICAL_SINGLE_PROB);
    return vec;
  }

  // Alignement temporel des couples consécutifs
  const pairedPairs = alignConsecutiveDrawHistories(history, predHistory);
  if (pairedPairs.length === 0) {
    vec.fill(THEORETICAL_SINGLE_PROB);
    return vec;
  }

  // 1. Exécution du modèle bayésien continu initial avec auto-calibration
  const predLaggedHistory = predHistory.slice(0, 5).map(d => d.gagnants);
  const retroAlpha = deriveRetrospectiveOptimalAlpha(pairedPairs, predLaggedHistory, drawName, relation.predecessor.name);
  const engine = runBayesianResonanceEngine(pairedPairs, lastWinners, predLaggedHistory, retroAlpha, undefined, drawName, relation.predecessor.name);
  for (let n = 1; n <= 90; n++) {
    vec[n] = engine.fullCandidateScores[n] || THEORETICAL_SINGLE_PROB;
  }

  // 1.5. Intégration continue multi-sources de l'ensemble du réseau (AGENTS.md)
  // Permet au featureExtractor et fusionService de bénéficier de toute la topologie réseau même hors cache complet
  const networkDrawNames = activeFamily.sequence?.map(s => s.name) || activeFamily.drawNames || [];
  const networkPairCount = Math.max(2, networkDrawNames.length * (networkDrawNames.length - 1));
  const gammaShrinkage = Math.max(0.1, pairedPairs.length / (pairedPairs.length + 18.0));

  for (const otherName of networkDrawNames) {
    if (normalizeDrawName(otherName) === normalizeDrawName(drawName) ||
        normalizeDrawName(otherName) === normalizeDrawName(relation.predecessor.name)) {
      continue;
    }

    const otherHistKey = globalCache.generateKey('history', otherName);
    const cachedOther = (globalCache.getSync<DrawResult[]>(otherHistKey, otherName) || [])
      .filter(d => !d.id?.startsWith('deterministic-'));
    if (cachedOther.length < 2) continue;

    const coupling = computeContinuousInterDrawCoupling(cachedOther, history, networkPairCount);
    if (coupling.weight <= 0.001) continue;

    const otherWinners = (cachedOther[0]?.gagnants || []).filter(n => n >= 1 && n <= 90);
    const otherMachine = (cachedOther[0]?.machine || []).filter(n => n >= 1 && n <= 90);
    if (otherWinners.length === 0 && otherMachine.length === 0) continue;

    const otherWinnersSet = new Set(otherWinners);
    const otherMachineSet = new Set(otherMachine);
    const carryLift = (coupling.carryOverRate / 100.0) / THEORETICAL_CARRYOVER_PROB;
    const logCarry = Math.log(Math.max(1e-4, carryLift));
    const machLift = ((coupling.machineTransferRate || 0) / 100.0) / THEORETICAL_CARRYOVER_PROB;
    const logMach = Math.log(Math.max(1e-4, machLift));

    for (let c = 1; c <= 90; c++) {
      let deltaLLR = 0;
      if (otherWinnersSet.has(c)) {
        deltaLLR += logCarry;
      }
      const mirC = getMirrorNumber(c);
      const compC = getComplement90(c);
      if (otherWinnersSet.has(mirC) || otherWinnersSet.has(compC)) {
        deltaLLR += 0.5 * logCarry;
      }
      if (otherMachineSet.has(c) && (coupling.machineTransferRate || 0) > 0) {
        deltaLLR += 0.5 * logMach;
      }

      if (Math.abs(deltaLLR) > 1e-4) {
        const curP = Math.max(0.001, Math.min(0.999, vec[c]));
        const logit = Math.log(curP / (1.0 - curP)) + gammaShrinkage * coupling.weight * deltaLLR;
        vec[c] = 1.0 / (1.0 + Math.exp(-logit));
      }
    }
  }

  // 2. Injection continue des métriques de Lift conditionnel des paires et de résonance de cascade (+-1, +-2)
  // ZÉRO NOMBRE MAGIQUE : fonctions différentiables calculées avec l'Alpha de Laplace optimal calibré
  const cooccReport = analyzeInterDrawCooccurrences(pairedPairs, lastWinners, engine.laplaceAlpha);
  const patternReport = analyzeInterDrawPatterns(pairedPairs, lastWinners, engine.laplaceAlpha);

  const cooccBoost = new Float32Array(91);
  if (cooccReport && cooccReport.topConditionedPairs) {
    for (const cp of cooccReport.topConditionedPairs) {
      if (cp.triggerSources.length > 0 && cp.lift > 1.0) {
        // Activation sigmoïdale continue dérivée du PMI borné
        const pmiSigmoid = 1.0 / (1.0 + Math.exp(-Math.max(-4, Math.min(4, cp.pmi))));
        const pairEnergy = (cp.lift - 1.0) * pmiSigmoid * cp.confidence;
        cooccBoost[cp.pair[0]] += pairEnergy;
        cooccBoost[cp.pair[1]] += pairEnergy;
      }
    }
  }

  const cascadeBoost = new Float32Array(91);
  if (patternReport && patternReport.cascade && patternReport.cascade.activeResonances) {
    for (const r of patternReport.cascade.activeResonances) {
      if (r.lift > 1.0) {
        const cascadeEnergy = (r.lift - 1.0) * (r.empiricalRate / 100.0);
        cascadeBoost[r.targetNeighbour] += cascadeEnergy;
      }
    }
  }

  // Normalisation continue via tangente hyperbolique bornée
  const maxSignal = Math.max(
    1e-6,
    ...Array.from({ length: 90 }, (_, i) => cooccBoost[i + 1] + cascadeBoost[i + 1])
  );

  // Amplitude de modulation dérivée de l'incertitude d'échantillonnage (1/√n, erreur
  // standard canonique) : l'écart maximal de modulation décroît avec la taille
  // d'échantillon — modulation ∈ [1, 1 + 1/√n], sans échelle fixe.
  const modulationAmplitude = 1.0 / Math.sqrt(Math.max(1, pairedPairs.length));

  for (let n = 1; n <= 90; n++) {
    const rawSignal = (cooccBoost[n] + cascadeBoost[n]) / maxSignal;
    const modulation = Math.pow(1.0 + modulationAmplitude, Math.tanh(rawSignal));
    vec[n] = vec[n] * modulation;
  }

  return vec;
};

export interface InterDrawMorphologicalTarget {
  optimalSum: number;
  projectedSumMin: number;
  projectedSumMax: number;
  expectedEven: number;
  expectedOdd: number;
  tendencyStrength: number;
  reversionTendency: string;
}

/**
 * Extrait de façon continue les cibles morphologiques (somme cible barycentrique et espérance de parité)
 * issues de la relation inter-tirages pour la modulation dans la Fusion multi-modèles.
 * ZÉRO NOMBRE MAGIQUE & CONTINUITÉ STRICTE.
 */
export const getInterDrawMorphologicalTarget = (
  history: DrawResult[],
  drawName?: string,
  predecessorHistory?: DrawResult[]
): InterDrawMorphologicalTarget | null => {
  if (!history || history.length === 0 || !drawName) return null;

  const purified = purifyHistoryForDraw(drawName, history);
  if (purified.length === 0) return null;

  const families = getInterDrawFamiliesForDraw(drawName);
  const activeFamily = families.length > 0 ? families[0] : getPrimaryInterDrawFamily(drawName);
  if (!activeFamily) return null;

  const relation = getFamilyPredecessorAndSuccessor(drawName, activeFamily.id);
  if (!relation) return null;

  let predHistory: DrawResult[] = [];
  if (predecessorHistory && predecessorHistory.length > 0) {
    predHistory = predecessorHistory;
  } else {
    const predHistoryKey = globalCache.generateKey('history', relation.predecessor.name);
    const cachedPredHistory = (globalCache.getSync<DrawResult[]>(predHistoryKey, relation.predecessor.name) || [])
      .filter(d => !d.id?.startsWith('deterministic-'));
    if (cachedPredHistory.length > 0) {
      predHistory = cachedPredHistory;
    } else {
      // ZÉRO FAUSSE DONNÉE : aucune cible morphologique sans prédécesseur réel synchronisé.
      return null;
    }
  }

  const predLatest = predHistory[0];
  const lastWinners = predLatest?.gagnants || [];
  if (lastWinners.length === 0) return null;

  const pairedPairs = alignConsecutiveDrawHistories(purified, predHistory);
  if (pairedPairs.length === 0) return null;

  const retroAlpha = deriveRetrospectiveOptimalAlpha(pairedPairs, undefined, drawName, relation.predecessor.name);
  const patternReport = analyzeInterDrawPatterns(pairedPairs, lastWinners, retroAlpha);
  if (!patternReport) return null;

  return {
    optimalSum: patternReport.centroid.projectedSumRange.optimal,
    projectedSumMin: patternReport.centroid.projectedSumRange.min,
    projectedSumMax: patternReport.centroid.projectedSumRange.max,
    expectedEven: patternReport.parity.expectedTargetEven,
    expectedOdd: patternReport.parity.expectedTargetOdd,
    tendencyStrength: patternReport.parity.tendencyStrength,
    reversionTendency: patternReport.centroid.reversionTendency,
  };
};

export interface HarmonicResonanceMap {
  familyId: InterDrawFamilyId;
  familyName: string;
  drawName: string;
  cycleLength: number;
  mirrorObservedRate: number;
  mirrorExpectedRate: number;
  mirrorLift: number;
  complementObservedRate: number;
  complementExpectedRate: number;
  complementLift: number;
  overallHarmonicAttractionRate: number;
  activeHarmonicResonances: HarmonicPairDetail[];
  topHarmonicPairs: HarmonicPairDetail[];
  vector: Float32Array;
}

/**
 * Génère la Cartographie Complète des Résonances Harmoniques (Miroirs & Compléments 91)
 * avec Taux d'Attraction Empirique continu propre à chaque cycle de tirages.
 */
export const calculateHarmonicResonanceMap = (
  history: DrawResult[],
  drawName: string,
  forcedFamilyId?: InterDrawFamilyId,
  predecessorHistory?: DrawResult[]
): HarmonicResonanceMap | null => {
  if (!history || history.length === 0 || !drawName) return null;

  // ISOLATION PAR TIRAGE (AGENTS.md) : purifie l'historique sur le tirage cible avant
  // tout alignement avec le prédécesseur (zéro pollution inter-familles).
  history = purifyHistoryForDraw(drawName, history);
  if (history.length === 0) return null;

  const families = getInterDrawFamiliesForDraw(drawName);
  const activeFamily = forcedFamilyId
    ? INTER_DRAW_FAMILIES[forcedFamilyId]
    : (families.length > 0 ? families[0] : getPrimaryInterDrawFamily(drawName));

  if (!activeFamily) return null;

  const relation = getFamilyPredecessorAndSuccessor(drawName, activeFamily.id);
  if (!relation) return null;

  // Récupération de l'historique du prédécesseur
  let predHistory: DrawResult[] = [];
  if (predecessorHistory && predecessorHistory.length > 0) {
    predHistory = predecessorHistory;
  } else {
    const predHistoryKey = globalCache.generateKey('history', relation.predecessor.name);
    const cachedPredHistory = (globalCache.getSync<DrawResult[]>(predHistoryKey, relation.predecessor.name) || [])
      .filter(d => !d.id?.startsWith('deterministic-'));
    if (cachedPredHistory.length > 0) {
      predHistory = cachedPredHistory;
    } else {
      // ZÉRO FAUSSE DONNÉE : aucune cartographie harmonique sans prédécesseur réel synchronisé.
      return null;
    }
  }

  const vector = calculateInterDrawVector(history, drawName, predHistory, activeFamily.id);
  const predLatest = predHistory[0];
  const lastWinners = predLatest?.gagnants || [];

  const mirrorExpectedRate = (LOTTERY_CONSTANTS.NUMBERS_PER_DRAW / LOTTERY_CONSTANTS.TOTAL_NUMBERS) * 100;
  const complementExpectedRate = (LOTTERY_CONSTANTS.NUMBERS_PER_DRAW / LOTTERY_CONSTANTS.TOTAL_NUMBERS) * 100;

  let totalTested = 0;
  let mirrorHits = 0;
  let compHits = 0;

  const pairCounts: Record<string, { count: number; total: number; from: number; to: number; type: 'MIROIR' | 'COMPLEMENT' }> = {};

  const pairedPairs = alignConsecutiveDrawHistories(history, predHistory);
  const sampleLimit = Math.min(pairedPairs.length, 150);

  for (let i = 0; i < sampleLimit; i++) {
    const prev = pairedPairs[i].predWinners;
    const curr = pairedPairs[i].targetWinners;
    if (prev.length === 0 || curr.length === 0) continue;

    for (const p of prev) {
      totalTested++;
      const m = getMirrorNumber(p);
      if (m !== p) {
        const k = `MIR_${p}_${m}`;
        if (!pairCounts[k]) pairCounts[k] = { count: 0, total: 0, from: p, to: m, type: 'MIROIR' };
        pairCounts[k].total++;
        if (curr.includes(m)) {
          mirrorHits++;
          pairCounts[k].count++;
        }
      }

      const c = getComplement90(p);
      if (c !== p) {
        const k = `COMP_${p}_${c}`;
        if (!pairCounts[k]) pairCounts[k] = { count: 0, total: 0, from: p, to: c, type: 'COMPLEMENT' };
        pairCounts[k].total++;
        if (curr.includes(c)) {
          compHits++;
          pairCounts[k].count++;
        }
      }
    }
  }

  const mirrorObservedRate = totalTested > 0 ? (mirrorHits / totalTested) * 100 : mirrorExpectedRate;
  const mirrorLift = mirrorObservedRate / mirrorExpectedRate;

  const complementObservedRate = totalTested > 0 ? (compHits / totalTested) * 100 : complementExpectedRate;
  const complementLift = complementObservedRate / complementExpectedRate;

  const overallHarmonicAttractionRate = totalTested > 0 ? ((mirrorHits + compHits) / (totalTested * 2)) * 100 : mirrorExpectedRate;

  // Paires harmoniques globales triées par lift
  const allPairs: HarmonicPairDetail[] = Object.values(pairCounts).map(item => {
    const rate = item.total > 0 ? (item.count / item.total) * 100 : mirrorExpectedRate;
    const lift = rate / mirrorExpectedRate;
    const isActive = lastWinners.includes(item.from);
    return {
      from: item.from,
      to: item.to,
      type: item.type,
      occurrences: item.count,
      empiricalRate: Math.round(rate * 10) / 10,
      lift: Math.round(lift * 100) / 100,
      isActiveInCurrentDraw: isActive,
      score: Math.round(continuousSigmoid((lift - 1.0) * 2.0) * 10) / 10
    };
  });

  allPairs.sort((a, b) => b.score - a.score || b.occurrences - a.occurrences);
  const activeHarmonicResonances = allPairs.filter(p => p.isActiveInCurrentDraw);

  return {
    familyId: activeFamily.id,
    familyName: activeFamily.name,
    drawName,
    cycleLength: activeFamily.sequence.length,
    mirrorObservedRate: Math.round(mirrorObservedRate * 10) / 10,
    mirrorExpectedRate: Math.round(mirrorExpectedRate * 10) / 10,
    mirrorLift: Math.round(mirrorLift * 100) / 100,
    complementObservedRate: Math.round(complementObservedRate * 10) / 10,
    complementExpectedRate: Math.round(complementExpectedRate * 10) / 10,
    complementLift: Math.round(complementLift * 100) / 100,
    overallHarmonicAttractionRate: Math.round(overallHarmonicAttractionRate * 10) / 10,
    activeHarmonicResonances,
    topHarmonicPairs: allPairs.slice(0, 15),
    vector
  };
};

/**
 * Calcule le couplage vectoriel inter-tirages spécifique pour la Résonance Inter-Mensuelle.
 * Combine les transitions cycliques de la famille avec les profils de cohorte mensuelle.
 */
export const calculateInterDrawMonthlyCoupling = (
  history: DrawResult[],
  drawName?: string,
  sourceMonth?: number,
  currentMonth?: number,
  forcedFamilyId?: InterDrawFamilyId
): {
  vector: Float32Array;
  familyId?: InterDrawFamilyId;
  familyName?: string;
  shortName?: string;
  predecessorName?: string;
  successorName?: string;
  carryOverLift?: number;
  harmonicCount?: number;
} => {
  const defaultVector = new Float32Array(91).fill(THEORETICAL_SINGLE_PROB);
  if (!history || history.length === 0 || !drawName) {
    return { vector: defaultVector };
  }

  // ISOLATION PAR TIRAGE (AGENTS.md) : purifie l'historique sur le tirage cible avant
  // tout alignement avec le prédécesseur (zéro pollution inter-familles).
  history = purifyHistoryForDraw(drawName, history);
  if (history.length === 0) {
    return { vector: defaultVector };
  }

  const families = getInterDrawFamiliesForDraw(drawName);
  const primaryFamily = forcedFamilyId
    ? INTER_DRAW_FAMILIES[forcedFamilyId]
    : (families.length > 0 ? families[0] : getPrimaryInterDrawFamily(drawName));

  if (!primaryFamily) {
    return { vector: defaultVector };
  }

  const relation = getFamilyPredecessorAndSuccessor(drawName, primaryFamily.id);
  if (!relation) {
    return { vector: defaultVector };
  }

  // Récupération de l'historique réel du prédécesseur (Zéro faux tirage)
  const predHistoryKey = globalCache.generateKey('history', relation.predecessor.name);
  const cachedPred = globalCache.getSync<DrawResult[]>(predHistoryKey, relation.predecessor.name);
  const realPredHistory = (cachedPred && cachedPred.length > 0)
    ? cachedPred.filter(d => !d.id?.startsWith('deterministic-'))
    : [];

  if (realPredHistory.length === 0 || !history || history.length === 0) {
    return { vector: defaultVector };
  }
  const predHistory = realPredHistory;

  const baseVector = calculateInterDrawVector(history, drawName, predHistory, primaryFamily.id);

  // Filtrage temporel des co-occurrences dans le mois source
  let monthCarryOverCount = 0;
  let totalMonthPairs = 0;

  const pairedPairs = alignConsecutiveDrawHistories(history, predHistory);
  for (const pair of pairedPairs) {
    const ts = getDrawTimestamp(pair.targetDate);
    if (ts > 0) {
      const m = new Date(ts).getMonth();
      if (sourceMonth === undefined || m === sourceMonth || m === currentMonth) {
        totalMonthPairs++;
        const common = pair.targetWinners.filter(n => pair.predWinners.includes(n));
        if (common.length > 0) {
          monthCarryOverCount++;
        }
      }
    }
  }

  const observedRate = totalMonthPairs > 0 ? monthCarryOverCount / totalMonthPairs : THEORETICAL_CARRYOVER_PROB;
  const theoreticalRate = THEORETICAL_CARRYOVER_PROB; // 25.37% exact
  const carryOverLift = parseFloat((observedRate / theoreticalRate).toFixed(2));

  const lastWinners = predHistory[0]?.gagnants || history[0]?.gagnants || [];
  const harmonicCount = lastWinners.filter(n => getMirrorNumber(n) !== n || getComplement90(n) !== n).length;

  return {
    vector: baseVector,
    familyId: primaryFamily.id,
    familyName: primaryFamily.name,
    shortName: primaryFamily.shortName,
    predecessorName: relation.predecessor.name,
    successorName: relation.successor.name,
    carryOverLift,
    harmonicCount
  };
};
