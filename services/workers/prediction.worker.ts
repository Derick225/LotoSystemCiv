/// <reference lib="webworker" />

import { generateMasterPredictionCore } from "../prediction/predictionFacade";
import { generatePlatinumPredictionCore } from "../metaAnalystService";

self.onmessage = async (e: MessageEvent) => {
  const {
    taskId,
    type,
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
    preloadedForensicReports,
    userOptions,
    _basePrediction
  } = e.data;

  try {
    if (type === 'platinum') {
      const result = await generatePlatinumPredictionCore(
        drawName,
        history,
        metrics,
        userOptions,
        symbioticContext,
        _basePrediction,
        (progress, message) => {
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
        (progress, message) => {
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
