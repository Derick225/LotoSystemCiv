import { describe, it, expect } from "vitest";
import {
  computeStackedChannelWeightsHpc,
  computeWalkForwardCalibrationHpc,
  CalibrationReportHpc,
} from "../services/wasm/lotoEngineBridge";
import {
  fuseChannelsLogLinearSimplex,
  calculateScores,
} from "../services/prediction/scoringEngine";
import { AlgoKey, DEFAULT_ALGO_WEIGHTS, AlgoWeights } from "../shared/prediction.types";
import { ExtractedFeatures } from "../services/prediction/featureExtractor";
import { EnhancedMetrics } from "../services/prediction/metrics.types";
import { DrawResult } from "../types";

describe("Stacking Dense des 18 Canaux & Simplexe Bayésien (AGENTS.md)", () => {
  it("garantit la convergence stricte sur le simplexe (Sum w_k = 1.0 et w_k >= 0)", () => {
    const numChannels = 18;
    const numSamples = 20;
    const stride = 91;

    // Simulation déterministe d'échantillons OOF et de cibles
    const oofFlat = new Float64Array(numSamples * numChannels * stride);
    const targetsFlat = new Float64Array(numSamples * stride);

    for (let s = 0; s < numSamples; s++) {
      // 5 numéros gagnants par tirage
      for (let w = 1; w <= 5; w++) {
        const winningNum = ((s * 7 + w * 13) % 90) + 1;
        targetsFlat[s * stride + winningNum] = 1.0;
      }

      for (let k = 0; k < numChannels; k++) {
        const kBase = s * numChannels * stride + k * stride;
        for (let n = 1; n <= 90; n++) {
          // Score continu centré autour de 5.0 / 90.0
          const signal = targetsFlat[s * stride + n] === 1.0 ? 0.08 : 0.04;
          oofFlat[kBase + n] = signal + ((n % 5) * 0.002);
        }
      }
    }

    const weights = computeStackedChannelWeightsHpc(oofFlat, targetsFlat, numChannels, numSamples);

    expect(weights.length).toBe(numChannels);

    let sum = 0;
    for (let k = 0; k < numChannels; k++) {
      expect(weights[k]).toBeGreaterThanOrEqual(0.0);
      expect(Number.isFinite(weights[k])).toBe(true);
      sum += weights[k];
    }

    // Conservation de la masse probabiliste sur le simplexe à 1e-6 près
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-5);
  });

  it("garantit que la fusion log-linéaire projette exactement sur le simplexe marginal (Sum p_n = 5.0)", () => {
    const channelScores: Record<string, number[]> = {};
    const weights: AlgoWeights = { ...DEFAULT_ALGO_WEIGHTS };

    // Initialisation déterministe de 18 canaux pour 90 numéros
    const activeKeys = [
      AlgoKey.FREQUENCY,
      AlgoKey.GAPS,
      AlgoKey.SPECTRAL,
      AlgoKey.MARKOV,
      AlgoKey.BAYES,
      AlgoKey.MOMENTUM,
      AlgoKey.AFFINITY,
      AlgoKey.SPATIAL,
      AlgoKey.TEMPORAL,
      AlgoKey.FRACTAL,
      AlgoKey.SHADOW_PROBABILITY,
      AlgoKey.NETWORK_CORRELATION,
      AlgoKey.ECHO_STATE,
      AlgoKey.DERIVED_NEIGHBOR,
      AlgoKey.GAP_CADENCE,
      AlgoKey.GAP_TREND,
      AlgoKey.ISOLATION_ANOMALY,
      AlgoKey.GAP_BAND_SEQUENCE,
    ];

    activeKeys.forEach((key, kIdx) => {
      channelScores[key] = [];
      for (let n = 1; n <= 90; n++) {
        // Score brut entre 10 et 90
        const val = 10.0 + ((n * 17 + kIdx * 31) % 80);
        channelScores[key].push(val);
      }
    });

    const result = fuseChannelsLogLinearSimplex(channelScores, weights);

    expect(result.probabilities.length).toBe(91);

    let sumP = 0;
    for (let n = 1; n <= 90; n++) {
      const p = result.probabilities[n];
      expect(p).toBeGreaterThanOrEqual(0.0);
      expect(p).toBeLessThanOrEqual(1.0);
      sumP += p;
    }

    // La somme des probabilités marginales sur 90 numéros doit être égale à 5.0 (taille d'un tirage)
    expect(Math.abs(sumP - 5.0)).toBeLessThan(1e-5);
  });

  it("calibre rigoureusement le Brier Score et le Brier Skill Score comparé au hasard", () => {
    const uniformBenchmark = (5.0 * 85.0) / (90.0 * 90.0); // 0.0524691358...

    // Pour un historique vide ou insuffisant, BSS doit être neutre (0.0) et BS égal à la référence
    const emptyReport = computeWalkForwardCalibrationHpc("TEST_EMPTY", 10);
    expect(emptyReport.brierScore).toBeCloseTo(uniformBenchmark, 4);
    expect(emptyReport.brierSkillScore).toBe(0.0);
    expect(emptyReport.decileCalibration.length).toBe(10);
    expect(emptyReport.ece).toBeGreaterThanOrEqual(0.0);
  });

  it("intègre les probabilités calibrées et logits dans calculateScores sans briser le classement", () => {
    const features: ExtractedFeatures = {
      freqMap: new Map([[1, 10], [2, 5]]),
      gapsMap: new Map([[1, 2], [2, 8]]),
      markovMap: new Map(),
      affinityMatrix: new Map(),
      momentumMap: new Map(),
      spatialMap: new Map(),
      temporalMap: new Map(),
      fractalMap: new Map(),
      shadowMap: new Map(),
      networkMap: new Map(),
      echoStateMap: new Map(),
      gapSequenceMap: new Map(),
      derivedNeighborMap: new Map(),
      gapPatternMap: new Map(),
      sequencePatternMap: new Map(),
      gapCadenceMap: new Map(),
      gapTrendMap: new Map(),
      interMonthlyMap: new Map(),
      anomalyMap: new Map(),
      gapBandSequenceMap: new Map(),
      machineTransferMap: new Map(),
      interDrawResonanceMap: new Map(),
    };

    const weights: AlgoWeights = { ...DEFAULT_ALGO_WEIGHTS };
    const advancedMetrics: EnhancedMetrics = {
      shannonEntropy: 0.95,
      hurstExponent: 0.55,
      spectralPower: {},
      topologicalTension: {},
      statisticalBounds: {
        median: 45,
        q1: 22.5,
        q3: 67.5,
        variance: 10,
        kurtosis: 0,
        skewness: 0,
        shannonEntropy: 0.95,
        hurstExponent: 0.55,
      },
    };

    const mockHistory: DrawResult[] = [
      {
        id: "1",
        drawName: "TEST_DRAW",
        date: "2026-01-01",
        winners: [1, 2, 3, 4, 5],
        gagnants: [1, 2, 3, 4, 5],
        machines: [],
      },
      {
        id: "2",
        drawName: "TEST_DRAW",
        date: "2026-01-02",
        winners: [6, 7, 8, 9, 10],
        gagnants: [6, 7, 8, 9, 10],
        machines: [],
      },
    ];

    const scored = calculateScores(features, weights, advancedMetrics, mockHistory, 0.90, "TEST_DRAW");

    expect(scored.length).toBe(90);
    // Vérifie que chaque numéro dispose de sa probabilité marginale sur simplexe
    let sumCalibP = 0;
    scored.forEach((s) => {
      expect(s.explainability?.calibratedProbability).toBeDefined();
      expect(s.explainability!.calibratedProbability).toBeGreaterThan(0.0);
      sumCalibP += s.explainability!.calibratedProbability!;
    });

    // Sum p_n = 5.0 à tolérance numérique près
    expect(Math.abs(sumCalibP - 5.0)).toBeLessThan(1e-4);
  });
});
