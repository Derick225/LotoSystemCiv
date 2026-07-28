/// <reference lib="webworker" />

import { generateMasterPredictionCore } from "../prediction/predictionFacade";
import { generatePlatinumPredictionCore } from "../metaAnalystService";
import { runMonteCarloMcmcCore } from "../prediction/monteCarloMcmc";
import { unpackHistory } from "./zeroCopy";

self.onmessage = async (e: MessageEvent) => {
  const {
    taskId,
    type,
    drawName,
    history: rawHistory,
    historyBuffer,
    drawCount,
    winningCount,
    totalCols,
    temporalDepth,
    weightsToUse,
    metrics,
    symbioticContext,
    skipTraining,
    adversarialMode,
    forcedOutsiderCount,
    isForensicOptimized,
    useSpatioTemporalHawkes,
    preloadedForensicReports,
    userOptions,
    _basePrediction,
    resolvedMcIterations,
    resolvedNoiseLevel,
    resolvedLearningRate
  } = e.data;

  const history = historyBuffer
    ? unpackHistory(historyBuffer, drawCount, winningCount, totalCols)
    : (Array.isArray(rawHistory) ? rawHistory : []);

  try {
    if (type === 'mcmc') {
       const result = await runMonteCarloMcmcCore(
         drawName,
         history,
         temporalDepth,
         weightsToUse,
         metrics,
         symbioticContext,
         adversarialMode,
         isForensicOptimized,
         resolvedMcIterations,
         resolvedNoiseLevel,
         resolvedLearningRate,
         (progress: number, message: string) => {
           self.postMessage({ taskId, isProgress: true, progress, message });
         }
       );
       self.postMessage({ taskId, success: true, result });
    } else if (type === 'platinum') {
      const result = await generatePlatinumPredictionCore(
        drawName,
        history,
        metrics,
        userOptions,
        symbioticContext,
        _basePrediction,
        (progress: number, message: string) => {
          self.postMessage({ taskId, isProgress: true, progress, message });
        },
        temporalDepth,
        useSpatioTemporalHawkes,
        preloadedForensicReports
      );
      self.postMessage({ taskId, success: true, result });
    } else {
      const result = await generateMasterPredictionCore(
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
        (progress: number, message: string) => {
          self.postMessage({ taskId, isProgress: true, progress, message });
        },
        preloadedForensicReports
      );
      self.postMessage({ taskId, success: true, result });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ taskId, success: false, error: message });
  }
};
