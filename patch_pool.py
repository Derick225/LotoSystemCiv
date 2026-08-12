import re

with open('services/prediction/predictionFacade.ts', 'r') as f:
    content = f.read()

old_func = """const runLocalPredictionViaWorker = async (
  context: PredictionRuntimeContext
): Promise<Prediction> => {
  if (typeof Worker !== "undefined") {
    return new Promise<Prediction>((resolve, reject) => {
      try {
        const worker = new PredictionWorker();

        const timeoutId = setTimeout(() => {
          worker.terminate();
          reject(new Error("Timeout du Web Worker de prédiction locale"));
        }, 60000);

        worker.onmessage = (e: MessageEvent) => {
          const { success, result, error, isProgress, progress, message } = e.data;
          if (isProgress) {
            context.onProgress?.(progress, message);
            return;
          }
          clearTimeout(timeoutId);
          if (success) {
            resolve(result);
          } else {
            reject(new Error(error || "Erreur inconnue du worker de prédiction"));
          }
          worker.terminate();
        };

        worker.onerror = (err) => {
          clearTimeout(timeoutId);
          reject(err);
          worker.terminate();
        };

        worker.postMessage({
          taskId: `MASTER_${Date.now()}`,
          type: "master",
          drawName: context.drawName,
          history: context.history,
          temporalDepth: context.temporalDepth,
          weightsToUse: context.weightsToUse,
          metrics: context.metrics,
          symbioticContext: context.symbioticContext,
          skipTraining: context.skipTraining,
          adversarialMode: context.adversarialMode,
          forcedOutsiderCount: context.forcedOutsiderCount,
          isForensicOptimized: context.isForensicOptimized,
          useSpatioTemporalHawkes: context.useSpatioTemporalHawkes ?? true,
          preloadedForensicReports: context.preloadedForensicReports
        });
      } catch (workerError) {
        reject(workerError);
      }
    });
  } else {
    throw new Error("Web Workers non supportés");
  }
};"""

new_func = """import { packHistory } from '../workers/zeroCopy';

const runLocalPredictionViaWorker = async (
  context: PredictionRuntimeContext
): Promise<Prediction> => {
  if (typeof Worker !== "undefined") {
    return new Promise<Prediction>((resolve, reject) => {
      try {
        const worker = new PredictionWorker();

        const timeoutId = setTimeout(() => {
          worker.terminate();
          reject(new Error("Timeout du Web Worker de prédiction locale"));
        }, 60000);

        worker.onmessage = (e: MessageEvent) => {
          const { success, result, error, isProgress, progress, message } = e.data;
          if (isProgress) {
            context.onProgress?.(progress, message);
            return;
          }
          clearTimeout(timeoutId);
          if (success) {
            resolve(result);
          } else {
            reject(new Error(error || "Erreur inconnue du worker de prédiction"));
          }
          worker.terminate();
        };

        worker.onerror = (err) => {
          clearTimeout(timeoutId);
          reject(err);
          worker.terminate();
        };
        
        const packed = packHistory(context.history as any);

        worker.postMessage({
          taskId: `MASTER_${Date.now()}`,
          type: "master",
          drawName: context.drawName,
          historyBuffer: packed.historyBuffer,
          drawCount: packed.drawCount,
          winningCount: packed.winningCount,
          totalCols: packed.totalCols,
          temporalDepth: context.temporalDepth,
          weightsToUse: context.weightsToUse,
          metrics: context.metrics,
          symbioticContext: context.symbioticContext,
          skipTraining: context.skipTraining,
          adversarialMode: context.adversarialMode,
          forcedOutsiderCount: context.forcedOutsiderCount,
          isForensicOptimized: context.isForensicOptimized,
          useSpatioTemporalHawkes: context.useSpatioTemporalHawkes ?? true,
          preloadedForensicReports: context.preloadedForensicReports
        }, [packed.historyBuffer]);
      } catch (workerError) {
        reject(workerError);
      }
    });
  } else {
    throw new Error("Web Workers non supportés");
  }
};"""

if old_func in content:
    content = content.replace(old_func, new_func)
else:
    print("Function not found, looking for alternative...")
    # Just replace worker.postMessage to use zeroCopy if possible

with open('services/prediction/predictionFacade.ts', 'w') as f:
    f.write(content)
