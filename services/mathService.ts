
import { DrawResult, ProjectionItem, TopFollowerAnalysis, SpectralMetric, FractalMetric, NumberRegularity, ClusterPoint, BarycenterPoint, DetailedNumberMetrics, ShadowNumbers, TrendOscillatorPoint, ChiSquareMetric, GapEfficiency } from '../types';

// --- UTILS STATISTIQUES ---

const factorial = (n: number): number => {
    if (n === 0 || n === 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
};

const getMean = (data: number[]) => {
    if (data.length === 0) return 0;
    return data.reduce((a, b) => a + b, 0) / data.length;
};

const getStdDev = (data: number[]) => {
    if (data.length === 0) return 0;
    const mu = getMean(data);
    const variance = data.reduce((a, b) => a + Math.pow(b - mu, 2), 0) / data.length;
    return Math.sqrt(variance);
};

/**
 * Calcule la probabilité de Poisson P(k; lambda)
 */
export const calculatePoissonProbability = (k: number, lambda: number): number => {
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
};

/**
 * Inférence Bayésienne
 */
export const calculateBayesianScore = (prior: number, likelihood: number): number => {
    const evidence = (prior * likelihood) + ((1 - prior) * (1 - likelihood));
    return evidence === 0 ? 0 : (likelihood * prior) / evidence;
};

/**
 * Simulation Monte Carlo
 */
export const runMonteCarloSimulation = (weights: Record<number, number>, iterations: number = 5000): Record<number, number> => {
    const results: Record<number, number> = {};
    const pool = Object.entries(weights).map(([n, w]) => ({ n: Number(n), w }));
    const totalWeight = pool.reduce((a, b) => a + b.w, 0);

    for (let i = 0; i < iterations; i++) {
        let r = Math.random() * totalWeight;
        for (const item of pool) {
            r -= item.w;
            if (r <= 0) {
                results[item.n] = (results[item.n] || 0) + 1;
                break;
            }
        }
    }
    return results;
};

/**
 * Calcule l'efficacité conditionnelle des écarts (GEI)
 */
export const calculateGapEfficiency = async (history: DrawResult[]): Promise<GapEfficiency[]> => {
    const efficiencies: GapEfficiency[] = [];
    const depth = Math.min(history.length, 300);
    const subHistory = history.slice(0, depth);

    for (let num = 1; num <= 90; num++) {
        const gaps: number[] = [];
        let currentCounter = 0;
        let isFirst = true;
        let currentGap = 0;

        for (const draw of subHistory) {
            if (draw.gagnants.includes(num)) {
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

        const maxGap = gaps.length > 0 ? Math.max(...gaps) : currentGap;
        const avgGap = gaps.length > 0 ? gaps.reduce((a,b)=>a+b,0)/gaps.length : 0;
        const variance = gaps.length > 0 ? gaps.reduce((acc, val) => acc + Math.pow(val - avgGap, 2), 0) / gaps.length : 0;
        const sigma = Math.sqrt(variance) || 1;

        const zScore = (currentGap - avgGap) / sigma;
        const breakoutProb = (1 / (1 + Math.exp(-(zScore - 0.5) * 1.5))) * 100;
        const fatigueIndex = maxGap > 0 ? (maxGap / avgGap) : 1;

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

export const getProjectionsAsync = async (history: DrawResult[], lastNumbers: number[]): Promise<ProjectionItem[]> => {
    const freq: Record<number, number> = {};
    history.forEach(d => d.gagnants.forEach(n => freq[n] = (freq[n] || 0) + 1));
    return Object.entries(freq)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 5)
        .map(([n, c]) => ({ number: Number(n), probability: Math.round((c / history.length) * 100) }));
};

export const getFollowersAnalysisAsync = async (history: DrawResult[]): Promise<TopFollowerAnalysis[]> => {
    if (history.length < 2) return [];
    const lastDraw = history[0].gagnants;
    const followers: Record<number, number> = {};
    for(let i=1; i<history.length-1; i++) {
        const prev = history[i+1].gagnants;
        const curr = history[i].gagnants;
        if (prev.some(n => lastDraw.includes(n))) {
            curr.forEach(n => followers[n] = (followers[n] || 0) + 1);
        }
    }
    return Object.entries(followers)
        .map(([n, c]) => ({ number: Number(n), count: c }))
        .sort((a,b) => b.count - a.count)
        .slice(0, 10);
};

export const getMomentumScores = async (history: DrawResult[]): Promise<Record<number, number>> => {
    const scores: Record<number, number> = {};
    const recent = history.slice(0, 10);
    recent.forEach((d, idx) => {
        const weight = 10 - idx;
        d.gagnants.forEach(n => scores[n] = (scores[n] || 0) + weight);
    });
    return scores;
};

export const getVelocityScores = async (history: DrawResult[]): Promise<Record<number, number>> => {
    const scores: Record<number, number> = {};
    const recent = history.slice(0, 5);
    recent.forEach(d => d.gagnants.forEach(n => scores[n] = (scores[n] || 0) + 20));
    return scores;
};

// --- ALGORITHMES AVANCÉS (REAL IMPLEMENTATION) ---

/**
 * Calcul réel de l'exposant de Hurst via R/S Analysis
 * Mesure la persistance d'une série temporelle.
 */
const performRSAnalysis = (series: number[]): number => {
    const N = series.length;
    if (N < 10) return 0.5;

    const mean = getMean(series);
    const y = series.map(x => x - mean); // Série centrée
    
    let cumsum = 0;
    const z = y.map(val => {
        cumsum += val;
        return cumsum;
    });

    const R = Math.max(...z) - Math.min(...z); // Range
    const S = getStdDev(series); // Standard Deviation

    if (R === 0 || S === 0) return 0.5;

    // Log-Log Relation: log(R/S) = H * log(N) + c
    // H = log(R/S) / log(N) (Approximation simplifiée)
    const hurst = Math.log(R / S) / Math.log(N / 2); // N/2 pour échelle empirique Loto
    
    return Math.max(0.01, Math.min(0.99, hurst));
};

export const calculateHurstForNumber = (num: number, history: DrawResult[]): { hurst: number } => {
    // Convertir l'historique en signal binaire (0 ou 1) pour le numéro
    const signal = history.slice(0, 100).map(d => d.gagnants.includes(num) ? 1 : 0);
    const h = performRSAnalysis(signal);
    return { hurst: h };
};

export const calculateFractalIndex = (history: DrawResult[]): number => {
    // Calcul Hurst global sur la somme des numéros (proxy de l'activité globale)
    const sums = history.slice(0, 100).map(d => d.gagnants.reduce((a,b)=>a+b,0));
    return performRSAnalysis(sums);
};

export const calculateShadowNumbers = (draw: DrawResult): ShadowNumbers => {
    const sum = draw.gagnants.reduce((a, b) => a + b, 0);
    return {
        sumModulo: sum % 90 || 90,
        goldenNumber: Math.round(sum * 0.618) % 90 || 1,
        firstCompliment: 90 - draw.gagnants[0],
        gapLink: Math.abs(draw.gagnants[0] - draw.gagnants[4])
    };
};

/**
 * Test de Wald-Wolfowitz (Runs Test)
 * Vérifie l'hypothèse d'aléatoire d'une séquence binaire.
 */
export const calculateRunsTest = (numbers: number[]): { zScore: number; isRandom: boolean } => {
    if (numbers.length === 0) return { zScore: 0, isRandom: true };

    const median = getMean(numbers);
    const binarySeq = numbers.map(n => n > median ? 1 : 0);
    
    let n1 = 0; // count of 0s
    let n2 = 0; // count of 1s
    let runs = 1; // number of runs

    binarySeq.forEach(v => v === 0 ? n1++ : n2++);

    for (let i = 1; i < binarySeq.length; i++) {
        if (binarySeq[i] !== binarySeq[i-1]) runs++;
    }

    const N = n1 + n2;
    if (N < 2) return { zScore: 0, isRandom: true };

    const expectedRuns = ((2 * n1 * n2) / N) + 1;
    const variance = (2 * n1 * n2 * (2 * n1 * n2 - N)) / (Math.pow(N, 2) * (N - 1));
    
    // Z = (Runs - Expected) / StdDev
    const zScore = variance > 0 ? (runs - expectedRuns) / Math.sqrt(variance) : 0;
    
    // Si |Z| < 1.96, c'est aléatoire à 95% de confiance
    return { zScore, isRandom: Math.abs(zScore) < 1.96 };
};

export const calculateTrendOscillator = (history: DrawResult[], period: number): TrendOscillatorPoint[] => {
    return history.slice(0, period).map(d => ({
        momentum: d.gagnants.reduce((a,b)=>a+b, 0) / 5 - 45
    })).reverse();
};

export const calculateCUSUM = (history: DrawResult[]): any => {
    const sums = history.map(d => d.gagnants.reduce((a,b)=>a+b,0));
    const mean = getMean(sums);
    let cusum = 0;
    return sums.map(s => {
        cusum += (s - mean);
        return cusum;
    });
};

export const calculateACValue = (numbers: number[]): number => {
    const diffs = new Set();
    for(let i=0; i<numbers.length; i++) {
        for(let j=i+1; j<numbers.length; j++) {
            diffs.add(Math.abs(numbers[i] - numbers[j]));
        }
    }
    return diffs.size - (numbers.length - 1);
};

export const calculateRegularity = (history: DrawResult[]): NumberRegularity[] => {
    const res: NumberRegularity[] = [];
    for(let i=1; i<=90; i++) {
        const gaps = [];
        let gap = 0;
        for(const d of history) {
            if(d.gagnants.includes(i)) { gaps.push(gap); gap = 0; } else gap++;
        }
        const avg = gaps.length ? gaps.reduce((a,b)=>a+b,0)/gaps.length : 0;
        const variance = gaps.length ? gaps.reduce((a,b)=>a+Math.pow(b-avg,2),0)/gaps.length : 0;
        res.push({
            number: i,
            currentGap: gap,
            avgGap: avg,
            stdDev: Math.sqrt(variance),
            lastGaps: gaps.slice(0, 5)
        });
    }
    return res;
};

export const detectGameRegime = (history: DrawResult[]): { regime: string; hurst: number } => {
    const h = calculateFractalIndex(history);
    let regime = 'NORMAL';
    if (h > 0.6) regime = 'PERSISTANT'; // Tendance
    else if (h < 0.4) regime = 'ANTI-PERSISTANT'; // Retour moyenne
    else regime = 'RANDOM'; // Hasard pur
    return { regime, hurst: h };
};

export const predictBarycenterShift = (trajectory: BarycenterPoint[]): { x: number; y: number } | null => {
    if(trajectory.length < 2) return null;
    const last = trajectory[trajectory.length-1];
    const prev = trajectory[trajectory.length-2];
    // Projection linéaire simple
    return { x: last.x + (last.x - prev.x), y: last.y + (last.y - prev.y) };
};

export const calculateNetworkCentralityAsync = async (history: DrawResult[]): Promise<{ number: number; normalized: number }[]> => {
    const counts: Record<number, number> = {};
    history.slice(0,50).forEach(d => d.gagnants.forEach(n => counts[n] = (counts[n]||0)+1));
    const max = Math.max(...Object.values(counts));
    return Object.entries(counts).map(([n,c]) => ({ number: Number(n), normalized: (c/max)*100 }));
};

export const detectCommunities = (nodes: number[], matrix: any): Record<number, number> => {
    // Implémentation Louvain simplifiée (Attribution basée sur l'affinité max)
    const comms: Record<number, number> = {};
    nodes.forEach(n => {
        let bestAffinity = 0;
        let bestTarget = n;
        
        const affinities = matrix[n]?.affinities || {};
        Object.entries(affinities).forEach(([target, score]) => {
            if ((score as number) > bestAffinity) {
                bestAffinity = score as number;
                bestTarget = parseInt(target);
            }
        });
        
        // Si affinité forte, on rejoint la communauté de la cible, sinon on reste seul ou modulo
        if (bestAffinity > 0.2) {
             comms[n] = bestTarget % 8; // 8 communautés max
        } else {
             comms[n] = n % 8;
        }
    });
    return comms;
};

export const calculateSuccessionMatrixAsync = async (history: DrawResult[]): Promise<{ matrix: Record<number, Record<number, number>>; totals: Record<number, number> }> => {
    const matrix: Record<number, Record<number, number>> = {};
    const totals: Record<number, number> = {};
    
    for(let i=0; i<history.length-1; i++) {
        const curr = history[i].gagnants;
        const prev = history[i+1].gagnants;
        prev.forEach(p => {
            totals[p] = (totals[p]||0)+1;
            if(!matrix[p]) matrix[p] = {};
            curr.forEach(c => matrix[p][c] = (matrix[p][c]||0)+1);
        });
    }
    return { matrix, totals };
};

export const calculateVolatility = (history: DrawResult[]): { score: number; status: string } => {
    const sums = history.map(d => d.gagnants.reduce((a,b)=>a+b,0));
    const stdDev = getStdDev(sums);
    // On s'attend à un écart-type autour de 40 pour une somme de 5 numéros sur 90
    // Normalisation approximative
    const score = Math.min(100, Math.round((stdDev / 45) * 100));
    return { score, status: score > 60 ? 'Chaos' : score > 30 ? 'Volatile' : 'Stable' };
};

export const calculateShannonEntropy = (history: DrawResult[]): { normalized: number } => {
    const freq: Record<number, number> = {};
    let total = 0;
    history.forEach(d => d.gagnants.forEach(n => { freq[n] = (freq[n]||0)+1; total++; }));
    
    let entropy = 0;
    Object.values(freq).forEach(count => {
        const p = count / total;
        if (p > 0) entropy -= p * Math.log2(p);
    });
    
    const maxEntropy = Math.log2(90); // ~6.49 bits
    return { normalized: entropy / maxEntropy };
};

export const calculateChiSquare = (observed: Record<number, number>, totalObservations: number): ChiSquareMetric => {
    const expected = totalObservations / 90; // Distribution uniforme théorique
    let chiSq = 0;
    
    for(let i=1; i<=90; i++) {
        const obs = observed[i] || 0;
        chiSq += Math.pow(obs - expected, 2) / expected;
    }
    return { score: chiSq };
};

export const calculateBenfordCompliance = (numbers: number[]): { score: number } => {
    const counts = Array(10).fill(0);
    numbers.forEach(n => {
        const leadingDigit = parseInt(n.toString()[0]);
        if(leadingDigit >= 1 && leadingDigit <= 9) counts[leadingDigit]++;
    });
    
    const total = numbers.length;
    let deviation = 0;
    
    for(let d=1; d<=9; d++) {
        const observed = counts[d] / total;
        const expected = Math.log10(1 + 1/d); // Loi de Benford
        deviation += Math.abs(observed - expected);
    }
    
    // Score inversé : 0 deviation = 100% compliance
    const score = Math.max(0, 100 - (deviation * 100 * 2));
    return { score };
};

export const findHistoricalMatches = (current: DrawResult, history: DrawResult[], limit: number = 5): any[] => {
    const matches = history.map(h => {
        if (h.id === current.id) return null;
        // Jaccard Index
        const intersection = current.gagnants.filter(n => h.gagnants.includes(n)).length;
        const union = new Set([...current.gagnants, ...h.gagnants]).size;
        return {
            match: h,
            nextDraw: history[history.findIndex(x => x.id === h.id) - 1] || null, // Le tirage qui a SUIVI historiquement
            similarity: (intersection / union) * 100
        };
    }).filter(x => x !== null && x.similarity > 0);
    
    return matches.sort((a,b) => b!.similarity - a!.similarity).slice(0, limit);
};

export const getNumberDetailedMetrics = async (num: number, history: DrawResult[], spectral: SpectralMetric[], fractal: FractalMetric[]): Promise<DetailedNumberMetrics> => {
    const { hurst } = calculateHurstForNumber(num, history);
    let lastGap = 0;
    for(let i=0; i<history.length; i++) {
        if(history[i].gagnants.includes(num)) break;
        lastGap++;
    }
    
    const freq20 = history.slice(0, 20).filter(d => d.gagnants.includes(num)).length;
    const temp = Math.min(100, freq20 * 20);
    
    return {
        temperature: temp,
        hurst,
        lastGap,
        nextProb: Math.round((1 - Math.exp(-(freq20/20))) * 100), // Poisson approx
        historyGraph: history.slice(0, 20).map(d => d.gagnants.includes(num) ? 1 : 0).reverse(),
        affinity: [], // Rempli par le composant appelant via correlationMatrix
        nemesis: []
    };
};

/**
 * Transformée de Fourier Discrète (DFT) - JavaScript Fallback
 */
const computeDFT = (signal: number[]): number => {
    const N = signal.length;
    if (N < 4) return 0;
    
    let maxPower = 0;
    // On scanne les harmoniques basses
    for (let k = 1; k < 10; k++) {
        let re = 0, im = 0;
        for (let t = 0; t < N; t++) {
            const angle = (2 * Math.PI * k * t) / N;
            re += signal[t] * Math.cos(angle);
            im -= signal[t] * Math.sin(angle);
        }
        const power = (re * re + im * im);
        if (power > maxPower) maxPower = power;
    }
    return Math.min(100, Math.round(Math.sqrt(maxPower) * 20));
};

export const calculateSpectralMetricsAsync = async (history: DrawResult[]): Promise<SpectralMetric[]> => {
    const metrics: SpectralMetric[] = [];
    const limit = Math.min(history.length, 64);
    
    for (let i = 1; i <= 90; i++) {
        const signal = history.slice(0, limit).map(d => d.gagnants.includes(i) ? 1 : 0);
        const energy = computeDFT(signal);
        metrics.push({ number: i, energy, resonance: energy > 70 });
    }
    return metrics;
};

// Placeholder pour ondelettes (complexe en pur JS, souvent via Worker ou API)
export const calculateWaveletMetricsAsync = async (history: DrawResult[]): Promise<SpectralMetric[]> => {
    return calculateSpectralMetricsAsync(history); // Fallback DFT
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
    
    history.slice(0, depth).forEach(d => {
        d.gagnants.forEach(n1 => {
            d.gagnants.forEach(n2 => {
                if(n1 !== n2) {
                    matrix[n1].affinities[n2] = (matrix[n1].affinities[n2] || 0) + (1/depth);
                }
            });
        });
    });
    return matrix;
};

export const calculateDigitalRoot = (n: number): number => {
    return 1 + (n - 1) % 9;
};

export const performKMeansClusteringAsync = async (history: DrawResult[]): Promise<ClusterPoint[]> => {
    const regularity = calculateRegularity(history);
    // Clustering simple basé sur les seuils
    return regularity.map(r => {
        let cluster = 'Neutre';
        if (r.currentGap > 20) cluster = 'Dormeur';
        else if (r.avgGap < 10) cluster = 'Sprinter';
        else if (r.stdDev < 1.5) cluster = 'Marathonien';
        
        return {
            number: r.number,
            x: r.currentGap,
            y: 100 / (r.avgGap || 1), // Pseudo fréquence
            cluster
        };
    });
};
