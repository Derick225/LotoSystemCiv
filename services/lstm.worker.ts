import type { DrawResult } from '../types';

const ctx = self as unknown as Worker;

// 2nd-order Markov Chain implementation
self.onmessage = async (e: MessageEvent) => {
    const { history, id } = e.data;
    
    try {
        if (!history || history.length < 10) {
            self.postMessage({ id, probabilities: new Array(90).fill(0), accuracy: 0 });
            return;
        }

        // We want to build a transition matrix: P(N_t | N_{t-1}, N_{t-2})
        // Since a draw has 5 numbers, we can look at transitions between consecutive draws.
        // For simplicity and performance, we'll build a co-occurrence based Markov model.
        // We track how often number C appears in draw T, given that A appeared in T-2 and B appeared in T-1.
        
        // To avoid massive memory usage (90x90x90), we'll use a Map for sparse transitions
        const transitions = new Map<string, Map<number, number>>();
        
        // Build the model from history (reverse to go chronological)
        const chronologicalHistory = [...history].reverse();
        
        for (let i = 2; i < chronologicalHistory.length; i++) {
            const drawTMinus2 = chronologicalHistory[i - 2].gagnants;
            const drawTMinus1 = chronologicalHistory[i - 1].gagnants;
            const drawT = chronologicalHistory[i].gagnants;
            
            // For every combination of (A in T-2) and (B in T-1), record (C in T)
            for (const a of drawTMinus2) {
                for (const b of drawTMinus1) {
                    const stateKey = `${a},${b}`;
                    if (!transitions.has(stateKey)) {
                        transitions.set(stateKey, new Map<number, number>());
                    }
                    const nextStates = transitions.get(stateKey)!;
                    
                    for (const c of drawT) {
                        nextStates.set(c, (nextStates.get(c) || 0) + 1);
                    }
                }
            }
        }
        
        // Predict next draw based on the most recent 2 draws
        const lastDraw = history[0].gagnants;
        const prevDraw = history[1].gagnants;
        
        const probabilities = new Array(91).fill(0);
        let totalWeight = 0;
        
        for (const a of prevDraw) {
            for (const b of lastDraw) {
                const stateKey = `${a},${b}`;
                const nextStates = transitions.get(stateKey);
                
                if (nextStates) {
                    for (const [c, count] of nextStates.entries()) {
                        if (c >= 1 && c <= 90) {
                            probabilities[c] += count;
                            totalWeight += count;
                        }
                    }
                }
            }
        }
        
        // Normalize probabilities
        const normalizedProbabilities = new Array(90).fill(0);
        if (totalWeight > 0) {
            for (let i = 1; i <= 90; i++) {
                normalizedProbabilities[i - 1] = probabilities[i] / totalWeight;
            }
        } else {
            // Fallback to 1st order if 2nd order has no data
            const firstOrderTransitions = new Map<number, Map<number, number>>();
            for (let i = 1; i < chronologicalHistory.length; i++) {
                const drawTMinus1 = chronologicalHistory[i - 1].gagnants;
                const drawT = chronologicalHistory[i].gagnants;
                for (const b of drawTMinus1) {
                    if (!firstOrderTransitions.has(b)) firstOrderTransitions.set(b, new Map<number, number>());
                    const nextStates = firstOrderTransitions.get(b)!;
                    for (const c of drawT) {
                        nextStates.set(c, (nextStates.get(c) || 0) + 1);
                    }
                }
            }
            
            let fallbackWeight = 0;
            for (const b of lastDraw) {
                const nextStates = firstOrderTransitions.get(b);
                if (nextStates) {
                    for (const [c, count] of nextStates.entries()) {
                        if (c >= 1 && c <= 90) {
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
        
        // Calculate a pseudo-accuracy based on how well the model would have predicted the last draw
        let accuracy = 0.5; // Default baseline
        if (history.length >= 3) {
            let correctPredictions = 0;
            const testDrawTMinus2 = history[2].gagnants;
            const testDrawTMinus1 = history[1].gagnants;
            const actualDrawT = history[0].gagnants;
            
            const testProbs = new Array(91).fill(0);
            for (const a of testDrawTMinus2) {
                for (const b of testDrawTMinus1) {
                    const stateKey = `${a},${b}`;
                    const nextStates = transitions.get(stateKey);
                    if (nextStates) {
                        for (const [c, count] of nextStates.entries()) {
                            testProbs[c] += count;
                        }
                    }
                }
            }
            
            // Get top 5 predictions
            const topPredictions = Array.from({length: 90}, (_, i) => ({ num: i + 1, prob: testProbs[i + 1] }))
                .sort((a, b) => b.prob - a.prob)
                .slice(0, 5)
                .map(p => p.num);
                
            for (const n of actualDrawT) {
                if (topPredictions.includes(n)) correctPredictions++;
            }
            accuracy = correctPredictions / 5;
        }

        self.postMessage({ id, probabilities: normalizedProbabilities, accuracy });
        
    } catch (error) {
        console.error("Markov Chain Worker Error:", error);
        self.postMessage({ id, probabilities: new Array(90).fill(0), accuracy: 0, error: String(error) });
    }
};
