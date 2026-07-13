import { describe, it, expect } from 'vitest';
import { gapTrendPlugin } from './gapTrend';
import { AlgorithmContext } from '../algorithmRegistry';
import { AlgoKey } from '../../../shared/prediction.types';
import { DrawResult } from '../../../types';

describe('Algorithm - Gap Trend Projector', () => {
  it('should behave as a stable, deterministic plugin matching type structures', () => {
    expect(gapTrendPlugin.key).toBe(AlgoKey.GAP_TREND);
    expect(gapTrendPlugin.isStrictlyDeterministic).toBe(true);
    expect(gapTrendPlugin.category).toBe('advanced');
    expect(gapTrendPlugin.stability).toBe('stable');
    expect(gapTrendPlugin.mathematicalBasis).toContain('Holt');
  });

  it('should accurately compute double exponential smoothing and projections with sufficient history', () => {
    // We create a history of 40 draws.
    // Let's make sure the number 5 is drawn with a predictable increasing gap.
    // Example gaps for number 5:
    // Draw 0: contains 5
    // Draw 2: contains 5 (gap = 2)
    // Draw 5: contains 5 (gap = 3)
    // Draw 9: contains 5 (gap = 4)
    // Draw 14: contains 5 (gap = 5)
    // Draw 20: contains 5 (gap = 6)
    // Draw 27: contains 5 (gap = 7)
    // All other draws don't contain 5.
    const appearanceDraws = [0, 2, 5, 9, 14, 20, 27]; // 7 appearances -> 6 complete gaps: 2, 3, 4, 5, 6, 7

    const history: DrawResult[] = Array.from({ length: 40 }, (_, idx) => {
      const winners = appearanceDraws.includes(idx) ? [5, 10, 20, 30, 40] : [11, 12, 13, 14, 15];
      return {
        id: `draw-${idx}`,
        date: `2026-01-${String(idx + 1).padStart(2, '0')}`,
        gagnants: winners,
        machine: [],
        draw_name: 'TEST',
      };
    });

    const gapsMap: Record<number, number> = {};
    for (let i = 1; i <= 90; i++) {
      gapsMap[i] = 13; // simulated current open gap of 13 for all numbers
    }

    const ctx: AlgorithmContext = {
      history,
      features: {
        gapsMap,
        freqMap: Array(91).fill(1),
      },
      statisticalBounds: {
        hurstExponent: 0.5,
      },
      pluginCache: {},
    };

    gapTrendPlugin.precompute(ctx);

    const cache = ctx.pluginCache?.[AlgoKey.GAP_TREND];
    expect(cache).toBeDefined();
    expect(cache.perNumberAnalysis).toBeDefined();

    const analysisForFive = cache.perNumberAnalysis[5];
    expect(analysisForFive).toBeDefined();
    expect(analysisForFive.hasPattern).toBe(true);
    expect(analysisForFive.numGaps).toBe(6); // 6 completed gaps
    expect(analysisForFive.projectedNextGap).toBeGreaterThan(0);
    // Gaps sequence in order of appearance (chrono): 7, 6, 5, 4, 3, 2
    // We expect the trend direction to be negative (gap values are decreasing, i.e., accelerating appearance)
    expect(analysisForFive.trendDirection).toBeLessThan(0);

    // Let's evaluate the score
    const evaluation = gapTrendPlugin.evaluate(5, ctx);
    expect(evaluation.score).toBeGreaterThanOrEqual(0);
    expect(evaluation.score).toBeLessThanOrEqual(100);
    expect(evaluation.confidence).toBeGreaterThanOrEqual(0.3);
    expect(evaluation.confidence).toBeLessThanOrEqual(0.95);
    expect(evaluation.metadata.currentOpenGap).toBe(0); // number 5 appeared at index 0, so currentOpenGap is 0
    expect(evaluation.metadata.projectedNextGap).toBe(analysisForFive.projectedNextGap);
    expect(evaluation.metadata.trend).toBe('raccourcissement');
  });

  it('should handle numbers with insufficient appearances gracefully', () => {
    // History where 5 only appears once (insufficient for double exponential smoothing)
    const history: DrawResult[] = Array.from({ length: 45 }, (_, idx) => {
      const winners = idx === 0 ? [5, 10, 20, 30, 40] : [11, 12, 13, 14, 15];
      return {
        id: `draw-${idx}`,
        date: `2026-01-${String(idx + 1).padStart(2, '0')}`,
        gagnants: winners,
        machine: [],
        draw_name: 'TEST',
      };
    });

    const ctx: AlgorithmContext = {
      history,
      features: {
        gapsMap: Array(91).fill(10),
        freqMap: Array(91).fill(1),
      },
      statisticalBounds: {
        hurstExponent: 0.5,
      },
      pluginCache: {},
    };

    gapTrendPlugin.precompute(ctx);

    const evaluation = gapTrendPlugin.evaluate(5, ctx);
    expect(evaluation.score).toBe(50);
    expect(evaluation.confidence).toBe(0.3);
    expect(evaluation.metadata.hasPattern).toBe(false);
  });
});
