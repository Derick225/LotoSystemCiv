
import { AppError } from '../utils/AppError';
import { apiClient } from '../core/api/apiClient';
import { isSupabaseConfigured } from './supabaseClient';
import { packHistory, packMatrix, packArray, collectTransferables } from './workers/zeroCopy';

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
            let historyBuffer: ArrayBuffer | undefined;
            let drawCount: number | undefined;
            let winningCount: number | undefined;
            let totalCols: number | undefined;

            if (Array.isArray(history) && history.length > 0) {
                const packed = packHistory(history as any);
                historyBuffer = packed.historyBuffer;
                drawCount = packed.drawCount;
                winningCount = packed.winningCount;
                totalCols = packed.totalCols;
                transferables.push(historyBuffer);
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
                default:
                    result = { status: 'OK' };
            }
            return result as T;
        } catch (syncError: unknown) {
            throw new AppError((syncError instanceof Error ? syncError.message : String(syncError)) || "Échec final du calcul synchrone de secours", "WORKER_FATAL_ERROR", "high");
        }
    }

    private edgeFailures: number = 0;
    private edgeCooldownUntil: number = 0;

    public async runTask<T>(task: string, payload: unknown = {}, history: unknown[] = []): Promise<T> {
        // 1. PRIORITÉ ABSOLUE À LA RAPIDITÉ LOCALE (0ms latence réseau)
        // Le Web Worker local s'exécute en parallèle sur le CPU du client avec Transferable ArrayBuffers
        if (typeof Worker !== 'undefined') {
            try {
                return await this.runInLocalWorker(task, payload, history) as T;
            } catch (localWorkerErr) {
                console.warn(`[Nexus Worker] Le worker local a échoué pour ${task}, repli réseau/synchrone...`, localWorkerErr);
            }
        }

        // 2. TENTATIVE EDGE FUNCTION (uniquement si le Worker local n'est pas supporté et circuit ouvert non actif)
        if (isSupabaseConfigured() && Date.now() >= this.edgeCooldownUntil) {
            try {
                const response = await apiClient.post<{ success: boolean, result?: unknown, error?: string }>('compute-nexus-analytics', {
                    task,
                    payload,
                    history
                }, { suppressErrorLogging: true });

                if (response && response.success) {
                    this.edgeFailures = 0;
                    return response.result as T;
                } else {
                    throw new Error(response?.error || "Erreur Edge Function");
                }
            } catch (e: unknown) {
                this.edgeFailures++;
                if (this.edgeFailures >= 3) {
                    this.edgeCooldownUntil = Date.now() + 5 * 60 * 1000;
                }
            }
        }

        // 3. REPLI FINAL : Thread principal déterministe
        return await this.runInMainThreadFallback<T>(task, payload, history);
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
}

export const workerService = new WorkerService();
