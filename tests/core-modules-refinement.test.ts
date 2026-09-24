import { describe, it, expect } from 'vitest';
import { calculateFusion } from '../services/fusionService';
import { runForensicAutopsy } from '../services/postPredictionAnalysisService';
import { getTunedHyperparameters, saveTunedHyperparameters } from '../services/prediction/hyperParameterTuner';
import {
  computeModelDnaFingerprint,
  extractSpecializations,
  recordModelDnaVersion,
  getModelEvolutionLineage
} from '../services/prediction/modelDnaKnowledgeBase';
import {
  calculateHistoricalPerformance,
  calculateExtendedHistoricalPerformance,
  queryPredictionHistoryIndexed
} from '../services/predictionHistoryService';
import { evaluatePredictionStability } from '../services/prediction/predictionFinalize';
import { AlgoKey, DrawResult, Prediction, PredictionHistoryItem, ScoreBreakdown } from '../types';

/**
 * Décomposition spectrale déterministe d'une prédiction réelle : chaque canal note les 90
 * numéros, les numéros retenus étant surpondérés (biais de surestimation typique d'un
 * ensemble sur-confiant). Aucun tirage aléatoire : la même graine produit la même matrice.
 */
const buildPredictionBreakdown = (predictedNumbers: number[]): Record<number, ScoreBreakdown> => {
  const channels: AlgoKey[] = [
    AlgoKey.FREQUENCY,
    AlgoKey.MARKOV,
    AlgoKey.BAYES,
    AlgoKey.SPECTRAL,
    AlgoKey.MOMENTUM,
    AlgoKey.FRACTAL,
    AlgoKey.TEMPORAL,
    AlgoKey.SPATIAL,
  ];
  const breakdown: Record<number, ScoreBreakdown> = {};
  for (let i = 1; i <= 90; i++) {
    const center = predictedNumbers.includes(i) ? 90 : 30;
    const scores: ScoreBreakdown = {};
    channels.forEach((algo, idx) => {
      scores[algo] = center + ((i * 7 + idx * 13) % 11) - 5;
    });
    breakdown[i] = scores;
  }
  return breakdown;
};

describe('Vérification et Validation des Modules Refondus (AGENTS.md & Core Refinements)', () => {
  // Mock history 5/90
  const mockHistory: DrawResult[] = [
    { id: '1', date: '01/01/2026', tirage: 'TEST_A', gagnants: [10, 20, 30, 40, 50], machine: [1, 2, 3, 4, 5] },
    { id: '2', date: '08/01/2026', tirage: 'TEST_A', gagnants: [12, 22, 32, 42, 52], machine: [6, 7, 8, 9, 11] },
    { id: '3', date: '15/01/2026', tirage: 'TEST_A', gagnants: [10, 25, 30, 45, 60], machine: [15, 16, 17, 18, 19] },
  ];

  describe('1. Couche de Fusion & Réduction de Redondance (fusionService)', () => {
    it('calcule l’indice de cohérence et applique la déflation de redondance de manière continue', () => {
      const stats = Array.from({ length: 90 }, (_, i) => ({ number: i + 1, count: 5 }));
      const spectral = Array.from({ length: 90 }, (_, i) => ({
        number: i + 1,
        frequency: 0.05,
        phase: 0.1,
        energy: 0.8,
        dominantCycle: 10,
        spectralScore: 50,
      }));
      const lastPred: Prediction = {
        suggestedNumbers: [10, 20, 30, 40, 50],
        candidates: [10, 20, 30, 40, 50, 60],
        confidence: 85,
        analysis: 'Test',
        breakdown: {},
        timestamp: Date.now(),
      };
      const weights = { frequency: 0.3, gap: 0.2, momentum: 0.2, spectral: 0.3 };

      const result = calculateFusion(mockHistory, stats, spectral, lastPred, weights);

      expect(result).toBeDefined();
      expect(result.finalTicket).toHaveLength(5);
      expect(result.coherenceIndex).toBeGreaterThanOrEqual(0);
      expect(result.coherenceIndex).toBeLessThanOrEqual(100);
      expect(result.redundancyPenalty).toBeDefined();
      expect(typeof result.redundancyPenalty?.logicPhysics).toBe('number');
      expect(typeof result.orthogonalizationApplied).toBe('boolean');
    });
  });

  describe('2. Système d’Analyses Post-Mortem & Attribution Causale (postPredictionAnalysisService)', () => {
    it('génère un rapport médico-légal complet avec scores d’attribution causale et mode de défaillance', async () => {
      const predictedNumbers = [10, 20, 30, 40, 50];
      const winningNumbers = [10, 21, 31, 41, 51]; // 1 hit (10), 4 misses

      const report = await runForensicAutopsy(
        'TEST_A',
        '02/01/2026',
        predictedNumbers,
        winningNumbers,
        buildPredictionBreakdown(predictedNumbers),
        'pred_1',
        'real_1',
        true, // skipLLM
        mockHistory
      );

      expect(report).toBeDefined();
      expect(report.drawAnomalyScore).toBeGreaterThanOrEqual(0);
      expect(report.modelMissScore).toBeGreaterThanOrEqual(0);
      expect(report.structuralQualityScore).toBeGreaterThanOrEqual(0);
      expect([
        'normalnoise',
        'overconfidence',
        'recentoverfit',
        'structuralmisalignment',
        'regimebreak',
        'anomalousdraw'
      ]).toContain(report.failureMode);
      expect(report.rmse).toBeDefined();
      expect(Array.isArray(report.recommendedAdjustments)).toBe(true);
      expect(report.recommendedAdjustments?.length).toBeGreaterThan(0);
    });

    it('n’invente aucune métrique spectrale ni ajustement en l’absence de décomposition réelle', async () => {
      const predictedNumbers = [10, 20, 30, 40, 50];
      const winningNumbers = [10, 21, 31, 41, 51];

      const report = await runForensicAutopsy(
        'TEST_A',
        '02/01/2026',
        predictedNumbers,
        winningNumbers,
        undefined, // aucune décomposition persistée
        'pred_1',
        'real_1',
        true,
        mockHistory
      );

      // Sans breakdown, rien n'est mesurable : le rapport doit rester muet plutôt que de
      // fabriquer des scores d'algorithmes pour remplir l'affichage.
      expect(report.rmse).toBeUndefined();
      expect(report.brier_score).toBeUndefined();
      expect(report.kl_divergence).toBeUndefined();
      expect(report.shannon_entropy).toBeUndefined();
      expect(report.algorithmicDrift ?? []).toHaveLength(0);
      expect(report.recommendedAdjustments ?? []).toHaveLength(0);
    });
  });

  describe('3. Règle d’Isolation des Hyperparamètres (hyperParameterTuner)', () => {
    it('isole strictement le stockage des hyperparamètres par tirage', async () => {
      const draw1 = 'LOTO_TEST_ALPHA';
      const draw2 = 'LOTO_TEST_BETA';

      const customParams1 = {
        hawkesDecay: 0.28,
        gapVelocityWeight: 1.25,
        learningRateSGD: 0.008,
      };

      saveTunedHyperparameters(draw1, customParams1);

      const loaded1 = await getTunedHyperparameters(draw1);
      const loaded2 = await getTunedHyperparameters(draw2);

      expect(loaded1.hawkesDecay).toBe(0.28);
      expect(loaded1.gapVelocityWeight).toBe(1.25);
      // draw2 doit avoir des valeurs par défaut ou différentes, jamais pollué par draw1
      expect(loaded2.hawkesDecay).not.toBe(0.28);
    });
  });

  describe('4. Base de Connaissances ADN des Modèles (modelDnaKnowledgeBase)', () => {
    it('calcule une empreinte ADN 100% reproductible et extrait les spécialisations', () => {
      const weights = { frequency: 0.35, gapTrend: 0.25, bayes: 0.20, markov: 0.20 };

      const fp1 = computeModelDnaFingerprint('TEST_DRAW', weights);
      const fp2 = computeModelDnaFingerprint('TEST_DRAW', weights);
      expect(fp1).toBe(fp2);
      // L'empreinte exclut le temps : une même configuration ADN reste dédoublonnable
      // quelle que soit la date d'enregistrement.
      const fpOtherDraw = computeModelDnaFingerprint('OTHER_DRAW', weights);
      expect(fp1).not.toBe(fpOtherDraw);

      const specs = extractSpecializations(weights);
      expect(specs.length).toBeGreaterThan(0);
      expect(specs[0].dominanceRank).toBe(1);
      expect(specs[0].algoKey).toBe('frequency');
    });

    it('enregistre une version et extrait la lignée évolutive avec indice de stabilité continu', async () => {
      const weights = { frequency: 0.3, gapTrend: 0.3, bayes: 0.2, markov: 0.2 };
      await recordModelDnaVersion({
        drawName: 'TEST_EVOLUTION',
        version: 'v_test_1',
        origin: 'INITIAL',
        weights,
        performance: { score: 72.5, hitRate: 0.4 },
        causalAuditTrail: ['Initialisation canonique'],
      });

      const lineage = await getModelEvolutionLineage('TEST_EVOLUTION');
      expect(lineage.drawName).toBe('TEST_EVOLUTION');
      expect(lineage.totalGenerations).toBeGreaterThanOrEqual(1);
      expect(lineage.stabilityIndex).toBeGreaterThanOrEqual(0);
      expect(lineage.stabilityIndex).toBeLessThanOrEqual(100);
    });
  });

  describe('5. Historique & Requêtage Indexé des Prédictions (predictionHistoryService)', () => {
    it('calcule la performance historique étendue (Brier, Sharpe, distribution)', () => {
      const predItems: PredictionHistoryItem[] = [
        {
          id: 'p_1',
          timestamp: new Date('2026-01-01T20:00:00Z').getTime(),
          drawName: 'TEST_A',
          prediction: {
            suggestedNumbers: [10, 20, 30, 40, 50],
            candidates: [10, 20, 30, 40, 50],
            confidence: 80,
            analysis: 'A',
            breakdown: {},
            timestamp: new Date('2026-01-01T20:00:00Z').getTime(),
          },
          drawResultId: '1',
        },
      ];

      const extended = calculateExtendedHistoricalPerformance(predItems, mockHistory);
      expect(extended.accuracy).toBeGreaterThan(0);
      expect(extended.hitDistribution).toBeDefined();
      expect(extended.meanBrierScore).toBeGreaterThanOrEqual(0);
      expect(typeof extended.sharpeRatio).toBe('number');
    });

    it('interroge l’historique par filtre multi-critères indexé', async () => {
      const result = await queryPredictionHistoryIndexed(
        { drawName: 'TEST_A', minConfidence: 50 },
        mockHistory
      );
      expect(result).toBeDefined();
      expect(result.aggregateStats).toBeDefined();
      expect(typeof result.aggregateStats.averageConfidence).toBe('number');
    });
  });
});
