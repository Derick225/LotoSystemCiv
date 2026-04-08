import type { DrawResult } from '../types';
import { appConfig } from '../config/app.config';

export function runMarkovPrediction(history: DrawResult[]) {
    if (!history || history.length < 10) {
        return { probabilities: new Array(90).fill(0), accuracy: 0 };
    }

    // 1. Prevent Data Leakage: Train on history.slice(2)
    // history[0] is the latest draw (T)
    // history[1] is T-1
    // history[2] is T-2
    // We train on history[2] and older to predict history[0] for accuracy testing.
    const trainingHistory = history.slice(2);
    const chronologicalHistory = [...trainingHistory].reverse();
    
    // 2. Memory Optimization: Numeric encoding instead of strings
    // Key: a * 91 + b
    // Value: Uint16Array of length 91 (index 1-90 for next numbers)
    const transitions = new Map<number, Uint16Array>();
    
    for (let i = 2; i < chronologicalHistory.length; i++) {
        const drawTMinus2 = chronologicalHistory[i - 2].gagnants;
        const drawTMinus1 = chronologicalHistory[i - 1].gagnants;
        const drawT = chronologicalHistory[i].gagnants;
        
        for (const a of drawTMinus2) {
            for (const b of drawTMinus1) {
                const stateKey = a * 91 + b;
                if (!transitions.has(stateKey)) {
                    transitions.set(stateKey, new Uint16Array(91));
                }
                const nextStates = transitions.get(stateKey)!;
                for (const c of drawT) {
                    if (c >= 1 && c <= 90) {
                        nextStates[c]++;
                    }
                }
            }
        }
    }
    
    // Predict next draw (T+1) using history[0] and history[1]
    const lastDraw = history[0].gagnants;
    const prevDraw = history[1].gagnants;
    const probabilities = new Float32Array(91);
    let totalWeight = 0;
    
    for (const a of prevDraw) {
        for (const b of lastDraw) {
            const stateKey = a * 91 + b;
            const nextStates = transitions.get(stateKey);
            if (nextStates) {
                for (let c = 1; c <= 90; c++) {
                    const count = nextStates[c];
                    if (count > 0) {
                        probabilities[c] += count;
                        totalWeight += count;
                    }
                }
            }
        }
    }
    
    // 5. Align array sizes (length 90)
    const normalizedProbabilities = new Array(90).fill(0);
    if (totalWeight > 0) {
        for (let i = 1; i <= 90; i++) {
            normalizedProbabilities[i - 1] = probabilities[i] / totalWeight;
        }
    } else {
        // Fallback to 1st order Markov
        const firstOrderTransitions = new Map<number, Uint16Array>();
        for (let i = 1; i < chronologicalHistory.length; i++) {
            const drawTMinus1 = chronologicalHistory[i - 1].gagnants;
            const drawT = chronologicalHistory[i].gagnants;
            for (const b of drawTMinus1) {
                if (!firstOrderTransitions.has(b)) firstOrderTransitions.set(b, new Uint16Array(91));
                const nextStates = firstOrderTransitions.get(b)!;
                for (const c of drawT) {
                    if (c >= 1 && c <= 90) {
                        nextStates[c]++;
                    }
                }
            }
        }
        
        let fallbackWeight = 0;
        for (const b of lastDraw) {
            const nextStates = firstOrderTransitions.get(b);
            if (nextStates) {
                for (let c = 1; c <= 90; c++) {
                    const count = nextStates[c];
                    if (count > 0) {
                        probabilities[c] += count;
                        fallbackWeight += count;
                    }
                }
            }
        }
        
        if (fallbackWeight > 0) {
            for (let i = 1; i <= 90; i++) {
                normalizedProbabilities[i - 1] = probabilities[i] / fallbackWeight;
            }
        }
    }
    
    // Accuracy testing on history[0] (T) using history[2] (T-2) and history[1] (T-1)
    let accuracy = 0;
    if (history.length >= 3) {
        let correctPredictions = 0;
        const testDrawTMinus2 = history[2].gagnants;
        const testDrawTMinus1 = history[1].gagnants;
        const actualDrawT = history[0].gagnants;
        const testProbs = new Float32Array(91);
        
        for (const a of testDrawTMinus2) {
            for (const b of testDrawTMinus1) {
                const stateKey = a * 91 + b;
                const nextStates = transitions.get(stateKey);
                if (nextStates) {
                    for (let c = 1; c <= 90; c++) {
                        testProbs[c] += nextStates[c];
                    }
                }
            }
        }
        
        const topPredictions = Array.from({length: 90}, (_, i) => ({ num: i + 1, prob: testProbs[i + 1] }))
            .sort((a, b) => b.prob - a.prob)
            .slice(0, 5)
            .map(p => p.num);
            
        for (const n of actualDrawT) {
            if (topPredictions.includes(n)) correctPredictions++;
        }
        accuracy = correctPredictions / 5;
    }

    return { probabilities: normalizedProbabilities, accuracy };
}
