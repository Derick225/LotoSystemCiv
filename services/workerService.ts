
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
                    console.error("MathWorker Error:", e);
                };
            } catch (e) {
                console.warn("Impossible d'initialiser le MathWorker, repli sur le thread principal.", e);
            }
        }
    }

    public isAvailable(): boolean {
        return !!this.worker;
    }

    public async runTask<T>(task: string, payload: any = {}, history: any[] = []): Promise<T> {
        if (!this.worker) {
            throw new Error("Worker not available");
        }

        const requestId = Math.random().toString(36).substring(7);
        return new Promise((resolve, reject) => {
            this.taskCallbacks.set(requestId, { resolve, reject });
            this.worker!.postMessage({ task, payload, history, requestId });
        });
    }
}

export const workerService = new WorkerService();
