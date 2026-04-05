import type { DrawResult } from '../types';

export function runMarkovPrediction(history: DrawResult[]) {
    if (!history || history.length < 10) {
        return { probabilities: new Array(90).fill(0), accuracy: 0 };
    }

    const transitions = new Map<string, Map<number, number>>();
    const chronologicalHistory = [...history].reverse();
    
    for (let i = 2; i < chronologicalHistory.length; i++) {
        const drawTMinus2 = chronologicalHistory[i - 2].gagnants;
        const drawTMinus1 = chronologicalHistory[i - 1].gagnants;
        const drawT = chronologicalHistory[i].gagnants;
        
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
    
    const normalizedProbabilities = new Array(90).fill(0);
    if (totalWeight > 0) {
        for (let i = 1; i <= 90; i++) {
            normalizedProbabilities[i - 1] = probabilities[i] / totalWeight;
        }
    } else {
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
    
    let accuracy = 0.5;
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
