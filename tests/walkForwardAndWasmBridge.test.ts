import { describe, it, expect } from 'vitest';
import { DrawResult } from '../src/types';
import { gapRangeSequenceService } from '../src/services/prediction/gapRangeSequenceService';
import { patternDiscoveryService } from '../src/services/prediction/patternDiscoveryService';
import {
  computeGapRangeAnalysisHpc,
  computeGapRangeWalkForwardHpc,
  mineCyclePatternsHpc,
} from '../src/services/wasm/lotoEngineBridge';

function createDeterministicIidHistory(
  count: number,
  drawName: string = 'NATIONAL',
  seedInit: number = 0x12345678
): DrawResult[] {
  let state = BigInt(seedInit);
  const a = 6364136223846793005n;
  const c = 1442695040888963407n;
  const mask = (1n << 64n) - 1n;

  const chrono: DrawResult[] = [];
  const startMs = Date.UTC(2024, 0, 1);

  for (let t = 0; t < count; t++) {
    const pool = Array.from({ length: 90 }, (_, i) => i + 1);
    const g: number[] = [];
    for (let k = 0; k < 5; k++) {
      state = (state * a + c) & mask;
      const idx = Number((state >> 32n) % BigInt(pool.length));
      g.push(pool[idx]);
      pool.splice(idx, 1);
    }
    g.sort((x, y) => x - y);
    const d = new Date(startMs + t * 86400_000);
    const iso = d.toISOString().slice(0, 10);
    chrono.push({
      id: `draw-${t}`,
      drawName,
      date: iso,
      gagnants: g,
      machine: [],
    });
  }
  // App convention: newest first
  return chrono.reverse();
}

function flattenNewestFirstToChrono(historyNewestFirst: DrawResult[]): Int32Array {
  const chrono = [...historyNewestFirst].reverse();
  const flat = new Int32Array(chrono.length * 5);
  for (let t = 0; t < chrono.length; t++) {
    for (let c = 0; c < 5; c++) {
      flat[t * 5 + c] = chrono[t].gagnants[c] ?? 0;
    }
  }
  return flat;
}

describe('Walk-Forward OOS & HPC Rust/WASM Bridge Verification', () => {
  it('evaluates full 30-draw Walk-Forward OOS window without 25-draw cap and reports calibrated H0 baselines', () => {
    const history = createDeterministicIidHistory(70, 'NATIONAL');
    const wf = gapRangeSequenceService.evaluateGapRangeWalkForward('NATIONAL', history, 30);

    expect(wf.isOutOfSample).toBe(true);
    expect(wf.evalCount).toBe(30);
    expect(wf.evaluations.length).toBe(30);
    expect(wf.recentEvaluations.length).toBe(12);
    expect(wf.expectedH0AtLeastOneHitRate).toBe(25.4);
    expect(wf.expectedH0SelectionHitsPerDraw).toBeCloseTo(5 / 18, 3);
    expect(wf.top1SuccessRate).toBeGreaterThanOrEqual(0);
    expect(wf.top1SuccessRate).toBeLessThanOrEqual(100);
    expect(wf.top3BallCoverageRate).toBeGreaterThanOrEqual(0);
    expect(wf.top3BallCoverageRate).toBeLessThanOrEqual(100);
    expect(wf.meanBrierScore).toBeGreaterThanOrEqual(0);
    expect(wf.h0BrierScore).toBeGreaterThan(0);
    expect(wf.brierSkillScore).toBeGreaterThanOrEqual(-1);
    expect(wf.brierSkillScore).toBeLessThanOrEqual(1);
  });

  it('enforces strict Walk-Forward causality (future perturbation on draw t never leaks into steps < t)', () => {
    const historyA = createDeterministicIidHistory(60, 'NATIONAL', 0xABCDEF01);
    const historyB = historyA.map((item, idx) =>
      idx === 0
        ? { ...item, gagnants: [86, 87, 88, 89, 90] }
        : { ...item, gagnants: [...item.gagnants] }
    );

    const wfA = gapRangeSequenceService.evaluateGapRangeWalkForward('NATIONAL', historyA, 20);
    const wfB = gapRangeSequenceService.evaluateGapRangeWalkForward('NATIONAL', historyB, 20);

    expect(wfA.evalCount).toBe(20);
    expect(wfB.evalCount).toBe(20);

    // Every step before index 0 (newest) depends only on strictly prior draws
    for (let i = 1; i < wfA.evaluations.length; i++) {
      expect(wfB.evaluations[i].predictedTopBins).toEqual(wfA.evaluations[i].predictedTopBins);
      expect(wfB.evaluations[i].brierScore).toBeCloseTo(wfA.evaluations[i].brierScore, 10);
      expect(wfB.evaluations[i].optimalFiveHitCount).toBe(wfA.evaluations[i].optimalFiveHitCount);
    }
  });

  it('produces aligned Stouffer Z synthesis & Hamilton-Hare quotas in computeGapRangeAnalysisHpc', () => {
    const history = createDeterministicIidHistory(90, 'NATIONAL');
    const flat = flattenNewestFirstToChrono(history);
    const hpc = computeGapRangeAnalysisHpc(flat, history.length, 5);
    const tsReport = gapRangeSequenceService.analyzeGapRangeSequences('NATIONAL', history);

    expect(hpc.totalAnalyzedDraws).toBe(tsReport.totalAnalyzedDraws);
    expect(hpc.optimalFive.length).toBe(5);
    expect(new Set(hpc.optimalFive).size).toBe(5);
    expect(Array.from(hpc.optimalFive)).toEqual(tsReport.selectionSynthesis.optimalFive);
    expect(Array.from(hpc.reserveTwo)).toEqual(tsReport.selectionSynthesis.reserveTwo);

    const quotaSum = Array.from(hpc.trancheQuotas).reduce((a, b) => a + b, 0);
    expect(quotaSum).toBe(5);

    let sumZ = 0;
    for (let n = 1; n <= 90; n++) sumZ += hpc.ballStoufferZ[n];
    expect(Math.abs(sumZ / 90)).toBeLessThan(0.6);

    const wfHpc = computeGapRangeWalkForwardHpc(flat, history.length, 5, 15);
    expect(wfHpc.evalCount).toBe(15);
  });

  it('mines planted triplets and cycles deterministically via mineCyclePatternsHpc & patternDiscoveryService', () => {
    const cycleLen = 10;
    const totalCycles = 12;
    const chrono: DrawResult[] = [];
    let seed = 0xCAFEBABEn;
    const mask = (1n << 64n) - 1n;

    for (let cyc = 0; cyc < totalCycles; cyc++) {
      for (let d = 0; d < cycleLen; d++) {
        const g: number[] = [];
        if (cyc < totalCycles - 1 && d === 0) {
          g.push(7, 19, 43);
        }
        while (g.length < 5) {
          seed = (seed * 6364136223846793005n + 1442695040888963407n) & mask;
          const ball = Number((seed >> 32n) % 90n) + 1;
          if (!g.includes(ball)) g.push(ball);
        }
        g.sort((a, b) => a - b);
        chrono.push({
          id: `c-${cyc}-${d}`,
          drawName: 'NATIONAL',
          date: `2025-01-01`,
          gagnants: g,
          machine: [],
        });
      }
    }

    const flat = new Int32Array(chrono.length * 5);
    for (let t = 0; t < chrono.length; t++) {
      for (let c = 0; c < 5; c++) flat[t * 5 + c] = chrono[t].gagnants[c];
    }

    const mining = mineCyclePatternsHpc(flat, chrono.length, 5, cycleLen, 0, true);
    expect(mining.completedCyclesCount).toBe(11);
    expect(mining.pairCycleSupports.length).toBe(4005);

    const summary = patternDiscoveryService.discoverPatterns('NATIONAL', [...chrono].reverse(), {
      cycleLength: cycleLen,
    });
    const planted = summary.topRecurringTriplets.find(
      (t) => t.sequence.join('-') === '7-19-43'
    );
    expect(planted).toBeDefined();
    expect(planted!.zScore).toBeGreaterThan(3);
    expect(summary.recommendedSelection?.scoringMethod).toBe('STOUFFER_Z');
  });
});
