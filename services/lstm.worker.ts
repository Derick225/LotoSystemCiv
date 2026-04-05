import { runMarkovPrediction } from './lstmCore';

const ctx = self as unknown as Worker;

// 2nd-order Markov Chain implementation
self.onmessage = async (e: MessageEvent) => {
    const { history, id } = e.data;
    
    try {
        const result = runMarkovPrediction(history);
        self.postMessage({ id, ...result });
    } catch (error) {
        console.error("Markov Chain Worker Error:", error);
        self.postMessage({ id, probabilities: new Array(90).fill(0), accuracy: 0, error: String(error) });
    }
};
