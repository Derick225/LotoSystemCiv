import { runBacktestTraining } from "../backtestService";
import { unpackHistory } from "./zeroCopy";
import type { DrawResult } from "../../types";

const ctx = self as unknown as Worker;

ctx.onmessage = async (e: MessageEvent) => {
  try {
    const { drawName, history, historyBuffer, drawCount, winningCount, totalCols, sampleSize, customWeights, skipTraining } = e.data;
    const hist = (historyBuffer ? unpackHistory(historyBuffer, drawCount, winningCount, totalCols) : unpackHistory(history)) as DrawResult[];
    
    // Validate required inputs based on standard
    if (!hist || !Array.isArray(hist) || hist.length === 0) {
      throw new Error("Historique manquant ou invalide pour le backtest.");
    }
    if (!drawName) {
      throw new Error("drawName manquant.");
    }

    const report = await runBacktestTraining(
      drawName,
      hist,
      sampleSize,
      (progress: number) => {
        ctx.postMessage({ type: 'progress', percent: Math.min(100, Math.max(0, Math.round(progress))) });
      },
      customWeights,
      skipTraining
    );

    ctx.postMessage({ type: 'progress', percent: 100 });
    ctx.postMessage({ type: 'result', report });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    ctx.postMessage({
      type: 'error',
      error: errorMessage
    });
  }
};
