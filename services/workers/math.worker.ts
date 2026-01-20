
/**
 * Nexus Production Math Worker v10.1 (HPC Balance Edition)
 */

export {};

const ctx = self as unknown as Worker;

ctx.onmessage = async (e: MessageEvent) => {
    const { requestId, task, history, payload } = e.data;
    if (!history || history.length === 0) return;

    try {
        let result: any;
        switch (task) {
            case 'full_analysis':
                result = {
                    spectral: calculateSpectralFFT(history),
                    wavelet: calculateWaveletScan(history),
                    fractal: calculateHurstExponent(history),
                    centrality: calculatePageRank(history)
                };
                break;
            case 'wavelet_analysis':
                result = calculateWaveletScan(history);
                break;
            case 'succession_matrix':
                result = calculateSuccession(history);
                break;
            case 'pearson_matrix':
                result = calculatePearsonMatrix(history);
                break;
            case 'k_means_clustering':
                result = calculateKMeans(history);
                break;
            case 'next_projections':
                result = calculateProjections(history, payload.lastNumbers);
                break;
            case 'followers_analysis':
                result = calculateAllFollowers(history);
                break;
            default:
                result = { status: 'OK' };
        }
        ctx.postMessage({ requestId, result });
    } catch (err: any) {
        ctx.postMessage({ requestId, error: err.message });
    }
};

function calculateSuccession(history: any[]) {
    const matrix: Record<number, Record<number, number>> = {};
    const totals: Record<number, number> = {};

    for (let i = 0; i < history.length - 1; i++) {
        const current = history[i].gagnants;
        const prev = history[i + 1].gagnants;

        prev.forEach(p => {
            if (!matrix[p]) matrix[p] = {};
            totals[p] = (totals[p] || 0) + 1;
            current.forEach(c => {
                matrix[p][c] = (matrix[p][c] || 0) + 1;
            });
        });
    }
    return { matrix, totals };
}

function calculatePearsonMatrix(history: any[]) {
    const matrix: Record<number, any> = {};
    const N = Math.min(200, history.length);
    const data = history.slice(0, N);

    const getSeries = (num: number) => data.map(d => (d.gagnants.includes(num) ? 1 : 0));
    const means: Record<number, number> = {};
    const series: Record<number, number[]> = {};

    for (let i = 1; i <= 90; i++) {
        series[i] = getSeries(i);
        means[i] = series[i].reduce((a, b) => a + b, 0) / N;
    }

    for (let i = 1; i <= 90; i++) {
        const affinities: Record<number, number> = {};
        const xi = series[i];
        const mi = means[i];

        for (let j = 1; j <= 90; j++) {
            if (i === j) continue;
            const xj = series[j];
            const mj = means[j];

            let num = 0, den1 = 0, den2 = 0;
            for (let k = 0; k < N; k++) {
                const d1 = xi[k] - mi;
                const d2 = xj[k] - mj;
                num += d1 * d2;
                den1 += d1 * d1;
                den2 += d2 * d2;
            }
            // Corrélation normalisée
            const r = num / (Math.sqrt(den1 * den2) || 1);
            if (r > 0.05) affinities[j] = parseFloat(r.toFixed(3));
        }
        matrix[i] = { number: i, affinities };
    }
    return matrix;
}

function calculateKMeans(history: any[]) {
    const points = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        let gap = 0;
        for (let j = 0; j < history.length; j++) {
            if (history[j].gagnants.includes(num)) { gap = j; break; }
        }
        // Fréquence amortie pour le clustering
        const freq = Math.sqrt(history.slice(0, 25).filter(d => d.gagnants.includes(num)).length);
        return { number: num, x: gap, y: freq, cluster: 'Neutre' };
    });

    const centroids = [
        { x: 2, y: 3, type: 'Sprinter' },
        { x: 18, y: 1.5, type: 'Marathonien' },
        { x: 35, y: 0.5, type: 'Dormeur' },
        { x: 10, y: 1, type: 'Neutre' }
    ];

    for (let iter = 0; iter < 8; iter++) {
        points.forEach(p => {
            let minDist = Infinity;
            centroids.forEach(c => {
                const d = Math.pow(p.x - c.x, 2) + Math.pow(p.y - c.y, 2);
                if (d < minDist) { minDist = d; p.cluster = c.type; }
            });
        });

        centroids.forEach(c => {
            const clusterPoints = points.filter(p => p.cluster === c.type);
            if (clusterPoints.length > 0) {
                c.x = clusterPoints.reduce((a, b) => a + b.x, 0) / clusterPoints.length;
                c.y = clusterPoints.reduce((a, b) => a + b.y, 0) / clusterPoints.length;
            }
        });
    }
    return points;
}

function calculatePageRank(history: any[]) {
    const matrix = calculatePearsonMatrix(history.slice(0, 80));
    const scores: Record<number, number> = {};
    for(let i=1; i<=90; i++) scores[i] = 1/90;

    for (let iter = 0; iter < 12; iter++) {
        const nextScores: Record<number, number> = {};
        for(let i=1; i<=90; i++) {
            let rank = 0.15 / 90;
            Object.entries(matrix).forEach(([vStr, data]: [any, any]) => {
                const v = parseInt(vStr);
                const affs = data.affinities;
                const weight = affs[i] || 0;
                // On réduit le poids sortant des noeuds trop centraux (trop fréquents)
                const totalOut = Object.values(affs).reduce((a:any,b:any)=>a+b, 0) as number;
                if (totalOut > 0) rank += 0.85 * (scores[v] * (weight / totalOut));
            });
            nextScores[i] = rank;
        }
        Object.assign(scores, nextScores);
    }
    const maxS = Math.max(...Object.values(scores));
    return Object.entries(scores).map(([n, s]) => ({ 
        number: parseInt(n), 
        normalized: Math.round(Math.sqrt(s/maxS)*100) 
    }));
}

function calculateWaveletScan(history: any[]) {
    const results = [];
    for (let num = 1; num <= 90; num++) {
        const signal = history.map(d => (d.gagnants.includes(num) ? 1 : 0));
        let energy = 0;
        for (let i = 0; i < Math.min(signal.length - 1, 32); i += 2) {
            energy += Math.pow(signal[i] - signal[i+1], 2);
        }
        results.push({ number: num, energy: Math.min(100, energy * 25) });
    }
    return results;
}

function calculateSpectralFFT(history: any[]) {
    const N = history.length;
    let globalMaxPower = 0;
    const rawPowers = [];

    for (let num = 1; num <= 90; num++) {
        const signal = history.map(d => (d.gagnants.includes(num) ? 1 : 0));
        const mean = signal.reduce((a: number, b: number) => a + b, 0) / N;
        let maxPower = 0;
        let dominantPeriod = 0;
        const signalWindowed = signal.map((s, idx) => (s - mean) * (0.54 - 0.46 * Math.cos((2 * Math.PI * idx) / (N - 1))));

        const limit = Math.floor(N / 2);
        for (let k = 1; k < limit; k++) {
            let re = 0, im = 0;
            for (let n = 0; n < N; n++) {
                const angle = (2 * Math.PI * k * n) / N;
                re += signalWindowed[n] * Math.cos(angle);
                im -= signalWindowed[n] * Math.sin(angle);
            }
            const power = (re * re + im * im) / N;
            if (power > maxPower) { maxPower = power; dominantPeriod = N / k; }
        }
        if (maxPower > globalMaxPower) globalMaxPower = maxPower;
        rawPowers.push({ number: num, rawEnergy: maxPower, dominantPeriod });
    }

    const safeMax = globalMaxPower > 0 ? globalMaxPower : 1;
    return rawPowers.map(p => ({
        number: p.number,
        energy: Math.round((p.rawEnergy / safeMax) * 100),
        dominantPeriod: parseFloat(p.dominantPeriod.toFixed(1))
    })).sort((a,b) => b.energy - a.energy);
}

function calculateHurstExponent(history: any[]) {
    const results = [];
    const N = Math.min(history.length, 200);
    for (let num = 1; num <= 90; num++) {
        const signal = history.slice(0, N).map(d => (d.gagnants.includes(num) ? 1 : 0));
        const mean = signal.reduce((a: number, b: number) => a + b, 0) / N;
        const x = signal.map(v => v - mean);
        let cumsum = 0;
        const y = x.map(val => { cumsum += val; return cumsum; });
        const R = Math.max(...y) - Math.min(...y);
        const S = Math.sqrt(x.reduce((a, v) => a + v * v, 0) / N) || 1;
        const h = Math.log(R / S) / Math.log(N);
        const clampedH = Math.max(0, Math.min(1, h || 0.5));
        results.push({
            number: num,
            hurst: parseFloat(clampedH.toFixed(2)),
            regime: clampedH > 0.6 ? 'PERSISTANT' : clampedH < 0.4 ? 'ANTI-PERSISTANT' : 'RANDOM'
        });
    }
    return results;
}

function calculateProjections(history: any[], lastWinners: number[]) {
    const { matrix, totals } = calculateSuccession(history);
    const probs: Record<number, number> = {};
    
    lastWinners.forEach(lw => {
        const row = matrix[lw] || {};
        const total = totals[lw] || 1;
        Object.entries(row).forEach(([fStr, count]) => {
            const f = parseInt(fStr);
            probs[f] = (probs[f] || 0) + (count as number / total);
        });
    });

    return Object.entries(probs)
        .map(([n, p]) => ({ 
            number: parseInt(n), 
            // Probabilité amortie
            probability: Math.round(Math.sqrt(p / lastWinners.length) * 100) 
        }))
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 10);
}

function calculateAllFollowers(history: any[]) {
    const { matrix, totals } = calculateSuccession(history);
    return Object.keys(matrix).map(leaderStr => {
        const leader = parseInt(leaderStr);
        const total = totals[leader];
        const followers = Object.entries(matrix[leader])
            .map(([fStr, count]) => ({ 
                number: parseInt(fStr), 
                count: count as number, 
                probability: Math.round((count as number / total) * 100) 
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        return { leader, followers };
    });
}
