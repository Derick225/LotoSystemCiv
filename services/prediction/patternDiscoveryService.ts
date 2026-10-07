import { DrawResult } from '../../types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { LOTTERY_CONSTANTS } from '../lotteryService';

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

export interface PatternCandidateSelection {
  number: number;
  convergenceScore: number;        // Continuous multi-motif convergence score [0..100]
  primedMotifsCount: number;       // Active primed pairs/triplets pointing to this ball
  transitionDriversCount: number;  // Active cross-cycle transitions pointing to this ball
  periodicMotifsCount: number;     // Periodic renewal motifs due in current cycle containing this ball
  sameDrawSynergyCount: number;    // Simultaneous intra-draw co-occurrences with active numbers
  phaseAffinityScore: number;      // Alignment of this ball's motifs with current cycle phase [0..100]
  synergyPartners: number[];       // Top synergistic partner balls (by PMI)
  supportingPatterns: string[];    // Human-readable labels of top supporting motifs
  selectionRole: CandidateSelectionRole;
  reasoningSummary: string;
}

export interface PatternSynthesizedSelection {
  optimalFive: number[];           // Optimal 5-ball combination synthesized by submodular convergence + PMI
  reserveNumbers: number[];        // 2 tactical reserve numbers
  selectionConfidence: number;     // Overall confidence [0..100]
  coveredPatternsCount: number;    // Number of distinct active/periodic patterns covered
  pairwiseSynergyScore: number;    // Internal PMI / co-occurrence cohesion [0..100]
  phaseCoherenceScore: number;     // Alignment with current cycle progression [0..100]
  currentPhaseLabel: string;
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
const normalCdf = (z: number): number => {
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z);
  const prob =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1.0 - prob : prob;
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

    // 1. Segment history into chronological cycles (oldest = index 0, newest = last)
    const chronological = [...isolatedHistory].reverse();
    const cycles: Array<{
      cycleIndex: number;
      draws: DrawResult[];
      allNumbers: Set<number>;
      numberFreq: Record<number, number>;
      phaseNumbers: { early: Set<number>; mid: Set<number>; late: Set<number> };
    }> = [];

    const totalCycles = Math.ceil(totalDraws / cycleLength);

    for (let c = 0; c < totalCycles; c++) {
      const startIdx = c * cycleLength;
      const endIdx = Math.min(totalDraws, (c + 1) * cycleLength);
      const cycleDraws = chronological.slice(startIdx, endIdx);

      const allNumbers = new Set<number>();
      const numberFreq: Record<number, number> = {};
      const early = new Set<number>();
      const mid = new Set<number>();
      const late = new Set<number>();

      const drawsInCycle = cycleDraws.length;
      const phaseThird = Math.max(1, drawsInCycle / 3);

      cycleDraws.forEach((draw, dIdx) => {
        const gagnants = (draw.gagnants || []).filter((n) => n >= 1 && n <= TOTAL_BALLS);
        gagnants.forEach((n) => {
          allNumbers.add(n);
          numberFreq[n] = (numberFreq[n] || 0) + 1;

          if (dIdx < phaseThird) {
            early.add(n);
          } else if (dIdx < phaseThird * 2) {
            mid.add(n);
          } else {
            late.add(n);
          }
        });
      });

      cycles.push({
        cycleIndex: c,
        draws: cycleDraws,
        allNumbers,
        numberFreq,
        phaseNumbers: { early, mid, late },
      });
    }

    // Active cycle is the latest one; completed cycles are used for unbiased historical estimation
    const activeCycle = cycles[cycles.length - 1];
    const activeCycleNumbers = Array.from(activeCycle.allNumbers).sort((a, b) => a - b);
    const completedCycles = cycles.length > 1 ? cycles.slice(0, cycles.length - 1) : cycles;
    const numCyclesForStats = completedCycles.length;

    // Current cycle progress ratio u in [0, 1] and continuous phase weights
    const activeCycleProgress = activeCycle.draws.length / cycleLength;
    const activePhaseWeights = computeContinuousPhaseWeights(activeCycleProgress);
    const remainingDrawsInCycle = Math.max(1, cycleLength - activeCycle.draws.length);

    // 2. Compute overall Shannon entropy of ball frequencies across all draws & individual cycle rates
    const globalBallDrawCounts = new Array(TOTAL_BALLS + 1).fill(0);
    const ballCycleCounts = new Array(TOTAL_BALLS + 1).fill(0);
    let totalBallHits = 0;

    completedCycles.forEach((cyc) => {
      cyc.allNumbers.forEach((n) => {
        ballCycleCounts[n]++;
      });
      Object.entries(cyc.numberFreq).forEach(([nStr, cnt]) => {
        const n = Number(nStr);
        globalBallDrawCounts[n] += cnt;
        totalBallHits += cnt;
      });
    });

    let rawCycleEntropy = 0;
    if (totalBallHits > 0) {
      for (let n = 1; n <= TOTAL_BALLS; n++) {
        const p = globalBallDrawCounts[n] / totalBallHits;
        if (p > 0) {
          rawCycleEntropy -= p * Math.log2(p);
        }
      }
    }
    const overallCycleEntropy = parseFloat(
      Math.min(1, Math.max(0, rawCycleEntropy / Math.log2(TOTAL_BALLS))).toFixed(4)
    );

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

    // 3. Mine Simultaneous Intra-Draw Co-occurrences AND Intra-Cycle Pairs across ALL 90 balls
    const sameDrawPairCounts = new Map<string, number>();
    const sameDrawTripletCounts = new Map<string, number>();

    completedCycles.forEach((cyc) => {
      cyc.draws.forEach((draw) => {
        const g = (draw.gagnants || [])
          .filter((n) => n >= 1 && n <= TOTAL_BALLS)
          .sort((a, b) => a - b);
        const gLen = g.length;
        for (let i = 0; i < gLen; i++) {
          for (let j = i + 1; j < gLen; j++) {
            const pKey = `${g[i]}_${g[j]}`;
            sameDrawPairCounts.set(pKey, (sameDrawPairCounts.get(pKey) || 0) + 1);
            for (let k = j + 1; k < gLen; k++) {
              const tKey = `${g[i]}_${g[j]}_${g[k]}`;
              sameDrawTripletCounts.set(tKey, (sameDrawTripletCounts.get(tKey) || 0) + 1);
            }
          }
        }
      });
    });

    const pairCycleMap = new Map<
      string,
      {
        pair: [number, number];
        cycleIndices: number[];
        phaseCounts: { early: number; mid: number; late: number };
      }
    >();

    completedCycles.forEach((cyc) => {
      const cycleIdx = cyc.cycleIndex;
      const nums = Array.from(cyc.allNumbers).sort((a, b) => a - b);
      const len = nums.length;

      for (let i = 0; i < len; i++) {
        for (let j = i + 1; j < len; j++) {
          const n1 = nums[i];
          const n2 = nums[j];
          const key = `${n1}_${n2}`;

          let entry = pairCycleMap.get(key);
          if (!entry) {
            entry = {
              pair: [n1, n2],
              cycleIndices: [],
              phaseCounts: { early: 0, mid: 0, late: 0 },
            };
            pairCycleMap.set(key, entry);
          }
          entry.cycleIndices.push(cycleIdx);

          if (cyc.phaseNumbers.early.has(n1) && cyc.phaseNumbers.early.has(n2)) {
            entry.phaseCounts.early += 1;
          } else if (cyc.phaseNumbers.mid.has(n1) && cyc.phaseNumbers.mid.has(n2)) {
            entry.phaseCounts.mid += 1;
          } else if (cyc.phaseNumbers.late.has(n1) && cyc.phaseNumbers.late.has(n2)) {
            entry.phaseCounts.late += 1;
          } else {
            if (cyc.phaseNumbers.early.has(n1) || cyc.phaseNumbers.early.has(n2))
              entry.phaseCounts.early += 0.5;
            if (cyc.phaseNumbers.mid.has(n1) || cyc.phaseNumbers.mid.has(n2))
              entry.phaseCounts.mid += 0.5;
            if (cyc.phaseNumbers.late.has(n1) || cyc.phaseNumbers.late.has(n2))
              entry.phaseCounts.late += 0.5;
          }
        }
      }
    });

    // 4. Apriori Bias-Free Triplet Mining across ALL 90 balls (Zero Math.min(len, 25) truncation!)
    // A triplet {n1, n2, n3} is eligible if either it co-occurred in the same draw OR all 3 of its
    // constituent pairs belong to the top synergistic Apriori pair set.
    const minPairForTriplet = Math.max(
      2,
      Math.ceil(numCyclesForStats * expPairCycleProb * 1.15)
    );
    const candidatePairsForApriori: Array<{ key: string; score: number }> = [];
    pairCycleMap.forEach((entry, key) => {
      const sameDrawCnt = sameDrawPairCounts.get(key) || 0;
      const sup = entry.cycleIndices.length;
      if (sup >= minPairForTriplet || sameDrawCnt >= 2) {
        const [a, b] = entry.pair;
        const diceCohesion =
          (2 * sup) / Math.max(1, (ballCycleCounts[a] || 1) + (ballCycleCounts[b] || 1));
        const empLift = (sup / Math.max(1, numCyclesForStats)) / expPairCycleProb;
        const pairSynergy = empLift * diceCohesion + sameDrawCnt * 3.0;
        candidatePairsForApriori.push({ key, score: pairSynergy });
      }
    });
    candidatePairsForApriori.sort((a, b) => b.score - a.score);
    const frequentPairSet = new Set<string>(
      candidatePairsForApriori.slice(0, 320).map((p) => p.key)
    );

    const tripletCycleMap = new Map<
      string,
      {
        triplet: [number, number, number];
        cycleIndices: number[];
        phaseCounts: { early: number; mid: number; late: number };
      }
    >();

    completedCycles.forEach((cyc) => {
      const cycleIdx = cyc.cycleIndex;
      const nums = Array.from(cyc.allNumbers).sort((a, b) => a - b);
      const len = nums.length;
      if (len < 3) return;

      for (let i = 0; i < len - 2; i++) {
        const n1 = nums[i];
        for (let j = i + 1; j < len - 1; j++) {
          const n2 = nums[j];
          const p12 = `${n1}_${n2}`;
          if (!frequentPairSet.has(p12)) continue;

          for (let k = j + 1; k < len; k++) {
            const n3 = nums[k];
            const tKey = `${n1}_${n2}_${n3}`;
            const hasSameDraw = (sameDrawTripletCounts.get(tKey) || 0) >= 1;
            if (
              !hasSameDraw &&
              (!frequentPairSet.has(`${n1}_${n3}`) || !frequentPairSet.has(`${n2}_${n3}`))
            ) {
              continue;
            }
            let entry = tripletCycleMap.get(tKey);
            if (!entry) {
              entry = {
                triplet: [n1, n2, n3],
                cycleIndices: [],
                phaseCounts: { early: 0, mid: 0, late: 0 },
              };
              tripletCycleMap.set(tKey, entry);
            }
            entry.cycleIndices.push(cycleIdx);

            const eCount =
              (cyc.phaseNumbers.early.has(n1) ? 1 : 0) +
              (cyc.phaseNumbers.early.has(n2) ? 1 : 0) +
              (cyc.phaseNumbers.early.has(n3) ? 1 : 0);
            const mCount =
              (cyc.phaseNumbers.mid.has(n1) ? 1 : 0) +
              (cyc.phaseNumbers.mid.has(n2) ? 1 : 0) +
              (cyc.phaseNumbers.mid.has(n3) ? 1 : 0);
            const lCount =
              (cyc.phaseNumbers.late.has(n1) ? 1 : 0) +
              (cyc.phaseNumbers.late.has(n2) ? 1 : 0) +
              (cyc.phaseNumbers.late.has(n3) ? 1 : 0);

            entry.phaseCounts.early += eCount / 3;
            entry.phaseCounts.mid += mCount / 3;
            entry.phaseCounts.late += lCount / 3;
          }
        }
      }
    });

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

      // Exact Z-Score against Binomial(M, expUnionProb) + simultaneous draw evidence
      const varianceUnion = Math.max(1e-6, numCyclesForStats * expUnionProb * (1 - expUnionProb));
      const zUnion = (support - numCyclesForStats * expUnionProb) / Math.sqrt(varianceUnion);
      // sameDrawCount compte des ÉVÉNEMENTS (co-occurrences intra-tirage, possiblement > M) :
      // la moyenne nulle doit être le nombre attendu d'événements sur tous les tirages complétés,
      // pas M·P(≥1 par cycle). Inversion exacte p_draw = 1-(1-p_cycle)^(1/D), variance de Poisson.
      const pSameDrawPerDraw = 1 - Math.pow(1 - expSameDrawProb, 1 / Math.max(1, cycleLength));
      const expectedSameDrawEvents =
        numCyclesForStats * Math.max(1, cycleLength) * pSameDrawPerDraw;
      const varianceSameDraw = Math.max(1e-6, expectedSameDrawEvents);
      const zSameDraw =
        sameDrawCount > 0
          ? (sameDrawCount - expectedSameDrawEvents) / Math.sqrt(varianceSameDraw)
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
      const isFullyInActive = seq.every((n) => activeCycle.allNumbers.has(n));
      const lastCompletedSeen =
        sortedCycles.length > 0 ? sortedCycles[sortedCycles.length - 1] : 0;
      const cyclesSinceLastCompleted = Math.max(0, numCyclesForStats - 1 - lastCompletedSeen);
      const cyclesAgo = isFullyInActive ? 0 : cyclesSinceLastCompleted + 1;

      // Renewal hazard peaks when cyclesSinceLastCompleted + 1 approaches meanInterval
      const currentCycleLag = cyclesSinceLastCompleted + 1;
      const gaussianLagResonance = Math.exp(
        -Math.pow(currentCycleLag - meanInterval, 2) / (2 * (intervalVariance + 1.0))
      );
      // Sans intervalles mesurés (support < 3, i.e. < 2 intervalles), aucune périodicité
      // n'est démontrable : le hazard retombe sur le H0 géométrique sans mémoire
      // (probabilité d'union exacte par cycle) au lieu d'une résonance gaussienne
      // auto-réalisatrice (lag == moyenne extrapolée depuis une occurrence unique).
      const hasMeasuredPeriodicity = intervals.length >= 2;
      const renewalHazard = hasMeasuredPeriodicity
        ? Math.min(99, 100 * gaussianLagResonance * (0.55 + 0.45 * (regularityIndex / 100)))
        : Math.min(99, 100 * expUnionProb);

      // Phase distribution & continuous phase alignment with current cycle progress
      const totalPhases = Math.max(
        Number.EPSILON,
        phaseCounts.early + phaseCounts.mid + phaseCounts.late
      );
      const earlyPct = (phaseCounts.early / totalPhases) * 100;
      const midPct = (phaseCounts.mid / totalPhases) * 100;
      const latePct = (phaseCounts.late / totalPhases) * 100;

      let prefPhase: CyclePhase = 'MID';
      if (earlyPct >= midPct && earlyPct >= latePct) prefPhase = 'EARLY';
      else if (latePct >= earlyPct && latePct >= midPct) prefPhase = 'LATE';

      // Continuous dot-product alignment normalized against uniform (33.33%)
      const rawPhaseDot =
        (earlyPct / 100) * activePhaseWeights.early +
        (midPct / 100) * activePhaseWeights.mid +
        (latePct / 100) * activePhaseWeights.late;
      const phaseAlignment = logisticScore100((rawPhaseDot - 1 / 3) * 6.0);

      // Active cycle priming & O(1) exact Bayesian conditional completion probability
      const activePresent = seq.filter((n) => activeCycle.allNumbers.has(n));
      const missing = seq.filter((n) => !activeCycle.allNumbers.has(n));

      let activeAlertStatus: RecurringSequencePattern['activeAlertStatus'] = 'DORMANT';
      let completionProb = 0;
      let conditionalCompletionRate = 0;

      if (activePresent.length > 0) {
        let precursorCyclesCount = support;
        if (activePresent.length === 1) {
          precursorCyclesCount = ballCycleCounts[activePresent[0]] || support;
        } else if (activePresent.length === 2) {
          const pKey =
            activePresent[0] < activePresent[1]
              ? `${activePresent[0]}_${activePresent[1]}`
              : `${activePresent[1]}_${activePresent[0]}`;
          precursorCyclesCount = pairCycleMap.get(pKey)?.cycleIndices.length || support;
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

      if (activePresent.length === seq.length) {
        activeAlertStatus = 'TRIGGERED';
        completionProb = 100;
        conditionalCompletionRate = 100;
      } else if (activePresent.length >= Math.max(1, Math.floor(seq.length * 0.5))) {
        activeAlertStatus = 'PRIMED';
        const remainingWindowFactor = Math.pow(remainingDrawsInCycle / cycleLength, 0.35);
        const zSignal =
          (conditionalCompletionRate / 100 - 0.25) * 3.2 +
          pmi * 0.65 +
          sameDrawWeight * 1.1 +
          (phaseAlignment - 50) / 45 +
          (renewalHazard - 50) / 55;
        completionProb = Math.min(
          98.5,
          Math.max(8.0, logisticScore100(zSignal) * (0.65 + 0.35 * remainingWindowFactor))
        );
      }

      // Continuous Monotonic Log-Z + PMI + Simultaneity Confidence [0..100]
      const logZ = (zScore >= 0 ? 1 : -1) * Math.log1p(Math.abs(zScore));
      const confidenceLogit =
        logZ * 0.85 +
        pmi * 0.95 +
        (recencyMomentum - 50) / 45 +
        sameDrawWeight * 1.45;
      const confidence = Math.min(99.5, Math.max(2.0, logisticScore100(confidenceLogit)));

      const compositeScore = Math.min(
        99.5,
        Math.max(
          1.0,
          0.36 * confidence +
            0.20 * recencyMomentum +
            0.16 * renewalHazard +
            0.12 * phaseAlignment +
            0.16 * (activeAlertStatus === 'PRIMED' ? completionProb : confidence)
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
        hasEmpiricalProof: zScore >= Z_GAUSS_90 || (zScore > 0.5 && pmi > 0.35),
        cycleOccurrences: sortedCycles,
        lastSeenCycle: cyclesAgo,
        meanCycleInterval: parseFloat(meanInterval.toFixed(1)),
        cyclePhasePreference: prefPhase,
        phaseDistribution: {
          early: parseFloat(earlyPct.toFixed(1)),
          mid: parseFloat(midPct.toFixed(1)),
          late: parseFloat(latePct.toFixed(1)),
        },
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

    // Filter and rank Recurring Pairs using continuous composite scoring (no binary multiplier jump!)
    const minPairCycles =
      options.minSupportCycles ??
      Math.max(2, Math.floor(numCyclesForStats * expPairCycleProb * 0.85));

    const allPairs: RecurringSequencePattern[] = [];
    pairCycleMap.forEach((entry, key) => {
      const sameDrawCnt = sameDrawPairCounts.get(key) || 0;
      if (entry.cycleIndices.length >= minPairCycles || sameDrawCnt >= 2) {
        const pat = evaluatePattern(
          `pair_${key}`,
          'PAIR',
          entry.pair,
          entry.cycleIndices,
          expPairCycleProb,
          expPairSameDrawCycleProb,
          sameDrawCnt,
          entry.phaseCounts
        );
        allPairs.push(pat);
      }
    });

    const topRecurringPairs = allPairs
      .sort((a, b) => (b.reasoning?.compositeScore ?? b.confidence) - (a.reasoning?.compositeScore ?? a.confidence))
      .slice(0, maxPerCat);

    // Filter and rank Recurring Triplets across all 90 balls
    const allTriplets: RecurringSequencePattern[] = [];
    tripletCycleMap.forEach((entry, key) => {
      const sameDrawCnt = sameDrawTripletCounts.get(key) || 0;
      if (entry.cycleIndices.length >= 2 || sameDrawCnt >= 1) {
        const pat = evaluatePattern(
          `triplet_${key}`,
          'TRIPLET',
          entry.triplet,
          entry.cycleIndices,
          expTripletCycleProb,
          expTripletSameDrawCycleProb,
          sameDrawCnt,
          entry.phaseCounts
        );
        allTriplets.push(pat);
      }
    });

    const topRecurringTriplets = allTriplets
      .sort((a, b) => (b.reasoning?.compositeScore ?? b.confidence) - (a.reasoning?.compositeScore ?? a.confidence))
      .slice(0, maxPerCat);

    // 6. Mine Cross-Cycle Transition Chains (Cycle C -> Cycle C+1) with REAL occurrences, phases & entropy
    const crossCycleMap = new Map<
      string,
      {
        source: number;
        target: number;
        transitionCycles: number[];
        targetPhaseCounts: { early: number; mid: number; late: number };
      }
    >();

    for (let c = 0; c < completedCycles.length - 1; c++) {
      const cycCurrent = completedCycles[c];
      const cycNext = completedCycles[c + 1];

      cycCurrent.allNumbers.forEach((nSrc) => {
        cycNext.allNumbers.forEach((nTgt) => {
          if (nSrc !== nTgt) {
            const key = `${nSrc}->${nTgt}`;
            let entry = crossCycleMap.get(key);
            if (!entry) {
              entry = {
                source: nSrc,
                target: nTgt,
                transitionCycles: [],
                targetPhaseCounts: { early: 0, mid: 0, late: 0 },
              };
              crossCycleMap.set(key, entry);
            }
            entry.transitionCycles.push(cycNext.cycleIndex);

            if (cycNext.phaseNumbers.early.has(nTgt)) entry.targetPhaseCounts.early += 1;
            if (cycNext.phaseNumbers.mid.has(nTgt)) entry.targetPhaseCounts.mid += 1;
            if (cycNext.phaseNumbers.late.has(nTgt)) entry.targetPhaseCounts.late += 1;
          }
        });
      });
    }

    const sourceBallCounts: Record<number, number> = {};
    for (let c = 0; c < Math.max(1, completedCycles.length - 1); c++) {
      completedCycles[c].allNumbers.forEach((n) => {
        sourceBallCounts[n] = (sourceBallCounts[n] || 0) + 1;
      });
    }

    const lastCompletedCycle = completedCycles[completedCycles.length - 1];
    const topCrossCycleTransitions: RecurringSequencePattern[] = [];

    crossCycleMap.forEach((entry, key) => {
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
        for (let i = 1; i < sortedTransCycles.length; i++) {
          intervals.push(sortedTransCycles[i] - sortedTransCycles[i - 1]);
        }
        const meanInterval =
          intervals.length > 0
            ? intervals.reduce((a, b) => a + b, 0) / intervals.length
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

        // Is source active in the preceding completed cycle (priming current active cycle)
        // OR already in current active cycle (priming next cycle)?
        const isSourceInLastCompleted = lastCompletedCycle.allNumbers.has(entry.source);
        const isSourceInActiveCycle = activeCycle.allNumbers.has(entry.source);
        const isTargetInActiveCycle = activeCycle.allNumbers.has(entry.target);

        const isPrimedForCurrentCycle =
          (isSourceInLastCompleted || isSourceInActiveCycle) && !isTargetInActiveCycle;
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
        const completionProb = isPrimedForCurrentCycle
          ? Math.min(96.5, transConf * (0.75 + 0.25 * (phaseAlignment / 100)))
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
    });

    topCrossCycleTransitions.sort(
      (a, b) =>
        (b.reasoning?.compositeScore ?? b.confidence) -
        (a.reasoning?.compositeScore ?? a.confidence)
    );
    const prunedTransitions = topCrossCycleTransitions.slice(0, maxPerCat);

    // 7. Phase-Specific Motifs (Motifs with strong phase concentration & alignment with current phase)
    const topPhaseMotifs = [...allPairs, ...allTriplets]
      .filter(
        (p) =>
          Math.max(
            p.phaseDistribution.early,
            p.phaseDistribution.mid,
            p.phaseDistribution.late
          ) >= 50
      )
      .sort(
        (a, b) =>
          (b.reasoning?.phaseAlignment ?? 50) * b.lift -
          (a.reasoning?.phaseAlignment ?? 50) * a.lift
      )
      .slice(0, maxPerCat);

    // 8. Periodic Resonance Patterns (Motifs whose renewal hazard peaks in the current cycle)
    const topPeriodicResonancePatterns = [...allPairs, ...allTriplets]
      .filter((p) => (p.reasoning?.renewalHazard ?? 0) >= 58 && p.activeAlertStatus !== 'TRIGGERED')
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

    // 10. Multi-Motif Candidate Ball Convergence & Optimal 5-Ball Selection Engine
    const ballEvidence = Array.from({ length: TOTAL_BALLS + 1 }, (_, n) => ({
      number: n,
      primedScore: 0,
      transitionScore: 0,
      periodicScore: 0,
      synergyScore: 0,
      phaseWeightedSum: 0,
      phaseWeightTotal: 0,
      primedMotifsCount: 0,
      transitionDriversCount: 0,
      periodicMotifsCount: 0,
      sameDrawSynergyCount: 0,
      partnerWeights: new Map<number, number>(),
      supportingPatterns: [] as Array<{ label: string; weight: number; id: string }>,
      coveredPatternIds: new Set<string>(),
    }));

    // Accumulate evidence from Top Validated Pairs, Triplets & Periodic Motifs
    // Using top-ranked motifs + PMI & simultaneous intra-draw specificity prevents noise dilution
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

    highPrecisionMotifs.forEach((pat) => {
      if (pat.type === 'TRANSITION_CHAIN') return;
      const compScore = pat.reasoning?.compositeScore ?? pat.confidence;
      const renewal = pat.reasoning?.renewalHazard ?? 0;
      const phaseAlign = pat.reasoning?.phaseAlignment ?? 50;
      const pmiVal = Math.max(0.1, pat.reasoning?.pmi ?? 0.2);
      const sameDrawCnt = pat.reasoning?.sameDrawOccurrences ?? 0;

      // Specificity multiplier: Order-2 Triplet completion (2 precursors active) + Simultaneous draw hits
      const orderSpecificity = pat.type === 'TRIPLET' ? 2.25 : 1.0;
      const simultaneityBoost = 1 + 0.65 * Math.log1p(sameDrawCnt);
      const infoGainFactor = (1 + 0.55 * pmiVal) * orderSpecificity * simultaneityBoost;

      if (pat.activeAlertStatus === 'PRIMED' && pat.completionCandidates) {
        const w =
          ((pat.completionProbability ?? 50) / 100) *
          (compScore / 100) *
          infoGainFactor;
        pat.completionCandidates.forEach((cand) => {
          const ev = ballEvidence[cand];
          ev.primedScore += w * 45;
          ev.primedMotifsCount++;
          ev.sameDrawSynergyCount += sameDrawCnt;
          ev.phaseWeightedSum += phaseAlign * w;
          ev.phaseWeightTotal += w;
          ev.coveredPatternIds.add(pat.id);
          ev.supportingPatterns.push({
            id: pat.id,
            label: `${pat.type === 'PAIR' ? 'Paire' : 'Triplet'} amorcé [${pat.sequence.join('-')}] (${pat.completionProbability}%)`,
            weight: w * 100,
          });
          pat.sequence.forEach((other) => {
            if (other !== cand) {
              ev.partnerWeights.set(other, (ev.partnerWeights.get(other) || 0) + w);
            }
          });
        });
      }

      // Accumulate evidence from Periodic Renewal Resonance (motifs due in current cycle)
      if (renewal >= 58 && pat.activeAlertStatus !== 'TRIGGERED') {
        const wPer = (renewal / 100) * (compScore / 100) * infoGainFactor;
        pat.sequence.forEach((n) => {
          if (activeCycle.allNumbers.has(n)) return; // Focus on balls not yet drawn in active cycle
          const ev = ballEvidence[n];
          ev.periodicScore += wPer * 24;
          ev.periodicMotifsCount++;
          ev.phaseWeightedSum += phaseAlign * wPer;
          ev.phaseWeightTotal += wPer;
          ev.coveredPatternIds.add(pat.id);
          ev.supportingPatterns.push({
            id: pat.id,
            label: `Résonance cyclique [${pat.sequence.join('-')}] (~${pat.meanCycleInterval} cyc)`,
            weight: wPer * 80,
          });
          pat.sequence.forEach((other) => {
            if (other !== n) {
              ev.partnerWeights.set(other, (ev.partnerWeights.get(other) || 0) + wPer * 0.8);
            }
          });
        });
      }

      // General structural synergy for high-PMI motifs
      if (pmiVal > 0.25) {
        const wSyn = pmiVal * (compScore / 100) * simultaneityBoost;
        pat.sequence.forEach((n) => {
          if (activeCycle.allNumbers.has(n)) return;
          const ev = ballEvidence[n];
          ev.synergyScore += wSyn * 8;
          pat.sequence.forEach((other) => {
            if (other !== n) {
              ev.partnerWeights.set(other, (ev.partnerWeights.get(other) || 0) + wSyn * 0.5);
            }
          });
        });
      }
    });

    // Accumulate evidence from Active Cross-Cycle Transitions
    prunedTransitions.forEach((tr) => {
      if (tr.activeAlertStatus === 'PRIMED' && tr.completionCandidates?.[0]) {
        const target = tr.completionCandidates[0];
        const source = tr.sequence[0];
        const ev = ballEvidence[target];
        const wTr = ((tr.completionProbability ?? 50) / 100) * (tr.confidence / 100);
        ev.transitionScore += wTr * 36;
        ev.transitionDriversCount++;
        ev.phaseWeightedSum += (tr.reasoning?.phaseAlignment ?? 50) * wTr;
        ev.phaseWeightTotal += wTr;
        ev.coveredPatternIds.add(tr.id);
        ev.supportingPatterns.push({
          id: tr.id,
          label: `Transition ${source} ➔ ${target} (${tr.transitionConfidence}%)`,
          weight: wTr * 95,
        });
        ev.partnerWeights.set(source, (ev.partnerWeights.get(source) || 0) + wTr);
      }
    });

    // Build Candidate Rankings across balls 1..90
    const rawTotals: number[] = [];
    for (let n = 1; n <= TOTAL_BALLS; n++) {
      const ev = ballEvidence[n];
      const raw = ev.primedScore + ev.transitionScore + ev.periodicScore + ev.synergyScore;
      rawTotals.push(raw);
    }
    const maxRawTotal = Math.max(1e-5, ...rawTotals);

    const candidateRankings: PatternCandidateSelection[] = [];
    for (let n = 1; n <= TOTAL_BALLS; n++) {
      const ev = ballEvidence[n];
      const raw = ev.primedScore + ev.transitionScore + ev.periodicScore + ev.synergyScore;
      if (raw <= 0) continue;

      const normalizedRatio = raw / maxRawTotal;
      const convergenceScore = parseFloat(
        Math.min(99.4, Math.max(12.0, logisticScore100((normalizedRatio - 0.32) * 4.5))).toFixed(1)
      );

      const phaseAffinityScore = parseFloat(
        (ev.phaseWeightTotal > 0 ? ev.phaseWeightedSum / ev.phaseWeightTotal : 50).toFixed(1)
      );

      const topPartners = Array.from(ev.partnerWeights.entries())
        .sort((a, b) => b[1] - a[1])
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

      let selectionRole: CandidateSelectionRole = 'RESONANCE_CYCLIQUE';
      if (ev.primedMotifsCount >= 1 && ev.transitionDriversCount >= 1) {
        selectionRole = 'PIVOT_CONVERGENT';
      } else if (ev.primedScore >= ev.transitionScore && ev.primedMotifsCount >= 1) {
        selectionRole = 'COMPLETION_PRIMED';
      } else if (ev.transitionDriversCount >= 1) {
        selectionRole = 'TRANSITION_CIBLE';
      }

      const reasoningSummary =
        selectionRole === 'PIVOT_CONVERGENT'
          ? `Convergence multi-canaux : ${ev.primedMotifsCount} motif(s) amorcé(s) + ${ev.transitionDriversCount} chaîne(s) de transition Markov.`
          : selectionRole === 'COMPLETION_PRIMED'
          ? `Candidat direct de complétion pour ${ev.primedMotifsCount} motif(s) amorcé(s) dans le cycle actif.`
          : selectionRole === 'TRANSITION_CIBLE'
          ? `Cible directe de ${ev.transitionDriversCount} transition(s) inter-cycles active(s).`
          : `Porté par ${ev.periodicMotifsCount} motif(s) périodique(s) en fenêtre de retour cyclique.`;

      candidateRankings.push({
        number: n,
        convergenceScore,
        primedMotifsCount: ev.primedMotifsCount,
        transitionDriversCount: ev.transitionDriversCount,
        periodicMotifsCount: ev.periodicMotifsCount,
        sameDrawSynergyCount: ev.sameDrawSynergyCount,
        phaseAffinityScore,
        synergyPartners: topPartners,
        supportingPatterns: uniqueSupporting,
        selectionRole,
        reasoningSummary,
      });
    }

    candidateRankings.sort((a, b) => b.convergenceScore - a.convergenceScore);

    // 11. Submodular Coverage + Pairwise PMI Synergy Optimizer for Optimal 5-Ball Selection + 2 Reserves
    const selectedSeven: number[] = [];
    const coveredPatternsGlobal = new Set<string>();
    const candidatePool = candidateRankings.slice(0, 30);

    while (selectedSeven.length < 7 && selectedSeven.length < candidatePool.length) {
      let bestCandidate: PatternCandidateSelection | null = null;
      let bestMarginalUtility = -Infinity;

      for (const cand of candidatePool) {
        if (selectedSeven.includes(cand.number)) continue;
        const ev = ballEvidence[cand.number];

        // 1. Base convergence utility
        const baseUtility = cand.convergenceScore;

        // 2. Submodular marginal coverage gain (new motifs covered that aren't already covered)
        let newPatternsCovered = 0;
        ev.coveredPatternIds.forEach((pid) => {
          if (!coveredPatternsGlobal.has(pid)) newPatternsCovered++;
        });
        const coverageUtility = Math.log1p(newPatternsCovered) * 18.0;

        // 3. Pairwise PMI / co-occurrence synergy with already selected balls in the ticket
        let pairwiseSynergy = 0;
        selectedSeven.forEach((alreadyPicked) => {
          const wPartner = ev.partnerWeights.get(alreadyPicked) || 0;
          const pKey =
            cand.number < alreadyPicked
              ? `${cand.number}_${alreadyPicked}`
              : `${alreadyPicked}_${cand.number}`;
          const sameDrawHits = sameDrawPairCounts.get(pKey) || 0;
          pairwiseSynergy += wPartner * 12.0 + sameDrawHits * 4.5;
        });

        // 4. Smooth decade diversity regularization (avoids crowding 4 balls in the same decade)
        const candDecade = Math.floor((cand.number - 1) / 10);
        const sameDecadeCount = selectedSeven.filter(
          (x) => Math.floor((x - 1) / 10) === candDecade
        ).length;
        const decadeRegularizer = Math.exp(-0.55 * sameDecadeCount);

        const marginalUtility =
          (baseUtility + coverageUtility + pairwiseSynergy) * (0.7 + 0.3 * decadeRegularizer);

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

    // Compute quantitative metrics of the synthesized 5-ball selection
    const optimalCandidates = optimalFive
      .map((n) => candidateRankings.find((c) => c.number === n))
      .filter((c): c is PatternCandidateSelection => Boolean(c));

    const meanConv =
      optimalCandidates.length > 0
        ? optimalCandidates.reduce((acc, c) => acc + c.convergenceScore, 0) /
          optimalCandidates.length
        : 0;
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
        const key = `${optimalFive[i]}_${optimalFive[j]}`;
        const pEntry = pairCycleMap.get(key);
        if (pEntry) {
          internalPairSynergyHits += pEntry.cycleIndices.length / Math.max(1, numCyclesForStats);
        }
      }
    }
    const pairwiseSynergyScore = parseFloat(
      Math.min(
        99,
        logisticScore100((internalPairSynergyHits / Math.max(1, 10 * expPairCycleProb) - 0.8) * 2.2)
      ).toFixed(1)
    );

    const selectionConfidence = parseFloat(
      Math.min(99, 0.55 * meanConv + 0.25 * pairwiseSynergyScore + 0.2 * phaseCoherenceScore).toFixed(1)
    );

    const selectionRationale: string[] = [
      `Couverture sous-modulaire de ${coveredPatternsGlobal.size} motifs actifs et périodiques distincts sur ${numCyclesForStats} cycles analysés.`,
      `Alignement de phase (${activePhaseWeights.label} : ${activeCycle.draws.length}/${cycleLength} tirages) avec cohérence de ${phaseCoherenceScore}%.`,
      `Cohésion interne inter-boules (PMI & co-occurrences simultanées) évaluée à ${pairwiseSynergyScore}%.`,
    ];

    return {
      drawName,
      cycleLength,
      totalDraws,
      totalCycles,
      activeCycleIndex: totalCycles - 1,
      activeCycleDrawsCount: activeCycle.draws.length,
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
        selectionRationale,
      },
      overallCycleEntropy,
    };
  },
};
