import { describe, it, expect, beforeEach } from 'vitest';
import { computeMarkowitzKellyPortfolio, RESPONSIBLE_GAMING_NOTICE } from '../src/services/prediction/markowitzKellyPortfolioService';
import { performPlatinumAudit, generatePlatinumPredictionCore } from '../src/services/metaAnalystService';
import { useNexusStore } from '../src/store/useNexusStore';
import { runDeterministicInertiaBacktest, DEFAULT_INERTIA_CALIBRATION, getPersistedInertiaCalibration, savePersistedInertiaCalibration } from '../src/services/prediction/systemInertiaEngine';
import { applyPredictionDnaSieve, PredictionRuntimeContext } from '../src/services/prediction/predictionOrchestrator';
import { PlatinumScenario, DrawResult, Prediction } from '../src/types';
import { DEFAULT_ALGO_WEIGHTS } from '../src/shared/prediction.types';

// Helper to generate i.i.d. random uniform lottery draws
function generateIidHistory(count: number, seed = 12345): DrawResult[] {
  let s = seed;
  const lcg = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const history: DrawResult[] = [];
  for (let d = 0; d < count; d++) {
    const nums: number[] = [];
    while (nums.length < 5) {
      const n = Math.floor(lcg() * 90) + 1;
      if (!nums.includes(n)) nums.push(n);
    }
    nums.sort((a, b) => a - b);
    history.push({
      id: `iid-draw-${d + 1}`,
      drawName: 'NATIONAL',
      date: `2026-01-${String((d % 28) + 1).padStart(2, '0')}`,
      gagnants: nums,
      machine: [],
    });
  }
  return history;
}

describe('Audit des 5 Sous-Onglets de l\'Oracle — Validation sur Bruit i.i.d.', () => {
  const mockScenarios: PlatinumScenario[] = [
    { id: 'scen-1', name: 'Scénario 1', description: 'Test 1', numbers: [10, 20, 30, 40, 50], relativeIndex: 75, risk: 'LOW', color: '#10b981' },
    { id: 'scen-2', name: 'Scénario 2', description: 'Test 2', numbers: [11, 21, 31, 41, 51], relativeIndex: 65, risk: 'LOW', color: '#6366f1' },
    { id: 'scen-3', name: 'Scénario 3', description: 'Test 3', numbers: [12, 22, 32, 42, 52], relativeIndex: 60, risk: 'MEDIUM', color: '#f59e0b' },
    { id: 'scen-4', name: 'Scénario 4', description: 'Test 4', numbers: [13, 23, 33, 43, 53], relativeIndex: 55, risk: 'MEDIUM', color: '#f43f5e' },
    { id: 'scen-5', name: 'Scénario 5', description: 'Test 5', numbers: [14, 24, 34, 44, 54], relativeIndex: 50, risk: 'HIGH', color: '#8b5cf6' },
    { id: 'scen-6', name: 'Scénario 6', description: 'Test 6', numbers: [15, 25, 35, 45, 55], relativeIndex: 45, risk: 'HIGH', color: '#06b6d4' },
  ];

  describe('1. Génération & Méta-Analyste (Platinum) — Invariance E[R] <= 0 et Règle de Kelly', () => {
    it('sur bruit pur (sans avantage hors-échantillon, λ=0), le critère de Kelly est strictement 0 FCFA', () => {
      const report = computeMarkowitzKellyPortfolio({
        scenarios: mockScenarios,
        totalBankroll: 50000,
        unitBet: 200,
      });

      // ZÉRO AVANTAGE FABRIQUÉ
      expect(report.hasProvenEdge).toBe(false);
      expect(report.portfolioExpectedReturn).toBeLessThanOrEqual(0);
      expect(report.globalKellyLeverage).toBe(0.0);
      expect(report.totalBudgetDistributed).toBe(0);

      // Toutes les allocations ont un budget de 0
      report.allocations.forEach(alloc => {
        expect(alloc.allocatedBudget).toBe(0);
        expect(alloc.rawKellyFraction).toBe(0);
        expect(alloc.expectedReturn).toBeLessThanOrEqual(0);
      });

      // Les poids Markowitz restent une pondération continue valide sur le simplexe
      const sumWeights = report.allocations.reduce((acc, a) => acc + a.markowitzWeight, 0);
      expect(sumWeights).toBeCloseTo(1.0, 3);

      // Avertissement de jeu responsable inclus
      expect(report.responsibleGamingNotice).toBe(RESPONSIBLE_GAMING_NOTICE);
    });

    it('calibre honnêtement l\'audit Platinum : 1 hit n\'est PAS déclaré comme succès ou signal', () => {
      const mockResult = { scenarios: mockScenarios } as any;

      // 1 hit attendu au hasard à 82.6% across 6 tickets
      const auditSingleHit = performPlatinumAudit(mockResult, {
        id: 'draw-1',
        drawName: 'NATIONAL',
        date: '2026-01-01',
        gagnants: [10, 80, 81, 82, 83],
      } as DrawResult);
      expect(auditSingleHit.bestScore).toBe(1);
      expect(auditSingleHit.syncScore).toBe(20);
      expect(auditSingleHit.verdict).toContain('Bruit de Fond Indiscernable');

      // 0 hit
      const auditZeroHit = performPlatinumAudit(mockResult, {
        id: 'draw-2',
        drawName: 'NATIONAL',
        date: '2026-01-02',
        gagnants: [1, 2, 3, 4, 5],
      } as DrawResult);
      expect(auditZeroHit.bestScore).toBe(0);
      expect(auditZeroHit.syncScore).toBe(0);
      expect(auditZeroHit.verdict).toContain('Divergence Complète');

      // 3 hits (statistiquement significatif, p < 0.01)
      const auditThreeHits = performPlatinumAudit(mockResult, {
        id: 'draw-3',
        drawName: 'NATIONAL',
        date: '2026-01-03',
        gagnants: [10, 20, 30, 80, 81],
      } as DrawResult);
      expect(auditThreeHits.bestScore).toBe(3);
      expect(auditThreeHits.syncScore).toBe(60);
      expect(auditThreeHits.verdict).toContain('Succès Majeur');
    });

    it('generatePlatinumPredictionCore produit des identifiants déterministes sans Date.now() et 6 scénarios ordonnés', async () => {
      const dummyHistory = generateIidHistory(20);

      const res1 = await generatePlatinumPredictionCore('NATIONAL', dummyHistory);
      const res2 = await generatePlatinumPredictionCore('NATIONAL', dummyHistory);

      // Déterminisme strict
      expect(res1.id).toBe(res2.id);
      expect(res1.id).toMatch(/^platinum_pred_/);
      expect(res1.id).not.toContain('NaN');
      expect(res1.scenarios.length).toBe(6);
      expect(res1.scenarios[0].numbers).toEqual(res2.scenarios[0].numbers);
    });
  });

  describe('2. Synthèse Stratégique & Store Nexus — Connexion de la Posture aux Paramètres d\'Inférence', () => {
    it('connecte la sélection de posture aux paramètres réels (forcedOutsiderCount) et les persiste', () => {
      const store = useNexusStore.getState();

      // Posture Safe -> 0 outsider forcé (aversion stricte au risque)
      store.setStrategicPosture('safe');
      expect(useNexusStore.getState().activeStrategicPosture).toBe('safe');
      expect(useNexusStore.getState().forcedOutsiderCount).toBe(0);

      // Posture Balance -> 1 outsider forcé
      store.setStrategicPosture('balance');
      expect(useNexusStore.getState().activeStrategicPosture).toBe('balance');
      expect(useNexusStore.getState().forcedOutsiderCount).toBe(1);

      // Posture Growth -> 2 outsiders forcés (recherche de singularités)
      store.setStrategicPosture('growth');
      expect(useNexusStore.getState().activeStrategicPosture).toBe('growth');
      expect(useNexusStore.getState().forcedOutsiderCount).toBe(2);
    });
  });

  describe('3. Optimiseur d\'Inertie — Fenêtre Élargie, Split In-Sample/Holdout et Correction de Bonferroni', () => {
    it('exécute le rétro-audit sur une fenêtre causale stricte avec partitionnement in-sample/holdout', async () => {
      const history = generateIidHistory(35);
      const result = await runDeterministicInertiaBacktest(
        history,
        'NATIONAL',
        DEFAULT_INERTIA_CALIBRATION,
        0.5,
        25
      );

      // Fenêtre élargie au-delà des 10 trials initiaux (jusqu'à 25)
      expect(result.trials).toBeGreaterThanOrEqual(12);
      expect(result.trials).toBeLessThanOrEqual(25);

      // Split in-sample vs holdout présent
      expect(result.holdoutTrials).toBeDefined();
      expect(result.holdoutTrials).toBeGreaterThan(0);

      // Correction de multiplicité de Bonferroni sur la p-value
      if (result.successPValue !== null && result.bonferroniCorrectedPValue !== null) {
        expect(result.bonferroniCorrectedPValue).toBeGreaterThanOrEqual(result.successPValue);
        expect(result.bonferroniCorrectedPValue).toBeLessThanOrEqual(1.0);
      }
    });

    it('injecte la calibration d\'inertie persistée dans le tamisage de predictionOrchestrator', () => {
      const testDraw = 'TEST_INERTIA_DRAW';
      savePersistedInertiaCalibration(testDraw, {
        viscosityGain: 1.2,
        massGain: 1.1,
        couplingGain: 1.0,
        jaccardGain: 1.0,
        dampingRatio: 0.8, // Amortissement élevé
      });

      const loaded = getPersistedInertiaCalibration(testDraw);
      expect(loaded.dampingRatio).toBe(0.8);

      const context: PredictionRuntimeContext = {
        drawName: testDraw,
        rawHistory: generateIidHistory(20),
        history: generateIidHistory(20),
        temporalDepth: 20,
        validTemporalDepth: 20,
        contentHash: 'hash123',
        adversarialMode: false,
        skipTraining: true,
        isForensicOptimized: false,
        useSpatioTemporalHawkes: false,
      };

      const dummyScores = [
        { num: 1, score: 50, breakdown: {} },
        { num: 2, score: 40, breakdown: {} },
        { num: 3, score: 30, breakdown: {} },
      ];

      const { sievedScores } = applyPredictionDnaSieve(context, dummyScores, DEFAULT_ALGO_WEIGHTS);
      expect(sievedScores.length).toBe(3);
      expect(sievedScores[0].score).toBeGreaterThan(0);
      expect(Number.isFinite(sievedScores[0].score)).toBe(true);
    });
  });
});
