import { z } from 'zod';
import {
  DOMAIN_SIZE,
  DRAW_PICK_SIZE,
  FORENSIC_MODEL_VERSION,
  SAMPLE_CYCLE_SCALE,
  UNIFORM_BRIER_BASELINE,
  UNIFORM_EXPECTED_HITS_TOP5,
  UNIFORM_LOG_LOSS_BASELINE,
  computeCanonicalExactHitsAndNearMisses,
  computeCanonicalTopologicalLoss,
  computeCautiousAggregatedWeightUpdate,
  computeCounterfactualGeneAttributions,
  computeHypergeometricTailPValue,
  deriveCoherentMarginalsFromSnapshot,
  evaluateMarginalPredictions,
  normalizeWeightsSimplex,
  reconstructDeterministicGeneScores,
  sanitizeTop5Numbers,
  type GeneCounterfactualAttribution,
  type LearningAuditPayload,
} from './forensic-learning-engine.ts';

export const AutopsyRequestSchema = z.object({
  snapshotId: z.string().uuid(),
  drawResultId: z.string().uuid(),
});

export type AutopsyActor =
  | { kind: 'system' }
  | { kind: 'admin'; userId: string }
  | { kind: 'user'; userId: string };

export interface RunForensicAutopsyOptions {
  actor?: AutopsyActor;
}

export interface SnapshotRecord {
  id: string;
  user_id?: string | null;
  draw_name: string;
  target_date?: string | null;
  created_at?: string | null;
  predicted_numbers: number[];
  decision_dna?: Record<string, number> | null;
  metrics_snapshot?: Record<string, any> | null;
  status?: string | null;
  autopsy_report?: Record<string, any> | null;
}

export interface DrawResultRecord {
  id: string;
  draw_name?: string;
  date: string;
  gagnants: number[];
  machine?: number[] | null;
}

export interface PriorPostMortemRecord {
  draw_result_id?: string | null;
  draw_date: string;
  exact_hits: number;
  brier_score: number;
  log_loss?: number | null;
  calibration_ece?: number | null;
  is_global_learning_applied?: boolean | null;
  counterfactual_analysis?: {
    geneAttributions?: GeneCounterfactualAttribution[];
    historicalBaseline?: {
      brierScore?: number | null;
      logLoss?: number | null;
      actualHitsTop5?: number | null;
    };
  } | null;
}

export interface ModelWeightsConfigRecord {
  draw_name: string;
  weights: Record<string, number>;
  sigmoid_slope?: number | null;
  sigmoid_intercept?: number | null;
  weight_version?: number | null;
}

export interface ForensicAutopsyDeps {
  getSnapshot(snapshotId: string): Promise<SnapshotRecord | null>;
  getDrawResult(drawResultId: string): Promise<DrawResultRecord | null>;
  findExistingReview(
    snapshotId: string,
    drawResultId: string,
    modelVersion: string
  ): Promise<{ id: string; report?: Record<string, any> | null } | null>;
  hasGlobalDrawLearned?(
    drawResultId: string,
    modelVersion: string
  ): Promise<boolean>;
  getPriorDrawResults(
    drawName: string,
    beforeDateIso: string,
    limit: number
  ): Promise<DrawResultRecord[]>;
  getPriorPostMortemReviews(
    drawName: string,
    beforeDateIso: string,
    modelVersion: string,
    limit: number
  ): Promise<PriorPostMortemRecord[]>;
  getCurrentWeightsConfig(drawName: string): Promise<ModelWeightsConfigRecord | null>;
  applyAtomicPersistence(params: {
    p_snapshot_id: string;
    p_draw_result_id: string;
    p_model_version: string;
    p_user_id: string | null;
    p_draw_name: string;
    p_draw_date: string;
    p_exact_hits: number;
    p_near_miss_count: number;
    p_brier_score: number;
    p_log_loss: number;
    p_calibration_ece: number | null;
    p_brier_skill_uniform: number;
    p_brier_skill_historical: number | null;
    p_uniform_brier: number;
    p_uniform_log_loss: number;
    p_historical_brier: number | null;
    p_historical_log_loss: number | null;
    p_sliding_window_yield: number;
    p_prudence_mode: boolean;
    p_delta_slope: number;
    p_delta_intercept: number;
    p_entropy_dampener: number;
    p_sample_size: number;
    p_uncertainty_se: number;
    p_weight_deltas: Record<string, number>;
    p_counterfactual_analysis: Record<string, any>;
    p_learning_audit: LearningAuditPayload;
    p_ai_forensic_critique: string;
    p_ai_model_used: string;
    p_final_report: Record<string, any>;
    p_actual_numbers: number[];
    p_near_misses_details: Array<{ predicted: number; actual: number; type: string }>;
    p_updated_weights: Record<string, number>;
    p_sigmoid_slope: number;
    p_sigmoid_intercept: number;
    p_boosting_multiplier: number;
    p_predicted_numbers: number[];
    p_apply_global_learning?: boolean;
    p_expected_weight_version?: number | null;
    p_gene_scores_source?: string;
    p_telemetry_gaps?: string[];
  }): Promise<{
    applied: boolean;
    idempotent_hit: boolean;
    global_learning_applied?: boolean;
    report?: Record<string, any>;
  }>;
  generateNarrative?(context: {
    drawName: string;
    drawDate: string;
    predicted: number[];
    actual: number[];
    machine: number[];
    exactHits: number;
    nearMissesCount: number;
    brierScore: number;
    logLoss: number;
    brierSkillVsUniform: number;
    sampleSize: number;
    prudenceModeActive: boolean;
    topBeneficialGenes: string[];
    harmfulGenes: string[];
  }): Promise<{ analysis: string; modelUsed: string }>;
}

const normalizeDrawName = (name: string | null | undefined): string =>
  (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const parseIsoDayUtc = (dateStr: string | null | undefined): string | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    ) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    return null;
  }
  const frMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (frMatch) {
    const d = Number(frMatch[1]);
    const m = Number(frMatch[2]);
    const y = Number(frMatch[3]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    ) {
      return `${frMatch[3]}-${frMatch[2]}-${frMatch[1]}`;
    }
  }
  return null;
};

const computePriorEmpiricalEntropyNormalized = (
  priorDraws: Array<{ gagnants: number[] }>
): number => {
  if (!priorDraws || priorDraws.length === 0) return 1.0;
  const counts = new Array<number>(DOMAIN_SIZE).fill(0);
  let total = 0;
  for (const d of priorDraws) {
    for (const n of d.gagnants || []) {
      if (n >= 1 && n <= DOMAIN_SIZE) {
        counts[n - 1] += 1;
        total += 1;
      }
    }
  }
  if (total === 0) return 1.0;
  let entropy = 0;
  const maxH = Math.log2(DOMAIN_SIZE);
  for (let i = 0; i < DOMAIN_SIZE; i++) {
    const p = (counts[i] + 5 / DOMAIN_SIZE) / (total + 5);
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return Math.max(0, Math.min(1, entropy / maxH));
};

const deduplicatePriorReviewsByDistinctDraw = (
  reviews: PriorPostMortemRecord[],
  currentDrawResultId: string,
  currentDrawIso: string | null,
  maxDistinctDraws: number
): PriorPostMortemRecord[] => {
  const byDrawKey = new Map<string, PriorPostMortemRecord>();
  for (const rev of reviews) {
    const revDateIso = parseIsoDayUtc(rev.draw_date) ?? rev.draw_date;
    if (rev.draw_result_id && rev.draw_result_id === currentDrawResultId) continue;
    if (currentDrawIso && revDateIso === currentDrawIso) continue;
    const key = rev.draw_result_id || revDateIso;
    if (!key) continue;
    const existing = byDrawKey.get(key);
    if (!existing || (rev.is_global_learning_applied && !existing.is_global_learning_applied)) {
      byDrawKey.set(key, rev);
    }
    if (byDrawKey.size >= maxDistinctDraws) break;
  }
  return Array.from(byDrawKey.values());
};

const buildDeterministicRecommendations = (audit: LearningAuditPayload): string[] => {
  const recs: string[] = [];

  if (audit.sampleSize < SAMPLE_CYCLE_SCALE) {
    recs.push(
      `Échantillon faible (N=${audit.sampleSize} tirages distincts < ${SAMPLE_CYCLE_SCALE}) : amplitude d'apprentissage atténuée à ${(audit.sampleAttenuation * 100).toFixed(1)}% et barrière Prudence active.`
    );
  }
  if (audit.prudenceModeActive) {
    recs.push(
      `Barrière Prudence active (BSS=${(audit.calibration.brierSkillVsUniform * 100).toFixed(2)}%, z=${(audit.zSkillBrier ?? 0).toFixed(2)}, SE=${(audit.uncertaintySE * 100).toFixed(2)}%) : poids et calibration figés (aucune mutation).`
    );
  } else {
    recs.push(
      `Avantage hors-échantillon significatif sur N=${audit.sampleSize} tirages distincts (BSS=${(audit.calibration.brierSkillVsUniform * 100).toFixed(2)}%, z=${(audit.zSkillBrier ?? 0).toFixed(2)}, LLSS=${(audit.calibration.logLossSkillVsUniform * 100).toFixed(2)}%).`
    );
  }

  if (!audit.prudenceModeActive) {
    const positiveGenes = audit.aggregatedAttributions
      .filter((g) => g.meanCounterfactualScore > 1e-4 && g.weightDelta > 0)
      .slice(0, 2);
    if (positiveGenes.length > 0) {
      recs.push(
        `Gène(s) contrefactuellement favorables : ${positiveGenes
          .map((g) => `${g.key} (ΔLL=${g.meanDeltaLogLoss.toFixed(5)}, Δw=+${g.weightDelta.toFixed(4)})`)
          .join(', ')}.`
      );
    }

    const negativeGenes = audit.aggregatedAttributions
      .filter((g) => g.meanCounterfactualScore < -1e-4 && g.weightDelta < 0)
      .slice(-2);
    if (negativeGenes.length > 0) {
      recs.push(
        `Gène(s) pénalisés par ablation : ${negativeGenes
          .map((g) => `${g.key} (ΔLL=${g.meanDeltaLogLoss.toFixed(5)}, Δw=${g.weightDelta.toFixed(4)})`)
          .join(', ')}.`
      );
    }
  }

  if (audit.calibration.ece !== null && audit.calibration.ece > 0.02 && !audit.prudenceModeActive) {
    recs.push(
      `Calibration ECE=${audit.calibration.ece.toFixed(4)} (N=${audit.sampleSize}) : ajustement Platt continu Δpente=${audit.calibration.slopeDelta >= 0 ? '+' : ''}${audit.calibration.slopeDelta.toFixed(4)}.`
    );
  }

  return recs;
};

const buildDeterministicNarrative = (params: {
  exactHits: number;
  nearMissesCount: number;
  continuousLoss: number;
  audit: LearningAuditPayload;
}): { analysis: string; modelUsed: string } => {
  const { exactHits, nearMissesCount, continuousLoss, audit } = params;
  const pHyper = computeHypergeometricTailPValue(exactHits);
  const hitSummary =
    exactHits >= 3
      ? `Convergence statistiquement notable avec ${exactHits}/5 numéros exacts (p_hyper=${(pHyper * 100).toFixed(3)}% vs espérance uniforme ${UNIFORM_EXPECTED_HITS_TOP5.toFixed(3)}).`
      : `Résultat de ${exactHits}/5 hit(s) exact(s) (p_hyper=${(pHyper * 100).toFixed(2)}% sous tirage aléatoire, espérance uniforme ${UNIFORM_EXPECTED_HITS_TOP5.toFixed(3)}, Brier ${audit.calibration.brierScore.toFixed(5)} vs ${UNIFORM_BRIER_BASELINE.toFixed(5)}).`;
  const diagNote = `Les ${nearMissesCount} frôlement(s) circulaire(s) (±1) et la perte topologique (${continuousLoss.toFixed(3)}) restent strictement diagnostiques et exclus de la mise à jour des poids (${audit.modelVersion}).`;
  return {
    analysis: `${hitSummary} ${diagNote}`,
    modelUsed: 'deterministic-narrative-v2',
  };
};

export async function runForensicAutopsyCore(
  deps: ForensicAutopsyDeps,
  rawBody: unknown,
  options?: RunForensicAutopsyOptions
): Promise<{
  status: number;
  body: Record<string, any>;
}> {
  const validation = AutopsyRequestSchema.safeParse(rawBody);
  if (!validation.success) {
    return {
      status: 400,
      body: { success: false, error: 'Invalid payload', details: validation.error.format() },
    };
  }

  const { snapshotId, drawResultId } = validation.data;
  const actor: AutopsyActor = options?.actor ?? { kind: 'system' };

  // 1. Récupérer snapshot et vérifier le contrôle d'accès avant tout traitement
  const snapData = await deps.getSnapshot(snapshotId);
  if (!snapData) {
    return { status: 404, body: { success: false, error: 'Snapshot introuvable' } };
  }

  if (actor.kind === 'user') {
    if (!snapData.user_id || snapData.user_id !== actor.userId) {
      return {
        status: 403,
        body: { success: false, error: 'Accès refusé à ce snapshot de prédiction.' },
      };
    }
  }

  // 2. Idempotence stricte par (snapshotId, drawResultId, modelVersion)
  const existingReview = await deps.findExistingReview(
    snapshotId,
    drawResultId,
    FORENSIC_MODEL_VERSION
  );
  if (existingReview) {
    return {
      status: 200,
      body: {
        success: true,
        idempotent: true,
        modelVersion: FORENSIC_MODEL_VERSION,
        message: 'Déjà traité de manière idempotente pour cette version du modèle.',
        report: existingReview.report ?? null,
      },
    };
  }

  if (
    snapData.status === 'COMPLETED' &&
    snapData.autopsy_report?.modelVersion === FORENSIC_MODEL_VERSION &&
    snapData.autopsy_report?.drawResultId === drawResultId
  ) {
    return {
      status: 200,
      body: {
        success: true,
        idempotent: true,
        modelVersion: FORENSIC_MODEL_VERSION,
        message: 'Déjà traité',
        report: snapData.autopsy_report,
      },
    };
  }

  const resultData = await deps.getDrawResult(drawResultId);
  if (!resultData) {
    return { status: 404, body: { success: false, error: 'Résultat introuvable' } };
  }

  // 3. Contrôle strict de cohérence snapshot <-> tirage réel & causalité temporelle (A.1)
  if (
    resultData.draw_name &&
    normalizeDrawName(snapData.draw_name) !== normalizeDrawName(resultData.draw_name)
  ) {
    return {
      status: 422,
      body: {
        success: false,
        error: `Incohérence de tirage : snapshot (${snapData.draw_name}) ≠ résultat (${resultData.draw_name}).`,
      },
    };
  }

  const resultDateIso = parseIsoDayUtc(resultData.date);
  if (!resultDateIso) {
    return {
      status: 422,
      body: { success: false, error: 'Date de résultat de tirage invalide.' },
    };
  }

  if (snapData.target_date) {
    const targetDateIso = parseIsoDayUtc(snapData.target_date);
    if (!targetDateIso || targetDateIso !== resultDateIso) {
      return {
        status: 422,
        body: {
          success: false,
          error: `Incohérence de date cible : snapshot (${snapData.target_date}) ≠ tirage (${resultDateIso}).`,
        },
      };
    }
  }

  if (snapData.created_at) {
    const createdMs = Date.parse(snapData.created_at);
    const [ry, rm, rd] = resultDateIso.split('-').map(Number);
    const drawEndUtcMs = Date.UTC(ry, rm - 1, rd, 23, 59, 59, 999);
    if (!Number.isFinite(createdMs) || createdMs > drawEndUtcMs) {
      return {
        status: 422,
        body: {
          success: false,
          error: 'Violation causale : le snapshot a été créé après le tirage cible.',
        },
      };
    }
  }

  // 4. Hits & Near-Misses canoniques dédupliqués (Top-5 strict, Z/90Z circulaire, zéro double-comptage) (A.9 / A.11)
  const matchSummary = computeCanonicalExactHitsAndNearMisses(
    snapData.predicted_numbers || [],
    resultData.gagnants || []
  );
  const predicted = matchSummary.predictedTop5;
  const actual = matchSummary.actualUnique;
  const machine = sanitizeTop5Numbers(resultData.machine || [], DRAW_PICK_SIZE);
  const exactHitsDiagnostic = matchSummary.exactHits;
  const nearMissesCount = matchSummary.nearMissCount;
  const nearMissesDetails = matchSummary.nearMissDetails;

  if (predicted.length === 0 || actual.length === 0) {
    return {
      status: 422,
      body: { success: false, error: 'Numéros prédits ou gagnants valides manquants.' },
    };
  }

  // Perte topologique canonique continue sans constantes numérologiques arbitraires (A.10)
  const continuousTopologicalLoss = computeCanonicalTopologicalLoss(predicted, actual);

  // 5. Contexte chronologique sans fuite temporelle (< resultDateIso, tirages distincts uniquement) (A.3 / A.4)
  const [priorDraws, rawPriorReviews, currentConfig, alreadyLearnedGlobally] = await Promise.all([
    deps.getPriorDrawResults(snapData.draw_name, resultDateIso, 120),
    deps.getPriorPostMortemReviews(
      snapData.draw_name,
      resultDateIso,
      FORENSIC_MODEL_VERSION,
      SAMPLE_CYCLE_SCALE * 3
    ),
    deps.getCurrentWeightsConfig(snapData.draw_name),
    deps.hasGlobalDrawLearned
      ? deps.hasGlobalDrawLearned(drawResultId, FORENSIC_MODEL_VERSION)
      : Promise.resolve(false),
  ]);

  const priorReviews = deduplicatePriorReviewsByDistinctDraw(
    rawPriorReviews,
    drawResultId,
    resultDateIso,
    SAMPLE_CYCLE_SCALE - 1
  );

  const canMutateGlobalWeights =
    (actor.kind === 'system' || actor.kind === 'admin') && !alreadyLearnedGlobally;

  // 6. Analyser le modèle QUI A PRODUIT la prédiction (`snapData.decision_dna`), pas les poids courants (A.5)
  const snapshotDnaEntries = Object.entries(snapData.decision_dna || {}).filter(
    ([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0
  );
  const hasSnapshotDna = snapshotDnaEntries.length > 0;
  const snapshotRawWeights: Record<string, number> = hasSnapshotDna
    ? Object.fromEntries(snapshotDnaEntries)
    : { ...(currentConfig?.weights || {}) };

  const globalBaseRawWeights: Record<string, number> =
    currentConfig?.weights && Object.keys(currentConfig.weights).length > 0
      ? { ...currentConfig.weights }
      : { ...snapshotRawWeights };

  const snapshotKeys = Object.keys(snapshotRawWeights);
  const globalKeys = Object.keys(globalBaseRawWeights);
  const hasAnyMachine = priorDraws.some((d) => Array.isArray(d.machine) && d.machine.length > 0);
  const forcedZeroKeys = new Set<string>();
  if (!hasAnyMachine) {
    for (const k of new Set([...snapshotKeys, ...globalKeys])) {
      if (k.toLowerCase().includes('machine')) forcedZeroKeys.add(k);
    }
  }

  const snapshotEvalWeights =
    snapshotKeys.length > 0 ? normalizeWeightsSimplex(snapshotRawWeights, { forcedZeroKeys }) : {};
  const currentGlobalWeights =
    globalKeys.length > 0 ? normalizeWeightsSimplex(globalBaseRawWeights, { forcedZeroKeys }) : {};

  // 7. Reconstruction 100% côté serveur (zéro confiance dans `metrics_snapshot.geneScores` ou `scores90`) (A.2)
  const normalizedPriorDraws = priorDraws.map((d) => ({
    gagnants: d.gagnants || [],
    machine: Array.isArray(d.machine) ? d.machine : undefined,
  }));

  const geneScoresSource = 'server_reconstructed';
  const reconstructedGeneScores =
    snapshotKeys.length > 0 && normalizedPriorDraws.length > 0
      ? reconstructDeterministicGeneScores(normalizedPriorDraws, snapshotKeys)
      : null;

  const telemetryGaps: string[] = [];
  const rawConfVal =
    snapData.metrics_snapshot?.confidence ??
    snapData.metrics_snapshot?.hyperparameters?.confidence;
  const hasExplicitConfidence =
    typeof rawConfVal === 'number' && Number.isFinite(rawConfVal);
  if (!hasExplicitConfidence) telemetryGaps.push('confidence_missing');
  const confidence01 = hasExplicitConfidence
    ? Math.max(0, Math.min(1, rawConfVal / 100))
    : 0.5;

  let ensembleScores90: number[] | undefined;
  if (reconstructedGeneScores && snapshotKeys.length > 0) {
    ensembleScores90 = new Array<number>(DOMAIN_SIZE).fill(0);
    for (const k of snapshotKeys) {
      const w = snapshotEvalWeights[k] ?? 0;
      const vec = reconstructedGeneScores[k];
      if (!vec || w <= 0) continue;
      for (let i = 0; i < DOMAIN_SIZE; i++) {
        ensembleScores90[i] += w * (vec[i] ?? 0);
      }
    }
  }

  const marginals90 = deriveCoherentMarginalsFromSnapshot({
    predictedNumbers: predicted,
    confidence01,
    scores90:
      ensembleScores90 && ensembleScores90.some((s) => s > 0) ? ensembleScores90 : undefined,
    priorDraws: normalizedPriorDraws,
  });

  // 8. Évaluation propre sur marginales cohérentes (exactHits Top-5 uniquement ; near-misses = 0 poids)
  const marginalEval = evaluateMarginalPredictions({
    marginals90,
    actualWinners: actual,
    top5Predicted: predicted,
    priorDraws: normalizedPriorDraws,
  });

  // 9. Attribution contrefactuelle causale uniquement pour CETTE nouvelle observation (A.4 : zéro double-comptage)
  const currentGeneAttributions: GeneCounterfactualAttribution[] =
    reconstructedGeneScores && snapshotKeys.length > 0
      ? computeCounterfactualGeneAttributions({
          channelKeys: snapshotKeys,
          geneScores: reconstructedGeneScores,
          weights: snapshotEvalWeights,
          actualWinners: actual,
        })
      : [];

  // La fenêtre statistique (N tirages distincts) sert au test z de prudence ;
  // seules les attributions de la nouvelle observation servent à l'étape d'apprentissage (anti double-comptage A.4).
  const drawAttributionsWindow: GeneCounterfactualAttribution[][] =
    currentGeneAttributions.length > 0 ? [currentGeneAttributions] : [];

  const windowMetrics = [
    {
      exactHits: marginalEval.exactHits,
      brierScore: marginalEval.brierScore,
      logLoss: marginalEval.logLoss,
      ece: marginalEval.ece,
      historicalBrier: marginalEval.historicalBaseline?.brierScore ?? null,
      historicalLogLoss: marginalEval.historicalBaseline?.logLoss ?? null,
      historicalHits: marginalEval.historicalBaseline?.actualHitsTop5 ?? null,
    },
    ...priorReviews.map((rev) => ({
      exactHits: Math.max(0, Math.min(DRAW_PICK_SIZE, Number(rev.exact_hits) || 0)),
      brierScore: Number(rev.brier_score),
      logLoss:
        typeof rev.log_loss === 'number' && Number.isFinite(rev.log_loss)
          ? rev.log_loss
          : UNIFORM_LOG_LOSS_BASELINE,
      ece:
        typeof rev.calibration_ece === 'number' && Number.isFinite(rev.calibration_ece)
          ? rev.calibration_ece
          : 0,
      historicalBrier: rev.counterfactual_analysis?.historicalBaseline?.brierScore ?? null,
      historicalLogLoss: rev.counterfactual_analysis?.historicalBaseline?.logLoss ?? null,
      historicalHits: rev.counterfactual_analysis?.historicalBaseline?.actualHitsTop5 ?? null,
    })),
  ];

  // 10. Télémétrie explicite (aucun défaut silencieux non signalé A.12)
  const rawEntropy = snapData.metrics_snapshot?.shannon_entropy;
  const hasExplicitEntropy = typeof rawEntropy === 'number' && Number.isFinite(rawEntropy);
  if (!hasExplicitEntropy) telemetryGaps.push('shannon_entropy_missing');
  const currentEntropy = hasExplicitEntropy
    ? Math.max(0, Math.min(1, rawEntropy))
    : computePriorEmpiricalEntropyNormalized(normalizedPriorDraws);

  const rawHurst = snapData.metrics_snapshot?.hurst_exponent;
  const hasExplicitHurst = typeof rawHurst === 'number' && Number.isFinite(rawHurst);
  if (!hasExplicitHurst) telemetryGaps.push('hurst_exponent_missing');
  const currentHurst = hasExplicitHurst ? Math.max(0.01, Math.min(0.99, rawHurst)) : 0.5;

  const baseSlope =
    currentConfig?.sigmoid_slope ??
    snapData.metrics_snapshot?.hyperparameters?.sigmoid_slope;
  const baseIntercept =
    currentConfig?.sigmoid_intercept ??
    snapData.metrics_snapshot?.hyperparameters?.sigmoid_intercept;

  const updateTargetWeights =
    Object.keys(currentGlobalWeights).length > 0 ? currentGlobalWeights : snapshotEvalWeights;

  const { updatedWeights, audit } = computeCautiousAggregatedWeightUpdate({
    currentWeights: updateTargetWeights,
    drawAttributionsWindow,
    windowMetrics,
    entropyNormalized: currentEntropy,
    hurstExponent: currentHurst,
    baseSigmoidSlope: typeof baseSlope === 'number' ? baseSlope : undefined,
    baseSigmoidIntercept: typeof baseIntercept === 'number' ? baseIntercept : undefined,
    forcedZeroKeys,
    modelVersion: FORENSIC_MODEL_VERSION,
  });

  // Si l'acteur n'est pas autorisé à muter les poids globaux (ex: utilisateur normal ou tirage déjà appris),
  // on verrouille strictement les poids globaux à leur valeur courante.
  const applyGlobalLearning = canMutateGlobalWeights && !audit.prudenceModeActive;
  const persistedGlobalWeights = applyGlobalLearning ? updatedWeights : updateTargetWeights;

  const deterministicRecommendations = buildDeterministicRecommendations(audit);

  // 11. Séparation stricte Mesure vs Explication IA
  let narrativeResult = buildDeterministicNarrative({
    exactHits: exactHitsDiagnostic,
    nearMissesCount,
    continuousLoss: continuousTopologicalLoss,
    audit,
  });

  if (deps.generateNarrative) {
    try {
      const beneficial = audit.aggregatedAttributions
        .filter((g) => g.meanCounterfactualScore > 0)
        .slice(0, 3)
        .map((g) => `${g.key} (ΔLL=${g.meanDeltaLogLoss.toFixed(5)})`);
      const harmful = audit.aggregatedAttributions
        .filter((g) => g.meanCounterfactualScore < 0)
        .slice(-2)
        .map((g) => `${g.key} (ΔLL=${g.meanDeltaLogLoss.toFixed(5)})`);

      const llmText = await deps.generateNarrative({
        drawName: snapData.draw_name,
        drawDate: resultDateIso,
        predicted,
        actual,
        machine,
        exactHits: exactHitsDiagnostic,
        nearMissesCount,
        brierScore: marginalEval.brierScore,
        logLoss: marginalEval.logLoss,
        brierSkillVsUniform: marginalEval.brierSkillVsUniform,
        sampleSize: audit.sampleSize,
        prudenceModeActive: audit.prudenceModeActive,
        topBeneficialGenes: beneficial,
        harmfulGenes: harmful,
      });
      if (llmText.analysis && llmText.analysis.trim().length > 0) {
        narrativeResult = llmText;
      }
    } catch {
      // Repli déterministe garanti
    }
  }

  const slidingWindowYield =
    windowMetrics.reduce((a, m) => a + m.exactHits, 0) /
    Math.max(1, windowMetrics.length * DRAW_PICK_SIZE);
  const entropyDampener = Math.exp(-Math.max(0, Math.min(1, currentEntropy)));
  const brierDivergenceRatio = parseFloat(
    (marginalEval.brierScore / UNIFORM_BRIER_BASELINE).toFixed(6)
  );
  const hypergeometricPValue = parseFloat(
    computeHypergeometricTailPValue(exactHitsDiagnostic).toFixed(6)
  );

  const finalReport = {
    drawResultId,
    modelVersion: FORENSIC_MODEL_VERSION,
    actorKind: actor.kind,
    globalLearningApplied: applyGlobalLearning,
    geneScoresSource,
    telemetryGaps,
    matches: exactHitsDiagnostic,
    hypergeometricPValue,
    nearMisses: nearMissesCount,
    nearMissesExcludedFromLearning: true,
    continuousTopologicalLoss: parseFloat(continuousTopologicalLoss.toFixed(6)),
    brierDivergenceRatio,
    marginalSum: parseFloat(marginalEval.marginalSum.toFixed(6)),
    brierScore: marginalEval.brierScore,
    logLoss: marginalEval.logLoss,
    ece: audit.calibration.ece,
    brierSkillVsUniform: marginalEval.brierSkillVsUniform,
    logLossSkillVsUniform: marginalEval.logLossSkillVsUniform,
    brierSkillVsHistorical: marginalEval.brierSkillVsHistorical,
    logLossSkillVsHistorical: marginalEval.logLossSkillVsHistorical,
    uniformBaseline: marginalEval.uniformBaseline,
    historicalBaseline: marginalEval.historicalBaseline ?? null,
    sampleSize: audit.sampleSize,
    uncertaintySE: audit.uncertaintySE,
    prudenceModeActive: audit.prudenceModeActive,
    learningAudit: audit,
    snapshotWeightsEvaluated: snapshotEvalWeights,
    updatedWeights: persistedGlobalWeights,
    recommendations: deterministicRecommendations,
    aiAnalysis: narrativeResult.analysis,
    modelUsed: narrativeResult.modelUsed,
  };

  // 12. Persistance transactionnelle atomique, versionnée & idempotente via RPC
  const persistResult = await deps.applyAtomicPersistence({
    p_snapshot_id: snapshotId,
    p_draw_result_id: drawResultId,
    p_model_version: FORENSIC_MODEL_VERSION,
    p_user_id: snapData.user_id ?? null,
    p_draw_name: snapData.draw_name,
    p_draw_date: resultDateIso,
    p_exact_hits: exactHitsDiagnostic,
    p_near_miss_count: nearMissesCount,
    p_brier_score: marginalEval.brierScore,
    p_log_loss: marginalEval.logLoss,
    p_calibration_ece: audit.calibration.ece,
    p_brier_skill_uniform: marginalEval.brierSkillVsUniform,
    p_brier_skill_historical: marginalEval.brierSkillVsHistorical,
    p_uniform_brier: UNIFORM_BRIER_BASELINE,
    p_uniform_log_loss: UNIFORM_LOG_LOSS_BASELINE,
    p_historical_brier: marginalEval.historicalBaseline?.brierScore ?? null,
    p_historical_log_loss: marginalEval.historicalBaseline?.logLoss ?? null,
    p_sliding_window_yield: slidingWindowYield,
    p_prudence_mode: audit.prudenceModeActive,
    p_delta_slope: audit.calibration.slopeDelta,
    p_delta_intercept: audit.calibration.interceptDelta,
    p_entropy_dampener: entropyDampener,
    p_sample_size: audit.sampleSize,
    p_uncertainty_se: audit.uncertaintySE,
    p_weight_deltas: audit.weightDeltas,
    p_counterfactual_analysis: {
      modelVersion: FORENSIC_MODEL_VERSION,
      snapshotWeightsEvaluated: snapshotEvalWeights,
      geneAttributions: currentGeneAttributions,
      historicalBaseline: marginalEval.historicalBaseline ?? null,
    },
    p_learning_audit: audit,
    p_ai_forensic_critique: narrativeResult.analysis,
    p_ai_model_used: narrativeResult.modelUsed,
    p_final_report: finalReport,
    p_actual_numbers: actual,
    p_near_misses_details: nearMissesDetails,
    p_updated_weights: persistedGlobalWeights,
    p_sigmoid_slope: audit.calibration.sigmoidSlope,
    p_sigmoid_intercept: audit.calibration.sigmoidIntercept,
    p_boosting_multiplier:
      audit.prudenceModeActive
        ? 1.0
        : 1.0 + Math.max(0, audit.calibration.brierSkillVsUniform) * audit.sampleAttenuation,
    p_predicted_numbers: predicted,
    p_apply_global_learning: applyGlobalLearning,
    p_expected_weight_version: currentConfig?.weight_version ?? null,
    p_gene_scores_source: geneScoresSource,
    p_telemetry_gaps: telemetryGaps,
  });

  if (persistResult.idempotent_hit) {
    return {
      status: 200,
      body: {
        success: true,
        idempotent: true,
        modelVersion: FORENSIC_MODEL_VERSION,
        message: 'Déjà traité de manière idempotente.',
        report: persistResult.report ?? finalReport,
      },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      idempotent: false,
      modelVersion: FORENSIC_MODEL_VERSION,
      report: finalReport,
    },
  };
}
