import { AlgoWeights } from '../../types';
import { unpackHistory } from './zeroCopy';
import { optimizeMetaWeightsDeterministic } from './metaLearningCore';

self.onmessage = (event: MessageEvent) => {
  try {
    const { dynamicWeights, history, historyBuffer, drawCount, winningCount, totalCols } =
      event.data as {
        dynamicWeights: AlgoWeights;
        history?: unknown;
        historyBuffer?: ArrayBuffer;
        drawCount?: number;
        winningCount?: number;
        totalCols?: number;
      };

    const hist = historyBuffer
      ? unpackHistory(historyBuffer, drawCount, winningCount, totalCols)
      : unpackHistory(history as never);

    const bestConfig = optimizeMetaWeightsDeterministic(hist, dynamicWeights);
    self.postMessage({ type: 'SUCCESS', bestConfig });
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown Worker Error',
    });
  }
};
