import { describe, it, expect } from "vitest";
import {
  computeStackedChannelWeightsHpc,
  computeWalkForwardCalibrationHpc,
  CalibrationReportHpc,
} from "../src/services/wasm/lotoEngineBridge";
import {
  fuseChannelsLogLinearSimplex,
  calculateScores,
} from "../src/services/prediction/scoringEngine";
import { AlgoKey, DEFAULT_ALGO_WEIGHTS, AlgoWeights } from "../src/shared/prediction.types";
import { ExtractedFeatures } from "../src/services/prediction/featureExtractor";
import { EnhancedMetrics } from "../src/services/prediction/metrics.types";
import { DrawResult } from "../src/types";

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
      freqMap: new Float32Array(91),
      gapsMap: new Int32Array(91),
      markovMap: new Float32Array(91),
      affinityMap: Array.from({ length: 91 }, () => new Float32Array(91)),
      momentumMap: new Float32Array(91),
      machineTransferMap: new Float32Array(91),
      shadowProbabilityMap: new Float32Array(91),
      networkCorrelationMap: new Float32Array(91),
      interDrawMap: new Float32Array(91),
    };
    features.freqMap[1] = 10;
    features.freqMap[2] = 5;
    features.gapsMap[1] = 2;
    features.gapsMap[2] = 8;

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
        gagnants: [1, 2, 3, 4, 5],
        machine: [],
      },
      {
        id: "2",
        drawName: "TEST_DRAW",
        date: "2026-01-02",
        gagnants: [6, 7, 8, 9, 10],
        machine: [],
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

  it("calcule 10 déciles quantiles peuplés, un holdout gelé et un block-bootstrap déterministe sur dates DD/MM/YYYY", () => {
    const history: DrawResult[] = [];
    let state = 133742 >>> 0;
    const nextLcg = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };

    // 35 tirages triés du plus récent (index 0) au plus ancien (index 34) au format DD/MM/YYYY
    for (let i = 0; i < 35; i++) {
      const winners = new Set<number>();
      winners.add(((35 - i) % 10) + 1);
      while (winners.size < 5) {
        winners.add(Math.floor(nextLcg() * 90) + 1);
      }
      const d = new Date(Date.UTC(2025, 0, 35 - i));
      const dateStr = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
      history.push({
        id: `WF-${i}`,
        drawName: "FORTUNE THURSDAY",
        date: dateStr,
        gagnants: Array.from(winners).sort((a, b) => a - b),
        machine: [],
      });
    }

    const repA = computeWalkForwardCalibrationHpc("FORTUNE THURSDAY", 15, history);
    const repB = computeWalkForwardCalibrationHpc("FORTUNE THURSDAY", 15, history);

    expect(repA).toEqual(repB);
    expect(repA.evaluatedWindows).toBe(15);
    expect(repA.holdoutDraws).toBeGreaterThanOrEqual(5);
    expect(repA.holdoutBrierSkillScore).toBeGreaterThanOrEqual(-1.0);
    expect(repA.holdoutBrierSkillScore).toBeLessThanOrEqual(1.0);
    expect(repA.blockBootstrapBssStd).toBeGreaterThan(0);
    expect(repA.logLoss).toBeGreaterThan(0);

    // Chaque décile D1..D10 doit être réellement peuplé et ordonné de manière monotone
    expect(repA.decileCalibration).toHaveLength(10);
    let totalCount = 0;
    for (let i = 0; i < 10; i++) {
      expect(repA.decileCalibration[i].count).toBeGreaterThan(0);
      totalCount += repA.decileCalibration[i].count;
      if (i > 0) {
        expect(repA.decileCalibration[i].meanPredicted).toBeGreaterThanOrEqual(
          repA.decileCalibration[i - 1].meanPredicted
        );
      }
    }
    expect(totalCount).toBe(repA.evaluatedWindows * 90);
  });

  it("préserve strictement les poids nuls (ex: MACHINE_TRANSFER = 0) et couvre les 25 canaux dans le dashboard", async () => {
    const {
      CHANNELS_CATALOG,
      buildChannelSimplexRows,
      computeReliabilityAxisScale,
    } = await import("../src/components/prediction/PredictiveCalibrationAnalyticsDashboard");
    const { ACTIVE_ALGO_COUNT } = await import("../src/shared/prediction.types");

    const activeKeys = Object.values(AlgoKey);
    expect(activeKeys.length).toBe(ACTIVE_ALGO_COUNT);
    activeKeys.forEach((k) => {
      expect(CHANNELS_CATALOG[k]).toBeDefined();
      expect(CHANNELS_CATALOG[k].formula.length).toBeGreaterThan(1);
    });

    const weights: Record<string, number> = {};
    activeKeys.forEach((k) => {
      weights[k] = k === AlgoKey.MACHINE_TRANSFER ? 0 : 1 / (activeKeys.length - 1);
    });

    const { rows, hasExplicitWeights } = buildChannelSimplexRows(weights);
    expect(hasExplicitWeights).toBe(true);
    expect(rows).toHaveLength(ACTIVE_ALGO_COUNT);

    const machineRow = rows.find((r) => r.key === AlgoKey.MACHINE_TRANSFER)!;
    expect(machineRow.rawWeight).toBe(0);
    expect(machineRow.simplexWeight).toBe(0);
    expect(machineRow.percentage).toBe("0.00");
    expect(machineRow.isActive).toBe(false);

    const sumSimplex = rows.reduce((acc, r) => acc + r.simplexWeight, 0);
    expect(sumSimplex).toBeCloseTo(1.0, 6);

    const scale = computeReliabilityAxisScale([
      { decile: 1, meanPredicted: 0.032, meanObserved: 0.025, count: 135 },
      { decile: 10, meanPredicted: 0.094, meanObserved: 0.112, count: 135 },
    ]);
    expect(scale.axisMax).toBeGreaterThanOrEqual(0.12);
    expect(scale.ticks[0]).toBe(0);
    expect(scale.ticks[4]).toBeCloseTo(scale.axisMax, 6);
  });
});
