import {
  runNeuralSelfOptimization,
  type NeuralHyperparameters,
} from '../prediction/neuralSelfOptimizationService';
import type { AlgoWeights, DrawResult } from '../../types';

interface NeuralWorkerRequest {
  drawName: string;
  history: DrawResult[];
  initialWeights: AlgoWeights;
  params?: Partial<NeuralHyperparameters>;
}

self.onmessage = (event: MessageEvent<NeuralWorkerRequest>) => {
  try {
    const { drawName, history, initialWeights, params } = event.data;
    const result = runNeuralSelfOptimization(
      drawName,
      history,
      initialWeights,
      params,
      (epoch, totalEpochs, currentLoss, currentAccDelta) => {
        self.postMessage({
          type: 'EPOCH_PROGRESS',
          epoch,
          totalEpochs,
          currentLoss,
          currentAccDelta,
        });
      }
    );
    self.postMessage({ type: 'COMPLETE', result });
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown Neural Worker Error',
    });
  }
};
