import { z } from 'zod';
import {
  DOMAIN_SIZE,
  DRAW_PICK_SIZE,
  FORENSIC_MODEL_VERSION,
  SAMPLE_CYCLE_SCALE,
  UNIFORM_BRIER_BASELINE,
  UNIFORM_EXPECTED_HITS_TOP5,
  UNIFORM_LOG_LOSS_BASELINE,
  computeCautiousAggregatedWeightUpdate,
  computeCounterfactualGeneAttributions,
  deriveCoherentMarginalsFromSnapshot,
  evaluateMarginalPredictions,
  normalizeWeightsSimplex,
  reconstructDeterministicGeneScores,
  type GeneCounterfactualAttribution,
  type LearningAuditPayload,
} from './forensic-learning-engine.ts';

export const AutopsyRequestSchema = z.object({
  snapshotId: z.string().uuid(),
  drawResultId: z.string().uuid(),
});

export interface SnapshotRecord {
  id: string;
  user_id?: string | null;
  draw_name: string;
  target_date?: string | null;
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
  draw_date: string;
  exact_hits: number;
  brier_score: number;
  log_loss?: number | null;
  calibration_ece?: number | null;
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
}

export interface ForensicAutopsyDeps {
  getSnapshot(snapshotId: string): Promise<SnapshotRecord | null>;
  getDrawResult(drawResultId: string): Promise<DrawResultRecord | null>;
  findExistingReview(
    snapshotId: string,
    drawResultId: string,
    modelVersion: string
  ): Promise<{ id: string; report?: Record<string, any> | null } | null>;
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
    p_calibration_ece: number;
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
  }): Promise<{ applied: boolean; idempotent_hit: boolean; report?: Record<string, any> }>;
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

const buildDeterministicRecommendations = (audit: LearningAuditPayload): string[] => {
  const recs: string[] = [];

  if (audit.sampleSize < SAMPLE_CYCLE_SCALE) {
    recs.push(
      `Échantillon faible (N=${audit.sampleSize} < ${SAMPLE_CYCLE_SCALE}) : amplitude d'apprentissage atténuée à ${(audit.sampleAttenuation * 100).toFixed(1)}% pour éviter le surapprentissage.`
    );
  }
  if (audit.prudenceModeActive) {
    recs.push(
      `Mode Prudence actif (BSS=${(audit.calibration.brierSkillVsUniform * 100).toFixed(2)}%, SE=${(audit.uncertaintySE * 100).toFixed(2)}%) : aucune mutation agressive des poids autorisée.`
    );
  } else {
    recs.push(
      `Avantage hors-échantillon positif sur N=${audit.sampleSize} tirages (BSS=${(audit.calibration.brierSkillVsUniform * 100).toFixed(2)}%, LLSS=${(audit.calibration.logLossSkillVsUniform * 100).toFixed(2)}%).`
    );
  }

  const positiveGenes = audit.aggregatedAttributions
    .filter((g) => g.meanCounterfactualScore > 1e-4 && g.weightDelta > 0)
    .slice(0, 2);
  if (positiveGenes.length > 0) {
    recs.push(
      `Gène(s) contrefactuellement favorables : ${positiveGenes
        .map((g) => `${g.key} (ΔLL=${g.meanDeltaLogLoss.toFixed(5)}, Δw=${g.weightDelta >= 0 ? '+' : ''}${g.weightDelta.toFixed(4)})`)
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

  if (audit.calibration.ece > 0.02) {
    recs.push(
      `Calibration ECE=${audit.calibration.ece.toFixed(4)} : ajustement Platt continu Δpente=${audit.calibration.slopeDelta >= 0 ? '+' : ''}${audit.calibration.slopeDelta.toFixed(4)}.`
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
  const hitSummary =
    exactHits >= 2
      ? `Convergence solide avec ${exactHits}/5 numéros exacts contre une espérance uniforme de ${UNIFORM_EXPECTED_HITS_TOP5.toFixed(3)}.`
      : `Résultat de ${exactHits}/5 hit(s) exact(s) (baseline uniforme ${UNIFORM_EXPECTED_HITS_TOP5.toFixed(3)}, Brier ${audit.calibration.brierScore.toFixed(5)} vs ${UNIFORM_BRIER_BASELINE.toFixed(5)}).`;
  const diagNote = `Les ${nearMissesCount} frôlement(s) (±1) et la perte topologique (${continuousLoss.toFixed(3)}) restent strictement diagnostiques et exclus de la mise à jour des poids (${audit.modelVersion}).`;
  return {
    analysis: `${hitSummary} ${diagNote}`,
    modelUsed: 'deterministic-narrative-v1',
  };
};

const extractGeneScoresFromSnapshot = (
  metricsSnapshot: Record<string, any> | null | undefined,
  geneKeys: string[]
): Record<string, number[]> | null => {
  if (!metricsSnapshot) return null;

  if (metricsSnapshot.geneScores && typeof metricsSnapshot.geneScores === 'object') {
    const out: Record<string, number[]> = {};
    let foundAny = false;
    for (const k of geneKeys) {
      const vec = metricsSnapshot.geneScores[k];
      if (Array.isArray(vec) && vec.length >= DOMAIN_SIZE) {
        out[k] = vec.slice(0, DOMAIN_SIZE).map((v: unknown) => {
          const n = Number(v);
          return Number.isFinite(n) ? Math.max(0, n) : 0;
        });
        foundAny = true;
      }
    }
    if (foundAny) return out;
  }

  return null;
};

export async function runForensicAutopsyCore(
  deps: ForensicAutopsyDeps,
  rawBody: unknown
): Promise<{
  status: number;
  body: Record<string, any>;
}> {
  const validation = AutopsyRequestSchema.safeParse(rawBody);
  if (!validation.success) {
    return {
      status: 400,
      body: { error: 'Invalid payload', details: validation.error.format() },
    };
  }

  const { snapshotId, drawResultId } = validation.data;

  // 1. Vérifier idempotence avant même d'exécuter un recalcul coûteux ou un appel LLM
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

  // 2. Récupérer snapshot et tirage réel
  const snapData = await deps.getSnapshot(snapshotId);
  if (!snapData) {
    return { status: 404, body: { success: false, error: 'Snapshot introuvable' } };
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

  const predicted = (snapData.predicted_numbers || []).map(Number).filter((n) => n >= 1 && n <= DOMAIN_SIZE);
  const actual = (resultData.gagnants || []).map(Number).filter((n) => n >= 1 && n <= DOMAIN_SIZE);
  const machine = (resultData.machine || []).map(Number).filter((n) => n >= 1 && n <= DOMAIN_SIZE);

  // 3. Diagnostic pur : hits exacts et near-misses séparés (near-misses STRICTEMENT exclus de l'apprentissage)
  const actualSet = new Set(actual);
  const nearMissesDetails: Array<{ predicted: number; actual: number; type: string }> = [];
  let exactHitsDiagnostic = 0;
  let nearMissesCount = 0;

  predicted.forEach((p) => {
    if (actualSet.has(p)) {
      exactHitsDiagnostic++;
    } else {
      const minus1 = p > 1 ? p - 1 : DOMAIN_SIZE;
      const plus1 = p < DOMAIN_SIZE ? p + 1 : 1;
      if (actualSet.has(minus1)) {
        nearMissesCount++;
        nearMissesDetails.push({ predicted: p, actual: minus1, type: '-1' });
      }
      if (actualSet.has(plus1)) {
        nearMissesCount++;
        nearMissesDetails.push({ predicted: p, actual: plus1, type: '+1' });
      }
    }
  });

  const getGridPos = (val: number) => ({
    row: Math.floor((val - 1) / 10),
    col: (val - 1) % 10,
  });

  let totalContinLoss = 0;
  actual.forEach((w) => {
    let maxSimForWinner = 1e-9;
    predicted.forEach((p) => {
      let sim = 0;
      if (p === w) {
        sim = 1.0;
      } else {
        const linSim = Math.exp(-0.25 * Math.abs(p - w));
        const posP = getGridPos(p);
        const posW = getGridPos(w);
        const gridDist = Math.hypot(posP.row - posW.row, posP.col - posW.col);
        const gridSim = Math.exp(-0.35 * gridDist);
        let mirrorSim = p + w === 91 ? 0.45 : 0.0;
        const revP = parseInt(p.toString().split('').reverse().join(''), 10);
        if (revP >= 1 && revP <= DOMAIN_SIZE && revP === w) mirrorSim = Math.max(mirrorSim, 0.4);
        const harmonicSim = p % 10 === w % 10 ? 0.35 : 0.0;
        const decadeSim = Math.floor((p - 1) / 10) === Math.floor((w - 1) / 10) ? 0.25 : 0.0;
        sim = Math.max(linSim, gridSim, mirrorSim, harmonicSim, decadeSim);
      }
      if (sim > maxSimForWinner) maxSimForWinner = sim;
    });
    totalContinLoss += 1.0 - maxSimForWinner;
  });

  // 4. Contexte chronologique sans fuite temporelle (< resultData.date, isolé au même tirage)
  const [priorDraws, priorReviews, currentConfig] = await Promise.all([
    deps.getPriorDrawResults(snapData.draw_name, resultData.date, 120),
    deps.getPriorPostMortemReviews(snapData.draw_name, resultData.date, FORENSIC_MODEL_VERSION, 29),
    deps.getCurrentWeightsConfig(snapData.draw_name),
  ]);

  const rawWeights: Record<string, number> = {
    ...(snapData.decision_dna || {}),
    ...(currentConfig?.weights || {}),
  };
  const geneKeys = Object.keys(rawWeights);
  const hasAnyMachine = priorDraws.some((d) => Array.isArray(d.machine) && d.machine.length > 0);
  const forcedZeroKeys = new Set<string>();
  if (!hasAnyMachine) {
    for (const k of geneKeys) {
      if (k.toLowerCase().includes('machine')) forcedZeroKeys.add(k);
    }
  }
  const activeWeights =
    geneKeys.length > 0 ? normalizeWeightsSimplex(rawWeights, { forcedZeroKeys }) : {};

  // 5. Reconstruction des scores par gène & marginales cohérentes (Σ q_i = 5 exactement)
  const snapshotGeneScores = extractGeneScoresFromSnapshot(snapData.metrics_snapshot, geneKeys);
  const normalizedPriorDraws = priorDraws.map((d) => ({
    gagnants: d.gagnants || [],
    machine: Array.isArray(d.machine) ? d.machine : undefined,
  }));
  const reconstructedGeneScores =
    !snapshotGeneScores && geneKeys.length > 0 && normalizedPriorDraws.length > 0
      ? reconstructDeterministicGeneScores(normalizedPriorDraws, geneKeys)
      : null;
  const activeGeneScores = snapshotGeneScores || reconstructedGeneScores;

  const rawConf =
    snapData.metrics_snapshot?.confidence ??
    snapData.metrics_snapshot?.hyperparameters?.confidence ??
    50;
  const confidence01 = (Number.isFinite(Number(rawConf)) ? Number(rawConf) : 50) / 100;

  let ensembleScores90: number[] | undefined;
  if (activeGeneScores && geneKeys.length > 0) {
    ensembleScores90 = new Array<number>(DOMAIN_SIZE).fill(0);
    for (const k of geneKeys) {
      const w = activeWeights[k] ?? 0;
      const vec = activeGeneScores[k];
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
      snapData.metrics_snapshot?.scores90 ??
      (ensembleScores90 && ensembleScores90.some((s) => s > 0) ? ensembleScores90 : undefined),
    breakdown: snapData.metrics_snapshot?.breakdown,
    priorDraws,
  });

  // 6. Évaluation propre sur marginales cohérentes (exactHits uniquement ; near-misses = 0 poids)
  const marginalEval = evaluateMarginalPredictions({
    marginals90,
    actualWinners: actual,
    top5Predicted: predicted,
    priorDraws,
  });

  // 7. Attribution contrefactuelle PAR GÈNE (with vs without gene) agrégée sur plusieurs tirages
  const currentGeneAttributions: GeneCounterfactualAttribution[] =
    activeGeneScores && geneKeys.length > 0
      ? computeCounterfactualGeneAttributions({
          channelKeys: geneKeys,
          geneScores: activeGeneScores,
          weights: activeWeights,
          actualWinners: actual,
        })
      : [];

  const drawAttributionsWindow: GeneCounterfactualAttribution[][] = [];
  if (currentGeneAttributions.length > 0) {
    drawAttributionsWindow.push(currentGeneAttributions);
  }
  for (const rev of priorReviews) {
    const pastAttrs = rev.counterfactual_analysis?.geneAttributions;
    if (Array.isArray(pastAttrs) && pastAttrs.length > 0) {
      drawAttributionsWindow.push(pastAttrs);
    }
  }

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
      exactHits: rev.exact_hits,
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

  const currentEntropy = Number(snapData.metrics_snapshot?.shannon_entropy ?? 0.7);
  const currentHurst = Number(snapData.metrics_snapshot?.hurst_exponent ?? 0.5);
  const baseSlope =
    currentConfig?.sigmoid_slope ??
    snapData.metrics_snapshot?.hyperparameters?.sigmoid_slope;
  const baseIntercept =
    currentConfig?.sigmoid_intercept ??
    snapData.metrics_snapshot?.hyperparameters?.sigmoid_intercept;

  const { updatedWeights, audit } = computeCautiousAggregatedWeightUpdate({
    currentWeights: activeWeights,
    drawAttributionsWindow,
    windowMetrics,
    entropyNormalized: Number.isFinite(currentEntropy) ? currentEntropy : 0.7,
    hurstExponent: Number.isFinite(currentHurst) ? currentHurst : 0.5,
    baseSigmoidSlope: typeof baseSlope === 'number' ? baseSlope : undefined,
    baseSigmoidIntercept: typeof baseIntercept === 'number' ? baseIntercept : undefined,
    forcedZeroKeys,
    modelVersion: FORENSIC_MODEL_VERSION,
  });

  const deterministicRecommendations = buildDeterministicRecommendations(audit);

  // 8. Séparation stricte Mesure vs Explication IA :
  //    Toutes les grandeurs numériques (updatedWeights, calibration, prudence, métriques) sont DÉJÀ figées.
  //    Gemini ne produit que la prose explicative lisible `aiAnalysis` (avec repli déterministe).
  let narrativeResult = buildDeterministicNarrative({
    exactHits: exactHitsDiagnostic,
    nearMissesCount,
    continuousLoss: totalContinLoss,
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
        drawDate: resultData.date,
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
      // Conservation silencieuse du repli déterministe : une erreur Gemini n'affecte jamais l'apprentissage
    }
  }

  const slidingWindowYield =
    windowMetrics.reduce((a, m) => a + m.exactHits, 0) /
    Math.max(1, windowMetrics.length * DRAW_PICK_SIZE);
  const entropyDampener = Math.exp(-Math.max(0, Math.min(1, currentEntropy)));

  const finalReport = {
    drawResultId,
    modelVersion: FORENSIC_MODEL_VERSION,
    matches: exactHitsDiagnostic,
    nearMisses: nearMissesCount,
    nearMissesExcludedFromLearning: true,
    continuousTopologicalLoss: parseFloat(totalContinLoss.toFixed(6)),
    scoreDivergence: Math.abs(DRAW_PICK_SIZE - exactHitsDiagnostic) * 20,
    marginalSum: parseFloat(marginalEval.marginalSum.toFixed(6)),
    brierScore: marginalEval.brierScore,
    logLoss: marginalEval.logLoss,
    ece: marginalEval.ece,
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
    updatedWeights,
    recommendations: deterministicRecommendations,
    aiAnalysis: narrativeResult.analysis,
    modelUsed: narrativeResult.modelUsed,
  };

  // 9. Persistance transactionnelle atomique & idempotente via RPC
  const persistResult = await deps.applyAtomicPersistence({
    p_snapshot_id: snapshotId,
    p_draw_result_id: drawResultId,
    p_model_version: FORENSIC_MODEL_VERSION,
    p_user_id: snapData.user_id ?? null,
    p_draw_name: snapData.draw_name,
    p_draw_date: resultData.date,
    p_exact_hits: exactHitsDiagnostic,
    p_near_miss_count: nearMissesCount,
    p_brier_score: marginalEval.brierScore,
    p_log_loss: marginalEval.logLoss,
    p_calibration_ece: marginalEval.ece,
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
      geneAttributions: currentGeneAttributions,
      historicalBaseline: marginalEval.historicalBaseline ?? null,
    },
    p_learning_audit: audit,
    p_ai_forensic_critique: narrativeResult.analysis,
    p_ai_model_used: narrativeResult.modelUsed,
    p_final_report: finalReport,
    p_actual_numbers: actual,
    p_near_misses_details: nearMissesDetails,
    p_updated_weights: updatedWeights,
    p_sigmoid_slope: audit.calibration.sigmoidSlope,
    p_sigmoid_intercept: audit.calibration.sigmoidIntercept,
    p_boosting_multiplier:
      1.0 + Math.max(0, audit.calibration.brierSkillVsUniform) * audit.sampleAttenuation,
    p_predicted_numbers: predicted,
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
