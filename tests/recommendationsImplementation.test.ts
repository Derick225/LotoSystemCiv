import { describe, it, expect } from 'vitest';
import {
  runBayesianResonanceEngine,
  deriveRetrospectiveOptimalAlpha,
} from '../services/interDrawService';
import {
  analyzeInterDrawCooccurrences,
} from '../services/interDrawPatternService';
import {
  calculateDnaSieveWeights,
} from '../services/temporalAnalysisService';
import {
  computeCooccurrenceTensorHpc,
  computeCrossHawkesKernelHpc,
  computeRobustHurstHpc,
} from '../services/wasm/lotoEngineBridge';
import { DrawResult } from '../types';

describe('Vérification & Validation des 4 Recommandations Mathématiques', () => {
  const mockPairedPairs = [
    { predWinners: [5, 12, 28, 45, 78], targetWinners: [12, 33, 45, 60, 89] },
    { predWinners: [10, 20, 30, 40, 50], targetWinners: [10, 22, 33, 44, 55] },
    { predWinners: [1, 2, 3, 4, 5], targetWinners: [2, 14, 25, 36, 47] },
    { predWinners: [7, 17, 27, 37, 47], targetWinners: [8, 18, 28, 38, 48] },
    { predWinners: [9, 19, 29, 39, 49], targetWinners: [9, 19, 30, 40, 50] },
    { predWinners: [15, 25, 35, 45, 55], targetWinners: [16, 26, 36, 46, 56] },
    { predWinners: [3, 13, 23, 33, 43], targetWinners: [4, 14, 24, 34, 44] },
  ];

  it('Recommandation 1 : Auto-calibration en boucle fermée de alpha Laplace', () => {
    const retroAlpha = deriveRetrospectiveOptimalAlpha(mockPairedPairs);
    expect(retroAlpha).toBeDefined();
    expect(typeof retroAlpha).toBe('number');
    expect(retroAlpha!).toBeGreaterThan(0);
    expect(retroAlpha!).toBeLessThanOrEqual(1.5);

    // Exécution avec et sans alpha calibré
    const engineDefault = runBayesianResonanceEngine(mockPairedPairs, [5, 12, 28, 45, 78]);
    const engineCalibrated = runBayesianResonanceEngine(
      mockPairedPairs,
      [5, 12, 28, 45, 78],
      undefined,
      retroAlpha
    );

    expect(engineCalibrated.sampleSize).toBe(mockPairedPairs.length);
    expect(engineCalibrated.laplaceAlpha).toBeGreaterThan(0);
    expect(engineCalibrated.scoredCandidates.length).toBe(90);
  });

  it('Recommandation 2 : Accélération WASM pour le tenseur de cooccurrences', () => {
    const numDraws = mockPairedPairs.length;
    const predFlat = new Int32Array(numDraws * 5);
    const targetFlat = new Int32Array(numDraws * 5);
    for (let d = 0; d < numDraws; d++) {
      for (let c = 0; c < 5; c++) {
        predFlat[d * 5 + c] = mockPairedPairs[d].predWinners[c];
        targetFlat[d * 5 + c] = mockPairedPairs[d].targetWinners[c];
      }
    }

    const tensorRes = computeCooccurrenceTensorHpc(
      predFlat,
      targetFlat,
      numDraws,
      5,
      [5, 12, 28, 45, 78]
    );

    expect(tensorRes.targetPairHits.length).toBe(4005);
    expect(tensorRes.conditionedPairHits.length).toBe(4005);
    expect(tensorRes.dyadMatrix.length).toBe(91 * 91);
    expect(tensorRes.totalPairsEvaluated).toBeGreaterThan(0);

    // Analyse complète intégrant le bridge HPC
    const cooccReport = analyzeInterDrawCooccurrences(mockPairedPairs, [5, 12, 28, 45, 78]);
    expect(cooccReport).toBeDefined();
    expect(cooccReport.topConditionedPairs).toBeDefined();
    expect(Array.isArray(cooccReport.topConditionedPairs)).toBe(true);
  });

  it('Recommandation 3 : Divergence de Kullback-Leibler et Shrinkage de James-Stein dans le Tamis ADN', () => {
    const mockHistory: DrawResult[] = [];
    for (let i = 0; i < 30; i++) {
      mockHistory.push({
        id: `draw-${i}`,
        date: `2026-01-${(i + 1).toString().padStart(2, '0')}`,
        nom_tirage: 'Reveil',
        gagnants: [(i % 15) + 1, (i % 15) + 2, (i % 15) + 3, (i % 15) + 4, (i % 15) + 5],
        machine: [(i % 15) + 6, (i % 15) + 7, (i % 15) + 8, (i % 15) + 9, (i % 15) + 10],
      });
    }

    const dnaReport = calculateDnaSieveWeights(mockHistory, undefined, 'Reveil');
    expect(dnaReport.klDivergence).toBeDefined();
    expect(dnaReport.klDivergence!).toBeGreaterThanOrEqual(0);
    expect(dnaReport.shrinkageFactor).toBeDefined();
    expect(dnaReport.shrinkageFactor!).toBeGreaterThan(0);
    expect(dnaReport.shrinkageFactor!).toBeLessThanOrEqual(1.0);

    // Les multiplicateurs restent strictement bornés et lisses C^∞
    for (let n = 1; n <= 90; n++) {
      expect(dnaReport.multipliers[n]).toBeGreaterThanOrEqual(0.1);
      expect(dnaReport.multipliers[n]).toBeLessThanOrEqual(2.5);
    }
  });

  it('Recommandation 4 : Expansion rémanente continue du Noyau de Hawkes via Hurst', () => {
    // Calcul de Hurst
    const persistentSignal = new Float64Array([1, 2, 4, 7, 11, 16, 22, 29, 37, 46]);
    const hurst = computeRobustHurstHpc(persistentSignal);
    expect(hurst).toBeGreaterThan(0);
    expect(hurst).toBeLessThan(1.0);

    // Moteur bayésien avec Hurst ciblé
    const enginePersistent = runBayesianResonanceEngine(
      mockPairedPairs,
      [5, 12, 28, 45, 78],
      undefined,
      undefined,
      0.75 // Persistance forte
    );

    const engineAntiPersistent = runBayesianResonanceEngine(
      mockPairedPairs,
      [5, 12, 28, 45, 78],
      undefined,
      undefined,
      0.25 // Anti-persistance forte
    );

    expect(enginePersistent.hawkesBetaDecay).toBeDefined();
    expect(engineAntiPersistent.hawkesBetaDecay).toBeDefined();
    // Le taux de décroissance pour H=0.25 doit être plus rapide (beta plus grand) que pour H=0.75
    expect(engineAntiPersistent.hawkesBetaDecay!).toBeGreaterThan(enginePersistent.hawkesBetaDecay!);
  });
});
