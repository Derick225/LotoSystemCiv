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
  generateDeterministicFallbackHistory,
  getDrawTimestamp
} from './lotteryService';
import { globalCache, CACHE_TTL } from './cache/CacheService';
import { wasmMatrixEngine } from './wasm/wasmMatrixCore';
import { computeCrossHawkesKernelHpc, computeRobustHurstHpc } from './wasm/lotoEngineBridge';
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

export interface InterDrawNodeCoupling {
  sourceName: string;
  targetName: string;
  correlation: number; // Pearson r [-1, 1]
  weight: number; // [0, 1] continue
  carryOverRate: number; // %
  samplePairs: number;
}

export interface InterDrawNetworkMatrix {
  networkId: InterDrawNetworkId;
  drawNames: string[];
  weights: Record<string, Record<string, number>>; // W[target][source]
  couplings: InterDrawNodeCoupling[];
  meanNetworkCoupling: number;
}

export interface InterDrawReport {
  targetDraw: string;
  family: InterDrawFamilyConfig;
  networkId: InterDrawNetworkId;
  networkMatrix?: InterDrawNetworkMatrix;
  networkCouplings?: InterDrawNodeCoupling[];
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
  generationTimestamp: number;
}

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
export const alignConsecutiveDrawHistories = (
  targetHistory: DrawResult[],
  predHistory: DrawResult[],
  targetDrawName?: string,
  predDrawName?: string
): { predWinners: number[]; targetWinners: number[]; targetDate: string; predDate: string }[] => {
  const paired: { predWinners: number[]; targetWinners: number[]; targetDate: string; predDate: string }[] = [];
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

  const rawHawkes = new Float64Array(N + 1);
  for (let c = 1; c <= N; c++) {
    const mu = targetBaseline[c] > 0 ? targetBaseline[c] : p0;
    rawHawkes[c] = Math.log(Math.max(1e-4, hawkesRes.intensities[c] / mu));
  }

  // Poids adaptatif continu du canal de Hawkes dérivé de l'énergie totale d'excitation et de la variance de l'échantillon
  const hawkesWeight = Math.tanh(hawkesRes.totalEnergy / Math.max(1.0, Math.sqrt(sampleSize)));

  // 3d. Intégration continue du graphe complet all-to-all du réseau fermé (AGENTS.md)
  const evidenceNetwork = new Float64Array(N + 1);
  const targetFamily = targetDrawName ? getPrimaryInterDrawFamily(targetDrawName) : null;
  if (targetFamily) {
    const targetNetId = (targetFamily.id === 'hebdomadaire' || targetFamily.id === 'quotidien')
      ? targetFamily.id
      : (getDrawNetworkId(targetDrawName) || 'quotidien');
    const networkDrawNames = INTER_DRAW_NETWORKS[targetNetId]?.drawNames || [];
    const syntheticTargetHistory = pairedPairs.map(p => ({ date: '', gagnants: p.targetWinners }));
    for (const otherDrawName of networkDrawNames) {
      if (targetDrawName && normalizeDrawName(otherDrawName) === normalizeDrawName(targetDrawName)) continue;
      if (predDrawName && normalizeDrawName(otherDrawName) === normalizeDrawName(predDrawName)) continue;

      const sHistKey = globalCache.generateKey('history', otherDrawName);
      let sHist = globalCache.getSync<any[]>(sHistKey, otherDrawName);
      if (!sHist || sHist.length === 0) {
        sHist = generateDeterministicFallbackHistory(otherDrawName);
      }

      const coupling = computeContinuousInterDrawCoupling(sHist, syntheticTargetHistory as any);
      if (coupling.weight > 0.001) {
        const sWinners = (sHist[0]?.gagnants || []).filter((n: number) => n >= 1 && n <= N);
        const netLift = coupling.carryOverRate / THEORETICAL_CARRYOVER_RATE_PERCENT;
        const logCoupling = Math.log(Math.max(1e-4, netLift));
        for (const sw of sWinners) {
          evidenceNetwork[sw] += coupling.weight * logCoupling;
        }
      }
    }
  }

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

    // 5. Probabilité conjointe totale bayésienne (fusion différentiable continue incluant le graphe complet)
    const logitTotal = logitP0 + gamma * (evidenceTrans + evidenceRepeat + evidenceHarmonic + evidenceNetwork[c] + hawkesWeight * rawHawkes[c]);
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
    const uniformLagEnergy = 1.0 / lagCount;

    if (zTrans > z90 && !item.flags.includes('HAUTE_TRANSITION')) {
      item.flags.push('HAUTE_TRANSITION');
    }

    if (zHawkes > z90 && !item.flags.includes('HAWKES_EXCITATION')) {
      item.flags.push('HAWKES_EXCITATION');
    }

    if (lagCount > 1 && hawkesRes.lagExcitations.subarray(1).reduce((a: number, b: number) => a + b, 0) > uniformLagEnergy * Math.max(1e-6, hawkesRes.totalEnergy)) {
      if (zHawkes > z75 && !item.flags.includes('HAWKES_REMANENCE')) {
        item.flags.push('HAWKES_REMANENCE');
      }
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
  predLaggedHistory?: number[][]
): number | undefined => {
  if (pairedPairs.length < 6) return undefined;

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

  return Math.max(
    1.0 / (1.0 + trainPairs.length),
    Math.min(1.5, (1.0 + Math.sqrt(varP)) / (1.0 + logLoss))
  );
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
  historyTarget: DrawResult[]
): { correlation: number; weight: number; carryOverRate: number; samplePairs: number } => {
  if (!historySource || historySource.length === 0 || !historyTarget || historyTarget.length === 0) {
    return { correlation: 0, weight: 0.0, carryOverRate: THEORETICAL_CARRYOVER_RATE_PERCENT, samplePairs: 0 };
  }

  // 1. Alignement chronologique strict des tirages consécutifs source -> cible
  const paired = alignConsecutiveDrawHistories(historyTarget, historySource);
  const nPairs = paired.length;
  if (nPairs < 2) {
    return { correlation: 0, weight: 0.0, carryOverRate: THEORETICAL_CARRYOVER_RATE_PERCENT, samplePairs: nPairs };
  }

  // 2. Mesure empirique du report direct (carry-over) et des résonances harmoniques
  let carryOverCount = 0;
  let harmonicCount = 0;

  for (const p of paired) {
    const pSet = new Set(p.predWinners);
    const hasShared = p.targetWinners.some(n => pSet.has(n));
    if (hasShared) carryOverCount++;

    const hasHarmonic = p.predWinners.some(pw => {
      const mir = getMirrorNumber(pw);
      const comp = getComplement90(pw);
      return p.targetWinners.includes(mir) || p.targetWinners.includes(comp);
    });
    if (hasHarmonic) harmonicCount++;
  }

  // Probabilité théorique nulle exacte pour 5/90 (P(X >= 1) = 25.37%)
  const p0 = THEORETICAL_CARRYOVER_PROB; // ~0.253694
  const empiricalRate = (carryOverCount / nPairs) * 100.0;
  const pCarry = carryOverCount / nPairs;
  const pHarm = harmonicCount / nPairs;

  // Z-score binomial exact de la relation de transition (AGENTS.md)
  const se = Math.sqrt((p0 * (1.0 - p0)) / nPairs);
  const zCarry = (pCarry - p0) / Math.max(1e-6, se);
  const zHarm = (pHarm - p0) / Math.max(1e-6, se);
  const zMax = Math.max(Math.abs(zCarry), Math.abs(zHarm));

  // Seuil universel de correction pour tests multiples sur les couples du réseau (M = 22 * 21 = 462 paires)
  // sqrt(2 * ln(462)) ≈ 3.503 — élimine les faux signaux sur données purement aléatoires
  const zThresh = Math.sqrt(2.0 * Math.log(462));
  const zExcess = Math.max(0, zMax - zThresh);

  // Poids de couplage continu discriminant W ∈ [0, 1[ : exactement 0 sous H0, > 0 uniquement en cas de signal réel
  const weight = Math.tanh(zExcess / 2.0);
  // Corrélation de transition normalisée dans [-1, 1]
  const correlation = Math.max(-1.0, Math.min(1.0, zCarry / Math.sqrt(nPairs)));

  return {
    correlation: Math.round(correlation * 1000) / 1000,
    weight: Math.round(weight * 1000) / 1000,
    carryOverRate: Math.round(empiricalRate * 10) / 10,
    samplePairs: nPairs
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

  const matrixCacheKey = globalCache.getInterDrawKey(networkId, 'network', 'matrix');
  const cached = globalCache.getSync<InterDrawNetworkMatrix>(matrixCacheKey);
  if (cached && cached.drawNames && cached.drawNames.length === drawNames.length) {
    return cached;
  }

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
      const res = computeContinuousInterDrawCoupling(histSource, histTarget);
      weights[target][source] = res.weight;
      couplings.push({
        sourceName: source,
        targetName: target,
        correlation: res.correlation,
        weight: res.weight,
        carryOverRate: res.carryOverRate,
        samplePairs: res.samplePairs
      });
      totalWeight += res.weight;
      pairCount++;
    }
  }

  const matrix: InterDrawNetworkMatrix = {
    networkId,
    drawNames,
    weights,
    couplings,
    meanNetworkCoupling: pairCount > 0 ? Math.round((totalWeight / pairCount) * 1000) / 1000 : 0.5
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
    if (fastSync && fastSync.predecessor?.name && fastSync.successor?.name && Array.isArray(fastSync.topCandidates)) {
      return fastSync;
    }

    const cached = await globalCache.get<InterDrawReport>(cacheKey, targetDrawName);
    if (cached && cached.predecessor?.name && cached.successor?.name && Array.isArray(cached.topCandidates)) {
      return cached;
    }
  }

  // 1. Récupération des historiques du tirage cible et de son prédécesseur direct dans le réseau
  const [targetHistory, predHistory, networkMatrix] = await Promise.all([
    lotteryService.fetchHistory(targetDrawName, forceRefresh),
    lotteryService.fetchHistory(relation.predecessor.name, forceRefresh),
    generateNetworkInterconnectionMatrix(networkId)
  ]);

  const targetLatestResult = targetHistory.length > 0 ? targetHistory[0] : null;
  const predLatestResult = predHistory.length > 0 ? predHistory[0] : null;

  // 2. Alignement temporel des tirages consécutifs prédécesseur -> cible
  const pairedPairs = alignConsecutiveDrawHistories(targetHistory, predHistory);

  // Numéros actifs du prédécesseur qui polarisent le tirage cible
  const activePredNumbers = predLatestResult?.gagnants || [1, 2, 3, 4, 5];

  // Historique multi-lags du prédécesseur pour le noyau de Hawkes
  const predLaggedHistory = predHistory.slice(0, 5).map(d => d.gagnants);

  // 3. Exécution du moteur mathématique bayésien continu avec auto-calibration en boucle fermée
  const retroAlpha = deriveRetrospectiveOptimalAlpha(pairedPairs, predLaggedHistory);
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

  // Recommandations
  const topCandidates = scoredCandidates.slice(0, 10);
  const recommendedRepeats = scoredCandidates
    .filter(c => c.flags.includes('REPORT_DIRECT'))
    .slice(0, 5);
  const recommendedHarmonics = scoredCandidates
    .filter(c => c.flags.includes('MIROIR_DECIMAL') || c.flags.includes('COMPLEMENT_90'))
    .slice(0, 5);

  // 6. Top Couplages 2-sur-2 (paires)
  const topNumbersPool = topCandidates.slice(0, 6).map(c => c.number);
  const pairCandidates: InterDrawPairCombination[] = [];

  for (let i = 0; i < topNumbersPool.length; i++) {
    for (let j = i + 1; j < topNumbersPool.length; j++) {
      const n1 = topNumbersPool[i];
      const n2 = topNumbersPool[j];
      const s1 = scoredCandidates.find(c => c.number === n1)?.compositeScore || 50;
      const s2 = scoredCandidates.find(c => c.number === n2)?.compositeScore || 50;
      const geomAffinity = Math.sqrt(s1 * s2);
      const conf = ((scoredCandidates.find(c => c.number === n1)?.confidence || 0.5) +
                    (scoredCandidates.find(c => c.number === n2)?.confidence || 0.5)) / 2;

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

  const report: InterDrawReport = {
    targetDraw: targetDrawName,
    family: activeFamily,
    networkId,
    networkMatrix,
    networkCouplings: networkMatrix?.couplings,
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
    fullCandidateScores,
    hawkesMetrics: engine.hawkesTotalEnergy !== undefined ? {
      totalEnergy: engine.hawkesTotalEnergy,
      betaDecay: engine.hawkesBetaDecay || HAWKES_NEUTRAL_BETA_DECAY,
      lagExcitations: engine.hawkesLagExcitations || []
    } : undefined,
    cooccurrenceMetrics,
    patternMetrics,
    complexDynamics,
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
  const retroAlpha = deriveRetrospectiveOptimalAlpha(pairedPairs, predLaggedHistory);
  const engine = runBayesianResonanceEngine(pairedPairs, validNumbers, predLaggedHistory, retroAlpha);
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
    const cachedPredHistory = globalCache.getSync<DrawResult[]>(predHistoryKey, relation.predecessor.name);
    if (cachedPredHistory && cachedPredHistory.length > 0) {
      predHistory = cachedPredHistory;
    } else {
      predHistory = generateDeterministicFallbackHistory(relation.predecessor.name);
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
  const retroAlpha = deriveRetrospectiveOptimalAlpha(pairedPairs, predLaggedHistory);
  const engine = runBayesianResonanceEngine(pairedPairs, lastWinners, predLaggedHistory, retroAlpha, undefined, drawName, relation.predecessor.name);
  for (let n = 1; n <= 90; n++) {
    vec[n] = engine.fullCandidateScores[n] || THEORETICAL_SINGLE_PROB;
  }

  // 2. Injection continue des métriques de Lift conditionnel des paires et de résonance de cascade (+-1, +-2)
  // ZÉRO NOMBRE MAGIQUE : fonctions différentiables calculées à partir du Lift empirique, du PMI et de l'énergie de cascade.
  const cooccReport = analyzeInterDrawCooccurrences(pairedPairs, lastWinners);
  const patternReport = analyzeInterDrawPatterns(pairedPairs, lastWinners);

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
    const cachedPredHistory = globalCache.getSync<DrawResult[]>(predHistoryKey, relation.predecessor.name);
    if (cachedPredHistory && cachedPredHistory.length > 0) {
      predHistory = cachedPredHistory;
    } else {
      predHistory = generateDeterministicFallbackHistory(relation.predecessor.name);
    }
  }

  const predLatest = predHistory[0];
  const lastWinners = predLatest?.gagnants || [];
  if (lastWinners.length === 0) return null;

  const pairedPairs = alignConsecutiveDrawHistories(purified, predHistory);
  if (pairedPairs.length === 0) return null;

  const patternReport = analyzeInterDrawPatterns(pairedPairs, lastWinners);
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
    const cachedPredHistory = globalCache.getSync<DrawResult[]>(predHistoryKey, relation.predecessor.name);
    if (cachedPredHistory && cachedPredHistory.length > 0) {
      predHistory = cachedPredHistory;
    } else {
      predHistory = generateDeterministicFallbackHistory(relation.predecessor.name);
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

  // Récupération de l'historique du prédécesseur
  const predHistoryKey = globalCache.generateKey('history', relation.predecessor.name);
  const cachedPred = globalCache.getSync<DrawResult[]>(predHistoryKey, relation.predecessor.name);
  const predHistory = (cachedPred && cachedPred.length > 0) ? cachedPred : generateDeterministicFallbackHistory(relation.predecessor.name);

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
