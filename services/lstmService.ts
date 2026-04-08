
import { DrawResult } from '../types';
import { AppError, logError } from '../utils/AppError';
import { runMarkovPrediction } from './lstmCore';
import { appConfig } from '../config/app.config';
import { auditLogger } from '../utils/auditLogger';

// 3. Implémente un Worker Pool (max 2 instances) dans lstmService.ts
class WorkerPool {
    private workers: Worker[] = [];
    private queue: { history: DrawResult[], resolve: (val: any) => void, reject: (err: any) => void }[] = [];
    private activeWorkers = 0;
    private maxWorkers = appConfig.concurrency.maxWorkers;

    constructor() {
        if (typeof Worker !== 'undefined') {
            for (let i = 0; i < this.maxWorkers; i++) {
                this.workers.push(new Worker(new URL('./lstm.worker.ts', import.meta.url), { type: 'module' }));
            }
        }
    }

    async execute(history: DrawResult[]): Promise<{ probabilities: number[], accuracy: number }> {
        if (this.workers.length === 0) {
            // Fallback if workers are not supported
            try {
                return runMarkovPrediction(history);
            } catch (e: unknown) {
                const err = e as Error;
                logError(new AppError(err.message || "Markov Fallback Error", "MARKOV_FALLBACK_ERROR", "medium"), { source: 'LSTMService' });
                return { probabilities: new Array(90).fill(0), accuracy: 0 };
            }
        }

        return new Promise((resolve, reject) => {
            if (this.activeWorkers < this.maxWorkers) {
                this.runTask(history, resolve, reject);
            } else {
                this.queue.push({ history, resolve, reject });
            }
        });
    }

    private runTask(history: DrawResult[], resolve: (val: any) => void, reject: (err: any) => void) {
        const worker = this.workers.pop();
        if (!worker) return;

        this.activeWorkers++;
        const id = Date.now().toString();

        // 4. Réduis le timeout à 15s
        const timeout = setTimeout(() => {
            auditLogger('warn', 'LSTMService', 'Markov Worker timeout');
            worker.terminate();
            // Replace the terminated worker
            this.workers.push(new Worker(new URL('./lstm.worker.ts', import.meta.url), { type: 'module' }));
            this.activeWorkers--;
            resolve({ probabilities: new Array(90).fill(0), accuracy: 0 });
            this.processQueue();
        }, appConfig.markov.timeoutMs);

        worker.onmessage = (e) => {
            if (e.data.id === id) {
                clearTimeout(timeout);
                if (e.data.error) {
                    auditLogger('error', 'LSTMService', e.data.error);
                    resolve({ probabilities: new Array(90).fill(0), accuracy: 0 });
                } else {
                    resolve({ 
                        probabilities: e.data.probabilities, 
                        accuracy: e.data.accuracy 
                    });
                }
                this.workers.push(worker);
                this.activeWorkers--;
                this.processQueue();
            }
        };

        worker.onerror = (err) => {
            clearTimeout(timeout);
            auditLogger('error', 'LSTMService', err.message);
            worker.terminate();
            this.workers.push(new Worker(new URL('./lstm.worker.ts', import.meta.url), { type: 'module' }));
            this.activeWorkers--;
            resolve({ probabilities: new Array(90).fill(0), accuracy: 0 });
            this.processQueue();
        };

        worker.postMessage({ history, id });
    }

    private processQueue() {
        if (this.queue.length > 0 && this.activeWorkers < this.maxWorkers) {
            const task = this.queue.shift();
            if (task) {
                this.runTask(task.history, task.resolve, task.reject);
            }
        }
    }
}

const pool = new WorkerPool();

export const LSTMService = {
    /**
     * Entraîne le modèle et prédit le prochain tirage via un Web Worker
     */
    runPrediction: async (history: DrawResult[]): Promise<{ probabilities: number[], accuracy: number }> => {
        return pool.execute(history);
    }
};
