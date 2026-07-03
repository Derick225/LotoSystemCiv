import { runBacktestTraining } from "../backtestService";

const ctx = self as unknown as Worker;

ctx.onmessage = async (e: MessageEvent) => {
  try {
    const { drawName, history, sampleSize, customWeights } = e.data;
    
    // Validate required inputs based on standard
    if (!history || !Array.isArray(history) || history.length === 0) {
      throw new Error("Historique manquant ou invalide pour le backtest.");
    }
    if (!drawName) {
      throw new Error("drawName manquant.");
    }

    const report = await runBacktestTraining(
      drawName,
      history,
      sampleSize,
      (progress: number) => {
        ctx.postMessage({ type: 'progress', percent: Math.min(100, Math.max(0, Math.round(progress))) });
      },
      customWeights
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
