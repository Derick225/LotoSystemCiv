import {
  DRAW_DOMAIN_SIZE,
  DRAW_PICK_SIZE,
  UNIFORM_BRIER_REFERENCE,
} from '../../shared/drawTheory';

/**
 * CALIBRATION DU SKILL EMPIRIQUE & SHRINKAGE VERS L'ÉQUIPROBABILITÉ.
 *
 * Le moteur produit une distribution marginale sur le simplexe (Σ p_n = 5) à partir d'un
 * stacking log-linéaire de canaux. Cette distribution est *relative* : elle ordonne les
 * numéros, mais rien ne garantit — et l'audit des 6 506 tirages réels le confirme — qu'elle
 * possède un pouvoir prédictif mesurable. Exposer des probabilités non shrinkées revient
 * donc à revendiquer un edge non prouvé (Brier ≈ 0,105 contre 0,052 pour l'uniforme).
 *
 * Principe : le seul degré de confiance admissible dans les probabilités affichées est le
 * Brier Skill Score (BSS) out-of-fold RÉELLEMENT mesuré, avec son incertitude. On applique
 * un shrinkage d'empirical Bayes :
 *
 *     λ = μ₊² / (μ₊² + σ²),   μ₊ = max(0, BSS)
 *
 * λ ∈ [0, 1] est continu : BSS nul/négatif ⇒ λ = 0 ⇒ probabilités exactement uniformes ;
 * BSS positif et précis ⇒ λ → 1 ⇒ distribution du modèle conservée. Aucun seuil binaire,
 * aucune constante arbitraire : μ et σ proviennent du rapport walk-forward / bootstrap.
 */

export type SkillEvidenceSource = 'holdout' | 'block_bootstrap' | 'walk_forward' | 'none';

export interface SkillEvidence {
  brierSkillScore?: number;
  evaluatedWindows?: number;
  holdoutBrierSkillScore?: number;
  holdoutDraws?: number;
  blockBootstrapBssMean?: number;
  blockBootstrapBssStd?: number;
}

export interface EmpiricalSkillEstimate {
  /** Facteur de rétention du signal du modèle, dans [0, 1]. */
  shrinkage: number;
  /** BSS retenu (peut être négatif). */
  pointEstimate: number;
  /** Part positive du BSS, base du calcul de λ. */
  positiveEstimate: number;
  /** Incertitude σ utilisée (bootstrap mesuré, sinon borne d'échantillonnage). */
  uncertainty: number;
  /** Nombre d'observations out-of-fold supportant l'estimation. */
  evidenceDraws: number;
  source: SkillEvidenceSource;
  brierReference: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const clampUnit = (v: number): number => clamp(v, 0, 1);

const toFiniteNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const toCount = (v: unknown): number => {
  const n = toFiniteNumber(v);
  return n === null || n <= 0 ? 0 : Math.floor(n);
};

/**
 * Le BSS est borné à [−1, 1] par le moteur (1 = prédiction parfaite, 0 = référence
 * uniforme). On borne l'entrée dans ce même domaine avant toute agrégation.
 */
const clampBss = (v: number): number => clamp(v, -1, 1);

/**
 * Dérive λ à partir de la preuve out-of-fold. Priorité à la holdout (la plus honnête),
 * puis au bootstrap de blocs (moyenne + écart-type mesurés), puis au BSS walk-forward.
 *
 * Sans écart-type bootstrap, σ est borné par l'inégalité de Popoviciu pour un score borné
 * dans [−1, 1] : sd ≤ 1, donc SE ≤ 1/√n. C'est une borne conservatrice, pas un réglage.
 */
export function deriveSkillShrinkage(evidence: SkillEvidence): EmpiricalSkillEstimate {
  const holdoutDraws = toCount(evidence.holdoutDraws);
  const windows = toCount(evidence.evaluatedWindows);

  const holdoutBss = toFiniteNumber(evidence.holdoutBrierSkillScore);
  const bootstrapMean = toFiniteNumber(evidence.blockBootstrapBssMean);
  const bootstrapStd = toFiniteNumber(evidence.blockBootstrapBssStd);
  const walkForwardBss = toFiniteNumber(evidence.brierSkillScore);

  let pointEstimate = 0;
  let evidenceDraws = 0;
  let source: SkillEvidenceSource = 'none';

  if (holdoutDraws > 0 && holdoutBss !== null) {
    pointEstimate = clampBss(holdoutBss);
    evidenceDraws = holdoutDraws;
    source = 'holdout';
  } else if (windows > 0 && bootstrapMean !== null && bootstrapStd !== null && bootstrapStd > 0) {
    pointEstimate = clampBss(bootstrapMean);
    evidenceDraws = windows;
    source = 'block_bootstrap';
  } else if (windows > 0 && walkForwardBss !== null) {
    pointEstimate = clampBss(walkForwardBss);
    evidenceDraws = windows;
    source = 'walk_forward';
  }

  if (evidenceDraws === 0) {
    return {
      shrinkage: 0,
      pointEstimate: 0,
      positiveEstimate: 0,
      uncertainty: Infinity,
      evidenceDraws: 0,
      source: 'none',
      brierReference: UNIFORM_BRIER_REFERENCE,
    };
  }

  const positiveEstimate = Math.max(0, pointEstimate);
  const measuredStd = bootstrapStd !== null && bootstrapStd > 0 ? bootstrapStd : null;
  const uncertainty = measuredStd ?? 1 / Math.sqrt(evidenceDraws);

  const shrinkage = positiveEstimate > 0
    ? (positiveEstimate * positiveEstimate) /
      (positiveEstimate * positiveEstimate + uncertainty * uncertainty)
    : 0;

  return {
    shrinkage: clampUnit(shrinkage),
    pointEstimate,
    positiveEstimate,
    uncertainty,
    evidenceDraws,
    source,
    brierReference: UNIFORM_BRIER_REFERENCE,
  };
}

/**
 * Shrinkage du vecteur de probabilités vers l'équiprobabilité, dans l'espace log :
 *
 *     z_n = ln(p_n),   z'_n = λ · z_n,   p'_n = softmax(z')_n · Σ p
 *
 * - λ = 0 ⇒ p'_n = Σp / N pour tous les numéros (aucun edge revendiqué).
 * - λ = 1 ⇒ p' = p (modulo normalisation), le classement et les écarts sont conservés.
 * - 0 < λ < 1 ⇒ les écarts sont atténués continûment, l'ordre relatif est préservé.
 *
 * La masse totale Σp est préservée (5 pour le simplexe 5/90). Les entrées non positives
 * sont plancherisées au plus petit positif observé afin que le logarithme reste défini.
 */
export function shrinkProbabilityVector(
  probabilities: ReadonlyArray<number>,
  shrinkage: number
): number[] {
  const n = probabilities.length;
  if (n === 0) return [];

  const lambda = clampUnit(Number.isFinite(shrinkage) ? shrinkage : 0);

  let totalMass = 0;
  let minPositive = Infinity;
  for (const p of probabilities) {
    if (Number.isFinite(p) && p > 0) {
      totalMass += p;
      if (p < minPositive) minPositive = p;
    }
  }

  if (!(totalMass > 0) || !Number.isFinite(minPositive)) {
    return new Array(n).fill(1 / n);
  }

  if (lambda === 0) {
    return new Array(n).fill(totalMass / n);
  }

  const logits = probabilities.map((p) =>
    Math.log(Number.isFinite(p) && p > 0 ? p : minPositive)
  );

  let maxScaled = -Infinity;
  const scaled = logits.map((z) => {
    const s = lambda * z;
    if (s > maxScaled) maxScaled = s;
    return s;
  });

  let sumExp = 0;
  const exps = scaled.map((s) => {
    const e = Math.exp(s - maxScaled);
    sumExp += e;
    return e;
  });

  return exps.map((e) => (e / sumExp) * totalMass);
}

export interface PredictionEdgeSummary {
  totalMass: number;
  topK: number;
  meanProbability: number;
  uniformProbability: number;
  maxProbability: number;
  expectedHitsTopK: number;
  uniformExpectedHitsTopK: number;
  liftVsUniform: number;
  maxLiftVsUniform: number;
  brierReference: number;
}

/**
 * Synthèse honnête de l'edge affiché : espérance de gains du top-K, lift face à
 * l'équiprobabilité (5/90 par numéro) et probabilité maximale. Aucune de ces valeurs
 * n'est une probabilité de remporter le tirage : ce sont des marginales par numéro.
 */
export function summarizePredictionEdge(
  probabilities: ReadonlyArray<number>,
  topNumbers: ReadonlyArray<number>
): PredictionEdgeSummary {
  const n = probabilities.length;
  const totalMass = probabilities.reduce(
    (sum, p) => sum + (Number.isFinite(p) && p > 0 ? p : 0),
    0
  );
  const uniformProbability = n > 0 ? totalMass / n : 0;
  const meanProbability = uniformProbability;

  let maxProbability = 0;
  for (const p of probabilities) {
    if (Number.isFinite(p) && p > maxProbability) maxProbability = p;
  }

  const seen = new Set<number>();
  let expectedHitsTopK = 0;
  for (const num of topNumbers) {
    const idx = Math.floor(num) - 1;
    if (idx >= 0 && idx < n && !seen.has(idx)) {
      seen.add(idx);
      const p = probabilities[idx];
      if (Number.isFinite(p) && p > 0) expectedHitsTopK += p;
    }
  }
  const topK = seen.size;

  const uniformExpectedHitsTopK = topK * uniformProbability;
  const liftVsUniform = uniformExpectedHitsTopK > 0 ? expectedHitsTopK / uniformExpectedHitsTopK : 0;
  const maxLiftVsUniform = uniformProbability > 0 ? maxProbability / uniformProbability : 0;

  return {
    totalMass,
    topK,
    meanProbability,
    uniformProbability,
    maxProbability,
    expectedHitsTopK,
    uniformExpectedHitsTopK,
    liftVsUniform,
    maxLiftVsUniform,
    brierReference: UNIFORM_BRIER_REFERENCE,
  };
}

export const UNIFORM_MARGINAL_PROBABILITY = DRAW_PICK_SIZE / DRAW_DOMAIN_SIZE;
