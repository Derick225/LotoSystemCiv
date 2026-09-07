import { expect, test, describe } from 'vitest';
import { parseRawNumberArray, extractDrawNumbers, calculateVolatilityMap, calculateResidualEntropyMap } from '../services/prediction/featureExtractor';
import { computeAutomatedCausalAttribution, computeSystematicPredictionComparison, generateActionableImprovementReport } from '../services/postPredictionAnalysisService';
import { tuneHyperparametersFromCausalFeedback, DEFAULT_HYPERPARAMETERS } from '../services/prediction/hyperParameterTuner';
import { recordModelDnaGeneration, getModelDnaHistory, generateDnaEvolutionReport } from '../services/prediction/modelDnaKnowledgeBase';
import { calculateFusion } from '../services/fusionService';
import { calculateAdvancedPerformanceTimeline, queryPredictionsFast, invalidateHistoryIndex } from '../services/predictionHistoryService';
import { computeQuantifiedUncertainty, generateSimulationScenarios, generateReadabilityReport } from '../services/prediction/quantifiedUncertaintyEngine';
import { DrawResult, PredictionHistoryItem, AlgoWeights } from '../types';
import { getDefaultWeights } from '../services/prediction/weightsManager';

describe('1. Primary Analysis Tools - Heterogeneous Data & Key Indicators', () => {
  test('parseRawNumberArray handles strings, mixed types, out-of-bounds numbers and deduplicates', () => {
    const raw = ['12', 45, '  89  ', '999', '-5', 'NaN', '12', 7];
    const parsed = parseRawNumberArray(raw);
    expect(parsed).toEqual([12, 45, 89, 7]);
    expect(parsed.every(n => n >= 1 && n <= 90)).toBe(true);
  });

  test('extractDrawNumbers extracts numbers seamlessly from gagnants, numbers, machine, machineNumbers', () => {
    const drawA: DrawResult = {
      id: 'd1',
      date: '01/01/2026',
      gagnants: [10, 20, 30, 40, 50],
      machine: [5, 15, 25, 35, 45],
    };
    const extractedA = extractDrawNumbers(drawA);
    expect(extractedA.winners).toEqual([10, 20, 30, 40, 50]);
    expect(extractedA.machine).toEqual([5, 15, 25, 35, 45]);

    const legacyDraw = {
      id: 'd2',
      date: '02/01/2026',
      numbers: [1, 2, 3, 4, 5],
      machineNumbers: [6, 7, 8, 9, 10],
    } as any;
    const extractedB = extractDrawNumbers(legacyDraw);
    expect(extractedB.winners).toEqual([1, 2, 3, 4, 5]);
    expect(extractedB.machine).toEqual([6, 7, 8, 9, 10]);
  });

  test('calculateVolatilityMap and calculateResidualEntropyMap produce valid normalized metrics', () => {
    const history: DrawResult[] = [
      { id: '1', date: '01/01/2026', gagnants: [5, 12, 23, 45, 67] },
      { id: '2', date: '02/01/2026', gagnants: [5, 14, 23, 50, 80] },
      { id: '3', date: '03/01/2026', gagnants: [5, 18, 29, 45, 90] },
    ];
    const volMap = calculateVolatilityMap(history);
    const entropyMap = calculateResidualEntropyMap(history);

    expect(Object.keys(volMap).length).toBe(90);
    expect(Object.keys(entropyMap).length).toBe(90);

    for (let i = 1; i <= 90; i++) {
      expect(volMap[i]).toBeGreaterThanOrEqual(0);
      expect(volMap[i]).toBeLessThanOrEqual(1);
      expect(entropyMap[i]).toBeGreaterThanOrEqual(0);
      expect(entropyMap[i]).toBeLessThanOrEqual(1);
    }
  });
});

describe('2. Post-Mortem Forensic Autopsy - Causal Attribution & Actionable Reports', () => {
  test('computeAutomatedCausalAttribution correctly identifies exact hits, near-misses, and machine transfers', () => {
    const predicted = [10, 20, 30, 40, 50];
    const actual = [10, 21, 70, 80, 90]; // 10 is exact hit, 20 is near-miss to 21
    const machine = [30, 60, 61, 62, 63]; // 30 is machine transfer

    const defaultWeights = getDefaultWeights();
    const attributions = computeAutomatedCausalAttribution(
      predicted,
      actual,
      machine,
      {
        10: { bayes: 80, markov: 70 },
        20: { spatial: 60 },
        30: { machineTransfer: 90 },
        40: { fractal: 40 },
        50: { spectral: 30 },
      },
      defaultWeights,
      []
    );

    expect(attributions.length).toBe(9); // 5 predicted + 4 false negatives (21, 70, 80, 90)
    const attr10 = attributions.find(a => a.number === 10)!;
    expect(attr10.category).toBe('CONFIRMED_HIT');
    expect(attr10.attributionScore).toBeGreaterThan(0);

    const attr20 = attributions.find(a => a.number === 20)!;
    expect(attr20.category).toBe('BALLISTIC_NEAR_MISS');

    const attr30 = attributions.find(a => a.number === 30)!;
    expect(attr30.primaryCause).toContain('machine');
  });

  test('computeSystematicPredictionComparison & generateActionableImprovementReport produce valid actionable insights', () => {
    const predicted = [10, 20, 30, 40, 50];
    const actual = [10, 21, 30, 80, 90];
    const machine = [5, 15, 25, 35, 45];

    const systematic = computeSystematicPredictionComparison(predicted, actual, machine);
    expect(systematic.directHits).toEqual([10, 30]);
    expect(systematic.neighbors1.length).toBe(1);
    expect(systematic.neighbors1[0].predicted).toBe(20);
    expect(systematic.neighbors1[0].actual).toBe(21);
    expect(systematic.hitRateTop5).toBe(0.4);

    const defaultWeights = getDefaultWeights();
    const report = generateActionableImprovementReport(systematic, [], defaultWeights);
    expect(report.priorityFixes.length).toBeGreaterThan(0);
    expect(report.recommendedWeightDeltas).toBeDefined();
    expect(report.expectedAccuracyGain).toBeGreaterThanOrEqual(0);
  });
});

describe('3. Core Algorithms - Deterministic Hyperparameter Tuning', () => {
  test('tuneHyperparametersFromCausalFeedback adjusts hyperparameters bounded within defined intervals', () => {
    const base = { ...DEFAULT_HYPERPARAMETERS };
    const { tunedParams, adjustmentsApplied } = tuneHyperparametersFromCausalFeedback(
      base,
      { hawkesDecayDelta: -0.05, spatialSigmaDelta: 0.20, gapVelocityDelta: 0.15 },
      75
    );

    expect(tunedParams.hawkesDecay).toBeLessThan(base.hawkesDecay);
    expect(tunedParams.spatialSigma).toBeGreaterThan(base.spatialSigma);
    expect(tunedParams.gapVelocityWeight).toBeGreaterThan(base.gapVelocityWeight);
    expect(adjustmentsApplied.length).toBeGreaterThanOrEqual(3);
  });
});

describe('4. Model DNA Knowledge Base - Genealogical Tracking & Isolation', () => {
  test('recordModelDnaGeneration logs generations with mutation deltas and Pareto efficiency', async () => {
    const drawName = 'Test_Draw_DNA_Iso';
    const weightsA = getDefaultWeights();
    const gen0 = await recordModelDnaGeneration(drawName, weightsA, 60, 'baseline');
    expect(gen0.generation).toBe(0);
    expect(gen0.paretoEfficiency).toBeGreaterThan(0);

    const weightsB: AlgoWeights = { ...weightsA, bayes: (weightsA.bayes || 0) + 5 };
    const gen1 = await recordModelDnaGeneration(drawName, weightsB, 72, 'sgd', { parentVersionId: gen0.id });
    expect(gen1.generation).toBe(1);
    expect(gen1.relativeGain).toBe(20); // (72 - 60) / 60 * 100 = 20%
    expect(gen1.mutationDelta['bayes']).toBe(5);

    const report = await generateDnaEvolutionReport(drawName);
    expect(report.totalGenerations).toBeGreaterThanOrEqual(2);
    expect(report.netFitnessGain).toBe(12);
  });
});

describe('5. Fusion Layer - Collinear De-correlation & Alignment', () => {
  test('calculateFusion applies Kalman filtering with de-correlation and produces valid fusion results', () => {
    const history: DrawResult[] = [
      { id: '1', date: '01/01/2026', gagnants: [1, 2, 3, 4, 5] },
      { id: '2', date: '02/01/2026', gagnants: [10, 20, 30, 40, 50] },
      { id: '3', date: '03/01/2026', gagnants: [1, 10, 20, 30, 40] },
      { id: '4', date: '04/01/2026', gagnants: [5, 15, 25, 35, 45] },
    ];

    const stats = Array.from({ length: 90 }, (_, i) => ({ number: i + 1, count: 5 }));
    const spectral = Array.from({ length: 90 }, (_, i) => ({ number: i + 1, energy: 0.5, phase: 0.1 }));

    const fusion = calculateFusion(
      history,
      stats,
      spectral,
      null,
      getDefaultWeights()
    );

    expect(fusion).toBeDefined();
    expect(fusion.finalTicket.length).toBe(5);
    expect(fusion.finalTicket.every(n => n >= 1 && n <= 90)).toBe(true);
    expect(fusion.confidence).toBeGreaterThanOrEqual(0);
    expect(fusion.confidence).toBeLessThanOrEqual(100);
    expect(fusion.entropy).toBeGreaterThanOrEqual(0);
  });
});

describe('6. Prediction History & Quantified Future Uncertainty', () => {
  test('calculateAdvancedPerformanceTimeline computes accurate chronological metrics', () => {
    const drawName = 'Test_Perf_Timeline';
    const predictions: PredictionHistoryItem[] = [
      {
        id: 'p1',
        drawName,
        timestamp: 1000,
        prediction: {
          suggestedNumbers: [1, 2, 3, 4, 5],
          confidence: 80,
        } as any,
      },
      {
        id: 'p2',
        drawName,
        timestamp: 2000,
        prediction: {
          suggestedNumbers: [10, 20, 30, 40, 50],
          confidence: 85,
        } as any,
      },
    ];

    const results: DrawResult[] = [
      { id: 'r1', drawName, date: '01/01/2026', gagnants: [1, 2, 3, 11, 12] }, // 3 hits
      { id: 'r2', drawName, date: '02/01/2026', gagnants: [10, 20, 33, 44, 55] }, // 2 hits
    ];

    predictions[0].drawResultId = 'r1';
    predictions[1].drawResultId = 'r2';

    const perf = calculateAdvancedPerformanceTimeline(drawName, predictions, results);
    expect(perf.evaluatedPredictions).toBe(2);
    expect(perf.hitDistribution.hits3).toBe(1);
    expect(perf.hitDistribution.hits2).toBe(1);
    expect(perf.hitRateTop5Pct).toBe(100);
    expect(perf.exact3PlusPct).toBe(50);
  });

  test('computeQuantifiedUncertainty, generateSimulationScenarios, and generateReadabilityReport produce full uncertainty decomposition', () => {
    const scoredNumbers = Array.from({ length: 90 }, (_, i) => ({
      num: i + 1,
      score: 90 - i,
      breakdown: { algoA: 50, algoB: 45 },
    }));

    const history: DrawResult[] = [
      { id: '1', date: '01/01/2026', gagnants: [1, 2, 3, 4, 5] },
      { id: '2', date: '02/01/2026', gagnants: [6, 7, 8, 9, 10] },
    ];

    const uncertainty = computeQuantifiedUncertainty(scoredNumbers, history);
    expect(uncertainty.epistemicUncertainty).toBeGreaterThanOrEqual(0);
    expect(uncertainty.aleatoricUncertainty).toBeGreaterThanOrEqual(0);
    expect(uncertainty.totalEntropyBits).toBeGreaterThan(0);
    expect(uncertainty.confidenceIntervals[1]).toBeDefined();
    expect(uncertainty.confidenceIntervals[1].lower).toBeLessThanOrEqual(uncertainty.confidenceIntervals[1].upper);

    const scenarios = generateSimulationScenarios(scoredNumbers);
    expect(scenarios.length).toBe(3);
    expect(scenarios[0].suggestedNumbers.length).toBe(5);

    const report = generateReadabilityReport([1, 2, 3, 4, 5], scoredNumbers, uncertainty);
    expect(report.summary).toContain('Combinaison retenue');
    expect(report.keyDrivers.length).toBeGreaterThan(0);
    expect(report.riskAssessment).toBeDefined();
  });
});
