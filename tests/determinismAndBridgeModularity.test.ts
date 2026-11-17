import { describe, it, expect, vi } from 'vitest';
import type { AlgoWeights, DrawResult, LearningSession } from '../src/types';
import { AlgoKey } from '../src/shared/prediction.types';
import {
  buildDeterministicMetaSeed,
  optimizeMetaWeightsDeterministic,
} from '../src/services/workers/metaLearningCore';
import {
  computeGapRangeAnalysisHpc,
  computeGapRangeWalkForwardHpc,
  mineCyclePatternsHpc,
  computeEpigenomeMatrixHpc,
  computeSequenceOrderMetricsHpc,
  scoreEpigenomeWalkForwardStepHpc,
  getWasmFallbackCount,
  resetWasmFallbackCount,
  isLotoEngineWasmReady,
  readWasmField,
} from '../src/services/wasm/lotoEngineBridge';

vi.mock('../src/services/prediction/optimizationController', () => ({
  applyOptimizedWeights: vi.fn(async ({ weights }: { weights: AlgoWeights }) => ({
    appliedWeights: weights,
    versionId: 'v_test_deterministic',
    rejected: false,
  })),
}));

vi.mock('../src/services/prediction/ticketAnalysisService', () => ({
  getAdaptiveRules: vi.fn(() => ({ criticalZoneMin: 20, criticalZoneMax: 65 })),
  saveAdaptiveRules: vi.fn(),
}));

describe('Durcissement déterminisme & modularisation bridges WASM', () => {
  it('buildDeterministicMetaSeed & optimizeMetaWeightsDeterministic restent invariants sans date', () => {
    const datelessHistory: DrawResult[] = Array.from({ length: 30 }, (_, idx) => ({
      id: `d_${idx}`,
      drawName: 'NATIONAL',
      date: '',
      gagnants: [
        ((idx * 7 + 1) % 90) + 1,
        ((idx * 11 + 17) % 90) + 1,
        ((idx * 13 + 31) % 90) + 1,
        ((idx * 17 + 47) % 90) + 1,
        ((idx * 19 + 63) % 90) + 1,
      ],
      machine: [],
    }));

    const baseWeights = {
      frequency: 0.25,
      temporal: 0.2,
      markov: 0.25,
      affinity: 0.15,
      gaps: 0.15,
    } as unknown as AlgoWeights;

    const spyNow = vi.spyOn(Date, 'now').mockReturnValueOnce(1700000001000).mockReturnValueOnce(1800000009999);
    const seedA = buildDeterministicMetaSeed(datelessHistory);
    const optA = optimizeMetaWeightsDeterministic(datelessHistory, baseWeights);

    const seedB = buildDeterministicMetaSeed(datelessHistory);
    const optB = optimizeMetaWeightsDeterministic(datelessHistory, baseWeights);
    spyNow.mockRestore();

    expect(seedA).toBe(seedB);
    expect(seedA.startsWith('meta_30_fnv_')).toBe(true);
    expect(optA).toEqual(optB);

    const sum = Object.values(optA).reduce((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('applyForensicAdjustments génère des identifiants NeuralFeedbackLog 100% déterministes indépendamment de Date.now()', async () => {
    const { applyForensicAdjustments } = await import('../src/services/forensicTrainingBridge');

    const session: LearningSession = {
      id: 'session_ref_42',
      drawName: 'NATIONAL',
      timestamp: 1700000000000,
      adjustments: [
        { algo: AlgoKey.SPECTRAL, oldWeight: 0.2, newWeight: 0.35, reason: 'Drift AC' },
        { algo: AlgoKey.GAPS, oldWeight: 0.3, newWeight: 0.15, reason: 'Recalage' },
      ],
    };

    const baseWeights = {
      [AlgoKey.SPECTRAL]: 0.2,
      [AlgoKey.GAPS]: 0.3,
      [AlgoKey.FREQUENCY]: 0.25,
      [AlgoKey.MARKOV]: 0.25,
    } as unknown as AlgoWeights;

    const logsRun1: string[] = [];
    const logsRun2: string[] = [];

    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1711111111111)
      .mockReturnValueOnce(1922222222222);

    await applyForensicAdjustments(session, baseWeights, false, (logs) => {
      logs.forEach((l) => logsRun1.push(l.id));
    });
    await applyForensicAdjustments(session, baseWeights, false, (logs) => {
      logs.forEach((l) => logsRun2.push(l.id));
    });

    nowSpy.mockRestore();

    expect(logsRun1.length).toBeGreaterThan(0);
    expect(logsRun1).toEqual(logsRun2);
  });

  it('lotoEngineBridge réexporte intactes les APIs runtime, gapRange/pattern et EpiGenome-SQ', () => {
    expect(typeof isLotoEngineWasmReady()).toBe('boolean');
    resetWasmFallbackCount();
    expect(getWasmFallbackCount()).toBe(0);
    expect(readWasmField({ a: () => 42 }, 'a', 0)).toBe(42);
    expect(readWasmField(null, 'a', 7)).toBe(7);

    const ord = computeSequenceOrderMetricsHpc([1, 2, 3, 4], [1, 3, 2, 4]);
    expect(ord.kendallTau).toBeCloseTo(1 / 6, 5);
    expect(ord.spearmanFootrule).toBeGreaterThan(0);

    const flatDraws = new Int32Array(25 * 5);
    for (let d = 0; d < 25; d++) {
      for (let c = 0; c < 5; c++) {
        flatDraws[d * 5 + c] = ((d * 5 + c) % 90) + 1;
      }
    }

    const gapRes = computeGapRangeAnalysisHpc(flatDraws, 25, 5);
    expect(gapRes.optimalFive.length).toBe(5);

    const wfRes = computeGapRangeWalkForwardHpc(flatDraws, 25, 5, 5);
    expect(wfRes.evalCount).toBeGreaterThan(0);

    const patRes = mineCyclePatternsHpc(flatDraws, 25, 5, 5, 0, true);
    expect(patRes.totalCycles).toBe(5);

    const epiOut = computeEpigenomeMatrixHpc({
      rawEpistasisFlat: new Float64Array(4),
      epistasisSamplesFlat: new Float64Array(4),
      lineageWeightsFlat: new Float64Array([0.5, 0.5, 0.4, 0.6, 0.6, 0.4]),
      numLineage: 3,
      initialWeights: new Float64Array([0.5, 0.5]),
      armIds: new Uint8Array([0, 1]),
      proofFlags: new Uint8Array([1, 0]),
      proofScores: new Float64Array([0.5, -0.2]),
      baseAnalysisSignals: new Float64Array([0.1, -0.1]),
      forcedZeroFlags: new Uint8Array([0, 0]),
      numGenes: 2,
      hurst: 0.55,
      entropyNorm: 0.9,
      totalEvidenceUnits: 10,
    });
    expect(epiOut.numGenes).toBe(2);
    expect(epiOut.rawTargetWeights.length).toBe(2);

    const wfStep = scoreEpigenomeWalkForwardStepHpc({
      pluginScoresFlat: new Float64Array(180).fill(0.5),
      epiWeights: new Float64Array([0.6, 0.4]),
      baseWeights: new Float64Array([0.5, 0.5]),
      numGenes: 2,
      actualWinners: new Uint8Array([1, 2, 3, 4, 5]),
    });
    expect(wfStep.top5Epi.length).toBe(5);
  });
});
