import { describe, it, expect } from 'vitest';
import { 
  parseRawNumberArray, 
  extractDrawNumbers, 
  parseHeterogeneousDrawDataset 
} from '../services/prediction/featureExtractor';
import { 
  computeAutomatedCausalAttribution, 
  computeSystematicPredictionComparison, 
  generateActionableImprovementReport 
} from '../services/postPredictionAnalysisService';
import { 
  executeClosedLoopAutopsy 
} from '../services/prediction/closedLoopAutopsyService';
import { 
  recordModelDnaGeneration, 
  getModelDnaEvolutionReport, 
  reconstituteHistoricalWeights 
} from '../services/prediction/modelDnaKnowledgeBase';
import { 
  calculateAdvancedPerformanceTimeline 
} from '../services/predictionHistoryService';
import { 
  computeQuantifiedUncertainty, 
  generateSimulationScenarios,
  generateReadabilityReport
} from '../services/prediction/quantifiedUncertaintyEngine';
import { calculateFusion } from '../services/fusionService';
import { DEFAULT_ALGO_WEIGHTS, AlgoKey } from '../shared/prediction.types';
import { DrawResult, AlgoWeights } from '../types';

describe('Audit & Améliorations Système - 7 Domaines Spécifiques', () => {

  // ==========================================================================
  // DOMAINE 1 : OUTILS D'ANALYSE PRIMAIRE
  // ==========================================================================
  describe('1. Outils d\'Analyse Primaire (Traitement Hétérogène & Pertinence Indicateurs)', () => {
    it('doit parser des flux bruts hautement hétérogènes (JSON sérialisé, regex, délimiteurs multiples)', () => {
      // JSON array string
      const jsonRes = parseRawNumberArray('["05", 12, "45", 89, 2]');
      expect(jsonRes).toEqual(expect.arrayContaining([2, 5, 12, 45, 89]));

      // Texte libre avec texte et séparateurs
      const textRes = parseRawNumberArray('Tirage N°445: 03 - 22 / 88, 14; 61');
      expect(textRes).toEqual(expect.arrayContaining([3, 14, 22, 61, 88]));

      // Tableau d'objets avec clés variables
      const objRes = parseRawNumberArray([
        { val: 10 },
        { ball: '20' },
        { num: 30 },
        { number: 40 },
        { value: 50 },
      ]);
      expect(objRes).toEqual([10, 20, 30, 40, 50]);
    });

    it('doit ingérer un dataset hétérogène complet et isoler les tirages', () => {
      const rawDump = [
        { id: 'd1', drawName: 'Tirage_Nord', date: '2024-01-10', winningNumbers: [1, 2, 3, 4, 5], machineNumbers: [6, 7] },
        { id: 'd2', drawName: 'Tirage_Sud', date: '2024-01-11', winners: [10, 20, 30, 40, 50] },
        "2024-01-12 11, 22, 33, 44, 55 / 66, 77",
      ];

      const ingested = parseHeterogeneousDrawDataset(rawDump, 'Tirage_Nord');
      expect(ingested.length).toBe(3);
      expect(ingested[0].gagnants).toEqual([1, 2, 3, 4, 5]);
      expect(ingested[0].machine).toEqual([6, 7]);
      expect(ingested[1].gagnants).toEqual([10, 20, 30, 40, 50]);
      expect(ingested[2].gagnants).toEqual([11, 22, 33, 44, 55]);
    });
  });

  // ==========================================================================
  // DOMAINE 2 : ANALYSES POST-MORTEM & ATTRIBUTION CAUSALE
  // ==========================================================================
  describe('2. Analyses Post-Mortem & Attribution Causale Automatisée', () => {
    it('doit effectuer une comparaison systématique continue sans nombres magiques', () => {
      const predicted = [10, 25, 42, 67, 88];
      const actual = [10, 26, 40, 68, 89]; // 1 hit (10), 3 voisins ±1 (25 vs 26, 67 vs 68, 88 vs 89), 1 voisin ±2 (42 vs 40)
      const machine = [15, 25]; // fuite machine sur 25

      const comp = computeSystematicPredictionComparison(predicted, actual, machine);
      expect(comp.directHits).toEqual([10]);
      expect(comp.neighbors1.length).toBe(3);
      expect(comp.neighbors2.length).toBe(1);
      expect(comp.machineLeakages).toEqual([25]);
      expect(comp.captureRateExtended).toBeGreaterThan(0.2);
    });

    it('doit générer une attribution causale automatisée et des correctifs contrefactuels', () => {
      const predicted = [10, 25, 42, 67, 88];
      const actual = [10, 26, 40, 68, 89];
      const machine = [25];
      const breakdown = {
        10: { FREQUENCY: 80, MARKOV: 70 },
        25: { FREQUENCY: 90, MACHINE: 85 },
        42: { SPATIAL: 88 },
        67: { BAYES: 85 },
        88: { SPECTRAL: 80 },
      };

      const attributions = computeAutomatedCausalAttribution(
        predicted,
        actual,
        machine,
        breakdown,
        DEFAULT_ALGO_WEIGHTS as AlgoWeights
      );

      expect(attributions.length).toBeGreaterThan(0);
      const hit = attributions.find(a => a.number === 10);
      expect(hit?.category).toBe('CONFIRMED_HIT');

      const nearMiss = attributions.find(a => a.number === 25);
      expect(nearMiss?.category).toBe('BALLISTIC_NEAR_MISS');

      // Rapport d'amélioration actionnable
      const systematicComp = computeSystematicPredictionComparison(predicted, actual, machine);
      const report = generateActionableImprovementReport(
        systematicComp,
        attributions,
        DEFAULT_ALGO_WEIGHTS as AlgoWeights
      );

      expect(report.expectedAccuracyGain).toBeGreaterThan(0);
      expect(report.priorityFixes.length).toBeGreaterThan(0);
      expect(report.summary).toContain('Post-Mortem Actionnable');
    });

    it('doit enrichir l\'autopsie en boucle fermée avec la comparaison et l\'attribution', async () => {
      const mockHistory: DrawResult[] = [
        { id: '1', drawName: 'Test_Draw', date: '2024-03-01', gagnants: [5, 12, 33, 44, 78], machine: [10, 20] },
        { id: '2', drawName: 'Test_Draw', date: '2024-02-28', gagnants: [5, 14, 30, 44, 77], machine: [11, 21] },
        { id: '3', drawName: 'Test_Draw', date: '2024-02-25', gagnants: [6, 12, 32, 45, 78], machine: [12, 22] },
        { id: '4', drawName: 'Test_Draw', date: '2024-02-20', gagnants: [7, 13, 31, 46, 79], machine: [13, 23] },
        { id: '5', drawName: 'Test_Draw', date: '2024-02-15', gagnants: [8, 15, 35, 47, 80], machine: [14, 24] },
      ];

      const report = await executeClosedLoopAutopsy(
        'Test_Draw',
        0,
        mockHistory,
        DEFAULT_ALGO_WEIGHTS as AlgoWeights
      );

      expect(report.systematicComparison).toBeDefined();
      expect(report.causalAttributions).toBeDefined();
      expect(report.actionableImprovementReport).toBeDefined();
      expect(Array.isArray(report.algoGradients)).toBe(true);
    });
  });

  // ==========================================================================
  // DOMAINE 3 : BASE DE CONNAISSANCES ADN DU MODÈLE
  // ==========================================================================
  describe('3. Base de Connaissances ADN des Modèles', () => {
    it('doit enregistrer une génération d\'ADN, tracer les mutations et calculer les métriques de fitness', async () => {
      const drawName = 'Test_DNA_Audit_Draw';
      const weights: AlgoWeights = { ...DEFAULT_ALGO_WEIGHTS } as AlgoWeights;

      const gen = await recordModelDnaGeneration(
        drawName,
        weights,
        82.5,
        'forensic_autopsy',
        {
          relativeGain: 3.4,
          hyperparameters: { spatialSigma: 1.25, hawkesDecay: 0.95 },
        }
      );

      expect(gen.drawName).toBe(drawName);
      expect(gen.fitnessScore).toBe(82.5);
      expect(gen.generation).toBeGreaterThanOrEqual(0);

      const report = await getModelDnaEvolutionReport(drawName);
      expect(report.drawName).toBe(drawName);
      expect(report.totalGenerations).toBeGreaterThanOrEqual(1);
      expect(report.activeGeneration).toBeDefined();

      const reconstituted = await reconstituteHistoricalWeights(drawName, gen.id);
      expect(reconstituted).toBeDefined();
      const recFreq = (reconstituted as any)?.[AlgoKey.FREQUENCY] ?? (reconstituted as any)?.frequency ?? (reconstituted as any)?.FREQUENCY;
      const expectedFreq = (weights as any)?.[AlgoKey.FREQUENCY] ?? (weights as any)?.frequency ?? (weights as any)?.FREQUENCY;
      expect(recFreq).toBeCloseTo(expectedFreq, 3);
    });
  });

  // ==========================================================================
  // DOMAINE 4 : COUCHE DE FUSION KALMAN & CONSENSUS
  // ==========================================================================
  describe('4. Couche de Fusion des Données & Modèles', () => {
    it('doit fusionner harmonieusement les vecteurs Python, Quantum et Oracle sans redondance', () => {
      const history: DrawResult[] = [
        { id: '1', drawName: 'Fusion_Test', date: '2024-03-01', gagnants: [1, 2, 3, 4, 5] },
        { id: '2', drawName: 'Fusion_Test', date: '2024-02-28', gagnants: [1, 10, 20, 30, 40] },
        { id: '3', drawName: 'Fusion_Test', date: '2024-02-25', gagnants: [2, 11, 21, 31, 41] },
      ];

      const stats = [
        { number: 1, count: 5 },
        { number: 2, count: 4 },
        { number: 3, count: 3 },
      ];

      const spectral = [
        { number: 1, energy: 0.8, entropy: 0.2, phase: 0.5 },
        { number: 2, energy: 0.7, entropy: 0.3, phase: 0.4 },
        { number: 3, energy: 0.6, entropy: 0.4, phase: 0.3 },
      ];

      const fusion = calculateFusion(
        history,
        stats,
        spectral,
        null,
        DEFAULT_ALGO_WEIGHTS as AlgoWeights,
        { logic: 1.0, physics: 1.0, intuition: 1.0 },
        'balanced'
      );

      expect(fusion.finalTicket.length).toBe(5);
      expect(fusion.confidence).toBeGreaterThan(0);
      expect(fusion.entropy).toBeGreaterThan(0);
      expect(fusion.convergedNumbers.length).toBeGreaterThan(0);
      expect(fusion.kalmanGains).toBeDefined();
    });
  });

  // ==========================================================================
  // DOMAINE 5 : HISTORIQUE DES PRÉDICTIONS & SÉRIE TEMPORELLE
  // ==========================================================================
  describe('5. Historique des Prédictions & Suivi Temporel de la Performance', () => {
    it('doit calculer une timeline de performance 100% isolée par tirage', () => {
      const drawName = 'Timeline_Iso_Draw';
      const mockPredictions = [
        {
          id: 'p1',
          timestamp: Date.now() - 100000,
          drawName,
          drawResultId: 'res1',
          prediction: {
            suggestedNumbers: [5, 12, 23, 45, 67],
            confidence: 78,
          } as any,
        },
        {
          id: 'p2',
          timestamp: Date.now() - 50000,
          drawName,
          drawResultId: 'res2',
          prediction: {
            suggestedNumbers: [5, 14, 23, 48, 89],
            confidence: 82,
          } as any,
        },
      ];

      const mockResults: DrawResult[] = [
        { id: 'res1', drawName, date: '01/03/2024', gagnants: [5, 12, 23, 80, 90] }, // 3 hits
        { id: 'res2', drawName, date: '02/03/2024', gagnants: [5, 14, 30, 40, 50] }, // 2 hits
      ];

      const timeline = calculateAdvancedPerformanceTimeline(drawName, mockPredictions as any, mockResults);
      expect(timeline.totalPredictions).toBe(2);
      expect(timeline.evaluatedPredictions).toBe(2);
      expect(timeline.hitDistribution.hits3).toBe(1);
      expect(timeline.hitDistribution.hits2).toBe(1);
      expect(timeline.hitRateTop5Pct).toBe(100);
      expect(timeline.exact3PlusPct).toBe(50);
      expect(timeline.timeline.length).toBe(2);
    });
  });

  // ==========================================================================
  // DOMAINE 6 : MOTEURS DE PRÉDICTIONS FUTURES & INCERTITUDE QUANTIFIÉE
  // ==========================================================================
  describe('6. Moteurs de Prédictions Futures (Scénarios & Incertitude)', () => {
    it('doit quantifier l\'incertitude et générer des scénarios de simulation déterministes', () => {
      const mockHistory: DrawResult[] = [
        { id: '1', drawName: 'Future_Test', date: '2024-03-01', gagnants: [1, 5, 10, 20, 30] },
        { id: '2', drawName: 'Future_Test', date: '2024-02-28', gagnants: [2, 6, 11, 21, 31] },
        { id: '3', drawName: 'Future_Test', date: '2024-02-25', gagnants: [3, 7, 12, 22, 32] },
      ];

      const masterScores = [
        { num: 1, score: 85.5, breakdown: { FREQUENCY: 80, MARKOV: 90 } },
        { num: 5, score: 82.3, breakdown: { FREQUENCY: 85, MARKOV: 75 } },
        { num: 10, score: 79.1, breakdown: { FREQUENCY: 75, MARKOV: 80 } },
        { num: 20, score: 76.4, breakdown: { FREQUENCY: 70, MARKOV: 78 } },
        { num: 30, score: 73.0, breakdown: { FREQUENCY: 68, MARKOV: 72 } },
        { num: 40, score: 65.0, breakdown: { FREQUENCY: 60, MARKOV: 65 } },
      ];

      const uncertainty = computeQuantifiedUncertainty(
        masterScores,
        mockHistory
      );

      expect(uncertainty.epistemicUncertainty).toBeGreaterThanOrEqual(0);
      expect(uncertainty.aleatoricUncertainty).toBeGreaterThanOrEqual(0);
      expect(uncertainty.reliabilityScore).toBeGreaterThanOrEqual(0);
      expect(uncertainty.confidenceIntervals).toBeDefined();

      const scenarios = generateSimulationScenarios(masterScores);
      expect(scenarios.length).toBe(3);
      expect(scenarios[0].scenarioId).toBe('CONSERVATIVE');
      expect(scenarios[1].scenarioId).toBe('BALANCED_PARETO');
      expect(scenarios[2].scenarioId).toBe('VOLATILE_ANTIESTABLISHMENT');

      const readability = generateReadabilityReport(masterScores, uncertainty, scenarios);
      expect(readability.summary).toBeDefined();
      expect(readability.keyDrivers.length).toBeGreaterThan(0);
    });
  });
});
