import { generateMasterPredictionCore } from "./predictionOrchestrator";
import { DrawResult, Prediction, AlgoWeights, SymbioticContext, ForensicReport } from "../../types";
import { EnhancedMetrics } from "./metrics.types";

export async function predict(
  drawName: string,
  history: DrawResult[],
  weights?: AlgoWeights,
  symbioticContext?: SymbioticContext,
  metrics?: EnhancedMetrics,
  preloadedForensicReports?: ForensicReport[]
): Promise<Prediction> {
  const temporalDepth = 100;
  
  return await generateMasterPredictionCore(
    drawName,
    history,
    temporalDepth,
    weights,
    metrics,
    symbioticContext,
    false, // skipTraining
    false, // adversarialMode
    undefined, // forcedOutsiderCount
    true, // isForensicOptimized
    true, // useSpatioTemporalHawkes
    undefined, // onProgress
    preloadedForensicReports
  );
}
