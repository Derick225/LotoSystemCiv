
import { AppError, logError } from '../utils/AppError';
import * as mathCore from './mathCore';

/**
 * NEXUS WORKER SERVICE
 * Orchestre les calculs lourds en arrière-plan pour garder l'UI fluide.
 */

class WorkerService {
    private worker: Worker | null = null;
    private taskCallbacks = new Map<string, { resolve: Function, reject: Function }>();

    constructor() {
        if (typeof window !== 'undefined' && window.Worker) {
            try {
                // Utilisation de la syntaxe Vite pour les workers
                this.worker = new Worker(new URL('./math.worker.ts', import.meta.url), {
                    type: 'module'
                });

                this.worker.onmessage = (e) => {
                    const { requestId, result, error } = e.data;
                    const cb = this.taskCallbacks.get(requestId);
                    if (cb) {
                        if (error) cb.reject(new Error(error));
                        else cb.resolve(result);
                        this.taskCallbacks.delete(requestId);
                    }
                };

                this.worker.onerror = (e) => {
                    logError(new AppError(e.message || "MathWorker Error", "MATH_WORKER_ERROR", "high", { error: e }), { source: 'WorkerService' });
                };
            } catch (e: any) {
                console.warn("Worker initialization failed, using fallback:", e);
            }
        }
    }

    public isAvailable(): boolean {
        return !!this.worker;
    }

    public async runTask<T>(task: string, payload: any = {}, history: any[] = []): Promise<T> {
        if (!this.worker) {
            // FALLBACK: Execute logic directly if worker is not available (e.g. on backend)
            try {
                let result: any;
                switch (task) {
                    case 'full_analysis':
                        result = {
                            spectral: mathCore.runSpectral(history),
                            wavelet: mathCore.runWavelet(history),
                            fractal: mathCore.runFractal(history)
                        };
                        break;
                    case 'wavelet_analysis':
                        result = mathCore.runWavelet(history);
                        break;
                    case 'hurst_exponent': 
                        result = mathCore.runFractal(history);
                        break;
                    case 'DENOISE_PCA':
                        result = mathCore.denoiseFeaturesPCA(payload.matrix, payload.variance);
                        break;
                    case 'TRAIN_RIDGE':
                        result = mathCore.trainRidgeRegression(payload.features, payload.labels, payload.lambda);
                        break;
                    case 'GAP_EFFICIENCY':
                        result = mathCore.runGapEfficiency(history);
                        break;
                    case 'SPECTRAL_METRICS':
                        result = mathCore.runSpectral(history);
                        break;
                    default:
                        result = { status: 'OK' };
                }
                return result as T;
            } catch (e: any) {
                throw new AppError(e.message || "Fallback Task Error", "WORKER_FALLBACK_ERROR", "medium");
            }
        }

        const requestId = Math.random().toString(36).substring(7);
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.taskCallbacks.has(requestId)) {
                    this.taskCallbacks.delete(requestId);
                    reject(new AppError(`Task ${task} timed out after 120s`, "WORKER_TIMEOUT", "medium"));
                }
            }, 120000);

            this.taskCallbacks.set(requestId, { 
                resolve: (res: T) => {
                    clearTimeout(timeout);
                    resolve(res);
                }, 
                reject: (err: Error) => {
                    clearTimeout(timeout);
                    reject(err);
                } 
            });
            this.worker!.postMessage({ task, payload, history, requestId });
        });
    }
}

export const workerService = new WorkerService();
