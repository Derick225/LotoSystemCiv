import { describe, it, expect, vi } from 'vitest';
import {
  DOMAIN_SIZE,
  DRAW_PICK_SIZE,
  FORENSIC_MODEL_VERSION,
  UNIFORM_BRIER_BASELINE,
  UNIFORM_EXPECTED_HITS_TOP5,
  UNIFORM_LOG_LOSS_BASELINE,
  computeCautiousAggregatedWeightUpdate,
  computeCounterfactualGeneAttributions,
  deriveCoherentMarginalsFromSnapshot,
  evaluateMarginalPredictions,
  normalizeWeightsSimplex,
  projectScoresToCoherentMarginals,
  runChronologicalWalkForwardValidation,
} from '../supabase/functions/_shared/forensic-learning-engine.ts';
import {
  runForensicAutopsyCore,
  type ForensicAutopsyDeps,
} from '../supabase/functions/_shared/forensic-autopsy-core.ts';
import {
  executeBatchClosedLoopAutopsy,
  executeClosedLoopAutopsy,
  executeWalkForwardAutopsyValidation,
} from '../src/services/prediction/closedLoopAutopsyService';
import { getDefaultWeights } from '../src/services/prediction/weightsManager';
import { AlgoKey, RETIRED_ALGO_WEIGHT_KEYS } from '../src/shared/prediction.types';
import type { DrawResult } from '../src/types';

function makeDeterministicDrawHistory(count: number, drawName: string = 'NATIONAL'): DrawResult[] {
  let state = 987654321;
  const nextRand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const out: DrawResult[] = [];
  for (let i = 0; i < count; i++) {
    const pool = Array.from({ length: 90 }, (_, k) => k + 1);
    const gagnants: number[] = [];
    for (let j = 0; j < 5; j++) {
      const idx = Math.floor(nextRand() * pool.length);
      gagnants.push(pool.splice(idx, 1)[0]);
    }
    gagnants.sort((a, b) => a - b);

    const machine: number[] = [];
    for (let j = 0; j < 5; j++) {
      const idx = Math.floor(nextRand() * pool.length);
      machine.push(pool.splice(idx, 1)[0]);
    }
    machine.sort((a, b) => a - b);

    // Date strictement décroissante du plus récent (i=0) au plus ancien
    const d = new Date(Date.UTC(2026, 0, 1) + (count - i) * 86400_000);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();

    out.push({
      id: `draw_${i}`,
      drawName,
      date: `${dd}/${mm}/${yyyy}`,
      gagnants,
      machine,
    });
  }
  return out;
}

describe('Moteur Unifié d’Apprentissage Post-Mortem (5/90)', () => {
  it('1. Marginales cohérentes : Σ q_i = 5 exactement même avec des scores extrêmes + baselines exacts', () => {
    // Cas 1 : pic extrême sur un seul numéro qui ferait exploser min(1, 5 * p)
    const spikedScores = new Array<number>(DOMAIN_SIZE).fill(0.01);
    spikedScores[0] = 1000;
    spikedScores[1] = 200;

    const marginals = projectScoresToCoherentMarginals(spikedScores, DRAW_PICK_SIZE);
    const sum = marginals.reduce((a, b) => a + b, 0);

    expect(marginals).toHaveLength(DOMAIN_SIZE);
    expect(sum).toBeCloseTo(DRAW_PICK_SIZE, 8);
    expect(marginals.every((q) => q > 0 && q < 1)).toBe(true);
    expect(marginals[0]).toBeGreaterThanOrEqual(marginals[1]);
    expect(marginals[1]).toBeGreaterThan(marginals[2]);

    // Ordre strict lorsque non saturé à 1 - eps
    const moderateScores = new Array<number>(DOMAIN_SIZE).fill(1);
    moderateScores[0] = 6;
    moderateScores[1] = 3;
    const modMarginals = projectScoresToCoherentMarginals(moderateScores, DRAW_PICK_SIZE);
    expect(modMarginals.reduce((a, b) => a + b, 0)).toBeCloseTo(DRAW_PICK_SIZE, 8);
    expect(modMarginals[0]).toBeGreaterThan(modMarginals[1]);
    expect(modMarginals[1]).toBeGreaterThan(modMarginals[2]);

    // Cas 2 : prédicteur uniforme exact vs constantes analytiques 5/90
    const uniformScores = new Array<number>(DOMAIN_SIZE).fill(1);
    const unifEval = evaluateMarginalPredictions({
      marginals90: uniformScores,
      actualWinners: [1, 10, 20, 30, 40],
      top5Predicted: [50, 60, 70, 80, 90],
    });

    expect(unifEval.marginalSum).toBeCloseTo(5.0, 8);
    expect(unifEval.expectedHitsTop5).toBeCloseTo(25 / 90, 6);
    expect(UNIFORM_EXPECTED_HITS_TOP5).toBeCloseTo(25 / 90, 8);
    expect(unifEval.brierScore).toBeCloseTo(UNIFORM_BRIER_BASELINE, 8);
    expect(unifEval.logLoss).toBeCloseTo(UNIFORM_LOG_LOSS_BASELINE, 8);
    expect(unifEval.brierSkillVsUniform).toBeCloseTo(0, 6);
    expect(unifEval.logLossSkillVsUniform).toBeCloseTo(0, 6);

    // Fallback Edge Function remplaçant l'ancien 0.011 : somme toujours égale à 5
    const snapshotMarginals = deriveCoherentMarginalsFromSnapshot({
      predictedNumbers: [5, 15, 25, 35, 45],
      confidence01: 0.92,
    });
    expect(snapshotMarginals.reduce((a, b) => a + b, 0)).toBeCloseTo(5.0, 8);
    expect(snapshotMarginals.every((q) => q > 0 && q < 1)).toBe(true);
  });

  it('2. Attribution contrefactuelle par gène : différencie un gène prédictif d’un gène bruité sur le même tirage', () => {
    const winners = [7, 21, 44, 63, 88];
    const winnersSet = new Set(winners);

    // Gène A : favorise fortement les gagnants réels
    const geneGood = Array.from({ length: DOMAIN_SIZE }, (_, i) =>
      winnersSet.has(i + 1) ? 0.95 : 0.05
    );
    // Gène B : favorise de mauvais numéros (non-gagnants) et pénalise les gagnants
    const geneBad = Array.from({ length: DOMAIN_SIZE }, (_, i) =>
      winnersSet.has(i + 1) ? 0.02 : 0.70
    );
    // Gène C : constant / neutre
    const geneFlat = new Array<number>(DOMAIN_SIZE).fill(0.5);

    const attrs = computeCounterfactualGeneAttributions({
      channelKeys: ['gene_good', 'gene_bad', 'gene_flat'],
      geneScores: { gene_good: geneGood, gene_bad: geneBad, gene_flat: geneFlat },
      weights: { gene_good: 0.34, gene_bad: 0.33, gene_flat: 0.33 },
      actualWinners: winners,
    });

    const good = attrs.find((a) => a.key === 'gene_good')!;
    const bad = attrs.find((a) => a.key === 'gene_bad')!;

    expect(good.counterfactualScore).toBeGreaterThan(0);
    expect(good.deltaLogLossAblation).toBeGreaterThan(0);
    expect(good.winnerLiftAblation).toBeGreaterThan(0);

    expect(bad.counterfactualScore).toBeLessThan(0);
    expect(good.counterfactualScore).toBeGreaterThan(bad.counterfactualScore);

    // Vérifier qu'une mise à jour sur N=1 a une amplitude plus faible que sur N=25 (atténuation tanh(N/18))
    const oneDrawMetric = [{ exactHits: 3, brierScore: 0.045, logLoss: 0.19, ece: 0.02 }];
    const singleStep = computeCautiousAggregatedWeightUpdate({
      currentWeights: { gene_good: 0.34, gene_bad: 0.33, gene_flat: 0.33 },
      drawAttributionsWindow: [attrs],
      windowMetrics: oneDrawMetric,
    });

    const multiStep = computeCautiousAggregatedWeightUpdate({
      currentWeights: { gene_good: 0.34, gene_bad: 0.33, gene_flat: 0.33 },
      drawAttributionsWindow: Array.from({ length: 25 }, () => attrs),
      windowMetrics: Array.from({ length: 25 }, () => oneDrawMetric[0]),
    });

    expect(singleStep.audit.prudenceModeActive).toBe(true); // N=1 < 18
    expect(multiStep.audit.sampleAttenuation).toBeGreaterThan(singleStep.audit.sampleAttenuation);

    const singleDelta = Math.abs(singleStep.updatedWeights.gene_good - 0.34);
    const multiDelta = Math.abs(multiStep.updatedWeights.gene_good - 0.34);
    expect(singleDelta).toBeLessThan(multiDelta);

    // Simplexe strict : somme = 1.0 après mise à jour
    const sumMulti = Object.values(multiStep.updatedWeights).reduce((a, b) => a + b, 0);
    expect(sumMulti).toBeCloseTo(1.0, 5);
    expect(multiStep.updatedWeights.gene_good).toBeGreaterThan(multiStep.updatedWeights.gene_bad);
  });

  it('3. Near-misses strictement diagnostiques : aucun impact sur Brier, LogLoss ou poids appris', async () => {
    const historyBase = makeDeterministicDrawHistory(16, 'NATIONAL');
    // Construire deux historiques qui ont exactement les mêmes priorHistory et le même tirage cible en gagnants...
    // Pour la fonction pure d'évaluation marginale, un ticket très proche (±1) vs un ticket éloigné mais sans hit exact
    // donne strictement 0 hit et des métriques strictement identiques si marginals90 sont égales
    const winners = [10, 20, 30, 40, 50];
    const baseMarginals = projectScoresToCoherentMarginals(
      Array.from({ length: 90 }, (_, i) => (i + 1 === 9 ? 5 : 1)),
      5
    );

    const evalNearMiss = evaluateMarginalPredictions({
      marginals90: baseMarginals,
      actualWinners: winners,
      top5Predicted: [9, 19, 29, 39, 49], // 5 near-misses (-1) mais 0 exact hit
      priorDraws: historyBase,
    });
    const evalFarMiss = evaluateMarginalPredictions({
      marginals90: baseMarginals,
      actualWinners: winners,
      top5Predicted: [15, 25, 35, 45, 55], // 0 near-miss, 0 exact hit
      priorDraws: historyBase,
    });

    expect(evalNearMiss.exactHits).toBe(0);
    expect(evalFarMiss.exactHits).toBe(0);
    expect(evalNearMiss.brierScore).toBeCloseTo(evalFarMiss.brierScore, 10);
    expect(evalNearMiss.logLoss).toBeCloseTo(evalFarMiss.logLoss, 10);

    // Vérifier aussi sur l'autopsie client complète que calibrationSample somme bien à 5 et nearMisses reste exclu
    const baseWeights = getDefaultWeights();
    const report = await executeClosedLoopAutopsy('NATIONAL', 0, historyBase, baseWeights);
    const sampleSum = report.calibrationSample!.probabilities.reduce((a, b) => a + b, 0);
    expect(sampleSum).toBeCloseTo(5.0, 4);
    expect(report.learningAudit?.nearMissesExcludedFromLearning).toBe(true);
    expect(report.modelVersion).toBe(FORENSIC_MODEL_VERSION);

    RETIRED_ALGO_WEIGHT_KEYS.forEach((rk) => {
      expect(report.correctedWeights[rk]).toBe(0);
    });

    const batch = await executeBatchClosedLoopAutopsy('NATIONAL', historyBase, baseWeights, 4);
    expect(batch.learningAudit?.nearMissesExcludedFromLearning).toBe(true);
    expect(batch.meanLogLoss).toBeGreaterThan(0);
    const batchSum = Object.values(batch.recommendedWeights).reduce((a, b) => a + b, 0);
    expect(batchSum).toBeCloseTo(1.0, 4);
  });

  it('4. Validation chronologique Walk-Forward sans fuite d’information vs Uniforme & Historique', () => {
    const historyNewestFirst = makeDeterministicDrawHistory(36, 'NATIONAL');
    const oldestFirst = [...historyNewestFirst]
      .reverse()
      .map((d) => ({ date: d.date, gagnants: d.gagnants, machine: d.machine }));

    const keys = ['frequency', 'gap', 'spectral', 'markov', 'bayes'];

    // Troncature stricte à 28 tirages vs 36 tirages : les 2 premières périodes (communes) doivent être IDENTIQUES
    const wfShort = runChronologicalWalkForwardValidation({
      drawName: 'NATIONAL',
      chronologicalDrawsOldestFirst: oldestFirst.slice(0, 28),
      geneKeys: keys,
      warmupDraws: 10,
      periodCount: 3,
    });

    const wfFull = runChronologicalWalkForwardValidation({
      drawName: 'NATIONAL',
      chronologicalDrawsOldestFirst: oldestFirst,
      geneKeys: keys,
      warmupDraws: 10,
      periodCount: 3,
    });

    expect(wfShort.evaluatedDraws).toBe(18);
    expect(wfFull.evaluatedDraws).toBe(26);
    expect(wfFull.overall.uniformExpectedHits).toBeCloseTo(25 / 90, 4);
    expect(wfFull.overall.modelHitsCI95[0]).toBeLessThanOrEqual(wfFull.overall.modelMeanHits);
    expect(wfFull.overall.modelHitsCI95[1]).toBeGreaterThanOrEqual(wfFull.overall.modelMeanHits);
    expect(wfFull.overall.historicalMeanBrier).toBeGreaterThan(0);

    // Preuve zéro fuite : évaluer pas à pas jusqu'au même point T=28 donne EXACTEMENT les mêmes poids finaux
    const wfMatchedWarmup = runChronologicalWalkForwardValidation({
      drawName: 'NATIONAL',
      chronologicalDrawsOldestFirst: oldestFirst.slice(0, 28),
      geneKeys: keys,
      warmupDraws: 10,
      periodCount: 1,
    });
    expect(wfMatchedWarmup.finalWeights).toEqual(wfShort.finalWeights);

    // Wrapper client executeWalkForwardAutopsyValidation fonctionne sur un historique réel purifié
    const clientWf = executeWalkForwardAutopsyValidation(
      'NATIONAL',
      historyNewestFirst,
      getDefaultWeights(),
      { warmupDraws: 10, periodCount: 3 }
    );
    expect(clientWf.evaluatedDraws).toBe(26);
    expect(clientWf.periods.length).toBe(3);
  });

  it('5. Edge Handler Unifié : Idempotence stricte, persistance atomique & séparation Gemini vs Mesure', async () => {
    const snapshotId = '11111111-1111-4111-8111-111111111111';
    const drawResultId = '22222222-2222-4222-8222-222222222222';
    const priorDrawsRaw = makeDeterministicDrawHistory(20, 'NATIONAL');

    const snapshot = {
      id: snapshotId,
      user_id: '33333333-3333-4333-8333-333333333333',
      draw_name: 'NATIONAL',
      predicted_numbers: [5, 14, 27, 42, 79],
      decision_dna: {
        frequency: 0.25,
        gap: 0.25,
        spectral: 0.25,
        markov: 0.25,
      },
      metrics_snapshot: {
        confidence: 65,
        shannon_entropy: 0.72,
        hurst_exponent: 0.51,
      },
      status: 'PENDING',
      autopsy_report: null as Record<string, any> | null,
    };

    const drawResult = {
      id: drawResultId,
      draw_name: 'NATIONAL',
      date: '2026-02-15',
      gagnants: [5, 13, 27, 60, 88], // 2 hits exacts (5, 27) + 1 near-miss (14 vs 13)
      machine: [1, 2, 3, 4, 5],
    };

    const storedReviews: any[] = [];
    const atomicPersistSpy = vi.fn(async (params: any) => {
      if (
        storedReviews.some(
          (r) =>
            r.snapshot_id === params.p_snapshot_id &&
            r.draw_result_id === params.p_draw_result_id &&
            r.model_version === params.p_model_version
        )
      ) {
        return { applied: false, idempotent_hit: true, report: snapshot.autopsy_report ?? undefined };
      }
      storedReviews.push({
        snapshot_id: params.p_snapshot_id,
        draw_result_id: params.p_draw_result_id,
        model_version: params.p_model_version,
        exact_hits: params.p_exact_hits,
        brier_score: params.p_brier_score,
        log_loss: params.p_log_loss,
      });
      snapshot.status = 'COMPLETED';
      snapshot.autopsy_report = params.p_final_report;
      return { applied: true, idempotent_hit: false, report: params.p_final_report };
    });

    const buildDeps = (generateNarrative?: ForensicAutopsyDeps['generateNarrative']): ForensicAutopsyDeps => ({
      getSnapshot: async (id) => (id === snapshotId ? snapshot : null),
      getDrawResult: async (id) => (id === drawResultId ? drawResult : null),
      findExistingReview: async (sId, rId, ver) => {
        const hit = storedReviews.find(
          (r) => r.snapshot_id === sId && r.draw_result_id === rId && r.model_version === ver
        );
        return hit ? { id: 'rev_1', report: snapshot.autopsy_report } : null;
      },
      getPriorDrawResults: async () =>
        priorDrawsRaw.map((d) => ({
          id: d.id,
          draw_name: 'NATIONAL',
          date: '2026-01-15',
          gagnants: d.gagnants,
          machine: d.machine,
        })),
      getPriorPostMortemReviews: async () => [],
      getCurrentWeightsConfig: async () => ({
        draw_name: 'NATIONAL',
        weights: { ...snapshot.decision_dna },
        sigmoid_slope: 1.0,
        sigmoid_intercept: -0.5,
      }),
      applyAtomicPersistence: atomicPersistSpy,
      generateNarrative,
    });

    // Run 1 avec Gemini qui échoue : les calculs déterministes & fallback doivent réussir sans erreur
    const res1 = await runForensicAutopsyCore(
      buildDeps(async () => {
        throw new Error('Gemini 503 Unavailable');
      }),
      { snapshotId, drawResultId }
    );

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(res1.body.idempotent).toBe(false);
    expect(res1.body.report.modelVersion).toBe(FORENSIC_MODEL_VERSION);
    expect(res1.body.report.marginalSum).toBeCloseTo(5.0, 5);
    expect(res1.body.report.nearMissesExcludedFromLearning).toBe(true);
    expect(res1.body.report.modelUsed).toBe('deterministic-narrative-v2');
    expect(atomicPersistSpy).toHaveBeenCalledTimes(1);

    const wSum = Object.values(res1.body.report.updatedWeights as Record<string, number>).reduce(
      (a, b) => a + b,
      0
    );
    expect(wSum).toBeCloseTo(1.0, 5);

    // Run 2 sur le même (snapshotId, drawResultId) : strictement idempotent, ZERO 2e appel RPC !
    const res2 = await runForensicAutopsyCore(buildDeps(), { snapshotId, drawResultId });
    expect(res2.status).toBe(200);
    expect(res2.body.idempotent).toBe(true);
    expect(atomicPersistSpy).toHaveBeenCalledTimes(1);
    expect(storedReviews).toHaveLength(1);

    // Run 3 avec nouveau snapshotId et Gemini retournant du texte : vérifie que Gemini ne modifie pas les poids vs sans Gemini
    const snapA = { ...snapshot, id: '44444444-4444-4444-8444-444444444444', status: 'PENDING', autopsy_report: null };
    const snapB = { ...snapshot, id: '55555555-5555-4555-8555-555555555555', status: 'PENDING', autopsy_report: null };

    const makeFreshDeps = (
      snapObj: typeof snapA,
      gen?: ForensicAutopsyDeps['generateNarrative']
    ): ForensicAutopsyDeps => ({
      ...buildDeps(gen),
      getSnapshot: async () => snapObj,
      findExistingReview: async () => null,
      applyAtomicPersistence: async (p) => ({ applied: true, idempotent_hit: false, report: p.p_final_report }),
    });

    const withoutAi = await runForensicAutopsyCore(makeFreshDeps(snapA, undefined), {
      snapshotId: snapA.id,
      drawResultId,
    });
    const withAi = await runForensicAutopsyCore(
      makeFreshDeps(snapB, async () => ({
        analysis: 'Explication narrative Gemini lisible.',
        modelUsed: 'gemini-3.5-flash',
      })),
      { snapshotId: snapB.id, drawResultId }
    );

    expect(withAi.body.report.aiAnalysis).toBe('Explication narrative Gemini lisible.');
    expect(withAi.body.report.updatedWeights).toEqual(withoutAi.body.report.updatedWeights);
    expect(withAi.body.report.recommendations).toEqual(withoutAi.body.report.recommendations);
    expect(withAi.body.report.brierScore).toBe(withoutAi.body.report.brierScore);
    expect(withAi.body.report.logLoss).toBe(withoutAi.body.report.logLoss);
  });

  it('6. Normalisation simplexe respecte strictement les clés forcées à zéro', () => {
    const norm = normalizeWeightsSimplex(
      { freq: 0.4, gap: 0.4, machine: 0.2 },
      { forcedZeroKeys: new Set(['machine']) }
    );
    expect(norm.machine).toBe(0);
    expect(norm.freq + norm.gap).toBeCloseTo(1.0, 5);
  });
});
