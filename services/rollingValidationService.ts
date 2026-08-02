import { DrawResult, AlgoWeights } from "../types";
import { purifyHistoryForDraw } from "../utils/arrayUtils";

export interface RollingValidationReport {
  totalSteps: number;
  stepLabels: string[];
  ensemble: {
    hits: number[];
    mean: number;
    variance: number;
    stdDev: number;
    drift: number;
    cumulative: number[];
    total: number;
  };
  algorithms: Record<string, {
    mean: number;
    variance: number;
    stdDev: number;
    drift: number;
    cumulative: number[];
    total: number;
  }>;
  convergenceQuality: "Maximale (Ensemble dominant)" | "Équilibrée (Synergie active)" | "Suboptimale (Dérive détectée)";
  superiorAlgosCount: number;
  timestamp: number;
}

/**
 * Lance le banc d'essai de validation croisée en chaîne (Rolling-Window Walk-Forward Validation).
 * Garantit l'absence totale de fuite de données et quantifie la dérive (drift) de chaque algorithme.
 */
export const runRollingValidation = async (
  drawName: string,
  rawHistory: DrawResult[],
  weights: AlgoWeights,
  windowSize: number = 100,
  onProgress?: (percent: number) => void
): Promise<RollingValidationReport> => {
  const history = purifyHistoryForDraw(drawName, rawHistory);

  if (!history || history.length < 15) {
    throw new Error(
      `Historique insuffisant pour lancer la validation croisée en chaîne. Minimum requis : 15 tirages.`
    );
  }

  if (typeof Worker === "undefined") {
    throw new Error("Les Web Workers ne sont pas supportés dans cet environnement.");
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./workers/rollingValidation.worker.ts?worker", import.meta.url),
      { type: "module" }
    );

    let timeoutId = setTimeout(() => {
      worker.terminate();
      reject(new Error("Timeout de la validation croisée glissante (le worker ne répond pas)"));
    }, 120000); // Generous 2-minute timeout for 100 predictions

    worker.onmessage = (e) => {
      const { type, report, percent, error } = e.data;

      if (type === "progress") {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          worker.terminate();
          reject(new Error("Timeout de la validation croisée glissante (le worker ne répond pas)"));
        }, 120000);
        if (onProgress) onProgress(percent);
      } else if (type === "result") {
        clearTimeout(timeoutId);
        worker.terminate();
        resolve(report);
      } else if (type === "error") {
        clearTimeout(timeoutId);
        worker.terminate();
        reject(new Error(error));
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timeoutId);
      worker.terminate();
      reject(new Error(`Worker fatal error: ${err.message}`));
    };

    // Send data to worker
    worker.postMessage({
      drawName,
      history,
      weights,
      windowSize,
    });
  });
};
