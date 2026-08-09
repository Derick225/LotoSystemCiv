import { AppError } from '../utils/AppError';
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
    private initFailed: boolean = false;
    private initAttempts: number = 0;
    private maxInitAttempts: number = 1;

    constructor() {
        this.initLocalWorker();
    }

    private initLocalWorker() {
        if (this.initFailed || this.initAttempts >= this.maxInitAttempts) {
            this.workerReady = false;
            this.localWorker = null;
            return;
        }

        try {
            if (typeof Worker === 'undefined') {
                console.warn("L'environnement ne supporte pas les Web Workers. Exécution en mode dégradé (synchrone).");
                this.initFailed = true;
                return;
            }
            if (this.localWorker) {
                try { this.localWorker.terminate(); } catch (_) {}
            }
            
            this.initAttempts++;
            
            // Tentative d'initialisation progressive du Web Worker pour une compatibilité maximale
            try {
                this.localWorker = new Worker(new URL('./nexus.worker.ts', /* @ts-ignore */ import.meta.url), { type: 'module' });
            } catch (moduleError) {
                console.warn("[WorkerService] Échec du worker en mode 'module', essai en mode classique...", moduleError);
                try {
                    this.localWorker = new Worker(new URL('./nexus.worker.ts', /* @ts-ignore */ import.meta.url));
                } catch (classicError) {
                    console.error("[WorkerService] Échec définitif de création du Web Worker:", classicError);
                    this.initFailed = true;
                    this.workerReady = false;
                    this.localWorker = null;
                    return;
                }
            }
            
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
                this.initFailed = true; // Désactivation permanente après le premier échec d'exécution/chargement
                
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
            this.initFailed = true;
        }
    }

    private internalWorkerCounter = 0;

    public isAvailable(): boolean {
        return true;
    }

    private runInLocalWorker(task: string, payload: unknown, history: unknown[]): Promise<unknown> {
        if (this.initFailed) {
            return Promise.reject(new Error("Local Worker non disponible (précédemment échoué)"));
        }
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
                    result = await mathCore.computeTransferEntropy(hist, p?.targetNumbers);
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
        // PRIORITÉ 1 : Worker local (aucune latence réseau, toujours tenté en premier).
        // C'est le chemin critique pour la réactivité de l'UI : il ne doit jamais
        // attendre un aller-retour réseau avant de démarrer.
        if (this.workerReady || !this.localWorker) {
            try {
                const result = await this.runInLocalWorker(task, payload, history);
                return result as T;
            } catch (localError: unknown) {
                console.info('[Nexus Worker] Worker local indisponible, tentative via repli principal...');
            }
        }

        // PRIORITÉ 2 : calcul synchrone sur le thread principal.
        // Bloque l'UI le temps du calcul : n'est atteint que si le Worker local n'est pas disponible.
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
