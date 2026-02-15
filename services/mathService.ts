
import { DrawResult, ProjectionItem, TopFollowerAnalysis, SpectralMetric, FractalMetric, NumberRegularity, ClusterPoint, BarycenterPoint, DetailedNumberMetrics, ShadowNumbers, TrendOscillatorPoint, ChiSquareMetric, GapEfficiency } from '../types';

// --- UTILS STATISTIQUES VECTORISÉS ---

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
const getMean = (data: number[]): number => {
    if (!data || data.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length;
};

/**
 * Calcule l'écart-type (Standard Deviation) d'un tableau.
 */
const getStdDev = (data: number[]): number => {
    if (!data || data.length < 2) return 0;
    const mu = getMean(data);
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
        sumSq += (data[i] - mu) ** 2;
    }
    return Math.sqrt(sumSq / data.length);
};

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
        const r = Math.random() * totalWeight;
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
    
    const efficiencies: GapEfficiency[] = [];
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

    return efficiencies.sort((a, b) => b.zScore - a.zScore);
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
    const signal = new Array(limit);
    for(let i=0; i<limit; i++) {
        signal[i] = history[i].gagnants.includes(num) ? 1 : 0;
    }
    return { hurst: calculateFastHurst(signal) };
};

export const calculateFractalIndex = (history: DrawResult[]): number => {
    const limit = Math.min(history.length, 100);
    const sums = new Array(limit);
    for(let i=0; i<limit; i++) {
        let s = 0;
        const w = history[i].gagnants;
        for(let j=0; j<w.length; j++) s += w[j];
        sums[i] = s;
    }
    return calculateFastHurst(sums);
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
    const result = new Array(limit);
    
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

export const detectGameRegime = (history: DrawResult[]): { regime: string; hurst: number } => {
    const h = calculateFractalIndex(history);
    let regime = 'NORMAL';
    if (h > 0.6) regime = 'PERSISTANT'; 
    else if (h < 0.4) regime = 'ANTI-PERSISTANT'; 
    else regime = 'RANDOM'; 
    return { regime, hurst: h };
};

export const predictBarycenterShift = (trajectory: BarycenterPoint[]): { x: number; y: number } | null => {
    if(trajectory.length < 2) return null;
    const last = trajectory[trajectory.length-1];
    const prev = trajectory[trajectory.length-2];
    return { x: last.x + (last.x - prev.x), y: last.y + (last.y - prev.y) };
};

export const calculateSuccessionMatrixAsync = async (history: DrawResult[]): Promise<{ matrix: Record<number, Record<number, number>>; totals: Record<number, number> }> => {
    const matrix: Record<number, Record<number, number>> = {};
    const totals: Record<number, number> = {};
    
    for(let i=0; i<history.length-1; i++) {
        const curr = history[i].gagnants;
        const prev = history[i+1].gagnants;
        
        for (const p of prev) {
            totals[p] = (totals[p]||0)+1;
            if(!matrix[p]) matrix[p] = {};
            for (const c of curr) {
                matrix[p][c] = (matrix[p][c]||0)+1;
            }
        }
    }
    return { matrix, totals };
};

export const calculateVolatility = (history: DrawResult[]): { score: number; status: string } => {
    const sums = history.map(d => d.gagnants.reduce((a,b)=>a+b,0));
    const std = getStdDev(sums);
    const score = Math.min(100, Math.round((std / 45) * 100));
    return { score, status: score > 60 ? 'Chaos' : score > 30 ? 'Volatile' : 'Stable' };
};

export const calculateShannonEntropy = (history: DrawResult[]): { normalized: number } => {
    if (history.length === 0) return { normalized: 0 };
    
    const freq = new Uint32Array(91);
    let total = 0;
    
    for(const d of history) {
        for(const n of d.gagnants) {
            freq[n]++;
            total++;
        }
    }
    
    let entropy = 0;
    for(let i=1; i<=90; i++) {
        if(freq[i] > 0) {
            const p = freq[i] / total;
            entropy -= p * Math.log2(p);
        }
    }
    
    const maxEntropy = Math.log2(90); 
    return { normalized: entropy / maxEntropy };
};

export const calculateChiSquare = (observed: Record<number, number>, totalObservations: number): ChiSquareMetric => {
    const expected = totalObservations / 90; 
    let chiSq = 0;
    for(let i=1; i<=90; i++) {
        const obs = observed[i] || 0;
        chiSq += ((obs - expected) ** 2) / expected;
    }
    return { score: chiSq };
};

export const calculateBenfordCompliance = (numbers: number[]): { score: number } => {
    if (numbers.length === 0) return { score: 0 };
    const counts = new Uint32Array(10);
    
    for(const n of numbers) {
        const leading = parseInt(n.toString()[0]);
        if(leading >= 1 && leading <= 9) counts[leading]++;
    }
    
    const total = numbers.length;
    let deviation = 0;
    
    for(let d=1; d<=9; d++) {
        const observed = counts[d] / total;
        const expected = Math.log10(1 + 1/d); 
        deviation += Math.abs(observed - expected);
    }
    
    const score = Math.max(0, 100 - (deviation * 200)); 
    return { score };
};

export const findHistoricalMatches = (current: DrawResult, history: DrawResult[], limit: number = 5): any[] => {
    if (!current || !history) return [];
    
    const currentSet = new Set(current.gagnants);
    
    const matches = history
        .filter(h => h.id !== current.id)
        .map((h, idx) => {
            let intersection = 0;
            for(const n of h.gagnants) {
                if (currentSet.has(n)) intersection++;
            }
            const union = 10 - intersection;
            return {
                match: h,
                nextDraw: history[idx - 1] || null, 
                similarity: (intersection / union) * 100
            };
        })
        .filter(x => x.similarity > 0)
        .sort((a,b) => b.similarity - a.similarity)
        .slice(0, limit);
    
    return matches;
};

// --- GET NUMBER DETAILED METRICS (Moteur Principal de l'Inspecteur) ---
export const getNumberDetailedMetrics = async (num: number, history: DrawResult[], spectral: SpectralMetric[], fractal: FractalMetric[]): Promise<DetailedNumberMetrics> => {
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
    const metrics: SpectralMetric[] = [];
    const limit = Math.min(history.length, 64);
    const signalBuffer = new Int8Array(limit);
    
    for (let i = 1; i <= 90; i++) {
        for(let j=0; j<limit; j++) {
            signalBuffer[j] = history[j].gagnants.includes(i) ? 1 : 0;
        }
        const energy = computeDFT(Array.from(signalBuffer));
        metrics.push({ number: i, energy, resonance: energy > 70 });
    }
    return metrics;
};

export const calculateWaveletMetricsAsync = async (history: DrawResult[]): Promise<SpectralMetric[]> => {
    return calculateSpectralMetricsAsync(history); 
};

export const calculateFractalMetricsAsync = async (history: DrawResult[]): Promise<FractalMetric[]> => {
    const metrics: FractalMetric[] = [];
    for (let i = 1; i <= 90; i++) {
        const { hurst } = calculateHurstForNumber(i, history);
        metrics.push({ number: i, hurst });
    }
    return metrics;
};

export const calculateCorrelationMatrixAsync = async (history: DrawResult[]): Promise<any> => {
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
    return matrix;
};

export const calculateDigitalRoot = (n: number): number => {
    return 1 + (n - 1) % 9;
};

export const performKMeansClusteringAsync = async (history: DrawResult[]): Promise<ClusterPoint[]> => {
    const regularity = calculateRegularity(history);
    return regularity.map(r => {
        let cluster = 'Neutre';
        if (r.currentGap > 20) cluster = 'Dormeur';
        else if (r.avgGap < 10) cluster = 'Sprinter';
        else if (r.stdDev < 1.5) cluster = 'Marathonien';
        
        return {
            number: r.number,
            x: r.currentGap,
            y: 100 / (r.avgGap || 1), 
            cluster
        };
    });
};
