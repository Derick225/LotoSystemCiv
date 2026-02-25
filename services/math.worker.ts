import * as tf from '@tensorflow/tfjs';

/**
 * Nexus Production Math Worker v12.0 (Deep Science Edition)
 * Implémentations mathématiques réelles (DFT, Haar, Hurst R/S).
 */

const ctx = self as unknown as Worker;

// Initialize TF.js
tf.setBackend('cpu');

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

// --- PCA & RIDGE IMPLEMENTATIONS (TF.JS) ---

function denoiseFeaturesPCA(data: number[][], varianceThreshold: number = 0.95): number[][] {
    return tf.tidy(() => {
        const x = tf.tensor2d(data);
        const mean = x.mean(0);
        const centered = x.sub(mean);
        const cov = centered.transpose().matMul(centered).div(x.shape[0] - 1) as tf.Tensor2D;
        
        const { values, vectors } = computeEigenDecomposition(cov);
        
        const totalVariance = values.reduce((a, b) => a + b, 0);
        let currentVariance = 0;
        let k = 0;
        for (let i = 0; i < values.length; i++) {
            currentVariance += values[i];
            k++;
            if (currentVariance / totalVariance >= varianceThreshold) break;
        }
        
        const topVectors = vectors.slice([0, 0], [-1, k]);
        const projected = centered.matMul(topVectors);
        const reconstructed = projected.matMul(topVectors.transpose()).add(mean);
        
        return reconstructed.arraySync() as number[][];
    });
}

function trainRidgeRegression(features: number[][], labels: number[], lambda: number = 0.1): number[] {
    return tf.tidy(() => {
        const X = tf.tensor2d(features);
        const y = tf.tensor1d(labels).reshape([-1, 1]);
        
        const Xt = X.transpose();
        const XtX = Xt.matMul(X);
        const I = tf.eye(X.shape[1]);
        const regularizer = I.mul(lambda);
        
        const A = XtX.add(regularizer) as tf.Tensor2D;
        const B = Xt.matMul(y) as tf.Tensor2D;
        
        // Solve Ax = B using Gaussian Elimination (since tf.linalg.solve is missing)
        const aData = A.arraySync() as number[][];
        const bData = B.arraySync() as number[][];
        const n = aData.length;
        
        // Augment A with B
        for (let i = 0; i < n; i++) aData[i].push(bData[i][0]);
        
        // Gaussian Elimination
        for (let i = 0; i < n; i++) {
            let max = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(aData[k][i]) > Math.abs(aData[max][i])) max = k;
            }
            [aData[i], aData[max]] = [aData[max], aData[i]];
            
            for (let k = i + 1; k < n; k++) {
                const f = aData[k][i] / aData[i][i];
                for (let j = i; j <= n; j++) {
                    aData[k][j] -= aData[i][j] * f;
                }
            }
        }
        
        // Back substitution
        const x = new Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            let s = 0;
            for (let j = i + 1; j < n; j++) s += aData[i][j] * x[j];
            x[i] = (aData[i][n] - s) / aData[i][i];
        }
        
        return x;
    });
}

function computeEigenDecomposition(matrix: tf.Tensor2D): { values: number[], vectors: tf.Tensor2D } {
    const n = matrix.shape[0];
    let A = matrix.clone();
    const eigenValues: number[] = [];
    const eigenVectorsList: tf.Tensor[] = [];
    
    for (let i = 0; i < n; i++) {
        let v = tf.randomNormal([n, 1]);
        v = v.div(v.norm());
        let lastV = v.clone();
        for (let iter = 0; iter < 40; iter++) {
            const Av = A.matMul(v);
            const norm = Av.norm();
            if (norm.dataSync()[0] < 1e-9) break;
            v = Av.div(norm);
            const diff = v.sub(lastV).norm().dataSync()[0];
            if (diff < 1e-6) break;
            lastV.dispose();
            lastV = v.clone();
        }
        lastV.dispose();
        const Av = A.matMul(v);
        const eigenvalue = v.transpose().matMul(Av).dataSync()[0];
        eigenValues.push(eigenvalue);
        eigenVectorsList.push(v);
        const vvT = v.matMul(v.transpose());
        const deflation = vvT.mul(eigenvalue);
        const nextA = A.sub(deflation) as tf.Tensor2D;
        A.dispose();
        A = nextA;
    }
    const vectors = tf.concat(eigenVectorsList, 1) as tf.Tensor2D;
    return { values: eigenValues, vectors };
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