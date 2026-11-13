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

/**
 * Décomposition des 5 canaux de preuve statistique standardisés (sans unité, N(0, 1) sous H0)
 * combinés par la méthode de Stouffer pour chaque boule candidate.
 */
export interface StoufferChannelBreakdown {
  /** Z-score d'excès conditionnel de la tranche lissé aux frontières par noyau Gaussien */
  zTranche: number;
  /** Z-score de tension inter-activation / sécheresse de tranche (loi de renouvellement) */
  zDrought: number;
  /** Z-score binomial exact de résonance de hasard individuel vs loi géométrique H0 */
  zHazard: number;
  /** Z-score binomial d'affinité conditionnelle Boule–Tranche vs occupation H0 */
  zAffinity: number;
  /** Z-score binomial d'écho séquentiel sur analogues W1+ADN (taille effective de Kish) */
  zEcho: number;
  /** Nombre de canaux actifs contribuant au dénominateur √k de Stouffer */
  activeChannels: number;
}

export interface GapBallCandidate {
  number: number;
  currentGap: number;
  binId: GapBinId;
  binShortLabel: string;
  binLabel: string;
  binColor: string;
  /** Percentile exact de significativité Φ(Z_Stouffer) × 100 dans (0, 100) — neutre à 50.0 sous H0 */
  compositeScore: number;
  /** Score combiné homogène de Stouffer Z_Stouffer = (Σ w_j Z_j) / √(Σ w_j²) en unités σ */
  stoufferZScore: number;
  /** p-value unilatérale supérieure P(Z ≥ Z_Stouffer) sous H0 */
  stoufferPValue: number;
  /** Détail des Z-scores homogènes par canal */
  channelZScores: StoufferChannelBreakdown;
  trancheProb: number;
  trancheLift: number;
  individualHazard: number; // Continuous renewal hazard percentile Φ(zHazard) in (0, 1)
  trancheAffinity: number; // Conditional tranche affinity percentile Φ(zAffinity) in (0, 1)
  sequenceEchoScore: number; // Sequential analog echo percentile Φ(zEcho) in (0, 1)
  boundaryContinuityScore: number; // Boundary-smoothed tranche percentile Φ(zTranche) in (0, 1)
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
  /** Z-score de Stouffer agrégé sur la sélection optimale de 5 boules */
  ticketStoufferZScore?: number;
  /** p-value unilatérale associée à ticketStoufferZScore */
  ticketPValue?: number;
  /** Méthode d'agrégation homogène utilisée */
  scoringMethod?: 'STOUFFER_Z';
  allCandidates: GapBallCandidate[];
}

export interface GapRangeSequenceReport {
  drawName: string;
  totalAnalyzedDraws: number;
  bins: GapRangeBin[];
  recentFootprints: DrawGapFootprint[]; // Last 25 draws (0 = newest)
  transitionMatrixOrder1: Record<GapBinId, Record<GapBinId, number>>;
  transitionRowTotalsOrder1?: Record<GapBinId, number>;
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
  (LOTTERY_CONSTANTS?.NUMBERS_PER_DRAW ?? 5) / (LOTTERY_CONSTANTS?.TOTAL_NUMBERS ?? 90); // 5/90 = 1/18

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
 * Fonction de répartition de la loi normale centrée réduite N(0, 1) : Φ(z) = P(Z ≤ z).
 * Implémentation déterministe (approximation rationnelle d'Abramowitz & Stegun 7.1.26, précision < 1.5e-7).
 */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
    t;
  const erf = 1 - poly * Math.exp(-x * x);
  return Math.max(0, Math.min(1, 0.5 * (1 + sign * erf)));
}

/**
 * p-value unilatérale supérieure P(Z ≥ z) = 1 - Φ(z) sous l'hypothèse nulle H0 : Z ~ N(0, 1).
 */
export function normalUpperPValue(z: number): number {
  return Math.max(0, Math.min(1, 1 - normalCdf(z)));
}

/**
 * Combinaison de Stouffer (1949) de k Z-scores homogènes sans unité :
 *   Z_Stouffer = (Σ_j w_j · Z_j) / √(Σ_j w_j²)
 *
 * Garantit que tous les signaux (macro-tranche, sécheresse, hasard individuel,
 * affinité boule-tranche, écho séquentiel) sont exprimés en écarts-types σ par rapport à H0
 * avant d'être agrégés, éliminant tout mélange arbitraire de probabilités, ratios Lift et scores bruts.
 */
export function combineStoufferZScores(
  channels: Array<{ z: number; weight?: number }>
): { zScore: number; pValue: number; activeChannels: number } {
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
    pValue: normalUpperPValue(zScore),
    activeChannels,
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
  targetTotal: number = LOTTERY_CONSTANTS.NUMBERS_PER_DRAW,
  baselineProbs?: Record<GapBinId, number>,
  sampleSize: number = 25
): Record<GapBinId, number> {
  const quotas = createEmptyBinCounts();

  // Redistribution et rétraction vers H0 : si un profil baseline H0 est fourni
  // et qu'aucune tranche ne présente de déviation statistique significative (|z| >= 1.96),
  // allouer selon les quotas H0 (5 * n_b / 90) pour éviter d'inventer des biais sur du bruit.
  let effectiveProbs = { ...probs };
  if (baselineProbs) {
    let maxZ = 0;
    for (const b of binIds) {
      const p0 = baselineProbs[b] || 0;
      const se = Math.sqrt(Math.max(1e-6, (p0 * (1 - p0)) / Math.max(1, sampleSize)));
      const z = Math.abs((probs[b] || 0) - p0) / se;
      if (z > maxZ) maxZ = z;
    }
    if (maxZ < 1.96) {
      effectiveProbs = { ...baselineProbs };
    }
  }

  let sumProb = 0;
  for (const b of binIds) {
    if ((poolSizes[b] || 0) > 0) {
      sumProb += Math.max(0, effectiveProbs[b] || 0);
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
    const exactQuota = ((effectiveProbs[b] || 0) / sumProb) * targetTotal;
    const floorQuota = Math.min(cap, Math.floor(exactQuota));
    quotas[b] = floorQuota;
    allocated += floorQuota;
    const rem = floorQuota < cap ? exactQuota - floorQuota : -1;
    remainders.push({ id: b, rem, prob: effectiveProbs[b] || 0 });
  }

  // Redistribution des reliquats proportionnellement aux probabilités (prob * rem)
  // plutôt que par l'ordre brut du reste qui favorise arbitrairement les tranches rares à fort reliquat fractionnaire
  remainders.sort(
    (a, b) =>
      b.prob * Math.max(0, b.rem) - a.prob * Math.max(0, a.rem) ||
      b.prob - a.prob ||
      b.rem - a.rem
  );

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
    const trancheDroughtZScore: Record<GapBinId, number> = createEmptyBinCounts();
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

      // Moments exacts sous loi géométrique H0 : I ~ Geom(p_act) sur {1, 2, ...}
      // E[I] = 1 / p_act, E[D_arrière] = (1 - p_act) / p_act = E[I] - 1, Var(I) = (1 - p_act) / p_act²
      const pActivePerDraw =
        1 - Math.pow(Math.max(1e-6, 1 - poolBaselineProb[id]), 5);
      const theoreticalMeanInterval = 1 / Math.max(1e-4, pActivePerDraw);
      const theoreticalVarInterval =
        (1 - pActivePerDraw) / Math.pow(Math.max(1e-4, pActivePerDraw), 2);

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
          : theoreticalVarInterval;
      const intervalStd = Math.max(0.5, Math.sqrt(intervalVar));

      // Temps de récurrence arrière attendu (0 si activé au dernier tirage) : E[I] - 1
      const empiricalMeanDrought = Math.max(0, empiricalMeanInterval - 1);
      const standardizedDrought =
        (currentDrought - empiricalMeanDrought) / intervalStd;
      trancheDroughtZScore[id] = standardizedDrought;

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
      LOTTERY_CONSTANTS.NUMBERS_PER_DRAW,
      poolBaselineProb,
      Math.max(1, transRowTotals1[currentDom1] / LOTTERY_CONSTANTS.NUMBERS_PER_DRAW)
    );

    // 9. Z-Scores par Tranche (référence H0 binomiale) avant le scoring individuel par Stouffer
    const n1ForZ = Math.max(
      1,
      transRowTotals1[currentDom1] / LOTTERY_CONSTANTS.NUMBERS_PER_DRAW
    );
    const binZScore: Record<GapBinId, number> = createEmptyBinCounts();
    for (const id of binIds) {
      const bProb = blendedProbs[id];
      const baseProb = poolBaselineProb[id];
      const stdErr = Math.sqrt(Math.max(1e-9, (baseProb * (1 - baseProb)) / n1ForZ));
      binZScore[id] = stdErr > 0 ? (bProb - baseProb) / stdErr : 0;
    }

    /**
     * 10. Micro-Scoring Statistique Unifié par la Méthode de Stouffer (Z-Scores Homogènes)
     *
     * Remplace l'ancien mélange d'unités hétérogènes (probabilités + ratios Lift + scores de boules)
     * par 5 tests statistiques standardisés en écarts-types N(0, 1) sous le modèle nul exact H0 :
     *   1) zTranche  : Z-score binomial d'excès de la tranche, lissé aux frontières par combinaison
     *                  de Stouffer pondérée par noyau Gaussien (σ² = NUMBERS_PER_DRAW / 2).
     *   2) zDrought  : Z-score standardisé du temps d'attente inter-activation de la tranche.
     *   3) zHazard   : Z-score binomial exact des sorties observées dans la fenêtre de Silverman
     *                  conditionnellement à la survie vs loi géométrique H0 (p = 5/90), rétracté par √K.
     *   4) zAffinity : Z-score binomial d'affinité historique Boule–Tranche vs occupation H0 π₀(b),
     *                  rétracté par concentration de Dirichlet √K.
     *   5) zEcho     : Z-score binomial sur analogues W1+ADN (taille effective de Kish n_eff) vs p₀ = 5/90.
     *
     * Agrégation : Z_Stouffer = (Σ w_j · Z_j) / √(Σ w_j²), puis percentile Φ(Z_Stouffer) × 100.
     */
    const allBallCandidates: GapBallCandidate[] = [];
    const dirichletShrinkagePrior = Math.sqrt(K);
    const boundaryKernelVar = LOTTERY_CONSTANTS.NUMBERS_PER_DRAW / 2; // 2.5 tirages²

    // Taille effective de Kish des analogues topMatches pour le canal d'écho séquentiel
    let echoWeightSum = 0;
    let echoWeightSqSum = 0;
    for (const match of topMatches) {
      echoWeightSum += match.similarity;
      echoWeightSqSum += match.similarity * match.similarity;
    }
    const seqEchoEffectiveN =
      echoWeightSqSum > 0 ? (echoWeightSum * echoWeightSum) / echoWeightSqSum : 0;

    for (let num = 1; num <= 90; num++) {
      const currentGap = ballCurrentGap[num];
      const bin = ballCurrentBin[num];
      const exits = ballExitGaps[num];
      const m = exits.length;

      // Statistiques d'écarts propres à la boule num (moyenne et écart-type empiriques ou géométriques H0)
      const meanHistGap =
        m > 0
          ? exits.reduce((a, b) => a + b, 0) / m
          : (1 - P_SINGLE) / P_SINGLE; // ~17.0
      const geometricVarH0 = (1 - P_SINGLE) / (P_SINGLE * P_SINGLE);
      const varHistGap =
        m >= 2
          ? exits.reduce((acc, g) => acc + Math.pow(g - meanHistGap, 2), 0) / m
          : geometricVarH0;
      const stdHistGap = Math.max(1.5, Math.sqrt(varHistGap));

      // A. Canal zTranche : Combinaison de Stouffer pondérée par noyau Gaussien aux frontières des tranches
      let boundaryZNumerator = 0;
      let boundaryWeightSqSum = 0;
      for (const otherBin of resolvedBins) {
        const distToBin =
          currentGap < otherBin.minGap
            ? otherBin.minGap - currentGap
            : currentGap > otherBin.maxGap
              ? currentGap - otherBin.maxGap
              : 0;
        const w = Math.exp(-(distToBin * distToBin) / (2 * boundaryKernelVar));
        boundaryZNumerator += w * binZScore[otherBin.id];
        boundaryWeightSqSum += w * w;
      }
      const zTranche =
        boundaryWeightSqSum > 0
          ? boundaryZNumerator / Math.sqrt(boundaryWeightSqSum)
          : binZScore[bin.id];

      // B. Canal zDrought : Tension standardisée de renouvellement de la tranche
      const zDrought = trancheDroughtZScore[bin.id];

      // C. Canal zHazard : Test binomial exact de résonance dans la fenêtre de Silverman vs loi géométrique H0
      const silvermanBandwidth = Math.max(
        1.2,
        1.06 * stdHistGap * Math.pow(Math.max(1, m), -0.2)
      );
      const winLow = Math.max(0, Math.floor(currentGap - 1));
      const winHigh = Math.floor(
        currentGap + Math.max(1, Math.round(silvermanBandwidth * 0.75))
      );
      const winLen = Math.max(1, winHigh - winLow + 1);

      let survivalCount = 0;
      let nearExitCount = 0;
      for (const g of exits) {
        if (g >= winLow) {
          survivalCount += 1;
          if (g <= winHigh) {
            nearExitCount += 1;
          }
        }
      }

      // Probabilité conditionnelle exacte sous H0 géométrique sans mémoire : 1 - (1 - p)^L_win
      const p0Win = Math.max(
        1e-6,
        Math.min(1 - 1e-6, 1 - Math.pow(1 - P_SINGLE, winLen))
      );
      let zHazard = 0;
      if (survivalCount > 0) {
        const expectedNear = survivalCount * p0Win;
        const seHazard = Math.sqrt(
          Math.max(1e-9, survivalCount * p0Win * (1 - p0Win))
        );
        const rawZHazard = (nearExitCount - expectedNear) / seHazard;
        const hazardCredibility =
          survivalCount / (survivalCount + dirichletShrinkagePrior);
        zHazard = hazardCredibility * rawZHazard;
      }

      // D. Canal zAffinity : Test binomial d'affinité conditionnelle Boule–Tranche vs occupation H0 π₀(b)
      const hitsInCurrentBin = ballTrancheExitCounts[num][bin.id] || 0;
      const priorBinShare = Math.max(1e-5, Math.min(1 - 1e-5, poolBaselineProb[bin.id]));
      let zAffinity = 0;
      if (m > 0) {
        const expectedBinHits = m * priorBinShare;
        const seAffinity = Math.sqrt(
          Math.max(1e-9, m * priorBinShare * (1 - priorBinShare))
        );
        const rawZAffinity = (hitsInCurrentBin - expectedBinHits) / seAffinity;
        const affinityCredibility = m / (m + dirichletShrinkagePrior);
        zAffinity = affinityCredibility * rawZAffinity;
      }

      // E. Canal zEcho : Test binomial sur analogues séquentiels W1+ADN (taille effective de Kish vs p₀ = 5/90)
      let seqEchoBallHits = 0;
      for (const match of topMatches) {
        if (match.nextDrawFootprint.winningNumbers.some((w) => w.number === num)) {
          seqEchoBallHits += match.similarity;
        }
      }
      let zEcho = 0;
      if (seqEchoEffectiveN > 0 && echoWeightSum > 0) {
        const pEchoHat = seqEchoBallHits / echoWeightSum;
        const seEcho = Math.sqrt(
          Math.max(1e-9, (P_SINGLE * (1 - P_SINGLE)) / seqEchoEffectiveN)
        );
        const rawZEcho = (pEchoHat - P_SINGLE) / seEcho;
        const echoCredibility =
          seqEchoEffectiveN / (seqEchoEffectiveN + dirichletShrinkagePrior);
        zEcho = echoCredibility * rawZEcho;
      }

      // Agrégation homogène par la méthode de Stouffer (tous les canaux actifs en unités σ)
      const stouffer = combineStoufferZScores([
        { z: zTranche, weight: 1 },
        { z: zDrought, weight: 1 },
        { z: zHazard, weight: survivalCount > 0 ? 1 : 0 },
        { z: zAffinity, weight: m > 0 ? 1 : 0 },
        { z: zEcho, weight: seqEchoEffectiveN > 0 ? 1 : 0 },
      ]);

      const stoufferZScore = Number(stouffer.zScore.toFixed(4));
      const stoufferPValue = Number(stouffer.pValue.toFixed(6));
      const compositeScore = Number((normalCdf(stouffer.zScore) * 100).toFixed(1));

      // Conversions percentiles Φ(Z_j) pour la rétrocompatibilité d'affichage [0, 1]
      const individualHazard = Number(normalCdf(zHazard).toFixed(4));
      const trancheAffinity = Number(normalCdf(zAffinity).toFixed(4));
      const sequenceEchoScore = Number(normalCdf(zEcho).toFixed(4));
      const boundaryContinuityScore = Number(normalCdf(zTranche).toFixed(4));

      const trancheProb = blendedProbs[bin.id];
      const trancheLift =
        trancheProb / Math.max(1e-5, poolBaselineProb[bin.id]);

      // Rôle analytique dominant déterminé par le canal Z-score maximal (aucun seuil arbitraire)
      let role: GapCandidateRole = 'ANCRE DE TRANCHE';
      const maxChannelZ = Math.max(zTranche, zDrought, zHazard, zEcho);
      if (maxChannelZ === zDrought && zDrought > zTranche) {
        role = 'RUPTURE DE SÉCHERESSE';
      } else if (maxChannelZ === zHazard && survivalCount > 0) {
        role = 'RÉSONANCE HAZARD';
      } else if (maxChannelZ === zEcho && seqEchoEffectiveN > 0) {
        role = 'ÉCHO SÉQUENTIEL';
      }

      const zSign = stoufferZScore >= 0 ? '+' : '';
      const verdict = `Écart ${currentGap}t (${bin.shortLabel}) • Stouffer Z=${zSign}${stoufferZScore.toFixed(2)}σ (p=${stoufferPValue < 0.001 ? '<0.001' : stoufferPValue.toFixed(3)}) • Z_tr=${zTranche.toFixed(2)}, Z_haz=${zHazard.toFixed(2)}, Z_aff=${zAffinity.toFixed(2)}, Z_echo=${zEcho.toFixed(2)}.`;

      allBallCandidates.push({
        number: num,
        currentGap,
        binId: bin.id,
        binShortLabel: bin.shortLabel,
        binLabel: bin.label,
        binColor: bin.color,
        compositeScore,
        stoufferZScore,
        stoufferPValue,
        channelZScores: {
          zTranche: Number(zTranche.toFixed(4)),
          zDrought: Number(zDrought.toFixed(4)),
          zHazard: Number(zHazard.toFixed(4)),
          zAffinity: Number(zAffinity.toFixed(4)),
          zEcho: Number(zEcho.toFixed(4)),
          activeChannels: stouffer.activeChannels,
        },
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
        b.stoufferZScore - a.stoufferZScore ||
        b.compositeScore - a.compositeScore ||
        a.number - b.number
    );

    // 11. Construction des Prévisions Détaillées par Tranche (binForecasts)
    const binForecasts: GapBinTransitionStats[] = resolvedBins.map((bin) => {
      const id = bin.id;
      const bProb = blendedProbs[id];
      const baseProb = poolBaselineProb[id];
      const lift = bProb / Math.max(1e-5, baseProb);
      const zScore = binZScore[id];

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

    // 12. Synthèse de Sélection Optimale Sous-Modulaire en Espace Z (5 Gagnants + 2 Réserves)
    // Respecte les quotas de tranches Hamilton-Hare tout en maximisant le score de Stouffer
    // pénalisé continûment en unités σ par la saturation des dizaines et l'unicité des écarts.
    const selectedNumbers: number[] = [];
    const usedNumbers = new Set<number>();
    const remainingQuotas: Record<GapBinId, number> = { ...trancheQuotas };
    const decadeCounts = new Int32Array(10);
    const diversityScaleSigma = 1 / Math.sqrt(LOTTERY_CONSTANTS.NUMBERS_PER_DRAW);

    // Phase 1 : Remplir les quotas de chaque tranche par ordre de significativité Z décroissante
    const binsOrderedByPriority = [...binForecasts].sort(
      (a, b) => b.zScore - a.zScore || b.blendedProb - a.blendedProb
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
        let bestMarginalZ = -Infinity;

        for (const cand of binCandidates) {
          if (usedNumbers.has(cand.number)) continue;
          const dec = Math.min(8, Math.floor((cand.number - 1) / 10));
          const sameGapCount = selectedNumbers.filter(
            (sNum) => Math.abs(ballCurrentGap[sNum] - cand.currentGap) === 0
          ).length;

          // Utilité marginale homogène en unités σ (sans mélange d'unités ni multiplication sur Z signé)
          const marginalZ =
            cand.stoufferZScore -
            (decadeCounts[dec] + sameGapCount) * diversityScaleSigma;
          if (marginalZ > bestMarginalZ) {
            bestMarginalZ = marginalZ;
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

    // Phase 2 : Compléter jusqu'à 5 par utilité marginale Z si un quota n'a pu être honoré
    while (selectedNumbers.length < 5) {
      let bestCand: GapBallCandidate | null = null;
      let bestMarginalZ = -Infinity;
      for (const cand of allBallCandidates) {
        if (usedNumbers.has(cand.number)) continue;
        const dec = Math.min(8, Math.floor((cand.number - 1) / 10));
        const marginalZ = cand.stoufferZScore - decadeCounts[dec] * diversityScaleSigma;
        if (marginalZ > bestMarginalZ) {
          bestMarginalZ = marginalZ;
          bestCand = cand;
        }
      }
      if (!bestCand) break;
      selectedNumbers.push(bestCand.number);
      usedNumbers.add(bestCand.number);
      const dec = Math.min(8, Math.floor((bestCand.number - 1) / 10));
      decadeCounts[dec] += 1;
    }

    // Phase 3 : Sélectionner 2 Réserves Tactiques en favorisant des tranches complémentaires
    const reserveTwo: number[] = [];
    const selectedBins = new Set(
      selectedNumbers.map((n) => ballCurrentBin[n]?.id)
    );

    while (reserveTwo.length < 2) {
      let bestCand: GapBallCandidate | null = null;
      let bestReserveZ = -Infinity;
      for (const cand of allBallCandidates) {
        if (usedNumbers.has(cand.number)) continue;
        const binOverlapPenalty = selectedBins.has(cand.binId) ? diversityScaleSigma : 0;
        const reserveUtility = cand.stoufferZScore - binOverlapPenalty;
        if (reserveUtility > bestReserveZ) {
          bestReserveZ = reserveUtility;
          bestCand = cand;
        }
      }
      if (!bestCand) break;
      reserveTwo.push(bestCand.number);
      usedNumbers.add(bestCand.number);
      selectedBins.add(bestCand.binId);
    }

    const optimalFive = [...selectedNumbers].sort((a, b) => a - b);

    // Métriques de qualité de la sélection synthétisée
    const selectedCandObjects = optimalFive
      .map((n) => allBallCandidates.find((c) => c.number === n))
      .filter((c): c is GapBallCandidate => Boolean(c));

    const ticketStouffer = combineStoufferZScores(
      selectedCandObjects.map((c) => ({ z: c.stoufferZScore, weight: 1 }))
    );

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

    // Confiance calibrée de la sélection : sous l'hypothèse nulle H0 (tirages i.i.d.), la probabilité
    // qu'un ticket de 5 boules contienne au moins 1 numéro gagnant dans un tirage 5/90 est
    // exactement 1 - C(85,5)/C(90,5) = 25.4%.
    // L'indice de cohérence interne n'est pondéré au-delà de cette ligne de base que
    // proportionnellement à l'évidence statistique réelle (max |z| >= 1.96 ou excès Stouffer FDR).
    const maxTrancheZ = Math.max(0, ...binForecasts.map((f) => Math.abs(f.zScore)));
    const baselineH0Confidence = 25.4;
    const internalCoherence =
      0.55 * meanComposite + 0.25 * quotaFidelity + 0.20 * decadeDiversity;
    const zEvidenceFactor = Math.max(0, Math.min(1, (maxTrancheZ - 1.96) / 2.5));

    const selectionConfidence = Math.min(
      98.5,
      baselineH0Confidence +
        (Math.min(95, internalCoherence) - baselineH0Confidence) * zEvidenceFactor
    );

    // Top 3 tranches recommandées (triées par évidence statistique standardisée zScore,
    // départagées par probabilité fusionnée et quotas d'allocation)
    const sortedForecasts = [...binForecasts].sort((a, b) => {
      return (
        b.zScore - a.zScore ||
        b.blendedProb - a.blendedProb ||
        b.optimalQuotaBalls - a.optimalQuotaBalls
      );
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
      let binMid: number;
      if (f.bin.maxGap === Infinity) {
        const pool40 = currentNumbersByBin[f.bin.id] || [];
        if (pool40.length > 0) {
          binMid = pool40.reduce((acc, x) => acc + x.currentGap, 0) / pool40.length;
        } else {
          // Espérance conditionnelle sous loi géométrique H0 de paramètre p = 5/90:
          // E[X | X >= 40] = 40 + (1 - p)/p = 40 + (85/90)/(5/90) = 40 + 17 = 57
          const pH0 = LOTTERY_CONSTANTS.NUMBERS_PER_DRAW / LOTTERY_CONSTANTS.TOTAL_NUMBERS;
          binMid = f.bin.minGap + (1 - pH0) / pH0;
        }
      } else {
        binMid = (f.bin.minGap + f.bin.maxGap) / 2;
      }
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
        title: 'Quotas Hamilton-Hare & Agrégation de Stouffer (Z-Scores)',
        detail: `Répartition optimale des 5 boules : ${quotaSummaryParts.join(
          ' + '
        )}. Chaque boule est évaluée par combinaison de Stouffer sur 5 Z-scores homogènes N(0, 1) sous H0 (tranche lissée, sécheresse, hasard de Silverman, affinité tranche, écho W1) : Z_ticket=${ticketStouffer.zScore >= 0 ? '+' : ''}${ticketStouffer.zScore.toFixed(2)}σ.`,
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
        } (${(top1.blendedProb * 100).toFixed(1)}%, z=${top1.zScore.toFixed(
          2
        )}σ, Quota ${top1.optimalQuotaBalls}) et ${
          top2.bin.shortLabel
        } (${(top2.blendedProb * 100).toFixed(1)}%, z=${top2.zScore.toFixed(
          2
        )}σ, Quota ${
          top2.optimalQuotaBalls
        }) concentrent la plus forte significativité statistique, conduisant à la sélection optimale [${optimalFive
          .map((n) => (n < 10 ? `0${n}` : `${n}`))
          .join(' - ')}] (Stouffer Z=${ticketStouffer.zScore >= 0 ? '+' : ''}${ticketStouffer.zScore.toFixed(2)}σ).`
      : 'Historique insuffisant pour établir une séquence de tranches d’écarts.';

    return {
      drawName,
      totalAnalyzedDraws: nFootprints,
      bins: resolvedBins,
      recentFootprints,
      transitionMatrixOrder1,
      transitionRowTotalsOrder1: transRowTotals1,
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
        ticketStoufferZScore: Number(ticketStouffer.zScore.toFixed(4)),
        ticketPValue: Number(ticketStouffer.pValue.toFixed(6)),
        scoringMethod: 'STOUFFER_Z',
        allCandidates: allBallCandidates,
      },
    };
  },

  /**
   * Génère un vecteur de scores [1..90] directement exploitable par le moteur de prédiction global.
   * Dérivé directement du percentile de significativité Φ(Z_Stouffer) sans constantes arbitraires.
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

    for (let num = 1; num <= 90; num++) {
      const cand = candidateMap.get(num);
      if (!cand) {
        scores[num] = 0.5;
        continue;
      }

      // Significativité statistique continue Φ(Z_Stouffer) ∈ [0.05, 1.0] (neutre à 0.50 sous H0)
      scores[num] = Math.min(1.0, Math.max(0.05, normalCdf(cand.stoufferZScore)));
    }

    return scores;
  },
};
