import { DrawResult, Prediction, AlgoWeights } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { ExtractedFeatures } from "./featureExtractor";
import { EnhancedMetrics } from "./metrics.types";
import { calculateScores, ScoredNumber } from "./scoringEngine";
import { normalizeWeights, getCalibratedHyperparameters } from "./weightsManager";
import { calculateShannonEntropy } from "../mathService";
import { calculateGeneticDiversityIndex } from "./diversityService";
import { evaluateAdversarialSurvival } from "./adversarialProxy";
import { TUNING } from "./microSgd";
import { HONEST_NOTE } from "./predictionScenarios";
import { logger } from "../../utils/logger";
import type { PredictionRuntimeContext } from "./predictionOrchestrator";

const TICKET_SIZE = 5;

/**
 * Évaluation de la stabilité de la prédiction par perturbation des poids
 */
export const evaluatePredictionStability = (
  baseSelection: number[],
  features: ExtractedFeatures,
  weights: AlgoWeights,
  enhancedMetrics: EnhancedMetrics,
  history: DrawResult[],
): number => {
  const baseSet = new Set(baseSelection);
  const weightKeys = Object.keys(weights) as AlgoKey[];
  if (weightKeys.length === 0) return 100;

  const activeKeys = weightKeys
    .filter((k) => (weights[k] || 0) > (1.0 / weightKeys.length))
    .sort((a, b) => (weights[b] || 0) - (weights[a] || 0))
    .slice(0, 3);

  if (activeKeys.length === 0) return 100;

  let totalOverlap = 0;
  activeKeys.forEach((k) => {
    const perturbationFactor = 1.0 + (1.0 / weightKeys.length);
    const perturbedWeights = { ...weights };
    perturbedWeights[k] = (perturbedWeights[k] || 0) * perturbationFactor;
    const normPerturbed = normalizeWeights(perturbedWeights, { bypassCap: true });
    const perturbedScores = calculateScores(features, normPerturbed, enhancedMetrics, history);
    const sortedPerturbed = perturbedScores.sort((a, b) => b.score - a.score);
    const perturbedSelection = sortedPerturbed.slice(0, TICKET_SIZE).map((s) => s.num);
    const overlap = perturbedSelection.filter((n) => baseSet.has(n)).length;
    totalOverlap += overlap / TICKET_SIZE;
  });

  return Math.round((totalOverlap / activeKeys.length) * 100);
};

export const finalizePredictionPayload = async (
  context: PredictionRuntimeContext,
  denoisedScores: ScoredNumber[],
  selection: number[],
  candidates: number[],
  weights: AlgoWeights,
  enhancedMetrics: EnhancedMetrics,
  features: ExtractedFeatures,
  shrinkageApplied: boolean,
  shrinkageFactor: number
): Promise<Prediction> => {
  const sortedScores = [...denoisedScores].sort((a, b) => b.score - a.score);
  
  let averageScore = sortedScores.slice(0, TICKET_SIZE).reduce((a, b) => a + (b.score || 0), 0) / TICKET_SIZE;
  if (isNaN(averageScore) || averageScore <= 0) averageScore = 45;

  const currentEntropyResult = calculateShannonEntropy(context.history);
  const currentEntropy = currentEntropyResult.normalized;
  
  const calibratedParams = await getCalibratedHyperparameters(context.drawName, currentEntropy);
  const plattA = calibratedParams.sigmoid_slope;
  const plattB = calibratedParams.sigmoid_intercept;
  
  const rawX = (averageScore - 50.0) / 15.0;
  const plattCalibratedProbability = 1.0 / (1.0 + Math.exp(-(plattA * rawX + plattB)));
  
  let calibratedConfidence = plattCalibratedProbability * 100.0 * calibratedParams.boosting_multiplier;
  
  if (shrinkageApplied) {
    calibratedConfidence *= shrinkageFactor;
  }
  
  const finalConfidence = Math.round(Math.max(1, Math.min(99, calibratedConfidence)));

  let analysisText = "";
  if (context.adversarialMode) {
    analysisText = `Prédiction Oracle Base filtrée par le Protocole Adversarial Anti-Consensus.`;
  } else if (calibratedParams.prudence_mode_active) {
    analysisText = `Mode Prudence activé : Dérive de performance détectée lors de l'autopsie post-mortem. Algorithme calibré de façon ultra-prudente.`;
  } else if (shrinkageApplied) {
    analysisText = `Prédiction générée sous tension algorithmique élevée. Les scores étant très serrés, un shrinkage a été appliqué pour régulariser les probabilités.`;
  } else {
    analysisText = `Prédiction Oracle Base générée à partir de l'ADN Algorithmique du moment.`;
  }

  const stabilityScore = evaluatePredictionStability(selection, features, weights, enhancedMetrics, context.history.slice(0, context.validTemporalDepth));

  const breakdownRecord: Record<number, Record<string, number>> = {};
  denoisedScores.forEach(curr => {
    breakdownRecord[curr.num] = curr.breakdown;
  });

  const diversityMetrics = calculateGeneticDiversityIndex(selection, breakdownRecord);

  const forensicOracleDrift = enhancedMetrics.proximityDiagnostic || {};
  const adversarialResult = evaluateAdversarialSurvival(selection, breakdownRecord, context.history, forensicOracleDrift);

  return {
    suggestedNumbers: selection,
    candidates,
    confidence: finalConfidence,
    confidenceNote: HONEST_NOTE,
    analysis: analysisText,
    breakdown: breakdownRecord,
    timestamp: Date.now(),
    symbiosisFactor: context.symbioticContext ? 1.5 : 1.0,
    realityAlignment: 82,
    realityAlignmentNote: HONEST_NOTE,
    adversarialApplied: context.adversarialMode,
    challengedNumbers: [],
    stabilityScore,
    diversityMetrics,
    adversarialSurvivalScore: adversarialResult.survivalScore,
    adversarialRisks: adversarialResult.risks,
    explainabilityData: {},
    shrinkageApplied,
    shrinkageFactor,
    shrinkageFactorMap: undefined,
    shrinkageVerification: null,
    hyperparameters: {
      hawkesDecay: TUNING.DEFAULT_HAWKES_DECAY,
      spatialSigma: 1.5,
      gapVelocityWeight: 1.0,
      bayesWindowRatio: 0.1,
      sgdLearningRate: TUNING.DEFAULT_SGD_LEARNING_RATE,
      lyapunovHorizon: 15,
      ...calibratedParams
    },
    hyperTuningLog: shrinkageApplied ? ["Scenario E : Activation Shrinkage pour resserrer les scores."] : [],
    hyperAccuracyGain: 0
  } as Prediction;
};
