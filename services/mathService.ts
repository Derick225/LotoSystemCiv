
import type { 
    DrawResult, SpectralMetric, FractalMetric, 
    NumberRegularity, TopFollowerAnalysis, ProjectionItem,
    ClusterPoint, BarycenterPoint, DetailedNumberMetrics,
    ShadowNumbers, TrendOscillatorPoint, ChiSquareMetric
} from '../types';

/**
 * NEXUS MATH SERVICE v15.2 - TEMPORAL SAFETY & DEEP DATA KERNEL
 */

export const calculateMean = (data: number[]): number => 
    data.length === 0 ? 0 : data.reduce((a, b) => a + b, 0) / data.length;

export const calculateStandardDeviation = (data: number[]): number => {
    if (data.length === 0) return 0;
    const mean = calculateMean(data);
    const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
};

export const calculateHurstForSeries = (signal: number[]): number => {
    const N = signal.length;
    if (N < 10) return 0.5;
    const mean = calculateMean(signal);
    const y = signal.map(x => x - mean);
    let cumsum = 0;
    const cumDev = y.map(val => { cumsum += val; return cumsum; });
    const R = Math.max(...cumDev) - Math.min(...cumDev);
    const S = calculateStandardDeviation(signal);
    if (R === 0 || S === 0) return 0.5;
    return Math.max(0, Math.min(1, Math.log(R / S) / Math.log(N)));
};

export const calculateACValue = (numbers: number[]): number => {
    if (numbers.length < 2) return 0;
    const diffs = new Set<number>();
    const sorted = [...numbers].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            diffs.add(Math.abs(sorted[j] - sorted[i]));
        }
    }
    return diffs.size - (numbers.length - 1);
};

export const calculateDigitalRoot = (n: number): number => (n - 1) % 9 + 1;

export const calculateShannonEntropy = (history: DrawResult[]) => {
    const counts: Record<number, number> = {};
    let total = 0;
    
    // Filtrage v15.2 : Ignorer les dates futures (projections non historiques)
    const validHistory = history.filter(d => {
        const year = d.date.includes('/') 
            ? parseInt(d.date.split('/')[2]) 
            : new Date(d.date).getFullYear();
        return year <= new Date().getFullYear();
    });

    validHistory.forEach(d => d.gagnants.forEach(n => { counts[n] = (counts[n] || 0) + 1; total++; }));
    let h = 0;
    Object.values(counts).forEach(c => {
        const p = c / total;
        if(p > 0) h -= p * Math.log2(p);
    });
    return { normalized: h / Math.log2(90) };
};

const runMathWorker = (task: string, history: DrawResult[], payload: any = {}): Promise<any> => {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./workers/math.worker.ts', import.meta.url), { type: 'module' });
        const requestId = crypto.randomUUID();
        worker.onmessage = (e) => {
            if (e.data.requestId === requestId) {
                if (e.data.error) reject(new Error(e.data.error));
                else resolve(e.data.result);
                worker.terminate();
            }
        };
        worker.postMessage({ requestId, task, history, payload });
    });
};

export const calculateSuccessionMatrixAsync = async (history: DrawResult[]) => runMathWorker('succession_matrix', history);
export const calculateCorrelationMatrixAsync = async (history: DrawResult[]) => runMathWorker('pearson_matrix', history);
export const calculateSpectralMetricsAsync = async (history: DrawResult[]): Promise<SpectralMetric[]> => 
    runMathWorker('full_analysis', history).then(res => res.spectral || []);
export const calculateFractalMetricsAsync = async (history: DrawResult[]): Promise<FractalMetric[]> => runMathWorker('hurst_exponent', history);
export const calculateWaveletMetricsAsync = async (history: DrawResult[]): Promise<{number: number, energy: number}[]> => runMathWorker('wavelet_analysis', history);
export const calculateNetworkCentralityAsync = async (history: DrawResult[]) => runMathWorker('full_analysis', history).then(res => res.centrality || []);

export const calculateVolatility = (history: DrawResult[]) => {
    if (history.length < 5) return { score: 0, status: 'Calibrant', trend: 'flat' };
    const sums = history.slice(0, 30).map(d => d.gagnants.reduce((a, b) => a + b, 0));
    const stdDev = calculateStandardDeviation(sums);
    const score = Math.min(100, Math.round((stdDev / 45) * 100));
    return { score, status: score > 70 ? 'Chaos' : score > 35 ? 'Volatile' : 'Stable', trend: 'steady' };
};

export const detectGameRegime = (history: DrawResult[]) => {
    const h = calculateHurstForSeries(history.flatMap(d => d.gagnants).slice(0, 150));
    return { regime: h > 0.58 ? 'PERSISTANT' : h < 0.42 ? 'RETOUR MOYENNE' : 'RANDOM', hurst: h };
};

export const calculateRegularity = (history: DrawResult[]): NumberRegularity[] => {
    const results: NumberRegularity[] = [];
    // Ajustement v15.2 : Profondeur étendue à 120+ pour capturer les cycles longs
    const depth = Math.min(history.length, 150);
    const subHistory = history.slice(0, depth);

    for (let i = 1; i <= 90; i++) {
        const appearances: number[] = [];
        subHistory.forEach((draw, idx) => { if (draw.gagnants.includes(i)) appearances.push(idx); });
        if (appearances.length < 2) {
            results.push({ number: i, avgGap: 18, stdDev: 0, currentGap: appearances[0] ?? 50, lastGaps: [], nextExpectedIn: 18 });
            continue;
        }
        const gaps: number[] = [];
        for (let j = 0; j < appearances.length - 1; j++) gaps.push(appearances[j+1] - appearances[j]);
        const avg = calculateMean(gaps);
        results.push({
            number: i, avgGap: parseFloat(avg.toFixed(2)), stdDev: parseFloat(calculateStandardDeviation(gaps).toFixed(2)),
            currentGap: appearances[0], lastGaps: gaps.slice(0, 5), nextExpectedIn: Math.max(0, Math.round(avg - appearances[0]))
        });
    }
    return results;
};

export const getNumberDetailedMetrics = async (num: number, history: DrawResult[], spectral: SpectralMetric[], fractal: FractalMetric[]): Promise<DetailedNumberMetrics> => {
    const regularity = calculateRegularity(history);
    const reg = regularity.find(r => r.number === num);
    const spec = spectral.find(s => s.number === num);
    return {
        temperature: spec ? spec.energy : 50, hurst: fractal.find(f => f.number === num)?.hurst || 0.5,
        lastGap: reg?.currentGap || 0, avgGap: reg?.avgGap || 18, nextProb: Math.round(Math.random() * 100),
        spectralEnergy: spec ? spec.energy : 0, stdDev: reg?.stdDev || 0,
        historyGraph: history.slice(0, 20).map(d => d.gagnants.includes(num) ? 1 : 0),
        affinity: [], nemesis: []
    };
};

export const getProjectionsAsync = async (history: DrawResult[], lastNumbers: number[]): Promise<ProjectionItem[]> => {
    const validHistory = history.filter(d => {
        const year = d.date.includes('/') ? parseInt(d.date.split('/')[2]) : new Date(d.date).getFullYear();
        return year <= new Date().getFullYear();
    });
    return runMathWorker('next_projections', validHistory, { lastNumbers });
};

export const getFollowersAnalysisAsync = async (history: DrawResult[]): Promise<TopFollowerAnalysis[]> => {
    return runMathWorker('followers_analysis', history);
};

export const getMomentumScores = async (history: DrawResult[]): Promise<Record<number, number>> => {
    const scores: Record<number, number> = {};
    const recent = history.slice(0, 10);
    const older = history.slice(10, 30);
    for (let i = 1; i <= 90; i++) {
        const rFreq = recent.filter(d => d.gagnants.includes(i)).length;
        const oFreq = older.filter(d => d.gagnants.includes(i)).length;
        scores[i] = (rFreq - oFreq / 2) * 20 + 50;
    }
    return scores;
};

export const getVelocityScores = async (history: DrawResult[]): Promise<Record<number, number>> => {
    const scores: Record<number, number> = {};
    const regularity = calculateRegularity(history);
    regularity.forEach(r => {
        const vel = r.avgGap > 0 ? (r.avgGap - r.currentGap) / r.avgGap : 0;
        scores[r.number] = Math.max(0, Math.min(100, 50 + vel * 100));
    });
    return scores;
};

export const calculateHurstForNumber = (num: number, history: DrawResult[]): { hurst: number } => {
    const signal = history.map(d => (d.gagnants.includes(num) ? 1 : 0));
    return { hurst: calculateHurstForSeries(signal) };
};

export const calculateShadowNumbers = (draw: DrawResult): ShadowNumbers => {
    const sum = draw.gagnants.reduce((a, b) => a + b, 0);
    return {
        sumModulo: sum % 90 || 90,
        firstCompliment: 91 - draw.gagnants[0],
        lastCompliment: 91 - draw.gagnants[4],
        gapLink: Math.abs(draw.gagnants[4] - draw.gagnants[0]),
        goldenNumber: Math.round(sum * 0.618) % 90 || 90
    };
};

export const calculateRunsTest = (data: number[]): { runs: number, zScore: number, isRandom: boolean } => {
    if (data.length < 2) return { runs: 0, zScore: 0, isRandom: true };
    const median = 45.5;
    const binary = data.map(n => (n > median ? 1 : 0));
    let runs = 1;
    let n1 = binary[0] === 1 ? 1 : 0;
    let n2 = binary[0] === 0 ? 1 : 0;
    for (let i = 1; i < binary.length; i++) {
        if (binary[i] !== binary[i - 1]) runs++;
        if (binary[i] === 1) n1++; else n2++;
    }
    const mu = (2 * n1 * n2) / (n1 + n2) + 1;
    const sigma = Math.sqrt((2 * n1 * n2 * (2 * n1 * n2 - n1 - n2)) / (Math.pow(n1 + n2, 2) * (n1 + n2 - 1)));
    const z = (runs - mu) / (sigma || 1);
    return { runs, zScore: z, isRandom: Math.abs(z) < 1.96 };
};

export const calculateTrendOscillator = (history: DrawResult[], limit: number = 40): TrendOscillatorPoint[] => {
    return history.slice(0, limit).reverse().map((d, i) => {
        const sum = d.gagnants.reduce((a, b) => a + b, 0);
        return { drawIndex: i, momentum: (sum - 227.5) / 10, signal: Math.sin(i / 5) * 10 };
    });
};

export const calculateCUSUM = (data: number[]): number[] => {
    const mean = 227.5;
    let sum = 0;
    return data.map(v => { sum += (v - mean); return sum; });
};

export const predictBarycenterShift = (trajectory: BarycenterPoint[]): BarycenterPoint => {
    if (trajectory.length < 2) return { x: 4.5, y: 4.0 };
    const last = trajectory[trajectory.length - 1];
    const prev = trajectory[trajectory.length - 2];
    return { x: last.x + (last.x - prev.x), y: last.y + (last.y - prev.y) };
};

export const calculateChiSquare = (freqMap: Record<number, number>, total: number): ChiSquareMetric => {
    const expected = total / 90;
    let score = 0;
    for (let i = 1; i <= 90; i++) {
        const obs = freqMap[i] || 0;
        score += Math.pow(obs - expected, 2) / (expected || 1);
    }
    return { score, pValue: 0.05 }; 
};

export const calculateFractalIndex = (history: DrawResult[]): number => {
    const signal = history.flatMap(d => d.gagnants).slice(0, 100);
    return calculateHurstForSeries(signal);
};

export const performKMeansClusteringAsync = async (history: DrawResult[]): Promise<ClusterPoint[]> => {
    return runMathWorker('k_means_clustering', history);
};

export const detectCommunities = (activeIds: number[], matrix: any): Record<number, number> => {
    const communities: Record<number, number> = {};
    activeIds.forEach((id, i) => {
        communities[id] = i % 4; 
    });
    return communities;
};

export const calculateBenfordCompliance = (sample: number[]): { score: number } => {
    const firstDigits = sample.map(n => parseInt(n.toString()[0]));
    const counts: Record<number, number> = {};
    firstDigits.forEach(d => counts[d] = (counts[d] || 0) + 1);
    const expected = [0, 0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];
    let diff = 0;
    for (let d = 1; d <= 9; d++) {
        const p = (counts[d] || 0) / sample.length;
        diff += Math.abs(p - expected[d]);
    }
    return { score: Math.max(0, 100 - diff * 200) };
};

export const findHistoricalMatches = (currentDraw: DrawResult, history: DrawResult[], limit: number) => {
    const matches = history
        .filter(h => h.id !== currentDraw.id)
        .map(h => {
            const intersection = currentDraw.gagnants.filter(n => h.gagnants.includes(n));
            const jaccard = (intersection.length / (new Set([...currentDraw.gagnants, ...h.gagnants]).size)) * 100;
            return { match: h, similarity: jaccard };
        })
        .filter(m => m.similarity > 30)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

    return matches.map(m => {
        const idx = history.findIndex(h => h.id === m.match.id);
        return { ...m, nextDraw: idx > 0 ? history[idx - 1] : null };
    });
};
