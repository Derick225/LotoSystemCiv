
/**
 * Nexus Production Math Worker v9.0 (Deep Resonance + Clustering + Monte Carlo)
 * Traitement analytique lourd sur l'ENTIÈRETÉ de l'historique.
 */

export {};

// Fix: Explicitly type self as Worker using safe casting
const ctx = self as unknown as Worker;

// --- UTILS INTERNES ---
const calculateMean = (data: number[]) => data.reduce((a, b) => a + b, 0) / (data.length || 1);

const normalize = (val: number, min: number, max: number) => {
    return (val - min) / (max - min) || 0;
};

// --- ALGORITHMES COMPLEXES ---

const runEchoStateNetworkLocal = (signal: number[]): number => {
    if (signal.length < 20) return 0;
    const reservoirSize = 20;
    const spectralRadius = 0.95;
    const leakage = 0.3;
    const trainLen = signal.length - 1;
    const W = Array.from({length: reservoirSize}, () => Array.from({length: reservoirSize}, () => (Math.random() - 0.5)));
    const Win = Array.from({length: reservoirSize}, () => (Math.random() - 0.5) * 2.0);
    let x = new Array(reservoirSize).fill(0);
    const X_states: number[][] = [];
    const Y_target: number[] = [];
    for (let t = 0; t < trainLen; t++) {
        const u = signal[t];
        const newX = new Array(reservoirSize).fill(0);
        for (let i = 0; i < reservoirSize; i++) {
            let internalSum = 0;
            for (let j = 0; j < reservoirSize; j++) internalSum += W[i][j] * x[j];
            newX[i] = (1 - leakage) * x[i] + leakage * Math.tanh(internalSum * spectralRadius + Win[i] * u);
        }
        x = newX;
        X_states.push([...x, 1]);
        Y_target.push(signal[t+1]);
    }
    const W_out = new Array(reservoirSize + 1).fill(0);
    for (let i = 0; i <= reservoirSize; i++) {
        let num = 0, den = 0;
        for (let t = 0; t < trainLen; t++) {
            num += X_states[t][i] * Y_target[t];
            den += X_states[t][i] * X_states[t][i];
        }
        W_out[i] = den !== 0 ? num / (den + 0.01) : 0;
    }
    const u_last = signal[signal.length - 1];
    const nextX = new Array(reservoirSize).fill(0);
    for (let i = 0; i < reservoirSize; i++) {
        let internalSum = 0;
        for (let j = 0; j < reservoirSize; j++) internalSum += W[i][j] * x[j];
        nextX[i] = (1 - leakage) * x[i] + leakage * Math.tanh(internalSum * spectralRadius + Win[i] * u_last);
    }
    let prediction = 0;
    for (let i = 0; i < reservoirSize; i++) prediction += W_out[i] * nextX[i];
    prediction += W_out[reservoirSize];
    return Math.max(0, Math.min(100, prediction * 100));
};

const runKMeans = (history: any[]) => {
    // 1. Préparation des données (Freq vs Gap)
    const points: { id: number, x: number, y: number }[] = [];
    const limit = Math.min(history.length, 100);
    
    // Calcul fréquences et écarts
    const gaps: Record<number, number> = {};
    const freqs: Record<number, number> = {};
    
    for(let n=1; n<=90; n++) {
        let gap = 0;
        let count = 0;
        for(let i=0; i<limit; i++) {
            if (history[i].gagnants.includes(n)) {
                count++;
                if (gap === 0 && i > 0) gap = i; // Premier gap rencontré
            } else if (count === 0) {
                gap++;
            }
        }
        freqs[n] = count;
        gaps[n] = gap;
    }

    // Normalisation
    const maxFreq = Math.max(...Object.values(freqs), 1);
    const maxGap = Math.max(...Object.values(gaps), 1);

    for(let n=1; n<=90; n++) {
        points.push({
            id: n,
            x: (gaps[n] / maxGap) * 100, // X = Retard (Gap)
            y: (freqs[n] / maxFreq) * 100 // Y = Fréquence
        });
    }

    // 2. Initialisation des Centroïdes (Fixes pour garantir la sémantique)
    // Sprinter: Freq Haute, Gap Faible
    // Dormeur: Freq Basse, Gap Haut
    // Marathonien: Freq Moyenne, Gap Moyen
    // Neutre: Le reste
    let centroids = [
        { name: 'Sprinter', x: 10, y: 90 }, 
        { name: 'Dormeur', x: 90, y: 10 },
        { name: 'Marathonien', x: 50, y: 50 },
        { name: 'Neutre', x: 10, y: 10 }
    ];

    // 3. Boucle K-Means
    const assignments: Record<number, string> = {};
    
    for (let iter = 0; iter < 20; iter++) {
        // Assignment
        points.forEach(p => {
            let minDist = Infinity;
            let bestCluster = 'Neutre';
            
            centroids.forEach(c => {
                const dist = Math.sqrt(Math.pow(p.x - c.x, 2) + Math.pow(p.y - c.y, 2));
                if (dist < minDist) {
                    minDist = dist;
                    bestCluster = c.name;
                }
            });
            assignments[p.id] = bestCluster;
        });

        // Update Centroids
        const newCentroids: Record<string, { sumX: number, sumY: number, count: number }> = {};
        centroids.forEach(c => newCentroids[c.name] = { sumX: 0, sumY: 0, count: 0 });

        points.forEach(p => {
            const cluster = assignments[p.id];
            newCentroids[cluster].sumX += p.x;
            newCentroids[cluster].sumY += p.y;
            newCentroids[cluster].count++;
        });

        centroids = centroids.map(c => {
            const data = newCentroids[c.name];
            if (data.count === 0) return c; // Pas de déplacement si vide
            return {
                name: c.name,
                x: data.sumX / data.count,
                y: data.sumY / data.count
            };
        });
    }

    // 4. Formatting Result
    return points.map(p => ({
        number: p.id,
        x: Math.round(gaps[p.id]), // Renvoie les valeurs réelles pour l'affichage
        y: freqs[p.id],
        cluster: assignments[p.id]
    }));
};

const runMonteCarlo = (history: any[]) => {
    // 1. Matrice de transition (Markov)
    const transitions: Record<number, number[]> = {};
    for(let i=1; i<=90; i++) transitions[i] = [];
    
    // On apprend des 100 derniers tirages
    const learnLimit = Math.min(history.length - 1, 100);
    for(let i=0; i<learnLimit; i++) {
        const current = history[i].gagnants;
        const prev = history[i+1].gagnants;
        
        prev.forEach((p: number) => {
            current.forEach((c: number) => {
                if (transitions[p]) transitions[p].push(c);
            });
        });
    }

    // 2. Simulation (10,000 tirages)
    const scores: Record<number, number> = {};
    for(let i=1; i<=90; i++) scores[i] = 0;
    
    // Derniers numéros connus (Graine)
    const lastDraw = history[0].gagnants;
    
    for(let sim=0; sim<5000; sim++) {
        // On tire 5 numéros basés sur les probabilités de transition depuis le dernier tirage
        const simulatedDraw = new Set<number>();
        
        // Pour chaque numéro du dernier tirage, on choisit un successeur probable
        lastDraw.forEach((seed: number) => {
            const potential = transitions[seed];
            if (potential && potential.length > 0) {
                const pick = potential[Math.floor(Math.random() * potential.length)];
                simulatedDraw.add(pick);
            } else {
                // Fallback aléatoire
                simulatedDraw.add(Math.floor(Math.random()*90)+1);
            }
        });
        
        // Complétion si < 5
        while(simulatedDraw.size < 5) {
            simulatedDraw.add(Math.floor(Math.random()*90)+1);
        }
        
        simulatedDraw.forEach(n => scores[n]++);
    }

    // Normalisation 0-100
    const maxVal = Math.max(...Object.values(scores), 1);
    for(let i=1; i<=90; i++) scores[i] = (scores[i] / maxVal) * 100;
    
    return scores;
};

// --- HANDLER PRINCIPAL ---

ctx.onmessage = async (e: MessageEvent) => {
    const { requestId, task, history, payload } = e.data;
    if (!history || history.length === 0) return;

    try {
        let result: any;
        switch (task) {
            case 'full_analysis':
                result = performFullComputePipeline(history);
                break;
            case 'pearson_matrix':
                result = calculatePearsonMatrix(history);
                break;
            case 'succession_matrix':
                result = calculateSuccessionMatrix(history);
                break;
            case 'followers_analysis':
                result = calculateFollowersAnalysis(history);
                break;
            case 'next_projections':
                result = calculateNextProjections(history, payload?.lastNumbers);
                break;
            case 'hurst_exponent':
                result = calculateHurstExponent(history);
                break;
            case 'stochastic_audit':
                result = performStructuralAudit(history);
                break;
            case 'k_means_clustering':
                result = runKMeans(history);
                break;
            case 'monte_carlo_simulation':
                result = runMonteCarlo(history);
                break;
            default:
                throw new Error(`Task ${task} unknown`);
        }
        ctx.postMessage({ requestId, result });
    } catch (err: any) {
        ctx.postMessage({ requestId, error: err.message });
    }
};

function performFullComputePipeline(history: any[]) {
    return {
        spectral: calculateSpectralFFT(history),
        fractal: calculateHurstExponent(history),
        audit: performStructuralAudit(history), 
        centrality: calculateEigenvectorCentrality(history),
        correlations: calculatePearsonMatrix(history)
    };
}

function calculateSuccessionMatrix(history: any[]) {
    const matrix: Record<number, Record<number, number>> = {};
    const totals: Record<number, number> = {};
    
    if (!history || history.length < 2) return { matrix, totals };

    for (let i = 0; i < history.length - 1; i++) {
        const current = history[i].gagnants;
        const prev = history[i+1].gagnants;
        
        for (const p of prev) {
            if (!matrix[p]) matrix[p] = {};
            totals[p] = (totals[p] || 0) + 1;
            for (const c of current) {
                matrix[p][c] = (matrix[p][c] || 0) + 1;
            }
        }
    }
    return { matrix, totals };
}

function calculateFollowersAnalysis(history: any[]) {
    const { matrix, totals } = calculateSuccessionMatrix(history);
    const result = [];

    for (let leader = 1; leader <= 90; leader++) {
        const followersMap = matrix[leader];
        if (followersMap) {
            const totalOccurrences = totals[leader] || 0;
            const followers = Object.entries(followersMap)
                .map(([numStr, count]) => ({
                    number: parseInt(numStr),
                    count: count as number,
                    probability: totalOccurrences > 0 ? ((count as number) / totalOccurrences) * 100 : 0
                }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);
            
            if (followers.length > 0) {
                result.push({ leader, followers });
            }
        }
    }
    return result.sort((a, b) => {
        const sumA = a.followers.reduce((acc, f) => acc + f.count, 0);
        const sumB = b.followers.reduce((acc, f) => acc + f.count, 0);
        return sumB - sumA;
    });
}

function calculateNextProjections(history: any[], lastNumbers: number[]) {
    if (!history || history.length < 2 || !lastNumbers) return [];
    
    const { matrix, totals } = calculateSuccessionMatrix(history);
    const scores: Record<number, number> = {};

    // 1. Matrice de Markov (Classique)
    lastNumbers.forEach(n => {
        const nextMap = matrix[n] || {};
        const total = totals[n] || 1;
        Object.entries(nextMap).forEach(([target, count]) => {
            const t = parseInt(target);
            const prob = (count as number) / total;
            scores[t] = (scores[t] || 0) + prob;
        });
    });

    // 2. Injection Deep Resonance (ESN)
    const signalLength = Math.min(history.length, 100);
    
    for (let num = 1; num <= 90; num++) {
        const signal = [];
        for(let i = signalLength - 1; i >= 0; i--) {
            signal.push(history[i].gagnants.includes(num) ? 1 : 0);
        }
        const resonance = runEchoStateNetworkLocal(signal);
        scores[num] = (scores[num] || 0) + (resonance / 100) * 0.5;
    }

    const maxScore = Math.max(...Object.values(scores), 0.001);

    return Object.entries(scores)
        .map(([num, prob]) => ({ 
            number: parseInt(num), 
            probability: Math.min(99, Math.round((prob / maxScore) * 90))
        }))
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 10);
}

function calculatePearsonMatrix(history: any[]) {
    const N = history.length; 
    const nodes = 90;
    const matrix: Record<number, { affinities: Record<number, number> }> = {};
    
    const vectors: Float32Array[] = new Array(nodes + 1);
    for (let i = 1; i <= nodes; i++) {
        vectors[i] = new Float32Array(N);
        for (let t = 0; t < N; t++) {
            vectors[i][t] = history[t].gagnants.includes(i) ? 1 : 0;
        }
    }

    for (let i = 1; i <= nodes; i++) {
        matrix[i] = { affinities: {} };
        const vecI = vectors[i]!;
        const meanI = vecI.reduce((a, b) => a + b, 0) / N;
        
        for (let j = 1; j <= nodes; j++) {
            if (i === j) continue;
            const vecJ = vectors[j]!;
            const meanJ = vecJ.reduce((a, b) => a + b, 0) / N;
            
            let num = 0, denI = 0, denJ = 0;
            for (let t = 0; t < N; t++) {
                const dI = vecI[t] - meanI;
                const dJ = vecJ[t] - meanJ;
                num += dI * dJ;
                denI += dI * dI;
                denJ += dJ * dJ;
            }
            
            const r = denI * denJ === 0 ? 0 : num / Math.sqrt(denI * denJ);
            if (Math.abs(r) > 0.05) { 
                matrix[i].affinities[j] = parseFloat(r.toFixed(4));
            }
        }
    }
    return matrix;
}

function calculateHurstExponent(history: any[]) {
    const nodes = 90;
    const results = [];
    const N = history.length;
    
    for (let num = 1; num <= nodes; num++) {
        const signal = history.map(d => (d.gagnants.includes(num) ? 1 : 0));
        if (signal.length < 10) {
            results.push({ number: num, hurst: 0.5, regime: 'RANDOM', strength: 0 });
            continue;
        }

        const mean = signal.reduce((a: number, b: number) => a + b, 0) / N;
        const x = signal.map(v => v - mean);
        const y = new Float32Array(x.length);
        let cumsum = 0;
        for (let i = 0; i < x.length; i++) {
            cumsum += x[i];
            y[i] = cumsum;
        }

        const R = Math.max(...Array.from(y)) - Math.min(...Array.from(y));
        const S = Math.sqrt(x.reduce((a, v) => a + v * v, 0) / N) || 1;
        const h = Math.log(R / S) / Math.log(N);
        const clampedH = Math.max(0, Math.min(1, h || 0.5));

        results.push({
            number: num,
            hurst: parseFloat(clampedH.toFixed(2)),
            regime: clampedH > 0.6 ? 'PERSISTANT' : clampedH < 0.4 ? 'ANTI-PERSISTANT' : 'RANDOM',
            strength: Math.abs(clampedH - 0.5) * 200
        });
    }
    return results;
}

function calculateSpectralFFT(history: any[]) {
    const N = history.length;
    const rawPowers = [];
    let globalMaxPower = 0;

    // 1. Calcul des puissances brutes
    for (let num = 1; num <= 90; num++) {
        const signal = history.map(d => (d.gagnants.includes(num) ? 1 : 0));
        const mean = signal.reduce((a: number, b: number) => a + b, 0) / N;
        let maxPower = 0;
        let dominantPeriod = 0;
        const signalWindowed = signal.map((s, idx) => (s - mean) * (0.54 - 0.46 * Math.cos((2 * Math.PI * idx) / (N - 1)))); // Hamming

        const limit = Math.floor(N / 2);
        for (let k = 1; k < limit; k++) {
            let re = 0, im = 0;
            for (let n = 0; n < N; n++) {
                const angle = (2 * Math.PI * k * n) / N;
                re += signalWindowed[n] * Math.cos(angle);
                im -= signalWindowed[n] * Math.sin(angle);
            }
            const power = (re * re + im * im) / N;
            if (power > maxPower) {
                maxPower = power;
                dominantPeriod = N / k;
            }
        }
        
        if (maxPower > globalMaxPower) globalMaxPower = maxPower;
        
        rawPowers.push({ 
            number: num, 
            rawEnergy: maxPower, 
            dominantPeriod: parseFloat(dominantPeriod.toFixed(1)),
            waveform: signal.slice(0, 30) // Garde le signal récent pour viz
        });
    }

    // 2. Normalisation Dynamique Relative (Scale 0-100 based on Global Max)
    const safeMax = globalMaxPower > 0 ? globalMaxPower : 1;
    
    const results = rawPowers.map(p => {
        const normalized = (p.rawEnergy / safeMax) * 100;
        return {
            number: p.number,
            energy: Math.round(normalized),
            dominantPeriod: p.dominantPeriod,
            waveform: p.waveform,
            isResonating: normalized > 75
        };
    });

    return results.sort((a, b) => b.energy - a.energy);
}

function performStructuralAudit(sample: any[]) {
    const allNums = sample.flatMap(d => d.gagnants);
    const N = allNums.length;
    const freq: Record<number, number> = {};
    allNums.forEach(n => freq[n] = (freq[n] || 0) + 1);

    let entropy = 0;
    Object.values(freq).forEach(count => {
        const p = count / N;
        if (p > 0) entropy -= p * Math.log2(p);
    });
    const maxEntropy = Math.log2(90);
    const normalizedEntropy = entropy / maxEntropy;

    return {
        entropy: parseFloat(normalizedEntropy.toFixed(4)),
        isRandom: normalizedEntropy > 0.88,
        anomalies: normalizedEntropy < 0.8 ? ["Structure ordonnée anormale détectée"] : []
    };
}

function calculateEigenvectorCentrality(history: any[]) {
    const nodes = 90;
    const adj = new Float32Array(nodes * nodes).fill(0);
    history.forEach(draw => {
        const nums = draw.gagnants;
        for(let i=0; i<nums.length; i++) {
            for(let j=i+1; j<nums.length; j++) {
                const u = nums[i]-1, v = nums[j]-1;
                if (u >= 0 && u < 90 && v >= 0 && v < 90) {
                    adj[u * nodes + v] += 1;
                    adj[v * nodes + u] += 1;
                }
            }
        }
    });
    let centrality = new Float32Array(nodes).fill(1/nodes);
    for(let iter=0; iter<15; iter++) {
        const next = new Float32Array(nodes).fill(0);
        for(let i=0; i<nodes; i++) {
            for(let j=0; j<nodes; j++) next[i] += adj[i * nodes + j] * centrality[j];
        }
        const norm = Math.sqrt(Array.from(next).reduce((a,v) => a + v*v, 0));
        if(norm > 0) for(let i=0; i<nodes; i++) next[i] /= norm;
        centrality = next;
    }
    const max = Math.max(...Array.from(centrality));
    return Array.from(centrality).map((s, i) => ({
        number: i + 1,
        centrality: s,
        normalized: Math.round((s / (max || 1)) * 100)
    }));
}
