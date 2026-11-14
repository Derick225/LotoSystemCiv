import { DrawResult } from '../../types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { benjaminiHochberg } from '../../utils/mathUtils';
import { LOTTERY_CONSTANTS } from '../lotteryService';
import { mineCyclePatternsHpc } from '../wasm/lotoEngineBridge';

export type PatternType = 'PAIR' | 'TRIPLET' | 'TRANSITION_CHAIN' | 'PHASE_MOTIF' | 'QUAD';

export type CyclePhase = 'EARLY' | 'MID' | 'LATE';

export type PatternDominantDriver =
  | 'PRECURSOR_PRIMED'
  | 'MARKOV_TRANSITION'
  | 'PERIODIC_RESONANCE'
  | 'SYNERGY_PMI'
  | 'PHASE_LOCK';

export interface PatternReasoningChain {
  compositeScore: number;            // Continuous multi-criteria score [0..100]
  pmi: number;                       // Pointwise Mutual Information (bits)
  intrinsicSynergyLift: number;      // Ratio P(tuple) / Prod P(individual)
  sameDrawOccurrences: number;       // Simultaneous co-occurrences in the exact same draw
  recencyMomentum: number;           // Exponentially weighted recency momentum [0..100]
  renewalHazard: number;             // Periodic return hazard tension [0..100]
  phaseAlignment: number;            // Continuous alignment with current cycle progression [0..100]
  conditionalCompletionRate: number; // Empirical Bayes P(complete | precursor) [0..100]
  regularityIndex: number;           // Interval regularity [0..100]
  dominantDriver: PatternDominantDriver;
  verdict: string;
  factors: string[];
}

export interface RecurringSequencePattern {
  id: string;
  type: PatternType;
  sequence: number[];              // The numbers in the pattern [n1, n2, ...]
  targetSequence?: number[];       // For transition chains: A -> B
  cycleSupport: number;            // Number of cycles containing this sequence
  totalCycles: number;             // Total cycles analyzed
  supportRate: number;             // cycleSupport / totalCycles [0..1]
  expectedSupportRate: number;     // Theoretical stochastic probability under exact H0
  lift: number;                    // supportRate / expectedSupportRate
  confidence: number;              // Empirical Bayesian confidence score [0..100]
  zScore: number;                  // Standardized statistical proof score
  hasEmpiricalProof: boolean;      // Statistical significance indicator
  cycleOccurrences: number[];      // Indices of cycles where pattern appeared
  lastSeenCycle: number;           // 0 = current/most recent cycle, 1 = 1 cycle ago, etc.
  meanCycleInterval: number;       // Average distance in cycles between occurrences
  cyclePhasePreference: CyclePhase; // Phase within cycle where pattern most often fires
  phaseDistribution: { early: number; mid: number; late: number }; // Percentage in each phase
  isPhaseSignificant?: boolean;    // Statistical chi-square test vs uniform (1/3, 1/3, 1/3)
  phaseChiSquare?: number;         // Chi-square goodness-of-fit statistic
  isPeriodicitySignificant?: boolean; // Under-dispersion test vs geometric H0 variance
  dispersionIndex?: number;        // Var(Interval) / Var_H0(Geometric)
  transitionConfidence?: number;   // For transition chains: P(Target in cycle C+1 | Sequence in cycle C)
  activeAlertStatus: 'PRIMED' | 'TRIGGERED' | 'DORMANT'; // Is precursor active in current cycle
  completionCandidates?: number[]; // If partially active in current cycle, missing numbers to complete
  completionProbability?: number;  // Continuous completion probability [0..100]
  entropy: number;                 // Normalized entropy of cycle intervals
  reasoning?: PatternReasoningChain;
}

export type CandidateSelectionRole =
  | 'PIVOT_CONVERGENT'
  | 'COMPLETION_PRIMED'
  | 'TRANSITION_CIBLE'
  | 'RESONANCE_CYCLIQUE';

/**
 * Décomposition des 5 canaux de preuve statistique standardisés (sans unité, N(0, 1) sous H0)
 * combinés par la méthode de Stouffer pour chaque boule candidate des motifs répétitifs.
 */
export interface StoufferPatternChannelBreakdown {
  /** Z-score combiné des motifs amorcés (paires/triplets) pointant vers la boule */
  zPrimed: number;
  /** Z-score combiné des transitions inter-cycles de Markov pointant vers la boule */
  zTransition: number;
  /** Z-score de résonance périodique sous-dispersée en fenêtre de retour */
  zPeriodic: number;
  /** Z-score multinomial d'alignement de phase avec la progression du cycle actif */
  zPhase: number;
  /** Z-score de synergie simultanée intra-tirage avec les boules du cycle actif */
  zSynergy: number;
  /** Nombre de canaux actifs contribuant au dénominateur √k de Stouffer */
  activeChannels: number;
}

export interface PatternCandidateSelection {
  number: number;
  /** Percentile exact Φ(Z_Stouffer) × 100 dans (0, 100) — neutre à 50.0 sous H0 */
  convergenceScore: number;
  /** Z-score homogène combiné par méthode de Stouffer (en unités σ) */
  stoufferZScore?: number;
  /** p-value unilatérale supérieure P(Z ≥ Z_Stouffer) sous H0 */
  stoufferPValue?: number;
  /** Détail des 5 Z-scores homogènes par canal */
  channelZScores?: StoufferPatternChannelBreakdown;
  primedMotifsCount: number;       // Active primed pairs/triplets pointing to this ball
  transitionDriversCount: number;  // Active cross-cycle transitions pointing to this ball
  periodicMotifsCount: number;     // Periodic renewal motifs due in current cycle containing this ball
  sameDrawSynergyCount: number;    // Simultaneous intra-draw co-occurrences with active numbers
  phaseAffinityScore: number;      // Alignment percentile Φ(zPhase) × 100 [0..100]
  synergyPartners: number[];       // Top synergistic partner balls (by Z / PMI)
  supportingPatterns: string[];    // Human-readable labels of top supporting motifs
  selectionRole: CandidateSelectionRole;
  reasoningSummary: string;
}

export interface PatternSynthesizedSelection {
  optimalFive: number[];           // Optimal 5-ball combination synthesized by Z-space submodular optimization
  reserveNumbers: number[];        // 2 tactical reserve numbers
  selectionConfidence: number;     // Overall confidence [0..100]
  coveredPatternsCount: number;    // Number of distinct active/periodic patterns covered
  pairwiseSynergyScore: number;    // Internal PMI / co-occurrence cohesion [0..100]
  phaseCoherenceScore: number;     // Alignment with current cycle progression [0..100]
  currentPhaseLabel: string;
  /** Z-score de Stouffer agrégé sur la sélection optimale de 5 boules */
  ticketStoufferZScore?: number;
  /** p-value unilatérale supérieure associée à ticketStoufferZScore */
  ticketPValue?: number;
  /** Méthode d'agrégation homogène utilisée */
  scoringMethod?: 'STOUFFER_Z';
  selectionRationale: string[];
}

export interface CycleAnalysisSummary {
  drawName: string;
  cycleLength: number;
  totalDraws: number;
  totalCycles: number;
  activeCycleIndex: number;
  activeCycleDrawsCount: number;
  activeCycleNumbers: number[];
  topRecurringPairs: RecurringSequencePattern[];
  topRecurringTriplets: RecurringSequencePattern[];
  topCrossCycleTransitions: RecurringSequencePattern[];
  topPhaseMotifs: RecurringSequencePattern[];
  activePrimedPatterns: RecurringSequencePattern[];
  topPeriodicResonancePatterns?: RecurringSequencePattern[];
  candidateRankings?: PatternCandidateSelection[];
  recommendedSelection?: PatternSynthesizedSelection;
  overallCycleEntropy: number | null;
}

export interface PatternDiscoveryOptions {
  cycleLength?: number;           // default: 10 draws per cycle
  minSupportCycles?: number;      // min cycles with occurrences
  maxPatternsPerCategory?: number;// limit results
  includeTransitions?: boolean;   // analyze cross-cycle A -> B
}

const TOTAL_BALLS = LOTTERY_CONSTANTS.TOTAL_NUMBERS; // 90
const BALLS_PER_DRAW = LOTTERY_CONSTANTS.NUMBERS_PER_DRAW; // 5
const Z_GAUSS_90 = 1.2815515655446004; // Exact Φ⁻¹(0.90)

/**
 * Calculates exact binomial coefficient C(n, k)
 */
const combinations = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let c = 1;
  for (let i = 1; i <= k; i++) {
    c = (c * (n - (k - i))) / i;
  }
  return c;
};

/**
 * Exact Inclusion-Exclusion probability that all k distinct numbers of a k-tuple
 * appear at least once within the union of C independent draws of a 5/90 lottery:
 * P_union(k, C) = sum_{j=0..k} (-1)^j * C(k, j) * (C(90 - j, 5) / C(90, 5))^C
 */
export const computeExactCycleUnionProbability = (k: number, cycleLength: number): number => {
  const totalComb = combinations(TOTAL_BALLS, BALLS_PER_DRAW);
  let prob = 0;
  for (let j = 0; j <= k; j++) {
    const sign = j % 2 === 0 ? 1 : -1;
    const ways = combinations(k, j);
    const singleDrawAbsentJ = combinations(TOTAL_BALLS - j, BALLS_PER_DRAW) / totalComb;
    prob += sign * ways * Math.pow(singleDrawAbsentJ, cycleLength);
  }
  return Math.max(1e-7, Math.min(1 - 1e-7, prob));
};

/**
 * Exact probability that a k-tuple appears simultaneously in the SAME draw
 * at least once across a cycle of C draws:
 * P_same_draw(k, C) = 1 - (1 - C(5, k) / C(90, k))^C
 */
export const computeExactSameDrawCycleProbability = (k: number, cycleLength: number): number => {
  const singleDrawProb = combinations(BALLS_PER_DRAW, k) / combinations(TOTAL_BALLS, k);
  if (singleDrawProb <= 0) return 1e-7;
  return Math.max(1e-7, 1 - Math.pow(1 - singleDrawProb, cycleLength));
};

/**
 * Continuous Normal Cumulative Distribution Function (CDF) Φ(z)
 */
export const patternNormalCdf = (z: number): number => {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z);
  const prob =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return Math.max(0, Math.min(1, z > 0 ? 1.0 - prob : prob));
};

const normalCdf = patternNormalCdf;

/**
 * p-value unilatérale supérieure P(Z ≥ z) = 1 - Φ(z) sous H0 : Z ~ N(0, 1).
 */
export const patternNormalUpperPValue = (z: number): number => {
  return Math.max(0, Math.min(1, 1 - patternNormalCdf(z)));
};

/**
 * Combinaison de Stouffer (1949) de k Z-scores homogènes sans unité :
 *   Z_Stouffer = (Σ_j w_j · Z_j) / √(Σ_j w_j²)
 */
export const combinePatternStoufferZScores = (
  channels: Array<{ z: number; weight?: number }>
): { zScore: number; pValue: number; activeChannels: number } => {
  let weightedSum = 0;
  let weightSqSum = 0;
  let activeChannels = 0;

  for (const ch of channels) {
    const w = ch.weight ?? 1;
    if (w > 0 && Number.isFinite(ch.z)) {
      weightedSum += w * ch.z;
      weightSqSum += w * w;
      activeChannels += 1;
    }
  }

  if (weightSqSum <= 0 || activeChannels === 0) {
    return { zScore: 0, pValue: 0.5, activeChannels: 0 };
  }

  const zScore = weightedSum / Math.sqrt(weightSqSum);
  return {
    zScore,
    pValue: patternNormalUpperPValue(zScore),
    activeChannels,
  };
};

/**
 * Inverse de la fonction de répartition normale standard Φ⁻¹(p) (approximation de Beasley-Springer-Moro)
 */
const normalInvCdf = (p: number): number => {
  const clamped = Math.max(1e-15, Math.min(1 - 1e-15, p));
  if (clamped === 0.5) return 0;
  const q = clamped < 0.5 ? clamped : 1 - clamped;
  const t = Math.sqrt(-2 * Math.log(q));
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;
  const z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
  return clamped < 0.5 ? -z : z;
};

/**
 * Probabilité exacte de queue supérieure P(X >= k) pour X ~ Poisson(lambda),
 * numériquement stable même pour des lambda très faibles et convertie en Z-score équivalent.
 */
const computePoissonUpperTailZScore = (k: number, lambda: number): number => {
  if (k <= 0 || lambda <= 0) return 0;
  if (k <= lambda) {
    // Queue inférieure ou centrale : somme directe depuis 0
    let cdfLess = 0;
    let logFact = 0;
    for (let j = 0; j < k; j++) {
      if (j > 0) logFact += Math.log(j);
      cdfLess += Math.exp(-lambda + j * Math.log(lambda) - logFact);
    }
    const pUpper = Math.max(1e-15, Math.min(1 - 1e-15, 1 - cdfLess));
    return normalInvCdf(1 - pUpper);
  }
  // Queue supérieure : somme directe depuis k pour éviter toute perte de précision
  let logFactK = 0;
  for (let i = 2; i <= k; i++) logFactK += Math.log(i);
  const logTermK = -lambda + k * Math.log(lambda) - logFactK;
  let term = Math.exp(Math.max(-700, logTermK));
  let sumUpper = term;
  for (let j = k + 1; j <= k + 64; j++) {
    term *= lambda / j;
    sumUpper += term;
    if (term < sumUpper * 1e-12) break;
  }
  const pUpper = Math.max(1e-15, Math.min(1 - 1e-15, sumUpper));
  return Math.max(0, normalInvCdf(1 - pUpper));
};

/**
 * Probabilité exacte de queue supérieure P(X >= k) pour X ~ Binomial(n, p),
 * évitant la sous-estimation catastrophique de l'approximation normale pour p faible et n modéré.
 */
const computeBinomialUpperTailZScore = (k: number, n: number, p: number): number => {
  if (n <= 0) return 0;
  const clampedP = Math.max(1e-12, Math.min(1 - 1e-12, p));
  if (k <= 0) return -3.0;
  if (k > n) return 8.0;

  let logSum = -Infinity;
  const logAdd = (a: number, b: number): number => {
    if (!Number.isFinite(a)) return b;
    if (!Number.isFinite(b)) return a;
    const m = Math.max(a, b);
    return m + Math.log1p(Math.exp(-Math.abs(a - b)));
  };

  // log(n!) - log(j!) - log((n-j)!) via somme logarithmique directe (n <= ~500)
  const logFact = (m: number): number => {
    let s = 0;
    for (let i = 2; i <= m; i++) s += Math.log(i);
    return s;
  };
  const logFactN = logFact(n);
  const logP = Math.log(clampedP);
  const log1mP = Math.log(1 - clampedP);

  if (k >= n * clampedP) {
    for (let j = k; j <= n; j++) {
      const logC = logFactN - logFact(j) - logFact(n - j);
      const logTerm = logC + j * logP + (n - j) * log1mP;
      logSum = logAdd(logSum, logTerm);
    }
    const pUpper = Math.max(1e-15, Math.min(1 - 1e-15, Math.exp(Math.min(0, logSum))));
    return normalInvCdf(1 - pUpper);
  }

  for (let j = 0; j < k; j++) {
    const logC = logFactN - logFact(j) - logFact(n - j);
    const logTerm = logC + j * logP + (n - j) * log1mP;
    logSum = logAdd(logSum, logTerm);
  }
  const pLower = Math.max(1e-15, Math.min(1 - 1e-15, Math.exp(Math.min(0, logSum))));
  return normalInvCdf(pLower);
};

/**
 * Continuous logistic sigmoid mapped to [0, 100]
 */
const logisticScore100 = (x: number): number => {
  return 100 / (1 + Math.exp(-x));
};

/**
 * Continuous phase membership weights (early, mid, late) for a normalized cycle progress u in [0, 1].
 * Uses smooth Gaussian kernels centered at 1/6, 3/6, and 5/6 with bandwidth σ = 1/3.
 */
const computeContinuousPhaseWeights = (
  progressRatio: number
): { early: number; mid: number; late: number; currentPhase: CyclePhase; label: string } => {
  const u = Math.max(0, Math.min(1, progressRatio));
  const sigma = 1 / 3;
  const gEarly = Math.exp(-Math.pow(u - 1 / 6, 2) / (2 * sigma * sigma));
  const gMid = Math.exp(-Math.pow(u - 3 / 6, 2) / (2 * sigma * sigma));
  const gLate = Math.exp(-Math.pow(u - 5 / 6, 2) / (2 * sigma * sigma));
  const sum = gEarly + gMid + gLate + Number.EPSILON;

  let currentPhase: CyclePhase = 'MID';
  let label = 'Phase Milieu de Cycle';
  if (u <= 1 / 3) {
    currentPhase = 'EARLY';
    label = 'Phase Ouverture de Cycle';
  } else if (u >= 2 / 3) {
    currentPhase = 'LATE';
    label = 'Phase Clôture de Cycle';
  }

  return {
    early: gEarly / sum,
    mid: gMid / sum,
    late: gLate / sum,
    currentPhase,
    label,
  };
};

/**
 * Pattern Discovery Service
 * Identifies, evaluates, reasons on, and synthesizes recurring multi-cycle sequences.
 * 100% Deterministic - Zero Magic Numbers - Strict Draw Isolation.
 */
export const patternDiscoveryService = {
  /**
   * Performs complete sequential pattern discovery, quantitative reasoning,
   * and optimal 5-ball convergence selection on the isolated draw history.
   */
  discoverPatterns(
    drawName: string,
    history: DrawResult[],
    options: PatternDiscoveryOptions = {}
  ): CycleAnalysisSummary {
    const isolatedHistory = purifyHistoryForDraw(drawName, history);
    const totalDraws = isolatedHistory.length;
    const cycleLength = Math.max(3, Math.min(30, options.cycleLength ?? 10));
    const maxPerCat = options.maxPatternsPerCategory ?? 25;

    if (totalDraws < cycleLength) {
      return {
        drawName,
        cycleLength,
        totalDraws,
        totalCycles: 0,
        activeCycleIndex: 0,
        activeCycleDrawsCount: 0,
        activeCycleNumbers: [],
        topRecurringPairs: [],
        topRecurringTriplets: [],
        topCrossCycleTransitions: [],
        topPhaseMotifs: [],
        activePrimedPatterns: [],
        topPeriodicResonancePatterns: [],
        candidateRankings: [],
        recommendedSelection: {
          optimalFive: [],
          reserveNumbers: [],
          selectionConfidence: 0,
          coveredPatternsCount: 0,
          pairwiseSynergyScore: 0,
          phaseCoherenceScore: 0,
          currentPhaseLabel: 'Données insuffisantes',
          selectionRationale: ['Historique insuffisant pour segmenter des cycles complets.'],
        },
        overallCycleEntropy: null,
      };
    }

    // 1. Aplatir l'historique chronologique (ancien -> récent) en Int32Array et déléguer
    // l'extraction combinatoire (cycles, paires, triplets Apriori, transitions) au noyau Rust/WASM HPC.
    const chronological = [...isolatedHistory].reverse();
    const flatChrono = new Int32Array(totalDraws * BALLS_PER_DRAW);
    for (let t = 0; t < totalDraws; t++) {
      const g = (chronological[t].gagnants || []).filter((n) => n >= 1 && n <= TOTAL_BALLS);
      for (let c = 0; c < Math.min(BALLS_PER_DRAW, g.length); c++) {
        flatChrono[t * BALLS_PER_DRAW + c] = g[c];
      }
    }

    const hpcMining = mineCyclePatternsHpc(
      flatChrono,
      totalDraws,
      BALLS_PER_DRAW,
      cycleLength,
      options.minSupportCycles ?? 0,
      options.includeTransitions !== false
    );

    const totalCycles = hpcMining.totalCycles;
    const activeCycleDrawsCount = hpcMining.activeCycleDrawsCount;
    const activeCycleNumbers = Array.from(hpcMining.activeCycleNumbers);
    const activeNumberSet = new Set<number>(activeCycleNumbers);
    const numCyclesForStats = hpcMining.completedCyclesCount;
    const overallCycleEntropy = hpcMining.overallCycleEntropy;

    const activeCycleProgress = activeCycleDrawsCount / cycleLength;
    const activePhaseWeights = computeContinuousPhaseWeights(activeCycleProgress);
    const remainingDrawsInCycle = Math.max(1, cycleLength - activeCycleDrawsCount);

    const ballCycleCounts = hpcMining.ballCycleCounts;
    const sourceBallCounts = hpcMining.sourceBallCounts;
    const pairCycleSupports = hpcMining.pairCycleSupports;
    const sameDrawPairCountsArr = hpcMining.sameDrawPairCounts;

    const getTriangularPairIndex = (a: number, b: number): number => {
      const lo = a < b ? a : b;
      const hi = a < b ? b : a;
      if (lo < 1 || hi > TOTAL_BALLS || lo === hi) return -1;
      const m = lo - 1;
      return m * TOTAL_BALLS - ((m * (m + 1)) >> 1) + (hi - lo - 1);
    };
    const getPairCycleSupport = (a: number, b: number): number => {
      const idx = getTriangularPairIndex(a, b);
      return idx >= 0 && idx < pairCycleSupports.length ? pairCycleSupports[idx] : 0;
    };
    const getSameDrawPairCount = (a: number, b: number): number => {
      const idx = getTriangularPairIndex(a, b);
      return idx >= 0 && idx < sameDrawPairCountsArr.length ? sameDrawPairCountsArr[idx] : 0;
    };

    const lastCompletedStart = Math.max(0, (numCyclesForStats - 1) * cycleLength);
    const lastCompletedEnd = Math.min(totalDraws, numCyclesForStats * cycleLength);
    const lastCompletedNumbers = new Set<number>();
    for (let t = lastCompletedStart; t < lastCompletedEnd; t++) {
      const off = t * BALLS_PER_DRAW;
      for (let c = 0; c < BALLS_PER_DRAW; c++) {
        const v = flatChrono[off + c];
        if (v >= 1 && v <= TOTAL_BALLS) lastCompletedNumbers.add(v);
      }
    }
    const completedDrawsCount = lastCompletedEnd;

    // Exact stochastic cycle union probabilities under H0
    const expSingleCycleProb = computeExactCycleUnionProbability(1, cycleLength);
    const expPairCycleProb = computeExactCycleUnionProbability(2, cycleLength);
    const expTripletCycleProb = computeExactCycleUnionProbability(3, cycleLength);

    const expPairSameDrawCycleProb = computeExactSameDrawCycleProbability(2, cycleLength);
    const expTripletSameDrawCycleProb = computeExactSameDrawCycleProbability(3, cycleLength);

    // Empirical Bayes prior weight derived from sample size M: alpha_0 = sqrt(M)
    const bayesPriorScale = Math.sqrt(Math.max(1, numCyclesForStats));

    // Smoothed marginal cycle probability P(n in cycle) for each ball n in 1..90
    const smoothedBallCycleProb = new Array(TOTAL_BALLS + 1).fill(expSingleCycleProb);
    for (let n = 1; n <= TOTAL_BALLS; n++) {
      smoothedBallCycleProb[n] =
        (ballCycleCounts[n] + bayesPriorScale * expSingleCycleProb) /
        (numCyclesForStats + bayesPriorScale);
    }

    // Characteristic Hawking memory decay constant tau_M derived continuously from M
    const hawkingTau = Math.max(2, numCyclesForStats / Math.log(numCyclesForStats + Math.E));
    let totalRecencyWeightNorm = 0;
    for (let c = 0; c < numCyclesForStats; c++) {
      totalRecencyWeightNorm += Math.exp(-(numCyclesForStats - 1 - c) / hawkingTau);
    }

    // 5. Continuous Differentiable Evaluation & Reasoning Function
    const evaluatePattern = (
      id: string,
      type: PatternType,
      seq: number[],
      cycleIndices: number[],
      expUnionProb: number,
      expSameDrawProb: number,
      sameDrawCount: number,
      phaseCounts: { early: number; mid: number; late: number }
    ): RecurringSequencePattern => {
      const support = cycleIndices.length;
      const supportRate = numCyclesForStats > 0 ? support / numCyclesForStats : 0;

      // Blend exact cycle-union null probability with same-draw simultaneity bonus
      const sameDrawCycleRate =
        numCyclesForStats > 0 ? Math.min(1, sameDrawCount / numCyclesForStats) : 0;
      const unionLift = expUnionProb > 0 ? supportRate / expUnionProb : 1.0;
      const sameDrawLift =
        sameDrawCount > 0 && expSameDrawProb > 0
          ? Math.min(25, sameDrawCycleRate / expSameDrawProb)
          : 1.0;

      // Effective lift combines cycle-window lift and simultaneous intra-draw lift continuously
      const sameDrawWeight = sameDrawCount / (sameDrawCount + Math.E);
      const lift = unionLift * (1 - 0.35 * sameDrawWeight) + sameDrawLift * (0.35 * sameDrawWeight);

      // Exact Binomial(M, expUnionProb) upper-tail probit + exact Poisson simultaneous draw evidence
      const zUnion = computeBinomialUpperTailZScore(support, numCyclesForStats, expUnionProb);
      const pSameDrawPerDraw = 1 - Math.pow(1 - expSameDrawProb, 1 / Math.max(1, cycleLength));
      const expectedSameDrawEvents =
        numCyclesForStats * Math.max(1, cycleLength) * pSameDrawPerDraw;
      const zSameDraw =
        sameDrawCount > 0
          ? computePoissonUpperTailZScore(sameDrawCount, expectedSameDrawEvents)
          : 0;
      const zScore =
        zUnion * (1 - sameDrawWeight * 0.45) + Math.max(zUnion, zSameDraw) * (sameDrawWeight * 0.45);

      // Lift de synergie intrinsèque : pénalise moins les motifs présents dans 100%
      // des cycles (où P(n) -> 1). Voir le commentaire du "pmi" ci-dessous.
      const sumIndividualCycles = seq.reduce(
        (acc, n) => acc + Math.max(1, ballCycleCounts[n] || 1),
        0
      );
      const diceCycleCohesion = Math.min(
        1.0,
        (seq.length * support) / Math.max(1, sumIndividualCycles)
      );
      const smoothedTupleProb =
        (support + bayesPriorScale * expUnionProb) / (numCyclesForStats + bayesPriorScale);
      const baseStochasticLift = smoothedTupleProb / Math.max(1e-7, expUnionProb);
      const intrinsicSynergyLift =
        baseStochasticLift *
        (0.5 + 0.5 * diceCycleCohesion) *
        (1 + 0.45 * sameDrawWeight * Math.log1p(sameDrawLift));
      // "pmi" = log2 du lift de synergie intrinsèque (en bits), pas une information
      // mutuelle ponctuelle stricte P(x,y)/P(x)P(y) — nom conservé pour l'API/UI.
      const pmi = Math.log2(Math.max(1e-6, intrinsicSynergyLift));

      // Recency-weighted Hawking exponential momentum
      let recencyWeightedSum = 0;
      cycleIndices.forEach((cIdx) => {
        recencyWeightedSum += Math.exp(-(numCyclesForStats - 1 - cIdx) / hawkingTau);
      });
      const expectedRecencySum = Math.max(1e-6, totalRecencyWeightNorm * expUnionProb);
      const recencyRatio = recencyWeightedSum / expectedRecencySum;
      const recencyMomentum = logisticScore100(recencyRatio - 1.0);

      // Intervals, Regularity & Periodic Renewal Hazard Rate
      const sortedCycles = [...cycleIndices].sort((a, b) => a - b);
      const intervals: number[] = [];
      for (let i = 1; i < sortedCycles.length; i++) {
        intervals.push(sortedCycles[i] - sortedCycles[i - 1]);
      }
      const meanInterval =
        intervals.length > 0
          ? intervals.reduce((a, b) => a + b, 0) / intervals.length
          : numCyclesForStats / Math.max(1, support);

      let intervalVariance = 0;
      if (intervals.length > 1) {
        intervalVariance =
          intervals.reduce((acc, iv) => acc + Math.pow(iv - meanInterval, 2), 0) / intervals.length;
      } else {
        intervalVariance = Math.pow(meanInterval * 0.5, 2);
      }
      const intervalStd = Math.sqrt(Math.max(0.25, intervalVariance));

      // Normalized Shannon entropy of intervals
      let intervalEntropy = 0;
      if (intervals.length > 0) {
        const intFreq: Record<number, number> = {};
        intervals.forEach((iv) => {
          intFreq[iv] = (intFreq[iv] || 0) + 1;
        });
        const intTotal = intervals.length;
        Object.values(intFreq).forEach((cnt) => {
          const p = cnt / intTotal;
          if (p > 0) intervalEntropy -= p * Math.log2(p);
        });
        intervalEntropy =
          intervalEntropy / Math.max(1, Math.log2(Math.max(2, Object.keys(intFreq).length)));
      }

      const coefficientOfVariation = intervalStd / Math.max(1, meanInterval);
      const regularityIndex =
        100 * (1 / (1 + coefficientOfVariation)) * (1 - 0.5 * Math.min(1, intervalEntropy));

      // How many cycles ago was this motif last seen?
      const isFullyInActive = seq.every((n) => activeNumberSet.has(n));
      const lastCompletedSeen =
        sortedCycles.length > 0 ? sortedCycles[sortedCycles.length - 1] : 0;
      const cyclesSinceLastCompleted = Math.max(0, numCyclesForStats - 1 - lastCompletedSeen);
      const cyclesAgo = isFullyInActive ? 0 : cyclesSinceLastCompleted + 1;

      // Sous l'hypothèse nulle H0 géométrique sans mémoire, l'intervalle entre occurrences
      // suit une loi géométrique de paramètre p = expUnionProb : E0[T] = 1/p, Var0(T) = (1 - p)/p^2.
      const pGeo = Math.max(1e-4, Math.min(0.99, expUnionProb));
      const geoVariance = (1 - pGeo) / (pGeo * pGeo);
      const dispersionIndex = intervalVariance / Math.max(1e-4, geoVariance);
      const isPeriodicitySignificant = intervals.length >= 2 && dispersionIndex < 0.75;

      const currentCycleLag = cyclesSinceLastCompleted + 1;
      const gaussianLagResonance = Math.exp(
        -Math.pow(currentCycleLag - meanInterval, 2) / (2 * (intervalVariance + 1.0))
      );
      // Le hazard de renouvellement ne s'élève au-dessus du modèle nul H0 géométrique sans mémoire
      // que si la dispersion des intervalles est statistiquement sous-dispersée (isPeriodicitySignificant).
      const renewalHazard = isPeriodicitySignificant
        ? Math.min(99, 100 * gaussianLagResonance * (0.55 + 0.45 * (regularityIndex / 100)))
        : Math.min(99, 100 * expUnionProb);

      // Répartition par phase et test du Chi-deux d'adéquation contre l'uniforme H0: (1/3, 1/3, 1/3)
      const totalPhases = Math.max(
        Number.EPSILON,
        phaseCounts.early + phaseCounts.mid + phaseCounts.late
      );
      const earlyPct = (phaseCounts.early / totalPhases) * 100;
      const midPct = (phaseCounts.mid / totalPhases) * 100;
      const latePct = (phaseCounts.late / totalPhases) * 100;

      const expectedPhaseCount = totalPhases / 3;
      const phaseChiSquare =
        expectedPhaseCount > 0
          ? (Math.pow(phaseCounts.early - expectedPhaseCount, 2) +
              Math.pow(phaseCounts.mid - expectedPhaseCount, 2) +
              Math.pow(phaseCounts.late - expectedPhaseCount, 2)) /
            expectedPhaseCount
          : 0;
      // Seuil critique Chi-deux (ddl = 2, alpha = 0.10 -> 4.605, alpha = 0.05 -> 5.991)
      const isPhaseSignificant = totalPhases >= 3 && phaseChiSquare >= 4.605;

      let prefPhase: CyclePhase = 'MID';
      if (earlyPct >= midPct && earlyPct >= latePct) prefPhase = 'EARLY';
      else if (latePct >= earlyPct && latePct >= midPct) prefPhase = 'LATE';

      // Alignement de phase continu par produit scalaire contre l'uniforme
      const rawPhaseDot =
        (earlyPct / 100) * activePhaseWeights.early +
        (midPct / 100) * activePhaseWeights.mid +
        (latePct / 100) * activePhaseWeights.late;
      const phaseAlignment = logisticScore100((rawPhaseDot - 1 / 3) * 6.0);

      // Amorçage actif du cycle courant & probabilité exacte H0 combinatoire de complétion
      const activePresent = seq.filter((n) => activeNumberSet.has(n));
      const missing = seq.filter((n) => !activeNumberSet.has(n));

      let activeAlertStatus: RecurringSequencePattern['activeAlertStatus'] = 'DORMANT';
      let completionProb = 0;
      let conditionalCompletionRate = 0;

      if (activePresent.length > 0) {
        let precursorCyclesCount = support;
        if (activePresent.length === 1) {
          precursorCyclesCount = ballCycleCounts[activePresent[0]] || support;
        } else if (activePresent.length === 2) {
          precursorCyclesCount =
            getPairCycleSupport(activePresent[0], activePresent[1]) || support;
        }
        const expMissingProb = computeExactCycleUnionProbability(
          Math.max(1, missing.length),
          remainingDrawsInCycle
        );
        const rawCond =
          (support + bayesPriorScale * expMissingProb) /
          (Math.max(support, precursorCyclesCount) + bayesPriorScale);
        conditionalCompletionRate = Math.min(99, rawCond * 100);
      }

      // Condition de mise en alerte PRIMED :
      // - Une paire (2 boules) n'est PAS déclarée amorcée sur une seule boule sans enrichissement statistique
      // - Un triplet (3 boules) avec 2 boules déjà sorties constitue un précurseur avéré
      const isPrimedEligible =
        seq.length === 2
          ? activePresent.length === 1 && (zScore >= 1.645 || (zScore > 0.5 && pmi >= 0.25))
          : activePresent.length >= 2 ||
            (activePresent.length === 1 && (zScore >= 1.96 || pmi >= 0.35));

      if (activePresent.length === seq.length) {
        activeAlertStatus = 'TRIGGERED';
        completionProb = 100;
        conditionalCompletionRate = 100;
      } else if (isPrimedEligible && missing.length > 0) {
        activeAlertStatus = 'PRIMED';
        // Probabilité exacte H0 de complétion dans les tirages restants
        const expMissingProb = computeExactCycleUnionProbability(
          missing.length,
          remainingDrawsInCycle
        );
        let precursorCount = support;
        if (activePresent.length === 1) {
          precursorCount = ballCycleCounts[activePresent[0]] || support;
        } else if (activePresent.length === 2) {
          precursorCount =
            getPairCycleSupport(activePresent[0], activePresent[1]) || support;
        }

        // Rétraction bayésienne de James-Stein vers la probabilité H0
        const empRate = support / Math.max(1, precursorCount);
        const shrinkageWeight = precursorCount / (precursorCount + 10);
        const shrunkProb = shrinkageWeight * empRate + (1 - shrinkageWeight) * expMissingProb;

        // Probabilité honnête calibrée sur H0 (entre 5% et 25% sur du bruit pur)
        completionProb = Math.min(95.0, Math.max(1.0, shrunkProb * 100));
      }

      // Continuous Monotonic Log-Z + PMI + Simultaneity Confidence [0..100]
      const logZ = (zScore >= 0 ? 1 : -1) * Math.log1p(Math.abs(zScore));
      const confidenceLogit =
        logZ * 0.85 +
        pmi * 0.95 +
        (recencyMomentum - 50) / 45 +
        sameDrawWeight * 1.45;
      const confidence = Math.min(99.5, Math.max(2.0, logisticScore100(confidenceLogit)));

      const zStrengthScore = logisticScore100(
        (Math.log1p(Math.max(0, zScore)) - Math.log1p(2.5)) * 2.2
      );
      const alertReadiness =
        activeAlertStatus === 'PRIMED' ? Math.max(confidence, completionProb) : phaseAlignment;
      const compositeScore = Math.min(
        99.5,
        Math.max(
          1.0,
          0.32 * confidence +
            0.22 * zStrengthScore +
            0.18 * recencyMomentum +
            0.14 * renewalHazard +
            0.14 * alertReadiness
        )
      );

      // Determine dominant driver and generate quantitative French reasoning factors
      let dominantDriver: PatternDominantDriver = 'SYNERGY_PMI';
      if (activeAlertStatus === 'PRIMED' && completionProb >= 55) {
        dominantDriver = 'PRECURSOR_PRIMED';
      } else if (renewalHazard >= 68 && regularityIndex >= 45) {
        dominantDriver = 'PERIODIC_RESONANCE';
      } else if (phaseAlignment >= 65) {
        dominantDriver = 'PHASE_LOCK';
      }

      const factors: string[] = [
        `Synergie intrinsèque PMI = ${pmi >= 0 ? '+' : ''}${pmi.toFixed(2)} bits (Lift ${lift.toFixed(2)}x vs modèle nul d'inclusion-exclusion).`,
      ];
      if (sameDrawCount > 0) {
        factors.push(
          `Co-occurrence simultanée intra-tirage observée ${sameDrawCount} fois dans le même tirage.`
        );
      }
      if (activeAlertStatus === 'PRIMED' && missing.length > 0) {
        factors.push(
          `Précurseur [${activePresent.join(', ')}] actif dans le cycle courant → Taux conditionnel Bayes de complétion vers [${missing.join(', ')}] : ${conditionalCompletionRate.toFixed(1)}%.`
        );
      }
      if (renewalHazard >= 60) {
        factors.push(
          `Tension cyclique de retour élevée (${renewalHazard.toFixed(1)}%) : écart actuel (${currentCycleLag} cyc) proche de la période propre (~${meanInterval.toFixed(1)} cyc).`
        );
      }

      const verdict =
        activeAlertStatus === 'PRIMED'
          ? `Motif amorcé à haute probabilité de complétion (${completionProb.toFixed(1)}%) sur les ${remainingDrawsInCycle} tirage(s) restants du cycle.`
          : renewalHazard >= 65
          ? `Motif périodique en fenêtre de résonance cyclique (retour attendu tous les ~${meanInterval.toFixed(1)} cycles).`
          : `Affinité structurelle multi-cycles validée (Z = ${zScore.toFixed(2)}, Confiance = ${confidence.toFixed(1)}%).`;

      return {
        id,
        type,
        sequence: seq,
        cycleSupport: support,
        totalCycles: numCyclesForStats,
        supportRate: parseFloat(supportRate.toFixed(4)),
        expectedSupportRate: parseFloat(expUnionProb.toFixed(4)),
        lift: parseFloat(lift.toFixed(2)),
        confidence: parseFloat(confidence.toFixed(1)),
        zScore: parseFloat(zScore.toFixed(2)),
        hasEmpiricalProof: zScore >= 2.58 && lift >= 1.15 && (pmi > 0.2 || sameDrawCount >= 2),
        cycleOccurrences: sortedCycles,
        lastSeenCycle: cyclesAgo,
        meanCycleInterval: parseFloat(meanInterval.toFixed(1)),
        cyclePhasePreference: prefPhase,
        phaseDistribution: {
          early: parseFloat(earlyPct.toFixed(1)),
          mid: parseFloat(midPct.toFixed(1)),
          late: parseFloat(latePct.toFixed(1)),
        },
        isPhaseSignificant,
        phaseChiSquare: parseFloat(phaseChiSquare.toFixed(2)),
        isPeriodicitySignificant,
        dispersionIndex: parseFloat(dispersionIndex.toFixed(2)),
        activeAlertStatus,
        completionCandidates: missing,
        completionProbability: parseFloat(completionProb.toFixed(1)),
        entropy: parseFloat(intervalEntropy.toFixed(3)),
        reasoning: {
          compositeScore: parseFloat(compositeScore.toFixed(1)),
          pmi: parseFloat(pmi.toFixed(2)),
          intrinsicSynergyLift: parseFloat(intrinsicSynergyLift.toFixed(2)),
          sameDrawOccurrences: sameDrawCount,
          recencyMomentum: parseFloat(recencyMomentum.toFixed(1)),
          renewalHazard: parseFloat(renewalHazard.toFixed(1)),
          phaseAlignment: parseFloat(phaseAlignment.toFixed(1)),
          conditionalCompletionRate: parseFloat(conditionalCompletionRate.toFixed(1)),
          regularityIndex: parseFloat(regularityIndex.toFixed(1)),
          dominantDriver,
          verdict,
          factors,
        },
      };
    };

    // Évaluer les Paires & Triplets depuis les tampons CSR Rust/WASM
    const pairCountHpc = Math.floor(hpcMining.pairTuples.length / 6);
    const allPairs: RecurringSequencePattern[] = [];
    for (let i = 0; i < pairCountHpc; i++) {
      const off = i * 6;
      const a = hpcMining.pairTuples[off];
      const b = hpcMining.pairTuples[off + 1];
      const sameDrawCnt = hpcMining.pairTuples[off + 2];
      const earlyX2 = hpcMining.pairTuples[off + 3];
      const midX2 = hpcMining.pairTuples[off + 4];
      const lateX2 = hpcMining.pairTuples[off + 5];
      const cStart = hpcMining.pairCycleOffsets[i];
      const cEnd = hpcMining.pairCycleOffsets[i + 1];
      const cycleIndices = Array.from(hpcMining.pairCycleIndicesFlat.subarray(cStart, cEnd));

      allPairs.push(
        evaluatePattern(
          `pair_${a}_${b}`,
          'PAIR',
          [a, b],
          cycleIndices,
          expPairCycleProb,
          expPairSameDrawCycleProb,
          sameDrawCnt,
          { early: earlyX2 / 2, mid: midX2 / 2, late: lateX2 / 2 }
        )
      );
    }

    const topRecurringPairs = allPairs
      .sort((a, b) => (b.reasoning?.compositeScore ?? b.confidence) - (a.reasoning?.compositeScore ?? a.confidence))
      .slice(0, maxPerCat);

    const tripletCountHpc = Math.floor(hpcMining.tripletTuples.length / 7);
    const allTriplets: RecurringSequencePattern[] = [];
    for (let i = 0; i < tripletCountHpc; i++) {
      const off = i * 7;
      const a = hpcMining.tripletTuples[off];
      const b = hpcMining.tripletTuples[off + 1];
      const c = hpcMining.tripletTuples[off + 2];
      const sameDrawCnt = hpcMining.tripletTuples[off + 3];
      const earlyX3 = hpcMining.tripletTuples[off + 4];
      const midX3 = hpcMining.tripletTuples[off + 5];
      const lateX3 = hpcMining.tripletTuples[off + 6];
      const cStart = hpcMining.tripletCycleOffsets[i];
      const cEnd = hpcMining.tripletCycleOffsets[i + 1];
      const cycleIndices = Array.from(hpcMining.tripletCycleIndicesFlat.subarray(cStart, cEnd));

      allTriplets.push(
        evaluatePattern(
          `triplet_${a}_${b}_${c}`,
          'TRIPLET',
          [a, b, c],
          cycleIndices,
          expTripletCycleProb,
          expTripletSameDrawCycleProb,
          sameDrawCnt,
          { early: earlyX3 / 3, mid: midX3 / 3, late: lateX3 / 3 }
        )
      );
    }

    const topRecurringTriplets = allTriplets
      .sort((a, b) => (b.reasoning?.compositeScore ?? b.confidence) - (a.reasoning?.compositeScore ?? a.confidence))
      .slice(0, maxPerCat);

    // 6. Construire les Chaînes de Transitions Markov inter-cycles extraites par Rust/WASM
    const topCrossCycleTransitions: RecurringSequencePattern[] = [];
    const transCountHpc = Math.floor(hpcMining.transitionTuples.length / 5);

    for (let i = 0; i < transCountHpc; i++) {
      const off = i * 5;
      const source = hpcMining.transitionTuples[off];
      const target = hpcMining.transitionTuples[off + 1];
      const earlyCnt = hpcMining.transitionTuples[off + 2];
      const midCnt = hpcMining.transitionTuples[off + 3];
      const lateCnt = hpcMining.transitionTuples[off + 4];
      const cStart = hpcMining.transitionCycleOffsets[i];
      const cEnd = hpcMining.transitionCycleOffsets[i + 1];
      const transitionCycles = Array.from(
        hpcMining.transitionCycleIndicesFlat.subarray(cStart, cEnd)
      );
      const entry = {
        source,
        target,
        transitionCycles,
        targetPhaseCounts: { early: earlyCnt, mid: midCnt, late: lateCnt },
      };
      const key = `${source}->${target}`;

      const transitions = entry.transitionCycles.length;
      const srcTotal = Math.max(1, sourceBallCounts[entry.source] || 1);
      const targetMarginalProb = smoothedBallCycleProb[entry.target] || expSingleCycleProb;

      // Empirical Bayes smoothed Markov transition probability P(target in C+1 | source in C)
      const smoothedTransProb =
        (transitions + bayesPriorScale * targetMarginalProb) / (srcTotal + bayesPriorScale);
      const rawTransProb = transitions / srcTotal;
      const lift = targetMarginalProb > 0 ? smoothedTransProb / targetMarginalProb : 1.0;

      const minTrans = Math.max(2, Math.floor(srcTotal * targetMarginalProb * 1.15));
      if (transitions >= minTrans && lift > 1.08) {
        const stdErr = Math.sqrt(
          Math.max(1e-6, (targetMarginalProb * (1 - targetMarginalProb)) / srcTotal)
        );
        const zScore = (rawTransProb - targetMarginalProb) / stdErr;
        const pmi = Math.log2(Math.max(1e-6, lift));

        // Real interval & entropy calculation for transition occurrences
        const sortedTransCycles = [...entry.transitionCycles].sort((a, b) => a - b);
        const intervals: number[] = [];
        for (let k = 1; k < sortedTransCycles.length; k++) {
          intervals.push(sortedTransCycles[k] - sortedTransCycles[k - 1]);
        }
        const meanInterval =
          intervals.length > 0
            ? intervals.reduce((acc, v) => acc + v, 0) / intervals.length
            : numCyclesForStats / Math.max(1, transitions);

        let transEntropy = 0;
        if (intervals.length > 0) {
          const intFreq: Record<number, number> = {};
          intervals.forEach((iv) => {
            intFreq[iv] = (intFreq[iv] || 0) + 1;
          });
          Object.values(intFreq).forEach((cnt) => {
            const p = cnt / intervals.length;
            if (p > 0) transEntropy -= p * Math.log2(p);
          });
          transEntropy /= Math.max(1, Math.log2(Math.max(2, Object.keys(intFreq).length)));
        }

        // Real target phase distribution in cycle C+1
        const totalPhases = Math.max(
          Number.EPSILON,
          entry.targetPhaseCounts.early +
            entry.targetPhaseCounts.mid +
            entry.targetPhaseCounts.late
        );
        const earlyPct = (entry.targetPhaseCounts.early / totalPhases) * 100;
        const midPct = (entry.targetPhaseCounts.mid / totalPhases) * 100;
        const latePct = (entry.targetPhaseCounts.late / totalPhases) * 100;

        let prefPhase: CyclePhase = 'MID';
        if (earlyPct >= midPct && earlyPct >= latePct) prefPhase = 'EARLY';
        else if (latePct >= earlyPct && latePct >= midPct) prefPhase = 'LATE';

        const rawPhaseDot =
          (earlyPct / 100) * activePhaseWeights.early +
          (midPct / 100) * activePhaseWeights.mid +
          (latePct / 100) * activePhaseWeights.late;
        const phaseAlignment = logisticScore100((rawPhaseDot - 1 / 3) * 6.0);

        const isSourceInLastCompleted = lastCompletedNumbers.has(entry.source);
        const isSourceInActiveCycle = activeNumberSet.has(entry.source);
        const isTargetInActiveCycle = activeNumberSet.has(entry.target);

        const hasTransProof = zScore >= 2.33 && pmi > 0.2;
        const isPrimedForCurrentCycle =
          (isSourceInLastCompleted || isSourceInActiveCycle) &&
          !isTargetInActiveCycle &&
          (zScore >= 1.96 || hasTransProof || pmi >= 0.35);
        const activeAlertStatus: RecurringSequencePattern['activeAlertStatus'] =
          isPrimedForCurrentCycle
            ? 'PRIMED'
            : (isSourceInLastCompleted || isSourceInActiveCycle) && isTargetInActiveCycle
            ? 'TRIGGERED'
            : 'DORMANT';

        const zProofProb = normalCdf(zScore);
        const transConf = Math.min(
          98.5,
          Math.max(5.0, logisticScore100((zProofProb - 0.5) * 3.2 + pmi * 1.1))
        );
        // Probabilité exacte combinatoire H0 de sortie de la cible dans les tirages restants
        const expTargetRemainingProb = computeExactCycleUnionProbability(
          1,
          remainingDrawsInCycle
        );
        const empTransRate = srcTotal > 0 ? transitions / srcTotal : targetMarginalProb;
        const shrinkageTr = srcTotal / (srcTotal + 10);
        const shrunkTransRate =
          shrinkageTr * empTransRate + (1 - shrinkageTr) * expTargetRemainingProb;
        const completionProb = isPrimedForCurrentCycle
          ? Math.min(95.0, Math.max(1.0, shrunkTransRate * 100))
          : activeAlertStatus === 'TRIGGERED'
          ? 100
          : 0;

        const lastCycleSeen =
          sortedTransCycles.length > 0
            ? Math.max(0, numCyclesForStats - 1 - sortedTransCycles[sortedTransCycles.length - 1])
            : 1;

        // Hazard de renouvellement RÉEL : résonance gaussienne sur les intervalles mesurés
        // (≥ 2), sinon H0 géométrique sans mémoire (probabilité attendue de la transition
        // par cycle). Ne jamais exposer phaseAlignment sous l'étiquette renewalHazard.
        const expectedTransCycleProb =
          smoothedBallCycleProb[entry.source] * targetMarginalProb;
        const transIntervalVariance =
          intervals.length > 1
            ? intervals.reduce((acc, iv) => acc + Math.pow(iv - meanInterval, 2), 0) /
              intervals.length
            : 0;
        const transRegularity = (1 - Math.min(1, transEntropy)) * 100;
        const transRenewalHazard =
          intervals.length >= 2
            ? Math.min(
                99,
                100 *
                  Math.exp(
                    -Math.pow(lastCycleSeen + 1 - meanInterval, 2) /
                      (2 * (transIntervalVariance + 1.0))
                  ) *
                  (0.55 + 0.45 * (transRegularity / 100))
              )
            : Math.min(99, 100 * expectedTransCycleProb);

        // Momentum de récence réel (décroissance exponentielle de Hawking vs attente H0)
        const transRecencyWeightedSum = sortedTransCycles.reduce(
          (acc, cIdx) => acc + Math.exp(-(numCyclesForStats - 1 - cIdx) / hawkingTau),
          0
        );
        const transRecencyMomentum = logisticScore100(
          transRecencyWeightedSum /
            Math.max(1e-6, totalRecencyWeightNorm * expectedTransCycleProb) -
            1.0
        );

        const compositeScore = Math.min(
          99.0,
          0.45 * transConf +
            0.25 * phaseAlignment +
            0.3 * (isPrimedForCurrentCycle ? completionProb : transConf * 0.8)
        );

        topCrossCycleTransitions.push({
          id: `trans_${key}`,
          type: 'TRANSITION_CHAIN',
          sequence: [entry.source],
          targetSequence: [entry.target],
          cycleSupport: transitions,
          totalCycles: Math.max(1, numCyclesForStats - 1),
          supportRate: parseFloat((transitions / Math.max(1, numCyclesForStats - 1)).toFixed(4)),
          expectedSupportRate: parseFloat(
            (smoothedBallCycleProb[entry.source] * targetMarginalProb).toFixed(4)
          ),
          lift: parseFloat(lift.toFixed(2)),
          confidence: parseFloat(transConf.toFixed(1)),
          zScore: parseFloat(zScore.toFixed(2)),
          hasEmpiricalProof: zScore >= Z_GAUSS_90 || (zScore > 0.6 && pmi > 0.35),
          cycleOccurrences: sortedTransCycles,
          lastSeenCycle: isTargetInActiveCycle ? 0 : lastCycleSeen,
          meanCycleInterval: parseFloat(meanInterval.toFixed(1)),
          cyclePhasePreference: prefPhase,
          phaseDistribution: {
            early: parseFloat(earlyPct.toFixed(1)),
            mid: parseFloat(midPct.toFixed(1)),
            late: parseFloat(latePct.toFixed(1)),
          },
          transitionConfidence: parseFloat((smoothedTransProb * 100).toFixed(1)),
          activeAlertStatus,
          completionCandidates: isPrimedForCurrentCycle ? [entry.target] : [],
          completionProbability: parseFloat(completionProb.toFixed(1)),
          entropy: parseFloat(transEntropy.toFixed(3)),
          reasoning: {
            compositeScore: parseFloat(compositeScore.toFixed(1)),
            pmi: parseFloat(pmi.toFixed(2)),
            intrinsicSynergyLift: parseFloat(lift.toFixed(2)),
            sameDrawOccurrences: 0,
            recencyMomentum: parseFloat(transRecencyMomentum.toFixed(1)),
            renewalHazard: parseFloat(transRenewalHazard.toFixed(1)),
            phaseAlignment: parseFloat(phaseAlignment.toFixed(1)),
            conditionalCompletionRate: parseFloat((smoothedTransProb * 100).toFixed(1)),
            regularityIndex: parseFloat(transRegularity.toFixed(1)),
            dominantDriver: 'MARKOV_TRANSITION',
            verdict: isPrimedForCurrentCycle
              ? `Chaîne Markovienne [${entry.source} ➔ ${entry.target}] activée (P(B|A) = ${(smoothedTransProb * 100).toFixed(1)}%, Lift ${lift.toFixed(2)}x).`
              : `Transition inter-cycles récurrente de ${entry.source} vers ${entry.target} (${transitions}/${srcTotal} cycles sources).`,
            factors: [
              `Probabilité conditionnelle lissée P(${entry.target} ∈ C+1 | ${entry.source} ∈ C) = ${(smoothedTransProb * 100).toFixed(1)}% (${transitions} transitions sur ${srcTotal} apparitions sources).`,
              `Gain informationnel PMI = +${pmi.toFixed(2)} bits (Z = +${zScore.toFixed(2)}).`,
              `Phase préférentielle d'impact de la cible ${entry.target} : ${prefPhase === 'EARLY' ? 'Début' : prefPhase === 'MID' ? 'Milieu' : 'Clôture'} (${Math.max(earlyPct, midPct, latePct).toFixed(0)}%).`,
            ],
          },
        });
      }
    }

    // Correction de Benjamini-Hochberg (FDR) sur l'univers COMPLET des hypothèses testées
    // (toutes les C(90,2) paires + triplets candidats + transitions N*(N-1)),
    // afin d'éviter le biais de sélection post-filtrage sur du bruit i.i.d.
    const pValueFamily: Record<string, number> = {};
    allPairs.forEach((p) => {
      pValueFamily[p.id] = Math.max(1e-15, 2 * (1 - normalCdf(Math.abs(p.zScore))));
    });
    allTriplets.forEach((t) => {
      pValueFamily[t.id] = Math.max(1e-15, 2 * (1 - normalCdf(Math.abs(t.zScore))));
    });
    topCrossCycleTransitions.forEach((tr) => {
      pValueFamily[tr.id] = Math.max(1e-15, 2 * (1 - normalCdf(Math.abs(tr.zScore))));
    });

    const totalHypothesesPairs = (TOTAL_BALLS * (TOTAL_BALLS - 1)) / 2;
    const totalHypothesesTriplets = Math.max(
      allTriplets.length,
      combinations(TOTAL_BALLS, 3)
    );
    const totalHypothesesTransitions =
      options.includeTransitions !== false ? TOTAL_BALLS * (TOTAL_BALLS - 1) : 0;
    const totalFamilySize = Math.max(
      Object.keys(pValueFamily).length,
      totalHypothesesPairs + totalHypothesesTriplets + totalHypothesesTransitions
    );

    const rawBhQ = benjaminiHochberg(pValueFamily);
    const testedCount = Math.max(1, Object.keys(pValueFamily).length);
    const familyScale = totalFamilySize / testedCount;
    const qValues: Record<string, number> = {};
    const unclampedQValues: Record<string, number> = {};
    Object.entries(rawBhQ).forEach(([id, qVal]) => {
      const scaledQ = qVal * familyScale;
      unclampedQValues[id] = scaledQ;
      qValues[id] = Math.min(1.0, scaledQ);
    });

    // Rétraction continue Empirical-Bayes issue de la famille BH complète (0 nombre magique)
    const getFdrCredibility = (id: string): number => {
      const qUnc = unclampedQValues[id];
      if (qUnc === undefined || !Number.isFinite(qUnc)) return 0;
      return 1 / (1 + Math.max(0, qUnc));
    };

    allPairs.forEach((p) => {
      p.hasEmpiricalProof = (qValues[p.id] ?? 1.0) <= 0.05 && p.lift > 1.05 && p.zScore > 0;
    });
    allTriplets.forEach((t) => {
      t.hasEmpiricalProof = (qValues[t.id] ?? 1.0) <= 0.05 && t.lift > 1.05 && t.zScore > 0;
    });
    topCrossCycleTransitions.forEach((tr) => {
      tr.hasEmpiricalProof = (qValues[tr.id] ?? 1.0) <= 0.05 && tr.lift > 1.05 && tr.zScore > 0;
    });

    topCrossCycleTransitions.sort(
      (a, b) =>
        (b.reasoning?.compositeScore ?? b.confidence) -
        (a.reasoning?.compositeScore ?? a.confidence)
    );
    const prunedTransitions = topCrossCycleTransitions.slice(0, maxPerCat);

    // 7. Phase-Specific Motifs (Motifs à préférence de phase statistiquement significative par Chi-deux)
    const topPhaseMotifs = [...allPairs, ...allTriplets]
      .filter((p) => p.isPhaseSignificant || (p.phaseChiSquare ?? 0) >= 4.605)
      .sort(
        (a, b) =>
          (b.phaseChiSquare ?? 0) * (b.reasoning?.phaseAlignment ?? 50) -
          (a.phaseChiSquare ?? 0) * (a.reasoning?.phaseAlignment ?? 50)
      )
      .slice(0, maxPerCat);

    // 8. Periodic Resonance Patterns (Motifs sous-dispersés démontrant une régularité périodique vs H0 géométrique)
    const topPeriodicResonancePatterns = [...allPairs, ...allTriplets]
      .filter(
        (p) =>
          (p.isPeriodicitySignificant || (p.dispersionIndex !== undefined && p.dispersionIndex < 0.80)) &&
          (p.reasoning?.renewalHazard ?? 0) >= 25 &&
          p.activeAlertStatus !== 'TRIGGERED'
      )
      .sort(
        (a, b) =>
          (b.reasoning?.renewalHazard ?? 0) * (b.reasoning?.regularityIndex ?? 50) -
          (a.reasoning?.renewalHazard ?? 0) * (a.reasoning?.regularityIndex ?? 50)
      )
      .slice(0, maxPerCat);

    // 9. Active Primed Patterns (Alerts for current & upcoming draws)
    const activePrimed = [
      ...topRecurringPairs.filter((p) => p.activeAlertStatus === 'PRIMED'),
      ...topRecurringTriplets.filter((p) => p.activeAlertStatus === 'PRIMED'),
      ...prunedTransitions.filter((p) => p.activeAlertStatus === 'PRIMED'),
    ].sort(
      (a, b) =>
        (b.completionProbability || 0) * (b.reasoning?.compositeScore || 50) -
        (a.completionProbability || 0) * (a.reasoning?.compositeScore || 50)
    );

    // 10. Agrégation Multi-Motifs Homogène par la Méthode de Stouffer (5 canaux Z-scores sous H0)
    const ballEvidence = Array.from({ length: TOTAL_BALLS + 1 }, (_, n) => ({
      number: n,
      primedZChannels: [] as Array<{ z: number; weight: number }>,
      transitionZChannels: [] as Array<{ z: number; weight: number }>,
      periodicZChannels: [] as Array<{ z: number; weight: number }>,
      phaseZChannels: [] as Array<{ z: number; weight: number }>,
      primedMotifsCount: 0,
      transitionDriversCount: 0,
      periodicMotifsCount: 0,
      sameDrawSynergyCount: 0,
      partnerWeights: new Map<number, number>(),
      supportingPatterns: [] as Array<{ label: string; weight: number; id: string }>,
      coveredPatternIds: new Set<string>(),
    }));

    const highPrecisionMotifs = Array.from(
      new Map(
        [
          ...topRecurringPairs,
          ...topRecurringTriplets,
          ...topPeriodicResonancePatterns,
          ...activePrimed,
        ].map((m) => [m.id, m])
      ).values()
    );

    // Constante exacte de variance multinomiale de phase sous H0 uniforme (1/3, 1/3, 1/3)
    const phaseWeightSqSum =
      activePhaseWeights.early * activePhaseWeights.early +
      activePhaseWeights.mid * activePhaseWeights.mid +
      activePhaseWeights.late * activePhaseWeights.late;
    const phaseUnitVarH0 = Math.max(1e-6, phaseWeightSqSum / 3 - 1 / 9);

    const computeMotifPhaseZ = (pat: RecurringSequencePattern): number => {
      const nObs = Math.max(1, pat.cycleSupport);
      const pDot =
        (pat.phaseDistribution.early / 100) * activePhaseWeights.early +
        (pat.phaseDistribution.mid / 100) * activePhaseWeights.mid +
        (pat.phaseDistribution.late / 100) * activePhaseWeights.late;
      const se = Math.sqrt(phaseUnitVarH0 / nObs);
      const rawZ = se > 0 ? (pDot - 1 / 3) / se : 0;
      const cred = nObs / (nObs + bayesPriorScale);
      return cred * rawZ;
    };

    // Moyenne pondérée intra-canal pour combiner des motifs corrélés sur la même boule sans inflation √m
    const combineCorrelatedChannelZScores = (
      items: Array<{ z: number; weight: number }>
    ): number => {
      let weightedSum = 0;
      let weightTotal = 0;
      for (const item of items) {
        if (!Number.isFinite(item.z) || !Number.isFinite(item.weight) || item.weight <= 0) {
          continue;
        }
        weightedSum += item.weight * item.z;
        weightTotal += item.weight;
      }
      return weightTotal > 0 ? weightedSum / weightTotal : 0;
    };

    highPrecisionMotifs.forEach((pat) => {
      if (pat.type === 'TRANSITION_CHAIN') return;
      const sameDrawCnt = pat.reasoning?.sameDrawOccurrences ?? 0;
      const orderWeight = Math.sqrt(Math.max(1, pat.sequence.length - 1));
      const fdrCred = getFdrCredibility(pat.id);
      const zMotifAdj = fdrCred * pat.zScore;
      const motifPhaseZ = computeMotifPhaseZ(pat);

      if (pat.activeAlertStatus === 'PRIMED' && pat.completionCandidates) {
        // Canal A : Z-score du motif pondéré par FDR + excès conditionnel exact sur cycle complet vs H0
        const presentNums = pat.sequence.filter((x) => activeNumberSet.has(x));
        let precursorCount = pat.cycleSupport;
        if (presentNums.length === 1) {
          precursorCount = ballCycleCounts[presentNums[0]] || pat.cycleSupport;
        } else if (presentNums.length === 2) {
          precursorCount =
            getPairCycleSupport(presentNums[0], presentNums[1]) || pat.cycleSupport;
        }

        // pat.cycleSupport est compté sur le cycle complet de longueur cycleLength :
        // sa probabilité nulle conditionnelle exacte sachant le précurseur est E[motif] / E[précurseur].
        const expPrecursorRate = presentNums.length >= 2 ? expPairCycleProb : expSingleCycleProb;
        const p0FullComp = Math.min(
          0.99,
          Math.max(1e-6, pat.expectedSupportRate / Math.max(1e-6, expPrecursorRate))
        );
        let zComp = 0;
        if (precursorCount > 0) {
          const rawZComp = computeBinomialUpperTailZScore(
            pat.cycleSupport,
            precursorCount,
            p0FullComp
          );
          zComp =
            fdrCred * (precursorCount / (precursorCount + bayesPriorScale)) * rawZComp;
        }
        const motifPrimedZ = combineCorrelatedChannelZScores([
          { z: zMotifAdj, weight: 1 },
          { z: zComp, weight: precursorCount > 0 ? 1 : 0 },
        ]);

        pat.completionCandidates.forEach((cand) => {
          const ev = ballEvidence[cand];
          ev.primedZChannels.push({ z: motifPrimedZ, weight: orderWeight });
          ev.phaseZChannels.push({ z: motifPhaseZ, weight: 1 });
          ev.primedMotifsCount++;
          ev.sameDrawSynergyCount += sameDrawCnt;
          ev.coveredPatternIds.add(pat.id);
          ev.supportingPatterns.push({
            id: pat.id,
            label: `${pat.type === 'PAIR' ? 'Paire' : 'Triplet'} amorcé [${pat.sequence.join('-')}] (Z=${motifPrimedZ >= 0 ? '+' : ''}${motifPrimedZ.toFixed(2)}σ, ${pat.completionProbability}%)`,
            weight: motifPrimedZ,
          });
          pat.sequence.forEach((other) => {
            if (other !== cand) {
              ev.partnerWeights.set(
                other,
                (ev.partnerWeights.get(other) || 0) + Math.max(0, motifPrimedZ)
              );
            }
          });
        });
      }

      // Canal C : Résonance périodique sous-dispersée en fenêtre de retour (ajustée FDR)
      const isPeriodicCandidate =
        (pat.isPeriodicitySignificant ||
          (pat.dispersionIndex !== undefined && pat.dispersionIndex < 0.75)) &&
        pat.activeAlertStatus !== 'TRIGGERED';
      if (isPeriodicCandidate) {
        const intervalsCount = Math.max(0, pat.cycleOccurrences.length - 1);
        const dispIdx = pat.dispersionIndex ?? 1.0;
        const lagResonance = Math.min(1, Math.max(0, (pat.reasoning?.renewalHazard ?? 0) / 100));
        const zUnderDisp =
          intervalsCount >= 2
            ? ((intervalsCount - 1) * (1 - dispIdx)) /
              Math.sqrt(Math.max(1e-6, 2 * (intervalsCount - 1)))
            : 0;
        const motifPeriodicZ = combineCorrelatedChannelZScores([
          { z: zMotifAdj, weight: 1 },
          { z: zUnderDisp * lagResonance * fdrCred, weight: intervalsCount >= 2 ? 1 : 0 },
        ]);

        pat.sequence.forEach((n) => {
          if (activeNumberSet.has(n)) return;
          const ev = ballEvidence[n];
          ev.periodicZChannels.push({ z: motifPeriodicZ, weight: orderWeight });
          ev.phaseZChannels.push({ z: motifPhaseZ, weight: 1 });
          ev.periodicMotifsCount++;
          ev.coveredPatternIds.add(pat.id);
          ev.supportingPatterns.push({
            id: pat.id,
            label: `Résonance cyclique [${pat.sequence.join('-')}] (~${pat.meanCycleInterval} cyc, Z=${motifPeriodicZ >= 0 ? '+' : ''}${motifPeriodicZ.toFixed(2)}σ)`,
            weight: motifPeriodicZ,
          });
          pat.sequence.forEach((other) => {
            if (other !== n) {
              ev.partnerWeights.set(
                other,
                (ev.partnerWeights.get(other) || 0) + Math.max(0, motifPeriodicZ)
              );
            }
          });
        });
      }

      // Motifs structurels généraux (cohésion multi-cycles & phase) pour boules non encore tirées
      if (pat.zScore > 0 && pat.activeAlertStatus !== 'TRIGGERED') {
        pat.sequence.forEach((n) => {
          if (activeNumberSet.has(n)) return;
          const ev = ballEvidence[n];
          ev.phaseZChannels.push({ z: motifPhaseZ, weight: 1 });
          ev.coveredPatternIds.add(pat.id);
          pat.sequence.forEach((other) => {
            if (other !== n) {
              ev.partnerWeights.set(
                other,
                (ev.partnerWeights.get(other) || 0) + Math.max(0, zMotifAdj) * 0.5
              );
            }
          });
        });
      }
    });

    // Canal B : Transitions Markoviennes inter-cycles actives (ajustées FDR)
    prunedTransitions.forEach((tr) => {
      if (tr.activeAlertStatus === 'PRIMED' && tr.completionCandidates?.[0]) {
        const target = tr.completionCandidates[0];
        const source = tr.sequence[0];
        const ev = ballEvidence[target];
        const srcTotal = Math.max(1, sourceBallCounts[source] || 1);
        const credTr = srcTotal / (srcTotal + bayesPriorScale);
        const fdrCredTr = getFdrCredibility(tr.id);
        const zTr = fdrCredTr * credTr * tr.zScore;
        const trPhaseZ = computeMotifPhaseZ(tr);

        ev.transitionZChannels.push({ z: zTr, weight: 1 });
        ev.phaseZChannels.push({ z: trPhaseZ, weight: 1 });
        ev.transitionDriversCount++;
        ev.coveredPatternIds.add(tr.id);
        ev.supportingPatterns.push({
          id: tr.id,
          label: `Transition ${source} ➔ ${target} (Z=${zTr >= 0 ? '+' : ''}${zTr.toFixed(2)}σ, ${tr.transitionConfidence}%)`,
          weight: zTr,
        });
        ev.partnerWeights.set(source, (ev.partnerWeights.get(source) || 0) + Math.max(0, zTr));
      }
    });

    // Canal E : Synergie simultanée intra-tirage avec les numéros déjà actifs (modèle nul hypergéométrique exact 5/90)
    const pPairSameDrawSingle =
      (BALLS_PER_DRAW * (BALLS_PER_DRAW - 1)) / (TOTAL_BALLS * (TOTAL_BALLS - 1)); // 20/8010 = 2/801

    const candidateRankings: PatternCandidateSelection[] = [];
    for (let n = 1; n <= TOTAL_BALLS; n++) {
      const ev = ballEvidence[n];
      const hasMotifEvidence =
        ev.primedZChannels.length > 0 ||
        ev.transitionZChannels.length > 0 ||
        ev.periodicZChannels.length > 0 ||
        ev.coveredPatternIds.size > 0;
      if (!hasMotifEvidence) continue;

      const activePartnersExcludingSelf = activeCycleNumbers.filter((a) => a !== n);
      let activeSameDrawHits = 0;
      for (const a of activePartnersExcludingSelf) {
        activeSameDrawHits += getSameDrawPairCount(n, a);
      }

      const lambdaSynergy =
        completedDrawsCount * activePartnersExcludingSelf.length * pPairSameDrawSingle;
      let zSynergy = 0;
      const hasSynergyChannel = lambdaSynergy > 0;
      if (hasSynergyChannel) {
        const rawZSyn = computePoissonUpperTailZScore(activeSameDrawHits, lambdaSynergy);
        const synCred =
          completedDrawsCount / (completedDrawsCount + cycleLength * bayesPriorScale);
        zSynergy = synCred * rawZSyn;
      }

      const zPrimed =
        ev.primedZChannels.length > 0
          ? combineCorrelatedChannelZScores(ev.primedZChannels)
          : 0;
      const zTransition =
        ev.transitionZChannels.length > 0
          ? combineCorrelatedChannelZScores(ev.transitionZChannels)
          : 0;
      const zPeriodic =
        ev.periodicZChannels.length > 0
          ? combineCorrelatedChannelZScores(ev.periodicZChannels)
          : 0;
      const zPhase =
        ev.phaseZChannels.length > 0
          ? combineCorrelatedChannelZScores(ev.phaseZChannels)
          : 0;

      const stouffer = combinePatternStoufferZScores([
        { z: zPrimed, weight: ev.primedZChannels.length > 0 ? 1 : 0 },
        { z: zTransition, weight: ev.transitionZChannels.length > 0 ? 1 : 0 },
        { z: zPeriodic, weight: ev.periodicZChannels.length > 0 ? 1 : 0 },
        { z: zPhase, weight: ev.phaseZChannels.length > 0 ? 1 : 0 },
        { z: zSynergy, weight: hasSynergyChannel ? 1 : 0 },
      ]);

      const stoufferZScore = Number(stouffer.zScore.toFixed(4));
      const stoufferPValue = Number(stouffer.pValue.toFixed(6));
      const convergenceScore = Number((normalCdf(stouffer.zScore) * 100).toFixed(1));
      const phaseAffinityScore = Number((normalCdf(zPhase) * 100).toFixed(1));

      const topPartners = Array.from(ev.partnerWeights.entries())
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, 4)
        .map(([partner]) => partner);

      const uniqueSupporting = Array.from(
        new Map(
          ev.supportingPatterns
            .sort((a, b) => b.weight - a.weight)
            .map((item) => [item.label, item])
        ).values()
      )
        .slice(0, 3)
        .map((item) => item.label);

      // Rôle analytique dominant déterminé par les Z-scores des canaux (zéro seuil arbitraire)
      let selectionRole: CandidateSelectionRole = 'RESONANCE_CYCLIQUE';
      if (ev.primedMotifsCount >= 1 && ev.transitionDriversCount >= 1) {
        selectionRole = 'PIVOT_CONVERGENT';
      } else if (
        ev.primedMotifsCount >= 1 &&
        zPrimed >= Math.max(zTransition, zPeriodic)
      ) {
        selectionRole = 'COMPLETION_PRIMED';
      } else if (ev.transitionDriversCount >= 1 && zTransition >= zPeriodic) {
        selectionRole = 'TRANSITION_CIBLE';
      }

      const zSign = stoufferZScore >= 0 ? '+' : '';
      const reasoningSummary =
        selectionRole === 'PIVOT_CONVERGENT'
          ? `Convergence Stouffer Z=${zSign}${stoufferZScore.toFixed(2)}σ : ${ev.primedMotifsCount} motif(s) amorcé(s) + ${ev.transitionDriversCount} transition(s) Markov.`
          : selectionRole === 'COMPLETION_PRIMED'
          ? `Complétion amorcée (Z=${zSign}${stoufferZScore.toFixed(2)}σ, Z_primed=${zPrimed.toFixed(2)}σ) sur ${ev.primedMotifsCount} motif(s) actif(s).`
          : selectionRole === 'TRANSITION_CIBLE'
          ? `Cible Markov (Z=${zSign}${stoufferZScore.toFixed(2)}σ, Z_trans=${zTransition.toFixed(2)}σ) sur ${ev.transitionDriversCount} chaîne(s).`
          : `Résonance cyclique (Z=${zSign}${stoufferZScore.toFixed(2)}σ, Z_per=${zPeriodic.toFixed(2)}σ, Z_syn=${zSynergy.toFixed(2)}σ).`;

      candidateRankings.push({
        number: n,
        convergenceScore,
        stoufferZScore,
        stoufferPValue,
        channelZScores: {
          zPrimed: Number(zPrimed.toFixed(4)),
          zTransition: Number(zTransition.toFixed(4)),
          zPeriodic: Number(zPeriodic.toFixed(4)),
          zPhase: Number(zPhase.toFixed(4)),
          zSynergy: Number(zSynergy.toFixed(4)),
          activeChannels: stouffer.activeChannels,
        },
        primedMotifsCount: ev.primedMotifsCount,
        transitionDriversCount: ev.transitionDriversCount,
        periodicMotifsCount: ev.periodicMotifsCount,
        sameDrawSynergyCount: ev.sameDrawSynergyCount + activeSameDrawHits,
        phaseAffinityScore,
        synergyPartners: topPartners,
        supportingPatterns: uniqueSupporting,
        selectionRole,
        reasoningSummary,
      });
    }

    candidateRankings.sort(
      (a, b) =>
        (b.stoufferZScore ?? 0) - (a.stoufferZScore ?? 0) ||
        b.convergenceScore - a.convergenceScore ||
        a.number - b.number
    );

    // 11. Synthèse Sous-Modulaire en Espace Z (5 Gagnants + 2 Réserves)
    // Toutes les grandeurs (base Stouffer, couverture marginale, synergie de paires, diversité dizaines)
    // sont exprimées en unités homogènes d'écarts-types σ.
    const selectedSeven: number[] = [];
    const coveredPatternsGlobal = new Set<string>();
    const candidatePool = candidateRankings.slice(0, 30);
    const diversityScaleSigma = 1 / Math.sqrt(BALLS_PER_DRAW);

    // Filet de sécurité déterministe si moins de 7 boules ont un motif actif
    if (candidatePool.length < 7) {
      const existingNums = new Set(candidatePool.map((c) => c.number));
      const fallbackBalls = Array.from({ length: TOTAL_BALLS }, (_, i) => i + 1)
        .filter((n) => !existingNums.has(n))
        .map((n) => {
          const zFreq = computeBinomialUpperTailZScore(
            ballCycleCounts[n] || 0,
            numCyclesForStats,
            expSingleCycleProb
          );
          const credFreq =
            numCyclesForStats / (numCyclesForStats + bayesPriorScale);
          const zVal = Number((credFreq * zFreq).toFixed(4));
          return {
            number: n,
            convergenceScore: Number((normalCdf(zVal) * 100).toFixed(1)),
            stoufferZScore: zVal,
            stoufferPValue: Number(patternNormalUpperPValue(zVal).toFixed(6)),
            channelZScores: {
              zPrimed: 0,
              zTransition: 0,
              zPeriodic: 0,
              zPhase: 0,
              zSynergy: zVal,
              activeChannels: 1,
            },
            primedMotifsCount: 0,
            transitionDriversCount: 0,
            periodicMotifsCount: 0,
            sameDrawSynergyCount: 0,
            phaseAffinityScore: 50,
            synergyPartners: [],
            supportingPatterns: [],
            selectionRole: 'RESONANCE_CYCLIQUE' as CandidateSelectionRole,
            reasoningSummary: `Fréquence cyclique de repli (Z=${zVal >= 0 ? '+' : ''}${zVal.toFixed(2)}σ).`,
          };
        })
        .sort((a, b) => (b.stoufferZScore ?? 0) - (a.stoufferZScore ?? 0) || a.number - b.number);

      for (const fb of fallbackBalls) {
        if (candidatePool.length >= 7) break;
        candidatePool.push(fb);
      }
    }

    while (selectedSeven.length < 7 && selectedSeven.length < candidatePool.length) {
      let bestCandidate: PatternCandidateSelection | null = null;
      let bestMarginalUtility = -Infinity;

      for (const cand of candidatePool) {
        if (selectedSeven.includes(cand.number)) continue;
        const ev = ballEvidence[cand.number];

        // 1. Score homogène de Stouffer (en σ)
        const baseZ = cand.stoufferZScore ?? 0;

        // 2. Gain marginal de couverture de motifs (adimensionnel mis à l'échelle 1/√5 σ)
        let newPatternsCovered = 0;
        ev.coveredPatternIds.forEach((pid) => {
          if (!coveredPatternsGlobal.has(pid)) newPatternsCovered++;
        });
        const coverageGainZ =
          Math.log1p(newPatternsCovered / Math.max(1, coveredPatternsGlobal.size + 1)) *
          diversityScaleSigma;

        // 3. Synergie intra-ticket en unités σ (combinaison de Stouffer des Z-scores de paires positives)
        const pairZChannels: Array<{ z: number; weight: number }> = [];
        selectedSeven.forEach((alreadyPicked) => {
          const pairCycles = getPairCycleSupport(cand.number, alreadyPicked);
          const sameDrawHits = getSameDrawPairCount(cand.number, alreadyPicked);
          if (pairCycles > 0 || sameDrawHits > 0) {
            const zPair = computeBinomialUpperTailZScore(
              pairCycles,
              numCyclesForStats,
              expPairCycleProb
            );
            const zPairCred =
              (numCyclesForStats / (numCyclesForStats + bayesPriorScale)) *
              Math.max(0, zPair);
            if (zPairCred > 0) {
              pairZChannels.push({ z: zPairCred, weight: 1 });
            }
          }
        });
        const pairwiseSynergyZ =
          pairZChannels.length > 0
            ? combineCorrelatedChannelZScores(pairZChannels) * diversityScaleSigma
            : 0;

        // 4. Pénalité d'encombrement par dizaine en unités σ (soustractive, préserve la monotonie des Z signés)
        const candDecade = Math.min(8, Math.floor((cand.number - 1) / 10));
        const sameDecadeCount = selectedSeven.filter(
          (x) => Math.min(8, Math.floor((x - 1) / 10)) === candDecade
        ).length;
        const decadePenaltyZ = sameDecadeCount * diversityScaleSigma;

        const marginalUtility =
          baseZ + coverageGainZ + pairwiseSynergyZ - decadePenaltyZ;

        if (marginalUtility > bestMarginalUtility) {
          bestMarginalUtility = marginalUtility;
          bestCandidate = cand;
        }
      }

      if (!bestCandidate) break;
      selectedSeven.push(bestCandidate.number);
      ballEvidence[bestCandidate.number].coveredPatternIds.forEach((pid) =>
        coveredPatternsGlobal.add(pid)
      );
    }

    const optimalFive = selectedSeven.slice(0, 5).sort((a, b) => a - b);
    const reserveNumbers = selectedSeven.slice(5, 7);

    // Métriques quantitatives de la sélection synthétisée
    const optimalCandidates = optimalFive
      .map((n) => candidatePool.find((c) => c.number === n))
      .filter((c): c is PatternCandidateSelection => Boolean(c));

    const ticketStouffer = combinePatternStoufferZScores(
      optimalCandidates.map((c) => ({ z: c.stoufferZScore ?? 0, weight: 1 }))
    );

    const meanConv =
      optimalCandidates.length > 0
        ? optimalCandidates.reduce((acc, c) => acc + c.convergenceScore, 0) /
          optimalCandidates.length
        : 50;
    const phaseCoherenceScore =
      optimalCandidates.length > 0
        ? parseFloat(
            (
              optimalCandidates.reduce((acc, c) => acc + c.phaseAffinityScore, 0) /
              optimalCandidates.length
            ).toFixed(1)
          )
        : 50;

    let internalPairSynergyHits = 0;
    for (let i = 0; i < optimalFive.length; i++) {
      for (let j = i + 1; j < optimalFive.length; j++) {
        const sup = getPairCycleSupport(optimalFive[i], optimalFive[j]);
        if (sup > 0) {
          internalPairSynergyHits += sup / Math.max(1, numCyclesForStats);
        }
      }
    }
    const pairwiseSynergyScore = parseFloat(
      Math.min(
        99,
        logisticScore100((internalPairSynergyHits / Math.max(1, 10 * expPairCycleProb) - 0.8) * 2.2)
      ).toFixed(1)
    );

    // Confiance honnête et calibrée de la sélection 5 boules :
    // Sous H0 (bruit i.i.d.), la probabilité qu'un ticket de 5 boules contienne
    // au moins 1 numéro gagnant dans une loterie 5/90 est exactement 1 - C(85,5)/C(90,5) = 25.4%.
    const selectedMotifs = highPrecisionMotifs.filter((m) =>
      optimalFive.some((n) => m.sequence.includes(n))
    );
    const provenSelectedMotifs = selectedMotifs.filter(
      (m) => m.hasEmpiricalProof
    );
    const maxPatternZ =
      provenSelectedMotifs.length > 0
        ? Math.max(...provenSelectedMotifs.map((m) => m.zScore))
        : 0;
    const baselineH0SelectionConf = 25.4;
    const internalConfScore =
      0.55 * meanConv + 0.25 * pairwiseSynergyScore + 0.2 * phaseCoherenceScore;
    const zEvidenceGain = Math.max(0, Math.min(1, (maxPatternZ - 1.96) / 2.5));

    const selectionConfidence = parseFloat(
      (
        baselineH0SelectionConf +
        (Math.min(95, internalConfScore) - baselineH0SelectionConf) * zEvidenceGain
      ).toFixed(1)
    );

    const zTicketSign = ticketStouffer.zScore >= 0 ? '+' : '';
    const selectionRationale: string[] = [
      `Agrégation homogène de Stouffer sur 5 Z-scores N(0, 1) sous H0 (amorçage, Markov inter-cycles, résonance périodique, phase χ², synergie simultanée) : Z_ticket = ${zTicketSign}${ticketStouffer.zScore.toFixed(2)}σ.`,
      `Couverture sous-modulaire en espace Z de ${coveredPatternsGlobal.size} motif(s) distinct(s) sur ${numCyclesForStats} cycles analysés.`,
      `Alignement de phase (${activePhaseWeights.label} : ${activeCycleDrawsCount}/${cycleLength} tirages) à ${phaseCoherenceScore}% et cohésion inter-boules à ${pairwiseSynergyScore}%.`,
    ];

    return {
      drawName,
      cycleLength,
      totalDraws,
      totalCycles,
      activeCycleIndex: totalCycles - 1,
      activeCycleDrawsCount,
      activeCycleNumbers,
      topRecurringPairs,
      topRecurringTriplets,
      topCrossCycleTransitions: prunedTransitions,
      topPhaseMotifs,
      activePrimedPatterns: activePrimed,
      topPeriodicResonancePatterns,
      candidateRankings: candidateRankings.slice(0, 15),
      recommendedSelection: {
        optimalFive,
        reserveNumbers,
        selectionConfidence,
        coveredPatternsCount: coveredPatternsGlobal.size,
        pairwiseSynergyScore,
        phaseCoherenceScore,
        currentPhaseLabel: activePhaseWeights.label,
        ticketStoufferZScore: Number(ticketStouffer.zScore.toFixed(4)),
        ticketPValue: Number(ticketStouffer.pValue.toFixed(6)),
        scoringMethod: 'STOUFFER_Z',
        selectionRationale,
      },
      overallCycleEntropy,
    };
  },
};
