/**
 * Nexus Production Math Worker v12.0 (Deep Science Edition)
 * Implémentations mathématiques réelles (DFT, Haar, Hurst R/S).
 */

const ctx = self as unknown as Worker;

// --- UTILS MATHS DE PRÉCISION ---

const mean = (data: number[]) => data.reduce((a, b) => a + b, 0) / (data.length || 1);

const stdDev = (data: number[]) => {
    const mu = mean(data);
    const variance = data.reduce((a, b) => a + Math.pow(b - mu, 2), 0) / (data.length || 1);
    return Math.sqrt(variance);
};

// --- ALGORITHMES RÉELS ---

/**
 * Transformée de Fourier Discrète (DFT) Réelle
 * Identifie les cycles de sortie périodiques.
 */
function computeDFT(signal: number[]): { frequency: number, power: number, period: number }[] {
    const N = signal.length;
    const spectrum = [];
    
    // Calcul sur la moitié du spectre (Nyquist)
    for (let k = 1; k < N / 2; k++) {
        let re = 0;
        let im = 0;
        for (let n = 0; n < N; n++) {
            // Application d'une fenêtre de Hanning pour réduire le leakage spectral
            const window = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
            const val = signal[n] * window;
            
            const angle = (2 * Math.PI * k * n) / N;
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

/**
 * Transformée en Ondelettes de Haar (1 niveau)
 * Isole l'énergie des changements brusques récents.
 */
function computeHaarWaveletEnergy(signal: number[]): number {
    const vals = [...signal];
    if (vals.length % 2 !== 0) vals.pop();
    let energy = 0;
    
    for (let i = 0; i < vals.length; i += 2) {
        // Coefficient de détail (Haute fréquence)
        const detail = (vals[i] - vals[i+1]) / Math.sqrt(2);
        energy += Math.pow(detail, 2);
    }
    return energy;
}

/**
 * Analyse R/S (Rescaled Range) pour Hurst robuste
 * Mesure la persistance (mémoire) du numéro.
 */
function computeRobustHurst(signal: number[]): number {
    const N = signal.length;
    if (N < 20) return 0.5;

    // Calcul sur 3 tailles de fenêtres pour régression
    const windowSizes = [Math.floor(N/2), Math.floor(N/4), Math.floor(N/8)].filter(w => w > 4);
    const logRs: number[] = [];
    const logSizes: number[] = [];

    for (const wSize of windowSizes) {
        const chunksCount = Math.floor(N / wSize);
        let totalRS = 0;

        for (let i = 0; i < chunksCount; i++) {
            const chunk = signal.slice(i * wSize, (i + 1) * wSize);
            const m = mean(chunk);
            const y = chunk.map(v => v - m);
            
            let sum = 0;
            const z = y.map(v => { sum += v; return sum; });
            
            const R = Math.max(...z) - Math.min(...z);
            const S = stdDev(chunk) || 1;
            totalRS += R / S;
        }
        
        const avgRS = totalRS / chunksCount;
        if (avgRS > 0) {
            logRs.push(Math.log(avgRS));
            logSizes.push(Math.log(wSize));
        }
    }

    if (logRs.length < 2) return 0.5;
    
    // Régression linéaire simple (Pente = Hurst)
    const mX = mean(logSizes);
    const mY = mean(logRs);
    let num = 0, den = 0;
    for(let i=0; i<logRs.length; i++) {
        num += (logSizes[i] - mX) * (logRs[i] - mY);
        den += Math.pow(logSizes[i] - mX, 2);
    }
    
    return den !== 0 ? Math.max(0, Math.min(1, num / den)) : 0.5;
}

// --- WORKER HANDLER ---

ctx.onmessage = async (e: MessageEvent) => {
    const { requestId, task, history, payload } = e.data;

    try {
        let result: any;
        switch (task) {
            case 'full_analysis':
                if (!history || history.length === 0) throw new Error("History required for full_analysis");
                result = {
                    spectral: runSpectral(history),
                    wavelet: runWavelet(history),
                    fractal: runFractal(history)
                };
                break;
            case 'wavelet_analysis':
                if (!history || history.length === 0) throw new Error("History required for wavelet_analysis");
                result = runWavelet(history);
                break;
            case 'hurst_exponent': 
                if (!history || history.length === 0) throw new Error("History required for hurst_exponent");
                result = runFractal(history);
                break;
            case 'DENOISE_PCA':
                result = denoiseFeaturesPCA(payload.matrix, payload.variance);
                break;
            case 'TRAIN_RIDGE':
                result = trainRidgeRegression(payload.features, payload.labels, payload.lambda);
                break;
            case 'GAP_EFFICIENCY':
                if (!history || history.length === 0) throw new Error("History required for GAP_EFFICIENCY");
                result = runGapEfficiency(history);
                break;
            case 'SPECTRAL_METRICS':
                if (!history || history.length === 0) throw new Error("History required for SPECTRAL_METRICS");
                result = runSpectral(history);
                break;
            default:
                result = { status: 'OK' };
        }
        ctx.postMessage({ requestId, result });
    } catch (err: any) {
        ctx.postMessage({ requestId, error: err.message });
    }
};

// --- PCA & RIDGE IMPLEMENTATIONS (NO TF.JS) ---

// Basic Matrix Operations
const matMul = (A: number[][], B: number[][]): number[][] => {
    const m = A.length;
    const n = A[0].length;
    const p = B[0].length;
    const C = Array(m).fill(0).map(() => Array(p).fill(0));
    for (let i = 0; i < m; i++) {
        for (let j = 0; j < p; j++) {
            let sum = 0;
            for (let k = 0; k < n; k++) {
                sum += A[i][k] * B[k][j];
            }
            C[i][j] = sum;
        }
    }
    return C;
};

const transpose = (A: number[][]): number[][] => {
    const m = A.length;
    const n = A[0].length;
    const C = Array(n).fill(0).map(() => Array(m).fill(0));
    for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) {
            C[j][i] = A[i][j];
        }
    }
    return C;
};

const matSub = (A: number[][], B: number[][]): number[][] => {
    return A.map((row, i) => row.map((val, j) => val - B[i][j]));
};

const matAdd = (A: number[][], B: number[][]): number[][] => {
    return A.map((row, i) => row.map((val, j) => val + B[i][j]));
};

const scalarMul = (A: number[][], scalar: number): number[][] => {
    return A.map(row => row.map(val => val * scalar));
};

const vecNorm = (v: number[][]): number => {
    let sum = 0;
    for (let i = 0; i < v.length; i++) sum += v[i][0] * v[i][0];
    return Math.sqrt(sum);
};

function computeEigenDecomposition(matrix: number[][]): { values: number[], vectors: number[][] } {
    const n = matrix.length;
    let A = matrix.map(row => [...row]);
    const eigenValues: number[] = [];
    const eigenVectors: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
        let v = Array(n).fill(0).map(() => [Math.random() - 0.5]);
        let norm = vecNorm(v);
        if (norm === 0) {
            v[0][0] = 1;
            norm = 1;
        }
        v = scalarMul(v, 1/norm);
        
        let lastV = v.map(row => [...row]);
        for (let iter = 0; iter < 40; iter++) {
            const Av = matMul(A, v);
            norm = vecNorm(Av);
            if (norm < 1e-9) break;
            v = scalarMul(Av, 1/norm);
            
            let diff = 0;
            for(let k=0; k<n; k++) diff += Math.pow(v[k][0] - lastV[k][0], 2);
            if (Math.sqrt(diff) < 1e-6) break;
            lastV = v.map(row => [...row]);
        }
        
        const Av = matMul(A, v);
        const eigenvalue = matMul(transpose(v), Av)[0][0];
        
        eigenValues.push(eigenvalue);
        for(let k=0; k<n; k++) eigenVectors[k][i] = v[k][0];
        
        const vvT = matMul(v, transpose(v));
        const deflation = scalarMul(vvT, eigenvalue);
        A = matSub(A, deflation);
    }
    
    return { values: eigenValues, vectors: eigenVectors };
}

function denoiseFeaturesPCA(data: number[][], varianceThreshold: number = 0.95): number[][] {
    if (!data || data.length === 0) return [];
    const nSamples = data.length;
    const nFeatures = data[0].length;
    
    const mean = Array(nFeatures).fill(0);
    for(let i=0; i<nSamples; i++) {
        for(let j=0; j<nFeatures; j++) mean[j] += data[i][j];
    }
    for(let j=0; j<nFeatures; j++) mean[j] /= nSamples;
    
    const centered = data.map(row => row.map((val, j) => val - mean[j]));
    const covariance = scalarMul(matMul(transpose(centered), centered), 1 / (nSamples - 1));
    
    const { values, vectors } = computeEigenDecomposition(covariance);
    
    const totalVariance = values.reduce((a, b) => a + Math.abs(b), 0);
    
    let k = 1;
    let currentVar = 0;
    for (let i = 0; i < nFeatures; i++) {
        currentVar += Math.abs(values[i]);
        if (totalVariance > 0 && currentVar / totalVariance >= varianceThreshold) {
            k = i + 1;
            break;
        }
    }
    
    const topKVectors = vectors.map(row => row.slice(0, k));
    const projected = matMul(centered, topKVectors);
    const reconstructed = matAdd(matMul(projected, transpose(topKVectors)), Array(nSamples).fill(mean));
    
    return reconstructed;
}

function trainRidgeRegression(features: number[][], labels: number[], lambda: number = 0.1): number[] {
    if (!features || features.length === 0 || features.length !== labels.length) return [];
    const nFeatures = features[0].length;
    const nSamples = features.length;
    
    let weights = Array(nFeatures).fill(0);
    const learningRate = 0.01;
    
    for (let iter = 0; iter < 100; iter++) {
        const gradients = Array(nFeatures).fill(0);
        
        for (let i = 0; i < nSamples; i++) {
            let pred = 0;
            for (let j = 0; j < nFeatures; j++) pred += features[i][j] * weights[j];
            const error = pred - labels[i];
            
            for (let j = 0; j < nFeatures; j++) {
                gradients[j] += (2 / nSamples) * error * features[i][j];
            }
        }
        
        for (let j = 0; j < nFeatures; j++) {
            gradients[j] += 2 * lambda * weights[j];
            weights[j] -= learningRate * gradients[j];
        }
    }
    
    return weights;
}

function runGapEfficiency(history: any[]) {
    if (!history || history.length === 0) return [];
    
    const efficiencies = [];
    const depth = Math.min(history.length, 300);
    const subHistory = history.slice(0, depth);

    // Pré-calculer les gagnants pour éviter les accès objets répétés
    const draws = subHistory.map(h => new Set(h.gagnants));

    for (let num = 1; num <= 90; num++) {
        const gaps: number[] = [];
        let currentCounter = 0;
        let isFirst = true;
        let currentGap = 0;

        for (const drawSet of draws) {
            if (drawSet.has(num)) {
                if (isFirst) {
                    currentGap = currentCounter;
                    isFirst = false;
                } else {
                    gaps.push(currentCounter);
                }
                currentCounter = 0;
            } else {
                currentCounter++;
            }
        }
        if (isFirst) currentGap = currentCounter;

        // Stats des gaps
        let maxGap = currentGap;
        let avgGap = 0;
        let sigma = 1;

        if (gaps.length > 0) {
            maxGap = Math.max(Math.max(...gaps), currentGap);
            let sum = 0;
            for(let g of gaps) sum += g;
            avgGap = sum / gaps.length;
            
            let sumSq = 0;
            for(let g of gaps) sumSq += (g - avgGap) ** 2;
            sigma = Math.sqrt(sumSq / gaps.length) || 1;
        }

        const zScore = (currentGap - avgGap) / sigma;
        const breakoutProb = (1 / (1 + Math.exp(-(zScore - 0.5) * 1.5))) * 100;
        const fatigueIndex = avgGap > 0 ? (maxGap / avgGap) : 1;

        const positionScore = maxGap > 0 ? (currentGap / maxGap) * 100 : 0;
        const pressureScore = Math.min(100, Math.max(0, (zScore + 1) * 33));
        const maturityScore = Math.round((positionScore * 0.4) + (pressureScore * 0.6));

        let zone = 'COLD';
        if (zScore > 2.5 || maturityScore > 90) zone = 'CRITICAL';
        else if (zScore > 1.0 || maturityScore > 70) zone = 'HOT';
        else if (zScore > 0 || maturityScore > 40) zone = 'WARMING';

        efficiencies.push({
            number: num,
            currentGap,
            maxGap,
            avgGap,
            probabilityAtCurrentGap: Math.round(breakoutProb),
            maturityScore,
            zone,
            zScore,
            fatigueIndex,
            breakoutProb
        });
    }

    return efficiencies.sort((a: any, b: any) => b.zScore - a.zScore);
}

function runSpectral(history: any[]) {
    const N = Math.min(history.length, 128);
    const data = history.slice(0, N);
    const results = [];
    let globalMax = 0;

    for (let num = 1; num <= 90; num++) {
        const signal = data.map(d => (d.gagnants.includes(num) ? 1 : -1));
        const spectrum = computeDFT(signal);
        
        let maxP = 0;
        spectrum.forEach(s => { if (s.power > maxP) maxP = s.power; });
        if (maxP > globalMax) globalMax = maxP;
        
        results.push({ number: num, raw: maxP });
    }

    return results.map(r => ({
        number: r.number,
        energy: Math.round((r.raw / (globalMax || 1)) * 100),
        resonance: (r.raw / (globalMax || 1)) > 0.8
    })).sort((a,b) => b.energy - a.energy);
}

function runWavelet(history: any[]) {
    const data = history.slice(0, 64);
    const results = [];
    for (let num = 1; num <= 90; num++) {
        const signal = data.map(d => (d.gagnants.includes(num) ? 1 : 0));
        const energy = computeHaarWaveletEnergy(signal);
        results.push({ number: num, energy: Math.min(100, Math.round(energy * 15)) });
    }
    return results;
}

function runFractal(history: any[]) {
    const data = history.slice(0, 250);
    const results = [];
    for (let num = 1; num <= 90; num++) {
        const signal = data.map(d => (d.gagnants.includes(num) ? 1 : 0));
        const h = computeRobustHurst(signal);
        results.push({
            number: num,
            hurst: parseFloat(h.toFixed(3)),
            regime: h > 0.6 ? 'PERSISTANT' : h < 0.4 ? 'ANTI-PERSISTANT' : 'RANDOM'
        });
    }
    return results;
}