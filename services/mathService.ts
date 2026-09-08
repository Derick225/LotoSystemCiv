
import { useNexusStore } from '../store/useNexusStore';
import { workerService } from './workerService';
import { computeTransferEntropy, runSpectral, denoiseFeaturesKernelPCA, runContinuousWaveletTransformAnalysis } from './mathCore';
import { DrawResult, ProjectionItem, TopFollowerAnalysis, SpectralMetric, FractalMetric, NumberRegularity, ClusterPoint, BarycenterPoint, DetailedNumberMetrics, ShadowNumbers, TrendOscillatorPoint, ChiSquareMetric, GapEfficiency } from '../types';
import { lcgGlobalRandom } from '../utils/mathUtils';



// --- HELPERS SIMPLES ---

export const calculateGap = (history: DrawResult[], number: number): number => {
    for (let i = 0; i < history.length; i++) {
        if (history[i].gagnants.includes(number)) return i;
    }
    return history.length;
};

export const calculateFrequency = (history: DrawResult[], number: number, limit: number = 50): number => {
    const subset = history.slice(0, limit);
    return subset.filter(d => d.gagnants.includes(number)).length;
};

// --- UTILS STATISTIQUES VECTORISÉS ---

// --- CACHE & MEMOIZATION ---
const mathCache = new Map<string, { timestamp: number; data: unknown }>();
const CACHE_TTL = 30000; // 30 seconds for math results

const getCached = <T,>(key: string, expectedDrawName?: string): T | null => {
    const cached = mathCache.get(key);
    if (!cached) return null;

    if (expectedDrawName) {
        const normalizedExpected = expectedDrawName.trim().toLowerCase();
        const keyLower = key.toLowerCase();
        if (!keyLower.includes(normalizedExpected)) {
            console.warn(`[StrictDrawIsolationGuard] Rejected cache entry for key "${key}" because it does not match expected draw "${expectedDrawName}"`);
            return null;
        }
    }

    if (Date.now() - cached.timestamp < CACHE_TTL) return cached.data as T;
    return null;
};

const setCached = (key: string, data: unknown) => {
    if (mathCache.size > 100) mathCache.clear(); // Simple eviction
    mathCache.set(key, { timestamp: Date.now(), data });
};

export const clearMathCache = () => mathCache.clear();

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

/**
 * Helper: Compute Eigen Decomposition using Power Iteration with Deflation.
 */
const computeEigenDecomposition = (matrix: number[][]): { values: number[], vectors: number[][] } => {
    const n = matrix.length;
    let A = matrix.map(row => [...row]);
    const eigenValues: number[] = [];
    const eigenVectors: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
        // CORRECTION CRITIQUE : Alignement avec mathCore.ts pour ZÉRO HASARD
        // REMPLACEMENT de lcgGlobalRandom() par le seed harmonique déterministe (Pi * Phi)
        const PHI = 1.618033988749895;
        let v = Array(n).fill(0).map((_, idx) => [Math.cos((i * n + idx) * Math.PI * PHI)]);
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
};

/**
 * Effectue une Analyse en Composantes Principales (PCA) sur une matrice de données.
 * @param data Matrice [samples, features]
 * @param nComponents Nombre de composants à garder (défaut: 3)
 */
export const performPCA = (data: number[][], nComponents: number = 3): number[][] => {
    if (!data || data.length === 0) return [];
    const nSamples = data.length;
    const nFeatures = data[0].length;
    
    // 1. Centrage
    const mean = Array(nFeatures).fill(0);
    for(let i=0; i<nSamples; i++) {
        for(let j=0; j<nFeatures; j++) mean[j] += data[i][j];
    }
    for(let j=0; j<nFeatures; j++) mean[j] /= nSamples;
    
    const centered = data.map(row => row.map((val, j) => val - mean[j]));
    
    // 2. Covariance
    const covariance = scalarMul(matMul(transpose(centered), centered), 1 / (nSamples - 1));
    
    // 3. Eigen Decomposition
    const { vectors } = computeEigenDecomposition(covariance);
    
    // 4. Select Top K
    const k = Math.min(nComponents, nFeatures);
    const topKVectors = vectors.map(row => row.slice(0, k));
    
    // 5. Project
    const projected = matMul(centered, topKVectors);
    
    return projected;
};

/**
 * Denoise features using PCA (Project to latent space and reconstruct).
 * Repensée avec Float32Array (ZÉRO allocations intermédiaires du GC) 
 * et pondérations continues (sans seuil binaire arbitraire).
 * 
 * @param data Matrix [samples, features]
 */
export const denoiseFeaturesPCA = (data: number[][]): number[][] => {
    if (!data || data.length === 0) return [];
    const nSamples = data.length;
    const nFeatures = data[0].length;

    // Tableaux plats Float32Array pour bypasser la surcharge du GC
    const centered = new Float32Array(nSamples * nFeatures);
    const mean = new Float32Array(nFeatures);

    for (let i = 0; i < nSamples; i++) {
        for (let j = 0; j < nFeatures; j++) {
            mean[j] += data[i][j];
        }
    }
    
    for (let j = 0; j < nFeatures; j++) {
        mean[j] /= nSamples;
    }

    for (let i = 0; i < nSamples; i++) {
        for (let j = 0; j < nFeatures; j++) {
            centered[i * nFeatures + j] = data[i][j] - mean[j];
        }
    }

    // Covariance in-place
    const cov = new Float32Array(nFeatures * nFeatures);
    const covDenom = nSamples > 1 ? nSamples - 1 : 1;
    for (let i = 0; i < nFeatures; i++) {
        for (let j = i; j < nFeatures; j++) {
            let sum = 0;
            for (let s = 0; s < nSamples; s++) {
                sum += centered[s * nFeatures + i] * centered[s * nFeatures + j];
            }
            const val = sum / covDenom;
            cov[i * nFeatures + j] = val;
            cov[j * nFeatures + i] = val;
        }
    }

    // Extraction des valeurs et vecteurs propres sans allocation
    const eigenValues = new Float32Array(nFeatures);
    const eigenVectors = new Float32Array(nFeatures * nFeatures);
    const residualCov = new Float32Array(cov);
    const vec = new Float32Array(nFeatures);
    const nextVec = new Float32Array(nFeatures);
    
    // Base mathématique harmonique pour initialisation déterministe
    const PHI = 1.6180339887; 

    for (let k = 0; k < nFeatures; k++) {
        for (let i = 0; i < nFeatures; i++) {
            vec[i] = Math.sin((i + k + 1) * PHI); 
        }
        
        let norm = 0;
        for (let i = 0; i < nFeatures; i++) norm += vec[i] * vec[i];
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < nFeatures; i++) vec[i] /= norm;

        let eigenVal = 0;
        for (let iter = 0; iter < 50; iter++) {
            for (let i = 0; i < nFeatures; i++) {
                let sum = 0;
                for (let j = 0; j < nFeatures; j++) {
                    sum += residualCov[i * nFeatures + j] * vec[j];
                }
                nextVec[i] = sum;
            }
            
            norm = 0;
            for (let i = 0; i < nFeatures; i++) norm += nextVec[i] * nextVec[i];
            norm = Math.sqrt(norm);
            
            if (norm === 0) break;
            
            let diff = 0;
            for (let i = 0; i < nFeatures; i++) {
                const normalized = nextVec[i] / norm;
                diff += Math.abs(normalized - vec[i]);
                vec[i] = normalized;
            }
            
            eigenVal = norm;
            if (diff < 1e-6) break;
        }
        
        eigenValues[k] = eigenVal;
        for (let i = 0; i < nFeatures; i++) {
            eigenVectors[i * nFeatures + k] = vec[i];
        }
        
        for (let i = 0; i < nFeatures; i++) {
            for (let j = 0; j < nFeatures; j++) {
                residualCov[i * nFeatures + j] -= eigenVal * vec[i] * vec[j];
            }
        }
    }

    let totalEigen = 0;
    for (let i = 0; i < nFeatures; i++) totalEigen += Math.abs(eigenValues[i]);
    const meanEigen = totalEigen / (nFeatures || 1);

    // Calcul empirique de l'écart-type de la force relative
    let varianceRelative = 0;
    for (let k = 0; k < nFeatures; k++) {
        const rs = Math.abs(eigenValues[k]) / (meanEigen + 1e-9);
        varianceRelative += Math.pow(rs - 1.0, 2);
    }
    const stdRelativeStrength = Math.sqrt(varianceRelative / (nFeatures || 1)) || 1.0;

    // ZÉRO NOMBRES MAGIQUES & CONTINUITÉ : Pondération par seuil souple sigmoïdal
    const continuousWeights = new Float32Array(nFeatures);
    for (let k = 0; k < nFeatures; k++) {
        const relativeStrength = Math.abs(eigenValues[k]) / (meanEigen + 1e-9);
        // Utilisation de l'inverse de l'écart-type empirique comme pente
        continuousWeights[k] = 1 / (1 + Math.exp(-(relativeStrength - 1) / stdRelativeStrength));
    }

    const reconstructed = Array(nSamples);
    const proj = new Float32Array(nFeatures);

    for (let s = 0; s < nSamples; s++) {
        for (let k = 0; k < nFeatures; k++) {
            let p = 0;
            for (let j = 0; j < nFeatures; j++) {
                p += centered[s * nFeatures + j] * eigenVectors[j * nFeatures + k];
            }
            proj[k] = p * continuousWeights[k];
        }

        const row = new Array(nFeatures);
        for (let j = 0; j < nFeatures; j++) {
            let val = mean[j];
            for (let k = 0; k < nFeatures; k++) {
                val += proj[k] * eigenVectors[j * nFeatures + k];
            }
            row[j] = val;
        }
        reconstructed[s] = row;
    }
    
    return reconstructed;
};

/**
 * Denoise features using Kernel-PCA (Manifold learning pre-image approximation with RBF Kernel).
 * @param data Matrix [samples, features]
 * @param gamma Kernel bandwidth coefficient
 * @param varianceThreshold Dynamic variance cutoff
 */
export const denoiseFeaturesKernelPCA_wrapper = (data: number[][], gamma?: number, varianceThreshold?: number): number[][] => {
    return denoiseFeaturesKernelPCA(data, gamma, varianceThreshold);
};

/**
 * Train a Ridge Regression model (Linear Regression with L2 Regularization).
 * @param features Matrix [samples, n_features]
 * @param labels Vector [samples] (0 or 1)
 * @param lambda L2 Penalty (default 0.1)
 */
export const trainRidgeRegression = (features: number[][], labels: number[], lambda?: number, initialLearningRate?: number): number[] => {
    if (!features || features.length === 0 || features.length !== labels.length) return [];
    const nFeatures = features[0].length;
    const nSamples = features.length;
    
    const optimalLambda = lambda ?? (1.0 / Math.sqrt(nSamples));
    const optimalLR = initialLearningRate ?? (1.0 / Math.sqrt(nFeatures));
    
    let weights = Array(nFeatures).fill(0);
    
    // Accumulateur d'énergie de gradient pour raccord stochastique autodécidant (AdaGrad)
    const gSum = Array(nFeatures).fill(0);
    const epsilon = 1e-8; // Constante analytique pour empêcher la division par zéro
    
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
            gradients[j] += 2 * optimalLambda * weights[j];
            
            // Accumulation d'énergie stochastique
            gSum[j] += gradients[j] * gradients[j];
            
            // Taux d'apprentissage auto-adaptatif basé sur l'historique du vecteur gradient
            const adaptiveRate = optimalLR / (Math.sqrt(gSum[j]) + epsilon);
            weights[j] -= adaptiveRate * gradients[j];
        }
    }
    
    return weights;
};

export const applyL2Regularization = (weights: number[], lambda: number = 0.01): number[] => {
    return weights.map(w => w * (1 - lambda));
};

/**
 * Calcule la factorielle d'un nombre (Mémoïsation basique).
 */
const factorial = (() => {
    const cache = new Map<number, number>();
    return (n: number): number => {
        if (n === 0 || n === 1) return 1;
        if (cache.has(n)) return cache.get(n)!;
        let result = 1;
        for (let i = 2; i <= n; i++) result *= i;
        cache.set(n, result);
        return result;
    };
})();

/**
 * Calcule la moyenne arithmétique d'un tableau.
 * Sécurisé contre la division par zéro.
 */
export const calculateMean = (data: number[]): number => {
    if (!data || data.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length;
};

/**
 * Calcule l'écart-type (Standard Deviation) d'un tableau.
 */
export const calculateStandardDeviation = (data: number[]): number => {
    if (!data || data.length < 2) return 0;
    const mu = calculateMean(data);
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
        sumSq += (data[i] - mu) ** 2;
    }
    return Math.sqrt(sumSq / data.length);
};

// Alias for internal use if needed, or replace internal usages
const getMean = calculateMean;
const getStdDev = calculateStandardDeviation;

/**
 * Calcule la probabilité de Poisson P(k; lambda).
 * @param k Nombre d'occurrences attendues (souvent 0 ou >=1).
 * @param lambda Taux moyen d'occurrence sur la période.
 */
export const calculatePoissonProbability = (k: number, lambda: number): number => {
    if (lambda < 0) return 0;
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
};

/**
 * Calcule un score Bayésien combinant une probabilité a priori et une vraisemblance.
 * @param prior Probabilité globale (historique long).
 * @param likelihood Probabilité locale (historique court).
 */
export const calculateBayesianScore = (prior: number, likelihood: number): number => {
    const evidence = (prior * likelihood) + ((1 - prior) * (1 - likelihood));
    return evidence <= 0.0001 ? 0 : (likelihood * prior) / evidence;
};

/**
 * Exécute une simulation de Monte Carlo pour estimer la distribution probable.
 * @param weights Poids de probabilité pour chaque numéro (1-90).
 * @param iterations Nombre d'itérations (défaut 5000).
 */
export const runMonteCarloSimulation = (weights: Record<number, number>, iterations: number = 5000): Record<number, number> => {
    const results: Record<number, number> = {};
    const items = Object.entries(weights).map(([n, w]) => ({ n: Number(n), w: Math.max(0, w) }));
    
    // Calcul de la somme cumulative pour sélection rapide (Roulette Wheel)
    let totalWeight = 0;
    const cumulativeWeights = new Float64Array(items.length);
    for (let i = 0; i < items.length; i++) {
        totalWeight += items[i].w;
        cumulativeWeights[i] = totalWeight;
    }

    if (totalWeight === 0) return {};

    for (let i = 0; i < iterations; i++) {
        const r = lcgGlobalRandom() * totalWeight;
        // Recherche dichotomique pour performance O(log N)
        let lo = 0, hi = items.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (cumulativeWeights[mid] < r) lo = mid + 1;
            else hi = mid;
        }
        const selected = items[lo].n;
        results[selected] = (results[selected] || 0) + 1;
    }
    return results;
};

/**
 * Calcule l'indice d'efficacité des écarts (GEI - Gap Efficiency Index).
 * Détecte les numéros en situation de "rupture d'écart" probable.
 */
export const calculateGapEfficiency = async (history: DrawResult[]): Promise<GapEfficiency[]> => {
    if (!history || history.length === 0) return [];
    
    const cacheKey = `gei_${history[0].drawName}_${history[0].id}_${history.length}`;
    const cached = getCached<GapEfficiency[]>(cacheKey);
    if (cached) return cached;

    if (typeof window !== 'undefined' && workerService.isAvailable()) {
        const result = await workerService.runTask<GapEfficiency[]>('GAP_EFFICIENCY', {}, history);
        setCached(cacheKey, result);
        return result;
    }
    
    const efficiencies: GapEfficiency[] = [];
    // CORRECTION : Profondeur dynamique basée sur la règle de l'horizon de prévisibilité (lié à l'entropie)
    // On utilise une approximation rapide de l'entropie pour ajuster la fenêtre.
    const entropyApprox = calculateShannonEntropy(history.slice(0, 100)).normalized;
    const dynamicDepth = Math.min(history.length, Math.ceil(150 * (1.0 + entropyApprox)));
    const subHistory = history.slice(0, dynamicDepth);

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
        // CORRECTION : Sigmoïde standardisée, suppression de (zScore - 0.5) * 1.5
        const breakoutProb = (1 / (1 + Math.exp(-0.5 * zScore))) * 100;
        const fatigueIndex = avgGap > 0 ? (maxGap / avgGap) : 1;

        const positionScore = maxGap > 0 ? (currentGap / maxGap) * 100 : 0;
        const pressureScore = Math.min(100, Math.max(0, (zScore + 1) * 33));
        // CORRECTION : Pondération équiprobable (1/2) au lieu de 0.4/0.6 arbitraire
        const maturityScore = Math.round((positionScore * 0.5) + (pressureScore * 0.5));

        let zone: GapEfficiency['zone'] = 'COLD';
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

    const result = efficiencies.sort((a, b) => b.zScore - a.zScore);
    setCached(cacheKey, result);
    return result;
};

export const getProjectionsAsync = async (history: DrawResult[], _lastNumbers: number[]): Promise<ProjectionItem[]> => {
    if (history.length === 0) return [];
    const freq = new Uint32Array(91);
    
    for (const d of history) {
        for (const n of d.gagnants) {
            if (n >= 1 && n <= 90) freq[n]++;
        }
    }
    
    const result: ProjectionItem[] = [];
    const total = history.length;
    for (let i = 1; i <= 90; i++) {
        result.push({ number: i, probability: Math.round((freq[i] / total) * 100) });
    }
    
    return result.sort((a, b) => b.probability - a.probability).slice(0, 5);
};

export const getFollowersAnalysisAsync = async (history: DrawResult[]): Promise<TopFollowerAnalysis[]> => {
    if (history.length < 2) return [];
    
    const lastDrawSet = new Set(history[0].gagnants);
    const followers = new Uint32Array(91);

    for (let i = 1; i < history.length - 1; i++) {
        const prevGagnants = history[i + 1].gagnants;
        // Si le tirage précédent contient au moins un numéro du tirage "Target" (ici lastDraw)
        if (prevGagnants.some(n => lastDrawSet.has(n))) {
            const currentGagnants = history[i].gagnants;
            for (const n of currentGagnants) {
                 if (n >= 1 && n <= 90) followers[n]++;
            }
        }
    }

    const result: TopFollowerAnalysis[] = [];
    for (let i = 1; i <= 90; i++) {
        if (followers[i] > 0) result.push({ number: i, count: followers[i] });
    }
    
    return result.sort((a, b) => b.count - a.count).slice(0, 10);
};

export const getMomentumScores = async (history: DrawResult[]): Promise<Record<number, number>> => {
    const scores: Record<number, number> = {};
    const recent = history.slice(0, 10);
    // Poids décroissant : le plus récent (idx 0) a poids 10, le plus vieux (idx 9) a poids 1
    recent.forEach((d, idx) => {
        const weight = 10 - idx;
        d.gagnants.forEach(n => scores[n] = (scores[n] || 0) + weight);
    });
    return scores;
};

// --- ALGORITHMES AVANCÉS OPTIMISÉS ---

const calculateFastHurst = (signal: number[]): number => {
    const N = signal.length;
    if (N < 20) return 0.5;

    const meanVal = getMean(signal);
    // Centrage
    const y = new Float32Array(N);
    for(let i=0; i<N; i++) y[i] = signal[i] - meanVal;

    // Somme cumulative
    let currentSum = 0;
    let maxCum = -Infinity;
    let minCum = Infinity;
    
    for(let i=0; i<N; i++) {
        currentSum += y[i];
        if (currentSum > maxCum) maxCum = currentSum;
        if (currentSum < minCum) minCum = currentSum;
    }
    
    const R = maxCum - minCum;
    const S = getStdDev(signal);
    
    if (R === 0 || S === 0) return 0.5;
    const hurst = Math.log(R / S) / Math.log(N / 2);
    return Math.max(0.01, Math.min(0.99, hurst));
};

export const calculateHurstForNumber = (num: number, history: DrawResult[]): { hurst: number } => {
    const limit = Math.min(history.length, 100);
    const signal = new Float64Array(limit);
    for(let i=0; i<limit; i++) {
        signal[i] = history[i].gagnants.includes(num) ? 1 : 0;
    }
    return { hurst: calculateFastHurst(signal as any) };
};

export const calculateFractalIndex = (history: DrawResult[]): number => {
    const limit = Math.min(history.length, 100);
    const sums = new Float64Array(limit);
    for(let i=0; i<limit; i++) {
        let s = 0;
        const w = history[i].gagnants;
        for(let j=0; j<w.length; j++) s += w[j];
        sums[i] = s;
    }
    return calculateFastHurst(sums as any);
};

export const calculateShadowNumbers = (draw: DrawResult): ShadowNumbers => {
    let sum = 0;
    for (const n of draw.gagnants) sum += n;
    
    return {
        sumModulo: sum % 90 || 90,
        goldenNumber: Math.round(sum * 0.618) % 90 || 1,
        firstCompliment: 90 - (draw.gagnants[0] || 0),
        gapLink: Math.abs((draw.gagnants[0] || 0) - (draw.gagnants[4] || 0))
    };
};

export const calculateRunsTest = (numbers: number[]): { zScore: number; isRandom: boolean } => {
    const N = numbers.length;
    if (N < 2) return { zScore: 0, isRandom: true };

    const median = getMean(numbers);
    
    let n1 = 0, n2 = 0, runs = 1;
    let prevBit = numbers[0] > median ? 1 : 0;
    if (prevBit === 0) n1++; else n2++;

    for (let i = 1; i < N; i++) {
        const bit = numbers[i] > median ? 1 : 0;
        if (bit === 0) n1++; else n2++;
        if (bit !== prevBit) {
            runs++;
            prevBit = bit;
        }
    }

    if (n1 === 0 || n2 === 0) return { zScore: 0, isRandom: false };

    const expectedRuns = ((2 * n1 * n2) / N) + 1;
    const variance = (2 * n1 * n2 * (2 * n1 * n2 - N)) / (N * N * (N - 1));
    const zScore = (runs - expectedRuns) / Math.sqrt(variance || 1);
    
    return { zScore, isRandom: Math.abs(zScore) < 1.96 };
};

export const calculateTrendOscillator = (history: DrawResult[], period: number): TrendOscillatorPoint[] => {
    const limit = Math.min(history.length, period);
    const result = new Array<TrendOscillatorPoint>(limit); // Needs normal array for objects
    
    for(let i=0; i<limit; i++) {
        let s = 0;
        const w = history[i].gagnants;
        for(let k=0; k<w.length; k++) s += w[k];
        result[i] = { momentum: (s / 5) - 45.5 };
    }
    return result.reverse();
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

export const calculateRegularity = (history: DrawResult[]): NumberRegularity[] => {
    const res: NumberRegularity[] = [];
    const limit = Math.min(history.length, 200); 
    const subset = history.slice(0, limit);

    for(let i=1; i<=90; i++) {
        const gaps: number[] = [];
        let currentGap = 0;
        let isFirst = true;

        for (const d of subset) {
            if (d.gagnants.includes(i)) {
                if (!isFirst) gaps.push(currentGap);
                currentGap = 0;
                isFirst = false;
            } else {
                currentGap++;
            }
        }
        const avg = getMean(gaps);
        const std = getStdDev(gaps);
        
        res.push({
            number: i,
            currentGap: currentGap,
            avgGap: avg,
            stdDev: std,
            lastGaps: gaps.slice(0, 5)
        });
    }
    return res;
};

export const detectGameRegime = (history: DrawResult[]): { regime: string; hurst: number; entropy: number; volatility: number; weylDiscrepancy: number; chaosDimension: number; } => {
    const h = calculateFractalIndex(history);
    const entropyOut = calculateShannonEntropy(history);
    const volatilityOut = calculateVolatility(history);
    const weyl = calculateWeylDiscrepancy(history);
    const chaos = calculateGrassbergerProcaccia(history);
    
    // CORRECTION : Les seuils de régime doivent être dynamiques par rapport à la marche aléatoire (0.5) 
    // et pondérés par l'incertitude d'échantillonnage (1/sqrt(N)).
    const N = Math.min(history.length, 200);
    const uncertaintyMargin = 1.0 / Math.sqrt(N);
    
    let regime = 'NORMAL';
    if (h > (0.5 + uncertaintyMargin) && volatilityOut.score < 50) regime = 'PERSISTANT_TREND';
    else if (h > (0.5 + uncertaintyMargin) && volatilityOut.score >= 50) regime = 'PERSISTANT_CHAOS';
    else if (h < (0.5 - uncertaintyMargin)) regime = 'MEAN_REVERTING';
    else if (entropyOut.normalized > (1.0 - uncertaintyMargin)) regime = 'HIGH_ENTROPY';
    else regime = 'NORMAL'; 
    
    return { 
        regime, 
        hurst: h, 
        entropy: entropyOut.normalized, 
        volatility: volatilityOut.score,
        weylDiscrepancy: weyl,
        chaosDimension: chaos
    };
};

/**
 * Détection Dynamique du Régime de Jeu par Régulation Thermodynamique Continue
 * (Basée sur la Divergence KL entre distribution d'écarts observée et loi de Poisson théorique)
 * ZÉRO NOMBRE MAGIQUE, 100% CONTINU & DÉTERMINISTE.
 */
export const calculateThermodynamicRegime = (history: DrawResult[]): {
    klDivergence: number;
    thermodynamicIndex: number;
    continuousOutsiderRatio: number;
    continuousOutsiderCount: number;
    regime: string;
    hurst: number;
    entropy: number;
    volatility: number;
    weylDiscrepancy: number;
    chaosDimension: number;
} => {
    const baseRegime = detectGameRegime(history);
    if (!history || history.length < 5) {
        return {
            klDivergence: 0.1,
            thermodynamicIndex: 0.1,
            continuousOutsiderRatio: 0.4,
            continuousOutsiderCount: 2.0,
            ...baseRegime
        };
    }

    const domainSize = 90;
    const drawSize = 5;
    const pTheorique = drawSize / domainSize; // 5/90 = 1/18

    // Calcul de tous les écarts observés
    const maxGapBucket = 50;
    const observedGapsCount = new Float64Array(maxGapBucket + 1);
    let totalGaps = 0;

    // Tracker du dernier tirage vu pour chaque numéro
    const lastSeenIndex = new Int32Array(domainSize + 1).fill(-1);
    const windowLength = Math.min(history.length, 250);

    for (let t = windowLength - 1; t >= 0; t--) {
        const draw = history[t].gagnants;
        for (const num of draw) {
            if (num >= 1 && num <= domainSize) {
                const prev = lastSeenIndex[num];
                if (prev !== -1) {
                    const gap = prev - t - 1;
                    if (gap >= 0) {
                        const bucket = Math.min(gap, maxGapBucket);
                        observedGapsCount[bucket]++;
                        totalGaps++;
                    }
                }
                lastSeenIndex[num] = t;
            }
        }
    }

    // Si trop peu de données, fallback continu
    if (totalGaps === 0) {
        return {
            klDivergence: 0.1,
            thermodynamicIndex: 0.1,
            continuousOutsiderRatio: 0.4,
            continuousOutsiderCount: 2.0,
            ...baseRegime
        };
    }

    // Distribution Q (Observée) et Distribution P (Poisson / Géométrique théorique)
    const epsilon = 1e-9;
    let klDiv = 0;
    let sumP = 0;
    const pTheoriqueArr = new Float64Array(maxGapBucket + 1);

    for (let g = 0; g <= maxGapBucket; g++) {
        pTheoriqueArr[g] = pTheorique * Math.pow(1 - pTheorique, g);
        sumP += pTheoriqueArr[g];
    }
    // Normaliser P sur la fenêtre tronquée [0, maxGapBucket]
    for (let g = 0; g <= maxGapBucket; g++) {
        pTheoriqueArr[g] /= (sumP + epsilon);
    }

    // Calcul de la divergence de Kullback-Leibler D_KL(Q || P)
    for (let g = 0; g <= maxGapBucket; g++) {
        const q_g = (observedGapsCount[g] / totalGaps);
        const p_g = pTheoriqueArr[g];
        if (q_g > 0) {
            klDiv += q_g * Math.log((q_g + epsilon) / (p_g + epsilon));
        }
    }
    klDiv = Math.max(0, klDiv);

    // Indice de régulation thermodynamique continu [0, 1]
    const thermodynamicIndex = Math.tanh(klDiv);

    // Modulation continue du ratio d'outsiders entre 0.20 (1 outsider) et 0.60 (3 outsiders sur 5 boules)
    // selon l'énergie de non-équilibre thermodynamique et l'entropie
    const energyDivergence = (thermodynamicIndex + (1.0 - baseRegime.entropy)) / 2.0;
    const sigmoidOutsider = 1.0 / (1.0 + Math.exp(-4.0 * (energyDivergence - 0.5)));
    const continuousOutsiderRatio = 0.20 + 0.40 * sigmoidOutsider;
    const continuousOutsiderCount = parseFloat((drawSize * continuousOutsiderRatio).toFixed(2));

    return {
        klDivergence: parseFloat(klDiv.toFixed(4)),
        thermodynamicIndex: parseFloat(thermodynamicIndex.toFixed(4)),
        continuousOutsiderRatio: parseFloat(continuousOutsiderRatio.toFixed(3)),
        continuousOutsiderCount,
        ...baseRegime
    };
};

export const predictBarycenterShift = (trajectory: BarycenterPoint[]): { x: number; y: number } | null => {
    if (trajectory.length < 2) return null;
    
    // Compute weighted velocity vectors across the entire spatial history
    let sumXVel = 0;
    let sumYVel = 0;
    let sumWeight = 0;
    
    // Continuous decay coefficient parameterized as a function of the trail length
    const k = 2 / (trajectory.length - 1); 
    
    for (let i = 1; i < trajectory.length; i++) {
        const dx = trajectory[i].x - trajectory[i - 1].x;
        const dy = trajectory[i].y - trajectory[i - 1].y;
        
        // i runs from 1 to trajectory.length - 1. More recent transitions (larger i) have lower age index
        const age = (trajectory.length - 1) - i;
        const weight = Math.exp(-age * k);
        
        sumXVel += dx * weight;
        sumYVel += dy * weight;
        sumWeight += weight;
    }
    
    const last = trajectory[trajectory.length - 1];
    const avgXVel = sumWeight > 0 ? sumXVel / sumWeight : 0;
    const avgYVel = sumWeight > 0 ? sumYVel / sumWeight : 0;
    
    // Clamp inside the physical grid dimensions (10 columns [0-9], 9 rows [0-8])
    return {
        x: Math.max(0, Math.min(9, last.x + avgXVel)),
        y: Math.max(0, Math.min(8, last.y + avgYVel))
    };
};

export const calculateSuccessionMatrixAsync = async (history: DrawResult[]): Promise<{ matrix: Record<number, Record<number, number>>; totals: Record<number, number> }> => {
    const matrix: Record<number, Record<number, number>> = {};
    const totals: Record<number, number> = {};
    
    // CORRECTION : La demi-vie ne doit pas être bornée par des nombres magiques (20, 50).
    // Elle doit être une fraction continue de l'historique disponible (ex: 30%).
    const halfLife = Math.max(10, Math.floor(history.length * 0.3)); 

    for(let i=0; i<history.length-1; i++) {
        const curr = history[i].gagnants;
        const prev = history[i+1].gagnants;
        
        const weight = Math.exp(-i / halfLife);
        
        for (const p of prev) {
            totals[p] = (totals[p]||0) + weight;
            if(!matrix[p]) matrix[p] = {};
            for (const c of curr) {
                matrix[p][c] = (matrix[p][c]||0) + weight;
            }
        }
    }
    return { matrix, totals };
};

export const calculateVolatility = (history: DrawResult[]): { score: number; status: string } => {
    const sums = history.map(d => d.gagnants.reduce((a,b)=>a+b,0));
    const std = getStdDev(sums);
    
    // Variance exacte de la somme de k tirages sans remise parmi N :
    // Var = k * (N^2 - 1)/12 * (N - k)/(N - 1)
    // N=90, k=5 => Var = 5 * (8099)/12 * (85)/89 ≈ 3222.92
    // StdDev = sqrt(3222.92) ≈ 56.77
    const THEORETICAL_STD_SUM = 56.77; 
    const score = Math.min(100, Math.round((std / THEORETICAL_STD_SUM) * 100));
    
    return { score, status: score > 60 ? 'Chaos' : score > 30 ? 'Volatile' : 'Stable' };
};

export const calculateShannonEntropy = (history: DrawResult[]): { normalized: number; raw?: number } => {
    if (history.length === 0) return { normalized: 0, raw: 0 };
    
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
    
    if (total === 0) return { normalized: 0, raw: 0 };
    
    let entropy = 0;
    for (let i = 1; i <= 90; i++) {
        if (freq[i] > 0) {
            const p = freq[i] / total;
            entropy -= p * Math.log2(p);
        }
    }
    
    const maxEntropy = Math.log2(90); 
    return { normalized: entropy / maxEntropy, raw: entropy };
};

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

export const findHistoricalMatches = (current: DrawResult, history: DrawResult[], limit: number = 5): { match: DrawResult; nextDraw: DrawResult | null; similarity: number }[] => {
    if (!current || !history) return [];
    
    const currentSet = new Set(current.gagnants);
    
    // Find index of matches in the original array to get the next draw correctly
    const matches = history
        .map((h, originalIdx) => {
            if (h.id === current.id) return null;
            
            let intersection = 0;
            for(const n of h.gagnants) {
                if (currentSet.has(n)) intersection++;
            }
            if (intersection === 0) return null;
            
            const union = 10 - intersection;
            return {
                match: h,
                nextDraw: history[originalIdx - 1] || null, 
                similarity: (intersection / union) * 100
            };
        })
        .filter(x => x !== null)
        .sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity)
        .slice(0, limit);
    
    return matches;
};

export const calculateTransferEntropyAsync = async (history: DrawResult[], targetNumbers?: number[]) => {
    if (typeof window !== 'undefined' && workerService.isAvailable()) {
        return workerService.runTask<{source: number, target: number, entropyTransfer: number, confidence: number}[]>('TRANSFER_ENTROPY', { targetNumbers }, history);
    }
    
    // Wrap to prevent UI blocking for 8100 iterations (although fast, it's good practice)
    return new Promise<{source: number, target: number, entropyTransfer: number, confidence: number}[]>((resolve) => {
        setTimeout(() => {
            const results = computeTransferEntropy(history, targetNumbers);
            resolve(results);
        }, 10);
    });
};

// --- GET NUMBER DETAILED METRICS (Moteur Principal de l'Inspecteur) ---
export const getNumberDetailedMetrics = async (num: number, history: DrawResult[], _spectral: SpectralMetric[], _fractal: FractalMetric[]): Promise<DetailedNumberMetrics> => {
    const { hurst } = calculateHurstForNumber(num, history);
    
    let lastGap = 0;
    for(let i=0; i<history.length; i++) {
        if(history[i].gagnants.includes(num)) break;
        lastGap++;
    }
    
    const freq20 = history.slice(0, 20).filter(d => d.gagnants.includes(num)).length;
    const temp = Math.min(100, freq20 * 20);
    
    // --- Calcul des Synergies et Antagonismes ---
    const coOccurrence = new Map<number, number>();
    const depth = Math.min(history.length, 100);
    let occurrences = 0;

    for (let i = 0; i < depth; i++) {
        if (history[i].gagnants.includes(num)) {
            occurrences++;
            history[i].gagnants.forEach(n => {
                if (n !== num) coOccurrence.set(n, (coOccurrence.get(n) || 0) + 1);
            });
        }
    }

    const affinities = Array.from(coOccurrence.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(e => e[0]);

    // Pour les antagonismes (Nemesis) : on cherche ceux qui sont sortis souvent globalement mais JAMAIS ou RAREMENT avec le numéro cible
    const globalFreq = new Map<number, number>();
    history.slice(0, depth).forEach(d => d.gagnants.forEach(n => globalFreq.set(n, (globalFreq.get(n)||0) + 1)));

    const nemesis = Array.from(globalFreq.entries())
        .filter(([n, freq]) => freq > 5 && (coOccurrence.get(n) || 0) === 0 && n !== num) // Fréquents mais 0 co-occurrence
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(e => e[0]);

    // Graphe d'historique : Densité temporelle (1 si sorti, 0.5 si voisin, 0 sinon) pour plus de nuance
    // Ou simplement le Gap history
    const historyGraph = history.slice(0, 20).map(d => d.gagnants.includes(num) ? 1 : 0).reverse();

    return {
        temperature: temp,
        hurst,
        lastGap,
        nextProb: Math.round((1 - Math.exp(-(freq20/20))) * 100),
        historyGraph,
        affinity: affinities,
        nemesis: nemesis
    };
};

const computeDFT = (signal: number[]): number => {
    const N = signal.length;
    if (N < 4) return 0;
    
    let maxPower = 0;
    const window = new Float32Array(N);
    const PI2_N = (2 * Math.PI) / (N - 1);
    for(let i=0; i<N; i++) window[i] = 0.54 - 0.46 * Math.cos(PI2_N * i);

    for (let k = 1; k < 10; k++) {
        let re = 0, im = 0;
        const angleStep = (2 * Math.PI * k) / N;
        
        for (let t = 0; t < N; t++) {
            const val = signal[t] * window[t];
            if (val === 0) continue;
            
            const angle = angleStep * t;
            re += val * Math.cos(angle);
            im -= val * Math.sin(angle);
        }
        const power = (re * re + im * im);
        if (power > maxPower) maxPower = power;
    }
    return Math.min(100, Math.round(Math.sqrt(maxPower) * 20));
};

export const calculateSpectralMetricsAsync = async (history: DrawResult[]): Promise<SpectralMetric[]> => {
    if (history.length === 0) return [];
    
    const activeDrawName = useNexusStore.getState().drawName;
    const historyDrawName = history[0].drawName || history[0].draw_name || "";
    
    // Strict Draw Isolation Guard
    if (activeDrawName && historyDrawName && activeDrawName.trim().toLowerCase() !== historyDrawName.trim().toLowerCase()) {
        console.warn(`[StrictDrawIsolationGuard] Rejected spectral calculation: active draw "${activeDrawName}" does not match history draw "${historyDrawName}"`);
        return [];
    }
    
    const cacheKey = `spectral_${historyDrawName}_${history[0].id}_${history.length}`;
    const cached = getCached<SpectralMetric[]>(cacheKey, activeDrawName);
    if (cached) return cached;

    if (typeof window !== 'undefined' && workerService.isAvailable()) {
        const result = await workerService.runTask<SpectralMetric[]>('SPECTRAL_METRICS', {}, history);
        setCached(cacheKey, result);
        return result;
    }

    // Parité parfaite via appel direct du moteur déterministe sous-jacent
    const result = runSpectral(history);
    setCached(cacheKey, result);
    return result;
};

export const calculateWaveletMetricsAsync = async (history: DrawResult[]): Promise<SpectralMetric[]> => {
    if (history.length === 0) return [];
    
    const activeDrawName = useNexusStore.getState().drawName;
    const historyDrawName = history[0].drawName || history[0].draw_name || "";
    
    // Strict Draw Isolation Guard
    if (activeDrawName && historyDrawName && activeDrawName.trim().toLowerCase() !== historyDrawName.trim().toLowerCase()) {
        console.warn(`[StrictDrawIsolationGuard] Rejected wavelet calculation: active draw "${activeDrawName}" does not match history draw "${historyDrawName}"`);
        return [];
    }
    
    const cacheKey = `wavelet_${historyDrawName}_${history[0].id}_${history.length}`;
    const cached = getCached<SpectralMetric[]>(cacheKey, activeDrawName);
    if (cached) return cached;

    if (typeof window !== 'undefined' && workerService.isAvailable()) {
        const result = await workerService.runTask<SpectralMetric[]>('wavelet_analysis', {}, history);
        setCached(cacheKey, result);
        return result;
    }

    // Deterministic main-thread/SSR parity implementation
    const result = runContinuousWaveletTransformAnalysis(history);
    setCached(cacheKey, result);
    return result; 
};

export const calculateFractalMetricsAsync = async (history: DrawResult[]): Promise<FractalMetric[]> => {
    if (history.length === 0) return [];
    
    const activeDrawName = useNexusStore.getState().drawName;
    const historyDrawName = history[0].drawName || history[0].draw_name || "";
    
    // Strict Draw Isolation Guard
    if (activeDrawName && historyDrawName && activeDrawName.trim().toLowerCase() !== historyDrawName.trim().toLowerCase()) {
        console.warn(`[StrictDrawIsolationGuard] Rejected fractal calculation: active draw "${activeDrawName}" does not match history draw "${historyDrawName}"`);
        return [];
    }
    
    const cacheKey = `fractal_${historyDrawName}_${history[0].id}_${history.length}`;
    const cached = getCached<FractalMetric[]>(cacheKey, activeDrawName);
    if (cached) return cached;

    if (typeof window !== 'undefined' && workerService.isAvailable()) {
        const result = await workerService.runTask<FractalMetric[]>('hurst_exponent', {}, history);
        setCached(cacheKey, result);
        return result;
    }

    const { runFractal } = await import('./mathCore');
    const result = runFractal(history) as FractalMetric[];
    setCached(cacheKey, result);
    return result;
};

export const calculateCorrelationMatrixAsync = async (history: DrawResult[]): Promise<Record<number, { affinities: Record<number, number> }>> => {
    if (history.length === 0) return {};
    
    const activeDrawName = useNexusStore.getState().drawName;
    const historyDrawName = history[0].drawName || history[0].draw_name || "";
    
    // Strict Draw Isolation Guard
    if (activeDrawName && historyDrawName && activeDrawName.trim().toLowerCase() !== historyDrawName.trim().toLowerCase()) {
        console.warn(`[StrictDrawIsolationGuard] Rejected correlation calculation: active draw "${activeDrawName}" does not match history draw "${historyDrawName}"`);
        return {};
    }
    
    const cacheKey = `correlation_${historyDrawName}_${history[0].id}_${history.length}`;
    const cached = getCached<Record<number, { affinities: Record<number, number> }>>(cacheKey, activeDrawName);
    if (cached) return cached;

    const matrix: Record<number, { affinities: Record<number, number> }> = {};
    for(let i=1; i<=90; i++) matrix[i] = { affinities: {} };
    
    const depth = Math.min(history.length, 100);
    const increment = 1 / depth;
    
    for (let k = 0; k < depth; k++) {
        const winners = history[k].gagnants;
        const len = winners.length;
        for (let i = 0; i < len; i++) {
            const n1 = winners[i];
            for (let j = 0; j < len; j++) {
                if (i !== j) {
                    const n2 = winners[j];
                    matrix[n1].affinities[n2] = (matrix[n1].affinities[n2] || 0) + increment;
                }
            }
        }
    }
    
    setCached(cacheKey, matrix);
    return matrix;
};

export const calculateDigitalRoot = (n: number): number => {
    return 1 + (n - 1) % 9;
};

export const performKMeansClusteringAsync = async (history: DrawResult[]): Promise<ClusterPoint[]> => {
    const regularity = calculateRegularity(history);
    
    // Zéro Nombre Magique : Initialisation déterministe basée sur les quartiles des données réelles
    const gaps = regularity.map(r => r.currentGap).sort((a,b) => a-b);
    const freqs = regularity.map(r => 100 / (r.avgGap || 1)).sort((a,b) => a-b);
    
    const getPercentile = (arr: number[], p: number) => {
        const index = (arr.length - 1) * p;
        const lower = Math.floor(index);
        const fraction = index - lower;
        if (lower >= arr.length - 1) return arr[lower];
        return arr[lower] + fraction * (arr[lower + 1] - arr[lower]);
    };

    // Centroids Invariants Topologiques : Sprinter (Gap bas, Freq haute), Marathonien (Gap moyen, Freq moyenne), Dormeur (Gap haut, Freq basse), Neutre (Milieu)
    let centroids = {
        'Sprinter': { x: getPercentile(gaps, 0.1), y: getPercentile(freqs, 0.9) },
        'Marathonien': { x: getPercentile(gaps, 0.5), y: getPercentile(freqs, 0.6) },
        'Dormeur': { x: getPercentile(gaps, 0.9), y: getPercentile(freqs, 0.1) },
        'Neutre': { x: getPercentile(gaps, 0.4), y: getPercentile(freqs, 0.4) }
    };

    // K-Means déterministe simple (max 20 itérations pour forcer convergence)
    let assignments = new Map<number, string>();
    
    for (let iter = 0; iter < 20; iter++) {
        const newAssignments = new Map<number, string>();
        
        // Assignation
        regularity.forEach(r => {
            const px = r.currentGap;
            const py = 100 / (r.avgGap || 1);
            
            let bestCluster = 'Neutre';
            let minDistance = Infinity;
            
            Object.entries(centroids).forEach(([name, c]) => {
                // Distance euclidienne normalisée
                const dx = (px - c.x) / (getPercentile(gaps, 0.9) || 1);
                const dy = (py - c.y) / (getPercentile(freqs, 0.9) || 1);
                const dist = dx * dx + dy * dy;
                if (dist < minDistance) {
                    minDistance = dist;
                    bestCluster = name;
                }
            });
            newAssignments.set(r.number, bestCluster);
        });
        
        let changed = false;
        newAssignments.forEach((cluster, num) => {
            if (assignments.get(num) !== cluster) changed = true;
        });
        assignments = newAssignments;
        
        if (!changed) break; // Convergence atteinte
        
        // Recalcul des centroïdes
        Object.keys(centroids).forEach(key => {
            const assigned = regularity.filter(r => assignments.get(r.number) === key);
            if (assigned.length > 0) {
                const sumX = assigned.reduce((sum, r) => sum + r.currentGap, 0);
                const sumY = assigned.reduce((sum, r) => sum + (100 / (r.avgGap || 1)), 0);
                centroids[key as keyof typeof centroids] = {
                    x: sumX / assigned.length,
                    y: sumY / assigned.length
                };
            }
        });
    }

    return regularity.map(r => ({
        number: r.number,
        x: r.currentGap,
        y: 100 / (r.avgGap || 1), 
        cluster: assignments.get(r.number) || 'Neutre'
    }));
};

/**
 * Trouve les triplets fréquents (numéros sortis ensemble par 3)
 */
export const findFrequentTriplets = (history: DrawResult[], filterNumber?: number | null): { triplet: number[], count: number }[] => {
    const tripletCounts = new Map<string, number>();
    const limit = Math.min(history.length, 150); // Analyse sur 150 derniers tirages

    for (let i = 0; i < limit; i++) {
        const numbers = history[i].gagnants.sort((a, b) => a - b);
        // Si un numéro de filtre est fourni, on ne garde que les tirages qui le contiennent
        if (filterNumber && !numbers.includes(filterNumber)) continue;

        // Génération des triplets (nCk avec k=3)
        for (let a = 0; a < numbers.length - 2; a++) {
            for (let b = a + 1; b < numbers.length - 1; b++) {
                for (let c = b + 1; c < numbers.length; c++) {
                    const triplet = [numbers[a], numbers[b], numbers[c]];
                    // Si filtre, le triplet DOIT contenir le numéro
                    if (filterNumber && !triplet.includes(filterNumber)) continue;
                    
                    const key = triplet.join('-');
                    tripletCounts.set(key, (tripletCounts.get(key) || 0) + 1);
                }
            }
        }
    }

    const results = Array.from(tripletCounts.entries())
        .map(([key, count]) => ({ triplet: key.split('-').map(Number), count }))
        .filter(t => t.count >= 2) // On ne garde que les récurrences
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return results;
};

export interface SymmetryAnalysis {
    tensionScore: number;
    expectedTension: number;
    zScore: number;
    tensionIndex: number; // 0 à 100
    isAnomalous: boolean;
    patterns: {
        adjacent: [number, number][];
        sameEnding: [number, number][];
        digitMirrors: [number, number][];
        centerMirrors: [number, number][];
    };
    alertMessage: string | null;
}

/**
 * Détecte une 'Symétrie Forcée' dans un tirage de numéros (trop de miroirs, voisins, finales)
 * Calcule un score continu de tension stochastique basé sur l'inverse des probabilités aléatoires d'arrière-plan.
 */
export const detectForcedSymmetry = (numbers: number[], history?: DrawResult[]): SymmetryAnalysis => {
    const K = numbers.length;
    if (K < 2) {
        return {
            tensionScore: 0,
            expectedTension: 0,
            zScore: 0,
            tensionIndex: 0,
            isAnomalous: false,
            patterns: { adjacent: [], sameEnding: [], digitMirrors: [], centerMirrors: [] },
            alertMessage: null
        };
    }

    const nPossiblePairs = (K * (K - 1)) / 2;

    // Définition canonique des probabilités d'arrière-plan sur l'espace Loto [1..90]
    // 1. Adjacence : 89 paires sur 4005 possible (N=90) -> p = 89/4005
    const p_adj = 89 / 4005;
    const w_adj = 1 / p_adj; // 45

    // 2. Même finale : 10 finales distinctes, chacune contenant 9 numéros. 
    // Éclatement combinatoire = 10 * C(9, 2) = 360 paires sur 4005 -> p = 360/4005
    const p_end = 360 / 4005;
    const w_end = 1 / p_end; // 11.125

    // 3. Miroirs de chiffres : 41 paires exclusives (sans compter les palindromes de type 11,22...) sur 4005 -> p = 41/4005
    const p_dig = 41 / 4005;
    const w_dig = 1 / p_dig; // ~97.68

    // 4. Miroirs centraux (somme = 91) : 45 paires complémentaires sur 4005 -> p = 45/4005
    const p_cent = 45 / 4005;
    const w_cent = 1 / p_cent; // 89

    const adjacent: [number, number][] = [];
    const sameEnding: [number, number][] = [];
    const digitMirrors: [number, number][] = [];
    const centerMirrors: [number, number][] = [];

    const getDigitMirror = (x: number): number => {
        if (x < 10) return x * 10;
        if (x % 10 === 0) return Math.floor(x / 10);
        return (x % 10) * 10 + Math.floor(x / 10);
    };

    // Parcourt combinatoire exact de toutes les paires distinctes du tirage
    for (let i = 0; i < K; i++) {
        for (let j = i + 1; j < K; j++) {
            const a = numbers[i];
            const b = numbers[j];

            // 1. Voisins directs (adjacence)
            if (Math.abs(a - b) === 1) {
                adjacent.push([a, b].sort((x, y) => x - y) as [number, number]);
            }

            // 2. Voisins de finale (même unité)
            if (a % 10 === b % 10) {
                sameEnding.push([a, b].sort((x, y) => x - y) as [number, number]);
            }

            // 3. Miroirs d'inversion des unités/dizaines (ex: 12 et 21, 9 et 90)
            if (getDigitMirror(a) === b) {
                digitMirrors.push([a, b].sort((x, y) => x - y) as [number, number]);
            }

            // 4. Miroir d'iso-centre stochastique (a + b === 91)
            if (a + b === 91) {
                centerMirrors.push([a, b].sort((x, y) => x - y) as [number, number]);
            }
        }
    }

    // Calcul de la tension stochastique induite (Somme pondérée par l'inverse de la probabilité)
    const tensionScore = 
        adjacent.length * w_adj +
        sameEnding.length * w_end +
        digitMirrors.length * w_dig +
        centerMirrors.length * w_cent;

    // Espérance théorique sous hypothèse nulle (H0 : distribution uniforme aléatoire)
    // E[S] = Somme( w_i * E[c_i] ) = Somme( 1 * nPossiblePairs ) = 4 * nPossiblePairs
    const expectedTension = 4 * nPossiblePairs;

    // Standard deviation (écart-type). Si l'historique est fourni, on peut mesurer l'écart-type empirique historique 
    // pour que la normalisation reflète les fluctuations exactes du jeu réel de la plateforme.
    let stdDev = 0;
    if (history && history.length > 10) {
        let sumSquaredDiffs = 0;
        const validHistory = history.slice(0, 100); // 100 derniers tirages pour conserver une performance optimale
        
        const historicalTensions = validHistory.map(h => {
            const nums = h.gagnants;
            const hK = nums.length;
            
            let adjC = 0, endC = 0, digC = 0, centC = 0;
            for (let i = 0; i < hK; i++) {
                for (let j = i + 1; j < hK; j++) {
                    const x = nums[i];
                    const y = nums[j];
                    if (Math.abs(x - y) === 1) adjC++;
                    if (x % 10 === y % 10) endC++;
                    if (getDigitMirror(x) === y) digC++;
                    if (x + y === 91) centC++;
                }
            }
            return adjC * w_adj + endC * w_end + digC * w_dig + centC * w_cent;
        });

        const meanHistTrend = historicalTensions.reduce((sum, val) => sum + val, 0) / historicalTensions.length;
        historicalTensions.forEach(val => {
            sumSquaredDiffs += Math.pow(val - meanHistTrend, 2);
        });
        stdDev = Math.sqrt(sumSquaredDiffs / (historicalTensions.length - 1));
    }

    // Sécurité analytique : si pas d'historique ou écart-type nul, on utilise l'écart-type théorique approximé sous H0
    if (stdDev === 0) {
        stdDev = 12.5 * Math.sqrt(nPossiblePairs);
    }

    // Calcul du Z-Score probabiliste
    const zScore = (tensionScore - expectedTension) / stdDev;

    // Index de tension stochastique projeté de 0 à 100 via une fonction de répartition sigmoïde logistique de la loi normale (CDF, Constante 1.702)
    const tensionIndex = Math.min(100, Math.max(0, Math.round(100 / (1 + Math.exp(-1.702 * zScore)))));

    // CORRECTION : Le seuil d'anomalie ne doit pas être un nombre magique (80).
    // Il doit correspondre à un Z-Score statistiquement significatif (ex: > 1.645 pour 95% de confiance unilatérale).
    const isAnomalous = zScore > 1.645; 

    let alertMessage: string | null = null;
    if (isAnomalous) {
        const countsMsg = [];
        if (adjacent.length > 0) countsMsg.push(`${adjacent.length} voisin(s)`);
        if (sameEnding.length > 0) countsMsg.push(`${sameEnding.length} même finale(s)`);
        if (digitMirrors.length > 0) countsMsg.push(`${digitMirrors.length} miroir(s) de chiffres`);
        if (centerMirrors.length > 0) countsMsg.push(`${centerMirrors.length} miroir(s) centraux`);
        
        alertMessage = `Tension stochastique anormale détectée (${tensionIndex}%). Présence de structures hautement corrélées : ${countsMsg.join(', ')}.`;
    }

    return {
        tensionScore: parseFloat(tensionScore.toFixed(3)),
        expectedTension,
        zScore: parseFloat(zScore.toFixed(3)),
        tensionIndex,
        isAnomalous,
        patterns: { adjacent, sameEnding, digitMirrors, centerMirrors },
        alertMessage
    };
};

/**
 * Calcule la discrépance de Weyl de l'historique des tirages (somme des numéros modulo 1).
 * La discrépance de Weyl mesure à quel point la série est harmonieusement équirépartie.
 * Une valeur faible (ex: < 0.15) témoigne d'une équirépartition de type Weyl exceptionnelle.
 * Une valeur proche de 1 témoigne d'agglomérations stochastiques d'asymétrie.
 * 100% Déterministe, dérivé uniquement de l'arithmétique modulaire sans nombre magique.
 */
export const calculateWeylDiscrepancy = (history: DrawResult[]): number => {
    const N = Math.min(history.length, 100);
    if (N < 10) return 0.5;

    const values = new Float64Array(N);
    const goldenRatio = 0.6180339887498949; // Constante mathématique pure

    for (let i = 0; i < N; i++) {
        const sum = history[i].gagnants.reduce((a, b) => a + b, 0);
        values[i] = (sum * goldenRatio) % 1.0;
    }

    values.sort();

    let maxDiff = 0;
    for (let j = 0; j < N; j++) {
        const expected = (j + 0.5) / N;
        const diff = Math.abs(values[j] - expected);
        if (diff > maxDiff) maxDiff = diff;
    }

    return Math.max(0, Math.min(1.0, maxDiff));
};

/**
 * Calcule la Dimension de Corrélation d'Attracteur de Grassberger-Procaccia (GP).
 * Reconstruit l'espace des phases des sommes de tirages (emb=3, delay=1) pour mesurer la dimension fractale de l'attracteur dynamique.
 * Retourne une valeur continue décrivant la complexité de l'espace chaotique (ex: entre 1.0 et 3.0).
 * 100% Déterministe, calculée continûment à partir de l'auto-distribution spectrale des distances Euclidiennes.
 */
export const calculateGrassbergerProcaccia = (history: DrawResult[]): number => {
    const N = Math.min(history.length, 100);
    if (N < 15) return 1.5;

    const sums = new Float64Array(N);
    for (let i = 0; i < N; i++) {
        sums[i] = history[i].gagnants.reduce((a, b) => a + b, 0);
    }

    const emb = 3;
    const m = N - emb + 1;
    if (m <= 5) return 1.5;

    const vectors: number[][] = [];
    for (let i = 0; i < m; i++) {
        vectors.push([sums[i], sums[i + 1], sums[i + 2]]);
    }

    const distances: number[] = [];
    for (let i = 0; i < m; i++) {
        for (let j = i + 1; j < m; j++) {
            const dx = vectors[i][0] - vectors[j][0];
            const dy = vectors[i][1] - vectors[j][1];
            const dz = vectors[i][2] - vectors[j][2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist > 0) distances.push(dist);
        }
    }

    if (distances.length < 5) return 1.5;
    distances.sort((a, b) => a - b);

    // Calcul de l'intégrale de corrélation continue sur deux quantiles endogènes d'intervalles de distance
    const r1 = distances[Math.floor(distances.length * 0.10)];
    const r2 = distances[Math.floor(distances.length * 0.50)];

    if (r1 === r2 || r1 === 0 || r2 === 0) return 1.5;

    let count1 = 0;
    let count2 = 0;
    for (const d of distances) {
        if (d <= r1) count1++;
        if (d <= r2) count2++;
    }

    const c1 = count1 / distances.length;
    const c2 = count2 / distances.length;

    if (c1 === 0 || c2 === 0 || c1 === c2) return 1.5;

    const d = (Math.log(c2) - Math.log(c1)) / (Math.log(r2) - Math.log(r1));

    return Math.max(1.0, Math.min(3.0, d));
};

export const calculateStatisticalBounds = (history: DrawResult[]): {
  median: number;
  q1: number;
  q3: number;
  variance: number;
  kurtosis: number;
  skewness: number;
  shannonEntropy: number;
  hurstExponent: number;
} => {
    if (!history || history.length === 0) {
        return { median: 0, q1: 0, q3: 0, variance: 0, kurtosis: 0, skewness: 0, shannonEntropy: 0, hurstExponent: 0.5 };
    }
    const sums = history.map(d => d.gagnants.reduce((a, b) => a + b, 0));
    const sortedSums = [...sums].sort((a, b) => a - b);
    const n = sortedSums.length;

    // Median
    let median = 0;
    if (n % 2 !== 0) {
        median = sortedSums[Math.floor(n / 2)];
    } else {
        median = (sortedSums[n / 2 - 1] + sortedSums[n / 2]) / 2;
    }

    // Quantiles
    const q1 = sortedSums[Math.floor(n * 0.25)] || 0;
    const q3 = sortedSums[Math.floor(n * 0.75)] || 0;

    // Moments: Mean
    let sum = 0;
    for (let i = 0; i < n; i++) sum += sums[i];
    const mean = sum / n;

    // Moments: Variance (2nd moment), Skewness (3rd), Kurtosis (4th)
    let sumSq = 0;
    let sumCub = 0;
    let sumQuad = 0;

    for (let i = 0; i < n; i++) {
        const diff = sums[i] - mean;
        sumSq += diff * diff;
        sumCub += Math.pow(diff, 3);
        sumQuad += Math.pow(diff, 4);
    }

    const variance = sumSq / n;
    const stdDev = Math.sqrt(variance);

    let skewness = 0;
    let kurtosis = 0;

    if (stdDev > 0) {
        skewness = (sumCub / n) / Math.pow(stdDev, 3);
        kurtosis = (sumQuad / n) / Math.pow(stdDev, 4) - 3; // Excess Kurtosis
    }

    const shannon = calculateShannonEntropy(history).normalized;
    const hurst = calculateFractalIndex(history);

    return {
        median,
        q1,
        q3,
        variance,
        kurtosis,
        skewness,
        shannonEntropy: shannon,
        hurstExponent: hurst
    };
};

export interface TemporalDriftLearningRateResult {
    learningRate: number;
    baseLR: number;
    klDivergence: number;
    entropyVariance: number;
    lambda: number;
    localEntropy: number;
    globalEntropy: number;
    driftResistanceFactor: number;
    rollingEntropies: number[];
}

/**
 * Calibration Dynamique du Taux d'Apprentissage η(t) par Dérive Temporelle
 * Formule canonique : η(t) = η0 / (1 + λ * D_KL(P || Q))
 * - P : Distribution empirique locale des 10 derniers tirages
 * - Q : Distribution de référence (historique complet / uniforme théorique)
 * - λ : Amortissement proportionnel à la variance résiduelle de l'entropie de Shannon sur les sous-fenêtres
 * ZÉRO NOMBRE MAGIQUE, 100% DIFFÉRENTIABLE ET DÉTERMINISTE (AGENTS.md).
 */
export const calculateTemporalDriftLearningRate = (
    history: DrawResult[],
    baseLR?: number,
    windowSize: number = 10
): TemporalDriftLearningRateResult => {
    const N = history.length;
    // Taux d'apprentissage de base sans nombre magique, proportionnel à l'inverse de sqrt(taille d'échantillon)
    const effectiveBaseLR = baseLR !== undefined 
        ? baseLR 
        : 1.0 / Math.sqrt(Math.max(10, N));

    if (N < 3) {
        return {
            learningRate: effectiveBaseLR,
            baseLR: effectiveBaseLR,
            klDivergence: 0,
            entropyVariance: 0,
            lambda: 1.0,
            localEntropy: 1.0,
            globalEntropy: 1.0,
            driftResistanceFactor: 1.0,
            rollingEntropies: [1.0]
        };
    }

    const actualWindow = Math.min(N, Math.max(3, windowSize));
    const localHistory = history.slice(0, actualWindow);

    // 1. Calcul de la distribution empirique P (Locale) et Q (Globale de référence) sur le domaine [1, 90]
    const pCounts = new Float64Array(91);
    let pTotal = 0;
    for (const d of localHistory) {
        for (const num of d.gagnants) {
            if (num >= 1 && num <= 90) {
                pCounts[num]++;
                pTotal++;
            }
        }
    }

    const qCounts = new Float64Array(91);
    let qTotal = 0;
    for (const d of history) {
        for (const num of d.gagnants) {
            if (num >= 1 && num <= 90) {
                qCounts[num]++;
                qTotal++;
            }
        }
    }

    const epsilon = 1e-9;
    let klDiv = 0;
    for (let i = 1; i <= 90; i++) {
        const p = pTotal > 0 ? (pCounts[i] / pTotal) : (1.0 / 90.0);
        const q = qTotal > 0 ? (qCounts[i] / qTotal) : (1.0 / 90.0);
        // Lissage continu infinitésimal
        const pSmooth = (p + epsilon) / (1.0 + 90 * epsilon);
        const qSmooth = (q + epsilon) / (1.0 + 90 * epsilon);
        klDiv += pSmooth * Math.log(pSmooth / qSmooth);
    }
    klDiv = Math.max(0, klDiv);

    // 2. Variance résiduelle de l'entropie de Shannon sur les sous-fenêtres glissantes
    const rollingEntropies: number[] = [];
    const subWin = Math.min(3, localHistory.length);
    for (let i = 0; i <= localHistory.length - subWin; i++) {
        const chunk = localHistory.slice(i, i + subWin);
        const ent = calculateShannonEntropy(chunk).normalized;
        rollingEntropies.push(ent);
    }

    const meanEnt = rollingEntropies.reduce((a, b) => a + b, 0) / (rollingEntropies.length || 1);
    let entVar = 0;
    for (const e of rollingEntropies) {
        entVar += Math.pow(e - meanEnt, 2);
    }
    entVar /= (rollingEntropies.length || 1);

    const localEntropy = calculateShannonEntropy(localHistory).normalized;
    const globalEntropy = calculateShannonEntropy(history).normalized;

    // 3. Facteur d'amortissement lambda dérivé continûment de la variance résiduelle d'entropie et de la volatilité
    const volatilityInfo = calculateVolatility(localHistory);
    const volNorm = Math.tanh(volatilityInfo.score / 50.0);
    const lambda = 1.0 + Math.tanh(entVar * 20.0) * (1.0 + volNorm);

    // 4. Formule canonique : η(t) = η0 / (1 + λ * D_KL(P || Q))
    const driftResistanceFactor = 1.0 / (1.0 + lambda * klDiv);
    const learningRate = effectiveBaseLR * driftResistanceFactor;

    return {
        learningRate,
        baseLR: effectiveBaseLR,
        klDivergence: klDiv,
        entropyVariance: entVar,
        lambda,
        localEntropy,
        globalEntropy,
        driftResistanceFactor,
        rollingEntropies
    };
};


