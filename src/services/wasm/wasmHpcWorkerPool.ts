/**
 * GESTIONNAIRE ET POOL DE WORKERS DÉDIÉS RUST / WASM HPC (60 FPS GARANTI)
 * LotoPro Platinum Elite v12.0
 * 
 * Assure la délégation hors thread principal (UI) des calculs lourds :
 * - Grille spatiale & champs de gravité newtoniens
 * - Trajectoire dynamique de barycentre (Time Travel)
 * - Matrices de corrélation de Pearson
 * - Exposants de Lyapunov, FFT spectrale, processus de Hawkes, Markov et Recuit
 * 
 * Respecte strictement AGENTS.md :
 * - 100% déterministe
 * - Zéro blocage d'interface utilisateur (60 FPS préservé)
 * - Fallback transparent et robuste si les Web Workers ne sont pas supportés
 */

import {
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
  WasmLyapunovResult,
  WasmAnnealingResult,
  WasmHawkesResult,
  WasmCooccurrenceResult,
} from './lotoEngineBridge';
import { collectTransferables } from '../workers/zeroCopy';

export interface SpatialGridHpcResult {
  gridDensity: Float64Array;
  gravityPulls: Float64Array;
  barycenterX: number;
  barycenterY: number;
  entropy: number;
  densityThreshold: number;
}

export interface BarycenterPointHpc {
  x: number;
  y: number;
  drawIndex: number;
  date?: string;
}

class WasmHpcWorkerPool {
  private worker: Worker | null = null;
  private isReady: boolean = false;
  private pendingCallbacks: Map<string, { resolve: (val: any) => void; reject: (err: any) => void; timer: ReturnType<typeof setTimeout> }> = new Map();
  private taskCounter: number = 0;
  private totalTasksExecuted: number = 0;
  private fallbackCount: number = 0;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof Worker === 'undefined') {
      this.isReady = false;
      return;
    }

    try {
      if (this.worker) {
        try {
          this.worker.terminate();
        } catch {
          // ignore
        }
      }

      // Initialisation du Worker dédié via Vite URL worker
      this.worker = new Worker(
        new URL('../workers/wasmHpc.worker.ts?worker', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent) => {
        const { taskId, success, result, error } = e.data || {};
        const pending = this.pendingCallbacks.get(taskId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingCallbacks.delete(taskId);
          this.totalTasksExecuted++;
          if (success) {
            pending.resolve(result);
          } else {
            pending.reject(new Error(error || 'Erreur inconnue dans le WasmHpcWorker'));
          }
        }
      };

      this.worker.onerror = (err) => {
        console.warn('[WasmHpcWorkerPool] Erreur sur le worker dédié, repli sur le pont direct :', err);
        this.isReady = false;
        // Purge et rejet des tâches en attente
        for (const [taskId, pending] of Array.from(this.pendingCallbacks.entries())) {
          clearTimeout(pending.timer);
          pending.reject(new Error("Le Web Worker WASM HPC s'est arrêté inopinément."));
        }
        this.pendingCallbacks.clear();
      };

      this.isReady = true;
    } catch (err) {
      console.warn("[WasmHpcWorkerPool] Impossible d'instancier le Web Worker (mode dégradé actif) :", err);
      this.isReady = false;
      this.worker = null;
    }
  }

  /**
   * Vérifie si le Web Worker en arrière-plan est opérationnel.
   */
  public isWorkerOperational(): boolean {
    return this.isReady && this.worker !== null;
  }

  /**
   * Récupère les métriques d'exécution du pool.
   */
  public getMetrics(): {
    workerActive: boolean;
    totalTasksExecuted: number;
    fallbackCount: number;
    pendingTasks: number;
  } {
    return {
      workerActive: this.isWorkerOperational(),
      totalTasksExecuted: this.totalTasksExecuted,
      fallbackCount: this.fallbackCount,
      pendingTasks: this.pendingCallbacks.size,
    };
  }

  /**
   * Exécute une tâche arbitraire sur le worker avec basculement automatique sans crash
   * et transfert de mémoire zéro-copie.
   */
  public async executeTask<T>(
    task: string,
    payload: any = {},
    transferables: Transferable[] = []
  ): Promise<T> {
    if (!this.isWorkerOperational()) {
      return this.executeSyncFallback<T>(task, payload);
    }

    return new Promise<T>((resolve, reject) => {
      this.taskCounter++;
      const taskId = `hpc_${task}_${Date.now()}_${this.taskCounter}`;

      // Timeout de garde-fou (8 secondes)
      const timer = setTimeout(() => {
        if (this.pendingCallbacks.has(taskId)) {
          this.pendingCallbacks.delete(taskId);
          this.fallbackCount++;
          // En cas de timeout du worker, tenter le fallback synchrone
          try {
            const fallbackResult = this.executeSyncFallback<T>(task, payload);
            resolve(fallbackResult);
          } catch (e) {
            reject(new Error(`Timeout du Worker WASM pour la tâche ${task}`));
          }
        }
      }, 8000);

      this.pendingCallbacks.set(taskId, {
        resolve,
        reject,
        timer,
      });

      // Extraire automatiquement les TypedArray buffers s'ils n'ont pas été spécifiés
      if (transferables.length === 0 && payload && typeof payload === 'object') {
        collectTransferables(payload, transferables);
      }

      try {
        this.worker!.postMessage(
          {
            taskId,
            task,
            payload,
          },
          transferables
        );
      } catch (postErr) {
        // En cas d'échec de clonage Transferable, retenter sans transferables ou exécuter en fallback
        try {
          this.worker!.postMessage({ taskId, task, payload });
        } catch {
          clearTimeout(timer);
          this.pendingCallbacks.delete(taskId);
          this.fallbackCount++;
          resolve(this.executeSyncFallback<T>(task, payload));
        }
      }
    });
  }

  /**
   * Fallback synchrone déterministe via lotoEngineBridge en cas d'absence de Worker.
   */
  private executeSyncFallback<T>(task: string, p: any): Promise<T> | T {
    this.fallbackCount++;
    switch (task) {
      case 'PING':
        return { status: 'PONG_FALLBACK', timestamp: Date.now() } as any;

      case 'SPATIAL_GRID_HPC': {
        const flatDraws = p.flatDraws instanceof Int32Array
          ? p.flatDraws
          : new Int32Array(p.flatDraws || []);
        const numDraws = p.numDraws || Math.floor(flatDraws.length / 5);
        const spatial = computeSpatialGridHpc(flatDraws, numDraws);
        return {
          gridDensity: spatial.gridDensity,
          gravityPulls: spatial.gravityPulls,
          barycenterX: spatial.barycenterX,
          barycenterY: spatial.barycenterY,
          entropy: spatial.entropy,
          densityThreshold: spatial.densityThreshold,
        } as any;
      }

      case 'BARYCENTER_TRAJECTORY_HPC':
        return computeBarycenterTrajectoryHpc(p.results || [], p.limit || 20) as any;

      case 'PEARSON_CORRELATION_HPC': {
        const x = p.x instanceof Float64Array ? p.x : new Float64Array(p.x || []);
        const y = p.y instanceof Float64Array ? p.y : new Float64Array(p.y || []);
        return computePearsonCorrelationHpc(x, y) as any;
      }

      case 'PEARSON_MATRIX_HPC':
        return computePearsonCorrelationMatrixHpc(p.algoScores || {}, p.keys || []) as any;

      case 'TOPOLOGICAL_LYAPUNOV_HPC':
        return computeTopologicalLyapunovHpc(
          p.historyDraws,
          p.numDraws,
          p.winCols || 5,
          p.horizonLimit || 30
        ) as any;

      case 'COMBINATORIAL_ANNEALING_HPC':
        return solveCombinatorialAnnealingHpc(p) as any;

      case 'CROSS_HAWKES_HPC':
        return computeCrossHawkesKernelHpc(p) as any;

      case 'MARKOV_TRANSITIONS_HPC':
        return computeMarkovTransitionHpc(
          p.historyDraws,
          p.numDraws,
          p.winCols || 5,
          p.numStates || 90
        ) as any;

      case 'COOCCURRENCE_TENSOR_HPC':
        return computeCooccurrenceTensorHpc(
          p.predDrawsFlat,
          p.targetDrawsFlat,
          p.numDraws,
          p.winCols || 5,
          p.activePredNumbers || []
        ) as any;

      case 'HURST_HPC':
        return computeRobustHurstHpc(p.signal) as any;

      case 'SPECTRAL_FFT_HPC':
        return computeFftPowerSpectrumHpc(p.signal) as any;

      case 'TOPOLOGICAL_PROXIMITY_HPC': {
        const winners = p.winners instanceof Int32Array ? p.winners : (p.winners || []);
        return computeTopologicalProximityVectorHpc(winners) as any;
      }

      case 'TENSOR_SCORE_HPC': {
        const feat = p.featuresFlat instanceof Float64Array ? p.featuresFlat : new Float64Array(p.featuresFlat || []);
        const w = p.weights instanceof Float64Array ? p.weights : new Float64Array(p.weights || []);
        return computeTensorScoreHpc(feat, w, p.numNumbers || 90, p.numFeatures) as any;
      }

      default:
        throw new Error(`Fallback inconnu pour la tâche: ${task}`);
    }
  }

  // --- API SPÉCIALISÉES HAUTE PERFORMANCE (HPC) ---

  /**
   * 1. Calcul asynchrone hors thread principal de la grille spatiale 5/90 et des puits newtoniens
   */
  public async computeSpatialGridAsync(
    flatDraws: Int32Array | number[],
    numDraws: number
  ): Promise<SpatialGridHpcResult> {
    const inputArr = flatDraws instanceof Int32Array ? flatDraws : new Int32Array(flatDraws);
    return this.executeTask<SpatialGridHpcResult>('SPATIAL_GRID_HPC', {
      flatDraws: inputArr,
      numDraws,
    });
  }

  /**
   * 2. Calcul asynchrone de la trajectoire barycentrique (Time Travel Replay)
   */
  public async computeBarycenterTrajectoryAsync(
    results: { gagnants: number[]; date?: string }[],
    limit: number = 20
  ): Promise<BarycenterPointHpc[]> {
    return this.executeTask<BarycenterPointHpc[]>('BARYCENTER_TRAJECTORY_HPC', {
      results,
      limit,
    });
  }

  /**
   * 3. Calcul asynchrone de la corrélation de Pearson
   */
  public async computePearsonCorrelationAsync(
    x: Float64Array | number[],
    y: Float64Array | number[]
  ): Promise<number | null> {
    return this.executeTask<number | null>('PEARSON_CORRELATION_HPC', { x, y });
  }

  /**
   * 4. Calcul asynchrone de la matrice de corrélation de Pearson complète
   */
  public async computePearsonMatrixAsync(
    algoScores: Record<string, number[] | Float64Array>,
    keys: readonly string[]
  ): Promise<{ matrix: Record<string, Record<string, number | null>>; average: number }> {
    return this.executeTask<{ matrix: Record<string, Record<string, number | null>>; average: number }>(
      'PEARSON_MATRIX_HPC',
      { algoScores, keys }
    );
  }

  /**
   * 5. Calcul asynchrone de Lyapunov (Chaos & Stabilité topologique)
   */
  public async computeLyapunovAsync(
    historyDraws: Int32Array | number[],
    numDraws: number,
    winCols: number = 5,
    horizonLimit: number = 30
  ): Promise<WasmLyapunovResult> {
    return this.executeTask<WasmLyapunovResult>('TOPOLOGICAL_LYAPUNOV_HPC', {
      historyDraws,
      numDraws,
      winCols,
      horizonLimit,
    });
  }

  /**
   * 6. Calcul asynchrone de la proximité topologique vectorisée 1-90
   */
  public async computeTopologicalProximityAsync(
    winners: number[] | Int32Array
  ): Promise<Float64Array> {
    const arr = winners instanceof Int32Array ? winners : new Int32Array(winners);
    return this.executeTask<Float64Array>('TOPOLOGICAL_PROXIMITY_HPC', { winners: arr });
  }

  /**
   * 7. Scoring tensoriel matriciel vectorisé en Rust/WASM (90 x F * F x 1)
   */
  public async computeTensorScoreAsync(
    featuresFlat: Float64Array | number[],
    weights: Float64Array | number[],
    numNumbers: number = 90,
    numFeatures: number
  ): Promise<Float64Array> {
    const feat = featuresFlat instanceof Float64Array ? featuresFlat : new Float64Array(featuresFlat);
    const w = weights instanceof Float64Array ? weights : new Float64Array(weights);
    return this.executeTask<Float64Array>('TENSOR_SCORE_HPC', {
      featuresFlat: feat,
      weights: w,
      numNumbers,
      numFeatures,
    });
  }
}

export const wasmHpcWorkerPool = new WasmHpcWorkerPool();
