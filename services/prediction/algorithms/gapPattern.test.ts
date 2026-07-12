import { describe, it, expect } from 'vitest';
import { gapPatternPlugin } from './gapPattern';
import { AlgorithmContext } from '../algorithmRegistry';
import { AlgoKey } from '../../../shared/prediction.types';
import { DrawResult } from '../../../types';

describe('Algorithm - Gap Pattern (AR(1))', () => {
  it('should behave as a stable, deterministic plugin matching type structures', () => {
    expect(gapPatternPlugin.key).toBe(AlgoKey.GAP_PATTERN);
    expect(gapPatternPlugin.isStrictlyDeterministic).toBe(true);
    expect(gapPatternPlugin.category).toBe('advanced');
  });

  it('should gracefully return neutral fallback when history is insufficient', () => {
    // Under 3 gaps (meaning < 4 draws), it must handle lack of history gracefully
    const history: DrawResult[] = [
      { id: '1', date: '2026-01-01', gagnants: [5, 12, 18, 45, 88], machine: [], draw_name: 'TEST' },
      { id: '2', date: '2026-01-02', gagnants: [5, 14, 20, 46, 89], machine: [], draw_name: 'TEST' },
    ];

    const ctx: AlgorithmContext = {
      history,
      features: {
        gapsMap: {},
        freqMap: [],
      },
      statisticalBounds: {
        hurstExponent: 0.5,
      },
      pluginCache: {},
    };

    // Precompute
    gapPatternPlugin.precompute(ctx);

    // Verify cache structure
    const cache = ctx.pluginCache?.[AlgoKey.GAP_PATTERN];
    expect(cache).toBeDefined();
    expect(cache.perNumberAnalysis[5].hasPattern).toBe(false);

    // Evaluate
    const evaluation = gapPatternPlugin.evaluate(5, ctx);
    expect(evaluation.score).toBe(50);
    expect(evaluation.confidence).toBe(0.3);
    expect(evaluation.metadata.hasPattern).toBe(false);
  });

  it('should accurately compute AR(1) and auto-correlation when sufficient history exists', () => {
    // Generate artificial history with a clear rhythmic gap pattern for number 5.
    // Let's make number 5 appear at specific indexes.
    // Chronological order (oldest to newest):
    // Let's say history is 30 elements long (index 0 to 29).
    // Let's place number 5 at indexes 29, 23, 17, 11, 5.
    // The gaps between consecutive appearances (oldest to newest):
    // chronological index sequence of appearances: 29, 23, 17, 11, 5.
    // gaps (chronoAppearances[i-1] - chronoAppearances[i] - 1):
    // 29 - 23 - 1 = 5
    // 23 - 17 - 1 = 5
    // 17 - 11 - 1 = 5
    // 11 - 5 - 1 = 5
    // gapSeq: [5, 5, 5, 5]
    // The current open gap at the end (newest index 0) is 5.
    
    const history: DrawResult[] = Array.from({ length: 30 }, (_, idx) => {
      const isAppearance = [5, 11, 17, 23, 29].includes(idx);
      return {
        id: `draw-${idx}`,
        date: `2026-01-${idx + 1}`,
        gagnants: isAppearance ? [5, 10, 20, 30, 40] : [1, 2, 3, 4, 6],
        machine: [],
        draw_name: 'TEST',
      };
    });

    const ctx: AlgorithmContext = {
      history,
      features: {
        gapsMap: { '5': 5 },
        freqMap: [],
      },
      statisticalBounds: {
        hurstExponent: 0.5,
      },
      pluginCache: {},
    };

    gapPatternPlugin.precompute(ctx);

    const cache = ctx.pluginCache?.[AlgoKey.GAP_PATTERN];
    expect(cache).toBeDefined();
    
    const numAnalysis = cache.perNumberAnalysis[5];
    expect(numAnalysis.hasPattern).toBe(true);
    expect(numAnalysis.numGaps).toBe(4);
    expect(numAnalysis.meanGap).toBe(5);
    // Since gap sequence is [5, 5, 5, 5], variance is 0, so stdGap is 0, scaleForNormalization should be clamped to 1.0.
    expect(numAnalysis.scaleForNormalization).toBe(1.0);
    expect(numAnalysis.autocorrelation).toBe(0);

    const evaluation = gapPatternPlugin.evaluate(5, ctx);
    expect(evaluation.score).toBeDefined();
    expect(evaluation.score).toBeGreaterThanOrEqual(0);
    expect(evaluation.score).toBeLessThanOrEqual(100);
    expect(evaluation.confidence).toBeGreaterThan(0.3);
    expect(evaluation.metadata.hasPattern).toBe(true);
    expect(evaluation.metadata.personalMeanGap).toBe(5);
    expect(evaluation.metadata.sampleSize).toBe(4);
  });
});
