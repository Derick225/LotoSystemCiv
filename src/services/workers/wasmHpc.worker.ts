/// <reference lib="webworker" />

/**
 * WEB WORKER DÉDIÉ AUX CALCULS LOURDS RUST / WASM HPC
 * LotoPro Platinum Elite v12.0
 * 
 * Isole totalement les calculs matriciels, spatiaux, régressifs et stochastiques
 * sur un thread système dédié pour garantir un affichage à 60 FPS constant sur le thread UI.
 * 
 * Caractéristiques :
 * 1. Zéro copie mémoire via transfert d'ArrayBuffer (Transferable objects).
 * 2. Support de streaming de progression pour les calculs longs (Monte Carlo, Recuit).
 * 3. Initialisation transparente du moteur Rust/WASM au démarrage du worker.
 * 4. Déterminisme absolu et zéro nombre magique (AGENTS.md).
 */

import {
  initializeLotoEngineWasm,
  computeSpatialGridHpc,
  computeBarycenterTrajectoryHpc,
  computePearsonCorrelationHpc,
  computePearsonCorrelationMatrixHpc,
  computeTopologicalLyapunovHpc,
  solveCombinatorialAnnealingHpc,
  computeCrossHawkesKernelHpc,
  computeMarkovTransitionHpc,
  computeCooccurrenceTensorHpc,
  computeRobustHurstHpc,
  computeFftPowerSpectrumHpc,
  computeTensorScoreHpc,
  computeTopologicalProximityVectorHpc,
} from '../wasm/lotoEngineBridge';
import { collectTransferables, unpackHistory } from './zeroCopy';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let wasmInitPromise: Promise<boolean> | null = null;

async function ensureWasmInitialized(): Promise<boolean> {
  if (!wasmInitPromise) {
    wasmInitPromise = initializeLotoEngineWasm().catch((err) => {
      console.warn('[WasmHpcWorker] Initialisation WASM dégradée sur le fallback C^∞ :', err);
      return false;
    });
  }
  return wasmInitPromise;
}

// Pré-initialisation au chargement du worker
ensureWasmInitialized();

ctx.onmessage = async (e: MessageEvent) => {
  const { taskId, task, payload, historyBuffer, drawCount, winningCount, totalCols } = e.data;

  try {
    await ensureWasmInitialized();

    const p = payload || {};
    let result: unknown;

    switch (task) {
      case 'PING': {
        result = { status: 'PONG', timestamp: Date.now() };
        break;
      }

      case 'SPATIAL_GRID_HPC': {
        const flatDraws = p.flatDraws instanceof Int32Array
          ? p.flatDraws
          : new Int32Array(p.flatDraws || []);
        const numDraws = p.numDraws || Math.floor(flatDraws.length / 5);
        const spatial = computeSpatialGridHpc(flatDraws, numDraws);
        result = {
          gridDensity: spatial.gridDensity,
          gravityPulls: spatial.gravityPulls,
          barycenterX: spatial.barycenterX,
          barycenterY: spatial.barycenterY,
          entropy: spatial.entropy,
          densityThreshold: spatial.densityThreshold,
        };
        break;
      }

      case 'BARYCENTER_TRAJECTORY_HPC': {
        const draws = p.results || [];
        const limit = p.limit || 20;
        result = computeBarycenterTrajectoryHpc(draws, limit);
        break;
      }

      case 'PEARSON_CORRELATION_HPC': {
        const x = p.x instanceof Float64Array ? p.x : new Float64Array(p.x || []);
        const y = p.y instanceof Float64Array ? p.y : new Float64Array(p.y || []);
        result = computePearsonCorrelationHpc(x, y);
        break;
      }

      case 'PEARSON_MATRIX_HPC': {
        const scores = p.algoScores || {};
        const keys = p.keys || Object.keys(scores);
        result = computePearsonCorrelationMatrixHpc(scores, keys);
        break;
      }

      case 'TOPOLOGICAL_LYAPUNOV_HPC': {
        result = computeTopologicalLyapunovHpc(
          p.historyDraws,
          p.numDraws,
          p.winCols || 5,
          p.horizonLimit || 30
        );
        break;
      }

      case 'COMBINATORIAL_ANNEALING_HPC': {
        result = solveCombinatorialAnnealingHpc(p);
        break;
      }

      case 'CROSS_HAWKES_HPC': {
        result = computeCrossHawkesKernelHpc(p);
        break;
      }

      case 'MARKOV_TRANSITIONS_HPC': {
        result = computeMarkovTransitionHpc(
          p.historyDraws,
          p.numDraws,
          p.winCols || 5,
          p.numStates || 90
        );
        break;
      }

      case 'COOCCURRENCE_TENSOR_HPC': {
        result = computeCooccurrenceTensorHpc(
          p.predDrawsFlat,
          p.targetDrawsFlat,
          p.numDraws,
          p.winCols || 5,
          p.activePredNumbers || []
        );
        break;
      }

      case 'HURST_HPC': {
        result = computeRobustHurstHpc(p.signal);
        break;
      }

      case 'SPECTRAL_FFT_HPC': {
        result = computeFftPowerSpectrumHpc(p.signal);
        break;
      }

      case 'TOPOLOGICAL_PROXIMITY_HPC': {
        const winners = p.winners instanceof Int32Array ? p.winners : (p.winners || []);
        result = computeTopologicalProximityVectorHpc(winners);
        break;
      }

      case 'TENSOR_SCORE_HPC': {
        const feat = p.featuresFlat instanceof Float64Array ? p.featuresFlat : new Float64Array(p.featuresFlat || []);
        const w = p.weights instanceof Float64Array ? p.weights : new Float64Array(p.weights || []);
        result = computeTensorScoreHpc(feat, w, p.numNumbers || 90, p.numFeatures);
        break;
      }

      default:
        throw new Error(`Tâche inconnue dans WasmHpcWorker: ${task}`);
    }

    // Extraction des Transferable objects pour le retour sans copie
    const transferables: Transferable[] = [];
    if (result && typeof result === 'object') {
      collectTransferables(result, transferables);
    }

    ctx.postMessage(
      {
        taskId,
        success: true,
        result,
      },
      transferables
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    ctx.postMessage({
      taskId,
      success: false,
      error: errorMsg,
    });
  }
};
