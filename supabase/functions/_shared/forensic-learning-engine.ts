/**
 * Moteur d'Apprentissage Post-Mortem Unifié & Déterministe (Loto 5/90)
 *
 * Source de vérité mathématique unique partagée entre :
 * - Edge Function `supabase/functions/nexus-api/handlers/forensic-autopsy.ts`
 * - Moteur client `src/services/prediction/closedLoopAutopsyService.ts`
 *
 * Principes invariants (AGENTS.md) :
 * 1. Marginales cohérentes : Σ_{i=1..90} q_i = 5 exactement (projection water-filling sur [ε, 1-ε]^90).
 * 2. Règles strictement propres : Brier, Log-Loss binaire, ECE & Skill Scores vs uniforme (25/90 ≈ 0.278) et historique.
 * 3. Séparation stricte des frôlements (near-misses) : diagnostic uniquement, poids nul dans l'apprentissage.
 * 4. Attribution contrefactuelle par gène : ΔLogLoss, ΔBrier et contraste gagnants vs non-gagnants avec/sans gène,
 *    agrégés sur plusieurs tirages avant mutation significative des poids.
 * 5. Prudence & Idempotence : atténuation continue selon √N et T₀ = 90/5 = 18 tirages, bornes topologiques,
 *    normalisation L1 sur le simplexe Σ w_k = 1.
 * 6. Zéro PRNG non seedé, zéro nombre magique arbitraire.
 */

export const FORENSIC_MODEL_VERSION = 'v12.1-unified-cf';

export const DOMAIN_SIZE = 90;
export const DRAW_PICK_SIZE = 5;
export const UNIFORM_MARGINAL_PROB = DRAW_PICK_SIZE / DOMAIN_SIZE; // 5/90 ≈ 0.055556
export const UNIFORM_EXPECTED_HITS_TOP5 = (DRAW_PICK_SIZE * DRAW_PICK_SIZE) / DOMAIN_SIZE; // 25/90 ≈ 0.277778
export const UNIFORM_BRIER_BASELINE = UNIFORM_MARGINAL_PROB * (1.0 - UNIFORM_MARGINAL_PROB); // ≈ 0.05246914
export const UNIFORM_LOG_LOSS_BASELINE =
  -(
    UNIFORM_MARGINAL_PROB * Math.log(UNIFORM_MARGINAL_PROB) +
    (1.0 - UNIFORM_MARGINAL_PROB) * Math.log(1.0 - UNIFORM_MARGINAL_PROB)
  ); // ≈ 0.21455916
export const SAMPLE_CYCLE_SCALE = DOMAIN_SIZE / DRAW_PICK_SIZE; // 90/5 = 18 tirages (période d'échantillonnage)
export const PROB_EPSILON = 1e-6;
export const MAX_PLAUSIBLE_SLOPE = 3.0;
export const MIN_PLAUSIBLE_SLOPE = 0.2;
export const Z_95_ONE_SIDED = 1.644854; // Quantile normal unilatéral alpha=0.05
export const Z_95_TWO_SIDED = 1.959964; // Quantile normal bilatéral alpha=0.05
export const LOGIT_UNIFORM_PRIOR = Math.log(UNIFORM_MARGINAL_PROB / (1.0 - UNIFORM_MARGINAL_PROB)); // ln(5/85) ≈ -2.833213

export interface CanonicalMatchSummary {
  predictedTop5: number[];
  actualUnique: number[];
  exactHits: number;
  exactHitNumbers: number[];
  nearMissCount: number;
  nearMissDetails: Array<{ predicted: number; actual: number; type: '-1' | '+1' }>;
}

/**
 * Déduplique et borne strictement une sélection à Top-K (défaut 5) entiers valides dans [1..90].
 */
export function sanitizeTop5Numbers(raw: ArrayLike<number>, maxCount: number = DRAW_PICK_SIZE): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  if (!raw) return out;
  for (let i = 0; i < raw.length; i++) {
    const n = Number(raw[i]);
    if (Number.isInteger(n) && n >= 1 && n <= DOMAIN_SIZE && !seen.has(n)) {
      seen.add(n);
      out.push(n);
      if (out.length >= maxCount) break;
    }
  }
  return out;
}

/**
 * Définition canonique unique des exact hits et des near-misses circulaires (±1 sur Z/90Z) :
 * - Compare uniquement Top-5 dédupliqué vs gagnants uniques (garantit 0 <= exactHits <= 5).
 * - Near-misses circulaires (1 <-> 90) STRICTEMENT diagnostiques : au plus 1 near-miss par numéro prédit non-hit
 *   et par gagnant non encore couvert, évitant le double comptage d'un même numéro.
 */
export function computeCanonicalExactHitsAndNearMisses(
  predictedRaw: ArrayLike<number>,
  actualRaw: ArrayLike<number>
): CanonicalMatchSummary {
  const predictedTop5 = sanitizeTop5Numbers(predictedRaw, DRAW_PICK_SIZE);
  const actualUnique = sanitizeTop5Numbers(actualRaw, DRAW_PICK_SIZE);
  const actualSet = new Set(actualUnique);

  const exactHitNumbers: number[] = [];
  const unmatchedPredicted: number[] = [];
  const coveredWinners = new Set<number>();

  for (const p of predictedTop5) {
    if (actualSet.has(p)) {
      exactHitNumbers.push(p);
      coveredWinners.add(p);
    } else {
      unmatchedPredicted.push(p);
    }
  }

  const nearMissDetails: Array<{ predicted: number; actual: number; type: '-1' | '+1' }> = [];
  for (const p of unmatchedPredicted) {
    const minus1 = p > 1 ? p - 1 : DOMAIN_SIZE;
    const plus1 = p < DOMAIN_SIZE ? p + 1 : 1;

    if (actualSet.has(minus1) && !coveredWinners.has(minus1)) {
      coveredWinners.add(minus1);
      nearMissDetails.push({ predicted: p, actual: minus1, type: '-1' });
    } else if (actualSet.has(plus1) && !coveredWinners.has(plus1)) {
      coveredWinners.add(plus1);
      nearMissDetails.push({ predicted: p, actual: plus1, type: '+1' });
    }
  }

  return {
    predictedTop5,
    actualUnique,
    exactHits: exactHitNumbers.length,
    exactHitNumbers,
    nearMissCount: nearMissDetails.length,
    nearMissDetails,
  };
}

/**
 * Perte topologique canonique normalisée sur [0, 1] sans pondérations numérologiques arbitraires.
 * Combine distance circulaire sur Z/90Z (échelle T₀=18) et distance euclidienne sur grille 9x10 (échelle √18).
 */
export function computeCanonicalTopologicalLoss(
  predictedRaw: ArrayLike<number>,
  actualRaw: ArrayLike<number>
): number {
  const predicted = sanitizeTop5Numbers(predictedRaw, DRAW_PICK_SIZE);
  const actual = sanitizeTop5Numbers(actualRaw, DRAW_PICK_SIZE);
  if (predicted.length === 0 || actual.length === 0) return 1.0;

  const gridScale = Math.sqrt(SAMPLE_CYCLE_SCALE);
  let totalLoss = 0;

  for (const w of actual) {
    const rowW = Math.floor((w - 1) / 10);
    const colW = (w - 1) % 10;
    let bestSim = 0;

    for (const p of predicted) {
      if (p === w) {
        bestSim = 1.0;
        break;
      }
      const linDist = Math.abs(p - w);
      const circDist = Math.min(linDist, DOMAIN_SIZE - linDist);
      const circSim = Math.exp(-circDist / gridScale);

      const rowP = Math.floor((p - 1) / 10);
      const colP = (p - 1) % 10;
      const gridDist = Math.hypot(rowP - rowW, colP - colW);
      const gridSim = Math.exp(-gridDist / gridScale);

      const sim = Math.max(circSim, gridSim);
      if (sim > bestSim) bestSim = sim;
    }

    totalLoss += 1.0 - bestSim;
  }

  return totalLoss / actual.length;
}

/**
 * Probabilité exacte P(X >= k) sous l'hypothèse nulle hypergéométrique H(N=90, K=5, n=5).
 */
export function computeHypergeometricTailPValue(hits: number): number {
  const kObs = Math.max(0, Math.min(DRAW_PICK_SIZE, Math.floor(hits)));
  if (kObs <= 0) return 1.0;

  const comb = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    const r = Math.min(k, n - k);
    let res = 1;
    for (let i = 1; i <= r; i++) {
      res = (res * (n - r + i)) / i;
    }
    return res;
  };

  const totalWays = comb(DOMAIN_SIZE, DRAW_PICK_SIZE);
  let tailSum = 0;
  for (let k = kObs; k <= DRAW_PICK_SIZE; k++) {
    tailSum += comb(DRAW_PICK_SIZE, k) * comb(DOMAIN_SIZE - DRAW_PICK_SIZE, DRAW_PICK_SIZE - k);
  }
  return Math.max(0, Math.min(1, tailSum / totalWays));
}

export interface MarginalEvaluationResult {
  marginals90: number[]; // index 0..89 <=> numéros 1..90, somme = DRAW_PICK_SIZE (5)
  marginalSum: number;
  exactHits: number;
  top5Predicted: number[];
  brierScore: number;
  logLoss: number;
  ece: number;
  expectedHitsTop5: number;
  calibrationAccuracy: number; // 0..100, centré à 50 sur le hasard uniforme
  uniformBaseline: {
    expectedHitsTop5: number;
    brierScore: number;
    logLoss: number;
  };
  historicalBaseline?: {
    sampleCount: number;
    expectedHitsTop5: number;
    actualHitsTop5: number;
    brierScore: number;
    logLoss: number;
  };
  brierSkillVsUniform: number;
  logLossSkillVsUniform: number;
  brierSkillVsHistorical: number | null;
  logLossSkillVsHistorical: number | null;
}

export interface GeneCounterfactualAttribution {
  key: string;
  weight: number;
  deltaLogLossAblation: number; // logLoss_without - logLoss_with (> 0 => gène bénéfique)
  deltaBrierAblation: number; // brier_without - brier_with (> 0 => gène bénéfique)
  deltaHitsTop5Ablation: number; // hits_with - hits_without
  winnerLiftAblation: number; // (mean_{w} Δq) - (mean_{non-w} Δq) (> 0 => sépare gagnants vs non-gagnants)
  counterfactualScore: number; // composite sans dimension normalisé par les baselines uniformes
}

export interface AggregatedGeneAttribution {
  key: string;
  currentWeight: number;
  meanCounterfactualScore: number;
  meanDeltaLogLoss: number;
  meanDeltaBrier: number;
  meanWinnerLift: number;
  sampleCount: number;
  attributionSE: number;
  proposedWeight: number;
  weightDelta: number;
  deltaPercent: number;
}

export interface BaselineComparisonMetrics {
  sampleSize: number;
  modelMeanHits: number;
  modelHitsSE: number;
  modelHitsCI95: [number, number];
  uniformExpectedHits: number;
  historicalMeanHits: number;
  historicalHitsSE: number;
  modelMeanBrier: number;
  uniformBrier: number;
  historicalMeanBrier: number;
  brierSkillVsUniform: number;
  brierSkillVsHistorical: number;
  modelMeanLogLoss: number;
  uniformLogLoss: number;
  historicalMeanLogLoss: number;
  logLossSkillVsUniform: number;
  logLossSkillVsHistorical: number;
  ece: number;
  uncertaintySE: number;
  isStatisticallySignificantEdge: boolean;
}

export interface LearningAuditPayload {
  modelVersion: string;
  sampleSize: number;
  sampleAttenuation: number;
  effectiveLearningRate: number;
  uncertaintySE: number;
  zSkillBrier?: number;
  prudenceModeActive: boolean;
  prudenceBarrierEnforced?: boolean;
  isSingleDrawEceUninformative?: boolean;
  nearMissesExcludedFromLearning: boolean;
  baselines: {
    uniformBrier: number;
    uniformLogLoss: number;
    uniformExpectedHits: number;
    historicalBrier: number | null;
    historicalLogLoss: number | null;
    historicalExpectedHits: number | null;
  };
  calibration: {
    brierScore: number;
    logLoss: number;
    ece: number | null;
    brierSkillVsUniform: number;
    logLossSkillVsUniform: number;
    brierSkillVsHistorical: number | null;
    logLossSkillVsHistorical: number | null;
    sigmoidSlope: number;
    sigmoidIntercept: number;
    slopeDelta: number;
    interceptDelta: number;
  };
  aggregatedAttributions: AggregatedGeneAttribution[];
  weightDeltas: Record<string, number>;
  justificationSummary: string;
}

export interface WalkForwardPeriodReport extends BaselineComparisonMetrics {
  periodIndex: number;
  label: string;
  startDate: string;
  endDate: string;
}

export interface WalkForwardValidationReport {
  drawName: string;
  modelVersion: string;
  totalDraws: number;
  evaluatedDraws: number;
  warmupDraws: number;
  overall: BaselineComparisonMetrics;
  periods: WalkForwardPeriodReport[];
  finalWeights: Record<string, number>;
  geneSummary: AggregatedGeneAttribution[];
  warningNote: string;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const toScores90Array = (scores: ArrayLike<number>): number[] => {
  const out = new Array<number>(DOMAIN_SIZE).fill(0);
  if (!scores) return out;
  if (scores.length >= DOMAIN_SIZE + 1) {
    for (let n = 1; n <= DOMAIN_SIZE; n++) {
      const v = Number(scores[n]);
      out[n - 1] = Number.isFinite(v) ? v : 0;
    }
  } else {
    for (let i = 0; i < Math.min(DOMAIN_SIZE, scores.length); i++) {
      const v = Number(scores[i]);
      out[i] = Number.isFinite(v) ? v : 0;
    }
  }
  return out;
};

/**
 * Projection exacte par remplissage d'eau (water-filling / bisection monotone)
 * sur le polytope marginal :
 *   q_i ∈ [eps, 1 - eps],   Σ_{i=1..90} q_i = targetSum (= 5 pour 5/90).
 *
 * Préserve l'ordre strict des scores positifs tout en garantissant que aucune
 * probabilité marginale ne dépasse 1 ni n'annule la masse totale.
 * Si le signal est nul ou constant, retourne la loi uniforme exacte targetSum / 90.
 */
export function projectScoresToCoherentMarginals(
  scores: ArrayLike<number>,
  targetSum: number = DRAW_PICK_SIZE,
  eps: number = PROB_EPSILON
): number[] {
  const raw = toScores90Array(scores);
  const K = clamp(targetSum, DOMAIN_SIZE * eps, DOMAIN_SIZE * (1 - eps));
  const uniform = K / DOMAIN_SIZE;

  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let i = 0; i < DOMAIN_SIZE; i++) {
    const v = Math.max(0, raw[i]);
    raw[i] = v;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }

  // Signal dégénéré ou constant → uniforme exact
  if (maxVal <= 1e-12 || maxVal - minVal <= 1e-12) {
    return new Array<number>(DOMAIN_SIZE).fill(uniform);
  }

  // Normalisation de travail positive sans déformation des rapports si déjà positifs
  const positiveSum = raw.reduce((a, b) => a + b, 0);
  const work = raw.map((v) => (positiveSum > 0 ? v / positiveSum : 1 / DOMAIN_SIZE));

  // Pour alpha >= 0, f(alpha) = sum_i clamp(alpha * work_i, eps, 1 - eps) est continue & monotone croissante
  const minPos = work.reduce((m, v) => (v > 0 && v < m ? v : m), Infinity);
  let lo = 0;
  let hi = Number.isFinite(minPos) && minPos > 0 ? (1 - eps) / minPos : DOMAIN_SIZE * K;
  hi = Math.max(hi, K * 2);

  // Vérifier que f(hi) >= K (toujours vrai si au moins K coordonnées > 0 ; sinon ajouter un léger lissage uniforme)
  const evalSum = (alpha: number): number => {
    let s = 0;
    for (let i = 0; i < DOMAIN_SIZE; i++) {
      s += clamp(alpha * work[i], eps, 1 - eps);
    }
    return s;
  };

  if (evalSum(hi) < K) {
    // Support trop clairsemé (< 5 valeurs strictement positives) : régularisation minimale continue vers l'uniforme
    const blended = work.map((v) => v + eps);
    const bSum = blended.reduce((a, b) => a + b, 0);
    for (let i = 0; i < DOMAIN_SIZE; i++) work[i] = blended[i] / bSum;
    hi = (1 - eps) / eps;
  }

  for (let iter = 0; iter < 64; iter++) {
    const mid = 0.5 * (lo + hi);
    const s = evalSum(mid);
    if (Math.abs(s - K) <= 1e-11) {
      lo = hi = mid;
      break;
    }
    if (s < K) lo = mid;
    else hi = mid;
  }

  const alpha = 0.5 * (lo + hi);
  const result = new Array<number>(DOMAIN_SIZE);
  let total = 0;
  for (let i = 0; i < DOMAIN_SIZE; i++) {
    const q = clamp(alpha * work[i], eps, 1 - eps);
    result[i] = q;
    total += q;
  }

  // Correction résiduelle ultra-fine (< 1e-10) sur les composantes intérieures
  const residual = K - total;
  if (Math.abs(residual) > 1e-10) {
    const interior = result
      .map((q, idx) => ({ idx, slack: residual > 0 ? 1 - eps - q : q - eps }))
      .filter((x) => x.slack > 1e-9);
    const totalSlack = interior.reduce((a, x) => a + x.slack, 0);
    if (totalSlack > 0) {
      for (const item of interior) {
        result[item.idx] = clamp(result[item.idx] + residual * (item.slack / totalSlack), eps, 1 - eps);
      }
    }
  }

  return result;
}

/**
 * Reconstruit une distribution marginale cohérente (somme = 5) pour l'Edge Function
 * lorsque seules les prédictions textuelles/numériques, les scores partiels et l'historique antérieur
 * sont disponibles dans `prediction_snapshots`.
 * Remplace l'ancien `isPredicted ? confidenceVal : 0.011` qui ne sommait pas à 5.
 */
export function deriveCoherentMarginalsFromSnapshot(params: {
  predictedNumbers: number[];
  confidence01?: number;
  scores90?: Record<string, number> | number[];
  breakdown?: Record<string, Record<string, number>>;
  priorDraws?: Array<{ gagnants: number[] }>;
}): number[] {
  const { predictedNumbers, confidence01 = 0.5, scores90, breakdown, priorDraws } = params;

  // 1. Priorité aux scores complets si présents dans metrics_snapshot
  if (Array.isArray(scores90) && scores90.length >= DOMAIN_SIZE) {
    return projectScoresToCoherentMarginals(scores90, DRAW_PICK_SIZE);
  }
  if (scores90 && !Array.isArray(scores90)) {
    const arr = new Array<number>(DOMAIN_SIZE).fill(0);
    let hasPositive = false;
    for (let n = 1; n <= DOMAIN_SIZE; n++) {
      const v = Number((scores90 as Record<string, number>)[String(n)] ?? (scores90 as Record<string, number>)[n]);
      if (Number.isFinite(v) && v > 0) {
        arr[n - 1] = v;
        hasPositive = true;
      }
    }
    if (hasPositive) return projectScoresToCoherentMarginals(arr, DRAW_PICK_SIZE);
  }

  if (breakdown && Object.keys(breakdown).length >= 10) {
    const arr = new Array<number>(DOMAIN_SIZE).fill(0);
    let hasPositive = false;
    for (let n = 1; n <= DOMAIN_SIZE; n++) {
      const entry = breakdown[String(n)] ?? breakdown[n];
      if (entry && typeof entry.score === 'number' && Number.isFinite(entry.score) && entry.score > 0) {
        arr[n - 1] = entry.score;
        hasPositive = true;
      }
    }
    if (hasPositive) return projectScoresToCoherentMarginals(arr, DRAW_PICK_SIZE);
  }

  // 2. Fallback propre avec conservation stricte de masse (Σ q_i = 5) :
  // Base empirique lissée par Laplace (ou uniforme) + concentration continue vers top-5 modulée par confiance
  const c = clamp(Number.isFinite(confidence01) ? confidence01 : 0.5, 0, 1);
  const predSet = new Set(
    (predictedNumbers || []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= DOMAIN_SIZE)
  );

  // Prior historique lissé (Laplace continu) ou uniforme 5/90
  const baseScores = new Array<number>(DOMAIN_SIZE).fill(1);
  if (priorDraws && priorDraws.length > 0) {
    const counts = new Array<number>(DOMAIN_SIZE).fill(0);
    for (const d of priorDraws) {
      for (const n of d.gagnants || []) {
        if (n >= 1 && n <= DOMAIN_SIZE) counts[n - 1]++;
      }
    }
    const T = priorDraws.length;
    for (let i = 0; i < DOMAIN_SIZE; i++) {
      baseScores[i] = (counts[i] + UNIFORM_MARGINAL_PROB) / (T + 1);
    }
  } else {
    baseScores.fill(UNIFORM_MARGINAL_PROB);
  }

  const baseMarginals = projectScoresToCoherentMarginals(baseScores, DRAW_PICK_SIZE);
  if (predSet.size === 0) return baseMarginals;

  // Concentration logit différentiable : plus la confiance est élevée, plus la probabilité sur predictedNumbers
  // s'écarte au-dessus du prior, tout en redistribuant exactement le reste pour préserver Σ q_i = 5.
  // Quand c = 0.5 (neutre), la force est modérée (~exp(0.5)) et quand c -> 0, l'écart tend vers 0 (uniforme/prior).
  const liftScale = 1.0 + 3.0 * c * c;
  const weighted = baseMarginals.map((q, idx) => (predSet.has(idx + 1) ? q * liftScale : q));
  return projectScoresToCoherentMarginals(weighted, DRAW_PICK_SIZE);
}

/**
 * Calcule les marginales historiques (baseline empirique sans fuite, lissage Laplace)
 * uniquement à partir des tirages antérieurs.
 */
export function computeHistoricalMarginalBaseline(
  priorDraws: Array<{ gagnants: number[] }>
): {
  marginals90: number[];
  top5: number[];
} {
  if (!priorDraws || priorDraws.length === 0) {
    return {
      marginals90: new Array<number>(DOMAIN_SIZE).fill(UNIFORM_MARGINAL_PROB),
      top5: [1, 2, 3, 4, 5],
    };
  }

  const counts = new Array<number>(DOMAIN_SIZE).fill(0);
  for (const draw of priorDraws) {
    for (const num of draw.gagnants || []) {
      if (num >= 1 && num <= DOMAIN_SIZE) {
        counts[num - 1] += 1;
      }
    }
  }

  const T = priorDraws.length;
  // Lissage de Krichevsky-Trofimov / Laplace centré sur la probabilité uniforme K/N
  const smoothed = counts.map((c) => (c + UNIFORM_MARGINAL_PROB * SAMPLE_CYCLE_SCALE) / (T + SAMPLE_CYCLE_SCALE));
  const marginals90 = projectScoresToCoherentMarginals(smoothed, DRAW_PICK_SIZE);

  const ranked = marginals90
    .map((p, idx) => ({ num: idx + 1, p }))
    .sort((a, b) => b.p - a.p || a.num - b.num);

  return {
    marginals90,
    top5: ranked.slice(0, DRAW_PICK_SIZE).map((r) => r.num),
  };
}

/**
 * Calibration ECE (Expected Calibration Error) déterministe sur n observations (p_i, y_i).
 * B = clamp(round(sqrt(n)), 3, 10).
 */
export function computeCalibrationEce(probabilities: number[], outcomes: number[]): number {
  const n = Math.min(probabilities.length, outcomes.length);
  if (n === 0) return 0;

  const B = Math.max(3, Math.min(10, Math.round(Math.sqrt(n))));
  const binSumP = new Array<number>(B).fill(0);
  const binSumY = new Array<number>(B).fill(0);
  const binCount = new Array<number>(B).fill(0);

  for (let i = 0; i < n; i++) {
    const p = clamp(probabilities[i], 0, 1);
    const y = clamp(outcomes[i], 0, 1);
    const b = Math.min(B - 1, Math.floor(p * B));
    binSumP[b] += p;
    binSumY[b] += y;
    binCount[b] += 1;
  }

  let ece = 0;
  for (let b = 0; b < B; b++) {
    if (binCount[b] > 0) {
      ece += (binCount[b] / n) * Math.abs(binSumP[b] / binCount[b] - binSumY[b] / binCount[b]);
    }
  }
  return ece;
}

/**
 * Évalue rigoureusement une distribution marginale cohérente contre :
 * - le tirage réel (uniquement gagnants exacts ; nearMisses jamais inclus),
 * - la référence uniforme (E[hits] = 25/90 ≈ 0.278, Brier ≈ 0.05247, LogLoss ≈ 0.21456),
 * - la référence historique sans fuite si `priorDraws` fourni.
 */
export function evaluateMarginalPredictions(params: {
  marginals90: number[];
  actualWinners: number[];
  top5Predicted?: number[];
  priorDraws?: Array<{ gagnants: number[] }>;
}): MarginalEvaluationResult {
  const projected = projectScoresToCoherentMarginals(params.marginals90, DRAW_PICK_SIZE);
  const winners = new Set(
    (params.actualWinners || []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= DOMAIN_SIZE)
  );

  const top5Predicted =
    params.top5Predicted && params.top5Predicted.length > 0
      ? params.top5Predicted.slice(0, DRAW_PICK_SIZE)
      : projected
          .map((p, idx) => ({ num: idx + 1, p }))
          .sort((a, b) => b.p - a.p || a.num - b.num)
          .slice(0, DRAW_PICK_SIZE)
          .map((x) => x.num);

  let exactHits = 0;
  let expectedHitsTop5 = 0;
  for (const n of top5Predicted) {
    if (winners.has(n)) exactHits++;
    if (n >= 1 && n <= DOMAIN_SIZE) expectedHitsTop5 += projected[n - 1];
  }

  let brierSum = 0;
  let logLossSum = 0;
  let marginalSum = 0;
  const outcomes90 = new Array<number>(DOMAIN_SIZE);

  for (let i = 0; i < DOMAIN_SIZE; i++) {
    const q = clamp(projected[i], PROB_EPSILON, 1 - PROB_EPSILON);
    const y = winners.has(i + 1) ? 1 : 0;
    outcomes90[i] = y;
    marginalSum += q;
    brierSum += (q - y) * (q - y);
    logLossSum -= y * Math.log(q) + (1 - y) * Math.log(1 - q);
  }

  const brierScore = brierSum / DOMAIN_SIZE;
  const logLoss = logLossSum / DOMAIN_SIZE;
  const ece = computeCalibrationEce(projected, outcomes90);

  const brierSkillVsUniform = 1.0 - brierScore / UNIFORM_BRIER_BASELINE;
  const logLossSkillVsUniform = 1.0 - logLoss / UNIFORM_LOG_LOSS_BASELINE;

  const calibrationAccuracy = clamp(
    Math.round(100 * Math.exp((-brierScore / Math.max(1e-9, UNIFORM_BRIER_BASELINE)) * Math.LN2)),
    0,
    100
  );

  let historicalBaseline: MarginalEvaluationResult['historicalBaseline'];
  let brierSkillVsHistorical: number | null = null;
  let logLossSkillVsHistorical: number | null = null;

  if (params.priorDraws && params.priorDraws.length > 0) {
    const histModel = computeHistoricalMarginalBaseline(params.priorDraws);
    let histBrierSum = 0;
    let histLogLossSum = 0;
    let histExpectedHitsTop5 = 0;
    let histActualHitsTop5 = 0;

    for (const n of histModel.top5) {
      histExpectedHitsTop5 += histModel.marginals90[n - 1];
      if (winners.has(n)) histActualHitsTop5++;
    }
    for (let i = 0; i < DOMAIN_SIZE; i++) {
      const qh = clamp(histModel.marginals90[i], PROB_EPSILON, 1 - PROB_EPSILON);
      const y = outcomes90[i];
      histBrierSum += (qh - y) * (qh - y);
      histLogLossSum -= y * Math.log(qh) + (1 - y) * Math.log(1 - qh);
    }

    const histBrier = histBrierSum / DOMAIN_SIZE;
    const histLogLoss = histLogLossSum / DOMAIN_SIZE;
    historicalBaseline = {
      sampleCount: params.priorDraws.length,
      expectedHitsTop5: histExpectedHitsTop5,
      actualHitsTop5: histActualHitsTop5,
      brierScore: histBrier,
      logLoss: histLogLoss,
    };
    brierSkillVsHistorical = 1.0 - brierScore / Math.max(1e-9, histBrier);
    logLossSkillVsHistorical = 1.0 - logLoss / Math.max(1e-9, histLogLoss);
  }

  return {
    marginals90: projected,
    marginalSum,
    exactHits,
    top5Predicted,
    brierScore,
    logLoss,
    ece,
    expectedHitsTop5,
    calibrationAccuracy,
    uniformBaseline: {
      expectedHitsTop5: UNIFORM_EXPECTED_HITS_TOP5,
      brierScore: UNIFORM_BRIER_BASELINE,
      logLoss: UNIFORM_LOG_LOSS_BASELINE,
    },
    historicalBaseline,
    brierSkillVsUniform,
    logLossSkillVsUniform,
    brierSkillVsHistorical,
    logLossSkillVsHistorical,
  };
}

/**
 * Attribution contrefactuelle causale PAR GÈNE (with vs without gene) :
 * - Compare l'ensemble complet aux ensembles obtenus en ablatant w_k → 0
 *   et en renormalisant les canaux restants actifs.
 * - Mesure ΔLogLoss, ΔBrier, ΔHits Top-5 ET le lift marginal sur gagnants vs non-gagnants.
 * - Utilise uniquement les vrais numéros gagnants (jamais les near-misses).
 */
export function computeCounterfactualGeneAttributions(params: {
  channelKeys: string[];
  geneScores: Record<string, ArrayLike<number>>;
  weights: Record<string, number>;
  actualWinners: number[];
}): GeneCounterfactualAttribution[] {
  const { channelKeys, geneScores, weights, actualWinners } = params;
  if (channelKeys.length === 0) return [];

  const winners = new Set(
    (actualWinners || []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= DOMAIN_SIZE)
  );
  const K = Math.max(1, winners.size);
  const nonWinnerCount = Math.max(1, DOMAIN_SIZE - K);

  const normalizedScores: Record<string, number[]> = {};
  for (const key of channelKeys) {
    if (geneScores[key]) {
      normalizedScores[key] = toScores90Array(geneScores[key]);
    }
  }

  const getWeight = (k: string): number => {
    const v = weights[k];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
  };

  const evaluateEnsembleMarginals = (skipKey?: string) => {
    const raw = new Array<number>(DOMAIN_SIZE).fill(0);
    let weightSum = 0;

    for (const key of channelKeys) {
      if (key === skipKey) continue;
      const w = getWeight(key);
      const vec = normalizedScores[key];
      if (!vec || w <= 0) continue;
      weightSum += w;
      for (let i = 0; i < DOMAIN_SIZE; i++) {
        raw[i] += w * vec[i];
      }
    }

    if (weightSum > 0) {
      for (let i = 0; i < DOMAIN_SIZE; i++) raw[i] /= weightSum;
    }

    const marginals = projectScoresToCoherentMarginals(raw, DRAW_PICK_SIZE);
    const ranked = raw
      .map((score, idx) => ({ num: idx + 1, score }))
      .sort((a, b) => b.score - a.score || a.num - b.num);
    const top5 = ranked.slice(0, DRAW_PICK_SIZE).map((r) => r.num);
    let hitsTop5 = 0;
    for (const n of top5) {
      if (winners.has(n)) hitsTop5++;
    }

    let brierSum = 0;
    let logLossSum = 0;
    for (let i = 0; i < DOMAIN_SIZE; i++) {
      const q = clamp(marginals[i], PROB_EPSILON, 1 - PROB_EPSILON);
      const y = winners.has(i + 1) ? 1 : 0;
      brierSum += (q - y) * (q - y);
      logLossSum -= y * Math.log(q) + (1 - y) * Math.log(1 - q);
    }

    return {
      marginals,
      hitsTop5,
      brier: brierSum / DOMAIN_SIZE,
      logLoss: logLossSum / DOMAIN_SIZE,
    };
  };

  const full = evaluateEnsembleMarginals();

  return channelKeys.map((key) => {
    const w = getWeight(key);
    const vec = normalizedScores[key];
    if (w <= 0 || !vec) {
      return {
        key,
        weight: w,
        deltaLogLossAblation: 0,
        deltaBrierAblation: 0,
        deltaHitsTop5Ablation: 0,
        winnerLiftAblation: 0,
        counterfactualScore: 0,
      };
    }

    const ablated = evaluateEnsembleMarginals(key);
    const deltaLogLossAblation = ablated.logLoss - full.logLoss;
    const deltaBrierAblation = ablated.brier - full.brier;
    const deltaHitsTop5Ablation = full.hitsTop5 - ablated.hitsTop5;

    let winnerDeltaSum = 0;
    let nonWinnerDeltaSum = 0;
    for (let i = 0; i < DOMAIN_SIZE; i++) {
      const dq = full.marginals[i] - ablated.marginals[i];
      if (winners.has(i + 1)) winnerDeltaSum += dq;
      else nonWinnerDeltaSum += dq;
    }

    const winnerLiftAblation = winnerDeltaSum / K - nonWinnerDeltaSum / nonWinnerCount;

    // Composite contrefactuel sans dimension ni constante arbitraire (normalisé par les références uniformes)
    const counterfactualScore =
      deltaLogLossAblation / UNIFORM_LOG_LOSS_BASELINE +
      deltaBrierAblation / UNIFORM_BRIER_BASELINE +
      winnerLiftAblation / UNIFORM_MARGINAL_PROB;

    return {
      key,
      weight: w,
      deltaLogLossAblation,
      deltaBrierAblation,
      deltaHitsTop5Ablation,
      winnerLiftAblation,
      counterfactualScore: Number.isFinite(counterfactualScore) ? counterfactualScore : 0,
    };
  });
}

/**
 * Normalisation L1 bornée sur le simplexe Σ w_k = 1 avec respect strict des poids nuls.
 */
export function normalizeWeightsSimplex(
  weights: Record<string, number>,
  options?: {
    forcedZeroKeys?: Set<string>;
    lockedMaxKeys?: Set<string>;
    baselineWeights?: Record<string, number>;
    bypassCap?: boolean;
  }
): Record<string, number> {
  const keys = Object.keys(weights);
  if (keys.length === 0) return {};

  const forcedZero = options?.forcedZeroKeys ?? new Set<string>();
  const lockedMax = options?.lockedMaxKeys ?? new Set<string>();
  const baseline = options?.baselineWeights ?? weights;

  const activeCandidateKeys = keys.filter((k) => !forcedZero.has(k) && (weights[k] ?? 0) > 1e-6);
  const effectiveN = Math.max(1, activeCandidateKeys.length);
  const floor = 1.0 / (2.0 * Math.max(2, effectiveN));
  const ceiling = options?.bypassCap
    ? 1.0 - 1.0 / Math.sqrt(Math.max(2, effectiveN))
    : Math.min(0.5, 2.0 / Math.sqrt(Math.max(2, effectiveN)));

  const w: Record<string, number> = {};
  let sum = 0;

  for (const k of keys) {
    if (forcedZero.has(k)) {
      w[k] = 0;
      continue;
    }
    let val = Number(weights[k]);
    if (!Number.isFinite(val) || val <= 0) val = 0;
    if (lockedMax.has(k) && typeof baseline[k] === 'number' && Number.isFinite(baseline[k])) {
      val = Math.min(val, Math.max(0, baseline[k]));
    }
    w[k] = val;
    sum += val;
  }

  if (sum <= 0) {
    const eligible = keys.filter((k) => !forcedZero.has(k));
    const uni = eligible.length > 0 ? 1.0 / eligible.length : 0;
    for (const k of keys) {
      w[k] = forcedZero.has(k) ? 0 : parseFloat(uni.toFixed(6));
    }
  } else {
    for (const k of keys) {
      w[k] = w[k] / sum;
    }
  }

  // Projection itérative bornée tout en préservant les zéros explicites et les plafonds verrouillés
  const maxIter = Math.max(16, keys.length * 2);
  for (let iter = 0; iter < maxIter; iter++) {
    let total = 0;
    for (const k of keys) {
      if (forcedZero.has(k) || w[k] <= 1e-5) {
        w[k] = 0;
      } else {
        let hi = ceiling;
        if (lockedMax.has(k) && typeof baseline[k] === 'number' && Number.isFinite(baseline[k])) {
          hi = Math.min(hi, Math.max(0, baseline[k]));
        }
        w[k] = Math.max(Math.min(floor, hi), Math.min(hi, w[k]));
      }
      total += w[k];
    }
    if (Math.abs(total - 1.0) <= 1e-9 || total <= 0) break;

    const residual = 1.0 - total;
    const adjustable = keys.filter((k) => {
      if (forcedZero.has(k) || w[k] <= 0) return false;
      if (residual > 0 && lockedMax.has(k) && w[k] >= (baseline[k] ?? 1) - 1e-9) return false;
      if (residual > 0 && w[k] >= ceiling - 1e-9) return false;
      if (residual < 0 && w[k] <= floor + 1e-9) return false;
      return true;
    });
    const targets = adjustable.length > 0 ? adjustable : keys.filter((k) => !forcedZero.has(k) && w[k] > 0);
    if (targets.length === 0) break;

    const step = residual / targets.length;
    for (const k of targets) {
      let hi = ceiling;
      if (lockedMax.has(k) && typeof baseline[k] === 'number' && Number.isFinite(baseline[k])) {
        hi = Math.min(hi, Math.max(0, baseline[k]));
      }
      w[k] = clamp(w[k] + step, 0, hi);
    }
  }

  // Arrondi 6 décimales & ajustement du résidu final sur la plus grande composante libre
  let roundedSum = 0;
  for (const k of keys) {
    w[k] = w[k] > 0 && !forcedZero.has(k) ? parseFloat(w[k].toFixed(6)) : 0;
    roundedSum += w[k];
  }
  if (roundedSum > 0 && Math.abs(roundedSum - 1.0) > 1e-7) {
    const residual = 1.0 - roundedSum;
    const candidates = keys
      .filter(
        (k) =>
          w[k] > 0 &&
          !forcedZero.has(k) &&
          (residual < 0 || !lockedMax.has(k))
      )
      .sort((a, b) => w[b] - w[a] || a.localeCompare(b));
    if (candidates.length > 0) {
      w[candidates[0]] = parseFloat(Math.max(0, w[candidates[0]] + residual).toFixed(6));
    }
  }

  return w;
}

/**
 * Mise à jour prudente des poids par agrégation contrefactuelle multi-tirages.
 * Réduit continûment l'amplitude d'apprentissage lorsque N est petit (tanh(N / 18)),
 * vérifie l'incertitude out-of-sample (SE), et normalise/borne après chaque étape.
 */
export function computeCautiousAggregatedWeightUpdate(params: {
  currentWeights: Record<string, number>;
  drawAttributionsWindow: GeneCounterfactualAttribution[][]; // N tirages
  windowMetrics: Array<{
    exactHits: number;
    brierScore: number;
    logLoss: number;
    ece?: number;
    historicalBrier?: number | null;
    historicalLogLoss?: number | null;
    historicalHits?: number | null;
  }>;
  entropyNormalized?: number;
  hurstExponent?: number;
  baseLearningRate?: number;
  baseSigmoidSlope?: number;
  baseSigmoidIntercept?: number;
  forcedZeroKeys?: Set<string>;
  lockedMaxKeys?: Set<string>;
  modelVersion?: string;
  singleDrawOnlineUpdate?: boolean;
}): {
  updatedWeights: Record<string, number>;
  audit: LearningAuditPayload;
} {
  const {
    currentWeights,
    drawAttributionsWindow,
    windowMetrics,
    entropyNormalized = 0.7,
    hurstExponent = 0.5,
    baseLearningRate,
    baseSigmoidSlope,
    baseSigmoidIntercept,
    forcedZeroKeys = new Set<string>(),
    lockedMaxKeys = new Set<string>(),
    modelVersion = FORENSIC_MODEL_VERSION,
    singleDrawOnlineUpdate = false,
  } = params;

  const keys = Object.keys(currentWeights);
  const currentNorm = normalizeWeightsSimplex(currentWeights, { forcedZeroKeys });
  const activeCount = Math.max(1, keys.filter((k) => !forcedZeroKeys.has(k) && (currentNorm[k] ?? 0) > 0).length);

  const N = Math.max(1, windowMetrics.length);
  const isSingleDrawEceUninformative = N < SAMPLE_CYCLE_SCALE;
  // Atténuation continue issue de l'échelle naturelle du jeu (90/5 = 18 tirages)
  const sampleAttenuation = Math.tanh(N / SAMPLE_CYCLE_SCALE);

  // Métriques agrégées & incertitudes sur la fenêtre
  const hitsArr = windowMetrics.map((m) => m.exactHits);
  const brierArr = windowMetrics.map((m) => m.brierScore);
  const logLossArr = windowMetrics.map((m) => m.logLoss);
  const eceArr = windowMetrics.map((m) => m.ece ?? 0);

  const meanHits = hitsArr.reduce((a, b) => a + b, 0) / N;
  const hitsVar = hitsArr.reduce((a, h) => a + (h - meanHits) ** 2, 0) / Math.max(1, N - 1);
  const hitsSE = N > 1 ? Math.sqrt(hitsVar / N) : Math.sqrt(UNIFORM_EXPECTED_HITS_TOP5);

  const meanBrier = brierArr.reduce((a, b) => a + b, 0) / N;
  const meanLogLoss = logLossArr.reduce((a, b) => a + b, 0) / N;
  const meanEce = isSingleDrawEceUninformative ? null : eceArr.reduce((a, b) => a + b, 0) / N;

  const brierSkills = brierArr.map((b) => 1.0 - b / UNIFORM_BRIER_BASELINE);
  const meanBrierSkill = brierSkills.reduce((a, s) => a + s, 0) / N;
  const skillVar = brierSkills.reduce((a, s) => a + (s - meanBrierSkill) ** 2, 0) / Math.max(1, N - 1);
  // Plancher binomial minimal sur N*90 observations pour éviter SE=0 sur fenêtre constante
  const bssMinFloor = UNIFORM_BRIER_BASELINE / Math.sqrt(N * DOMAIN_SIZE);
  const skillSE = N > 1 ? Math.max(bssMinFloor, Math.sqrt(skillVar / N)) : Math.abs(meanBrierSkill) + 1.0 / Math.sqrt(DOMAIN_SIZE);
  const zSkillBrier = meanBrierSkill / Math.max(1e-6, skillSE);

  const meanLogLossSkill = 1.0 - meanLogLoss / UNIFORM_LOG_LOSS_BASELINE;

  const histBrierValues = windowMetrics.map((m) => m.historicalBrier).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const histLogLossValues = windowMetrics.map((m) => m.historicalLogLoss).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const histHitsValues = windowMetrics.map((m) => m.historicalHits).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  const meanHistBrier = histBrierValues.length > 0 ? histBrierValues.reduce((a, b) => a + b, 0) / histBrierValues.length : null;
  const meanHistLogLoss = histLogLossValues.length > 0 ? histLogLossValues.reduce((a, b) => a + b, 0) / histLogLossValues.length : null;
  const meanHistHits = histHitsValues.length > 0 ? histHitsValues.reduce((a, b) => a + b, 0) / histHitsValues.length : null;

  // Barrière Prudence statistique réelle (A.7) :
  // Active si mise à jour mono-tirage isolée, échantillon insuffisant (N < 18), test z unilatéral < 1.645,
  // perte Log-Loss sous l'uniforme ou rendement Top-5 <= 25/90.
  const prudenceModeActive =
    singleDrawOnlineUpdate ||
    N < SAMPLE_CYCLE_SCALE ||
    zSkillBrier < Z_95_ONE_SIDED ||
    meanLogLossSkill <= 0 ||
    meanHits <= UNIFORM_EXPECTED_HITS_TOP5;

  // Taux d'apprentissage effectif continu : 0 strict quand la barrière Prudence est active !
  const eta0 = baseLearningRate ?? 1.0 / Math.sqrt(activeCount);
  const normH = clamp(hurstExponent, 0.01, 0.99);
  const hurstModulator = 1.0 / (1.0 + Math.exp(-4.0 * (normH - 0.5))); // 0.5 en marche aléatoire H=0.5
  const ent = clamp(entropyNormalized, 0, 1);
  const entropyDampener = Math.exp(-ent);
  const skillConfidence = N >= 2 ? 0.5 * (1.0 + Math.tanh(meanBrierSkill / Math.max(1e-4, skillSE))) : sampleAttenuation;

  const effectiveLearningRate = prudenceModeActive
    ? 0
    : clamp(
        eta0 * sampleAttenuation * (0.5 + hurstModulator) * entropyDampener * Math.max(0.1, skillConfidence),
        1e-4,
        1.0 / Math.sqrt(activeCount)
      );

  // Agrégation contrefactuelle PAR GÈNE sur les tirages distincts disponibles
  const attrWindowN = Math.max(1, drawAttributionsWindow.length);
  const attrByGene: Record<string, GeneCounterfactualAttribution[]> = {};
  for (const k of keys) attrByGene[k] = [];

  for (const drawAttrs of drawAttributionsWindow) {
    for (const a of drawAttrs) {
      if (attrByGene[a.key]) attrByGene[a.key].push(a);
    }
  }

  const maxLogStep = 1.0 / Math.sqrt(activeCount);
  const candidateRaw: Record<string, number> = {};
  const preliminaryMeta: Array<{
    key: string;
    currentWeight: number;
    meanScore: number;
    meanDeltaLL: number;
    meanDeltaBrier: number;
    meanLift: number;
    sampleCount: number;
    se: number;
    rawTarget: number;
  }> = [];

  for (const k of keys) {
    const curW = currentNorm[k] ?? 0;
    if (forcedZeroKeys.has(k) || curW <= 0) {
      candidateRaw[k] = 0;
      preliminaryMeta.push({
        key: k,
        currentWeight: 0,
        meanScore: 0,
        meanDeltaLL: 0,
        meanDeltaBrier: 0,
        meanLift: 0,
        sampleCount: attrByGene[k].length,
        se: 0,
        rawTarget: 0,
      });
      continue;
    }

    const list = attrByGene[k];
    const m = list.length;
    if (m === 0) {
      candidateRaw[k] = curW;
      preliminaryMeta.push({
        key: k,
        currentWeight: curW,
        meanScore: 0,
        meanDeltaLL: 0,
        meanDeltaBrier: 0,
        meanLift: 0,
        sampleCount: 0,
        se: 0,
        rawTarget: curW,
      });
      continue;
    }

    const meanScore = list.reduce((a, x) => a + x.counterfactualScore, 0) / m;
    const meanDeltaLL = list.reduce((a, x) => a + x.deltaLogLossAblation, 0) / m;
    const meanDeltaBrier = list.reduce((a, x) => a + x.deltaBrierAblation, 0) / m;
    const meanLift = list.reduce((a, x) => a + x.winnerLiftAblation, 0) / m;
    const varScore = list.reduce((a, x) => a + (x.counterfactualScore - meanScore) ** 2, 0) / Math.max(1, m - 1);
    const se = m > 1 ? Math.sqrt(varScore / m) : Math.abs(meanScore);

    // Contraction bayésienne de l'attribution par le ratio signal / incertitude : mean^2 / (mean^2 + se^2)
    const snrShrinkage =
      m > 1 && se > 1e-12
        ? (meanScore * meanScore) / (meanScore * meanScore + se * se)
        : Math.tanh(m / SAMPLE_CYCLE_SCALE);

    const signedStep = prudenceModeActive
      ? 0
      : clamp(effectiveLearningRate * meanScore * snrShrinkage, -maxLogStep, maxLogStep);
    const rawTarget = curW * Math.exp(signedStep);
    candidateRaw[k] = rawTarget;

    preliminaryMeta.push({
      key: k,
      currentWeight: curW,
      meanScore,
      meanDeltaLL,
      meanDeltaBrier,
      meanLift,
      sampleCount: m,
      se,
      rawTarget,
    });
  }

  // Lorsque Prudence est active, aucune mutation des poids n'est effectuée :
  // on retourne strictement les poids normalisés inchangés (barrière réelle A.7).
  const updatedWeights = prudenceModeActive
    ? { ...currentNorm }
    : normalizeWeightsSimplex(candidateRaw, {
        forcedZeroKeys,
        lockedMaxKeys,
        baselineWeights: currentNorm,
      });

  const weightDeltas: Record<string, number> = {};
  const aggregatedAttributions: AggregatedGeneAttribution[] = preliminaryMeta
    .map((item) => {
      const propW = updatedWeights[item.key] ?? 0;
      const delta = prudenceModeActive ? 0 : parseFloat((propW - item.currentWeight).toFixed(6));
      weightDeltas[item.key] = delta;
      return {
        key: item.key,
        currentWeight: item.currentWeight,
        meanCounterfactualScore: parseFloat(item.meanScore.toFixed(6)),
        meanDeltaLogLoss: parseFloat(item.meanDeltaLL.toFixed(6)),
        meanDeltaBrier: parseFloat(item.meanDeltaBrier.toFixed(6)),
        meanWinnerLift: parseFloat(item.meanLift.toFixed(6)),
        sampleCount: item.sampleCount,
        attributionSE: parseFloat(item.se.toFixed(6)),
        proposedWeight: propW,
        weightDelta: delta,
        deltaPercent:
          !prudenceModeActive && item.currentWeight > 0
            ? parseFloat((((propW - item.currentWeight) / item.currentWeight) * 100).toFixed(2))
            : 0,
      };
    })
    .sort((a, b) => b.meanCounterfactualScore - a.meanCounterfactualScore || a.key.localeCompare(b.key));

  // Calibration Platt ancrée sur le prior log-odds exact ln(5/85) sans nombres magiques ;
  // figée à zéro variation lorsque Prudence est active ou fenêtre < 18 (A.7 / A.8).
  const defaultSlope = typeof baseSigmoidSlope === 'number' && Number.isFinite(baseSigmoidSlope)
    ? clamp(baseSigmoidSlope, MIN_PLAUSIBLE_SLOPE, MAX_PLAUSIBLE_SLOPE)
    : 1.0;
  const defaultIntercept = typeof baseSigmoidIntercept === 'number' && Number.isFinite(baseSigmoidIntercept)
    ? baseSigmoidIntercept
    : LOGIT_UNIFORM_PRIOR;
  const slopeDelta = prudenceModeActive
    ? 0
    : sampleAttenuation *
      (1.0 / Math.sqrt(activeCount)) *
      Math.tanh(meanBrierSkill / Math.max(1e-4, skillSE + UNIFORM_BRIER_BASELINE));
  const newSigmoidSlope = clamp(defaultSlope + slopeDelta, MIN_PLAUSIBLE_SLOPE, MAX_PLAUSIBLE_SLOPE);
  // Ancrage logistique au prior 5/90 : delta_intercept maintient p(logit_prior) centré
  const interceptDelta = prudenceModeActive ? 0 : -slopeDelta * LOGIT_UNIFORM_PRIOR;
  const newSigmoidIntercept = defaultIntercept + interceptDelta;

  const audit: LearningAuditPayload = {
    modelVersion,
    sampleSize: N,
    sampleAttenuation: parseFloat(sampleAttenuation.toFixed(6)),
    effectiveLearningRate: parseFloat(effectiveLearningRate.toFixed(6)),
    uncertaintySE: parseFloat(skillSE.toFixed(6)),
    zSkillBrier: parseFloat(zSkillBrier.toFixed(4)),
    prudenceModeActive,
    prudenceBarrierEnforced: prudenceModeActive,
    isSingleDrawEceUninformative,
    nearMissesExcludedFromLearning: true,
    baselines: {
      uniformBrier: UNIFORM_BRIER_BASELINE,
      uniformLogLoss: UNIFORM_LOG_LOSS_BASELINE,
      uniformExpectedHits: UNIFORM_EXPECTED_HITS_TOP5,
      historicalBrier: meanHistBrier,
      historicalLogLoss: meanHistLogLoss,
      historicalExpectedHits: meanHistHits,
    },
    calibration: {
      brierScore: parseFloat(meanBrier.toFixed(6)),
      logLoss: parseFloat(meanLogLoss.toFixed(6)),
      ece: meanEce !== null ? parseFloat(meanEce.toFixed(6)) : null,
      brierSkillVsUniform: parseFloat(meanBrierSkill.toFixed(6)),
      logLossSkillVsUniform: parseFloat(meanLogLossSkill.toFixed(6)),
      brierSkillVsHistorical:
        meanHistBrier && meanHistBrier > 0 ? parseFloat((1.0 - meanBrier / meanHistBrier).toFixed(6)) : null,
      logLossSkillVsHistorical:
        meanHistLogLoss && meanHistLogLoss > 0
          ? parseFloat((1.0 - meanLogLoss / meanHistLogLoss).toFixed(6))
          : null,
      sigmoidSlope: parseFloat(newSigmoidSlope.toFixed(6)),
      sigmoidIntercept: parseFloat(newSigmoidIntercept.toFixed(6)),
      slopeDelta: parseFloat(slopeDelta.toFixed(6)),
      interceptDelta: parseFloat(interceptDelta.toFixed(6)),
    },
    aggregatedAttributions,
    weightDeltas,
    justificationSummary:
      `Fenêtre N=${N} tirages distincts (atténuation ${(sampleAttenuation * 100).toFixed(1)}%, gènes=${attrWindowN}) : ` +
      `Hits moyens ${meanHits.toFixed(3)}±${hitsSE.toFixed(3)} vs uniforme ${UNIFORM_EXPECTED_HITS_TOP5.toFixed(3)}, ` +
      `Brier ${meanBrier.toFixed(5)} (BSS ${(meanBrierSkill * 100).toFixed(2)}%, z=${zSkillBrier.toFixed(2)}), ` +
      `LogLoss ${meanLogLoss.toFixed(5)} (LLSS ${(meanLogLossSkill * 100).toFixed(2)}%). ` +
      `Prudence=${prudenceModeActive ? 'ACTIVE (mutation bloquée)' : 'STANDARD'}.`,
  };

  return { updatedWeights, audit };
}

/**
 * Reconstructeur déterministe de signaux par gène à partir d'un historique STRICTEMENT antérieur
 * (utilisable dans l'Edge Function Deno et dans le validateur walk-forward chronologique sans fuite).
 * Les clés génériques et les clés `AlgoKey` sont toutes prises en charge de façon cohérente.
 */
export function reconstructDeterministicGeneScores(
  priorDrawsNewestFirst: Array<{ gagnants: number[]; machine?: number[] }>,
  requestedKeys: string[]
): Record<string, number[]> {
  const T = priorDrawsNewestFirst.length;
  const keys = requestedKeys.length > 0
    ? requestedKeys
    : ['frequency', 'gap', 'spectral', 'markov', 'bayes', 'momentum', 'affinity', 'spatial', 'temporal', 'fractal'];

  const out: Record<string, number[]> = {};
  for (const k of keys) {
    out[k] = new Array<number>(DOMAIN_SIZE).fill(0);
  }
  if (T === 0) {
    for (const k of keys) out[k].fill(UNIFORM_MARGINAL_PROB);
    return out;
  }

  const freq = new Array<number>(DOMAIN_SIZE).fill(0);
  const gap = new Array<number>(DOMAIN_SIZE).fill(T);
  const lastWinners = (priorDrawsNewestFirst[0]?.gagnants || []).filter((n) => n >= 1 && n <= DOMAIN_SIZE);
  const lastMachine = (priorDrawsNewestFirst[0]?.machine || []).filter((n) => n >= 1 && n <= DOMAIN_SIZE);
  const shortWin = Math.max(1, Math.min(DRAW_PICK_SIZE, Math.floor(T / 2)));
  const shortFreq = new Array<number>(DOMAIN_SIZE).fill(0);

  for (let t = 0; t < T; t++) {
    const g = priorDrawsNewestFirst[t]?.gagnants || [];
    for (const n of g) {
      if (n >= 1 && n <= DOMAIN_SIZE) {
        freq[n - 1] += 1;
        if (gap[n - 1] === T) gap[n - 1] = t;
        if (t < shortWin) shortFreq[n - 1] += 1;
      }
    }
  }

  // Co-occurrences & transitions Markoviennes (ordre 1) uniquement dans priorDraws
  const coOccur = new Array<number>(DOMAIN_SIZE).fill(0);
  const markov = new Array<number>(DOMAIN_SIZE).fill(0);
  const lastSet = new Set(lastWinners);
  const markovDepth = Math.min(T - 1, SAMPLE_CYCLE_SCALE * 2);

  for (let t = 0; t < markovDepth; t++) {
    const curr = priorDrawsNewestFirst[t]?.gagnants || [];
    const prev = priorDrawsNewestFirst[t + 1]?.gagnants || [];
    const matchesPrev = prev.some((p) => lastSet.has(p));
    for (const n of curr) {
      if (n >= 1 && n <= DOMAIN_SIZE) {
        if (matchesPrev) markov[n - 1] += 1;
        if (curr.some((o) => o !== n && lastSet.has(o))) coOccur[n - 1] += 1;
      }
    }
  }

  const omega = (2 * Math.PI) / Math.max(3, Math.floor(T / 3));
  const lastMachSet = new Set(lastMachine);
  const hasMachine = priorDrawsNewestFirst.some((d) => Array.isArray(d.machine) && d.machine.length > 0);

  for (let i = 0; i < DOMAIN_SIZE; i++) {
    const n = i + 1;
    const fNorm = (freq[i] + UNIFORM_MARGINAL_PROB) / (T + 1);
    const gNorm = Math.exp(-gap[i] / SAMPLE_CYCLE_SCALE);
    const momNorm = clamp(0.5 + (shortFreq[i] / shortWin - freq[i] / T), 0, 1);
    const markovNorm = markov[i] / Math.max(1, markovDepth);
    const bayesNorm = fNorm / (1 + Math.abs(gap[i] - T / Math.max(1, freq[i])) / SAMPLE_CYCLE_SCALE);
    const affNorm = coOccur[i] / Math.max(1, markovDepth);

    // Spatial grid (9x10)
    const row = Math.floor((n - 1) / 10);
    const col = (n - 1) % 10;
    let minGrid = 10;
    for (const lw of lastWinners) {
      const lr = Math.floor((lw - 1) / 10);
      const lc = (lw - 1) % 10;
      const dist = Math.hypot(row - lr, col - lc);
      if (dist < minGrid) minGrid = dist;
    }
    const spatialNorm = lastWinners.length > 0 ? Math.exp(-minGrid / Math.sqrt(SAMPLE_CYCLE_SCALE)) : UNIFORM_MARGINAL_PROB;

    // Spectral DFT à l'instant t-1
    let re = 0;
    let im = 0;
    const specDepth = Math.min(T, SAMPLE_CYCLE_SCALE * 2);
    for (let s = 0; s < specDepth; s++) {
      if ((priorDrawsNewestFirst[s]?.gagnants || []).includes(n)) {
        re += Math.cos(omega * s);
        im += Math.sin(omega * s);
      }
    }
    const specNorm = Math.hypot(re, im) / Math.max(1, specDepth);

    // Résistance miroir / complément 91 & voisins
    const mir91 = 91 - n;
    const neighborHit = lastWinners.some((lw) => Math.abs(lw - n) === 1 || lw === mir91) ? 1 : 0;

    for (const key of keys) {
      const kLower = key.toLowerCase();
      if (kLower.includes('machine')) {
        out[key][i] = hasMachine && lastMachSet.has(n) ? 1.0 : 0.0;
      } else if (kLower.includes('freq')) {
        out[key][i] = fNorm;
      } else if (kLower === 'gap' || kLower.includes('gap_')) {
        out[key][i] = gNorm;
      } else if (kLower.includes('spectral') || kLower.includes('monthly') || kLower.includes('wavelet')) {
        out[key][i] = specNorm;
      } else if (kLower.includes('markov') || kLower.includes('inter_draw')) {
        out[key][i] = markovNorm;
      } else if (kLower.includes('bayes') || kLower.includes('shadow')) {
        out[key][i] = bayesNorm;
      } else if (kLower.includes('momentum') || kLower.includes('trend')) {
        out[key][i] = momNorm;
      } else if (kLower.includes('affinity') || kLower.includes('jaccard') || kLower.includes('network')) {
        out[key][i] = affNorm;
      } else if (kLower.includes('spatial') || kLower.includes('neighbor') || kLower.includes('derived')) {
        out[key][i] = 0.5 * spatialNorm + 0.5 * neighborHit;
      } else if (kLower.includes('temporal') || kLower.includes('sequence') || kLower.includes('echo')) {
        out[key][i] = 0.5 * gNorm + 0.5 * momNorm;
      } else if (kLower.includes('fractal') || kLower.includes('isolation')) {
        out[key][i] = Math.exp(-Math.abs(shortFreq[i] / shortWin - freq[i] / T));
      } else {
        out[key][i] = 0.5 * fNorm + 0.5 * bayesNorm;
      }
    }
  }

  return out;
}

/**
 * Validation chronologique stricte en Walk-Forward (Zéro fuite d'information) :
 * - Trie l'historique du plus ancien au plus récent.
 * - À chaque pas t >= warmup, reconstruit signaux et poids UNIQUEMENT à partir de draws[0 .. t-1].
 * - Compare le modèle aux baselines uniforme et historique, découpé sur plusieurs périodes chronologiques,
 *   avec taille d'échantillon N et incertitude (SE & IC 95%).
 */
export function runChronologicalWalkForwardValidation(params: {
  drawName: string;
  chronologicalDrawsOldestFirst: Array<{
    date: string;
    gagnants: number[];
    machine?: number[];
  }>;
  geneKeys: string[];
  initialWeights?: Record<string, number>;
  warmupDraws?: number;
  periodCount?: number;
  scoreProvider?: (
    priorDrawsNewestFirst: Array<{ date: string; gagnants: number[]; machine?: number[] }>,
    weights: Record<string, number>,
    geneKeys: string[]
  ) => Record<string, number[]>;
}): WalkForwardValidationReport {
  const {
    drawName,
    chronologicalDrawsOldestFirst,
    geneKeys,
    warmupDraws,
    periodCount = 3,
    scoreProvider,
  } = params;

  const totalDraws = chronologicalDrawsOldestFirst.length;
  const minWarmup = warmupDraws ?? Math.max(5, Math.min(SAMPLE_CYCLE_SCALE, Math.floor(totalDraws / 3)));
  const effectiveWarmup = Math.min(Math.max(3, minWarmup), Math.max(3, totalDraws - 1));

  const hasAnyMachine = chronologicalDrawsOldestFirst.some(
    (d) => Array.isArray(d.machine) && d.machine.length > 0
  );
  const forcedZeroKeys = new Set<string>();
  if (!hasAnyMachine) {
    for (const k of geneKeys) {
      if (k.toLowerCase().includes('machine')) forcedZeroKeys.add(k);
    }
  }

  const baseInit: Record<string, number> = {};
  for (const k of geneKeys) {
    if (forcedZeroKeys.has(k)) baseInit[k] = 0;
    else baseInit[k] = params.initialWeights?.[k] ?? 1.0 / Math.max(1, geneKeys.length);
  }
  let currentWeights = normalizeWeightsSimplex(baseInit, { forcedZeroKeys });

  interface StepEval {
    date: string;
    modelHits: number;
    histHits: number;
    modelBrier: number;
    histBrier: number;
    modelLogLoss: number;
    histLogLoss: number;
    marginals90: number[];
    outcomes90: number[];
  }

  const evals: StepEval[] = [];
  const attributionsWindow: GeneCounterfactualAttribution[][] = [];
  const windowMetrics: Array<{
    exactHits: number;
    brierScore: number;
    logLoss: number;
    ece: number;
    historicalBrier: number | null;
    historicalLogLoss: number | null;
    historicalHits: number | null;
  }> = [];

  for (let t = effectiveWarmup; t < totalDraws; t++) {
    const targetDraw = chronologicalDrawsOldestFirst[t];
    // Strictement antérieur à t : [0 .. t-1], remis du plus récent (t-1) au plus ancien (0)
    const priorNewestFirst = chronologicalDrawsOldestFirst.slice(0, t).reverse();

    const geneScores = scoreProvider
      ? scoreProvider(priorNewestFirst, currentWeights, geneKeys)
      : reconstructDeterministicGeneScores(priorNewestFirst, geneKeys);

    // Combinaison linéaire d'ensemble avec les poids appris UNIQUEMENT jusqu'à t-1
    const rawEnsemble = new Array<number>(DOMAIN_SIZE).fill(0);
    for (const k of geneKeys) {
      const w = currentWeights[k] ?? 0;
      const vec = geneScores[k];
      if (!vec || w <= 0) continue;
      for (let i = 0; i < DOMAIN_SIZE; i++) {
        rawEnsemble[i] += w * (Number.isFinite(vec[i]) ? vec[i] : 0);
      }
    }

    const marginals90 = projectScoresToCoherentMarginals(rawEnsemble, DRAW_PICK_SIZE);
    const ranked = rawEnsemble
      .map((s, idx) => ({ num: idx + 1, s }))
      .sort((a, b) => b.s - a.s || a.num - b.num);
    const top5Predicted = ranked.slice(0, DRAW_PICK_SIZE).map((r) => r.num);

    const evaluation = evaluateMarginalPredictions({
      marginals90,
      actualWinners: targetDraw.gagnants,
      top5Predicted,
      priorDraws: priorNewestFirst,
    });

    const winnersSet = new Set(targetDraw.gagnants);
    const outcomes90 = Array.from({ length: DOMAIN_SIZE }, (_, idx) => (winnersSet.has(idx + 1) ? 1 : 0));

    evals.push({
      date: targetDraw.date,
      modelHits: evaluation.exactHits,
      histHits: evaluation.historicalBaseline?.actualHitsTop5 ?? 0,
      modelBrier: evaluation.brierScore,
      histBrier: evaluation.historicalBaseline?.brierScore ?? UNIFORM_BRIER_BASELINE,
      modelLogLoss: evaluation.logLoss,
      histLogLoss: evaluation.historicalBaseline?.logLoss ?? UNIFORM_LOG_LOSS_BASELINE,
      marginals90: evaluation.marginals90,
      outcomes90,
    });

    // Attribution contrefactuelle post-tirage (toujours hors-échantillon pour t+1!)
    const stepAttrs = computeCounterfactualGeneAttributions({
      channelKeys: geneKeys,
      geneScores,
      weights: currentWeights,
      actualWinners: targetDraw.gagnants,
    });
    attributionsWindow.push(stepAttrs);
    windowMetrics.push({
      exactHits: evaluation.exactHits,
      brierScore: evaluation.brierScore,
      logLoss: evaluation.logLoss,
      ece: evaluation.ece,
      historicalBrier: evaluation.historicalBaseline?.brierScore ?? null,
      historicalLogLoss: evaluation.historicalBaseline?.logLoss ?? null,
      historicalHits: evaluation.historicalBaseline?.actualHitsTop5 ?? null,
    });

    // Mise à jour prudente glissante sur une fenêtre maximale de SAMPLE_CYCLE_SCALE (18) derniers tirages
    const recentWindowStart = Math.max(0, attributionsWindow.length - SAMPLE_CYCLE_SCALE);
    const updateRes = computeCautiousAggregatedWeightUpdate({
      currentWeights,
      drawAttributionsWindow: attributionsWindow.slice(recentWindowStart),
      windowMetrics: windowMetrics.slice(recentWindowStart),
      forcedZeroKeys,
    });
    currentWeights = updateRes.updatedWeights;
  }

  const summarizeSlice = (slice: StepEval[]): BaselineComparisonMetrics => {
    const N = slice.length;
    if (N === 0) {
      return {
        sampleSize: 0,
        modelMeanHits: UNIFORM_EXPECTED_HITS_TOP5,
        modelHitsSE: 0,
        modelHitsCI95: [UNIFORM_EXPECTED_HITS_TOP5, UNIFORM_EXPECTED_HITS_TOP5],
        uniformExpectedHits: UNIFORM_EXPECTED_HITS_TOP5,
        historicalMeanHits: UNIFORM_EXPECTED_HITS_TOP5,
        historicalHitsSE: 0,
        modelMeanBrier: UNIFORM_BRIER_BASELINE,
        uniformBrier: UNIFORM_BRIER_BASELINE,
        historicalMeanBrier: UNIFORM_BRIER_BASELINE,
        brierSkillVsUniform: 0,
        brierSkillVsHistorical: 0,
        modelMeanLogLoss: UNIFORM_LOG_LOSS_BASELINE,
        uniformLogLoss: UNIFORM_LOG_LOSS_BASELINE,
        historicalMeanLogLoss: UNIFORM_LOG_LOSS_BASELINE,
        logLossSkillVsUniform: 0,
        logLossSkillVsHistorical: 0,
        ece: 0,
        uncertaintySE: 0,
        isStatisticallySignificantEdge: false,
      };
    }

    const meanModelHits = slice.reduce((a, x) => a + x.modelHits, 0) / N;
    const meanHistHits = slice.reduce((a, x) => a + x.histHits, 0) / N;
    const varModelHits = slice.reduce((a, x) => a + (x.modelHits - meanModelHits) ** 2, 0) / Math.max(1, N - 1);
    const varHistHits = slice.reduce((a, x) => a + (x.histHits - meanHistHits) ** 2, 0) / Math.max(1, N - 1);
    const modelHitsSE = N > 1 ? Math.sqrt(varModelHits / N) : Math.sqrt(UNIFORM_EXPECTED_HITS_TOP5);
    const histHitsSE = N > 1 ? Math.sqrt(varHistHits / N) : Math.sqrt(UNIFORM_EXPECTED_HITS_TOP5);

    // Quantile z_97.5 ≈ 1.96 (référence normale standard publiée)
    const z95 = 1.96;
    const ciLow = Math.max(0, meanModelHits - z95 * modelHitsSE);
    const ciHigh = Math.min(DRAW_PICK_SIZE, meanModelHits + z95 * modelHitsSE);

    const meanModelBrier = slice.reduce((a, x) => a + x.modelBrier, 0) / N;
    const meanHistBrier = slice.reduce((a, x) => a + x.histBrier, 0) / N;
    const meanModelLogLoss = slice.reduce((a, x) => a + x.modelLogLoss, 0) / N;
    const meanHistLogLoss = slice.reduce((a, x) => a + x.histLogLoss, 0) / N;

    const brierSkills = slice.map((x) => 1.0 - x.modelBrier / UNIFORM_BRIER_BASELINE);
    const meanBss = brierSkills.reduce((a, b) => a + b, 0) / N;
    const varBss = brierSkills.reduce((a, b) => a + (b - meanBss) ** 2, 0) / Math.max(1, N - 1);
    const uncertaintySE = N > 1 ? Math.sqrt(varBss / N) : 1.0 / Math.sqrt(DOMAIN_SIZE);

    const pooledP = slice.flatMap((x) => x.marginals90);
    const pooledY = slice.flatMap((x) => x.outcomes90);
    const ece = computeCalibrationEce(pooledP, pooledY);

    const brierSkillVsUniform = 1.0 - meanModelBrier / UNIFORM_BRIER_BASELINE;
    const brierSkillVsHistorical = 1.0 - meanModelBrier / Math.max(1e-9, meanHistBrier);
    const logLossSkillVsUniform = 1.0 - meanModelLogLoss / UNIFORM_LOG_LOSS_BASELINE;
    const logLossSkillVsHistorical = 1.0 - meanModelLogLoss / Math.max(1e-9, meanHistLogLoss);

    // Avantage statistique démontré hors échantillon uniquement si N >= 18 ET borne inférieure du gain > 0
    const isStatisticallySignificantEdge =
      N >= SAMPLE_CYCLE_SCALE &&
      brierSkillVsUniform > z95 * uncertaintySE &&
      logLossSkillVsUniform > 0 &&
      meanModelHits > UNIFORM_EXPECTED_HITS_TOP5;

    return {
      sampleSize: N,
      modelMeanHits: parseFloat(meanModelHits.toFixed(4)),
      modelHitsSE: parseFloat(modelHitsSE.toFixed(4)),
      modelHitsCI95: [parseFloat(ciLow.toFixed(4)), parseFloat(ciHigh.toFixed(4))],
      uniformExpectedHits: parseFloat(UNIFORM_EXPECTED_HITS_TOP5.toFixed(4)),
      historicalMeanHits: parseFloat(meanHistHits.toFixed(4)),
      historicalHitsSE: parseFloat(histHitsSE.toFixed(4)),
      modelMeanBrier: parseFloat(meanModelBrier.toFixed(6)),
      uniformBrier: parseFloat(UNIFORM_BRIER_BASELINE.toFixed(6)),
      historicalMeanBrier: parseFloat(meanHistBrier.toFixed(6)),
      brierSkillVsUniform: parseFloat(brierSkillVsUniform.toFixed(6)),
      brierSkillVsHistorical: parseFloat(brierSkillVsHistorical.toFixed(6)),
      modelMeanLogLoss: parseFloat(meanModelLogLoss.toFixed(6)),
      uniformLogLoss: parseFloat(UNIFORM_LOG_LOSS_BASELINE.toFixed(6)),
      historicalMeanLogLoss: parseFloat(meanHistLogLoss.toFixed(6)),
      logLossSkillVsUniform: parseFloat(logLossSkillVsUniform.toFixed(6)),
      logLossSkillVsHistorical: parseFloat(logLossSkillVsHistorical.toFixed(6)),
      ece: parseFloat(ece.toFixed(6)),
      uncertaintySE: parseFloat(uncertaintySE.toFixed(6)),
      isStatisticallySignificantEdge,
    };
  };

  const overall = summarizeSlice(evals);

  const periods: WalkForwardPeriodReport[] = [];
  const actualPeriodCount = Math.max(1, Math.min(periodCount, evals.length));
  if (evals.length > 0) {
    for (let p = 0; p < actualPeriodCount; p++) {
      const start = Math.floor((p * evals.length) / actualPeriodCount);
      const end = Math.floor(((p + 1) * evals.length) / actualPeriodCount);
      const sub = evals.slice(start, end);
      if (sub.length === 0) continue;
      periods.push({
        periodIndex: p + 1,
        label: `Période ${p + 1}/${actualPeriodCount}`,
        startDate: sub[0].date,
        endDate: sub[sub.length - 1].date,
        ...summarizeSlice(sub),
      });
    }
  }

  const finalUpdate = computeCautiousAggregatedWeightUpdate({
    currentWeights,
    drawAttributionsWindow: attributionsWindow,
    windowMetrics,
    forcedZeroKeys,
  });

  const warningNote =
    evals.length < SAMPLE_CYCLE_SCALE
      ? `Échantillon faible (N=${evals.length} < ${SAMPLE_CYCLE_SCALE}) : incertitude élevée (±${overall.modelHitsSE.toFixed(3)} hits), aucune mutation agressive justifiée.`
      : overall.isStatisticallySignificantEdge
      ? `Avantage hors-échantillon mesuré sur N=${evals.length} tirages (BSS ${(overall.brierSkillVsUniform * 100).toFixed(2)}% > 1.96×SE).`
      : `Aucun avantage significatif démontré hors-échantillon vs hasard uniforme (N=${evals.length}, BSS ${(overall.brierSkillVsUniform * 100).toFixed(2)}%, SE ${(overall.uncertaintySE * 100).toFixed(2)}%). Rester en mode prudence.`;

  return {
    drawName,
    modelVersion: FORENSIC_MODEL_VERSION,
    totalDraws,
    evaluatedDraws: evals.length,
    warmupDraws: effectiveWarmup,
    overall,
    periods,
    finalWeights: currentWeights,
    geneSummary: finalUpdate.audit.aggregatedAttributions,
    warningNote,
  };
}
