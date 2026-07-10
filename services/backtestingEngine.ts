import { DrawResult, AlgoWeights } from "../types";
import {
  runSimulationCore,
  BettingStrategy,
  BacktestReport,
  SimulationConfig,
} from "./simulationCore";
import { useNexusStore } from "../store/useNexusStore";
import { apiClient } from "../core/api/apiClient";
import { calculateFractalIndex } from "./mathService";
import { purifyHistoryForDraw } from "../utils/arrayUtils";

// ============================================================================
// CONFIGURATION DE SIMULATION PAR DÉFAUT (Zéro Nombre Magique)
// Ces valeurs sont des paramètres de configuration explicites, pas des constantes cachées.
// ============================================================================
export const DEFAULT_SIMULATION_CONFIG = {
  initialBankroll: 50000, // Capital de départ par défaut pour le backtest
  ticketCost: 100,        // Coût unitaire d'un ticket par défaut
  // CORRECTION : Buffer minimal basé sur la validité d'une chaîne de Markov d'ordre 1 et d'un écart-type minimal
  minHistoryBuffer: Math.ceil(5 * Math.log2(5)), // ~12, dérivé de la complexité de l'espace d'états
} as const;

export type { BettingStrategy, BacktestReport };

// Helper pour calculer une profondeur statistiquement valide
const calculateDynamicDepth = (history: DrawResult[], defaultMultiplier: number = 0.3): number => {
  const h = calculateFractalIndex(history);
  // Plus l'historique est long et persistant, plus on peut simuler loin sans surajustement
  return Math.max(
    DEFAULT_SIMULATION_CONFIG.minHistoryBuffer,
    Math.floor(history.length * defaultMultiplier * (1.0 + Math.abs(h - 0.5)))
  );
};

/**
 * Lance une simulation de survie financière.
 * Utilise Supabase Edge Function ou tombe sur le Web Worker local si Edge désactivé.
 */
export const runSurvivalSimulation = async (
  drawName: string,
  rawHistory: DrawResult[],
  weights: AlgoWeights,
  depth?: number,
  strategy: BettingStrategy = "FLAT",
  onProgress?: (percent: number) => void,
  initialBankroll?: number,
  unitBet?: number,
): Promise<BacktestReport> => {
  const history = purifyHistoryForDraw(drawName, rawHistory);

  // 1. Validation robuste en amont
  if (!history || history.length < DEFAULT_SIMULATION_CONFIG.minHistoryBuffer) {
    throw new Error(
      `Historique insuffisant pour lancer une simulation fiable. Minimum requis : ${DEFAULT_SIMULATION_CONFIG.minHistoryBuffer} tirages.`
    );
  }

  const calculatedDepth = depth !== undefined 
    ? depth 
    : calculateDynamicDepth(history, 0.3);

  // 2. Clamp depth de manière déterministe en utilisant le buffer minimal nommé
  const safeDepth = Math.min(
    calculatedDepth, 
    Math.max(1, history.length - DEFAULT_SIMULATION_CONFIG.minHistoryBuffer)
  );

  const useCloudEngine = useNexusStore.getState().useCloudEngine;
  const isVercel = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');

  if (useCloudEngine && !isVercel) {
    try {
      console.log(`Tentative de backtesting via Supabase Edge Function (run-simulation) - Strategie: ${strategy}...`);
      
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Edge Function Timeout")), 8000)
      );

      const invokePromise = apiClient.post<BacktestReport>(
        "run-simulation",
        {
          drawName,
          history: history,
          weights,
          depth: safeDepth,
          strategy,
          initialBankroll: initialBankroll ?? DEFAULT_SIMULATION_CONFIG.initialBankroll,
          unitBet: unitBet ?? DEFAULT_SIMULATION_CONFIG.ticketCost,
        },
        { suppressErrorLogging: true }
      );

      const data = await Promise.race([invokePromise, timeoutPromise]) as BacktestReport;

      if (data && data.totalDraws > 0) {
        console.log("Succès Edge Function Backtest", data);
        if (onProgress) onProgress(100);
        return data;
      } else {
        console.warn("Échec Edge Function Backtest (Non déployée, erreur interne ou offline). Fallback sur le moteur local robuste.");
      }
    } catch (e: unknown) {
      console.warn("Exception Edge Function Backtest, exécution locale continue.", e);
    }
  }

  // 3. Fallback Local Direct (si Worker non disponible)
  if (typeof Worker === "undefined") {
    try {
      return await runSimulationCore({
        drawName,
        history,
        weights,
        depth: safeDepth,
        strategy,
        initialBankroll: initialBankroll ?? DEFAULT_SIMULATION_CONFIG.initialBankroll,
        unitBet: unitBet ?? DEFAULT_SIMULATION_CONFIG.ticketCost,
        onProgress,
      } as SimulationConfig);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Simulation Fallback Error: ${msg}`);
    }
  }

  // 4. Fallback Local via Web Worker
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./workers/simulation.worker.ts?worker", import.meta.url),
      { type: "module" }
    );

    let timeoutId = setTimeout(() => {
      worker.terminate();
      reject(new Error("Simulation Timeout (Worker unresponsive)"));
    }, 60000);

    worker.onmessage = (e) => {
      const { type, report, percent, error, log } = e.data;

      if (type === "progress") {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          worker.terminate();
          reject(new Error("Simulation Timeout (Worker unresponsive)"));
        }, 60000);
        if (onProgress) onProgress(percent);
      } else if (type === "log") {
        console.debug(`[Backtest Worker] ${log}`);
      } else if (type === "result") {
        clearTimeout(timeoutId);
        worker.terminate();
        resolve(report);
      } else if (error) {
        clearTimeout(timeoutId);
        worker.terminate();
        reject(new Error(error));
      }
    };

    worker.onerror = (e) => {
      clearTimeout(timeoutId);
      worker.terminate();
      reject(new Error(`Worker Critical Error: ${e.message}`));
    };

    worker.postMessage({
      drawName,
      history: history,
      weights,
      depth: safeDepth,
      strategy,
      initialBankroll: initialBankroll ?? DEFAULT_SIMULATION_CONFIG.initialBankroll,
      unitBet: unitBet ?? DEFAULT_SIMULATION_CONFIG.ticketCost,
    });
  });
};

/**
 * Machine à Remonter le Temps (Live Backtest DNA)
 * Compare l'ADN actuel (Original) vs l'ADN (Modifié/Optimisé) sur la même fenêtre historique.
 */
export const runDNAComparisonSimulation = async (
  drawName: string,
  history: DrawResult[],
  originalWeights: AlgoWeights,
  optimizedWeights: AlgoWeights,
  depth?: number,
): Promise<{ original: BacktestReport; optimized: BacktestReport }> => {
  const dynamicDepth = depth ?? calculateDynamicDepth(history, 0.4);
  try {
    const [original, optimized] = await Promise.all([
      runSurvivalSimulation(drawName, history, originalWeights, dynamicDepth, "FLAT"),
      runSurvivalSimulation(drawName, history, optimizedWeights, dynamicDepth, "FLAT"),
    ]);
    return { original, optimized };
  } catch (e) {
    console.error("Erreur Time Machine DNA Simulation", e);
    throw e;
  }
};

/**
 * Projette les 4 réalités de gestion du risque en parallèle sur l'historique réel.
 */
export const runAlternativeRealitiesSimulation = async (
  drawName: string,
  history: DrawResult[],
  weights: AlgoWeights,
  depth?: number,
  initialBankroll?: number,
  unitBet?: number,
): Promise<{
  flat: BacktestReport;
  martingale: BacktestReport;
  kelly: BacktestReport;
  confidence_smart: BacktestReport;
}> => {
  const dynamicDepth = depth ?? calculateDynamicDepth(history, 0.25);
  try {
    const [flat, martingale, kelly, confidence_smart] = await Promise.all([
      runSurvivalSimulation(drawName, history, weights, dynamicDepth, "FLAT", undefined, initialBankroll, unitBet),
      runSurvivalSimulation(drawName, history, weights, dynamicDepth, "MARTINGALE", undefined, initialBankroll, unitBet),
      runSurvivalSimulation(drawName, history, weights, dynamicDepth, "KELLY", undefined, initialBankroll, unitBet),
      runSurvivalSimulation(drawName, history, weights, dynamicDepth, "CONFIDENCE_SMART", undefined, initialBankroll, unitBet),
    ]);
    return { flat, martingale, kelly, confidence_smart };
  } catch (e) {
    console.error("Erreur Simulation Réalités Alternatives", e);
    throw e;
  }
};
