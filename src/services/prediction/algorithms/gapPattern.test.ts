import { describe, it, expect } from 'vitest';
import { gapPatternPlugin } from './gapPattern';
import { AlgoKey } from '../../../shared/prediction.types';
import { DrawResult } from '../../../types';
import { createAlgorithmTestContext } from './testFixtures';

describe('Algorithm - Processus de Hawkes (Excitation Mutuelle)', () => {
  it('should behave as a stable, deterministic plugin matching type structures', () => {
    expect(gapPatternPlugin.key).toBe(AlgoKey.GAP_PATTERN);
    expect(gapPatternPlugin.isStrictlyDeterministic).toBe(true);
    expect(gapPatternPlugin.category).toBe('advanced');
  });

  it('should gracefully return neutral fallback when history is insufficient', () => {
    // Under 5 draws, it must handle lack of history gracefully
    const history: DrawResult[] = [
      { id: '1', date: '2026-01-01', gagnants: [5, 12, 18, 45, 88], machine: [], drawName: 'TEST' },
      { id: '2', date: '2026-01-02', gagnants: [5, 14, 20, 46, 89], machine: [], drawName: 'TEST' },
    ];

    const ctx = createAlgorithmTestContext(history);

    // Precompute
    gapPatternPlugin.precompute(ctx);

    // Verify cache structure
    const cache = ctx.pluginCache?.[AlgoKey.GAP_PATTERN];
    expect(cache).toBeDefined();

    // Evaluate
    const evaluation = gapPatternPlugin.evaluate(5, ctx);
    expect(evaluation.score).toBe(50);
    expect(evaluation.confidence).toBe(0.1);
    expect(evaluation.metadata.hawkesIntensity).toBe(0);
    expect(evaluation.metadata.model).toBe('Multivariate Hawkes Point Process');
  });

  it('should accurately compute Hawkes mutual excitation intensities when sufficient history exists', () => {
    const history: DrawResult[] = Array.from({ length: 30 }, (_, idx) => {
      const isAppearance = [5, 11, 17, 23, 29].includes(idx);
      return {
        id: `draw-${idx}`,
        date: `2026-01-${idx + 1}`,
        gagnants: isAppearance ? [5, 10, 20, 30, 40] : [1, 2, 3, 4, 6],
        machine: [],
        drawName: 'TEST',
      };
    });

    const gapsMap = new Int32Array(91);
    gapsMap[5] = 5;
    const ctx = createAlgorithmTestContext(history, gapsMap);

    gapPatternPlugin.precompute(ctx);

    const cache = ctx.pluginCache?.[AlgoKey.GAP_PATTERN];
    expect(cache).toBeDefined();
    expect(cache.intensities).toBeDefined();
    expect(cache.scores).toBeDefined();

    const evaluation = gapPatternPlugin.evaluate(5, ctx);
    expect(evaluation.score).toBeDefined();
    expect(evaluation.score).toBeGreaterThanOrEqual(0);
    expect(evaluation.score).toBeLessThanOrEqual(100);
    expect(evaluation.confidence).toBeGreaterThan(0.1);
    expect(evaluation.metadata.hawkesIntensity).toBeGreaterThan(0);
    expect(evaluation.metadata.model).toBe('Multivariate Hawkes Point Process');
  });
});
