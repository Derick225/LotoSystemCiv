
import { DrawResult } from '../types';
import { AppError, logError } from '../utils/AppError';
import { runMarkovPrediction } from './lstmCore';

export const LSTMService = {
    /**
     * Entraîne le modèle et prédit le prochain tirage via un Web Worker
     */
    runPrediction: async (history: DrawResult[]): Promise<{ probabilities: number[], accuracy: number }> => {
        if (typeof Worker === 'undefined') {
            // FALLBACK: Execute logic directly if worker is not available (e.g. on backend)
            try {
                return runMarkovPrediction(history);
            } catch (e: any) {
                logError(new AppError(e.message || "Markov Fallback Error", "MARKOV_FALLBACK_ERROR", "medium"), { source: 'LSTMService' });
                return { probabilities: new Array(90).fill(0), accuracy: 0 };
            }
        }

        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL('./lstm.worker.ts', import.meta.url), { type: 'module' });
            const id = Date.now().toString();

            const timeout = setTimeout(() => {
                logError(new AppError("LSTM Prediction timed out", "LSTM_TIMEOUT", "medium"), { source: 'LSTMService' });
                worker.terminate();
                resolve({ probabilities: new Array(90).fill(0), accuracy: 0 });
            }, 120000); // 120s timeout for LSTM

            worker.onmessage = (e) => {
                if (e.data.id === id) {
                    clearTimeout(timeout);
                    if (e.data.error) {
                        logError(new AppError(e.data.error, "LSTM_WORKER_ERROR", "high"), { source: 'LSTMService' });
                        resolve({ probabilities: new Array(90).fill(0), accuracy: 0 });
                    } else {
                        resolve({ 
                            probabilities: e.data.probabilities, 
                            accuracy: e.data.accuracy 
                        });
                    }
                    worker.terminate();
                }
            };

            worker.onerror = (err) => {
                clearTimeout(timeout);
                logError(new AppError(err.message || "LSTM Worker Fatal Error", "LSTM_FATAL_ERROR", "high", { error: err }), { source: 'LSTMService' });
                worker.terminate();
                resolve({ probabilities: new Array(90).fill(0), accuracy: 0 });
            };

            worker.postMessage({ history, id });
        });
    }
};
