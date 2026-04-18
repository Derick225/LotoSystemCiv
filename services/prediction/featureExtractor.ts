import { DrawResult } from '../../types';

export interface ExtractedFeatures {
    freqMap: Float32Array;
    gapsMap: Int32Array;
    markovMap: Float32Array;
    affinityMap: Float32Array[]; // 2D array of Float32Array
    machineTransferMap: Float32Array;
    momentumMap: Float32Array;
    antiConsensusMap: Float32Array;
    equilibriumMap: Float32Array;
}

export const extractFeatures = (history: DrawResult[], sampleSize: number = 100): ExtractedFeatures => {
    const recentHistory = history.slice(0, sampleSize);
    const lastDraw = history[0]?.gagnants || [];

    const MAX_NUM = 91; // 1 to 90 directly indexed
    const freqMap = new Float32Array(MAX_NUM);
    const gapsMap = new Int32Array(MAX_NUM).fill(-1); // -1 signifies not found yet
    const markovMap = new Float32Array(MAX_NUM);
    
    // Instead of Map of Maps, use Array of Float32Arrays for cache locality
    const affinityMap: Float32Array[] = Array(MAX_NUM);
    for (let i = 0; i < MAX_NUM; i++) {
        affinityMap[i] = new Float32Array(MAX_NUM);
    }
    
    const machineTransferMap = new Float32Array(MAX_NUM);
    const momentumMap = new Float32Array(MAX_NUM);
    const antiConsensusMap = new Float32Array(MAX_NUM);
    const equilibriumMap = new Float32Array(MAX_NUM);
    
    const machineFreqMap = new Float32Array(MAX_NUM);

    // 1. Frequencies, Gaps, Machine Transfer, Momentum, Anti-Consensus, Equilibrium
    let oddCount = 0;
    let lowCount = 0;
    let totalNums10 = 0;

    for (let i = 0; i < recentHistory.length; i++) {
        const draw = recentHistory[i];
        for (const n of draw.gagnants) {
            if (n >= 1 && n <= 90) {
                freqMap[n] += 1;
                if (gapsMap[n] === -1) gapsMap[n] = i;

                // Momentum (last 8 draws)
                if (i < 8) {
                    momentumMap[n] += 1;
                }

                // Anti-Consensus (last 40 draws)
                if (i < 40) {
                    antiConsensusMap[n] += 1;
                }

                // Equilibrium (last 10 draws)
                if (i < 10) {
                    if (n % 2 !== 0) oddCount++;
                    if (n <= 45) lowCount++;
                    totalNums10++;
                }
            }
        }
        
        if (draw.machine) {
            draw.machine.forEach(mNum => {
                if (mNum >= 1 && mNum <= 90) {
                    machineFreqMap[mNum] += 1;
                }
            });
        }
        
        // Machine Transfer: Was it in the machine yesterday and dropped in gagnants today?
        if (i < recentHistory.length - 1 && recentHistory[i+1].machine) {
             const prevMachine = recentHistory[i+1].machine;
             const currentGagnants = draw.gagnants;
             prevMachine?.forEach(mNum => {
                 if(mNum >= 1 && mNum <= 90 && currentGagnants.includes(mNum)) {
                     machineTransferMap[mNum] += 1;
                 }
             });
        }
    }
    
    for (let i = 1; i <= 90; i++) { 
        if (gapsMap[i] === -1) gapsMap[i] = sampleSize; 
    }

    // Normalize Machine Transfers to Probabilities
    for (let i = 1; i <= 90; i++) {
        const mFreq = machineFreqMap[i] || 1;
        machineTransferMap[i] = machineTransferMap[i] / mFreq;
    }

    // Calculate Equilibrium Scores
    const oddRatio = totalNums10 > 0 ? oddCount / totalNums10 : 0.5;
    const lowRatio = totalNums10 > 0 ? lowCount / totalNums10 : 0.5;

    for (let n = 1; n <= 90; n++) {
        let eqScore = 50;
        const isOdd = n % 2 !== 0;
        const isLow = n <= 45;
        
        if (oddRatio < 0.45 && isOdd) eqScore += 25;
        else if (oddRatio > 0.55 && !isOdd) eqScore += 25;
        
        if (lowRatio < 0.45 && isLow) eqScore += 25;
        else if (lowRatio > 0.55 && !isLow) eqScore += 25;
        
        equilibriumMap[n] = eqScore;
    }

    // 2. Markov & Affinity
    // We already have Float32Array[] for affinityMap
    // Let's use Float32Array[] for markov transitions too
    const markovTransitionMap: Float32Array[] = Array(91);
    for (let i=0; i<=90; i++) {
        markovTransitionMap[i] = new Float32Array(91);
    }

    for (let i = 0; i < recentHistory.length - 1; i++) {
        const current = recentHistory[i].gagnants;
        const prev = recentHistory[i+1].gagnants;
        
        for (const p of prev) {
            if (p >= 1 && p <= 90) {
                 for (const c of current) {
                     if (c >= 1 && c <= 90) {
                         markovTransitionMap[p][c] += 1;
                     }
                 }
            }
        }

        for (const c1 of current) {
            if (c1 >= 1 && c1 <= 90) {
                for (const c2 of current) {
                    if (c2 >= 1 && c2 <= 90 && c1 !== c2) {
                        affinityMap[c1][c2] += 1;
                    }
                }
            }
        }
    }

    // Normalize Markov Transitions to Probabilities (0.0 to 1.0)
    for (let p = 1; p <= 90; p++) {
        let total = 0;
        for (let c = 1; c <= 90; c++) total += markovTransitionMap[p][c];
        
        if (total > 0) {
            for (let c = 1; c <= 90; c++) {
                markovTransitionMap[p][c] = markovTransitionMap[p][c] / total;
            }
        }
    }

    // Normalize Affinity to Conditional Probabilities P(c2 | c1)
    for (let c1 = 1; c1 <= 90; c1++) {
        const freqC1 = freqMap[c1] || 1;
        for (let c2 = 1; c2 <= 90; c2++) {
            affinityMap[c1][c2] = affinityMap[c1][c2] / freqC1;
        }
    }

    // Calculate Markov probabilities for the next draw
    lastDraw.forEach(lastNum => {
        if (lastNum >= 1 && lastNum <= 90) {
            for (let nextNum = 1; nextNum <= 90; nextNum++) {
                markovMap[nextNum] += markovTransitionMap[lastNum][nextNum];
            }
        }
    });

    // Average Markov probabilities across the last draw's numbers
    if (lastDraw.length > 0) {
        for (let nextNum = 1; nextNum <= 90; nextNum++) {
            markovMap[nextNum] = markovMap[nextNum] / lastDraw.length;
        }
    }

    return {
        freqMap,
        gapsMap,
        markovMap,
        affinityMap,
        machineTransferMap,
        momentumMap,
        antiConsensusMap,
        equilibriumMap
    };
};
