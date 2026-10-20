import { describe, it, expect } from 'vitest';
import {
  executeClosedLoopAutopsy,
  executeBatchClosedLoopAutopsy,
} from '../src/services/prediction/closedLoopAutopsyService';
import { AlgoKey, DEFAULT_ALGO_WEIGHTS } from '../src/shared/prediction.types';
import type { DrawResult } from '../src/types';

const drawName = 'NATIONAL_CAUSAL_CONTRACT';
const mockHistory: DrawResult[] = [
  { id: '1', date: '22/01/2026', drawName, gagnants: [12, 24, 36, 48, 60], machine: [1, 2, 3, 4, 5] },
  { id: '2', date: '15/01/2026', drawName, gagnants: [11, 23, 35, 47, 59], machine: [6, 7, 8, 9, 10] },
  { id: '3', date: '08/01/2026', drawName, gagnants: [10, 22, 34, 46, 58], machine: [15, 16, 17, 18, 19] },
  { id: '4', date: '01/01/2026', drawName, gagnants: [12, 25, 36, 49, 70], machine: [20, 21, 22, 23, 24] },
  { id: '5', date: '25/12/2025', drawName, gagnants: [5, 15, 25, 35, 45], machine: [30, 31, 32, 33, 34] },
];

const VALID_KEYS = Object.values(AlgoKey);

describe('Contrat — Attribution Causale intégrée à l’autopsie en boucle fermée', () => {
  it('l’autopsie publie l’attribution causale complète, normalisée et sans NaN', async () => {
    const report = await executeClosedLoopAutopsy(drawName, 0, mockHistory, DEFAULT_ALGO_WEIGHTS);

    expect(report.channelAttribution).toBeDefined();
    const attribution = report.channelAttribution!;
    expect(attribution).toHaveLength(VALID_KEYS.length);

    const importanceSum = attribution.reduce((a, i) => a + i.causalImportanceScore, 0);
    expect(importanceSum).toBeCloseTo(1.0, 9);

    attribution.forEach((impact, idx) => {
      expect(impact.causalRank).toBe(idx + 1);
      expect(Number.isFinite(impact.causalImportanceScore)).toBe(true);
      expect(impact.causalImportanceScore).toBeGreaterThan(0);
      expect(impact.causalImportanceScore).toBeLessThanOrEqual(1);
      expect(impact.additiveShareTop5).toBeGreaterThanOrEqual(0);
      expect(impact.additiveShareTop5).toBeLessThanOrEqual(1);
      expect(impact.additiveShareWinners).toBeGreaterThanOrEqual(0);
      expect(impact.additiveShareWinners).toBeLessThanOrEqual(1);
      expect(Number.isFinite(impact.deltaHitsTop5Ablation)).toBe(true);
      expect(Number.isFinite(impact.deltaBrierAblation)).toBe(true);
      expect(impact.narrative.length).toBeGreaterThan(0);
      expect(impact.label.length).toBeGreaterThan(0);
    });

    // Le rang 1 possède le score d'importance maximal
    expect(attribution[0].causalImportanceScore).toBeGreaterThanOrEqual(
      attribution[attribution.length - 1].causalImportanceScore
    );

    // La synthèse narrative intègre le moteur causal
    expect(report.summaryRemark).toContain('Moteur causal dominant');
  });

  it('garantit le déterminisme strict de l’attribution entre deux exécutions', async () => {
    const run1 = await executeClosedLoopAutopsy(drawName, 0, mockHistory, DEFAULT_ALGO_WEIGHTS);
    const run2 = await executeClosedLoopAutopsy(drawName, 0, mockHistory, DEFAULT_ALGO_WEIGHTS);
    expect(JSON.stringify(run1.channelAttribution)).toEqual(JSON.stringify(run2.channelAttribution));
  });

  it('agrège l’attribution causale sur un lot avec moyennes cohérentes', async () => {
    const batch = await executeBatchClosedLoopAutopsy(drawName, mockHistory, DEFAULT_ALGO_WEIGHTS, 3);

    expect(batch.aggregatedChannelAttribution).toBeDefined();
    expect(batch.aggregatedChannelAttribution.length).toBe(VALID_KEYS.length);

    const firstKey = batch.aggregatedChannelAttribution[0].key;
    const expectedMeanImportance =
      batch.reports.reduce((a, r) => {
        const impact = r.channelAttribution?.find((i) => i.key === firstKey);
        return a + (impact?.causalImportanceScore ?? 0);
      }, 0) / batch.batchSize;
    expect(batch.aggregatedChannelAttribution[0].meanCausalImportanceScore).toBeCloseTo(
      expectedMeanImportance,
      4
    );

    // Tri par importance causale décroissante
    for (let i = 1; i < batch.aggregatedChannelAttribution.length; i++) {
      expect(batch.aggregatedChannelAttribution[i - 1].meanCausalImportanceScore).toBeGreaterThanOrEqual(
        batch.aggregatedChannelAttribution[i].meanCausalImportanceScore
      );
    }
  });
});
