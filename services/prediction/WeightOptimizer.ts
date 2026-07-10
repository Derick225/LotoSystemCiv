import { DrawResult, AlgoWeights } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { normalizeWeights } from "./weightsManager";
import { extractFeatures } from "./featureExtractor";
import { calculateScores } from "./scoringEngine";
import { EnhancedMetrics } from "./metrics.types";
import { logger } from "../../utils/logger";
import { calculateSpatioTemporalHawkes } from "../../utils/engine/hawkesEngine";
import {
  calculatePoissonScores, calculateTemporalScores, calculateDigitalRootAnalysis,
  calculateResistanceScores, calculateGapVelocityScores, calculateLeaderSuccession,
  calculateFractalResonance, calculateSpatialHotSpots, calculateCoOccurrenceScores,
  calculateAnomalyScores, calculateHawkesExcitation, calculateBayesianScore,
  calculateTopologicalLyapunov, calculateAiIntuition
} from "../advancedMathService";

const TICKET_SIZE = 5;

const TUNING = {
  DEFAULT_SGD_LEARNING_RATE: 0.015,
} as const;

type AlgoBundle = EnhancedMetrics;
const buildAlgoBundle = (
  subHistory: DrawResult[],
  drawName: string,
  useSpatioTemporalHawkes: boolean,
): AlgoBundle => {
  const subHawkes = useSpatioTemporalHawkes
    ? calculateSpatioTemporalHawkes(subHistory, drawName)
    : calculateHawkesExcitation(subHistory);
  return {
    poisson: calculatePoissonScores(subHistory),
    temporal: calculateTemporalScores(subHistory),
    digitalRoot: calculateDigitalRootAnalysis(subHistory),
    resistance: calculateResistanceScores(subHistory),
    gapVelocity: calculateGapVelocityScores(subHistory),
    leaderSuccession: calculateLeaderSuccession(subHistory),
    fractalResonance: calculateFractalResonance(subHistory),
    spatial: calculateSpatialHotSpots(subHistory),
    coOccurrence: calculateCoOccurrenceScores(subHistory),
    anomaly: calculateAnomalyScores(subHistory),
    hawkes: subHawkes,
    bayesian: calculateBayesianScore(subHistory),
    topological: calculateTopologicalLyapunov(subHistory),
    aiIntuition: calculateAiIntuition(subHistory, {}),
  };
};

export const applyDeterministicMicroSgd = async (
  drawName: string,
  weights: AlgoWeights,
  history: DrawResult[],
  entropyValue: number,
  learningRateOverride: number | undefined,
  useSpatioTemporalHawkes: boolean,
): Promise<AlgoWeights> => {
  let adjustedWeights = { ...weights };
  const K = Math.min(5, history.length - 1);
  if (K <= 0) return adjustedWeights;

  const baseEta = learningRateOverride !== undefined ? learningRateOverride : TUNING.DEFAULT_SGD_LEARNING_RATE;
  const eta = baseEta * (1.0 - Math.pow(entropyValue, 2.0));

  const bundleCache = new Map<number, AlgoBundle>();
  let failedDraws = 0;
  let attempted = 0;

  for (let t = K - 1; t >= 0; t--) {
    const targetDraw = history[t];
    const subHistory = history.slice(t + 1);
    if (subHistory.length < 5) continue;

    const gagnants = targetDraw.gagnants;
    if (!gagnants || gagnants.length === 0) continue;

    attempted++;
    try {
      let subMetrics = bundleCache.get(subHistory.length);
      if (!subMetrics) {
        subMetrics = buildAlgoBundle(subHistory, drawName, useSpatioTemporalHawkes);
        bundleCache.set(subHistory.length, subMetrics);
      }

      const subFeatures = await extractFeatures(drawName, subHistory);
      const scoredNumbers = calculateScores(subFeatures, adjustedWeights, subMetrics, subHistory);

      let maxScore = -Infinity;
      scoredNumbers.forEach(s => { if (s.score > maxScore) maxScore = s.score; });

      let sumExp = 0;
      const expScores: Record<number, number> = {};
      scoredNumbers.forEach(s => {
        const expVal = Math.exp(s.score - maxScore);
        expScores[s.num] = expVal;
        sumExp += expVal;
      });

      const probs: Record<number, number> = {};
      scoredNumbers.forEach(s => {
        probs[s.num] = sumExp > 0 ? expScores[s.num] / sumExp : 1.0 / 90.0;
      });

      const gradients: Record<string, number> = {};
      const algoKeys = Object.keys(adjustedWeights);
      algoKeys.forEach(algo => { gradients[algo] = 0; });

      scoredNumbers.forEach(s => {
        const isWinner = gagnants.includes(s.num);
        const y_i = isWinner ? 1.0 / TICKET_SIZE : 0.0; 
        const diff = probs[s.num] - y_i;

        algoKeys.forEach(algo => {
          const C_ia = (s.breakdown?.[algo as AlgoKey] as number) || 0;
          gradients[algo] += diff * C_ia;
        });
      });

      algoKeys.forEach(algo => {
        adjustedWeights[algo as AlgoKey] = Math.max(0, (adjustedWeights[algo as AlgoKey] || 0) - eta * gradients[algo]);
      });

      adjustedWeights = normalizeWeights(adjustedWeights);
    } catch (e) {
      failedDraws++;
      logger.debug({ err: e, t }, "[predictionFacade] SGD: échec sur un tirage");
    }
  }

  if (attempted > 0 && failedDraws / attempted > 0.25) {
    logger.warn(
      { failedDraws, attempted, rate: failedDraws / attempted },
      "[predictionFacade] SGD: taux d'échec élevé — les poids peuvent ne pas s'être entraînés",
    );
  }

  return adjustedWeights;
};
