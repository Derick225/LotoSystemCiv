import { describe, it, expect, beforeEach } from 'vitest';
import {
  runForensicAutopsyCore,
  type ForensicAutopsyDeps,
  type SnapshotRecord,
  type DrawResultRecord,
  type PriorPostMortemRecord,
} from '../supabase/functions/_shared/forensic-autopsy-core.ts';
import {
  computeCanonicalExactHitsAndNearMisses,
  computeCanonicalTopologicalLoss,
  computeCautiousAggregatedWeightUpdate,
  UNIFORM_BRIER_BASELINE,
  UNIFORM_LOG_LOSS_BASELINE,
} from '../supabase/functions/_shared/forensic-learning-engine.ts';
import { synthesizeDnaGeneSequenceAndWeights } from '../src/services/prediction/dnaGeneSequenceService';
import { offlineQueueService } from '../src/services/offlineQueueService';
import { getDefaultWeights } from '../src/services/prediction/weightsManager';
import { AlgoKey } from '../src/shared/prediction.types';
import { generateAbbreviatedWheel } from '../src/services/combinatoricsService';

const VALID_UUID_SNAP = '11111111-1111-4111-8111-111111111111';
const VALID_UUID_DRAW = '22222222-2222-4222-8222-222222222222';

function makePriorDraws(count: number): DrawResultRecord[] {
  const draws: DrawResultRecord[] = [];
  for (let i = 0; i < count; i++) {
    const day = String(1 + (i % 28)).padStart(2, '0');
    const month = String(1 + (Math.floor(i / 28) % 6)).padStart(2, '0');
    const base = (i * 11 + 2) % 90;
    draws.push({
      id: `prior-${i}`,
      draw_name: 'NATIONAL',
      date: `2026-${month}-${day}`,
      gagnants: [0, 1, 2, 3, 4].map((k) => ((base + k * 7) % 90) + 1),
    });
  }
  return draws;
}

function makeBaseDeps(overrides?: Partial<ForensicAutopsyDeps>): ForensicAutopsyDeps {
  const priorDraws = makePriorDraws(25);
  return {
    async getSnapshot(): Promise<SnapshotRecord | null> {
      return {
        id: VALID_UUID_SNAP,
        user_id: 'user-owner',
        draw_name: 'NATIONAL',
        target_date: '2026-07-10',
        created_at: '2026-07-10T08:00:00.000Z',
        predicted_numbers: [5, 12, 23, 34, 45],
        decision_dna: { frequency: 0.4, gaps: 0.3, markov: 0.3 },
        metrics_snapshot: {},
        status: 'PENDING',
      };
    },
    async getDrawResult(): Promise<DrawResultRecord | null> {
      return {
        id: VALID_UUID_DRAW,
        draw_name: 'NATIONAL',
        date: '2026-07-10',
        gagnants: [5, 13, 30, 50, 70],
      };
    },
    async findExistingReview() {
      return null;
    },
    async hasGlobalDrawLearned() {
      return false;
    },
    async getPriorDrawResults() {
      return priorDraws;
    },
    async getPriorPostMortemReviews() {
      return [];
    },
    async getCurrentWeightsConfig() {
      return {
        draw_name: 'NATIONAL',
        weights: { frequency: 0.34, gaps: 0.33, markov: 0.33 },
        sigmoid_slope: 1.0,
        sigmoid_intercept: 0.0,
        weight_version: 7,
      };
    },
    async applyAtomicPersistence() {
      return { applied: true, idempotent_hit: false };
    },
    ...overrides,
  };
}

describe('Hardening Post-Mortem Autopsy Core (A.1 – A.13)', () => {
  it('refuse 403 quand un utilisateur standard tente d’autopsier le snapshot d’un autre utilisateur', async () => {
    const deps = makeBaseDeps();
    const res = await runForensicAutopsyCore(
      deps,
      { snapshotId: VALID_UUID_SNAP, drawResultId: VALID_UUID_DRAW },
      { actor: { kind: 'user', userId: 'attacker-user' } }
    );
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('permet au propriétaire un diagnostic isolé SANS muter les poids globaux (globalLearningApplied=false)', async () => {
    let capturedApplyGlobal: boolean | undefined;
    let capturedDeltas: Record<string, number> = {};
    const deps = makeBaseDeps({
      async applyAtomicPersistence(params) {
        capturedApplyGlobal = params.p_apply_global_learning;
        capturedDeltas = params.p_weight_deltas;
        return { applied: true, idempotent_hit: false };
      },
    });
    const res = await runForensicAutopsyCore(
      deps,
      { snapshotId: VALID_UUID_SNAP, drawResultId: VALID_UUID_DRAW },
      { actor: { kind: 'user', userId: 'user-owner' } }
    );
    expect(res.status).toBe(200);
    expect(res.body.report.globalLearningApplied).toBe(false);
    expect(capturedApplyGlobal).toBe(false);
    expect(Object.values(capturedDeltas).every((d) => d === 0)).toBe(true);
  });

  it('rejette 422 les incohérences snapshot ↔ tirage (nom, date cible, post-tirage)', async () => {
    // 1. draw_name mismatch
    const resName = await runForensicAutopsyCore(
      makeBaseDeps({
        async getDrawResult() {
          return { id: VALID_UUID_DRAW, draw_name: 'ESPOIR', date: '2026-07-10', gagnants: [5, 13, 30, 50, 70] };
        },
      }),
      { snapshotId: VALID_UUID_SNAP, drawResultId: VALID_UUID_DRAW },
      { actor: { kind: 'system' } }
    );
    expect(resName.status).toBe(422);

    // 2. target_date mismatch
    const resDate = await runForensicAutopsyCore(
      makeBaseDeps({
        async getDrawResult() {
          return { id: VALID_UUID_DRAW, draw_name: 'NATIONAL', date: '2026-07-11', gagnants: [5, 13, 30, 50, 70] };
        },
      }),
      { snapshotId: VALID_UUID_SNAP, drawResultId: VALID_UUID_DRAW },
      { actor: { kind: 'system' } }
    );
    expect(resDate.status).toBe(422);

    // 3. created_at après la date du tirage
    const resPost = await runForensicAutopsyCore(
      makeBaseDeps({
        async getSnapshot() {
          return {
            id: VALID_UUID_SNAP,
            user_id: 'user-owner',
            draw_name: 'NATIONAL',
            target_date: '2026-07-10',
            created_at: '2026-07-11T09:00:00.000Z',
            predicted_numbers: [5, 12, 23, 34, 45],
          };
        },
      }),
      { snapshotId: VALID_UUID_SNAP, drawResultId: VALID_UUID_DRAW },
      { actor: { kind: 'system' } }
    );
    expect(resPost.status).toBe(422);
  });

  it('ignore metrics_snapshot.geneScores client empoisonné et reconstruit côté serveur (A.2 & A.5)', async () => {
    let capturedSnapshotWeights: Record<string, number> | undefined;
    const poisonedGeneScores: Record<string, number[]> = {
      frequency: new Array(90).fill(99999),
      gaps: new Array(90).fill(0),
      markov: new Array(90).fill(0),
    };
    const deps = makeBaseDeps({
      async getSnapshot() {
        return {
          id: VALID_UUID_SNAP,
          user_id: 'user-owner',
          draw_name: 'NATIONAL',
          target_date: '2026-07-10',
          created_at: '2026-07-10T08:00:00.000Z',
          predicted_numbers: [5, 12, 12, 23, 34, 45, 88], // doublons + >5 numéros
          decision_dna: { frequency: 0.46, gaps: 0.34, markov: 0.20 },
          metrics_snapshot: { geneScores: poisonedGeneScores },
        };
      },
      async applyAtomicPersistence(params) {
        capturedSnapshotWeights = params.p_counterfactual_analysis.snapshotWeightsEvaluated;
        expect(params.p_predicted_numbers.length).toBe(5);
        expect(params.p_exact_hits).toBeLessThanOrEqual(5);
        return { applied: true, idempotent_hit: false };
      },
    });

    const res = await runForensicAutopsyCore(
      deps,
      { snapshotId: VALID_UUID_SNAP, drawResultId: VALID_UUID_DRAW },
      { actor: { kind: 'system' } }
    );
    expect(res.status).toBe(200);
    expect(res.body.report.geneScoresSource).toBe('server_reconstructed');
    expect(res.body.report.telemetryGaps).toContain('confidence_missing');
    expect(res.body.report.telemetryGaps).toContain('shannon_entropy_missing');
    expect(res.body.report.telemetryGaps).toContain('hurst_exponent_missing');
    // snapshotWeightsUsed doit refléter decision_dna (0.46) et non currentConfig (0.34)
    expect(capturedSnapshotWeights?.frequency).toBeCloseTo(0.46, 5);
  });

  it('empêche la double mise à jour globale sur le même tirage et déduplique la fenêtre glissante par tirage distinct (A.3 & A.6)', async () => {
    const duplicatePriorReviews: PriorPostMortemRecord[] = Array.from({ length: 20 }, (_, i) => ({
      id: `rev-${i}`,
      draw_result_id: 'same-draw-uuid', // même tirage répété 20 fois par différents utilisateurs
      draw_date: '2026-07-03',
      exact_hits: 5, // hits artificiellement élevés pour tester le comptage distinct
      brier_score: 0.01,
      log_loss: 0.05,
    }));

    const depsAlreadyLearned = makeBaseDeps({
      async hasGlobalDrawLearned() {
        return true;
      },
      async getPriorPostMortemReviews() {
        return duplicatePriorReviews;
      },
    });

    const res = await runForensicAutopsyCore(
      depsAlreadyLearned,
      { snapshotId: VALID_UUID_SNAP, drawResultId: VALID_UUID_DRAW },
      { actor: { kind: 'system' } }
    );
    expect(res.status).toBe(200);
    expect(res.body.report.globalLearningApplied).toBe(false);
    // 20 revues du même draw_result_id = 1 tirage distinct passé + 1 courant = sampleSize 2 (< 18) -> prudenceModeActive=true
    expect(res.body.report.sampleSize).toBe(2);
    expect(res.body.report.prudenceModeActive).toBe(true);
  });

  it('verrouille réellement à zéro toute mutation des poids/calibration quand le mode prudence est actif (A.7)', () => {
    const res = computeCautiousAggregatedWeightUpdate({
      currentWeights: { frequency: 0.4, gaps: 0.35, markov: 0.25 },
      drawAttributionsWindow: [
        [
          { key: 'frequency', weight: 0.4, deltaLogLossAblation: 0.1, deltaBrierAblation: 0.01, deltaHitsTop5Ablation: 1, winnerLiftAblation: 0.5, counterfactualScore: 0.2 },
          { key: 'gaps', weight: 0.35, deltaLogLossAblation: -0.05, deltaBrierAblation: -0.01, deltaHitsTop5Ablation: 0, winnerLiftAblation: -0.3, counterfactualScore: -0.1 },
          { key: 'markov', weight: 0.25, deltaLogLossAblation: 0, deltaBrierAblation: 0, deltaHitsTop5Ablation: 0, winnerLiftAblation: 0, counterfactualScore: 0 },
        ],
      ],
      windowMetrics: Array.from({ length: 10 }, () => ({
        exactHits: 1,
        brierScore: UNIFORM_BRIER_BASELINE * 0.9,
        logLoss: UNIFORM_LOG_LOSS_BASELINE * 0.9,
        ece: 0.01,
      })),
      entropyNormalized: 0.85,
      hurstExponent: 0.5,
      baseSigmoidSlope: 1.1,
      baseSigmoidIntercept: -0.2,
      singleDrawOnlineUpdate: true,
    });

    expect(res.audit.prudenceModeActive).toBe(true);
    expect(res.audit.effectiveLearningRate).toBe(0);
    expect(res.audit.calibration.slopeDelta).toBe(0);
    expect(res.audit.calibration.interceptDelta).toBe(0);
    expect(res.updatedWeights.frequency).toBeCloseTo(0.4, 8);
    expect(res.updatedWeights.gaps).toBeCloseTo(0.35, 8);
    expect(res.updatedWeights.markov).toBeCloseTo(0.25, 8);
    expect(Object.values(res.audit.weightDeltas).every((d) => d === 0)).toBe(true);
  });

  it('unifie la définition canonique des hits (Top-5 dédupliqué) et near-misses circulaires sans double comptage (A.9 & A.11)', () => {
    const stats = computeCanonicalExactHitsAndNearMisses(
      [1, 1, 90, 12, 44, 70],
      [90, 2, 12, 60, 80]
    );
    expect(stats.predictedTop5).toEqual([1, 90, 12, 44, 70]);
    expect(stats.exactHits).toBe(2); // 90 et 12
    // 1 est adjacent à 90 (-1 circulaire) ET 2 (+1) => compté au plus 1 fois
    expect(stats.nearMissCount).toBe(1);

    const lossSame = computeCanonicalTopologicalLoss([5, 10, 15, 20, 25], [5, 10, 15, 20, 25]);
    const lossDiff = computeCanonicalTopologicalLoss([1, 2, 3, 4, 5], [50, 60, 70, 80, 90]);
    expect(lossSame).toBe(0);
    expect(lossDiff).toBeGreaterThan(0.5);
  });
});

describe('Hardening ADN Fail-Closed, Queue Cross-User & Garantie Combinatoire (B.1, C.1, C.3)', () => {
  beforeEach(() => {
    // Nettoie les clés mémoire éventuelles en test Node
    (offlineQueueService as any).memoryFallbackStore?.clear?.();
  });

  it('fail-closed : rejette les rapports forensiques si l’historique n’a aucune date valide (B.1)', () => {
    const drawName = 'MIDWEEK';
    const invalidHistory = [
      { id: 'd1', drawName, date: 'date-corrompue', gagnants: [1, 2, 3, 4, 5] },
      { id: 'd2', drawName, date: '', gagnants: [6, 7, 8, 9, 10] },
    ];
    const report = {
      id: 'rep-1',
      predictionId: 'pred-1',
      drawName,
      date: '10/01/2025',
      combo: [1, 2, 3, 4, 5],
      matches: [],
      missedOpportunities: [],
      scoreDivergence: [],
      aiAnalysis: '',
      suspicionScore: 10,
      proposedAdjustments: [{ algo: AlgoKey.BAYES, proposedWeightChange: 0.1, reason: 'test' }],
    };

    const res = synthesizeDnaGeneSequenceAndWeights({
      drawName,
      history: invalidHistory,
      currentWeights: getDefaultWeights(),
      forensicReports: [report],
    });
    expect(res.sourcesUsed.forensicReports).toBe(0);
  });

  it('capture originUserId dans offlineQueueService et purge les champs scellés côté client (C.1 & C.2)', async () => {
    await offlineQueueService.enqueue('prediction_snapshot', 'NATIONAL', {
      id: 'snap-sec-1',
      user_id: 'user-A',
      draw_name: 'NATIONAL',
      target_date: '2026-07-10',
      predicted_numbers: [1, 2, 3, 4, 5],
      status: 'COMPLETED',
      autopsy_report: { forged: true },
      actual_numbers: [1, 2, 3, 4, 5],
      metrics_snapshot: { geneScores: { frequency: [99] }, shannon_entropy: 0.9 },
    });

    const stats = await offlineQueueService.getQueueStats();
    expect(stats.pendingCount).toBe(1);
    const queued = stats.items[0];
    expect(queued.originUserId).toBe('user-A');
    expect(queued.payload.status).toBe('PENDING');
    expect(queued.payload.autopsy_report).toBeUndefined();
    expect(queued.payload.actual_numbers).toBeUndefined();
    expect((queued.payload.metrics_snapshot as Record<string, unknown>).geneScores).toBeUndefined();
  });

  it('calcul honnête de la garantie conditionnelle et sous-garantie avec bases (C.3)', () => {
    const { diagnostics } = generateAbbreviatedWheel(
      [1, 2, 3, 4, 5, 6, 7, 8],
      [1, 2],
      5,
      3,
      'reduced'
    );
    expect(diagnostics.bankersCount).toBe(2);
    expect(diagnostics.requestedGuarantee).toBe(3);
    expect(diagnostics.effectiveSubGuarantee).toBe(2); // max(2, 3 - 2)
    expect(diagnostics.conditionalGuaranteeLabel).toContain('hors bases');
    expect(diagnostics.conditionalGuaranteeDisclaimer).toContain('conditionnelle');
  });
});
