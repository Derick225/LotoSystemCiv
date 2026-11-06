import { describe, it, expect, vi } from 'vitest';
import { runSimulatedAnnealingOptimization } from '../src/services/simulatedAnnealingOptimizer';
import { DEFAULT_ALGO_WEIGHTS } from '../src/shared/prediction.types';
import * as lotteryService from '../src/services/lotteryService';

describe('SA-Tune Simulated Annealing Optimizer', () => {
  it('should run simulated annealing optimization and return updated 24-channel weights', async () => {
    const drawName = 'National';
    const mockHistory = lotteryService.generateDeterministicFallbackHistory(drawName);
    vi.spyOn(lotteryService, 'fetchResults').mockResolvedValue({ data: mockHistory, source: 'offline' } as any);

    const baseWeights = { ...DEFAULT_ALGO_WEIGHTS };

    const result = await runSimulatedAnnealingOptimization(drawName, baseWeights, {
      maxIterations: 20,
      historyDepth: 10
    });

    expect(result).toBeDefined();
    expect(result.bestWeights).toBeDefined();
    expect(Object.keys(result.bestWeights).length).toBeGreaterThanOrEqual(24);
    expect(typeof result.improvement).toBe('number');
    expect(typeof result.finalScore).toBe('number');
  });
});
