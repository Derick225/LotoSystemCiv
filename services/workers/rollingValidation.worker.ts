/// <reference lib="webworker" />

import { generateMasterPredictionCore } from "../prediction/predictionFacade";
import { unpackHistory } from "./zeroCopy";
import { AlgoKey } from "../../shared/prediction.types";
import type { DrawResult, AlgoWeights } from "../../types";

const ctx = self as unknown as Worker;

// 100% Deterministic LCG
class LCG {
  private state: number;
  constructor(seed: number) {
    this.state = Math.abs(seed || 123456789) % 2147483647;
  }
  next(): number {
    this.state = (1664525 * this.state + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }
}

ctx.onmessage = async (e: MessageEvent) => {
  try {
    const {
      drawName,
      history: rawHistory,
      historyBuffer,
      drawCount,
      winningCount,
      totalCols,
      weights,
      windowSize = 100,
    } = e.data;

    // Support Zero-Copy binary buffer or fallback to array
    const history = historyBuffer
      ? unpackHistory(historyBuffer, drawCount, winningCount, totalCols)
      : (Array.isArray(rawHistory) ? rawHistory : []);

    if (!history || history.length < 15) {
      throw new Error("Historique insuffisant pour exécuter la validation croisée glissante (minimum 15 tirages).");
    }

    // Determine safe validation window
    const maxSafeWindow = history.length - 12; // preserve minimal buffer for first training step
    const actualWindowSize = Math.min(windowSize, maxSafeWindow);

    if (actualWindowSize <= 0) {
      throw new Error("Historique insuffisant par rapport à la taille du tampon minimale.");
    }

    // Set up chronological test indices (from oldest in window to newest)
    const testIndices: number[] = [];
    for (let i = actualWindowSize - 1; i >= 0; i--) {
      testIndices.push(i);
    }

    const algoKeys = Object.values(AlgoKey);
    const ensembleWeights = weights || Object.values(AlgoKey).reduce((acc, key) => {
      acc[key] = 1.0;
      return acc;
    }, {} as AlgoWeights);

    // Dynamic arrays to track chronological performance
    const stepLabels: string[] = [];
    const ensembleHits: number[] = [];
    const algoHitsSeries: Record<AlgoKey, number[]> = {} as any;
    
    algoKeys.forEach((k) => {
      algoHitsSeries[k] = [];
    });

    // Run walk-forward simulation
    for (let idx = 0; idx < testIndices.length; idx++) {
      const realIdx = testIndices[idx];
      const targetDraw = history[realIdx];
      const contextHistory = history.slice(realIdx + 1);

      stepLabels.push(targetDraw.date || `T-${realIdx}`);

      // Run prediction for this step
      const pred = await generateMasterPredictionCore(
        drawName,
        contextHistory,
        100, // temporalDepth
        ensembleWeights,
        undefined, // metrics
        undefined, // symbioticContext
        true, // skipTraining (crucial to measure static weight decay!)
        false, // adversarialMode
        0, // forcedOutsiderCount
        false, // isForensicOptimized
        false // useSpatioTemporalHawkes
      );

      const actualWinners = targetDraw.gagnants;

      // 1. Ensemble hits
      const suggestedEnsemble = pred.suggestedNumbers;
      const ehits = suggestedEnsemble.filter((n) => actualWinners.includes(n)).length;
      ensembleHits.push(ehits);

      // 2. Individual algorithm hits (extracted from breakdown to verify specific drift)
      const breakdown = pred.breakdown || {};
      algoKeys.forEach((k) => {
        // Sort numbers according to this single algorithm score
        const sortedForAlgo = Array.from({ length: 90 }, (_, i) => i + 1)
          .sort((a, b) => {
            const scoreB = breakdown[b]?.[k] || 0;
            const scoreA = breakdown[a]?.[k] || 0;
            return scoreB - scoreA;
          })
          .slice(0, 5);

        const ahits = sortedForAlgo.filter((n) => actualWinners.includes(n)).length;
        algoHitsSeries[k].push(ahits);
      });

      // Report progress
      const percent = Math.min(99, Math.round(((idx + 1) / testIndices.length) * 100));
      ctx.postMessage({ type: "progress", percent });

      // Yield event loop
      if (idx % 10 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // Process global metrics (quantify drift, mean, variance, etc.)
    const totalSteps = testIndices.length;

    // Metrics helper
    const getStats = (hits: number[]) => {
      const sum = hits.reduce((a, b) => a + b, 0);
      const mean = sum / totalSteps;
      const variance = hits.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / totalSteps;
      const stdDev = Math.sqrt(variance);

      // Quantify drift: compare second half to first half performance
      const half = Math.floor(totalSteps / 2);
      const firstHalfMean = half > 0 ? hits.slice(0, half).reduce((a, b) => a + b, 0) / half : mean;
      const secondHalfMean = half > 0 ? hits.slice(half).reduce((a, b) => a + b, 0) / half : mean;
      // Negative drift means performance degrades over time (parameter decay)
      const drift = secondHalfMean - firstHalfMean;

      // Cumulative hits array for visual progression
      let runningSum = 0;
      const cumulative = hits.map((v) => {
        runningSum += v;
        return runningSum;
      });

      return { mean, variance, stdDev, drift, cumulative, total: sum };
    };

    const ensembleStats = getStats(ensembleHits);
    const algoStats: Record<AlgoKey, any> = {} as any;

    algoKeys.forEach((k) => {
      algoStats[k] = getStats(algoHitsSeries[k]);
    });

    // Detect general convergence quality (is ensemble strictly superior to individual algorithms?)
    const superiorAlgos = algoKeys.filter((k) => algoStats[k].mean > ensembleStats.mean);
    const convergenceQuality = superiorAlgos.length === 0
      ? "Maximale (Ensemble dominant)"
      : superiorAlgos.length < algoKeys.length / 3
      ? "Équilibrée (Synergie active)"
      : "Suboptimale (Dérive détectée)";

    // Compile validation report
    const report = {
      totalSteps,
      stepLabels,
      ensemble: {
        hits: ensembleHits,
        ...ensembleStats,
      },
      algorithms: algoStats,
      convergenceQuality,
      superiorAlgosCount: superiorAlgos.length,
      timestamp: Date.now(),
    };

    ctx.postMessage({ type: "progress", percent: 100 });
    ctx.postMessage({ type: "result", report });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    ctx.postMessage({
      type: "error",
      error: `RollingValidation Worker Error: ${errorMessage}`,
    });
  }
};
