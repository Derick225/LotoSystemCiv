import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNexusStore } from '../src/store/useNexusStore';
import { executeClosedLoopAutoAdjustment } from '../src/services/prediction/closedLoopAutopsyService';
import { getAlgoWeights, saveAlgoWeights } from '../src/services/prediction/weightsManager';
import { lotteryService } from '../src/services/lotteryService';
import { logger } from '../src/utils/logger';
import { AlgoKey, DEFAULT_ALGO_WEIGHTS } from '../src/shared/prediction.types';
import type { DrawResult } from '../src/types';

const makeHistory = (drawName: string, count: number): DrawResult[] => {
  let seed = 20261128;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const draws: DrawResult[] = [];
  for (let i = 0; i < count; i++) {
    const picked = new Set<number>();
    while (picked.size < 5) {
      picked.add(1 + Math.floor(nextRand() * 90));
    }
    const day = 28 - (i % 28);
    const month = 1 + Math.floor(i / 28);
    draws.push({
      id: `${drawName}_draw_${i}`,
      drawName,
      date: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/2026`,
      gagnants: Array.from(picked).sort((a, b) => a - b),
      machine: [1, 2, 3, 4, 5],
    });
  }
  return draws;
};

describe('Autonomous Agent Store Memory, Closed-Loop Idempotence & Loto 5/90 Guard', () => {
  beforeEach(() => {
    useNexusStore.setState({ lastProcessedAutonomousDrawByDraw: {} });
  });

  it('mémorise le dernier tirage traité par tirage dans useNexusStore', () => {
    const { markAutonomousDrawProcessed } = useNexusStore.getState();

    markAutonomousDrawProcessed('national', 'NATIONAL::id_10::28/01/2026::rep_1');
    markAutonomousDrawProcessed('ETOILE', 'ETOILE::id_20::28/01/2026::rep_2');
    markAutonomousDrawProcessed('', 'ignored');
    markAutonomousDrawProcessed('NATIONAL', '');

    const stored = useNexusStore.getState().lastProcessedAutonomousDrawByDraw;
    expect(stored['NATIONAL']).toBe('NATIONAL::id_10::28/01/2026::rep_1');
    expect(stored['ETOILE']).toBe('ETOILE::id_20::28/01/2026::rep_2');
    expect(Object.keys(stored)).toHaveLength(2);
  });

  it('empêche executeClosedLoopAutoAdjustment de retraiter le même tirage et d’écraser les poids', async () => {
    const drawName = 'IDEMPOTENCE_TEST_DRAW';
    const history = makeHistory(drawName, 22);

    const firstResult = await executeClosedLoopAutoAdjustment(
      drawName,
      0,
      history,
      DEFAULT_ALGO_WEIGHTS,
      { dryRun: false }
    );

    expect(firstResult.appliedDirectly).toBe(true);
    expect(firstResult.idempotentHit).toBe(false);

    // Simuler une modification manuelle/ultérieure des poids en production (à l'échelle simplexe)
    const { normalizeWeights } = await import('../src/services/prediction/weightsManager');
    const baseNormalized = normalizeWeights(DEFAULT_ALGO_WEIGHTS);
    const sentinelWeights = normalizeWeights({
      ...baseNormalized,
      [AlgoKey.SPECTRAL]: 0.28,
      [AlgoKey.FREQUENCY]: 0.02,
    });
    await saveAlgoWeights(drawName, sentinelWeights);
    const savedSentinel = await getAlgoWeights(drawName);

    // Second appel pour le même tirage : doit déclencher l'idempotence sans écraser savedSentinel
    const secondResult = await executeClosedLoopAutoAdjustment(
      drawName,
      0,
      history,
      savedSentinel,
      { dryRun: false }
    );

    expect(secondResult.idempotentHit).toBe(true);
    expect(secondResult.appliedDirectly).toBe(false);
    expect(secondResult.learningRate).toBe(0);
    expect(
      secondResult.causalAuditTrail.some((line) => line.includes('Idempotence'))
    ).toBe(true);

    const activeWeightsAfterDuplicate = await getAlgoWeights(drawName);
    expect(activeWeightsAfterDuplicate[AlgoKey.SPECTRAL]).toBeCloseTo(savedSentinel[AlgoKey.SPECTRAL], 6);
    expect(activeWeightsAfterDuplicate[AlgoKey.FREQUENCY]).toBeCloseTo(savedSentinel[AlgoKey.FREQUENCY], 6);
    expect(activeWeightsAfterDuplicate[AlgoKey.SPECTRAL]).not.toBeCloseTo(
      firstResult.optimizedWeights[AlgoKey.SPECTRAL],
      3
    );

    // Un tirage différent (index 1) doit être traité normalement
    const differentDrawResult = await executeClosedLoopAutoAdjustment(
      drawName,
      1,
      history,
      sentinelWeights,
      { dryRun: false }
    );
    expect(differentDrawResult.idempotentHit).toBe(false);
    expect(differentDrawResult.appliedDirectly).toBe(true);

    // allowDuplicateDraw: true contourne explicitement le verrou d'idempotence si demandé
    const forcedResult = await executeClosedLoopAutoAdjustment(
      drawName,
      0,
      history,
      sentinelWeights,
      { dryRun: false, allowDuplicateDraw: true }
    );
    expect(forcedResult.idempotentHit).toBe(false);
    expect(forcedResult.appliedDirectly).toBe(true);
  });

  it('ignore silencieusement "Loto 5/90" et les noms vides dans lotteryService.fetchHistory sans émettre de warning', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');

    const resPlaceholder = await lotteryService.fetchHistory('Loto 5/90');
    const resPlaceholderCase = await lotteryService.fetchHistory('  loto 5/90 ');
    const resEmpty = await lotteryService.fetchHistory('');
    const resWhitespace = await lotteryService.fetchHistory('   ');

    expect(resPlaceholder).toEqual([]);
    expect(resPlaceholderCase).toEqual([]);
    expect(resEmpty).toEqual([]);
    expect(resWhitespace).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
