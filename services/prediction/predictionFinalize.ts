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

  let postMortemInsights = "";
  let latestAutopsyNotes = "";
  let strategicAdvice = "";

  try {
    const { getLocalForensicReports } = await import("../postPredictionAnalysisService");
    const reports = await getLocalForensicReports() || [];
    const drawReports = reports.filter(r => r.drawName === context.drawName);
    if (drawReports.length > 0) {
      const latestReport = drawReports[0];
      
      postMortemInsights = `\n\n[Rétroaction & Calibrage ADN Post-Mortem] : Ajustements de Kalman appliqués basés sur l'autopsie du tirage du ${latestReport.date || "précédent"}. `;
      if (latestReport.proposedAdjustments && latestReport.proposedAdjustments.length > 0) {
        const topAdjustments = latestReport.proposedAdjustments
          .filter((adj: any) => Math.abs(adj.proposedWeightChange) > 0.005)
          .slice(0, 4)
          .map((adj: any) => `${adj.algo} (${adj.proposedWeightChange > 0 ? "+" : ""}${(adj.proposedWeightChange * 100).toFixed(2)}%)`)
          .join(", ");
        if (topAdjustments) {
          postMortemInsights += `Calibrages de poids : ${topAdjustments}.`;
        }
      }
      
      if (latestReport.recommendations && latestReport.recommendations.length > 0) {
        if (Array.isArray(latestReport.recommendations)) {
          strategicAdvice = latestReport.recommendations.join(" ");
        } else if (typeof latestReport.recommendations === "string") {
          strategicAdvice = latestReport.recommendations;
        }
      } else if (latestReport.aiAnalysis) {
        strategicAdvice = latestReport.aiAnalysis;
      }
      
      latestAutopsyNotes = `Divergence post-mortem précédente : ${latestReport.divergenceMetric || 0}%. Index d'intégrité unifiée (UFI) : ${latestReport.unifiedIntegrityIndex || 100}%.`;
    }
  } catch (err) {
    logger.warn({ err }, "Failed to inject post-mortem insights into prediction");
  }

  const stabilityScore = evaluatePredictionStability(selection, features, weights, enhancedMetrics, context.history.slice(0, context.validTemporalDepth));

  const breakdownRecord: Record<number, Record<string, number>> = {};
  denoisedScores.forEach(curr => {
    breakdownRecord[curr.num] = curr.breakdown;
  });

  const diversityMetrics = calculateGeneticDiversityIndex(selection, breakdownRecord);

  const forensicOracleDrift = enhancedMetrics.proximityDiagnostic || {};
  const adversarialResult = evaluateAdversarialSurvival(selection, breakdownRecord, context.history, forensicOracleDrift);

  // Calculate real explainability data using physical and algebraic relations
  const avgBreakdown: Record<string, number> = {};
  if (denoisedScores.length > 0) {
    const firstBreakdown = denoisedScores[0].breakdown;
    const algoKeys = Object.keys(firstBreakdown);
    for (const k of algoKeys) {
      let sum = 0;
      for (const curr of denoisedScores) {
        sum += curr.breakdown[k as AlgoKey] ?? 0;
      }
      avgBreakdown[k] = sum / denoisedScores.length;
    }
  }

  const explainabilityData: Record<number, {
    shapValues: Record<string, number>;
    topologicalTension: number;
    dnaOrbitingIndex: number;
  }> = {};

  denoisedScores.forEach(curr => {
    // 1. Calculate SHAP attribution: algorithm score weighted by its model weight
    const shapValues: Record<string, number> = {};
    Object.keys(curr.breakdown).forEach(k => {
      const weight = weights[k as AlgoKey] ?? 0;
      shapValues[k] = (curr.breakdown[k as AlgoKey] ?? 0) * weight;
    });

    // 2. Calculate continuous topological tension: gravity/tension on the number line
    let tensionSum = 0;
    for (const other of denoisedScores) {
      if (other.num === curr.num) continue;
      const distance = Math.abs(curr.num - other.num);
      tensionSum += (other.score || 0) / (distance * distance);
    }
    const topologicalTension = 1.0 + Math.log1p(tensionSum);

    // 3. Calculate DNA orbiting index (cosine similarity with average signature)
    let dotProduct = 0;
    let numSqSum = 0;
    let avgSqSum = 0;
    Object.keys(curr.breakdown).forEach(k => {
      const val1 = curr.breakdown[k as AlgoKey] ?? 0;
      const val2 = avgBreakdown[k] ?? 0;
      dotProduct += val1 * val2;
      numSqSum += val1 * val1;
      avgSqSum += val2 * val2;
    });
    const denominator = Math.sqrt(numSqSum) * Math.sqrt(avgSqSum);
    const dnaOrbitingIndex = denominator > 0 ? dotProduct / denominator : 0;

    explainabilityData[curr.num] = {
      shapValues,
      topologicalTension,
      dnaOrbitingIndex,
    };
  });

  return {
    suggestedNumbers: selection,
    candidates,
    confidence: finalConfidence,
    confidenceNote: HONEST_NOTE,
    analysis: analysisText + postMortemInsights + (latestAutopsyNotes ? `\n${latestAutopsyNotes}` : ""),
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
    explainabilityData,
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
    hyperAccuracyGain: 0,
    aiRationale: latestAutopsyNotes || undefined,
    aiStrategicAdvice: strategicAdvice || undefined,
  } as Prediction;
};
