/// <reference lib="webworker" />

import { generateMasterPredictionCore } from "../prediction/predictionFacade";
import { useNexusStore } from "../../store/useNexusStore";

self.onmessage = async (e: MessageEvent) => {
  const {
    taskId,
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
    useSpatioTemporalHawkes
  } = e.data;

  try {
    // Synchronize store state for useSpatioTemporalHawkes inside the worker context
    useNexusStore.setState({ useSpatioTemporalHawkes });

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
      isForensicOptimized
    );

    self.postMessage({ taskId, success: true, result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ taskId, success: false, error: message });
  }
};
