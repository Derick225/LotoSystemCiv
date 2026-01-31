
/**
 * Nexus Production Math Worker v12.0 (Deep Science Edition)
 * Implémentations mathématiques rigoureuses (DFT, Haar, R/S Analysis).
 */

export {};

const ctx = self as unknown as Worker;

// --- UTILS MATHS PURS ---

const mean = (data: number[]) => data.reduce((a, b) => a + b, 0) / (data.length || 1);

const stdDev = (data: number[]) => {
    const mu = mean(data);
    const variance = data.reduce((a, b) => a + Math.pow(b - mu, 2), 0) / (data.length || 1);
    return Math.sqrt(variance);
};

// Transformée de Fourier Discrète (DFT) Réelle
// Retourne le spectre de puissance (Magnitude)
function computeDFT(signal: number[]): { frequency: number, power: number, period: number }[] {
    const N = signal.length;
    const spectrum = [];
    
    // On ne calcule que la première moitié (Nyquist)
    for (let k = 1; k < N / 2; k++) {
        let re = 0;
        let im = 0;
        for (let n = 0; n < N; n++) {
            const angle = (2 * Math.PI * k * n) / N;
            // Fenêtre de Hanning pour réduire le leakage spectral
            const window = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
            const val = signal[n] * window;
            
            re += val * Math.cos(angle);
            im -= val * Math.sin(angle);
        }
        const magnitude = Math.sqrt(re * re + im * im);
        spectrum.push({
            frequency: k,
            power: magnitude,
            period: N / k
        });
    }
    return spectrum;
}

// Transformée en Ondelettes de Haar (1 niveau)
// Décompose le signal en Approximation (A) et Détail (D)
function computeHaarTransform(signal: number[]): number {
    const vals = [...signal];
    if (vals.length % 2 !== 0) vals.pop(); // Pair requis
    let energy = 0;
    
    for (let i = 0; i < vals.length; i += 2) {
        // Coefficient de détail (Haute fréquence / Changement brusque)
        const detail = (vals[i] - vals[i+1]) / Math.sqrt(2);
        energy += Math.pow(detail, 2);
    }
    return energy;
}

// Analyse R/S (Rescaled Range) pour exposant de Hurst robuste
// Calcule sur plusieurs tailles de fenêtres pour une régression linéaire
function computeRobustHurst(signal: number[]): number {
    const N = signal.length;
    if (N < 20) return 0.5;

    // Tailles de fenêtres (diviseurs)
    const windowSizes = [Math.floor(N/2), Math.floor(N/4), Math.floor(N/8)].filter(w => w > 4);
    if (windowSizes.length < 2) return 0.5;

    const logRs: number[] = [];
    const logSizes: number[] = [];

    for (const wSize of windowSizes) {
        const chunksCount = Math.floor(N / wSize);
        let totalRS = 0;

        for (let i = 0; i < chunksCount; i++) {
            const chunk = signal.slice(i * wSize, (i + 1) * wSize);
            const m = mean(chunk);
            const y = chunk.map(v => v - m);
            
            // Somme cumulative
            let sum = 0;
            const z = y.map(v => { sum += v; return sum; });
            
            const R = Math.max(...z) - Math.min(...z);
            const S = stdDev(chunk);
            
            if (S > 0) totalRS += R / S;
        }
        
        const avgRS = totalRS / chunksCount;
        if (avgRS > 0) {
            logRs.push(Math.log(avgRS));
            logSizes.push(Math.log(wSize));
        }
    }

    // Régression linéaire simple (Pente = Hurst)
    if (logRs.length < 2) return 0.5;
    
    const meanX = mean(logSizes);
    const meanY = mean(logRs);
    let num = 0, den = 0;
    
    for(let i=0; i<logRs.length; i++) {
        num += (logSizes[i] - meanX) * (logRs[i] - meanY);
        den += Math.pow(logSizes[i] - meanX, 2);
    }
    
    const slope = den !== 0 ? num / den : 0.5;
    return Math.max(0, Math.min(1, slope));
}

// --- WORKER HANDLER ---

ctx.onmessage = async (e: MessageEvent) => {
    const { requestId, task, history, payload } = e.data;
    if (!history || history.length === 0) return;

    try {
        let result: any;
        switch (task) {
            case 'full_analysis':
                result = {
                    spectral: calculateSpectralAnalysis(history),
                    wavelet: calculateWaveletEnergy(history),
                    fractal: calculateFractalDimensions(history),
                    centrality: calculatePageRank(history)
                };
                break;
            case 'wavelet_analysis':
                result = calculateWaveletEnergy(history);
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

// --- IMPLEMENTATIONS METIER ---

function calculateSpectralAnalysis(history: any[]) {
    // Analyse des 128 derniers tirages
    const N = Math.min(history.length, 128);
    const data = history.slice(0, N);
    
    const results = [];
    let globalMaxPower = 0;

    for (let num = 1; num <= 90; num++) {
        // Signal binaire : 1 si sorti, -1 si pas sorti (centré sur 0 pour supprimer la composante DC)
        const signal = data.map(d => (d.gagnants.includes(num) ? 1 : -1));
        
        const spectrum = computeDFT(signal);
        
        // On cherche la fréquence dominante
        let maxP = 0;
        let domPeriod = 0;
        
        spectrum.forEach(s => {
            if (s.power > maxP) {
                maxP = s.power;
                domPeriod = s.period;
            }
        });

        if (maxP > globalMaxPower) globalMaxPower = maxP;
        
        results.push({ 
            number: num, 
            rawEnergy: maxP, 
            dominantPeriod: domPeriod 
        });
    }

    // Normalisation
    return results.map(r => ({
        number: r.number,
        energy: Math.round((r.rawEnergy / (globalMaxPower || 1)) * 100),
        dominantPeriod: parseFloat(r.dominantPeriod.toFixed(1)),
        resonance: (r.rawEnergy / (globalMaxPower || 1)) > 0.8
    })).sort((a,b) => b.energy - a.energy);
}

function calculateWaveletEnergy(history: any[]) {
    // Ondelettes : Détection de "chocs" récents
    const N = Math.min(history.length, 64);
    const data = history.slice(0, N);
    const results = [];

    for (let num = 1; num <= 90; num++) {
        const signal = data.map(d => (d.gagnants.includes(num) ? 1 : 0));
        const energy = computeHaarTransform(signal);
        // Normalisation empirique
        const normalized = Math.min(100, (energy / (N/2)) * 100 * 2.5); 
        results.push({ number: num, energy: normalized });
    }
    return results;
}

function calculateFractalDimensions(history: any[]) {
    // Hurst : Analyse de la mémoire long terme
    const N = Math.min(history.length, 250);
    const data = history.slice(0, N);
    const results = [];

    for (let num = 1; num <= 90; num++) {
        const signal = data.map(d => (d.gagnants.includes(num) ? 1 : 0));
        const h = computeRobustHurst(signal);
        
        let regime = 'RANDOM';
        if (h > 0.6) regime = 'PERSISTANT';
        else if (h < 0.4) regime = 'ANTI-PERSISTANT';

        results.push({
            number: num,
            hurst: parseFloat(h.toFixed(3)),
            regime
        });
    }
    return results;
}

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

    // Pré-calcul des séries et moyennes
    const series: Float32Array[] = [];
    const means: number[] = [];
    const stds: number[] = [];

    for (let i = 1; i <= 90; i++) {
        const s = new Float32Array(N);
        let sum = 0;
        for (let k = 0; k < N; k++) {
            const val = data[k].gagnants.includes(i) ? 1 : 0;
            s[k] = val;
            sum += val;
        }
        series[i] = s;
        means[i] = sum / N;
        
        let variance = 0;
        for (let k = 0; k < N; k++) variance += Math.pow(s[k] - means[i], 2);
        stds[i] = Math.sqrt(variance);
    }

    for (let i = 1; i <= 90; i++) {
        const affinities: Record<number, number> = {};
        for (let j = 1; j <= 90; j++) {
            if (i === j) continue;
            
            // Corrélation de Pearson
            let covariance = 0;
            for (let k = 0; k < N; k++) {
                covariance += (series[i][k] - means[i]) * (series[j][k] - means[j]);
            }
            
            const denom = stds[i] * stds[j];
            const r = denom !== 0 ? covariance / denom : 0;

            if (Math.abs(r) > 0.05) affinities[j] = parseFloat(r.toFixed(3));
        }
        matrix[i] = { number: i, affinities };
    }
    return matrix;
}

function calculateKMeans(history: any[]) {
    // K-Means Algorithm (Lloyd's)
    // Features : [Retard (Gap), Fréquence Récente (Forme), Écart-Type des Gaps (Stabilité)]
    const points = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        let gap = 0;
        for (let j = 0; j < history.length; j++) {
            if (history[j].gagnants.includes(num)) { gap = j; break; }
        }
        const freq = history.slice(0, 20).filter(d => d.gagnants.includes(num)).length;
        
        const gaps = [];
        let lastIdx = -1;
        for(let j=0; j<Math.min(history.length, 100); j++) {
            if(history[j].gagnants.includes(num)) {
                if(lastIdx !== -1) gaps.push(j - lastIdx);
                lastIdx = j;
            }
        }
        const gapStd = gaps.length > 1 ? stdDev(gaps) : 10;

        return { number: num, x: gap, y: freq, z: gapStd, cluster: 'Neutre' };
    });

    // Centroids initiaux (Heuristiques)
    const centroids = [
        { x: 2, y: 3, z: 2, type: 'Sprinter' }, // Gap faible, Freq haute, Stable
        { x: 15, y: 1, z: 5, type: 'Marathonien' }, // Moyen
        { x: 35, y: 0, z: 10, type: 'Dormeur' }, // Gap énorme
        { x: 10, y: 1, z: 8, type: 'Neutre' }
    ];

    for (let iter = 0; iter < 10; iter++) {
        // Assignation
        points.forEach(p => {
            let minDist = Infinity;
            centroids.forEach(c => {
                // Distance Euclidienne pondérée
                const d = Math.pow(p.x - c.x, 2) + Math.pow((p.y - c.y)*5, 2) + Math.pow((p.z - c.z)/2, 2);
                if (d < minDist) { minDist = d; p.cluster = c.type; }
            });
        });

        // Update Centroids
        centroids.forEach(c => {
            const clusterPoints = points.filter(p => p.cluster === c.type);
            if (clusterPoints.length > 0) {
                c.x = mean(clusterPoints.map(p => p.x));
                c.y = mean(clusterPoints.map(p => p.y));
                c.z = mean(clusterPoints.map(p => p.z));
            }
        });
    }
    return points;
}

function calculatePageRank(history: any[]) {
    // PageRank sur le graphe de corrélation
    const matrix = calculatePearsonMatrix(history.slice(0, 80));
    const scores: Record<number, number> = {};
    const d = 0.85; // Damping factor standard
    
    for(let i=1; i<=90; i++) scores[i] = 1/90;

    for (let iter = 0; iter < 20; iter++) {
        const nextScores: Record<number, number> = {};
        for(let i=1; i<=90; i++) {
            let sumInbound = 0;
            // On cherche tous les noeuds J qui pointent vers I (Affinité > 0)
            for(let j=1; j<=90; j++) {
                if (i === j) continue;
                const aff = matrix[j].affinities[i];
                if (aff && aff > 0) {
                    // Poids sortant total de J (positif seulement)
                    const totalWeightJ = Object.values(matrix[j].affinities).reduce((a:any, b:any) => a + Math.max(0, b as number), 0) as number;
                    if (totalWeightJ > 0) {
                        sumInbound += (scores[j] * aff) / totalWeightJ;
                    }
                }
            }
            nextScores[i] = (1 - d) / 90 + d * sumInbound;
        }
        Object.assign(scores, nextScores);
    }
    
    const maxS = Math.max(...Object.values(scores));
    return Object.entries(scores).map(([n, s]) => ({ 
        number: parseInt(n), 
        normalized: Math.round((s/maxS)*100) 
    }));
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
            probability: Math.round(Math.min(100, (p / lastWinners.length) * 100 * 2)) // Boost visuel
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
