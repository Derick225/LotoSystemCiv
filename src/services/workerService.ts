
import { AppError } from '../utils/AppError';
import { apiClient } from '../core/api/apiClient';
import { packHistory, packMatrix, packArray, collectTransferables } from './workers/zeroCopy';
import { isSupabaseConfigured } from './supabaseClient';
import {
    computeTopologicalLyapunovHpc,
    solveCombinatorialAnnealingHpc,
    computeCrossHawkesKernelHpc,
    computeMarkovTransitionHpc,
    computeCooccurrenceTensorHpc,
    computeRobustHurstHpc,
    computeFftPowerSpectrumHpc,
    computeSpatialGridHpc,
    computeBarycenterTrajectoryHpc,
    computePearsonCorrelationHpc,
    computePearsonCorrelationMatrixHpc,
    WasmLyapunovResult,
    WasmAnnealingResult,
    WasmHawkesResult,
    WasmCooccurrenceResult
} from './wasm/lotoEngineBridge';

/**
 * NEXUS WORKER SERVICE
 * Orchestre les calculs lourds en arrière-plan.
 * Tente d'abord l'Edge Function Supabase, puis utilise un véritable Web Worker local en cas d'échec
 * pour ne plus jamais bloquer le thread principal (UI).
 */

class WorkerService {
    private localWorker: Worker | null = null;
    private callbacks: Map<string, { resolve: Function, reject: Function }> = new Map();
    private workerReady: boolean = false;

    constructor() {
        this.initLocalWorker();
    }

    private initLocalWorker() {
        try {
            if (typeof Worker === 'undefined') {
                console.warn("L'environnement ne supporte pas les Web Workers. Exécution en mode dégradé (synchrone).");
                return;
            }
            if (this.localWorker) {
                try { 
                    this.localWorker.terminate(); 
                } catch (termErr) {
                    console.debug("[WorkerService] Échec lors de la terminaison du worker précédent:", termErr);
                }
            }
            // Initialisation d'un vrai Web Worker via Vite
            this.localWorker = new Worker(new URL('./nexus.worker.ts?worker', import.meta.url), { type: 'module' });
            
            this.localWorker.onmessage = (e: MessageEvent) => {
                const { taskId, success, result, error } = e.data;
                const callback = this.callbacks.get(taskId);
                
                if (callback) {
                    if (success) {
                        callback.resolve(result);
                    } else {
                        callback.reject(new Error(error));
                    }
                    this.callbacks.delete(taskId);
                }
            };
            
            this.localWorker.onerror = (e) => {
                console.error("Local Worker interne error:", e);
                this.workerReady = false;
                this.localWorker = null;
                // Reject all pending tasks because the worker is dead
                for (const [taskId, callback] of Array.from(this.callbacks.entries())) {
                    callback.reject(new Error("Local Worker a crashé ou n'a pas pu se charger."));
                }
                this.callbacks.clear();
            };
            
            this.workerReady = true;
        } catch (e) {
            console.error("Impossible d'initialiser le Web Worker Local. Les calculs seront bloquants.", e);
            this.workerReady = false;
            this.localWorker = null;
        }
    }

    private internalWorkerCounter = 0;

    public isAvailable(): boolean {
        return true;
    }

    private runInLocalWorker(task: string, payload: unknown, history: unknown[]): Promise<unknown> {
        if (!this.workerReady || !this.localWorker) {
            this.initLocalWorker();
        }

        return new Promise((resolve, reject) => {
            if (!this.workerReady || !this.localWorker) {
                return reject(new Error("Local Worker non disponible"));
            }
            
            this.internalWorkerCounter++;
            const taskId = `${task}_${Date.now()}_${this.internalWorkerCounter}`;

            let timer: ReturnType<typeof setTimeout>;

            const wrappedResolve = (val: unknown) => {
                clearTimeout(timer);
                resolve(val);
            };

            const wrappedReject = (err: unknown) => {
                clearTimeout(timer);
                reject(err);
            };

            this.callbacks.set(taskId, { resolve: wrappedResolve, reject: wrappedReject });
            
            const transferables: Transferable[] = [];
            let msgPayload: any = payload;
            let historyBuffer: ArrayBuffer | SharedArrayBuffer | undefined;
            let drawCount: number | undefined;
            let winningCount: number | undefined;
            let totalCols: number | undefined;

            if (Array.isArray(history) && history.length > 0) {
                const packed = packHistory(history as any);
                historyBuffer = packed.historyBuffer;
                drawCount = packed.drawCount;
                winningCount = packed.winningCount;
                totalCols = packed.totalCols;
                if (historyBuffer && (typeof SharedArrayBuffer === 'undefined' || !(historyBuffer instanceof SharedArrayBuffer))) {
                    transferables.push(historyBuffer as any);
                }
            }

            if (payload && typeof payload === 'object') {
                const p = { ...(payload as Record<string, any>) };
                if (Array.isArray(p.matrix)) {
                    const packed = packMatrix(p.matrix);
                    p.matrixBuffer = packed.matrixBuffer;
                    p.rows = packed.rows;
                    p.cols = packed.cols;
                    delete p.matrix;
                }
                if (Array.isArray(p.features)) {
                    const packed = packMatrix(p.features);
                    p.featuresBuffer = packed.matrixBuffer;
                    p.featRows = packed.rows;
                    p.featCols = packed.cols;
                    delete p.features;
                }
                if (Array.isArray(p.labels)) {
                    const packed = packArray(p.labels);
                    p.labelsBuffer = packed.arrayBuffer;
                    delete p.labels;
                }
                msgPayload = p;
            }

            // Collect all ArrayBuffers / TypedArray buffers for zero-copy Transferable transfer
            collectTransferables(msgPayload, transferables);
            if (historyBuffer) collectTransferables(historyBuffer, transferables);

            this.localWorker.postMessage({
                taskId,
                task,
                payload: msgPayload,
                historyBuffer,
                drawCount,
                winningCount,
                totalCols
            }, transferables);
            
            // Timeout de sécurité pour le worker local (10 secondes maximum)
            timer = setTimeout(() => {
                if (this.callbacks.has(taskId)) {
                    this.callbacks.delete(taskId);
                    reject(new Error(`Timeout du Worker Local pour la tâche ${task}`));
                }
            }, 10000);
        });
    }

    private async runInMainThreadFallback<T>(task: string, payload: unknown, history: unknown[]): Promise<T> {
        console.warn(`[Nexus Worker] Échec du Local Worker. Repli sur le thread principal (synchrone) pour la tâche ${task}...`);
        try {
            const mathCore = await import('./mathCore');
            let result: unknown;
            const p = payload as any;
            const hist = history as any[];
            switch (task) {
                case 'full_analysis':
                    result = {
                        spectral: mathCore.runSpectral(hist),
                        fractal: mathCore.runFractal(hist)
                    };
                    break;
                case 'hurst_exponent':
                    result = mathCore.runFractal(hist);
                    break;
                case 'DENOISE_PCA':
                    result = mathCore.denoiseFeaturesPCA(p?.matrix, p?.variance);
                    break;
                case 'TRAIN_RIDGE':
                    result = mathCore.trainRidgeRegression(p?.features, p?.labels, p?.lambda);
                    break;
                case 'GAP_EFFICIENCY':
                    result = mathCore.runGapEfficiency(hist);
                    break;
                case 'SPECTRAL_METRICS':
                    result = mathCore.runSpectral(hist);
                    break;
                case 'wavelet_analysis':
                    result = mathCore.runContinuousWaveletTransformAnalysis(hist);
                    break;
                case 'TRANSFER_ENTROPY':
                    result = mathCore.computeTransferEntropy(hist, p?.targetNumbers);
                    break;
                case 'TOPOLOGICAL_LYAPUNOV_HPC':
                    result = computeTopologicalLyapunovHpc(
                        p.historyDraws,
                        p.numDraws,
                        p.winCols || 5,
                        p.horizonLimit || 30
                    );
                    break;
                case 'COMBINATORIAL_ANNEALING_HPC':
                    result = solveCombinatorialAnnealingHpc(p);
                    break;
                case 'CROSS_HAWKES_HPC':
                    result = computeCrossHawkesKernelHpc(p);
                    break;
                case 'MARKOV_TRANSITIONS_HPC':
                    result = computeMarkovTransitionHpc(
                        p.historyDraws,
                        p.numDraws,
                        p.winCols || 5,
                        p.numStates || 90
                    );
                    break;
                case 'COOCCURRENCE_TENSOR_HPC':
                    result = computeCooccurrenceTensorHpc(
                        p.predDrawsFlat,
                        p.targetDrawsFlat,
                        p.numDraws,
                        p.winCols || 5,
                        p.activePredNumbers || []
                    );
                    break;
                case 'HURST_HPC':
                    result = computeRobustHurstHpc(p.signal);
                    break;
                case 'SPECTRAL_FFT_HPC':
                    result = computeFftPowerSpectrumHpc(p.signal);
                    break;
                case 'SPATIAL_GRID_HPC': {
                    const flatDraws = p.flatDraws instanceof Int32Array ? p.flatDraws : new Int32Array(p.flatDraws || []);
                    const numDraws = p.numDraws || Math.floor(flatDraws.length / 5);
                    const spatial = computeSpatialGridHpc(flatDraws, numDraws);
                    result = {
                        gridDensity: spatial.gridDensity,
                        gravityPulls: spatial.gravityPulls,
                        barycenterX: spatial.barycenterX,
                        barycenterY: spatial.barycenterY,
                        entropy: spatial.entropy,
                        densityThreshold: spatial.densityThreshold
                    };
                    break;
                }
                case 'BARYCENTER_TRAJECTORY_HPC':
                    result = computeBarycenterTrajectoryHpc(p.results || [], p.limit || 20);
                    break;
                case 'PEARSON_CORRELATION_HPC': {
                    const x = p.x instanceof Float64Array ? p.x : new Float64Array(p.x || []);
                    const y = p.y instanceof Float64Array ? p.y : new Float64Array(p.y || []);
                    result = computePearsonCorrelationHpc(x, y);
                    break;
                }
                case 'PEARSON_MATRIX_HPC':
                    result = computePearsonCorrelationMatrixHpc(p.algoScores || {}, p.keys || []);
                    break;
                default:
                    result = { status: 'OK' };
            }
            return result as T;
        } catch (syncError: unknown) {
            throw new AppError((syncError instanceof Error ? syncError.message : String(syncError)) || "Échec final du calcul synchrone de secours", "WORKER_FATAL_ERROR", "high");
        }
    }

    public async runTask<T>(task: string, payload: unknown = {}, history: unknown[] = []): Promise<T> {
        // Exécution 100% locale via Web Worker + Rust/WASM HPC (Zéro appel Edge Function Supabase)
        try {
            return await this.runInLocalWorker(task, payload, history) as T;
        } catch (fallbackError: unknown) {
            return await this.runInMainThreadFallback<T>(task, payload, history);
        }
    }

    public async warmup(drawName: string = "Loto 5/90"): Promise<{ ready: boolean; latencyMs: number }> {
        const start = performance.now();
        try {
            if (!this.workerReady || !this.localWorker) {
                this.initLocalWorker();
            }
            if (this.localWorker) {
                // Lightweight ping task to force Web Worker JIT parse and memory warm-up
                await this.runInLocalWorker('warmup', { drawName }, []);
            }
        } catch (e) {
            console.debug("[Nexus Worker] Warmup fallback:", e);
        }
        const latencyMs = Math.round(performance.now() - start);
        return { ready: true, latencyMs };
    }

    /**
     * Exécute l'analyse topologique et chaotique de Lyapunov en arrière-plan via le Web Worker HPC
     */
    public async runTopologicalLyapunovHpc(
        historyDraws: Int32Array | number[],
        numDraws: number,
        winCols: number = 5,
        horizonLimit: number = 30
    ): Promise<WasmLyapunovResult> {
        return this.runTask<WasmLyapunovResult>('TOPOLOGICAL_LYAPUNOV_HPC', {
            historyDraws,
            numDraws,
            winCols,
            horizonLimit
        });
    }

    /**
     * Exécute le Recuit Simulé déterministe (Seed 5 HPC) en arrière-plan via le Web Worker HPC
     */
    public async runCombinatorialAnnealingHpc(params: {
        candidatePool: Int32Array | number[];
        scores91: Float64Array | number[];
        affinityMatrix: Float64Array | number[];
        initialTemperature?: number;
        coolingRate?: number;
        minTemperature?: number;
        iterationsPerTemp?: number;
        deterministicSeed?: number;
    }): Promise<WasmAnnealingResult> {
        return this.runTask<WasmAnnealingResult>('COMBINATORIAL_ANNEALING_HPC', params);
    }

    /**
     * Exécute le calcul du Noyau de Hawkes Croisé en arrière-plan via le Web Worker HPC
     */
    public async runCrossHawkesHpc(params: {
        predOccurrences: Int32Array;
        lagCount: number;
        winCols?: number;
        targetBaseline: Float64Array;
        couplingMatrix: Float64Array;
        betaDecay: number;
    }): Promise<WasmHawkesResult> {
        return this.runTask<WasmHawkesResult>('CROSS_HAWKES_HPC', params);
    }

    /**
     * Exécute les matrices de transition de Markov en arrière-plan via le Web Worker HPC
     */
    public async runMarkovHpc(
        historyDraws: Int32Array | number[],
        numDraws: number,
        winCols: number = 5,
        numStates: number = 90
    ): Promise<Float64Array> {
        return this.runTask<Float64Array>('MARKOV_TRANSITIONS_HPC', {
            historyDraws,
            numDraws,
            winCols,
            numStates
        });
    }

    /**
     * Exécute le calcul du Tenseur de Cooccurrence en arrière-plan via le Web Worker HPC
     */
    public async runCooccurrenceTensorHpc(
        predDrawsFlat: Int32Array,
        targetDrawsFlat: Int32Array,
        numDraws: number,
        winCols: number = 5,
        activePredNumbers: Int32Array | number[] = []
    ): Promise<WasmCooccurrenceResult> {
        return this.runTask<WasmCooccurrenceResult>('COOCCURRENCE_TENSOR_HPC', {
            predDrawsFlat,
            targetDrawsFlat,
            numDraws,
            winCols,
            activePredNumbers
        });
    }

    /**
     * Exécute le calcul de la grille spatiale et des puits newtoniens en arrière-plan via le Web Worker HPC
     */
    public async runSpatialGridHpc(
        flatDraws: Int32Array | number[],
        numDraws: number
    ): Promise<{
        gridDensity: Float64Array;
        gravityPulls: Float64Array;
        barycenterX: number;
        barycenterY: number;
        entropy: number;
        densityThreshold: number;
    }> {
        return this.runTask('SPATIAL_GRID_HPC', { flatDraws, numDraws });
    }

    /**
     * Exécute la trajectoire barycentrique historique en arrière-plan via le Web Worker HPC
     */
    public async runBarycenterTrajectoryHpc(
        results: { gagnants: number[]; date?: string }[],
        limit: number = 20
    ): Promise<Array<{ x: number; y: number; drawIndex: number; date?: string }>> {
        return this.runTask('BARYCENTER_TRAJECTORY_HPC', { results, limit });
    }

    /**
     * Exécute la corrélation de Pearson en arrière-plan via le Web Worker HPC
     */
    public async runPearsonCorrelationHpc(
        x: Float64Array | number[],
        y: Float64Array | number[]
    ): Promise<number | null> {
        return this.runTask('PEARSON_CORRELATION_HPC', { x, y });
    }

    /**
     * Exécute la matrice de corrélation de Pearson complète en arrière-plan via le Web Worker HPC
     */
    public async runPearsonMatrixHpc(
        algoScores: Record<string, number[] | Float64Array>,
        keys: readonly string[]
    ): Promise<{ matrix: Record<string, Record<string, number | null>>; average: number }> {
        return this.runTask('PEARSON_MATRIX_HPC', { algoScores, keys });
    }
}

export const workerService = new WorkerService();
