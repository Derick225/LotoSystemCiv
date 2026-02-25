
import { DrawResult } from '../types';

export const LSTMService = {
    /**
     * Entraîne le modèle et prédit le prochain tirage via un Web Worker
     */
    runPrediction: async (history: DrawResult[]): Promise<{ probabilities: number[], accuracy: number }> => {
        return new Promise((resolve, reject) => {
            if (typeof Worker === 'undefined') {
                console.warn("Web Workers not supported");
                resolve({ probabilities: new Array(90).fill(0), accuracy: 0 });
                return;
            }

            const worker = new Worker(new URL('./lstm.worker.ts', import.meta.url), { type: 'module' });
            const id = Date.now().toString();

            const timeout = setTimeout(() => {
                console.warn("LSTM Prediction timed out");
                worker.terminate();
                resolve({ probabilities: new Array(90).fill(0), accuracy: 0 });
            }, 30000); // 30s timeout for LSTM

            worker.onmessage = (e) => {
                if (e.data.id === id) {
                    clearTimeout(timeout);
                    if (e.data.error) {
                        console.error("LSTM Worker Error:", e.data.error);
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
                console.error("LSTM Worker Fatal Error:", err);
                worker.terminate();
                resolve({ probabilities: new Array(90).fill(0), accuracy: 0 });
            };

            worker.postMessage({ history, id });
        });
    }
};
