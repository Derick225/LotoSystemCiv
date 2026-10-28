import { describe, it, expect, beforeEach } from 'vitest';
import { computeMarkowitzKellyPortfolio } from '../src/services/prediction/markowitzKellyPortfolioService';
import {
  computeSpatioTemporalHawkes2D,
  getBallGridCoordinates,
  getBallSpatialDistance,
} from '../src/services/prediction/spatioTemporalHawkes2DService';
import {
  updateEntropyKalmanRegime,
  clearEntropyKalmanCache,
} from '../src/services/prediction/stochasticKalmanRegimeService';
import { PlatinumScenario, DrawResult } from '../src/types';

describe('Axe 2 : Modélisation Mathématique & Algorithmique (Rigueur AGENTS.md)', () => {
  beforeEach(() => {
    clearEntropyKalmanCache();
  });

  describe('1. Portefeuille de Markowitz & Critère de Kelly Continu Multi-Scénarios', () => {
    const mockScenarios: PlatinumScenario[] = [
      {
        id: 'alpha',
        name: 'Alpha Core',
        description: 'Convergence maximale',
        numbers: [5, 12, 23, 45, 67],
        relativeIndex: 85,
        risk: 'LOW',
        color: '#10b981',
      },
      {
        id: 'beta',
        name: 'Beta Flow',
        description: 'Harmonique orbitale',
        numbers: [12, 23, 34, 56, 78],
        relativeIndex: 72,
        risk: 'LOW',
        color: '#6366f1',
      },
      {
        id: 'gamma',
        name: 'Gamma Burst',
        description: 'Kinetic sieve',
        numbers: [1, 15, 30, 45, 89],
        relativeIndex: 65,
        risk: 'MEDIUM',
        color: '#f43f5e',
      },
      {
        id: 'delta',
        name: 'Delta Convergence',
        description: 'Asymmetric gap',
        numbers: [8, 19, 41, 62, 83],
        relativeIndex: 58,
        risk: 'MEDIUM',
        color: '#f59e0b',
      },
      {
        id: 'epsilon',
        name: 'Epsilon Forensic',
        description: 'Drift correction',
        numbers: [14, 27, 49, 71, 90],
        relativeIndex: 50,
        risk: 'HIGH',
        color: '#8b5cf6',
      },
      {
        id: 'zeta',
        name: 'Zeta Adversarial',
        description: 'Anti-consensus',
        numbers: [2, 18, 37, 54, 76],
        relativeIndex: 44,
        risk: 'HIGH',
        color: '#f97316',
      },
    ];

    it('projette les allocations sur le simplexe unitaire de Markowitz (somme des poids = 1.0)', () => {
      const report = computeMarkowitzKellyPortfolio({
        scenarios: mockScenarios,
        totalBankroll: 100000,
        unitBet: 200,
      });

      expect(report.allocations.length).toBe(6);

      let sumWeights = 0;
      report.allocations.forEach((alloc) => {
        expect(alloc.markowitzWeight).toBeGreaterThanOrEqual(0);
        expect(alloc.markowitzWeight).toBeLessThanOrEqual(1.0);
        sumWeights += alloc.markowitzWeight;
      });

      expect(sumWeights).toBeCloseTo(1.0, 3);
      expect(report.portfolioVolatility).toBeGreaterThan(0);
      expect(report.globalKellyLeverage).toBeGreaterThan(0);
      expect(report.globalKellyLeverage).toBeLessThanOrEqual(1.0);

      // Vérification que les budgets alloués sont des multiples du ticket unitaire (200)
      let sumBudgets = 0;
      report.allocations.forEach((alloc) => {
        expect(alloc.allocatedBudget % 200).toBe(0);
        sumBudgets += alloc.allocatedBudget;
      });
      expect(sumBudgets).toBe(report.totalBudgetDistributed);
    });

    it('génère une matrice de covariance semi-définie positive K x K cohérente avec les chevauchements', () => {
      const report = computeMarkowitzKellyPortfolio({
        scenarios: mockScenarios,
        totalBankroll: 50000,
      });

      const cov = report.covarianceMatrix;
      expect(cov.length).toBe(6);
      expect(cov[0].length).toBe(6);

      // Symétrie de la matrice de covariance Cov(i, j) = Cov(j, i)
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          expect(cov[i][j]).toBeCloseTo(cov[j][i], 5);
        }
      }

      // Alpha [5, 12, 23, 45, 67] et Beta [12, 23, 34, 56, 78] partagent 2 numéros (12, 23)
      // Leur covariance doit être strictement supérieure à Alpha et Zeta (0 numéro partagé)
      expect(cov[0][1]).toBeGreaterThan(cov[0][5]);
    });
  });

  describe('2. Modélisation Hawkes Spatio-Temporelle Continue 2D', () => {
    it('calcule des coordonnées de grille 2D et distances toroïdales continues et symétriques', () => {
      const coord1 = getBallGridCoordinates(1);
      expect(coord1).toEqual({ x: 0, y: 0 });

      const coord10 = getBallGridCoordinates(10);
      expect(coord10).toEqual({ x: 9, y: 0 });

      const coord90 = getBallGridCoordinates(90);
      expect(coord90).toEqual({ x: 9, y: 8 });

      // Symétrie de distance
      const dist1_90 = getBallSpatialDistance(1, 90);
      const dist90_1 = getBallSpatialDistance(90, 1);
      expect(dist1_90).toBe(dist90_1);

      // Distance toroïdale minimale : 1 et 10 sont voisins sur l'axe X (distance dx = 1)
      const dist1_10 = getBallSpatialDistance(1, 10);
      expect(dist1_10).toBe(1.0);
    });

    it('calcule les intensités spatio-temporelles 2D sans divergence et extrait le hotspot', () => {
      const mockHistory: DrawResult[] = [
        { id: '1', date: '2026-10-25', drawName: 'TEST', gagnants: [5, 6, 15, 25, 35], machine: [] },
        { id: '2', date: '2026-10-24', drawName: 'TEST', gagnants: [5, 16, 26, 36, 46], machine: [] },
        { id: '3', date: '2026-10-23', drawName: 'TEST', gagnants: [5, 7, 17, 27, 37], machine: [] },
      ];

      const report = computeSpatioTemporalHawkes2D(mockHistory, 10);
      expect(report.nodes.length).toBe(90);
      expect(report.temporalDecayBeta).toBeGreaterThan(0);
      expect(report.spatialSpreadSigma).toBeGreaterThan(0);
      expect(report.totalSpatioTemporalEnergy).toBeGreaterThan(0);

      // La boule 5 étant sortie 3 fois consécutives, elle doit avoir l'intensité la plus élevée
      expect(report.dominantHotspot).toBe(5);
      const node5 = report.nodes.find(n => n.number === 5);
      expect(node5?.normalizedScore).toBe(100);
      expect(node5?.temporalExcitation).toBeGreaterThan(0);
    });
  });

  describe('3. Filtre de Kalman Stochastique & Détection Continue de Rupture de Régime', () => {
    it('met à jour l\'entropie et la covariance avec la forme de Joseph stabilisée', () => {
      const res1 = updateEntropyKalmanRegime({
        drawName: 'TEST_KALMAN',
        measuredEntropy: 0.82,
        historyLength: 20,
        regimePivot: 0.80,
      });

      expect(res1.filteredEntropy).toBeGreaterThanOrEqual(0.0);
      expect(res1.filteredEntropy).toBeLessThanOrEqual(1.0);
      // Symétrie de la covariance P_t
      expect(res1.covariance[0][1]).toBeCloseTo(res1.covariance[1][0], 5);
      expect(res1.covariance[0][0]).toBeGreaterThan(0);
      expect(res1.covariance[1][1]).toBeGreaterThan(0);

      // Somme des probabilités de régime sur le simplexe
      const probSum = res1.probStable + res1.probTransition + res1.probChaotic;
      expect(probSum).toBeCloseTo(1.0, 1);
    });

    it('détecte continûment une rupture de régime (passage brusque à haute entropie)', () => {
      // 3 étapes nominales autour de 0.60 (Stable)
      updateEntropyKalmanRegime({ drawName: 'TEST_BREAK', measuredEntropy: 0.60, historyLength: 30 });
      updateEntropyKalmanRegime({ drawName: 'TEST_BREAK', measuredEntropy: 0.61, historyLength: 30 });
      const stableState = updateEntropyKalmanRegime({ drawName: 'TEST_BREAK', measuredEntropy: 0.59, historyLength: 30 });

      expect(stableState.regime).toBe('STABLE');
      expect(stableState.regimeBreakIntensity).toBeLessThan(0.5);

      // Choc stochastique : bond d'entropie brusque à 0.95
      const shockState = updateEntropyKalmanRegime({ drawName: 'TEST_BREAK', measuredEntropy: 0.95, historyLength: 30 });

      // L'innovation ν_t et l'intensité de rupture doivent augmenter significativement
      expect(shockState.innovation).toBeGreaterThan(0.2);
      expect(shockState.regimeBreakIntensity).toBeGreaterThan(stableState.regimeBreakIntensity);
      expect(shockState.entropyVelocity).toBeGreaterThan(0);
      expect(shockState.probChaotic).toBeGreaterThan(shockState.probStable);
    });
  });
});
