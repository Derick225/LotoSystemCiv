import { describe, expect, it } from 'vitest';
import { computeAdvancedMetrics } from './advancedMetricsCalculator';
import { DrawResult } from '../../types';

describe('Advanced metrics cache', () => {
  it('does not reuse cached metrics for histories with different interior draws', async () => {
    const makeHistory = (middleWinners: number[]): DrawResult[] =>
      Array.from({ length: 8 }, (_, index) => ({
        id: `cache-test-${index}`,
        date: `2026-01-${String(index + 1).padStart(2, '0')}`,
        drawName: 'CACHE_COLLISION_TEST',
        gagnants: index === 0
          ? [1, 2, 3, 4, 5]
          : index === 7
            ? [6, 7, 8, 9, 10]
            : middleWinners,
        machine: [],
      }));

    const firstHistory = makeHistory([11, 12, 13, 14, 15]);
    const secondHistory = makeHistory([51, 52, 53, 54, 55]);
    const firstMetrics = await computeAdvancedMetrics(firstHistory, 'CACHE_COLLISION_TEST');
    const secondMetrics = await computeAdvancedMetrics(secondHistory, 'CACHE_COLLISION_TEST');

    expect(secondMetrics.poisson).not.toEqual(firstMetrics.poisson);
  });
});
