
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { invokeEdgeFunction } from './apiClient';
import type { 
    DrawResult, SpectralMetric, FractalMetric, 
    NumberRegularity, TopFollowerAnalysis, ProjectionItem,
    ClusterPoint, PositionalRegime, BrierCalibration, BarycenterPoint, DetailedNumberMetrics,
    ShadowNumbers, TrendOscillatorPoint
} from '../types';
import { 
    calculateMean, 
    calculateStandardDeviation, 
    calculateHurstForSeries 
} from '../utils/mathUtils';

export { calculateMean, calculateStandardDeviation, calculateHurstForSeries };

/**
 * Exécute une tâche lourde via Web Worker pour ne pas geler l'UI.
 */
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
        worker.onerror = (err) => { reject(err); worker.terminate(); };
        worker.postMessage({ requestId, task, history, payload });
    });
};

// --- SERVICES DE SCORING ---

export const getMomentumScores = async (history: DrawResult[]): Promise<Record<number, number>> => {
    const scores: Record<number, number> = {};
    const depth = Math.min(history.length, 25);
    // Plus le numéro sort récemment, plus son momentum est élevé (Décroissance linéaire)
    history.slice(0, depth).forEach((d, i) => {
        const weight = (depth - i) / depth;
        d.gagnants.forEach(n => scores[n] = (scores[n] || 0) + (weight * 100));
    });
    // Normalisation 0-100
    const max = Math.max(...Object.values(scores), 1);
    Object.keys(scores).forEach(n => scores[Number(n)] = Math.round((scores[Number(n)] / max) * 100));
    return scores;
};

export const getVelocityScores = async (history: DrawResult[]): Promise<Record<number, number>> => {
    const regularity = calculateRegularity(history);
    const scores: Record<number, number> = {};
    regularity.forEach(r => {
        // Vélocité = Distance moyenne / (Distance actuelle + 1)
        // Si vélocité > 1, le numéro est en avance sur son cycle
        const velocity = r.avgGap / (r.currentGap + 1);
        scores[r.number] = Math.min(100, Math.round(velocity * 25));
    });
    return scores;
};

// --- ANALYSE DE RÉGIME ---

export const calculateVolatility = (history: DrawResult[]) => {
    if (!history || history.length < 5) return { score: 0, status: 'Initialisation', trend: 'steady' };
    const sums = history.slice(0, 30).map(d => d.gagnants.reduce((a, b) => a + b, 0));
    const avg = calculateMean(sums);
    const variance = sums.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / sums.length;
    const stdDev = Math.sqrt(variance);
    const score = Math.min(100, Math.round((stdDev / 45) * 100));
    return { score, status: score > 70 ? 'Chaos' : score > 35 ? 'Volatile' : 'Stable', trend: 'steady' };
};

export const detectGameRegime = (history: DrawResult[]) => {
    const volatility = calculateVolatility(history);
    if (volatility.score > 65) return { regime: 'CHAOS', hurst: 0.45 };
    const h = calculateHurstForSeries(history.flatMap(d => d.gagnants).slice(0, 150));
    return { regime: h > 0.58 ? 'PERSISTANT' : h < 0.42 ? 'RETOUR MOYENNE' : 'STABLE', hurst: h };
};

// --- ADDED FIX: calculatePositionalRegimes member ---
/**
 * Calcule le régime Hurst pour chaque position de tirage (1er sorti, 2ème, etc. après tri).
 */
export const calculatePositionalRegimes = (history: DrawResult[]): PositionalRegime[] => {
    const results: PositionalRegime[] = [];
    for (let pos = 0; pos < 5; pos++) {
        // On extrait le n-ième numéro de chaque tirage après tri croissant pour une analyse structurelle
        const series = history.map(d => [...d.gagnants].sort((a, b) => a - b)[pos]);
        const h = calculateHurstForSeries(series);
        
        let regime: 'CHAOTIC' | 'PERSISTENT' | 'BIMODAL' | 'STABLE' = 'STABLE';
        if (h > 0.6) regime = 'PERSISTENT';
        else if (h < 0.4) regime = 'CHAOTIC';
        
        results.push({
            position: pos + 1,
            hurst: h,
            regime
        });
    }
    return results;
};

export const calculateShannonEntropy = (history: DrawResult[]) => {
    const counts: Record<number, number> = {};
    let total = 0;
    history.forEach(d => d.gagnants.forEach(n => { counts[n] = (counts[n] || 0) + 1; total++; }));
    let h = 0;
    Object.values(counts).forEach(c => {
        const p = c / total;
        h -= p * Math.log2(p);
    });
    const maxH = Math.log2(90);
    return { normalized: h / maxH };
};

// --- TESTS STATISTIQUES ---

export const calculateRunsTest = (series: number[]) => {
    if (series.length < 2) return { runs: 0, zScore: 0, isRandom: true };
    const median = 45.5;
    const binary = series.map(n => n > median);
    let runs = 1;
    for (let i = 1; i < binary.length; i++) {
        if (binary[i] !== binary[i - 1]) runs++;
    }
    const n1 = binary.filter(v => v).length;
    const n2 = binary.length - n1;
    const n = n1 + n2;
    if (n1 === 0 || n2 === 0) return { runs, zScore: 0, isRandom: true };
    const expectedRuns = ((2 * n1 * n2) / n) + 1;
    const variance = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));
    const zScore = variance > 0 ? (runs - expectedRuns) / Math.sqrt(variance) : 0;
    return { runs, zScore, isRandom: Math.abs(zScore) < 1.96 };
};

export const calculateBenfordCompliance = (numbers: number[]) => {
    const firstDigits = numbers.map(n => parseInt(n.toString()[0])).filter(d => !isNaN(d) && d > 0);
    const total = firstDigits.length;
    if (total === 0) return { score: 100 };
    const counts: Record<number, number> = {};
    firstDigits.forEach(d => counts[d] = (counts[d] || 0) + 1);
    let sumDiff = 0;
    for (let d = 1; d <= 9; d++) {
        const observed = (counts[d] || 0) / total;
        const expected = Math.log10(1 + 1/d);
        sumDiff += Math.abs(observed - expected);
    }
    return { score: Math.max(0, 100 - sumDiff * 100) };
};

export const calculateCUSUM = (history: DrawResult[]) => {
    const sums = history.map(d => d.gagnants.reduce((a, b) => a + b, 0));
    const target = 227.5;
    const positive = [0];
    const negative = [0];
    const alerts: number[] = [];
    sums.reverse().forEach((s, i) => {
        const pos = Math.max(0, positive[i] + (s - target) - 5);
        const neg = Math.max(0, negative[i] + (target - s) - 5);
        positive.push(pos);
        negative.push(neg);
        if (pos > 80 || neg > 80) alerts.push(i);
    });
    return { positive: positive.slice(1), negative: negative.slice(1), alerts };
};

// --- SERVICES ASYNCHRONES (WORKER) ---

export const calculateCorrelationMatrixAsync = async (history: DrawResult[]) => {
    return await runMathWorker('pearson_matrix', history);
};

export const calculateSpectralMetricsAsync = async (history: DrawResult[]): Promise<SpectralMetric[]> => {
    return await runMathWorker('full_analysis', history).then(res => res.spectral || []);
};

export const calculateFractalMetricsAsync = async (history: DrawResult[]): Promise<FractalMetric[]> => {
    return await runMathWorker('hurst_exponent', history);
};

export const calculateNetworkCentralityAsync = async (history: DrawResult[]) => {
    return await runMathWorker('full_analysis', history).then(res => res.centrality || []);
};

export const performKMeansClusteringAsync = async (history: DrawResult[]): Promise<ClusterPoint[]> => {
    return await runMathWorker('k_means_clustering', history);
};

export const calculateSuccessionMatrixAsync = async (history: DrawResult[]) => {
    return await runMathWorker('succession_matrix', history);
};

export const getProjectionsAsync = async (history: DrawResult[], lastNumbers: number[]): Promise<ProjectionItem[]> => {
    return await runMathWorker('next_projections', history, { lastNumbers });
};

export const getFollowersAnalysisAsync = async (history: DrawResult[]): Promise<TopFollowerAnalysis[]> => {
    return await runMathWorker('followers_analysis', history);
};

// --- UTILITAIRES DE CALCUL ---

export const calculateRegularity = (history: DrawResult[]): NumberRegularity[] => {
    return Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const occurrences: number[] = [];
        history.forEach((d, idx) => { if (d.gagnants.includes(num)) occurrences.push(idx); });
        const currentGap = occurrences.length > 0 ? occurrences[0] : history.length;
        const gaps: number[] = [];
        for (let j = 0; j < occurrences.length - 1; j++) gaps.push(occurrences[j+1] - occurrences[j]);
        const avgGap = gaps.length > 0 ? calculateMean(gaps) : 18;
        const stdDev = gaps.length > 0 ? calculateStandardDeviation(gaps) : 0;
        return {
            number: num,
            avgGap: parseFloat(avgGap.toFixed(2)),
            stdDev: parseFloat(stdDev.toFixed(2)),
            currentGap,
            lastGaps: gaps.slice(0, 5),
            nextExpectedIn: Math.max(0, Math.round(avgGap - currentGap))
        };
    });
};

export const calculateACValue = (numbers: number[]): number => {
    if (numbers.length < 2) return 0;
    const diffs = new Set<number>();
    const sorted = [...numbers].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            diffs.add(sorted[j] - sorted[i]);
        }
    }
    return diffs.size - (numbers.length - 1);
};

export const calculateDigitalRoot = (n: number): number => (n - 1) % 9 + 1;

export const calculateShadowNumbers = (result: DrawResult): ShadowNumbers => {
    const sum = result.gagnants.reduce((a, b) => a + b, 0);
    const sorted = [...result.gagnants].sort((a, b) => a - b);
    return {
        sumModulo: sum % 90,
        firstCompliment: 91 - sorted[0],
        lastCompliment: 91 - sorted[4],
        gapLink: Math.abs(sorted[1] - sorted[0]),
        goldenNumber: Math.round((sum * 0.618) % 90)
    };
};

export const calculateTrendOscillator = (history: DrawResult[], limit: number = 40): TrendOscillatorPoint[] => {
    return history.slice(0, limit).reverse().map((d, i) => {
        const sum = d.gagnants.reduce((a, b) => a + b, 0);
        return { drawIndex: i, momentum: sum - 227.5, signal: sum - 227.5 };
    });
};

export const calculateFractalIndex = (history: DrawResult[]) => {
    const globalSeries = history.flatMap(h => h.gagnants);
    return calculateHurstForSeries(globalSeries.slice(0, 500));
};

export const calculateHurstForNumber = (num: number, history: DrawResult[]) => {
    const signal = history.map(h => h.gagnants.includes(num) ? 1 : 0);
    return { hurst: calculateHurstForSeries(signal) };
};

export const calculateChiSquare = (freqMap: Record<number, number>, totalObservations: number) => {
    const expected = totalObservations / 90;
    let score = 0;
    for (let i = 1; i <= 90; i++) {
        const observed = freqMap[i] || 0;
        score += Math.pow(observed - expected, 2) / (expected || 1);
    }
    return { score };
};

export const detectCommunities = (numbers: number[], matrix: any): Record<number, number> => {
    const communities: Record<number, number> = {};
    numbers.forEach((n, i) => {
        communities[n] = i % 8; // Simulation simple pour la topologie
    });
    return communities;
};

export const getNumberDetailedMetrics = async (num: number, history: DrawResult[], spectral: SpectralMetric[], fractal: FractalMetric[]): Promise<DetailedNumberMetrics> => {
    const reg = calculateRegularity(history).find(r => r.number === num)!;
    const spec = spectral.find(s => s.number === num);
    const frac = fractal.find(f => f.number === num);
    return {
        lastGap: reg.currentGap,
        avgGap: reg.avgGap,
        nextProb: Math.round((1 - Math.exp(-1 / (reg.avgGap || 18))) * 100),
        spectralEnergy: spec?.energy || 0,
        temperature: (spec?.energy || 0) > 70 ? 85 : 40,
        hurst: frac?.hurst || 0.5,
        historyGraph: history.slice(0, 20).map(d => d.gagnants.includes(num) ? 1 : 0),
        affinity: [],
        nemesis: [],
        stdDev: reg.stdDev
    };
};

export const predictBarycenterShift = (trajectory: BarycenterPoint[]): BarycenterPoint => {
    if (trajectory.length < 2) return trajectory[0] || { x: 4.5, y: 4 };
    const last = trajectory[trajectory.length - 1];
    const prev = trajectory[trajectory.length - 2];
    return {
        x: Math.max(0, Math.min(9, last.x + (last.x - prev.x))),
        y: Math.max(0, Math.min(8, last.y + (last.y - prev.y)))
    };
};

export const findHistoricalMatches = (currentDraw: DrawResult, history: DrawResult[], limit: number = 4) => {
    return history
        .filter(h => h.id !== currentDraw.id)
        .map(h => {
            const hits = currentDraw.gagnants.filter(n => h.gagnants.includes(n)).length;
            const similarity = (hits / 5) * 100;
            return { match: h, nextDraw: history[history.indexOf(h) - 1] || null, similarity };
        })
        .filter(r => r.similarity >= 40)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
};
