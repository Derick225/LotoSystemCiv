import { DrawResult } from "../../types";
import { PredictiveHyperparameters } from "./hyperParameterTuner";
import { EnhancedMetrics } from "./metrics.types";
import {
  calculatePoissonScores, calculateBayesianScore, calculateTemporalScores,
  calculateDigitalRootAnalysis, calculateResistanceScores, calculateGapVelocityScores,
  calculateLeaderSuccession, calculateAiIntuition, calculateFractalResonance,
  calculateSpatialHotSpots, calculateCoOccurrenceScores, calculateAnomalyScores,
  calculateHawkesExcitation, calculateTopologicalLyapunov
} from "../advancedMathService";
import { calculateSpatioTemporalHawkes } from "../../utils/engine/hawkesEngine";
import { calculateDnaSieveWeights } from "../temporalAnalysisService";

export const DEFAULT_HAWKES_DECAY = 0.15;

const metricsCache = new Map<string, EnhancedMetrics>();

/**
 * Calcul parallèle et mémoïsé des métriques algorithmiques avancées.
 * Évite les recalculs redondants lors des passes SGD et des pipelines de prédiction.
 */
export const computeAdvancedMetrics = async (
  localHistoryContext: DrawResult[],
  drawName: string,
  hyperparameters: Partial<PredictiveHyperparameters> = {},
  useSpatioTemporalHawkes: boolean = false,
  metrics?: EnhancedMetrics,
): Promise<EnhancedMetrics> => {
  const cacheKey = `${drawName}_${localHistoryContext.length}_${useSpatioTemporalHawkes}_${localHistoryContext[0]?.date || 'nodate'}_${(localHistoryContext[0]?.gagnants || []).join('-')}`;
  if (!metrics && Object.keys(hyperparameters).length === 0) {
    const cached = metricsCache.get(cacheKey);
    if (cached) return cached;
  }

  const [
    poissonScores, bayesScores, temporalScores, digitalRootScores,
    resistanceScores, gapVelocityScores, leaderSuccessionScores,
    aiIntuitionScores, fractalResonanceScores, spatialHotSpots,
    symbioticClusterScores, anomalyScores, hawkesExcitationScores,
    topologicalLyapunovScores, dnaSievePrior
  ] = await Promise.all([
    Promise.resolve().then(() => calculatePoissonScores(localHistoryContext)),
    Promise.resolve().then(() => calculateBayesianScore(localHistoryContext, hyperparameters.bayesWindowRatio)),
    Promise.resolve().then(() => calculateTemporalScores(localHistoryContext)),
    Promise.resolve().then(() => calculateDigitalRootAnalysis(localHistoryContext)),
    Promise.resolve().then(() => calculateResistanceScores(localHistoryContext)),
    Promise.resolve().then(() => calculateGapVelocityScores(localHistoryContext)),
    Promise.resolve().then(() => calculateLeaderSuccession(localHistoryContext)),
    Promise.resolve().then(() => calculateAiIntuition(localHistoryContext, (metrics || {}) as Record<string, unknown>)),
    Promise.resolve().then(() => calculateFractalResonance(localHistoryContext)),
    Promise.resolve().then(() => calculateSpatialHotSpots(localHistoryContext, 0.5, hyperparameters.spatialSigma)),
    Promise.resolve().then(() => calculateCoOccurrenceScores(localHistoryContext)),
    Promise.resolve().then(() => calculateAnomalyScores(localHistoryContext)),
    Promise.resolve().then(() => useSpatioTemporalHawkes
      ? calculateSpatioTemporalHawkes(localHistoryContext, drawName)
      : calculateHawkesExcitation(localHistoryContext)
    ),
    Promise.resolve().then(() => calculateTopologicalLyapunov(localHistoryContext, hyperparameters.lyapunovHorizon)),
    Promise.resolve().then(() => calculateDnaSieveWeights(localHistoryContext, undefined, drawName))
  ]);

  for (const k in gapVelocityScores) {
    gapVelocityScores[k] *= (hyperparameters.gapVelocityWeight || 1.0);
  }
  for (const k in hawkesExcitationScores) {
    hawkesExcitationScores[k] *= ((hyperparameters.hawkesDecay || DEFAULT_HAWKES_DECAY) / DEFAULT_HAWKES_DECAY);
  }

  const snr = (dnaSievePrior.stdDevDna || 0.1) / (dnaSievePrior.meanDna || 1.0);
  const sieveIntensitySNR = parseFloat(Math.min(99.9, Math.max(10.0, snr * 250)).toFixed(1));

  const result: EnhancedMetrics = {
    ...metrics,
    poisson: poissonScores,
    bayes: bayesScores,
    temporal: temporalScores,
    digitalRoot: digitalRootScores,
    resistance: resistanceScores,
    gapVelocity: gapVelocityScores,
    leaderSuccession: leaderSuccessionScores,
    aiIntuition: aiIntuitionScores,
    fractalResonance: fractalResonanceScores,
    spatial: spatialHotSpots,
    symbioticClusters: symbioticClusterScores,
    anomaly: anomalyScores,
    hawkesExcitation: hawkesExcitationScores,
    topologicalLyapunov: topologicalLyapunovScores,
    dnaSieve: {
      multipliers: dnaSievePrior.multipliers,
      affinityPercent: dnaSievePrior.affinityPercent,
      dominantAlgos: dnaSievePrior.dominantAlgos,
      compositeDna: dnaSievePrior.compositeDna,
      dnaConcordanceMean: dnaSievePrior.dnaConcordanceMean,
      entropyBits: dnaSievePrior.entropyBits,
      sieveIntensitySNR
    }
  };

  if (!metrics && Object.keys(hyperparameters).length === 0) {
    if (metricsCache.size > 50) {
      const firstKey = metricsCache.keys().next().value;
      if (firstKey) metricsCache.delete(firstKey);
    }
    metricsCache.set(cacheKey, result);
  }

  return result;
};
