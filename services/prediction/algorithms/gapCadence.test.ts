import { describe, it, expect } from 'vitest';
import { gapCadencePlugin } from './gapCadence';
import { AlgorithmContext } from '../algorithmRegistry';
import { AlgoKey } from '../../../shared/prediction.types';
import { DrawResult } from '../../../types';

describe('Algorithm - Gap Cadence', () => {
  it('should behave as a stable, deterministic plugin matching type structures', () => {
    expect(gapCadencePlugin.key).toBe(AlgoKey.GAP_CADENCE);
    expect(gapCadencePlugin.isStrictlyDeterministic).toBe(true);
    expect(gapCadencePlugin.category).toBe('advanced');
  });

  it('should accurately compute pool distributions and Tukey fences with sufficient history', () => {
    // Let's craft an artificial history of 40 draws.
    // Each draw has 5 winners.
    const history: DrawResult[] = Array.from({ length: 40 }, (_, idx) => {
      // Create a predictable pattern of winners
      const winners = [
        ((idx * 5) % 90) + 1,
        ((idx * 5 + 1) % 90) + 1,
        ((idx * 5 + 2) % 90) + 1,
        ((idx * 5 + 3) % 90) + 1,
        ((idx * 5 + 4) % 90) + 1,
      ];
      return {
        id: `draw-${idx}`,
        date: `2026-01-${idx + 1}`,
        gagnants: winners,
        machine: [],
        draw_name: 'TEST',
      };
    });

    const gapsMap: Record<number, number> = {};
    for (let i = 1; i <= 90; i++) {
      gapsMap[i] = 12; // simulated current gap of 12 for all numbers
    }

    const ctx: AlgorithmContext = {
      history,
      features: {
        gapsMap,
        freqMap: Array(91).fill(1), // simulated frequency map
      },
      statisticalBounds: {
        hurstExponent: 0.5,
      },
      pluginCache: {},
    };

    gapCadencePlugin.precompute(ctx);

    const cache = ctx.pluginCache?.[AlgoKey.GAP_CADENCE];
    expect(cache).toBeDefined();
    expect(cache.tukeyUpperFence).toBeGreaterThan(0);
    expect(cache.cadenceIntensity).toBeGreaterThanOrEqual(0);
    expect(cache.cadenceIntensity).toBeLessThanOrEqual(1);
    expect(cache.sortedPooled.length).toBeGreaterThan(0);

    // Let's evaluate a specific number
    const evaluation = gapCadencePlugin.evaluate(5, ctx);
    expect(evaluation.score).toBeGreaterThanOrEqual(0);
    expect(evaluation.score).toBeLessThanOrEqual(100);
    expect(evaluation.confidence).toBeGreaterThanOrEqual(0.4);
    expect(evaluation.confidence).toBeLessThanOrEqual(0.9);
    expect(evaluation.metadata.currentGap).toBe(12);
    expect(evaluation.metadata.percentileScore).toBeDefined();
    expect(evaluation.metadata.cadenceIntensity).toBeDefined();
    expect(evaluation.metadata.tukeyUpperFence).toBeDefined();
  });
});
