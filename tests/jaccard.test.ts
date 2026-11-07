import { describe, it, expect } from 'vitest';
import { AlgoKey } from '../src/shared/prediction.types';
import { algorithmRegistry, getAlgorithm } from '../src/services/prediction/algorithmRegistry';
import { jaccardPlugin } from '../src/services/prediction/algorithms/jaccard';
import { calculateScores } from '../src/services/prediction/scoringEngine';
import { DrawResult } from '../src/types';

describe('Jaccard Algorithm Plugin', () => {
  it('should be registered in algorithmRegistry', () => {
    const plugin = getAlgorithm(AlgoKey.JACCARD);
    expect(plugin).toBeDefined();
    expect(plugin?.key).toBe(AlgoKey.JACCARD);
    expect(plugin?.isStrictlyDeterministic).toBe(true);
    expect(plugin?.mathematicalBasis).toContain('Jaccard');
  });

  it('should compute valid scores in [0, 100] for standard history', () => {
    const mockHistory: DrawResult[] = [
      { id: '1', date: '2026-01-05', gagnants: [12, 25, 34, 48, 77], machine: [1, 2, 3, 4, 5], drawName: 'Reveil' },
      { id: '2', date: '2026-01-04', gagnants: [12, 18, 34, 52, 89], machine: [1, 2, 3, 4, 5], drawName: 'Reveil' },
      { id: '3', date: '2026-01-03', gagnants: [5, 25, 48, 61, 77], machine: [1, 2, 3, 4, 5], drawName: 'Reveil' },
      { id: '4', date: '2026-01-02', gagnants: [12, 25, 34, 48, 77], machine: [1, 2, 3, 4, 5], drawName: 'Reveil' },
    ];

    const ctx: any = {
      history: mockHistory,
      drawName: 'Reveil',
      deterministicSeed: 123456,
      statisticalBounds: { median: 5, q1: 2, q3: 8, variance: 3, kurtosis: 1.5, skewness: 0.2, shannonEntropy: 3.5, hurstExponent: 0.5 }
    };

    jaccardPlugin.precompute(ctx);
    expect(ctx.pluginCache[AlgoKey.JACCARD]).toBeDefined();

    for (let num = 1; num <= 90; num++) {
      const res = jaccardPlugin.evaluate(num, ctx);
      expect(res.score).toBeGreaterThanOrEqual(0);
      expect(res.score).toBeLessThanOrEqual(100);
      expect(Number.isNaN(res.score)).toBe(false);
      expect(res.confidence).toBeGreaterThan(0);
    }
  });

  it('should integrates seamlessly into calculateScores in scoringEngine', () => {
    const mockHistory: DrawResult[] = [
      { id: '1', date: '2026-01-05', gagnants: [10, 20, 30, 40, 50], machine: [1, 2, 3, 4, 5], drawName: 'Reveil' },
      { id: '2', date: '2026-01-04', gagnants: [10, 20, 31, 41, 51], machine: [1, 2, 3, 4, 5], drawName: 'Reveil' },
      { id: '3', date: '2026-01-03', gagnants: [1, 2, 3, 4, 5], machine: [1, 2, 3, 4, 5], drawName: 'Reveil' },
    ];

    const mockFeatures: any = {
      freqMap: new Float32Array(91).fill(5),
      gapsMap: new Int32Array(91).fill(2),
      markovMap: new Float32Array(91).fill(0.01),
      affinityMap: Array.from({ length: 91 }, () => new Float32Array(91).fill(0.01)),
      momentumMap: new Float32Array(91).fill(1),
      machineTransferMap: new Float32Array(91).fill(0),
      shadowProbabilityMap: new Float32Array(91).fill(0.5),
      networkCorrelationMap: new Float32Array(91).fill(0.2),
      interDrawMap: new Float32Array(91).fill(0.01)
    };

    const weights: any = {
      [AlgoKey.JACCARD]: 1.0,
      [AlgoKey.FREQUENCY]: 1.0,
      [AlgoKey.GAPS]: 1.0
    };

    const advancedMetrics: any = {
      statisticalBounds: { median: 5, q1: 2, q3: 8, variance: 3, kurtosis: 1.5, skewness: 0.2, shannonEntropy: 3.5, hurstExponent: 0.5 }
    };

    const results = calculateScores(mockFeatures, weights, advancedMetrics, mockHistory, 0.90, 'Reveil');
    expect(results).toHaveLength(90);
    expect(results[0].breakdown[AlgoKey.JACCARD]).toBeDefined();
    expect(results[0].breakdown[AlgoKey.JACCARD]).toBeGreaterThanOrEqual(0);
  });
});
