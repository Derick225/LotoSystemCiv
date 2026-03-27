
import { AppError, logError } from '../utils/AppError';

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
                logError(new AppError(e.message || "Impossible d'initialiser le MathWorker", "WORKER_INIT_ERROR", "medium", { error: e }), { source: 'WorkerService' });
            }
        }
    }

    public isAvailable(): boolean {
        return !!this.worker;
    }

    public async runTask<T>(task: string, payload: any = {}, history: any[] = []): Promise<T> {
        if (!this.worker) {
            throw new AppError("Worker not available", "WORKER_NOT_AVAILABLE", "medium");
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
