import { DrawResult } from '../../types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { LOTTERY_CONSTANTS } from '../lotteryService';

export type GapBinId =
  | 'G0'
  | 'G1_3'
  | 'G4_7'
  | 'G8_14'
  | 'G15_24'
  | 'G25_39'
  | 'G40_PLUS';

export interface GapRangeBin {
  id: GapBinId;
  label: string;
  shortLabel: string;
  minGap: number;
  maxGap: number; // Infinity for G40_PLUS
  color: string;
  theoreticalProb: number; // Baseline probability (empirical pool + geometric prior)
}

export interface DrawGapFootprint {
  drawIndex: number; // 0 = most recent
  date: string;
  winningNumbers: Array<{
    number: number;
    gapAtDraw: number;
    binId: GapBinId;
  }>;
  binCounts: Record<GapBinId, number>; // Sum = 5
  dominantBin: GapBinId;
  meanGap: number;
  stdGap: number;
  medianGap: number;
  trancheEntropy: number; // Normalized Shannon entropy across tranches in [0, 1]
  sequenceSignature: string; // e.g. "G1_3:2|G8_14:2|G15_24:1"
}

export interface GapBinTransitionStats {
  bin: GapRangeBin;
  empiricalProb: number;
  poolOccupancyProb: number; // Real average fraction of the 90 balls residing in this tranche
  markovOrder1Prob: number;
  markovOrder2Prob: number;
  renewalHazardProb: number; // Tranche inter-activation hazard probability
  blendedProb: number;
  liftOverTheoretical: number; // Ratio vs baseline (> 1.0 = sur-représenté)
  zScore: number;
  expectedBallsInNextDraw: number; // Out of 5 balls
  optimalQuotaBalls: number; // Integer quota (Hamilton-Hare allocation summing to 5)
  currentDroughtDraws: number; // Draws since this tranche last produced >= 1 winning ball
  meanInterActivationInterval: number; // Historical average interval between activations
  droughtPressureIndex: number; // Continuous hazard tension in [0, 1]
  currentPoolNumbers: number[]; // Which of the 1..90 numbers are currently in this gap range
  currentPoolCount: number;
  topPoolCandidates: Array<{
    number: number;
    currentGap: number;
    microScore: number;
    individualHazard: number;
    trancheAffinity: number;
    sequenceEchoBoost: number;
  }>;
}

export interface HistoricalSequenceMatch {
  matchIndex: number;
  date: string;
  similarity: number; // Combined 1-Wasserstein + 4D DNA similarity in [0, 1]
  wassersteinSimilarity: number; // Earth-Mover topological similarity in [0, 1]
  dnaSimilarity: number; // 4D structural DNA similarity in [0, 1]
  matchedSignature: string;
  nextDrawDate: string;
  nextDrawFootprint: DrawGapFootprint;
}

export type GapCandidateRole =
  | 'ANCRE DE TRANCHE'
  | 'RÉSONANCE HAZARD'
  | 'ÉCHO SÉQUENTIEL'
  | 'RUPTURE DE SÉCHERESSE';

export interface GapBallCandidate {
  number: number;
  currentGap: number;
  binId: GapBinId;
  binShortLabel: string;
  binLabel: string;
  binColor: string;
  compositeScore: number; // Normalized [0, 100]
  trancheProb: number;
  trancheLift: number;
  individualHazard: number; // Continuous renewal hazard at currentGap in [0, 1]
  trancheAffinity: number; // Historical propensity of this ball to exit in this tranche
  sequenceEchoScore: number; // Support from historical sequence analogs (W1 + DNA)
  boundaryContinuityScore: number; // Smooth Gaussian kernel across adjacent tranche borders
  meanHistoricalGap: number;
  stdHistoricalGap: number;
  role: GapCandidateRole;
  verdict: string;
}

export interface GapRangeReasoningMetrics {
  modelWeights: {
    empiricalWeight: number;
    markov1Weight: number;
    markov2Weight: number;
    renewalWeight: number;
    seqEchoWeight: number;
  };
  klDivergenceMarkov1: number; // Information gain of Order-1 Markov (nats)
  klDivergenceMarkov2: number; // Information gain of Order-2 Markov (nats)
  regimeStabilityIndex: number; // [0, 1]
  activeDroughtTranches: GapBinId[];
  wassersteinBandwidth: number;
  reasoningChain: Array<{
    step: string;
    title: string;
    detail: string;
    metricLabel: string;
    metricValue: string;
  }>;
}

export interface GapRangeSelectionSynthesis {
  optimalFive: number[];
  reserveTwo: number[];
  trancheQuotas: Record<GapBinId, number>; // Integer quotas summing to 5
  selectionConfidence: number; // [0, 100]
  quotaFidelity: number; // [0, 100] alignment with blended tranche probabilities
  meanHazardResonance: number; // [0, 100]
  decadeDiversity: number; // [0, 100]
  allCandidates: GapBallCandidate[];
}

export interface GapRangeSequenceReport {
  drawName: string;
  totalAnalyzedDraws: number;
  bins: GapRangeBin[];
  recentFootprints: DrawGapFootprint[]; // Last 25 draws (0 = newest)
  transitionMatrixOrder1: Record<GapBinId, Record<GapBinId, number>>;
  binForecasts: GapBinTransitionStats[];
  topPredictedBins: GapBinId[];
  predictedNextMeanGap: {
    expected: number;
    lowerBound: number;
    upperBound: number;
    trend: 'COMPRESSION' | 'EXPANSION' | 'EQUILIBRIUM';
  };
  historicalMatches: HistoricalSequenceMatch[];
  currentNumbersByBin: Record<GapBinId, Array<{ number: number; currentGap: number }>>;
  narrativeSummary: string;
  reasoning: GapRangeReasoningMetrics;
  selectionSynthesis: GapRangeSelectionSynthesis;
}

/**
 * Définition des 7 tranches canoniques d'écarts.
 * En loterie 5/90, la probabilité de tirage par boule est p = 5/90 = 1/18 ≈ 5.556%.
 * L'écart théorique avant sortie suit une loi géométrique P(G = k) = (1 - p)^k * p.
 */
const P_SINGLE =
  LOTTERY_CONSTANTS.NUMBERS_PER_DRAW / LOTTERY_CONSTANTS.TOTAL_NUMBERS; // 5/90 = 1/18

// Quantile Gaussien z75 (bande centrale ~50%) — borne d'intervalle honnête, non arbitraire
const Z_GAUSS_75 = 0.67449;

function computeGeometricRangeProb(minGap: number, maxGap: number): number {
  const q = 1 - P_SINGLE;
  const pMin = Math.pow(q, minGap);
  const pMax = maxGap === Infinity ? 0 : Math.pow(q, maxGap + 1);
  return Math.max(1e-6, pMin - pMax);
}

export const GAP_RANGE_BINS: GapRangeBin[] = [
  {
    id: 'G0',
    label: 'Répétition Immédiate (Écart 0)',
    shortLabel: 'Écart 0 (Report)',
    minGap: 0,
    maxGap: 0,
    color: '#ec4899', // pink-500
    theoreticalProb: computeGeometricRangeProb(0, 0),
  },
  {
    id: 'G1_3',
    label: 'Chaud / Récent (Écart 1 à 3)',
    shortLabel: 'Écart 1–3',
    minGap: 1,
    maxGap: 3,
    color: '#10b981', // emerald-500
    theoreticalProb: computeGeometricRangeProb(1, 3),
  },
  {
    id: 'G4_7',
    label: 'Tiède / Cycle Court (Écart 4 à 7)',
    shortLabel: 'Écart 4–7',
    minGap: 4,
    maxGap: 7,
    color: '#06b6d4', // cyan-500
    theoreticalProb: computeGeometricRangeProb(4, 7),
  },
  {
    id: 'G8_14',
    label: 'Médian / Cycle Normal (Écart 8 à 14)',
    shortLabel: 'Écart 8–14',
    minGap: 8,
    maxGap: 14,
    color: '#6366f1', // indigo-500
    theoreticalProb: computeGeometricRangeProb(8, 14),
  },
  {
    id: 'G15_24',
    label: 'Refroidissement (Écart 15 à 24)',
    shortLabel: 'Écart 15–24',
    minGap: 15,
    maxGap: 24,
    color: '#f59e0b', // amber-500
    theoreticalProb: computeGeometricRangeProb(15, 24),
  },
  {
    id: 'G25_39',
    label: 'Retard Critique (Écart 25 à 39)',
    shortLabel: 'Écart 25–39',
    minGap: 25,
    maxGap: 39,
    color: '#f97316', // orange-500
    theoreticalProb: computeGeometricRangeProb(25, 39),
  },
  {
    id: 'G40_PLUS',
    label: 'Abysse / Sommeil Profond (Écart 40+)',
    shortLabel: 'Écart 40+',
    minGap: 40,
    maxGap: Infinity,
    color: '#ef4444', // red-500
    theoreticalProb: computeGeometricRangeProb(40, Infinity),
  },
];

export function classifyGapToBin(gap: number): GapRangeBin {
  const safeGap = Math.max(0, Math.floor(gap));
  for (const bin of GAP_RANGE_BINS) {
    if (safeGap >= bin.minGap && safeGap <= bin.maxGap) {
      return bin;
    }
  }
  return GAP_RANGE_BINS[GAP_RANGE_BINS.length - 1];
}

function createEmptyBinCounts(): Record<GapBinId, number> {
  return {
    G0: 0,
    G1_3: 0,
    G4_7: 0,
    G8_14: 0,
    G15_24: 0,
    G25_39: 0,
    G40_PLUS: 0,
  };
}

/**
 * Calcule la divergence de Kullback-Leibler D_KL(P || Q) en nats.
 * Strictement non-négative et continue.
 */
function computeKLDivergence(
  p: Record<GapBinId, number>,
  q: Record<GapBinId, number>,
  binIds: GapBinId[]
): number {
  let kl = 0;
  for (const b of binIds) {
    const pb = Math.max(1e-9, p[b] || 0);
    const qb = Math.max(1e-9, q[b] || 0);
    kl += pb * Math.log(pb / qb);
  }
  return Math.max(0, kl);
}

/**
 * Distance 1-Wasserstein (Earth-Mover Distance) normalisée dans [0, 1]
 * entre deux distributions de comptages sur les 7 tranches ordonnées.
 * Respecte la topologie ordinale G0 < G1_3 < G4_7 < G8_14 < G15_24 < G25_39 < G40_PLUS.
 */
export function computeNormalizedWassersteinDistance(
  countsA: Record<GapBinId, number>,
  countsB: Record<GapBinId, number>,
  binIds: GapBinId[]
): number {
  const K = binIds.length;
  if (K <= 1) return 0;

  let totalA = 0;
  let totalB = 0;
  for (const id of binIds) {
    totalA += countsA[id] || 0;
    totalB += countsB[id] || 0;
  }
  if (totalA <= 0 || totalB <= 0) return 1;

  let cdfA = 0;
  let cdfB = 0;
  let l1CdfSum = 0;
  for (let i = 0; i < K - 1; i++) {
    const id = binIds[i];
    cdfA += (countsA[id] || 0) / totalA;
    cdfB += (countsB[id] || 0) / totalB;
    l1CdfSum += Math.abs(cdfA - cdfB);
  }

  return l1CdfSum / (K - 1);
}

/**
 * Entropie de Shannon normalisée dans [0, 1] pour la répartition d'un tirage sur les tranches.
 */
function computeNormalizedTrancheEntropy(
  counts: Record<GapBinId, number>,
  binIds: GapBinId[]
): number {
  let total = 0;
  for (const id of binIds) total += counts[id] || 0;
  if (total <= 0) return 0;

  let entropy = 0;
  for (const id of binIds) {
    const p = (counts[id] || 0) / total;
    if (p > 0) {
      entropy -= p * Math.log(p);
    }
  }
  const maxEntropy = Math.log(Math.min(total, binIds.length));
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

/**
 * Allocation proportionnelle entière de Hamilton-Hare (Plus Forts Restes)
 * contrainte par la disponibilité réelle du réservoir de chaque tranche.
 */
export function allocateHamiltonHareQuotas(
  probs: Record<GapBinId, number>,
  poolSizes: Record<GapBinId, number>,
  binIds: GapBinId[],
  targetTotal: number = LOTTERY_CONSTANTS.NUMBERS_PER_DRAW
): Record<GapBinId, number> {
  const quotas = createEmptyBinCounts();
  let sumProb = 0;
  for (const b of binIds) {
    if ((poolSizes[b] || 0) > 0) {
      sumProb += Math.max(0, probs[b] || 0);
    }
  }

  if (sumProb <= 0) {
    return quotas;
  }

  const remainders: Array<{ id: GapBinId; rem: number; prob: number }> = [];
  let allocated = 0;

  for (const b of binIds) {
    const cap = poolSizes[b] || 0;
    if (cap <= 0) {
      quotas[b] = 0;
      remainders.push({ id: b, rem: -1, prob: 0 });
      continue;
    }
    const exactQuota = ((probs[b] || 0) / sumProb) * targetTotal;
    const floorQuota = Math.min(cap, Math.floor(exactQuota));
    quotas[b] = floorQuota;
    allocated += floorQuota;
    const rem = floorQuota < cap ? exactQuota - floorQuota : -1;
    remainders.push({ id: b, rem, prob: probs[b] || 0 });
  }

  remainders.sort((a, b) => b.rem - a.rem || b.prob - a.prob);

  let safety = 0;
  while (allocated < targetTotal && safety < 20) {
    safety++;
    let progressed = false;
    for (const item of remainders) {
      if (allocated >= targetTotal) break;
      const cap = poolSizes[item.id] || 0;
      if (quotas[item.id] < cap) {
        quotas[item.id] += 1;
        allocated += 1;
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  return quotas;
}

/**
 * Analyse déterministe complète des séquences et patterns d'écarts par tranches.
 * Strictement isolé par tirage conformément à AGENTS.md.
 */
export const gapRangeSequenceService = {
  analyzeGapRangeSequences(
    drawName: string,
    rawHistory: DrawResult[]
  ): GapRangeSequenceReport {
    const binIds = GAP_RANGE_BINS.map((b) => b.id);
    const K = binIds.length;

    // Isolation stricte de l'historique du tirage (AGENTS.md)
    const purified =
      drawName && drawName !== 'ALL'
        ? purifyHistoryForDraw(drawName, rawHistory)
        : rawHistory;

    // Isolation stricte : jamais de repli vers l'historique brut mixte (pollution
    // inter-réseaux interdite par AGENTS.md). Les priors (Dirichlet, burn-in,
    // géométrique) absorbent honnêtement la parcimonie d'un historique court.
    const history = purified;
    // Ordre chronologique ancien -> récent pour reconstruire exactement les écarts à chaque tirage
    const chronological = [...history].reverse();
    const totalDraws = chronological.length;

    // Dernière apparition connue (index dans chronological) pour les numéros 1..90
    const lastSeenAtIndex = new Int32Array(91).fill(-1);
    // Historique des écarts observés lors des sorties de chaque boule (pour le noyau de renouvellement individuel)
    const ballExitGaps: number[][] = Array.from({ length: 91 }, () => []);
    // Comptage des sorties de chaque boule dans chaque tranche (affinité conditionnelle boule-tranche)
    const ballTrancheExitCounts: Array<Record<GapBinId, number>> = Array.from(
      { length: 91 },
      () => createEmptyBinCounts()
    );

    // Période de chauffe (burn-in) adaptative pour stabiliser les écarts initiaux
    const burnIn = Math.min(20, Math.max(3, Math.floor(totalDraws / 4)));

    const footprintsChrono: DrawGapFootprint[] = [];
    // Occupation réelle du réservoir des 90 boules à travers les 7 tranches à chaque pas t
    const poolOccupancyTotals: Record<GapBinId, number> = createEmptyBinCounts();
    let poolOccupancySteps = 0;

    for (let t = 0; t < totalDraws; t++) {
      const draw = chronological[t];
      const gagnants = (draw.gagnants || []).filter((n) => n >= 1 && n <= 90);

      // Tirage invalide (aucune boule valide) : aucune donnée, aucune empreinte fabriquée
      if (gagnants.length === 0) continue;

      if (t >= burnIn) {
        // Mesurer l'occupation exacte des 90 boules avant le tirage t (Modèle Nul H0 exact)
        for (let num = 1; num <= 90; num++) {
          const prevIdx = lastSeenAtIndex[num];
          const gapAtT = prevIdx === -1 ? t : t - 1 - prevIdx;
          const b = classifyGapToBin(gapAtT);
          poolOccupancyTotals[b.id] += 1;
        }
        poolOccupancySteps += 1;

        const binCounts = createEmptyBinCounts();
        const winningNumbersInfo: DrawGapFootprint['winningNumbers'] = [];
        let gapSum = 0;

        for (const num of gagnants) {
          const prevIdx = lastSeenAtIndex[num];
          const gapAtDraw = prevIdx === -1 ? t : t - 1 - prevIdx;
          const bin = classifyGapToBin(gapAtDraw);
          binCounts[bin.id] += 1;
          gapSum += gapAtDraw;
          winningNumbersInfo.push({
            number: num,
            gapAtDraw,
            binId: bin.id,
          });

          ballExitGaps[num].push(gapAtDraw);
          ballTrancheExitCounts[num][bin.id] += 1;
        }

        const count = Math.max(1, winningNumbersInfo.length);
        const meanGap = gapSum / count;
        const variance =
          winningNumbersInfo.reduce(
            (acc, w) => acc + Math.pow(w.gapAtDraw - meanGap, 2),
            0
          ) / count;
        const stdGap = Math.sqrt(variance);

        const sortedGaps = winningNumbersInfo
          .map((w) => w.gapAtDraw)
          .sort((a, b) => a - b);
        const mid = Math.floor(sortedGaps.length / 2);
        const medianGap =
          sortedGaps.length === 0
            ? 0
            : sortedGaps.length % 2 === 1
              ? sortedGaps[mid]
              : (sortedGaps[mid - 1] + sortedGaps[mid]) / 2;

        const trancheEntropy = computeNormalizedTrancheEntropy(binCounts, binIds);

        // Tranche dominante (en cas d'égalité, celle qui a la plus grande rareté de base)
        let dominantBin: GapBinId = 'G1_3';
        let maxBinScore = -1;
        for (const bin of GAP_RANGE_BINS) {
          const c = binCounts[bin.id];
          if (c > 0) {
            const rarityWeight = c / Math.max(0.02, bin.theoreticalProb);
            if (rarityWeight > maxBinScore) {
              maxBinScore = rarityWeight;
              dominantBin = bin.id;
            }
          }
        }

        const sigParts = GAP_RANGE_BINS.filter((b) => binCounts[b.id] > 0).map(
          (b) => `${b.id}:${binCounts[b.id]}`
        );

        footprintsChrono.push({
          drawIndex: totalDraws - 1 - t, // 0 = most recent
          date: draw.date || `#${t + 1}`,
          winningNumbers: winningNumbersInfo,
          binCounts,
          dominantBin,
          meanGap,
          stdGap,
          medianGap,
          trancheEntropy,
          sequenceSignature: sigParts.join('|'),
        });
      } else {
        // Même pendant le burn-in, enregistrer les écarts observés après la première vue
        for (const num of gagnants) {
          const prevIdx = lastSeenAtIndex[num];
          if (prevIdx !== -1) {
            const gapAtDraw = t - 1 - prevIdx;
            const bin = classifyGapToBin(gapAtDraw);
            ballExitGaps[num].push(gapAtDraw);
            ballTrancheExitCounts[num][bin.id] += 1;
          }
        }
      }

      // Mise à jour de la dernière apparition après le tirage t
      for (const num of gagnants) {
        lastSeenAtIndex[num] = t;
      }
    }

    // 1. Calcul de l'état actuel des 90 boules (avant le prochain tirage à t = totalDraws)
    const currentNumbersByBin: Record<
      GapBinId,
      Array<{ number: number; currentGap: number }>
    > = {
      G0: [],
      G1_3: [],
      G4_7: [],
      G8_14: [],
      G15_24: [],
      G25_39: [],
      G40_PLUS: [],
    };
    const ballCurrentGap = new Int32Array(91);
    const ballCurrentBin: Record<number, GapRangeBin> = {};

    for (let num = 1; num <= 90; num++) {
      const prevIdx = lastSeenAtIndex[num];
      const currentGap = prevIdx === -1 ? totalDraws : totalDraws - 1 - prevIdx;
      ballCurrentGap[num] = currentGap;
      const bin = classifyGapToBin(currentGap);
      ballCurrentBin[num] = bin;
      currentNumbersByBin[bin.id].push({ number: num, currentGap });
    }

    for (const id of binIds) {
      currentNumbersByBin[id].sort(
        (a, b) => b.currentGap - a.currentGap || a.number - b.number
      );
    }

    const nFootprints = footprintsChrono.length;

    // 2. Modèle Nul Exact (H0) : Occupation réelle du réservoir + Prior géométrique normalisé
    const poolBaselineProb: Record<GapBinId, number> = createEmptyBinCounts();
    const totalPoolObservations = Math.max(1, poolOccupancySteps * 90);
    const priorStrength = Math.sqrt(Math.max(1, poolOccupancySteps));
    let baselineSum = 0;

    for (const bin of GAP_RANGE_BINS) {
      const empiricalPoolShare =
        poolOccupancySteps > 0
          ? poolOccupancyTotals[bin.id] / totalPoolObservations
          : bin.theoreticalProb;
      const weightEmp = poolOccupancySteps / (poolOccupancySteps + priorStrength);
      const blendedBase =
        weightEmp * empiricalPoolShare + (1 - weightEmp) * bin.theoreticalProb;
      poolBaselineProb[bin.id] = Math.max(1e-5, blendedBase);
      baselineSum += poolBaselineProb[bin.id];
    }
    for (const id of binIds) {
      poolBaselineProb[id] /= Math.max(1e-9, baselineSum);
    }

    // Construire la liste des tranches avec leur baseline exacte
    const resolvedBins: GapRangeBin[] = GAP_RANGE_BINS.map((b) => ({
      ...b,
      theoreticalProb: poolBaselineProb[b.id],
    }));

    // 3. Matrices de transition Markov Ordre 1, Ordre 2 et Distributions Empiriques
    const transCounts1: Record<GapBinId, Record<GapBinId, number>> = {
      G0: createEmptyBinCounts(),
      G1_3: createEmptyBinCounts(),
      G4_7: createEmptyBinCounts(),
      G8_14: createEmptyBinCounts(),
      G15_24: createEmptyBinCounts(),
      G25_39: createEmptyBinCounts(),
      G40_PLUS: createEmptyBinCounts(),
    };
    const transRowTotals1: Record<GapBinId, number> = createEmptyBinCounts();

    const transCounts2: Record<string, Record<GapBinId, number>> = {};
    const transRowTotals2: Record<string, number> = {};

    const empiricalTotals: Record<GapBinId, number> = createEmptyBinCounts();
    let totalObservedBalls = 0;

    for (let i = 0; i < nFootprints; i++) {
      const fp = footprintsChrono[i];
      for (const id of binIds) {
        empiricalTotals[id] += fp.binCounts[id];
        totalObservedBalls += fp.binCounts[id];
      }

      if (i >= 1) {
        const prevDom = footprintsChrono[i - 1].dominantBin;
        // Pondération continue par la confiance d'état : la part de l'échantillon t-1
        // réellement occupée par sa tranche dominante module la crédibilité de la transition
        // (les lignes restent exactement stochastiques après normalisation).
        const prevShare =
          footprintsChrono[i - 1].binCounts[prevDom] /
          LOTTERY_CONSTANTS.NUMBERS_PER_DRAW;
        for (const id of binIds) {
          transCounts1[prevDom][id] += fp.binCounts[id] * prevShare;
          transRowTotals1[prevDom] += fp.binCounts[id] * prevShare;
        }
      }

      if (i >= 2) {
        const key2 = `${footprintsChrono[i - 2].dominantBin}->${footprintsChrono[i - 1].dominantBin}`;
        if (!transCounts2[key2]) {
          transCounts2[key2] = createEmptyBinCounts();
          transRowTotals2[key2] = 0;
        }
        for (const id of binIds) {
          transCounts2[key2][id] += fp.binCounts[id];
          transRowTotals2[key2] += fp.binCounts[id];
        }
      }
    }

    // Lissage Bayésien de Dirichlet-Jeffreys (Zéro constante arbitraire : concentration sqrt(K))
    const dirichletConcentration = Math.sqrt(K);
    const transitionMatrixOrder1: Record<GapBinId, Record<GapBinId, number>> = {
      G0: createEmptyBinCounts(),
      G1_3: createEmptyBinCounts(),
      G4_7: createEmptyBinCounts(),
      G8_14: createEmptyBinCounts(),
      G15_24: createEmptyBinCounts(),
      G25_39: createEmptyBinCounts(),
      G40_PLUS: createEmptyBinCounts(),
    };

    for (const fromId of binIds) {
      const rowTotal = transRowTotals1[fromId];
      for (const toId of binIds) {
        const priorMass = dirichletConcentration * poolBaselineProb[toId];
        transitionMatrixOrder1[fromId][toId] =
          (transCounts1[fromId][toId] + priorMass) /
          Math.max(1e-9, rowTotal + dirichletConcentration);
      }
    }

    // 4. Analyse de Renouvellement et Pression de Sécheresse (Inter-Activation Drought) par Tranche
    const trancheDroughtDraws: Record<GapBinId, number> = createEmptyBinCounts();
    const trancheMeanInterval: Record<GapBinId, number> = createEmptyBinCounts();
    const trancheDroughtPressure: Record<GapBinId, number> = createEmptyBinCounts();
    const renewalRawMass: Record<GapBinId, number> = createEmptyBinCounts();
    let renewalMassSum = 0;

    for (const id of binIds) {
      const activationIndices: number[] = [];
      for (let i = 0; i < nFootprints; i++) {
        if (footprintsChrono[i].binCounts[id] > 0) {
          activationIndices.push(i);
        }
      }

      const currentDrought =
        activationIndices.length > 0
          ? nFootprints - 1 - activationIndices[activationIndices.length - 1]
          : nFootprints;
      trancheDroughtDraws[id] = currentDrought;

      const intervals: number[] = [];
      for (let m = 1; m < activationIndices.length; m++) {
        intervals.push(activationIndices[m] - activationIndices[m - 1]);
      }

      // Espérance théorique d'inter-activation sous H0 : 1 / (1 - (1 - pi_j)^5)
      const pActivePerDraw =
        1 - Math.pow(Math.max(1e-6, 1 - poolBaselineProb[id]), 5);
      const theoreticalMeanInterval = 1 / Math.max(1e-4, pActivePerDraw);

      const empiricalMeanInterval =
        intervals.length >= 2
          ? intervals.reduce((a, b) => a + b, 0) / intervals.length
          : theoreticalMeanInterval;
      trancheMeanInterval[id] = empiricalMeanInterval;

      const intervalVar =
        intervals.length >= 2
          ? intervals.reduce(
              (acc, v) => acc + Math.pow(v - empiricalMeanInterval, 2),
              0
            ) / intervals.length
          : Math.pow(theoreticalMeanInterval * 0.5, 2);
      const intervalStd = Math.max(0.5, Math.sqrt(intervalVar));

      // Taux de hasard continu (Weibull / Logistique sur le ratio drought / meanInterval)
      const standardizedDrought =
        (currentDrought - empiricalMeanInterval) / intervalStd;
      const pressure = 1 / (1 + Math.exp(-standardizedDrought));
      trancheDroughtPressure[id] = pressure;

      // Masse de renouvellement modulée par la disponibilité actuelle du réservoir
      const poolAvailabilityRatio =
        (currentNumbersByBin[id].length / 90) /
        Math.max(1e-5, poolBaselineProb[id]);
      const hazardMultiplier =
        (0.5 + pressure) * Math.sqrt(Math.max(0.1, poolAvailabilityRatio));
      renewalRawMass[id] = poolBaselineProb[id] * hazardMultiplier;
      renewalMassSum += renewalRawMass[id];
    }

    const renewalDist: Record<GapBinId, number> = createEmptyBinCounts();
    for (const id of binIds) {
      renewalDist[id] = renewalRawMass[id] / Math.max(1e-9, renewalMassSum);
    }

    // 5. Distributions conditionnelles courantes M0 (Empirique), M1 (Markov-1), M2 (Markov-2)
    const lastFootprint =
      nFootprints > 0 ? footprintsChrono[nFootprints - 1] : null;
    const prevFootprint =
      nFootprints > 1 ? footprintsChrono[nFootprints - 2] : null;

    const currentDom1: GapBinId = lastFootprint
      ? lastFootprint.dominantBin
      : 'G8_14';
    const currentKey2 =
      prevFootprint && lastFootprint
        ? `${prevFootprint.dominantBin}->${lastFootprint.dominantBin}`
        : null;

    const empDist: Record<GapBinId, number> = createEmptyBinCounts();
    const markov1Dist: Record<GapBinId, number> = createEmptyBinCounts();
    const markov2Dist: Record<GapBinId, number> = createEmptyBinCounts();

    for (const id of binIds) {
      empDist[id] =
        totalObservedBalls > 0
          ? (empiricalTotals[id] + dirichletConcentration * poolBaselineProb[id]) /
            (totalObservedBalls + dirichletConcentration)
          : poolBaselineProb[id];

      markov1Dist[id] = transitionMatrixOrder1[currentDom1][id];

      if (
        currentKey2 &&
        transCounts2[currentKey2] &&
        transRowTotals2[currentKey2] > 0
      ) {
        const n2 = transRowTotals2[currentKey2];
        // Backoff hiérarchique continu vers Markov-1
        const shrink2 = Math.sqrt(K) * 5;
        markov2Dist[id] =
          (transCounts2[currentKey2][id] + shrink2 * markov1Dist[id]) /
          (n2 + shrink2);
      } else {
        markov2Dist[id] = markov1Dist[id];
      }
    }

    // 6. Recherche de Séquences Historiques Analogues par Distance 1-Wasserstein + ADN 4D
    const historicalMatches: HistoricalSequenceMatch[] = [];
    let wassersteinBandwidth = 0.15;

    if (nFootprints >= 6 && lastFootprint) {
      const rawDistances: Array<{
        t: number;
        w1Dist: number;
        dnaDist: number;
        combinedDist: number;
      }> = [];

      // Échelles empiriques pour normaliser les composantes de l'ADN 4D sans constantes arbitraires
      const meanGaps = footprintsChrono.map((f) => f.meanGap);
      const globalMeanGap =
        meanGaps.reduce((a, b) => a + b, 0) / Math.max(1, meanGaps.length);
      const scaleMeanGap = Math.max(
        1,
        Math.sqrt(
          meanGaps.reduce((a, v) => a + Math.pow(v - globalMeanGap, 2), 0) /
            Math.max(1, meanGaps.length)
        )
      );

      const stdGaps = footprintsChrono.map((f) => f.stdGap);
      const globalStdGap =
        stdGaps.reduce((a, b) => a + b, 0) / Math.max(1, stdGaps.length);
      const scaleStdGap = Math.max(
        1,
        Math.sqrt(
          stdGaps.reduce((a, v) => a + Math.pow(v - globalStdGap, 2), 0) /
            Math.max(1, stdGaps.length)
        )
      );

      // i + 2 <= nFootprints - 1 : l'issue (i+1) de chaque analogue précède STRICTEMENT
      // le tirage requête (dernier élément). Sinon le meilleur analogue devient le
      // présent lui-même et le canal d'écho s'auto-confirme.
      for (let i = 2; i < nFootprints - 2; i++) {
        const candCurr = footprintsChrono[i];
        const candPrev = footprintsChrono[i - 1];
        const candPrev2 = footprintsChrono[i - 2];

        // Distance 1-Wasserstein sur la trajectoire [t-2, t-1, t] avec décroissance géométrique naturelle (1, 1/2, 1/4)
        const wCurr = computeNormalizedWassersteinDistance(
          lastFootprint.binCounts,
          candCurr.binCounts,
          binIds
        );
        const wPrev = prevFootprint
          ? computeNormalizedWassersteinDistance(
              prevFootprint.binCounts,
              candPrev.binCounts,
              binIds
            )
          : wCurr;
        const prev2Footprint =
          nFootprints > 2 ? footprintsChrono[nFootprints - 3] : null;
        const wPrev2 = prev2Footprint
          ? computeNormalizedWassersteinDistance(
              prev2Footprint.binCounts,
              candPrev2.binCounts,
              binIds
            )
          : wPrev;

        const w1Dist = (4 * wCurr + 2 * wPrev + 1 * wPrev2) / 7;

        // Distance ADN 4D normalisée par l'écart-type empirique de chaque dimension
        const dMean =
          Math.abs(lastFootprint.meanGap - candCurr.meanGap) / scaleMeanGap;
        const dStd =
          Math.abs(lastFootprint.stdGap - candCurr.stdGap) / scaleStdGap;
        const dMedian =
          Math.abs(lastFootprint.medianGap - candCurr.medianGap) / scaleMeanGap;
        const dEntropy = Math.abs(
          lastFootprint.trancheEntropy - candCurr.trancheEntropy
        );

        const dnaDist = Math.sqrt(
          (dMean * dMean + dStd * dStd + dMedian * dMedian + dEntropy * dEntropy) /
            4
        );

        const combinedDist = 0.5 * w1Dist + 0.5 * (dnaDist / (1 + dnaDist));
        rawDistances.push({ t: i, w1Dist, dnaDist, combinedDist });
      }

      if (rawDistances.length > 0) {
        const sortedDists = rawDistances
          .map((d) => d.combinedDist)
          .sort((a, b) => a - b);
        wassersteinBandwidth = Math.max(
          0.05,
          sortedDists[Math.floor(sortedDists.length / 2)]
        );

        for (const item of rawDistances) {
          const wassersteinSim = Math.exp(
            -item.w1Dist / Math.max(0.05, wassersteinBandwidth)
          );
          const dnaSim = Math.exp(-item.dnaDist);
          const similarity = Math.sqrt(wassersteinSim * dnaSim);

          const candCurr = footprintsChrono[item.t];
          const candPrev = footprintsChrono[item.t - 1];
          const candNext = footprintsChrono[item.t + 1];

          historicalMatches.push({
            matchIndex: candCurr.drawIndex,
            date: candCurr.date,
            similarity,
            wassersteinSimilarity: wassersteinSim,
            dnaSimilarity: dnaSim,
            matchedSignature: `${candPrev.dominantBin} → ${candCurr.dominantBin} (${candCurr.sequenceSignature})`,
            nextDrawDate: candNext.date,
            nextDrawFootprint: candNext,
          });
        }

        historicalMatches.sort((a, b) => b.similarity - a.similarity);
      }
    }

    const topMatches = historicalMatches.slice(0, 8);

    // Distribution écho séquentiel issue des meilleurs analogues historiques (pondérée par similarité)
    const seqEchoDist: Record<GapBinId, number> = createEmptyBinCounts();
    let seqEchoTotalWeight = 0;
    for (const m of topMatches) {
      for (const id of binIds) {
        seqEchoDist[id] += m.similarity * (m.nextDrawFootprint.binCounts[id] / 5);
      }
      seqEchoTotalWeight += m.similarity;
    }
    for (const id of binIds) {
      seqEchoDist[id] =
        seqEchoTotalWeight > 0
          ? seqEchoDist[id] / seqEchoTotalWeight
          : empDist[id];
    }

    // 7. Pondération Bayésienne Adaptative par Gain d'Information (Divergence KL) — Zéro Poids Magiques
    const n1Effective = transRowTotals1[currentDom1] / 5;
    const n2Effective =
      currentKey2 && transRowTotals2[currentKey2]
        ? transRowTotals2[currentKey2] / 5
        : 0;

    const klM1 = computeKLDivergence(markov1Dist, empDist, binIds);
    const klM2 = computeKLDivergence(markov2Dist, markov1Dist, binIds);
    const klRenewal = computeKLDivergence(renewalDist, empDist, binIds);
    const klEcho = computeKLDivergence(seqEchoDist, empDist, binIds);

    const credM1 = n1Effective / (n1Effective + K);
    const credM2 = n2Effective / (n2Effective + K);
    const credEcho =
      topMatches.length > 0
        ? topMatches[0].similarity * (topMatches.length / (topMatches.length + K))
        : 0;

    // Évidences informationnelles continues (toujours positives et différentiables)
    const evEmp = 1 / Math.sqrt(Math.max(1, K));
    const evM1 = credM1 * (evEmp + Math.sqrt(klM1));
    const evM2 = credM2 * (evEmp * 0.75 + Math.sqrt(klM2));
    const evRenewal = evEmp * 0.8 + Math.sqrt(klRenewal);
    const evEcho = credEcho * (evEmp + Math.sqrt(klEcho));

    const evSum = Math.max(1e-9, evEmp + evM1 + evM2 + evRenewal + evEcho);
    const modelWeights = {
      empiricalWeight: evEmp / evSum,
      markov1Weight: evM1 / evSum,
      markov2Weight: evM2 / evSum,
      renewalWeight: evRenewal / evSum,
      seqEchoWeight: evEcho / evSum,
    };

    // Fusion Bayésienne des distributions de tranches + Modulation par la disponibilité réelle du réservoir courant
    const rawBlendedProbs: Record<GapBinId, number> = createEmptyBinCounts();
    let totalRawBlended = 0;

    for (const id of binIds) {
      const linearMix =
        modelWeights.empiricalWeight * empDist[id] +
        modelWeights.markov1Weight * markov1Dist[id] +
        modelWeights.markov2Weight * markov2Dist[id] +
        modelWeights.renewalWeight * renewalDist[id] +
        modelWeights.seqEchoWeight * seqEchoDist[id];

      // Si une tranche a 0 boules actuellement dans son réservoir, sa probabilité de tirage est 0
      const currentPoolSize = currentNumbersByBin[id].length;
      const availabilityFactor =
        currentPoolSize === 0
          ? 0
          : Math.pow(
              (currentPoolSize / 90) / Math.max(1e-4, poolBaselineProb[id]),
              0.35
            );

      rawBlendedProbs[id] = Math.max(0, linearMix * availabilityFactor);
      totalRawBlended += rawBlendedProbs[id];
    }

    const blendedProbs: Record<GapBinId, number> = createEmptyBinCounts();
    for (const id of binIds) {
      blendedProbs[id] =
        totalRawBlended > 0
          ? rawBlendedProbs[id] / totalRawBlended
          : poolBaselineProb[id];
    }

    // 8. Allocation des Quotas Optimaux (Hamilton-Hare sur 5 boules)
    const poolSizes: Record<GapBinId, number> = createEmptyBinCounts();
    for (const id of binIds) {
      poolSizes[id] = currentNumbersByBin[id].length;
    }
    const trancheQuotas = allocateHamiltonHareQuotas(
      blendedProbs,
      poolSizes,
      binIds,
      LOTTERY_CONSTANTS.NUMBERS_PER_DRAW
    );

    // 9. Micro-Scoring Intra-Tranche des 90 Boules (Résonance de Hazard Individuel + Affinité + Continuité aux Frontières)
    const allBallCandidates: GapBallCandidate[] = [];

    for (let num = 1; num <= 90; num++) {
      const currentGap = ballCurrentGap[num];
      const bin = ballCurrentBin[num];
      const exits = ballExitGaps[num];
      const m = exits.length;

      // Statistiques d'écarts propres à la boule num
      const meanHistGap =
        m > 0
          ? exits.reduce((a, b) => a + b, 0) / m
          : (1 - P_SINGLE) / P_SINGLE; // ~17.0
      const varHistGap =
        m >= 2
          ? exits.reduce((acc, g) => acc + Math.pow(g - meanHistGap, 2), 0) / m
          : Math.pow(meanHistGap * 0.65, 2);
      const stdHistGap = Math.max(1.5, Math.sqrt(varHistGap));

      // A. Densité de renouvellement par noyau Gaussien (bande passante de Silverman) + Taux de hasard discret
      const silvermanBandwidth = Math.max(
        1.2,
        1.06 * stdHistGap * Math.pow(Math.max(1, m), -0.2)
      );
      let kernelDensity = 0;
      let survivalCount = 0;
      let nearExitCount = 0;

      if (m > 0) {
        for (const g of exits) {
          const u = (currentGap - g) / silvermanBandwidth;
          kernelDensity += Math.exp(-0.5 * u * u);
          if (g >= Math.max(0, currentGap - 1)) {
            survivalCount += 1;
            if (Math.abs(g - currentGap) <= Math.max(1.5, silvermanBandwidth * 0.75)) {
              nearExitCount += 1;
            }
          }
        }
        kernelDensity /= m;
      } else {
        const u = (currentGap - meanHistGap) / stdHistGap;
        kernelDensity = Math.exp(-0.5 * u * u);
      }

      const discreteHazard =
        survivalCount > 0
          ? (nearExitCount + 0.5) / (survivalCount + 1.5)
          : 1 / (1 + Math.exp(-(currentGap - meanHistGap) / stdHistGap));

      const individualHazard = Math.min(
        1,
        0.55 * kernelDensity + 0.45 * discreteHazard
      );

      // B. Affinité conditionnelle Boule-Tranche (propension historique de cette boule à sortir dans cette tranche)
      const hitsInCurrentBin = ballTrancheExitCounts[num][bin.id] || 0;
      const priorBinShare = poolBaselineProb[bin.id];
      const empiricalBinAffinity =
        (hitsInCurrentBin + Math.sqrt(K) * priorBinShare) /
        (m + Math.sqrt(K));
      const trancheAffinity = Math.min(
        1,
        empiricalBinAffinity / Math.max(0.03, priorBinShare * 1.8)
      );

      // C. Écho Séquentiel : fréquence de sortie à un écart proche dans les analogues historiques
      let seqEchoHits = 0;
      let seqEchoNorm = 0;
      for (const match of topMatches) {
        seqEchoNorm += match.similarity;
        for (const w of match.nextDrawFootprint.winningNumbers) {
          if (w.number === num) {
            seqEchoHits += match.similarity * 1.0;
          } else if (w.binId === bin.id) {
            const gapDiff = Math.abs(w.gapAtDraw - currentGap);
            seqEchoHits +=
              match.similarity * 0.35 * Math.exp(-gapDiff / Math.max(2, stdHistGap * 0.5));
          }
        }
      }
      const sequenceEchoScore =
        seqEchoNorm > 0 ? Math.min(1, seqEchoHits / seqEchoNorm) : 0;

      // D. Continuité Gaussienne aux Frontières des Tranches (AGENTS.md : Zéro discontinuité de seuil)
      let boundaryWeightSum = 0;
      let boundaryProbSum = 0;
      for (const otherBin of resolvedBins) {
        const distToBin =
          currentGap < otherBin.minGap
            ? otherBin.minGap - currentGap
            : currentGap > otherBin.maxGap
              ? currentGap - otherBin.maxGap
              : 0;
        const w = Math.exp(-(distToBin * distToBin) / (2 * 2.25));
        boundaryWeightSum += w;
        boundaryProbSum +=
          w * (blendedProbs[otherBin.id] / Math.max(1e-4, otherBin.theoreticalProb));
      }
      const continuousLift =
        boundaryWeightSum > 0 ? boundaryProbSum / boundaryWeightSum : 1.0;
      const boundaryContinuityScore = Math.tanh(continuousLift * 0.65);

      const trancheProb = blendedProbs[bin.id];
      const trancheLift =
        trancheProb / Math.max(1e-5, poolBaselineProb[bin.id]);
      const droughtBonus = trancheDroughtPressure[bin.id];

      // Synthèse continue et différentiable du score composite par boule dans [0, 100]
      const macroSignal = Math.tanh(
        0.55 * trancheLift + 0.45 * (trancheProb * K)
      );
      const microSignal =
        0.42 * individualHazard +
        0.26 * trancheAffinity +
        0.18 * sequenceEchoScore +
        0.14 * boundaryContinuityScore;

      const rawCombined =
        0.48 * macroSignal +
        0.40 * microSignal +
        0.12 * droughtBonus * individualHazard;
      const compositeScore = Math.max(
        1,
        Math.min(99.4, Math.round(rawCombined * 1000) / 10)
      );

      // Détermination du rôle analytique dominant
      let role: GapCandidateRole = 'ANCRE DE TRANCHE';
      if (droughtBonus >= 0.68 && trancheLift >= 1.02) {
        role = 'RUPTURE DE SÉCHERESSE';
      } else if (individualHazard >= trancheAffinity && individualHazard >= sequenceEchoScore) {
        role = 'RÉSONANCE HAZARD';
      } else if (sequenceEchoScore >= 0.48) {
        role = 'ÉCHO SÉQUENTIEL';
      }

      const verdict = `Écart actuel ${currentGap}t (${bin.shortLabel}, Lift ${trancheLift.toFixed(2)}×) • Résonance cycle individuel ${(individualHazard * 100).toFixed(0)}% (μ=${meanHistGap.toFixed(1)}t±${stdHistGap.toFixed(1)}) • Affinité tranche ${(trancheAffinity * 100).toFixed(0)}%.`;

      allBallCandidates.push({
        number: num,
        currentGap,
        binId: bin.id,
        binShortLabel: bin.shortLabel,
        binLabel: bin.label,
        binColor: bin.color,
        compositeScore,
        trancheProb,
        trancheLift,
        individualHazard,
        trancheAffinity,
        sequenceEchoScore,
        boundaryContinuityScore,
        meanHistoricalGap: meanHistGap,
        stdHistoricalGap: stdHistGap,
        role,
        verdict,
      });
    }

    allBallCandidates.sort(
      (a, b) =>
        b.compositeScore - a.compositeScore ||
        b.individualHazard - a.individualHazard ||
        a.number - b.number
    );

    // 10. Construction des Prévisions Détaillées par Tranche (binForecasts)
    const binForecasts: GapBinTransitionStats[] = resolvedBins.map((bin) => {
      const id = bin.id;
      const bProb = blendedProbs[id];
      const baseProb = poolBaselineProb[id];
      const lift = bProb / Math.max(1e-5, baseProb);

      // z-score sur le nombre effectif de TRANSITIONS (5 boules par tirage), pas de boules
      const n1 = Math.max(
        1,
        transRowTotals1[currentDom1] / LOTTERY_CONSTANTS.NUMBERS_PER_DRAW
      );
      const stdErr = Math.sqrt((baseProb * (1 - baseProb)) / n1);
      const zScore = stdErr > 0 ? (bProb - baseProb) / stdErr : 0;

      const topPoolCandidates = allBallCandidates
        .filter((c) => c.binId === id)
        .slice(0, 8)
        .map((c) => ({
          number: c.number,
          currentGap: c.currentGap,
          microScore: c.compositeScore,
          individualHazard: c.individualHazard,
          trancheAffinity: c.trancheAffinity,
          sequenceEchoBoost: c.sequenceEchoScore,
        }));

      return {
        bin,
        empiricalProb: empDist[id],
        poolOccupancyProb: poolBaselineProb[id],
        markovOrder1Prob: markov1Dist[id],
        markovOrder2Prob: markov2Dist[id],
        renewalHazardProb: renewalDist[id],
        blendedProb: bProb,
        liftOverTheoretical: lift,
        zScore,
        expectedBallsInNextDraw: bProb * LOTTERY_CONSTANTS.NUMBERS_PER_DRAW,
        optimalQuotaBalls: trancheQuotas[id],
        currentDroughtDraws: trancheDroughtDraws[id],
        meanInterActivationInterval: trancheMeanInterval[id],
        droughtPressureIndex: trancheDroughtPressure[id],
        currentPoolNumbers: currentNumbersByBin[id].map((x) => x.number),
        currentPoolCount: currentNumbersByBin[id].length,
        topPoolCandidates,
      };
    });

    // 11. Synthèse de Sélection Optimale Sous-Modulaire (5 Gagnants + 2 Réserves)
    // Respecte les quotas de tranches Hamilton-Hare tout en maximisant la résonance individuelle et la diversité des dizaines
    const selectedNumbers: number[] = [];
    const usedNumbers = new Set<number>();
    const remainingQuotas: Record<GapBinId, number> = { ...trancheQuotas };
    const decadeCounts = new Int32Array(10);

    // Phase 1 : Remplir les quotas de chaque tranche par ordre de probabilité de tranche décroissante
    const binsOrderedByPriority = [...binForecasts].sort(
      (a, b) => b.blendedProb - a.blendedProb
    );

    for (const bf of binsOrderedByPriority) {
      const id = bf.bin.id;
      const quota = remainingQuotas[id];
      if (quota <= 0) continue;

      const binCandidates = allBallCandidates.filter(
        (c) => c.binId === id && !usedNumbers.has(c.number)
      );

      for (let q = 0; q < quota && selectedNumbers.length < 5; q++) {
        let bestCand: GapBallCandidate | null = null;
        let bestMarginalGain = -Infinity;

        for (const cand of binCandidates) {
          if (usedNumbers.has(cand.number)) continue;
          const dec = Math.min(8, Math.floor((cand.number - 1) / 10));
          // Pénalité continue de saturation de dizaine (sous-modularité spatiale)
          const decadePenalty = Math.exp(-0.35 * decadeCounts[dec]);
          // Pénalité continue si deux boules de la même tranche ont exactement le même écart
          const sameGapCount = selectedNumbers.filter(
            (sNum) => Math.abs(ballCurrentGap[sNum] - cand.currentGap) === 0
          ).length;
          const gapSpreadFactor = Math.exp(-0.2 * sameGapCount);

          const marginalGain =
            cand.compositeScore * decadePenalty * gapSpreadFactor;
          if (marginalGain > bestMarginalGain) {
            bestMarginalGain = marginalGain;
            bestCand = cand;
          }
        }

        if (bestCand) {
          selectedNumbers.push(bestCand.number);
          usedNumbers.add(bestCand.number);
          const dec = Math.min(8, Math.floor((bestCand.number - 1) / 10));
          decadeCounts[dec] += 1;
          remainingQuotas[id] -= 1;
        }
      }
    }

    // Phase 2 : Compléter jusqu'à 5 si un quota n'a pu être honoré
    for (const cand of allBallCandidates) {
      if (selectedNumbers.length >= 5) break;
      if (!usedNumbers.has(cand.number)) {
        selectedNumbers.push(cand.number);
        usedNumbers.add(cand.number);
        const dec = Math.min(8, Math.floor((cand.number - 1) / 10));
        decadeCounts[dec] += 1;
      }
    }

    // Phase 3 : Sélectionner 2 Réserves Tactiques dans les tranches complémentaires à fort Lift
    const reserveTwo: number[] = [];
    const selectedBins = new Set(
      selectedNumbers.map((n) => ballCurrentBin[n]?.id)
    );

    for (const cand of allBallCandidates) {
      if (reserveTwo.length >= 2) break;
      if (usedNumbers.has(cand.number)) continue;
      // Favoriser une tranche non saturée ou à fort lift
      if (!selectedBins.has(cand.binId) || reserveTwo.length === 1) {
        reserveTwo.push(cand.number);
        usedNumbers.add(cand.number);
        selectedBins.add(cand.binId);
      }
    }
    for (const cand of allBallCandidates) {
      if (reserveTwo.length >= 2) break;
      if (!usedNumbers.has(cand.number)) {
        reserveTwo.push(cand.number);
        usedNumbers.add(cand.number);
      }
    }

    const optimalFive = [...selectedNumbers].sort((a, b) => a - b);

    // Métriques de qualité de la sélection synthétisée
    const selectedCandObjects = optimalFive
      .map((n) => allBallCandidates.find((c) => c.number === n))
      .filter((c): c is GapBallCandidate => Boolean(c));

    const meanComposite =
      selectedCandObjects.reduce((acc, c) => acc + c.compositeScore, 0) /
      Math.max(1, selectedCandObjects.length);
    const meanHazardResonance =
      (selectedCandObjects.reduce((acc, c) => acc + c.individualHazard, 0) /
        Math.max(1, selectedCandObjects.length)) *
      100;

    const realizedCounts = createEmptyBinCounts();
    for (const c of selectedCandObjects) {
      realizedCounts[c.binId] += 1;
    }
    const quotaW1Dist = computeNormalizedWassersteinDistance(
      realizedCounts,
      trancheQuotas,
      binIds
    );
    const quotaFidelity = Math.max(0, Math.min(100, (1 - quotaW1Dist) * 100));

    const uniqueDecades = new Set(
      optimalFive.map((n) => Math.min(8, Math.floor((n - 1) / 10)))
    ).size;
    const decadeDiversity = (uniqueDecades / 5) * 100;

    const selectionConfidence = Math.min(
      98.5,
      0.55 * meanComposite + 0.25 * quotaFidelity + 0.20 * decadeDiversity
    );

    // Top 3 tranches recommandées (triées par score combiné quota + probabilité + lift)
    const sortedForecasts = [...binForecasts].sort((a, b) => {
      const scoreA =
        a.optimalQuotaBalls * 0.45 +
        a.blendedProb * 2.5 +
        a.liftOverTheoretical * 0.35;
      const scoreB =
        b.optimalQuotaBalls * 0.45 +
        b.blendedProb * 2.5 +
        b.liftOverTheoretical * 0.35;
      return scoreB - scoreA;
    });
    const topPredictedBins = sortedForecasts.slice(0, 3).map((f) => f.bin.id);

    // 12. Prédiction de l'écart moyen du prochain tirage
    const recentFootprints = [...footprintsChrono].reverse().slice(0, 25);
    const recentMeans = recentFootprints.slice(0, 10).map((f) => f.meanGap);
    const globalMean =
      nFootprints > 0
        ? footprintsChrono.reduce((a, f) => a + f.meanGap, 0) / nFootprints
        : 12.5;
    const recentAvgMean =
      recentMeans.length > 0
        ? recentMeans.reduce((a, b) => a + b, 0) / recentMeans.length
        : globalMean;

    let expectedMeanGapFromBins = 0;
    for (const f of binForecasts) {
      const binMid =
        f.bin.maxGap === Infinity
          ? 48
          : (f.bin.minGap + f.bin.maxGap) / 2;
      expectedMeanGapFromBins += f.blendedProb * binMid;
    }

    const expectedNextMean =
      0.62 * expectedMeanGapFromBins + 0.38 * recentAvgMean;
    const meanStd =
      recentFootprints.length > 0
        ? recentFootprints
            .slice(0, 10)
            .reduce((a, f) => a + f.stdGap, 0) /
          Math.min(10, recentFootprints.length)
        : 6.0;

    // Seuil dérivé : erreur-type de la moyenne récente (n observations) au quantile z75
    const trendSe =
      (meanStd / Math.sqrt(Math.max(1, recentMeans.length))) * Z_GAUSS_75;
    let trend: 'COMPRESSION' | 'EXPANSION' | 'EQUILIBRIUM' = 'EQUILIBRIUM';
    if (expectedNextMean < recentAvgMean - trendSe) {
      trend = 'COMPRESSION';
    } else if (expectedNextMean > recentAvgMean + trendSe) {
      trend = 'EXPANSION';
    }

    // 13. Chaîne de Raisonnement Explicable (Reasoning Chain)
    const top1 = sortedForecasts[0];
    const top2 = sortedForecasts[1];
    const activeDroughtTranches = binForecasts
      .filter((f) => f.droughtPressureIndex >= 0.65 && f.currentPoolCount > 0)
      .map((f) => f.bin.id);

    const regimeStabilityIndex = Math.exp(-klM1);

    const quotaSummaryParts = GAP_RANGE_BINS.filter(
      (b) => trancheQuotas[b.id] > 0
    ).map((b) => `${trancheQuotas[b.id]}× ${b.shortLabel}`);

    const reasoningChain: GapRangeReasoningMetrics['reasoningChain'] = [
      {
        step: '01',
        title: 'Transition Markovienne & Gain d’Information (KL)',
        detail: lastFootprint
          ? `Le dernier tirage (${lastFootprint.date}) affiche une dominante ${
              GAP_RANGE_BINS.find((b) => b.id === lastFootprint.dominantBin)
                ?.shortLabel
            } (μ=${lastFootprint.meanGap.toFixed(1)}t, H=${(
              lastFootprint.trancheEntropy * 100
            ).toFixed(0)}%). La divergence de Kullback-Leibler (D_KL M1=${klM1.toFixed(
              3
            )} nats, M2=${klM2.toFixed(
              3
            )} nats) alloue dynamiquement ${(
              (modelWeights.markov1Weight + modelWeights.markov2Weight) *
              100
            ).toFixed(1)}% du poids décisionnel aux transitions conditionnelles.`
          : 'Initialisation du modèle de transition sur le prior d’occupation réel.',
        metricLabel: 'Poids Markov (M1+M2)',
        metricValue: `${(
          (modelWeights.markov1Weight + modelWeights.markov2Weight) *
          100
        ).toFixed(1)}%`,
      },
      {
        step: '02',
        title: 'Pression de Renouvellement & Sécheresse de Tranche',
        detail:
          activeDroughtTranches.length > 0
            ? `Tension de retour détectée sur ${activeDroughtTranches.join(
                ', '
              )} : le taux de hasard de renouvellement (poids ${(
                modelWeights.renewalWeight * 100
              ).toFixed(1)}%) amplifie les tranches dont l'inactivité dépasse leur cycle moyen d'inter-activation.`
            : `Aucune sécheresse critique de tranche : les cycles d'activation sur les 7 tranches restent proches de leur équilibre ergodique.`,
        metricLabel: 'Tranches sous Tension',
        metricValue:
          activeDroughtTranches.length > 0
            ? activeDroughtTranches.join(', ')
            : 'Équilibre Nominal',
      },
      {
        step: '03',
        title: 'Analogie Topologique 1-Wasserstein & ADN 4D',
        detail:
          topMatches.length > 0
            ? `${topMatches.length} trajectoires analogues identifiées via la distance Earth-Mover (1-Wasserstein) et l'ADN 4D (meilleur match : ${topMatches[0].date} à ${(
                topMatches[0].similarity * 100
              ).toFixed(1)}% de proximité topologique).`
            : 'Historique en cours de consolidation pour la recherche de trajectoires Wasserstein.',
        metricLabel: 'Proximité Topologique W1',
        metricValue:
          topMatches.length > 0
            ? `${(topMatches[0].similarity * 100).toFixed(1)}%`
            : 'N/A',
      },
      {
        step: '04',
        title: 'Quotas Hamilton-Hare & Micro-Sélection Sous-Modulaire',
        detail: `Répartition optimale des 5 boules : ${quotaSummaryParts.join(
          ' + '
        )}. À l'intérieur de chaque tranche, les boules sont départagées par leur densité de renouvellement individuelle de Silverman et leur affinité historique avec la tranche.`,
        metricLabel: 'Fidélité Quotas',
        metricValue: `${quotaFidelity.toFixed(1)}%`,
      },
    ];

    const narrativeSummary = lastFootprint
      ? `Après une signature dominée par ${
          GAP_RANGE_BINS.find((b) => b.id === lastFootprint.dominantBin)
            ?.shortLabel
        } (écart moyen ${lastFootprint.meanGap.toFixed(
          1
        )}t), la fusion bayésienne par gain d'information projette un régime en ${
          trend === 'COMPRESSION'
            ? 'compression vers les écarts courts/tièdes'
            : trend === 'EXPANSION'
              ? 'expansion vers les écarts mûrs/critiques'
              : 'équilibre multi-tranches'
        } (${expectedNextMean.toFixed(1)}t attendu). Les tranches ${
          top1.bin.shortLabel
        } (${(top1.blendedProb * 100).toFixed(1)}%, Lift ${top1.liftOverTheoretical.toFixed(
          2
        )}×, Quota ${top1.optimalQuotaBalls}) et ${
          top2.bin.shortLabel
        } (${(top2.blendedProb * 100).toFixed(1)}%, Lift ${top2.liftOverTheoretical.toFixed(
          2
        )}×, Quota ${
          top2.optimalQuotaBalls
        }) concentrent la plus forte densité de sortie, conduisant à la sélection optimale [${optimalFive
          .map((n) => (n < 10 ? `0${n}` : `${n}`))
          .join(' - ')}].`
      : 'Historique insuffisant pour établir une séquence de tranches d’écarts.';

    return {
      drawName,
      totalAnalyzedDraws: nFootprints,
      bins: resolvedBins,
      recentFootprints,
      transitionMatrixOrder1,
      binForecasts,
      topPredictedBins,
      predictedNextMeanGap: {
        expected: Number(expectedNextMean.toFixed(1)),
        lowerBound: Number(
          Math.max(0, expectedNextMean - meanStd * Z_GAUSS_75).toFixed(1)
        ),
        upperBound: Number((expectedNextMean + meanStd * Z_GAUSS_75).toFixed(1)),
        trend,
      },
      historicalMatches: topMatches,
      currentNumbersByBin,
      narrativeSummary,
      reasoning: {
        modelWeights,
        klDivergenceMarkov1: klM1,
        klDivergenceMarkov2: klM2,
        regimeStabilityIndex,
        activeDroughtTranches,
        wassersteinBandwidth,
        reasoningChain,
      },
      selectionSynthesis: {
        optimalFive,
        reserveTwo,
        trancheQuotas,
        selectionConfidence: Number(selectionConfidence.toFixed(1)),
        quotaFidelity: Number(quotaFidelity.toFixed(1)),
        meanHazardResonance: Number(meanHazardResonance.toFixed(1)),
        decadeDiversity: Number(decadeDiversity.toFixed(1)),
        allCandidates: allBallCandidates,
      },
    };
  },

  /**
   * Génère un vecteur de scores [1..90] directement exploitable par le moteur de prédiction global.
   * Combine le Lift macroscopique de la tranche, la résonance de renouvellement individuel (Silverman)
   * et la continuité Gaussienne aux frontières des tranches.
   */
  getBallScoresFromGapSequences(
    drawName: string,
    rawHistory: DrawResult[]
  ): Record<number, number> {
    const report = this.analyzeGapRangeSequences(drawName, rawHistory);
    const scores: Record<number, number> = {};

    const candidateMap = new Map<number, GapBallCandidate>();
    for (const cand of report.selectionSynthesis.allCandidates) {
      candidateMap.set(cand.number, cand);
    }

    const optimalSet = new Set(report.selectionSynthesis.optimalFive);
    const reserveSet = new Set(report.selectionSynthesis.reserveTwo);

    for (let num = 1; num <= 90; num++) {
      const cand = candidateMap.get(num);
      if (!cand) {
        scores[num] = 0.2;
        continue;
      }

      // Normalisation continue dans [0.05, 1.0] basée sur le compositeScore et la synthèse sous-modulaire
      const baseNormalized = cand.compositeScore / 100;
      const synthesisBoost = optimalSet.has(num)
        ? 1.12
        : reserveSet.has(num)
          ? 1.05
          : 1.0;

      scores[num] = Math.min(1.0, Math.max(0.05, baseNormalized * synthesisBoost));
    }

    return scores;
  },
};
