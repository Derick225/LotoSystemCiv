import { DrawResult } from '../../types';

export interface ExtractedFeatures {
    freqMap: Map<number, number>;
    gapsMap: Map<number, number>;
    markovMap: Map<number, number>;
    affinityMap: Map<number, Map<number, number>>;
    machineTransferMap: Map<number, number>;
}

export const extractFeatures = (history: DrawResult[], sampleSize: number = 100): ExtractedFeatures => {
    const recentHistory = history.slice(0, sampleSize);
    const lastDraw = history[0]?.gagnants || [];

    const freqMap = new Map<number, number>();
    const gapsMap = new Map<number, number>();
    const markovMap = new Map<number, number>();
    const affinityMap = new Map<number, Map<number, number>>();
    const machineTransferMap = new Map<number, number>();
    
    const machineFreqMap = new Map<number, number>(); // To normalize machine transfers

    // 1. Frequencies, Gaps, Machine Transfer
    for (let i = 0; i < recentHistory.length; i++) {
        const draw = recentHistory[i];
        for (const n of draw.gagnants) {
            freqMap.set(n, (freqMap.get(n) || 0) + 1);
            if (!gapsMap.has(n)) gapsMap.set(n, i);
        }
        
        if (draw.machine) {
            draw.machine.forEach(mNum => {
                machineFreqMap.set(mNum, (machineFreqMap.get(mNum) || 0) + 1);
            });
        }
        
        // Machine Transfer: Was it in the machine yesterday and dropped in gagnants today?
        if (i < recentHistory.length - 1 && recentHistory[i+1].machine) {
             const prevMachine = recentHistory[i+1].machine;
             const currentGagnants = draw.gagnants;
             prevMachine?.forEach(mNum => {
                 if(currentGagnants.includes(mNum)) {
                     machineTransferMap.set(mNum, (machineTransferMap.get(mNum) || 0) + 1);
                 }
             });
        }
    }
    
    for (let i = 1; i <= 90; i++) { 
        if (!gapsMap.has(i)) gapsMap.set(i, sampleSize); 
    }

    // Normalize Machine Transfers to Probabilities
    machineTransferMap.forEach((count, mNum) => {
        const mFreq = machineFreqMap.get(mNum) || 1;
        machineTransferMap.set(mNum, count / mFreq);
    });

    // 2. Markov & Affinity
    const markovTransitionMap = new Map<number, Map<number, number>>();

    for (let i = 0; i < recentHistory.length - 1; i++) {
        const current = recentHistory[i].gagnants;
        const prev = recentHistory[i+1].gagnants;
        
        prev.forEach(p => {
            if (!markovTransitionMap.has(p)) markovTransitionMap.set(p, new Map());
            const transitions = markovTransitionMap.get(p)!;
            current.forEach(c => {
                transitions.set(c, (transitions.get(c) || 0) + 1);
            });
        });

        current.forEach(c1 => {
            if (!affinityMap.has(c1)) affinityMap.set(c1, new Map());
            const affinities = affinityMap.get(c1)!;
            current.forEach(c2 => {
                if (c1 !== c2) affinities.set(c2, (affinities.get(c2) || 0) + 1);
            });
        });
    }

    // Normalize Markov Transitions to Probabilities (0.0 to 1.0)
    markovTransitionMap.forEach((transitions, p) => {
        let total = 0;
        transitions.forEach(count => total += count);
        if (total > 0) {
            transitions.forEach((count, c) => {
                transitions.set(c, count / total);
            });
        }
    });

    // Normalize Affinity to Conditional Probabilities P(c2 | c1)
    affinityMap.forEach((affinities, c1) => {
        const freqC1 = freqMap.get(c1) || 1;
        affinities.forEach((count, c2) => {
            affinities.set(c2, count / freqC1);
        });
    });

    // Calculate Markov probabilities for the next draw
    lastDraw.forEach(lastNum => {
        const transitions = markovTransitionMap.get(lastNum);
        if (transitions) {
            transitions.forEach((prob, nextNum) => {
                markovMap.set(nextNum, (markovMap.get(nextNum) || 0) + prob);
            });
        }
    });

    // Average Markov probabilities across the last draw's numbers
    if (lastDraw.length > 0) {
        markovMap.forEach((val, key) => {
            markovMap.set(key, val / lastDraw.length);
        });
    }

    return {
        freqMap,
        gapsMap,
        markovMap,
        affinityMap,
        machineTransferMap
    };
};
