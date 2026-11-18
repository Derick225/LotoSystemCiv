import { describe, it, expect } from 'vitest';
import {
  generateNeuralPredictionPDF,
  generateForensicLogPDF,
  generateForensicStochasticReportPDF,
  generateUnifiedForensicScenarioPDF,
  exportPythonCore,
} from '../src/services/export/pdf';
import {
  runMonteCarloWhatIfHpc,
  computeKlDivergenceHpc,
  runFinancialSimulationHpc,
  computeClosedLoopAutopsyHpc,
  computeSpatialGridHpc,
  computePearsonCorrelationMatrixHpc,
  computeTopologicalProximityVectorHpc,
  NUMBER_GEO_TABLE,
} from '../src/services/wasm/lotoEngineBridge';
import * as simulationAutopsyBridge from '../src/services/wasm/simulationAutopsyBridge';
import * as spatialTensorBridge from '../src/services/wasm/spatialTensorBridge';
import { DEFAULT_ALGO_WEIGHTS } from '../src/shared/prediction.types';
import type { UnifiedForensicScenario } from '../src/services/forensic/forensicProofStandard';

describe('PDF Export Engine (jsPDF + autoTable)', () => {
  it('generates a multi-section Neural Prediction PDF with real byte payload', async () => {
    const meta = await generateNeuralPredictionPDF({
      drawName: 'MONDAY SPECIAL',
      suggestedNumbers: [7, 19, 34, 62, 88],
      candidates: [11, 25, 43, 55, 79],
      confidence: 74.5,
      realityAlignment: 81.2,
      stabilityScore: 69.8,
      diversityScore: 1.42,
      adversarialSurvivalScore: 76.0,
      mathModelSummary: 'Inférence Locale Neuro-Vectorielle HPC',
      analysis: 'Convergence spectrale validee sur fenetre glissante.',
      aiRationale: 'Exposant de Hurst persistant et entropie moderee.',
      aiStrategicAdvice: 'Privilegier couverture equilibrée pair/impair.',
      xapExp: [
        {
          number: 7,
          dominantAlgo: 'hurst',
          contributionPercentage: 31.4,
          compositionGini: 0.42,
          compositionEntropy: 1.85,
          synergyAlgos: ['markov', 'hawkes'],
        },
        {
          number: 34,
          dominantAlgo: 'bayesian',
          contributionPercentage: 28.0,
          compositionGini: 0.39,
          compositionEntropy: 1.91,
          synergyAlgos: ['spectral'],
        },
      ],
      aiWeights: { hurst: 1.35, bayesian: 1.18, markov: 1.04 },
      timestamp: 1730000000000,
    });

    expect(meta.fileName).toBe('lotopro_ia_prediction_monday_special_2024-10-27.pdf');
    expect(meta.pageCount).toBeGreaterThanOrEqual(1);
    expect(meta.sizeBytes).toBeGreaterThan(1000);
  });

  it('generates a Forensic Log PDF with verified and pending draws', async () => {
    const meta = await generateForensicLogPDF({
      drawName: 'LUCKY TUESDAY',
      items: [
        {
          timestamp: 1730000000000,
          suggestedNumbers: [5, 18, 29, 44, 71],
          confidence: 68,
          result: {
            id: 'draw-1',
            drawName: 'LUCKY TUESDAY',
            date: '2024-10-27',
            gagnants: [5, 19, 29, 60, 81],
          },
          hits: [5, 29],
          nearMisses: [18],
          precisionPct: 40,
        },
        {
          timestamp: 1730086400000,
          suggestedNumbers: [3, 14, 41, 56, 82],
          confidence: 64,
          result: null,
          hits: [],
          nearMisses: [],
          precisionPct: 0,
        },
      ],
    });

    expect(meta.fileName).toContain('lotopro_forensic_log_lucky_tuesday_');
    expect(meta.pageCount).toBeGreaterThanOrEqual(1);
    expect(meta.sizeBytes).toBeGreaterThan(1000);
  });

  it('generates a Forensic Stochastic Report PDF and Unified Scenario PDF', async () => {
    const stochasticMeta = await generateForensicStochasticReportPDF({
      drawName: 'NATIONAL',
      suggestedNumbers: [2, 21, 37, 54, 89],
      candidates: [9, 33, 48, 67, 75],
      confidence: 71.2,
      stabilityScore: 73.0,
      realityAlignment: 79.4,
      currentEntropy: 6.12,
      gameRegimeInfo: {
        regime: 'PERSISTANT',
        hurst: 0.562,
        chaosDimension: 2.34,
        weylDiscrepancy: 0.0412,
        entropy: 6.12,
        volatility: 14.5,
      },
      resolvedNoiseLevel: 0.045,
      resolvedLearningRate: 0.012,
      resolvedMcIterations: 250,
      appliedWeights: { hurst: 1.25, hawkes: 1.15 },
      empiricalProofs: {
        hurst: { brierSkillScore: 0.0412, hitRate: 32.0, sampleCount: 40 },
      },
      analysis: 'Alignement stochastique verifie.',
      hasMachineData: false,
    });

    expect(stochasticMeta.fileName).toContain('lotopro_stochastic_report_national_');
    expect(stochasticMeta.pageCount).toBeGreaterThanOrEqual(1);
    expect(stochasticMeta.sizeBytes).toBeGreaterThan(1000);

    const scenario: UnifiedForensicScenario = {
      schemaVersion: '12.0.0-UNIFIED-FORENSIC',
      id: 'sc-national-01',
      scenarioType: 'CLOSED_LOOP_AUTOPSY',
      exportTimestamp: '2026-02-15T12:00:00.000Z',
      drawName: 'NATIONAL',
      drawFamily: 'hebdomadaire',
      mathMetadata: {
        shannonEntropy: 6.21,
        hurstExponent: 0.54,
        shapDecomposition: { hurst: 35, hawkes: 25 },
        hawkesIntensity: 0.18,
        weylDiscrepancy: 0.031,
        chaosDimension: 2.15,
        brierScore: 0.21,
        topologicalLoss: 1.4,
      },
      appliedWeights: { ...DEFAULT_ALGO_WEIGHTS },
      fingerprint: 'dna-fp-001',
      summary: {
        hitRate: 28.5,
        accuracyScore: 72.4,
        sampleCount: 50,
        regime: 'HARMONISE',
        causalAuditTrail: ['Etape 1: Verification gradient Kalman', 'Etape 2: Re-ponderation continue'],
      },
      payload: {},
    };

    const scenarioMeta = await generateUnifiedForensicScenarioPDF(scenario);
    expect(scenarioMeta.fileName).toBe('lotopro_scenario_closed_loop_autopsy_national_2026-02-15.pdf');
    expect(scenarioMeta.pageCount).toBeGreaterThanOrEqual(1);
    expect(scenarioMeta.sizeBytes).toBeGreaterThan(1000);
    expect(exportPythonCore()).toBeUndefined();
  });
});

describe('WASM Bridge Modular Re-exports Parity & Determinism', () => {
  it('re-exports simulationAutopsyBridge and spatialTensorBridge identically through lotoEngineBridge', () => {
    expect(runMonteCarloWhatIfHpc).toBe(simulationAutopsyBridge.runMonteCarloWhatIfHpc);
    expect(computeKlDivergenceHpc).toBe(simulationAutopsyBridge.computeKlDivergenceHpc);
    expect(runFinancialSimulationHpc).toBe(simulationAutopsyBridge.runFinancialSimulationHpc);
    expect(computeClosedLoopAutopsyHpc).toBe(simulationAutopsyBridge.computeClosedLoopAutopsyHpc);

    expect(computeSpatialGridHpc).toBe(spatialTensorBridge.computeSpatialGridHpc);
    expect(computePearsonCorrelationMatrixHpc).toBe(spatialTensorBridge.computePearsonCorrelationMatrixHpc);
    expect(computeTopologicalProximityVectorHpc).toBe(spatialTensorBridge.computeTopologicalProximityVectorHpc);
    expect(NUMBER_GEO_TABLE).toBe(spatialTensorBridge.NUMBER_GEO_TABLE);
    expect(NUMBER_GEO_TABLE).toHaveLength(91);
  });

  it('produces 100% deterministic outputs across Monte Carlo What-If, Autopsy, and Spatial Grid bridges', () => {
    const kAlgos = 4;
    const baseMatrix = new Float64Array(90 * kAlgos);
    for (let i = 0; i < baseMatrix.length; i++) {
      baseMatrix[i] = ((i * 37) % 100) / 100;
    }
    const baseWeights = new Float64Array([0.4, 0.3, 0.2, 0.1]);

    const mc1 = runMonteCarloWhatIfHpc({
      baseMatrix,
      kAlgos,
      baseWeights,
      iterations: 25,
      noiseStdDev: 0.05,
      seed: 987654321,
    });
    const mc2 = runMonteCarloWhatIfHpc({
      baseMatrix,
      kAlgos,
      baseWeights,
      iterations: 25,
      noiseStdDev: 0.05,
      seed: 987654321,
    });
    expect(mc1).toHaveLength(90);
    expect(mc1).toEqual(mc2);

    const pUniform = new Float64Array(90).fill(1 / 90);
    expect(computeKlDivergenceHpc(pUniform, pUniform)).toBe(0);

    const flatDraws = new Int32Array([
      4, 15, 28, 53, 79,
      11, 22, 44, 61, 88,
      4, 19, 33, 55, 72,
    ]);
    const spatial1 = computeSpatialGridHpc(flatDraws, 3);
    const spatial2 = computeSpatialGridHpc(flatDraws, 3);
    expect(Array.from(spatial1.gridDensity)).toEqual(Array.from(spatial2.gridDensity));
    expect(spatial1.barycenterX).toBeCloseTo(spatial2.barycenterX, 10);
    expect(spatial1.entropy).toBeGreaterThan(0);

    const contribs = new Float64Array(4 * 91).fill(0.1);
    const autopsy = computeClosedLoopAutopsyHpc({
      predictedNumbers: [4, 15, 28, 53, 79],
      actualWinners: [4, 16, 40, 53, 90],
      currentWeights: baseWeights,
      algoContributionsFlat: contribs,
      numAlgos: 4,
      historyDepth: 20,
    });
    expect(autopsy.exactHits).toBe(2);
    expect(autopsy.nearMisses).toBe(1);
    expect(autopsy.updatedWeights).toHaveLength(4);

    const fin = runFinancialSimulationHpc({
      hitsHistory: [2, 0, 1, 2, 0],
      confidences: [65, 55, 58, 70, 52],
      multipliers: [4.0, 1.0, 1.0, 4.0, 1.0],
      strategyCode: 0,
      initialBankroll: 1000,
      unitBet: 50,
    });
    expect(fin.balances).toHaveLength(5);
    expect(fin.netProfit).toBeGreaterThan(0);

    const prox = computeTopologicalProximityVectorHpc([4, 28, 79]);
    expect(prox[4]).toBe(1.0);
    expect(prox[28]).toBe(1.0);
  });
});
