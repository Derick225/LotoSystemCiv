import type { DrawResult, ForensicReport } from "../../types";
import { logger } from "../../utils/logger";
import { packHistory } from "../workers/zeroCopy";

// Processus Parallèles : Gestionnaire Global de Workers
const activeWorkersMap = new Map<string, Set<Worker>>();

export const registerActiveWorker = (drawName: string, worker: Worker): void => {
  if (!activeWorkersMap.has(drawName)) {
    activeWorkersMap.set(drawName, new Set());
  }
  activeWorkersMap.get(drawName)!.add(worker);
};

export const unregisterActiveWorker = (drawName: string, worker: Worker): void => {
  const workers = activeWorkersMap.get(drawName);
  if (workers) {
    workers.delete(worker);
    if (workers.size === 0) {
      activeWorkersMap.delete(drawName);
    }
  }
};

export const terminateActiveWorkers = (drawName: string): void => {
  const workers = activeWorkersMap.get(drawName);
  if (workers) {
    logger.info(`[Process Manager] Interruption de ${workers.size} workers d'arrière-plan actifs pour ${drawName}.`);
    for (const worker of workers) {
      try {
        worker.terminate();
      } catch (err) {
        console.error("Échec de la coupure d'un worker", err);
      }
    }
    activeWorkersMap.delete(drawName);
  }
};

/**
 * Exécute de manière robuste le worker forensic avec un timeout configurable,
 * un typage strict et une gestion correcte des ressources pour éviter les fuites de workers.
 */
export const runForensicWorker = async (
  drawName: string,
  actualWinners: number[],
  history: DrawResult[],
  timeoutMs: number = 15000
): Promise<ForensicReport> => {
  return new Promise<ForensicReport>((resolve) => {
    let worker: Worker;
    const fallbackReport = (idType: string): ForensicReport => ({
      id: `${idType}-${drawName}-${Date.now()}`,
      drawName,
      date: history[0]?.date || "",
      matches: [],
      missedOpportunities: [],
      scoreDivergence: [],
      // @ts-ignore - added dynamically by forensic analysis
      catastropheControlParams: { regime: "STABLE_MONOSTABLE" }
    });

    try {
      worker = new Worker(
        new URL("../workers/forensic.worker.ts?worker", import.meta.url),
        { type: "module" }
      );
    } catch (err) {
      logger.warn(`[Process Manager] Impossible d'initialiser le worker forensic. Fallback non bloquant.`);
      return resolve(fallbackReport("fallback"));
    }

    registerActiveWorker(drawName, worker);

    const timer = setTimeout(() => {
      unregisterActiveWorker(drawName, worker);
      worker.terminate();
      logger.warn(`[Process Manager] Le worker forensic pour ${drawName} a expiré après ${timeoutMs}ms.`);
      resolve(fallbackReport("timeout"));
    }, timeoutMs);

    worker.onmessage = (e) => {
      clearTimeout(timer);
      unregisterActiveWorker(drawName, worker);
      worker.terminate();
      if (e.data.success) {
        resolve(e.data.result);
      } else {
        logger.error(`[Process Manager] Erreur du worker forensic: ${e.data.error}`);
        resolve(fallbackReport("error"));
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timer);
      unregisterActiveWorker(drawName, worker);
      worker.terminate();
      console.error(`[Process Manager] Erreur d'exécution du worker forensic:`, err);
      resolve(fallbackReport("error-runtime"));
    };

    const packed = packHistory(history);
    worker.postMessage({ 
      actualWinners, 
      historyBuffer: packed.historyBuffer,
      drawCount: packed.drawCount,
      winningCount: packed.winningCount,
      totalCols: packed.totalCols 
    }, [packed.historyBuffer]);
  });
};

/**
 * Exécute de manière asynchrone le worker de backtest avec enregistrement global de processus.
 */
export const runBacktestWorker = async <T = unknown>(
  drawName: string,
  purifiedHistory: DrawResult[],
  sampleSize: number,
  onProgress?: (progress: number) => void,
  customWeights?: unknown,
  skipTraining: boolean = true,
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../workers/backtest.worker.ts?worker", import.meta.url),
        { type: "module" }
      );
    } catch (err) {
      return reject(new Error(`Impossible de démarrer le worker de backtest: ${err}`));
    }

    registerActiveWorker(drawName, worker);

    worker.onmessage = (e) => {
      if (e.data.type === "progress" && onProgress) {
        onProgress(e.data.percent);
      } else if (e.data.type === "result") {
        unregisterActiveWorker(drawName, worker);
        worker.terminate();
        resolve(e.data.report);
      } else if (e.data.type === "error") {
        unregisterActiveWorker(drawName, worker);
        worker.terminate();
        reject(new Error(e.data.error));
      }
    };

    worker.onerror = (err) => {
      unregisterActiveWorker(drawName, worker);
      worker.terminate();
      reject(err);
    };

    const packed = packHistory(purifiedHistory);
    worker.postMessage({ 
      drawName, 
      historyBuffer: packed.historyBuffer,
      drawCount: packed.drawCount,
      winningCount: packed.winningCount,
      totalCols: packed.totalCols,
      sampleSize, 
      customWeights,
      skipTraining
    }, [packed.historyBuffer]);
  });
};
