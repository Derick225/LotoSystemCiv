import { DrawResult, ChiSquareMetric } from "../types";
/**
 * Core Mathematical Algorithms for Nexus
 * Shared between Web Workers and Main Thread (Backend fallback)
 */

export const mean = (data: number[]) => data.reduce((a, b) => a + b, 0) / (data.length || 1);

export const stdDev = (data: number[]) => {
    const mu = mean(data);
    const variance = data.reduce((a, b) => a + Math.pow(b - mu, 2), 0) / (data.length || 1);
    return Math.sqrt(variance);
};

export function computeDFT(signal: number[]): { frequency: number, power: number, period: number }[] {
    const originalN = signal.length;
    if (originalN < 4) {
        // Fallback simple si le signal est trop court
        const spectrum = [];
        for (let k = 1; k < originalN / 2; k++) {
            let re = 0;
            let im = 0;
            for (let n = 0; n < originalN; n++) {
                const angle = (2 * Math.PI * k * n) / originalN;
                re += signal[n] * Math.cos(angle);
                im -= signal[n] * Math.sin(angle);
            }
            spectrum.push({ frequency: k, power: Math.sqrt(re * re + im * im), period: originalN / k });
        }
        return spectrum;
    }

    // Trouver la puissance de 2 supérieure ou égale à originalN (padding)
    let N = 1;
    while (N < originalN) {
        N *= 2;
    }

    // Windowing (seulement sur les originalN échantillons réels, puis rembourré de zéros)
    const rex = new Float64Array(N);
    const imx = new Float64Array(N);
    for (let n = 0; n < originalN; n++) {
        const window = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (originalN - 1)));
        rex[n] = signal[n] * window;
    }

    // Bit-reversal permutation
    let j = 0;
    for (let i = 0; i < N - 1; i++) {
        if (i < j) {
            const temp = rex[i];
            rex[i] = rex[j];
            rex[j] = temp;
        }
        let k = N / 2;
        while (k <= j) {
            j -= k;
            k /= 2;
        }
        j += k;
    }

    // Boucles FFT (Cooley-Tukey Radix-2)
    for (let stage = 1; stage <= Math.log2(N); stage++) {
        const le = 1 << stage;
        const le2 = le >> 1;
        let ur = 1.0;
        let ui = 0.0;
        const sr = Math.cos(Math.PI / le2);
        const si = -Math.sin(Math.PI / le2);
        for (let s = 0; s < le2; s++) {
            for (let i = s; i < N; i += le) {
                const ip = i + le2;
                const tempRe = rex[ip] * ur - imx[ip] * ui;
                const tempIm = rex[ip] * ui + imx[ip] * ur;
                rex[ip] = rex[i] - tempRe;
                imx[ip] = imx[i] - tempIm;
                rex[i] += tempRe;
                imx[i] += tempIm;
            }
            const tempUr = ur * sr - ui * si;
            ui = ur * si + ui * sr;
            ur = tempUr;
        }
    }

    // Extraction du spectre de puissance
    const spectrum = [];
    for (let k = 1; k < originalN / 2; k++) {
        const ratio = k / originalN;
        const indexInFFT = Math.round(ratio * N);
        const safeIndex = Math.min(N - 1, Math.max(0, indexInFFT));
        const magnitude = Math.sqrt(rex[safeIndex] * rex[safeIndex] + imx[safeIndex] * imx[safeIndex]);
        spectrum.push({ frequency: k, power: magnitude, period: originalN / k });
    }
    return spectrum;
}

export function computeDaubechiesWaveletEnergy(signal: number[]): number {
    const N = signal.length;
    if (N < 4) return computeHaarWaveletEnergy(signal);

    const s3 = Math.sqrt(3);
    const s2 = Math.sqrt(2);
    // Coefficients D4
    const h0 = (1 + s3) / (4 * s2);
    const h1 = (3 + s3) / (4 * s2);
    const h2 = (3 - s3) / (4 * s2);
    const h3 = (1 - s3) / (4 * s2);

    const g0 = Math.abs(h3);
    const g1 = -Math.abs(h2);
    const g2 = Math.abs(h1);
    const g3 = -Math.abs(h0);

    let energy = 0;
    // Un seul niveau de décomposition pour les transitoires locaux
    const half = Math.floor(N / 2);
    for (let i = 0; i < half; i++) {
        // Enveloppement circulaire pour les bords
        const p0 = signal[(2 * i) % N];
        const p1 = signal[(2 * i + 1) % N];
        const p2 = signal[(2 * i + 2) % N];
        const p3 = signal[(2 * i + 3) % N];

        // Filtre de détail (High-pass)
        const detail = p0 * g0 + p1 * g1 + p2 * g2 + p3 * g3;
        energy += Math.pow(detail, 2);
    }
    return energy;
}

export function computeHaarWaveletEnergy(signal: number[]): number {
    const vals = [...signal];
    if (vals.length % 2 !== 0) vals.pop();
    let energy = 0;
    for (let i = 0; i < vals.length; i += 2) {
        const detail = (vals[i] - vals[i+1]) / Math.sqrt(2);
        energy += Math.pow(detail, 2);
    }
    return energy;
}

export function computeRobustHurst(signal: number[]): number {
    const N = signal.length;
    if (N < 10) return 0.5;

    // Calcul de la volatilité locale continue de la série temporelle
    const meanVal = mean(signal);
    let totalVar = 0;
    const diffs: number[] = [];
    for (let i = 0; i < N; i++) {
        const diff = signal[i] - meanVal;
        totalVar += diff * diff;
        if (i > 0) diffs.push(Math.abs(signal[i] - signal[i - 1]));
    }
    const globalStd = Math.sqrt(totalVar / N) || 1e-6;
    const localVol = diffs.length > 0 ? mean(diffs) / (globalStd + 1e-6) : 1.0;

    // Estimation adaptative continue des fenêtres basées sur la volatilité locale
    const minWin = Math.max(4, Math.floor(4 * Math.exp(-0.15 * localVol)));
    const maxWin = Math.min(Math.floor(N / 2), Math.max(minWin + 2, Math.floor(N * 0.75 * Math.tanh(1.0 + 0.2 * localVol))));

    const numScales = 5;
    const windowSizes: number[] = [];
    if (maxWin > minWin) {
        for (let s = 0; s < numScales; s++) {
            const frac = s / (numScales - 1);
            const wSize = Math.floor(minWin * Math.pow(maxWin / minWin, frac));
            if (wSize >= 4 && !windowSizes.includes(wSize)) {
                windowSizes.push(wSize);
            }
        }
    }
    if (windowSizes.length < 2) {
        windowSizes.length = 0;
        const w1 = Math.max(4, Math.floor(N / 2));
        const w2 = Math.max(4, Math.floor(N / 4));
        if (w1 >= 4) windowSizes.push(w1);
        if (w2 >= 4 && w2 !== w1) windowSizes.push(w2);
    }

    const logRs: number[] = [];
    const logSizes: number[] = [];
    for (const wSize of windowSizes) {
        const chunksCount = Math.floor(N / wSize);
        if (chunksCount < 1) continue;
        let totalRS = 0;
        for (let i = 0; i < chunksCount; i++) {
            const chunk = signal.slice(i * wSize, (i + 1) * wSize);
            const m = mean(chunk);
            const y = chunk.map(v => v - m);
            let sum = 0;
            const z = y.map(v => { sum += v; return sum; });
            const R = Math.max(...z) - Math.min(...z);
            const S = stdDev(chunk) || 1e-6;
            totalRS += R / S;
        }
        const avgRS = totalRS / chunksCount;
        if (avgRS > 0) {
            logRs.push(Math.log(avgRS));
            logSizes.push(Math.log(wSize));
        }
    }
    if (logRs.length < 2) return 0.5;
    const mX = mean(logSizes);
    const mY = mean(logRs);
    let num = 0, den = 0;
    for (let i = 0; i < logRs.length; i++) {
        num += (logSizes[i] - mX) * (logRs[i] - mY);
        den += Math.pow(logSizes[i] - mX, 2);
    }
    return den !== 0 ? Math.max(0.01, Math.min(0.99, num / den)) : 0.5;
}

// Matrix Operations
export const matMul = (A: number[][], B: number[][]): number[][] => {
    const m = A.length;
    const n = A[0].length;
    const p = B[0].length;
    const C = Array(m).fill(0).map(() => Array(p).fill(0));
    for (let i = 0; i < m; i++) {
        for (let j = 0; j < p; j++) {
            let sum = 0;
            for (let k = 0; k < n; k++) sum += A[i][k] * B[k][j];
            C[i][j] = sum;
        }
    }
    return C;
};

export const transpose = (A: number[][]): number[][] => {
    const m = A.length;
    const n = A[0].length;
    const C = Array(n).fill(0).map(() => Array(m).fill(0));
    for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) C[j][i] = A[i][j];
    }
    return C;
};

export const matSub = (A: number[][], B: number[][]): number[][] => A.map((row, i) => row.map((val, j) => val - B[i][j]));
export const matAdd = (A: number[][], B: number[][]): number[][] => A.map((row, i) => row.map((val, j) => val + B[i][j]));
export const scalarMul = (A: number[][], scalar: number): number[][] => A.map(row => row.map(val => val * scalar));
export const vecNorm = (v: number[][]): number => {
    let sum = 0;
    for (let i = 0; i < v.length; i++) sum += v[i][0] * v[i][0];
    return Math.sqrt(sum);
};

export function computeEigenDecomposition(matrix: number[][]): { values: number[], vectors: number[][] } {
    const n = matrix.length;
    let A = matrix.map(row => [...row]);
    const eigenValues: number[] = [];
    const eigenVectors: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
        // CORRECTION ZÉRO HASARD : Remplacement de tout seed arbitraire par une harmonique déterministe 
        // basée sur le Nombre d'Or (PHI) et Pi, garantissant une orthogonalité initiale maximale sans collision.
        const PHI = 1.618033988749895;
        let v = Array(n).fill(0).map((_, idx) => [Math.cos((i * n + idx) * Math.PI * PHI)]);
        let norm = vecNorm(v);
        if (norm === 0) { v[0][0] = 1; norm = 1; }
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

export interface SVDResult {
    u: number[][];      // Vecteurs singuliers gauches [N][r]
    s: number[];        // Valeurs singulières [r]
    v: number[][];      // Vecteurs singuliers droits [M][r]
}

/**
 * Décomposition en Valeurs Singulières (SVD) par itération de puissance avec déflation.
 * 100% Déterministe et stable via seeds trigonométriques continues.
 */
export function computeSVD(matrix: number[][], r?: number): SVDResult {
    const N = matrix.length;
    if (N === 0) return { u: [], s: [], v: [] };
    const M = matrix[0].length;
    
    // CORRECTION : Le rang 'r' ne doit pas être un nombre magique (3). 
    // Il est dérivé de la règle de Kaiser ou de la racine carrée des dimensions, plafonné à une limite raisonnable.
    const dynamicRank = r ?? Math.min(Math.floor(Math.sqrt(Math.min(N, M))) + 1, 5);
    const numComponents = Math.min(dynamicRank, N, M);

    let A = matrix.map(row => [...row]);

    const U: number[][] = Array(N).fill(0).map(() => Array(numComponents).fill(0));
    const S: number[] = Array(numComponents).fill(0);
    const V: number[][] = Array(M).fill(0).map(() => Array(numComponents).fill(0));

    for (let k = 0; k < numComponents; k++) {
        let v = Array(M).fill(0);
        let normV = 0;
        for (let j = 0; j < M; j++) {
            // CORRECTION ZÉRO HASARD : Seed harmonique déterministe (Pi * e)
            v[j] = Math.cos((k * M + j) * Math.PI * Math.E);
            normV += v[j] * v[j];
        }
        normV = Math.sqrt(normV);
        if (normV === 0) {
            v[0] = 1;
            normV = 1;
        }
        for (let j = 0; j < M; j++) v[j] /= normV;

        let u = Array(N).fill(0);
        
        for (let iter = 0; iter < 40; iter++) {
            for (let i = 0; i < N; i++) {
                let sum = 0;
                for (let j = 0; j < M; j++) {
                    sum += A[i][j] * v[j];
                }
                u[i] = sum;
            }

            let normU = 0;
            for (let i = 0; i < N; i++) normU += u[i] * u[i];
            normU = Math.sqrt(normU);
            if (normU < 1e-9) break;

            for (let i = 0; i < N; i++) u[i] /= normU;

            let vNew = Array(M).fill(0);
            for (let j = 0; j < M; j++) {
                let sum = 0;
                for (let i = 0; i < N; i++) {
                    sum += A[i][j] * u[i];
                }
                vNew[j] = sum;
            }

            let normVNew = 0;
            for (let j = 0; j < M; j++) normVNew += vNew[j] * vNew[j];
            normVNew = Math.sqrt(normVNew);
            if (normVNew < 1e-9) break;

            for (let j = 0; j < M; j++) vNew[j] /= normVNew;

            let diff = 0;
            for (let j = 0; j < M; j++) {
                diff += Math.pow(vNew[j] - v[j], 2);
            }
            const isConverged = Math.sqrt(diff) < 1e-6;
            v = vNew;
            if (isConverged) break;
        }

        let Av = Array(N).fill(0);
        for (let i = 0; i < N; i++) {
            let sum = 0;
            for (let j = 0; j < M; j++) sum += A[i][j] * v[j];
            Av[i] = sum;
        }
        let sumAv2 = 0;
        for (let i = 0; i < N; i++) sumAv2 += Av[i] * Av[i];
        const sigma = Math.sqrt(sumAv2);

        S[k] = sigma;

        for (let i = 0; i < N; i++) U[i][k] = u[i];
        for (let j = 0; j < M; j++) V[j][k] = v[j];

        for (let i = 0; i < N; i++) {
            for (let j = 0; j < M; j++) {
                A[i][j] -= sigma * u[i] * v[j];
            }
        }
    }

    return { u: U, s: S, v: V };
}

/**
 * Calcule la résonance spectrale globale par projection SVD suivie de DFT.
 * Retourne le profil de résonance et le facteur périodique dominant ajusté.
 */
export function computeSVDResonance(history: { gagnants: number[] }[], N: number, M: number = 90): { globalResonance: Float64Array; dominantPeriod: number } {
    const data = history.slice(0, N);
    
    // 1. Matrice des occurrences de taille N x M
    const H = Array(N).fill(0).map(() => Array(M).fill(0));
    const columnMeans = Array(M).fill(0);
    
    for (let i = 0; i < N; i++) {
        const d = data[i];
        for (let j = 0; j < M; j++) {
            const ball = j + 1;
            const val = d.gagnants.includes(ball) ? 1.0 : -1.0;
            H[i][j] = val;
            columnMeans[j] += val;
        }
    }
    
    // Centrage des colonnes (ZÉRO NOMBRES MAGIQUES)
    for (let j = 0; j < M; j++) {
        columnMeans[j] /= N;
        for (let i = 0; i < N; i++) {
            H[i][j] -= columnMeans[j];
        }
    }
    
    // 2. SVD sur composantes majeures d'échelle relative
    const svd = computeSVD(H);
    
    const globalResonance = new Float64Array(Math.floor(N / 2) + 1);
    let maxResonanceVal = 0;
    
    let sumPeriodWeighted = 0;
    let sumWeight = 0;
    
    if (svd.s && svd.s.length > 0) {
        for (let kRank = 0; kRank < svd.s.length; kRank++) {
            const singularValue = svd.s[kRank];
            if (singularValue < 1e-5) continue;
            
            const uCol = svd.u.map(row => row[kRank]);
            const spectrum = computeDFT(uCol);
            
            let maxModePower = 0;
            let modeDominantPeriod = 12.0;
            
            spectrum.forEach(s => {
                // Accumulation de la résonance continue
                if (s.frequency < globalResonance.length) {
                    globalResonance[s.frequency] += singularValue * s.power;
                }
                
                if (s.power > maxModePower) {
                    maxModePower = s.power;
                    modeDominantPeriod = s.period;
                }
            });
            
            const modeWeight = singularValue * maxModePower;
            sumPeriodWeighted += modeDominantPeriod * modeWeight;
            sumWeight += modeWeight;
        }
    }
    
    // Normalisation continue du spectre de résonance globale
    for (let k = 0; k < globalResonance.length; k++) {
        if (globalResonance[k] > maxResonanceVal) {
            maxResonanceVal = globalResonance[k];
        }
    }
    if (maxResonanceVal > 0) {
        for (let k = 0; k < globalResonance.length; k++) {
            globalResonance[k] /= maxResonanceVal;
        }
    }
    
    const dominantPeriod = sumWeight > 0 ? sumPeriodWeighted / sumWeight : 12.0;
    
    return { globalResonance, dominantPeriod };
}


export function denoiseFeaturesPCA(data: number[][], varianceThreshold?: number): number[][] {
    if (!data || data.length === 0) return [];
    const nSamples = data.length;
    const nFeatures = data[0].length;
    
    // 1. Standard Scaling (Z-score normalization)
    const means = new Float64Array(nFeatures);
    const stdDevs = new Float64Array(nFeatures);
    
    for(let i=0; i<nSamples; i++) {
        for(let j=0; j<nFeatures; j++) means[j] += data[i][j];
    }
    for(let j=0; j<nFeatures; j++) means[j] /= nSamples;
    
    for(let i=0; i<nSamples; i++) {
        for(let j=0; j<nFeatures; j++) stdDevs[j] += Math.pow(data[i][j] - means[j], 2);
    }
    for(let j=0; j<nFeatures; j++) {
        stdDevs[j] = Math.sqrt(stdDevs[j] / (nSamples - 1)) || 1; // Avoid division by zero
    }
    
    const scaledData = data.map(row => row.map((val, j) => (val - means[j]) / stdDevs[j]));

    // 2. PCA on scaled data
    const covariance = scalarMul(matMul(transpose(scaledData), scaledData), 1 / (nSamples - 1));
    const { values, vectors } = computeEigenDecomposition(covariance);
    const totalVariance = values.reduce((a, b) => a + Math.abs(b), 0);
    
    // CORRECTION : Si aucun seuil n'est fourni, on le dérive continûment de la dimensionalité (1 - 1/sqrt(features))
    // Au lieu d'un magique 0.95 fixe.
    const dynamicThreshold = varianceThreshold ?? (1.0 - (1.0 / Math.sqrt(nFeatures)));
    
    let k = 1;
    let currentVar = 0;
    for (let i = 0; i < nFeatures; i++) {
        currentVar += Math.abs(values[i]);
        if (totalVariance > 0 && currentVar / totalVariance >= dynamicThreshold) { k = i + 1; break; }
    }
    const topKVectors = vectors.map(row => row.slice(0, k));
    const projected = matMul(scaledData, topKVectors);
    
    // 3. Reconstruct and inverse transform
    const reconstructedScaled = matMul(projected, transpose(topKVectors));
    // @ts-ignore - auto generated by cleanup
    const reconstructed = reconstructedScaled.map((row, i) => 
        row.map((val, j) => (val * stdDevs[j]) + means[j])
    );
    
    return reconstructed;
}

export function trainRidgeRegression(features: number[][], labels: number[], lambda?: number, initialLearningRate?: number): number[] {
    if (!features || features.length === 0 || features.length !== labels.length) return [];
    const nFeatures = features[0].length;
    const nSamples = features.length;
    let weights = new Float64Array(nFeatures);
    
    // CORRECTION : Lambda dérivé de la régularisation de Tikhonov optimale (1/sqrt(N))
    // Taux d'apprentissage initial basé sur l'inverse de la racine des features.
    const optimalLambda = lambda ?? (1.0 / Math.sqrt(nSamples));
    const optimalLR = initialLearningRate ?? (1.0 / Math.sqrt(nFeatures));
    
    // Accumulateur d'énergie de gradient pour raccord stochastique autodécidant (AdaGrad)
    const gSum = new Float64Array(nFeatures);
    const epsilon = 1e-8; // Constante analytique pour empêcher la division par zéro

    for (let iter = 0; iter < 200; iter++) {
        const gradients = new Float64Array(nFeatures);
        let maxGradient = 0;
        
        for (let i = 0; i < nSamples; i++) {
            let pred = 0;
            for (let j = 0; j < nFeatures; j++) pred += features[i][j] * weights[j];
            const error = pred - labels[i];
            for (let j = 0; j < nFeatures; j++) gradients[j] += (2 / nSamples) * error * features[i][j];
        }
        
        for (let j = 0; j < nFeatures; j++) {
            gradients[j] += 2 * optimalLambda * weights[j];
            
            // Accumulation d'énergie stochastique
            gSum[j] += gradients[j] * gradients[j];
            
            // Taux d'apprentissage auto-adaptatif basé sur l'historique du vecteur gradient
            const adaptiveRate = optimalLR / (Math.sqrt(gSum[j]) + epsilon);
            weights[j] -= adaptiveRate * gradients[j];
            
            if (Math.abs(gradients[j]) > maxGradient) maxGradient = Math.abs(gradients[j]);
        }
        
        // Convergence asymptotique atteinte
        if (maxGradient < 1e-4) break; 
    }
    return Array.from(weights);
}

export function runGapEfficiency(history: { gagnants: number[] }[]) {
    if (!history || history.length === 0) return [];
    const efficiencies = [];
    // CORRECTION : La profondeur d'analyse ne doit pas être bloquée à 300. 
    // Elle doit s'adapter à la persistance du signal (Hurst). Plus H est élevé, plus on peut regarder loin.
    const hurst = computeRobustHurst(history.map(h => h.gagnants.length)); // Approximation rapide
    const dynamicDepth = Math.min(history.length, Math.ceil(100 / (1.0 - Math.max(0.1, hurst - 0.4))));
    const subHistory = history.slice(0, dynamicDepth);
    const draws = subHistory.map(h => new Set(h.gagnants));
    
    for (let num = 1; num <= 90; num++) {
        const gaps: number[] = [];
        let currentCounter = 0;
        let isFirst = true;
        let currentGap = 0;
        
        for (const drawSet of draws) {
            if (drawSet.has(num)) {
                if (isFirst) { currentGap = currentCounter; isFirst = false; }
                else { gaps.push(currentCounter); }
                currentCounter = 0;
            } else { currentCounter++; }
        }
        if (isFirst) currentGap = currentCounter;
        
        let maxGap = currentGap;
        let avgGap = 0;
        let sigma = 1;
        
        // --- Kaplan-Meier Survival Analysis ---
        let kaplanMeierProb = 0; 
        let hazardRate = 0;
        let kmVariance = 10000;
        
        if (gaps.length > 0) {
            maxGap = Math.max(Math.max(...gaps), currentGap);
            let sum = 0;
            for(let g of gaps) sum += g;
            avgGap = sum / gaps.length;
            
            let sumSq = 0;
            for(let g of gaps) sumSq += (g - avgGap) ** 2;
            sigma = Math.sqrt(sumSq / gaps.length) || 1;
            
            // Kaplan-Meier Calculation
            const gapFreq = new Map<number, number>();
            gaps.forEach(g => gapFreq.set(g, (gapFreq.get(g) || 0) + 1));
            
            const uniqueGaps = Array.from(gapFreq.keys()).sort((a, b) => a - b);
            
            let nRisk = gaps.length; 
            let S_t = 1.0; 
            let S_current = 1.0;
            let greenwoodSum = 0;
            
            for (const t of uniqueGaps) {
                if (t > currentGap) break; 
                
                const d_t = gapFreq.get(t) || 0; 
                if (nRisk > 0) {
                    const hazard_t = d_t / nRisk;
                    S_t = S_t * (1 - hazard_t);
                    if (t === currentGap) {
                        hazardRate = hazard_t;
                    }
                    if (nRisk > d_t) {
                        greenwoodSum += d_t / (nRisk * (nRisk - d_t));
                    }
                }
                nRisk -= d_t; 
            }
            S_current = S_t;
            
            // kaplanMeierProb: Probability that a gap normally breaks BEFORE reaching currentGap
            kaplanMeierProb = (1 - S_current) * 100;
            
            // Variance de Greenwood pour S_current
            kmVariance = Math.pow(S_current, 2) * greenwoodSum * 10000;
            if (kmVariance <= 1e-4) {
                kmVariance = 1.0; // Plancher
            }
        }

        const zScore = (currentGap - avgGap) / sigma;
        const zScoreProb = (1.0 / (1.0 + Math.exp(-0.5 * zScore))) * 100;
        let zScoreVariance = 10000 / Math.max(1, gaps.length);

        // --- FUSION PAR INVERSE DE LA VARIANCE ---
        const w_km_raw = 1.0 / kmVariance;
        const w_z_raw = 1.0 / zScoreVariance;
        const totalW = w_km_raw + w_z_raw;
        const weightKM = w_km_raw / totalW;
        const weightZ = w_z_raw / totalW;

        const breakoutProb = weightZ * zScoreProb + weightKM * kaplanMeierProb;
        
        const fatigueIndex = avgGap > 0 ? (maxGap / avgGap) : 1;
        const positionScore = maxGap > 0 ? (currentGap / maxGap) * 100 : 0;
        const pressureScore = Math.min(100, Math.max(0, (zScore + 1) * 33));
        
        const w_pos = 1/3, w_pres = 1/3, w_km_score = 1/3;
        const maturityScore = Math.round((positionScore * w_pos) + (pressureScore * w_pres) + (kaplanMeierProb * w_km_score));
        
        let zone = 'COLD';
        if (zScore > 2.5 || maturityScore > 90 || kaplanMeierProb > 95) zone = 'CRITICAL';
        else if (zScore > 1.0 || maturityScore > 70 || kaplanMeierProb > 80) zone = 'HOT';
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
            breakoutProb,
            kaplanMeierProb: Number(kaplanMeierProb.toFixed(1)),
            hazardRate: Number((hazardRate * 100).toFixed(1))
        });
    }
    return efficiencies.sort((a: { kaplanMeierProb: number }, b: { kaplanMeierProb: number }) => b.kaplanMeierProb - a.kaplanMeierProb);
}

export function runSpectral(history: { gagnants: number[] }[]) {
    const N = Math.min(history.length, 128);
    if (N < 10) {
        return Array.from({ length: 90 }, (_, i) => ({
            number: i + 1,
            energy: 50,
            resonance: false,
            dominantPeriod: 12.0
        }));
    }
    
    const data = history.slice(0, N);
    
    // Détection continue de la résonance globale SVD & Fourier
    const { globalResonance, dominantPeriod } = computeSVDResonance(history, N, 90);
    
    const results = [];
    let globalMax = 0;
    for (let num = 1; num <= 90; num++) {
        const signal = data.map(d => (d.gagnants.includes(num) ? 1 : -1));
        const spectrum = computeDFT(signal);
        
        let maxP = 0;
        spectrum.forEach(s => {
            const resFactor = s.frequency < globalResonance.length ? globalResonance[s.frequency] : 0;
            const adjustedPower = s.power * (1.0 + resFactor);
            if (adjustedPower > maxP) maxP = adjustedPower;
        });

        // --- SIGNIFICANCE PERMUTATION TEST ---
        // On effectue 5 permutations déterministes du signal pour estimer le seuil de significativité du bruit
        let nullMaxSum = 0;
        let lcgSeed = (num * 12345 + N) >>> 0;
        const lcg = () => {
            lcgSeed = (lcgSeed * 1664525 + 1013904223) >>> 0;
            return lcgSeed / 4294967296;
        };

        const permutationsCount = 5;
        for (let pIdx = 0; pIdx < permutationsCount; pIdx++) {
            const permutedSignal = [...signal];
            // Fisher-Yates déterministe
            for (let i = permutedSignal.length - 1; i > 0; i--) {
                const j = Math.floor(lcg() * (i + 1));
                const temp = permutedSignal[i];
                permutedSignal[i] = permutedSignal[j];
                permutedSignal[j] = temp;
            }
            const nullSpectrum = computeDFT(permutedSignal);
            let nullMax = 0;
            nullSpectrum.forEach(ns => {
                if (ns.power > nullMax) nullMax = ns.power;
            });
            nullMaxSum += nullMax;
        }
        const nullThreshold = nullMaxSum / permutationsCount;

        // Si la puissance observée est inférieure ou proche du seuil nul, on la pénalise continûment
        const signalToNoiseRatio = maxP / Math.max(1e-6, nullThreshold);
        const significanceMultiplier = 1.0 / (1.0 + Math.exp(-4.0 * (signalToNoiseRatio - 1.1))); // Transition fluide continue

        const finalMaxP = maxP * significanceMultiplier;
        
        if (finalMaxP > globalMax) globalMax = finalMaxP;
        results.push({ number: num, raw: finalMaxP });
    }
    
    return results.map(r => ({
        number: r.number,
        energy: Math.round((r.raw / (globalMax || 1)) * 100),
        resonance: (r.raw / (globalMax || 1)) > 0.8,
        dominantPeriod: Number(dominantPeriod.toFixed(2))
    })).sort((a,b) => b.energy - a.energy);
}

export function runFractal(history: { gagnants: number[] }[]) {
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

/**
 * Entropie de Transfert (Transfer Entropy)
 * Mesure la causalité directionnelle : à quel point l'apparition du Numéro X (Source)
 * réduit l'incertitude sur l'apparition du Numéro Y (Target) au tirage suivant.
 * Retourne les paires ayant la plus forte Entropie de Transfert.
 */
export function computeTransferEntropy(history: { gagnants: number[] }[], targetNumbers?: number[]) {
    const N = Math.min(history.length, 500); // 500 tirages max pour pertinence
    // CORRECTION : Le seuil de bruit ne doit pas être 0.005. 
    // Il doit être dérivé de la résolution théorique de l'entropie pour N échantillons : 1 / log2(N)
    const noiseFloor = 1.0 / Math.log2(N || 2);
    const data = history.slice(0, N);
    
    // Convertir l'historique en une matrice sparse pour accès rapide
    const occurrences = Array(91).fill(0).map(() => new Uint8Array(N));
    for (let i = 0; i < N; i++) {
        const gagnants = data[i].gagnants;
        for (let j = 0; j < gagnants.length; j++) {
            if (gagnants[j] >= 1 && gagnants[j] <= 90) {
                occurrences[gagnants[j]][i] = 1;
            }
        }
    }

    const results = [];
    const targets = targetNumbers && targetNumbers.length > 0 ? targetNumbers : Array.from({length: 90}, (_, i) => i + 1);

    for (const Y of targets) {
        const ySeries = occurrences[Y];
        
        for (let X = 1; X <= 90; X++) {
            if (X === Y) continue;
            
            const xSeries = occurrences[X];
            
            // Pour le transfert d'entropie, on compte les états (y_next, y_curr, x_curr)
            // Etats possibles: 0 à 7 (en binaire : y_next, y_curr, x_curr)
            const counts = new Float64Array(8);
            let totalPairs = 0;
            
            // Note: history est ordonné du plus récent (i=0) au plus ancien.
            // Donc le tirage "suivant" dans le temps est en fait (i-1)
            for (let i = 1; i < N; i++) {
                const x_curr = xSeries[i];
                const y_curr = ySeries[i];
                const y_next = ySeries[i - 1]; // Tirage suivant
                
                const state = (y_next << 2) | (y_curr << 1) | x_curr;
                counts[state]++;
                totalPairs++;
            }
            
            if (totalPairs === 0) continue;
            
            let te = 0;
            
            // p(y_next, y_curr, x_curr) -> counts[state] / totalPairs
            // p(y_curr, x_curr) -> sum_ynext(counts)
            // p(y_next, y_curr) -> sum_xcurr(counts)
            // p(y_curr) -> sum_ynext_xcurr(counts)
            
            const p_y_x = new Float64Array(4); // Combinations de (y_curr, x_curr)
            const p_yNext_y = new Float64Array(4); // Combinations de (y_next, y_curr)
            const p_y = new Float64Array(2); // Combinations de (y_curr)
            
            for (let s = 0; s < 8; s++) {
                const y_next = (s >> 2) & 1;
                const y_curr = (s >> 1) & 1;
                const x_curr = s & 1;
                
                const prob = counts[s] / totalPairs;
                
                p_y_x[(y_curr << 1) | x_curr] += prob;
                p_yNext_y[(y_next << 1) | y_curr] += prob;
                p_y[y_curr] += prob;
            }
            
            for (let s = 0; s < 8; s++) {
                const prob = counts[s] / totalPairs;
                if (prob > 0) {
                    const y_next = (s >> 2) & 1;
                    const y_curr = (s >> 1) & 1;
                    const x_curr = s & 1;
                    
                    const prob_yx = p_y_x[(y_curr << 1) | x_curr];
                    const prob_yy = p_yNext_y[(y_next << 1) | y_curr];
                    const prob_y = p_y[y_curr];
                    
                    if (prob_yx > 0 && prob_y > 0) {
                        const num = prob / prob_yx;
                        const den = prob_yy / prob_y;
                        if (den > 0) {
                            te += prob * Math.log2(num / den);
                        }
                    }
                }
            }
            
            if (te > noiseFloor) {
                results.push({
                    source: X,
                    target: Y,
                    entropyTransfer: Number(te.toFixed(4)),
                    // CORRECTION : Confiance dérivée continûment du ratio signal/bruit
                    confidence: Math.min(100, Math.round((te / noiseFloor) * 20))
                });
            }
        }
    }
    
    return results.sort((a, b) => b.entropyTransfer - a.entropyTransfer);
}
export const calculateShannonEntropy = (history: DrawResult[]): { normalized: number } => {
    if (history.length === 0) return { normalized: 0 };
    
    const freq = new Float32Array(91);
    let total = 0;
    
    for(const d of history) {
        for(const n of d.gagnants) {
            if (n >= 1 && n <= 90) {
                freq[n]++;
                total++;
            }
        }
    }
    
    if (total === 0) return { normalized: 0 };
    
    let entropy = 0;
    for (let i = 1; i <= 90; i++) {
        if (freq[i] > 0) {
            const p = freq[i] / total;
            entropy -= p * Math.log2(p);
        }
    }
    
    const maxEntropy = Math.log2(90); 
    return { normalized: entropy / maxEntropy };
};

/**
 * Calcul d'Entropie de Tsallis non-extensive basée sur l'estimation de densité continue (Gaussienne filtrée / T-Distribution de Student).
 * Capture les régimes de transition chaotique sans bruits ni seuils binaires de discrétisation.
 */
export const calculateTsallisEntropy = (
    history: DrawResult[],
    q: number = 1.5,
    degreesOfFreedom: number = 5.0
): { normalized: number; tsallisValue: number } => {
    if (history.length === 0) return { normalized: 0, tsallisValue: 0 };

    const DOMAIN_SIZE = 90;
    const freqs = new Float32Array(DOMAIN_SIZE + 1);
    let totalBalls = 0;

    for (const d of history) {
        for (const n of d.gagnants) {
            if (n >= 1 && n <= DOMAIN_SIZE) {
                freqs[n]++;
                totalBalls++;
            }
        }
    }

    if (totalBalls === 0) return { normalized: 0, tsallisValue: 0 };

    // Estimation de densité par Noyau T-Distribution de Student continu (Smooth KDE)
    const empiricalProb = new Float32Array(DOMAIN_SIZE + 1);
    for (let i = 1; i <= DOMAIN_SIZE; i++) {
        empiricalProb[i] = freqs[i] / totalBalls;
    }

    const freqArray = Array.from(freqs.slice(1));
    const sigma = stdDev(freqArray) || 1.0;
    const bandwidth = Math.max(0.1, 1.06 * sigma * Math.pow(DOMAIN_SIZE, -0.2));

    const smoothDensity = new Float64Array(DOMAIN_SIZE + 1);
    let sumDensity = 0;
    const nu = degreesOfFreedom;

    for (let x = 1; x <= DOMAIN_SIZE; x++) {
        let densityAtX = 0;
        for (let y = 1; y <= DOMAIN_SIZE; y++) {
            if (empiricalProb[y] > 0) {
                const z = (x - y) / bandwidth;
                // Student-t PDF kernel: (1 + z^2 / nu)^(-0.5 * (nu + 1))
                const studentWeight = Math.pow(1.0 + (z * z) / nu, -0.5 * (nu + 1.0));
                densityAtX += empiricalProb[y] * studentWeight;
            }
        }
        smoothDensity[x] = densityAtX;
        sumDensity += densityAtX;
    }

    for (let x = 1; x <= DOMAIN_SIZE; x++) {
        smoothDensity[x] /= (sumDensity || 1.0);
    }

    let sumPq = 0;
    for (let x = 1; x <= DOMAIN_SIZE; x++) {
        if (smoothDensity[x] > 0) {
            sumPq += Math.pow(smoothDensity[x], q);
        }
    }

    let tsallisValue = 0;
    if (Math.abs(q - 1.0) < 1e-4) {
        let shannon = 0;
        for (let x = 1; x <= DOMAIN_SIZE; x++) {
            if (smoothDensity[x] > 0) {
                shannon -= smoothDensity[x] * Math.log2(smoothDensity[x]);
            }
        }
        tsallisValue = shannon;
    } else {
        tsallisValue = (1.0 - sumPq) / (q - 1.0);
    }

    const pUniform = 1.0 / DOMAIN_SIZE;
    const maxTsallis = Math.abs(q - 1.0) < 1e-4
        ? Math.log2(DOMAIN_SIZE)
        : (1.0 - DOMAIN_SIZE * Math.pow(pUniform, q)) / (q - 1.0);

    const normalized = Math.max(0, Math.min(1.0, tsallisValue / (maxTsallis || 1.0)));

    return { normalized, tsallisValue };
};

/**
 * Distance de Wasserstein-1 (Earth Mover's Distance) 1D continue entre deux distributions de probabilité.
 * Fournit une régularisation métrique lisse et différentiable, éliminant tout seuil d'activation binaire.
 */
export function computeWassersteinDistance(
    P: Float32Array | number[],
    Q: Float32Array | number[]
): number {
    const N = Math.min(P.length, Q.length);
    if (N === 0) return 0;

    let sumP = 0, sumQ = 0;
    for (let i = 0; i < N; i++) {
        sumP += Math.max(0, P[i]);
        sumQ += Math.max(0, Q[i]);
    }
    sumP = sumP || Number.EPSILON;
    sumQ = sumQ || Number.EPSILON;

    let cdfP = 0;
    let cdfQ = 0;
    let wassersteinDist = 0;

    for (let i = 0; i < N; i++) {
        cdfP += Math.max(0, P[i]) / sumP;
        cdfQ += Math.max(0, Q[i]) / sumQ;
        wassersteinDist += Math.abs(cdfP - cdfQ);
    }

    return wassersteinDist / N;
}

export const calculateChiSquare = (observed: Record<number, number>, totalObservations: number): ChiSquareMetric => {
    const expected = totalObservations / 90; 
    let chiSq = 0;
    
    for(let i=1; i<=90; i++) {
        const obs = observed[i] || 0;
        chiSq += Math.pow(obs - expected, 2) / expected;
    }
    
    return { score: chiSq };
};

/**
 * Test de Kolmogorov-Smirnov pour vérifier si la distribution
 * empirique des tirages suit une distribution uniforme théorique [1, 90].
 */
export const calculateKolmogorovSmirnov = (numbers: number[]): { dStatistic: number; isUniform: boolean } => {
    if (numbers.length === 0) return { dStatistic: 0, isUniform: true };
    const N = numbers.length;
    // On compte l'occurrence de chaque nombre pour calculer la Fonction de Répartition Empirique (CDF)
    const counts = new Float64Array(91);
    numbers.forEach(num => { if (num >= 1 && num <= 90) counts[num]++; });
    
    let currentSum = 0;
    let maxD = 0;
    for (let i = 1; i <= 90; i++) {
        currentSum += counts[i];
        const empiricalCDF = currentSum / N;
        const theoreticalCDF = i / 90; // CDF d'une uniforme discrète [1, 90]
        const d = Math.abs(empiricalCDF - theoreticalCDF);
        if (d > maxD) maxD = d;
    }
    
    // Valeur critique de D pour alpha = 0.05, grande approximation N
    const criticalValue = 1.36 / Math.sqrt(N);
    return {
        dStatistic: maxD,
        isUniform: maxD < criticalValue
    };
};

/**
 * Ljung-Box Test (Autocorrélation Sérielle).
 * Détecte si des motifs de répétition chronologiques surviennent au-delà du hasard.
 */
export const calculateLjungBoxTest = (signal: number[], lags: number = 10): { qStatistic: number; hasAutocorrelation: boolean } => {
    const N = signal.length;
    if (N < lags * 2) return { qStatistic: 0, hasAutocorrelation: false };

    const getMean = (data: number[]) => data.reduce((a, b) => a + b, 0) / data.length;
    const mean = getMean(signal);
    
    let variance = 0;
    for (let i = 0; i < N; i++) {
        variance += Math.pow(signal[i] - mean, 2);
    }
    
    if (variance === 0) return { qStatistic: 0, hasAutocorrelation: false };
    
    let qStatistic = 0;
    for (let k = 1; k <= lags; k++) {
        let autocovariance = 0;
        for (let t = k; t < N; t++) {
            autocovariance += (signal[t] - mean) * (signal[t - k] - mean);
        }
        const rhoC = autocovariance / variance;
        qStatistic += (Math.pow(rhoC, 2) / (N - k));
    }
    qStatistic *= N * (N + 2);
    
    // CORRECTION : 1.83 est une heuristique approximative. 
    // Pour un test du Chi-carré à 'lags' degrés de liberté, le seuil à 95% est approximé par : lags + 1.96 * sqrt(2 * lags)
    const threshold = lags + 1.96 * Math.sqrt(2 * lags);
    
    return {
        qStatistic,
        hasAutocorrelation: qStatistic > threshold
    };
};

export const calculateBenfordCompliance = (numbers: number[]): { score: number, distribution: number[] } => {
    if (numbers.length === 0) return { score: 0, distribution: Array(9).fill(0) };
    const counts = new Uint32Array(10);
    
    for(const n of numbers) {
        const str = n.toString();
        const leading = parseInt(str[0], 10);
        if(leading >= 1 && leading <= 9) counts[leading]++;
    }
    
    const total = numbers.length;
    let deviation = 0;
    const distribution: number[] = [];
    
    for(let d=1; d<=9; d++) {
        const observed = counts[d] / total;
        distribution.push(observed * 100); // Percentage
        
        // For Loto 5/90: Uniform distribution where 1-90 are equally likely
        // Digit 1-8: 11 occurrences (e.g. 1, 10-19) -> 11/90
        // Digit 9: 2 occurrences (9, 90) -> 2/90
        const expected = d === 9 ? (2 / 90) : (11 / 90);
        deviation += Math.abs(observed - expected);
    }
    
    // Adjusted scaling factor for deviation 
    const score = Math.max(0, Math.round(100 - (deviation * 50))); 
    return { score, distribution };
};

export const calculateACValue = (numbers: number[]): number => {
    if (numbers.length < 2) return 0;
    const diffs = new Set<number>();
    
    for(let i=0; i<numbers.length; i++) {
        for(let j=i+1; j<numbers.length; j++) {
            diffs.add(Math.abs(numbers[i] - numbers[j]));
        }
    }
    return diffs.size - (numbers.length - 1);
};

export function invertMatrix(M: number[][]): number[][] {
    const n = M.length;
    const A = M.map(row => [...row]);
    const I = Array(n).fill(0).map((_, i) => Array(n).fill(0).map((_, j) => i === j ? 1 : 0));
    
    for (let i = 0; i < n; i++) {
        let pivotRow = i;
        for (let r = i + 1; r < n; r++) {
            if (Math.abs(A[r][i]) > Math.abs(A[pivotRow][i])) {
                pivotRow = r;
            }
        }
        
        if (pivotRow !== i) {
            const tempA = A[i]; A[i] = A[pivotRow]; A[pivotRow] = tempA;
            const tempI = I[i]; I[i] = I[pivotRow]; I[pivotRow] = tempI;
        }
        
        const pivot = A[i][i];
        if (Math.abs(pivot) < 1e-12) {
            return M;
        }
        
        for (let j = 0; j < n; j++) {
            A[i][j] /= pivot;
            I[i][j] /= pivot;
        }
        
        for (let r = 0; r < n; r++) {
            if (r !== i) {
                const factor = A[r][i];
                for (let j = 0; j < n; j++) {
                    A[r][j] -= factor * A[i][j];
                    I[r][j] -= factor * I[i][j];
                }
            }
        }
    }
    return I;
}

export function computeContinuousWaveletTransform(signal: number[], scales: number[] = [1.5, 3.0, 6.0, 12.0]): number[] {
    const N = signal.length;
    const coeffs = Array(scales.length).fill(0);
    if (N === 0) return coeffs;

    const omega0 = 6.0;
    const factor = Math.pow(Math.PI, -0.25);

    for (let sIdx = 0; sIdx < scales.length; sIdx++) {
        const scale = scales[sIdx];
        let energySum = 0;
        
        for (let b = 0; b < N; b++) {
            let realSum = 0;
            for (let t = 0; t < N; t++) {
                const tau = (t - b) / scale;
                const waveletVal = factor * Math.exp(-0.5 * tau * tau) * Math.cos(omega0 * tau);
                realSum += signal[t] * waveletVal;
            }
            const coeff = realSum / Math.sqrt(scale);
            energySum += coeff * coeff;
        }
        coeffs[sIdx] = energySum / N;
    }
    return coeffs;
}

export function runContinuousWaveletTransformAnalysis(history: { gagnants: number[] }[]) {
    const N = Math.min(history.length, 128);
    if (N < 10) {
        return Array.from({ length: 90 }, (_, i) => ({
            number: i + 1,
            energy: 50,
            resonance: false,
            dominantPeriod: 12.0
        }));
    }
    
    const data = history.slice(0, N);
    const scales = [1.5, 3.0, 6.0, 12.0];
    const results = [];
    let globalMax = 0;

    for (let num = 1; num <= 90; num++) {
        const signal = data.map(d => (d.gagnants.includes(num) ? 1 : -1));
        const scaleEnergies = computeContinuousWaveletTransform(signal, scales);
        const totalEnergy = scaleEnergies.reduce((sum, e) => sum + e, 0);
        
        if (totalEnergy > globalMax) globalMax = totalEnergy;
        results.push({ number: num, raw: totalEnergy });
    }
    
    return results.map(r => ({
        number: r.number,
        energy: Math.round((r.raw / (globalMax || 1)) * 100),
        resonance: (r.raw / (globalMax || 1)) > 0.8,
        dominantPeriod: 6.0
    })).sort((a,b) => b.energy - a.energy);
}

export function denoiseFeaturesKernelPCA(data: number[][], gamma?: number, varianceThreshold?: number): number[][] {
    if (!data || data.length === 0) return [];
    const nSamples = data.length;
    const nFeatures = data[0].length;
    
    // 1. Scale data (Standardization)
    const means = new Float64Array(nFeatures);
    const stdDevs = new Float64Array(nFeatures);
    
    for(let i=0; i<nSamples; i++) {
        for(let j=0; j<nFeatures; j++) means[j] += data[i][j];
    }
    for(let j=0; j<nFeatures; j++) means[j] /= nSamples;
    
    for(let i=0; i<nSamples; i++) {
        for(let j=0; j<nFeatures; j++) stdDevs[j] += Math.pow(data[i][j] - means[j], 2);
    }
    for(let j=0; j<nFeatures; j++) {
        stdDevs[j] = Math.sqrt(stdDevs[j] / Math.max(1, nSamples - 1)) || 1;
    }
    
    const scaledData = data.map(row => row.map((val, j) => (val - means[j]) / stdDevs[j]));

    // 2. Build RBF Kernel Matrix K of size N x N
    // Calculate mean of pairwise squared distances to eliminate magic gamma
    let sumDistSq = 0;
    let pairsCount = 0;
    for (let i = 0; i < nSamples; i++) {
        for (let j = i + 1; j < nSamples; j++) {
            let distSq = 0;
            for (let f = 0; f < nFeatures; f++) {
                distSq += Math.pow(scaledData[i][f] - scaledData[j][f], 2);
            }
            sumDistSq += distSq;
            pairsCount++;
        }
    }
    const meanDistSq = pairsCount > 0 ? (sumDistSq / pairsCount) : 1.0;
    const g = gamma ?? (1.0 / (meanDistSq || Number.EPSILON));
    const K = Array(nSamples).fill(0).map(() => Array(nSamples).fill(0));
    for (let i = 0; i < nSamples; i++) {
        for (let j = i; j < nSamples; j++) {
            let distSq = 0;
            for (let f = 0; f < nFeatures; f++) {
                distSq += Math.pow(scaledData[i][f] - scaledData[j][f], 2);
            }
            const val = Math.exp(-g * distSq);
            K[i][j] = val;
            K[j][i] = val;
        }
    }

    // 3. Center the Kernel Matrix
    const K_centered = Array(nSamples).fill(0).map(() => Array(nSamples).fill(0));
    const rowMeans = Array(nSamples).fill(0);
    let totalMean = 0;
    for (let i = 0; i < nSamples; i++) {
        let rowSum = 0;
        for (let j = 0; j < nSamples; j++) {
            rowSum += K[i][j];
        }
        rowMeans[i] = rowSum / nSamples;
        totalMean += rowSum;
    }
    totalMean /= (nSamples * nSamples);

    for (let i = 0; i < nSamples; i++) {
        for (let j = 0; j < nSamples; j++) {
            K_centered[i][j] = K[i][j] - rowMeans[i] - rowMeans[j] + totalMean;
        }
    }

    // 4. Eigen decomposition on centered Kernel Matrix
    const { values, vectors } = computeEigenDecomposition(K_centered);
    const totalVariance = values.reduce((sum, v) => sum + Math.abs(v), 0);
    const dynamicThreshold = varianceThreshold ?? (1.0 - (1.0 / Math.sqrt(nFeatures)));

    let k = 1;
    let currentVar = 0;
    for (let i = 0; i < nSamples; i++) {
        currentVar += Math.abs(values[i]);
        if (totalVariance > 0 && (currentVar / totalVariance) >= dynamicThreshold) {
            k = i + 1;
            break;
        }
    }
    k = Math.max(1, Math.min(k, nSamples, nFeatures));

    // 5. Projected representation in non-linear manifold (N x k)
    const Y = Array(nSamples).fill(0).map(() => Array(k).fill(0));
    for (let i = 0; i < nSamples; i++) {
        for (let col = 0; col < k; col++) {
            let sum = 0;
            for (let j = 0; j < nSamples; j++) {
                sum += K_centered[i][j] * vectors[j][col];
            }
            Y[i][col] = sum;
        }
    }

    // 6. Pre-image Reconstruction via Ridge Regression
    // Compute YTY (k x k)
    const YTY = Array(k).fill(0).map(() => Array(k).fill(0));
    for (let i = 0; i < k; i++) {
        for (let j = 0; j < k; j++) {
            let sum = 0;
            for (let s = 0; s < nSamples; s++) {
                sum += Y[s][i] * Y[s][j];
            }
            YTY[i][j] = sum;
        }
    }
    const ridgeLambda = 1e-4;
    for (let i = 0; i < k; i++) {
        YTY[i][i] += ridgeLambda;
    }

    const YTY_inv = invertMatrix(YTY);

    // Compute Y_T * scaledData (k x nFeatures)
    const YT_X = Array(k).fill(0).map(() => Array(nFeatures).fill(0));
    for (let i = 0; i < k; i++) {
        for (let f = 0; f < nFeatures; f++) {
            let sum = 0;
            for (let s = 0; s < nSamples; s++) {
                sum += Y[s][i] * scaledData[s][f];
            }
            YT_X[i][f] = sum;
        }
    }

    // Regressor Weights W = YTY_inv * YT_X of size k x nFeatures
    const W = Array(k).fill(0).map(() => Array(nFeatures).fill(0));
    for (let i = 0; i < k; i++) {
        for (let f = 0; f < nFeatures; f++) {
            let sum = 0;
            for (let j = 0; j < k; j++) {
                sum += YTY_inv[i][j] * YT_X[j][f];
            }
            W[i][f] = sum;
        }
    }

    // Reconstructed Scaled Data = Y * W of size N x D
    const reconstructedScaled = Array(nSamples).fill(0).map(() => Array(nFeatures).fill(0));
    for (let i = 0; i < nSamples; i++) {
        for (let f = 0; f < nFeatures; f++) {
            let sum = 0;
            for (let j = 0; j < k; j++) {
                sum += Y[i][j] * W[j][f];
            }
            reconstructedScaled[i][f] = sum;
        }
    }

    // Inverse Scale Transform with continuous, bounded pre-image manifold constraint (monotonic differentiable smoothing)
    const smoothClip = (x: number): number => {
        if (x >= 5 && x <= 95) return x;
        if (x < 5) {
            return 5 * Math.exp((x - 5) / 5);
        }
        return 100 - 5 * Math.exp((95 - x) / 5);
    };

    const reconstructed = reconstructedScaled.map((row) =>
        row.map((val, j) => {
            const rawVal = (val * stdDevs[j]) + means[j];
            return smoothClip(rawVal);
        })
    );

    return reconstructed;
}
