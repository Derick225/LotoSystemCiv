import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildPredictionRequestContext,
  computeContinuousRegimeExcursion,
  generateMasterPrediction,
  generateMasterPredictionCore,
  resolvePredictionWeights,
} from '../src/services/prediction/predictionOrchestrator';
import { applyPCADenoising, ScoredNumber } from '../src/services/prediction/scoringEngine';
import {
  calculateCombinationEnergyDetailed,
  generateCombination,
} from '../src/services/prediction/combinationGenerator';
import {
  AlgoKey,
  DEFAULT_ALGO_WEIGHTS,
  FALLBACK_CALIBRATION,
  RETIRED_ALGO_WEIGHT_KEYS,
} from '../src/shared/prediction.types';
import { DrawResult } from '../src/types';
import { globalCache } from '../src/services/cache/CacheService';

const buildDeterministicHistory = (
  drawName: string,
  count: number,
  includeMachine: boolean = false,
): DrawResult[] => {
  const draws: DrawResult[] = [];
  for (let i = 0; i < count; i++) {
    const base = (i * 7) % 85;
    const gagnants = [
      1 + (base % 18),
      19 + ((base + i * 3) % 18),
      37 + ((base + i * 5) % 18),
      55 + ((base + i * 11) % 18),
      73 + ((base + i * 13) % 18),
    ].sort((a, b) => a - b);

    draws.push({
      id: `${drawName}-${i}`,
      drawName,
      date: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
      gagnants,
      ...(includeMachine
        ? {
            machine: gagnants.map((n) => ((n + 17) % 90) + 1).sort((a, b) => a - b),
          }
        : {}),
    });
  }
  return draws;
};

describe('Différenciation stratégique : Sélection Optimale vs Inférence Hybride', () => {
  beforeEach(async () => {
    await globalCache.clearAll();
  });

  it('résout des poids distincts et respecte le simplexe + règle MACHINE_TRANSFER = 0 sans colonne machine', async () => {
    const historyNoMachine = buildDeterministicHistory('REVEIL', 30, false);

    const ctxOptimal = buildPredictionRequestContext(
      'REVEIL',
      historyNoMachine,
      30,
      undefined,
      undefined,
      undefined,
      false,
      false,
      undefined,
      false,
      undefined,
      undefined,
      true,
      false,
      'optimal_selection',
    );
    const ctxHybrid = buildPredictionRequestContext(
      'REVEIL',
      historyNoMachine,
      30,
      undefined,
      undefined,
      undefined,
      false,
      false,
      undefined,
      false,
      undefined,
      undefined,
      true,
      false,
      'hybrid_inference',
    );

    const wOpt = await resolvePredictionWeights(ctxOptimal);
    const wHyb = await resolvePredictionWeights(ctxHybrid);

    expect(wOpt[AlgoKey.MACHINE_TRANSFER]).toBe(0);
    expect(wHyb[AlgoKey.MACHINE_TRANSFER]).toBe(0);

    RETIRED_ALGO_WEIGHT_KEYS.forEach((rk) => {
      expect(wOpt[rk]).toBe(0);
      expect(wHyb[rk]).toBe(0);
    });

    const sumOpt = Object.values(wOpt).reduce((a, b) => a + b, 0);
    const sumHyb = Object.values(wHyb).reduce((a, b) => a + b, 0);
    expect(sumOpt).toBeCloseTo(1.0, 5);
    expect(sumHyb).toBeCloseTo(1.0, 5);

    const maxWeightDiff = Object.values(AlgoKey).reduce(
      (maxD, key) => Math.max(maxD, Math.abs((wOpt[key] || 0) - (wHyb[key] || 0))),
      0,
    );
    expect(maxWeightDiff).toBeGreaterThan(1e-4);
  });

  it('module continûment le lissage PCA via regimePreservationFactor pour préserver les pics de phase', async () => {
    const scores: ScoredNumber[] = Array.from({ length: 90 }, (_, idx) => {
      const num = idx + 1;
      const peak = num === 17 || num === 73 ? 98 : 40 + (num % 25);
      return {
        num,
        score: peak,
        breakdown: {
          [AlgoKey.FREQUENCY]: peak,
          [AlgoKey.SPECTRAL]: (num * 13) % 100,
          [AlgoKey.GAPS]: (91 - num) % 100,
          [AlgoKey.FRACTAL]: 35 + ((num * 7) % 60),
        },
        explainability: {
          shapValues: {},
          topologicalTension: 0,
          dnaOrbitingIndex: 0,
          effectiveWeights: { ...DEFAULT_ALGO_WEIGHTS },
        },
      };
    });

    const scoresA: ScoredNumber[] = scores.map((s) => ({
      ...s,
      breakdown: { ...s.breakdown },
      explainability: {
        shapValues: {},
        topologicalTension: 0,
        dnaOrbitingIndex: 0,
        effectiveWeights: { ...DEFAULT_ALGO_WEIGHTS },
      },
    }));
    const scoresB: ScoredNumber[] = scores.map((s) => ({
      ...s,
      breakdown: { ...s.breakdown },
      explainability: {
        shapValues: {},
        topologicalTension: 0,
        dnaOrbitingIndex: 0,
        effectiveWeights: { ...DEFAULT_ALGO_WEIGHTS },
      },
    }));

    const outFullPca = await applyPCADenoising(scoresA, DEFAULT_ALGO_WEIGHTS, undefined, 0.9, 0.0);
    const outHybridPca = await applyPCADenoising(scoresB, DEFAULT_ALGO_WEIGHTS, undefined, 0.9, 0.55);

    const diffBreakdown = outFullPca.reduce((acc, item) => {
      const match = outHybridPca.find((x) => x.num === item.num);
      return (
        acc +
        Math.abs((item.breakdown[AlgoKey.FREQUENCY] ?? 0) - (match?.breakdown[AlgoKey.FREQUENCY] ?? 0))
      );
    }, 0);
    expect(diffBreakdown).toBeGreaterThan(0);
  });

  it("différencie l'énergie combinatoire et reste 100% déterministe pour chaque stratégie", async () => {
    const sortedScores: ScoredNumber[] = Array.from({ length: 90 }, (_, i) => {
      const num = i + 1;
      return {
        num,
        score: 50 + 40 * Math.cos(num * 0.23),
        breakdown: {
          [AlgoKey.FREQUENCY]: 40 + ((num * 11) % 60),
          [AlgoKey.SPECTRAL]: 30 + ((num * 17) % 70),
          [AlgoKey.GAPS]: 25 + ((num * 5) % 75),
          [AlgoKey.FRACTAL]: 20 + ((num * 19) % 80),
        },
      };
    }).sort((a, b) => b.score - a.score);

    const affinityMap: Float32Array[] = Array.from({ length: 91 }, (_, i) => {
      const row = new Float32Array(91);
      for (let j = 1; j <= 90; j++) {
        row[j] = 0.05 + 0.04 * Math.sin((i + j) * 0.31);
      }
      return row;
    });

    const scoresMap = new Map(sortedScores.map((s) => [s.num, s.score]));
    const bdMap = new Map(sortedScores.map((s) => [s.num, s.breakdown!]));
    const sampleCombo = [4, 5, 6, 48, 88];

    const eOpt = calculateCombinationEnergyDetailed(
      sampleCombo,
      scoresMap,
      affinityMap,
      FALLBACK_CALIBRATION,
      [1, 20, 40, 60, 80],
      bdMap,
      sortedScores.slice(0, 72).map((s) => s.num),
      1,
    );
    const hybridOpts = {
      strategy: 'hybrid_inference' as const,
      equilibriumGain: 0.65,
      diversityGain: 1.75,
      outsiderPenaltyGain: 1.5,
      explorationBoost: 1.75,
      strategyTag: 'hybrid_inference',
    };
    const eHyb = calculateCombinationEnergyDetailed(
      sampleCombo,
      scoresMap,
      affinityMap,
      FALLBACK_CALIBRATION,
      [1, 20, 40, 60, 80],
      bdMap,
      sortedScores.slice(0, 72).map((s) => s.num),
      1,
      undefined,
      hybridOpts,
    );

    expect(eHyb.totalEnergy).not.toBeCloseTo(eOpt.totalEnergy, 4);

    const comboOpt1 = await generateCombination(
      sortedScores,
      affinityMap,
      FALLBACK_CALIBRATION,
      1,
      [1, 20, 40, 60, 80],
      0.4,
      0.58,
    );
    const comboOpt2 = await generateCombination(
      sortedScores,
      affinityMap,
      FALLBACK_CALIBRATION,
      1,
      [1, 20, 40, 60, 80],
      0.4,
      0.58,
    );
    const comboHyb1 = await generateCombination(
      sortedScores,
      affinityMap,
      FALLBACK_CALIBRATION,
      1.6,
      [1, 20, 40, 60, 80],
      0.4,
      0.58,
      hybridOpts,
    );
    const comboHyb2 = await generateCombination(
      sortedScores,
      affinityMap,
      FALLBACK_CALIBRATION,
      1.6,
      [1, 20, 40, 60, 80],
      0.4,
      0.58,
      hybridOpts,
    );

    expect(comboOpt1).toEqual(comboOpt2);
    expect(comboHyb1).toEqual(comboHyb2);
  });

  it('produit deux prédictions tracées, déterministes et isolées en cache via generateMasterPrediction / Core', async () => {
    const history = buildDeterministicHistory('REVEIL', 32, false);
    const { excursion } = computeContinuousRegimeExcursion(history);
    expect(excursion).toBeGreaterThan(0);
    expect(excursion).toBeLessThan(1);

    const predOpt1 = await generateMasterPredictionCore(
      'REVEIL',
      history,
      32,
      undefined,
      undefined,
      undefined,
      false,
      false,
      undefined,
      false,
      true,
      undefined,
      undefined,
      'optimal_selection',
    );
    const predOpt2 = await generateMasterPredictionCore(
      'REVEIL',
      history,
      32,
      undefined,
      undefined,
      undefined,
      false,
      false,
      undefined,
      false,
      true,
      undefined,
      undefined,
      'optimal_selection',
    );

    const predHyb1 = await generateMasterPredictionCore(
      'REVEIL',
      history,
      32,
      undefined,
      undefined,
      undefined,
      false,
      false,
      undefined,
      false,
      true,
      undefined,
      undefined,
      'hybrid_inference',
    );
    const predHyb2 = await generateMasterPredictionCore(
      'REVEIL',
      history,
      32,
      undefined,
      undefined,
      undefined,
      false,
      false,
      undefined,
      false,
      true,
      undefined,
      undefined,
      'hybrid_inference',
    );

    // Déterminisme strict intra-stratégie
    expect(predOpt1.suggestedNumbers).toEqual(predOpt2.suggestedNumbers);
    expect(predOpt1.candidates).toEqual(predOpt2.candidates);
    expect(predHyb1.suggestedNumbers).toEqual(predHyb2.suggestedNumbers);
    expect(predHyb1.candidates).toEqual(predHyb2.candidates);

    // Traçabilité explicite
    expect(predOpt1.predictionStrategy).toBe('optimal_selection');
    expect(predHyb1.predictionStrategy).toBe('hybrid_inference');
    expect(predOpt1.analysis).toContain('Sélection Optimale');
    expect(predHyb1.analysis).toContain('Inférence Hybride');

    // Simplexe marginal invariant (somme = 5.0) et aucun NaN
    const sumProbOpt = Object.values(predOpt1.numberProbabilities || {}).reduce((a, b) => a + b, 0);
    const sumProbHyb = Object.values(predHyb1.numberProbabilities || {}).reduce((a, b) => a + b, 0);
    expect(sumProbOpt).toBeCloseTo(5.0, 5);
    expect(sumProbHyb).toBeCloseTo(5.0, 5);

    // Divergence des poids effectifs entre stratégies
    const wOpt = predOpt1.walkForwardCalibration?.channelWeights || {};
    const wHyb = predHyb1.walkForwardCalibration?.channelWeights || {};
    const maxChanDiff = Object.keys(wOpt).reduce(
      (m, k) => Math.max(m, Math.abs((wOpt[k] ?? 0) - (wHyb[k] ?? 0))),
      0,
    );
    expect(maxChanDiff).toBeGreaterThan(1e-4);

    // Isolation stricte du cache dans generateMasterPrediction
    const cachedOpt = await generateMasterPrediction(
      'REVEIL',
      history,
      32,
      undefined,
      undefined,
      undefined,
      false,
      false,
      undefined,
      false,
      undefined,
      undefined,
      true,
      false,
      'optimal_selection',
    );
    const cachedHyb = await generateMasterPrediction(
      'REVEIL',
      history,
      32,
      undefined,
      undefined,
      undefined,
      false,
      false,
      undefined,
      false,
      undefined,
      undefined,
      true,
      false,
      'hybrid_inference',
    );
    expect(cachedOpt.predictionStrategy).toBe('optimal_selection');
    expect(cachedHyb.predictionStrategy).toBe('hybrid_inference');
  });
});
