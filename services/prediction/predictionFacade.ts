import { DrawResult, Prediction, AlgoWeights, SymbioticContext, ForensicReport } from "../../types";
import { generateMasterPredictionCore as coreScorer } from "./PredictionScorer";
import { EnhancedMetrics } from "./metrics.types";

export const generateMasterPredictionCore = async (
  drawName: string,
  history: DrawResult[],
  temporalDepth: number,
  weightsToUse: AlgoWeights | undefined,
  metrics: EnhancedMetrics | undefined,
  symbioticContext: SymbioticContext | undefined,
  skipTraining: boolean,
  adversarialMode: boolean,
  forcedOutsiderCount: number | undefined,
  isForensicOptimized: boolean,
  useSpatioTemporalHawkes: boolean,
  onProgress?: (progress: number, message: string) => void,
  preloadedForensicReports?: ForensicReport[]
): Promise<Prediction> => {
  return await coreScorer(
    drawName,
    history,
    temporalDepth,
    weightsToUse,
    metrics,
    symbioticContext,
    skipTraining,
    adversarialMode,
    forcedOutsiderCount,
    isForensicOptimized,
    useSpatioTemporalHawkes,
    onProgress,
    preloadedForensicReports
  );
};

export const generateMasterPrediction = async (
  drawName: string,
  history: DrawResult[],
  temporalDepth: number = 100,
  weights?: AlgoWeights,
  metrics?: EnhancedMetrics,
  context?: SymbioticContext,
  skipTraining: boolean = false,
  adversarialMode: boolean = false,
  forcedOutsiderCount?: number,
  isForensicOptimized: boolean = false,
  onProgress?: (progress: number, message: string) => void,
  useSpatioTemporalHawkes: boolean = true
): Promise<Prediction> => {
  return await generateMasterPredictionCore(
    drawName,
    history,
    temporalDepth,
    weights,
    metrics,
    context,
    skipTraining,
    adversarialMode,
    forcedOutsiderCount,
    isForensicOptimized,
    useSpatioTemporalHawkes,
    onProgress,
    undefined
  );
};
