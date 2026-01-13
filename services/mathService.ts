
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { invokeEdgeFunction } from './apiClient';
import type { 
    DrawResult, SpectralMetric, FractalMetric, 
    NumberRegularity, TopFollowerAnalysis, ProjectionItem,
    ClusterPoint
} from '../types';

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
        const simplifiedHistory = history.map(h => ({ gagnants: h.gagnants, date: h.date, machine: h.machine }));
        worker.postMessage({ requestId, task, history: simplifiedHistory, payload });
    });
};

export const calculateMean = (data: number[]) => data.reduce((a, b) => a + b, 0) / (data.length || 1);

export const calculateStandardDeviation = (data: number[]) => {
    const mean = calculateMean(data);
    const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (data.length || 1);
    return Math.sqrt(variance);
};

export const calculateDigitalRoot = (n: number): number => (n - 1) % 9 + 1;

export const calculateACValue = (numbers: number[]): number => {
    const diffs = new Set<number>();
    const sorted = [...numbers].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            diffs.add(Math.abs(sorted[j] - sorted[i]));
        }
    }
    return Math.max(0, diffs.size - (numbers.length - 1));
};

export const calculateRegularity = (history: DrawResult[]): NumberRegularity[] => {
    const regularities: NumberRegularity[] = [];
    const limit = Math.min(history.length, 100);
    const subset = history.slice(0, limit);
    for (let n = 1; n <= 90; n++) {
        let currentGap = 0;
        let gaps: number[] = [];
        let lastSeenIndex = -1;
        for (let i = 0; i < subset.length; i++) {
            if (subset[i].gagnants.includes(n)) {
                if (lastSeenIndex === -1) currentGap = i;
                else gaps.push(i - lastSeenIndex - 1);
                lastSeenIndex = i;
            }
        }
        if (lastSeenIndex === -1) currentGap = subset.length;
        const avgGap = gaps.length > 0 ? calculateMean(gaps) : currentGap;
        const stdDev = gaps.length > 0 ? calculateStandardDeviation(gaps) : 0;
        regularities.push({
            number: n,
            avgGap: parseFloat(avgGap.toFixed(2)),
            stdDev: parseFloat(stdDev.toFixed(2)),
            currentGap,
            lastGaps: gaps.slice(0, 5),
            nextExpectedIn: Math.max(0, Math.round(avgGap - currentGap))
        });
    }
    return regularities;
};

export const calculateGravityField = (history: DrawResult[]): Record<number, number> => {
    const gravity: Record<number, number> = {};
    const decay = 0.95;
    for(let i=1; i<=90; i++) gravity[i] = 0;
    history.slice(0, 50).reverse().forEach((draw, idx) => {
        const weight = Math.pow(decay, 50 - idx);
        draw.gagnants.forEach(n => {
            gravity[n] = (gravity[n] || 0) + weight;
            if (n > 1) gravity[n-1] = (gravity[n-1] || 0) + (weight * 0.2);
            if (n < 90) gravity[n+1] = (gravity[n+1] || 0) + (weight * 0.2);
        });
    });
    const maxVal = Math.max(...Object.values(gravity));
    for(let i=1; i<=90; i++) gravity[i] = (gravity[i] / maxVal) * 10;
    return gravity;
};

export const validateDataIntegrity = (history: DrawResult[]): { score: number, issues: string[] } => {
    let score = 100;
    const issues = [];
    if (history.length < 50) { score -= 20; issues.push("Historique court (<50)"); }
    if (history.length > 1) {
        const d1 = new Date(history[0].date).getTime();
        const d2 = new Date(history[1].date).getTime();
        if (isNaN(d1) || isNaN(d2)) { score -= 10; issues.push("Dates invalides"); }
    }
    return { score, issues };
};

export const calculateWaveletEnergy = (signal: number[]): number => {
    let energy = 0;
    for (let i = 0; i < signal.length - 1; i += 2) {
        const detail = (signal[i] - signal[i+1]) / 2;
        energy += detail * detail;
    }
    return Math.min(100, energy * 100);
};

export const calculateTechnicalResistance = (num: number, history: DrawResult[]): number => {
    const recent = history.slice(0, 10);
    let resistance = 0;
    recent.forEach(d => {
        if (d.gagnants.includes(num - 1)) resistance += 10;
        if (d.gagnants.includes(num + 1)) resistance += 10;
        if (d.gagnants.includes(num)) resistance -= 20;
    });
    return Math.max(0, Math.min(100, resistance));
};

export const calculatePoissonProbability = (lambda: number, k: number): number => {
    const factorial = (n: number): number => n <= 1 ? 1 : n * factorial(n - 1);
    if (k > 20) return 0;
    const p = (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
    return Math.min(100, p * 100 * 5);
};

export const calculateVolatility = (history: DrawResult[]) => {
    if (history.length < 10) return { score: 0, status: 'Unknown', trend: 'Flat' };
    const sums = history.map(d => d.gagnants.reduce((a, b) => a + b, 0));
    const stdDev = calculateStandardDeviation(sums);
    const score = Math.min(100, Math.round(stdDev));
    const recentMean = calculateMean(sums.slice(0, 5));
    const globalMean = calculateMean(sums);
    const trend = recentMean > globalMean ? 'Rising' : 'Falling';
    return { score, status: score > 60 ? 'Chaos' : score > 30 ? 'Volatile' : 'Stable', trend };
};

export const calculateGapTrend = (history: DrawResult[]) => ({ trend: 'STABLE', velocity: 0 });

export const calculateShannonEntropy = (history: DrawResult[]): { normalized: number } => {
    if (history.length === 0) return { normalized: 0 };
    const freq: Record<number, number> = {};
    let total = 0;
    history.forEach(d => d.gagnants.forEach(n => { freq[n] = (freq[n] || 0) + 1; total++; }));
    let entropy = 0;
    Object.values(freq).forEach(count => {
        const p = count / total;
        if (p > 0) entropy -= p * Math.log2(p);
    });
    const maxEntropy = Math.log2(90);
    return { normalized: entropy / maxEntropy };
};

// Implémentation réelle de la loi de Benford (Premier Chiffre)
export const calculateBenfordCompliance = (numbers: number[]) => {
    if (numbers.length === 0) return { score: 0 };
    
    // Distribution théorique de Benford pour les chiffres 1-9
    const benfordProps = {
        1: 0.301, 2: 0.176, 3: 0.125, 4: 0.097, 5: 0.079,
        6: 0.067, 7: 0.058, 8: 0.051, 9: 0.046
    };

    const counts: Record<number, number> = {};
    let totalValid = 0;

    numbers.forEach(n => {
        // On prend le premier chiffre significatif (1-9)
        const str = n.toString();
        const firstDigit = parseInt(str[0]);
        if (firstDigit >= 1 && firstDigit <= 9) {
            counts[firstDigit] = (counts[firstDigit] || 0) + 1;
            totalValid++;
        }
    });

    if (totalValid < 10) return { score: 50 }; // Echantillon trop faible

    let chiSquare = 0;
    for (let d = 1; d <= 9; d++) {
        const observed = counts[d] || 0;
        const expected = totalValid * (benfordProps as any)[d];
        chiSquare += Math.pow(observed - expected, 2) / expected;
    }

    // Normalisation approximative du Chi2 vers un score 0-100
    // Un Chi2 de 0 est parfait (100%). Un Chi2 > 20 est très divergent.
    const compliance = Math.max(0, 100 - (chiSquare * 4));
    
    return { score: Math.round(compliance) };
};

export const runMonteCarloSimulationAsync = async (history: DrawResult[]): Promise<Record<number, number>> => {
    return await runMathWorker('monte_carlo_simulation', history);
};

export const runLSTMPatternHeuristic = (history: DrawResult[]): Record<number, number> => {
    const scores: Record<number, number> = {};
    history.slice(0, 10).forEach((d, i) => { d.gagnants.forEach(n => { scores[n] = (scores[n] || 0) + (10 - i); }); });
    return scores;
};

export const detectAnomalies = (history: DrawResult[]): Record<number, number> => {
    const scores: Record<number, number> = {};
    if (history.length < 3) return scores;
    for (let n = 1; n <= 90; n++) {
        if (history[0].gagnants.includes(n) && history[1].gagnants.includes(n) && history[2].gagnants.includes(n)) {
            scores[n] = 100;
        }
    }
    return scores;
};

export const detectGameRegime = (history: DrawResult[]) => {
    const volatility = calculateVolatility(history);
    return { hurst: 0.5, regime: volatility.status.toUpperCase() };
};

export const predictBarycenterShift = (trajectory: any[]) => {
    if (trajectory.length < 2) return { x: 0, y: 0 };
    const last = trajectory[0];
    const prev = trajectory[1];
    return { x: last.x + (last.x - prev.x), y: last.y + (last.y - prev.y) };
};

export const calculateChiSquare = (observed: Record<number, number>, expectedTotal: number) => {
    const expected = expectedTotal / 90;
    let chiSq = 0;
    for (let i = 1; i <= 90; i++) {
        const obs = observed[i] || 0;
        chiSq += Math.pow(obs - expected, 2) / expected;
    }
    return { score: chiSq };
};

export const calculateFractalIndex = (history: DrawResult[]) => 0.5;

export const findHistoricalMatches = (target: DrawResult, history: DrawResult[], minMatches: number = 3) => {
    const results = [];
    const targetSet = new Set(target.gagnants);
    for (let i = 0; i < history.length - 1; i++) {
        const h = history[i];
        if (h.id === target.id) continue;
        const intersection = h.gagnants.filter(n => targetSet.has(n));
        if (intersection.length >= minMatches) {
            results.push({ match: h, nextDraw: history[i-1], similarity: (intersection.length / 5) * 100 });
        }
    }
    return results.sort((a,b) => b.similarity - a.similarity);
};

export const getNumberDetailedMetrics = async (number: number, history: DrawResult[], spectral: SpectralMetric[], fractal: FractalMetric[]) => {
    const stat = calculateRegularity(history).find(r => r.number === number);
    const spec = spectral.find(s => s.number === number);
    const frac = fractal.find(f => f.number === number);
    const affinity: number[] = [];
    history.slice(0, 50).forEach(d => {
        if (d.gagnants.includes(number)) {
            d.gagnants.forEach(n => { if (n !== number && !affinity.includes(n)) affinity.push(n); });
        }
    });
    const historyGraph = history.slice(0, 20).map(d => d.gagnants.includes(number) ? 1 : 0).reverse();
    return {
        temperature: (spec?.energy || 0),
        hurst: frac?.hurst || 0.5,
        lastGap: stat?.currentGap || 0,
        avgGap: stat?.avgGap || 0,
        stdDev: stat?.stdDev || 0,
        nextProb: 50,
        spectralEnergy: spec?.energy || 0,
        historyGraph,
        affinity: affinity.slice(0, 5),
        nemesis: []
    };
};

export const calculateShadowNumbers = (draw: DrawResult) => {
    if (!draw) return { sumModulo: 0, firstCompliment: 0, lastCompliment: 0, gapLink: 0, goldenNumber: 0 };
    const sorted = [...draw.gagnants].sort((a,b) => a-b);
    const sum = sorted.reduce((a,b)=>a+b,0);
    return {
        sumModulo: sum % 90,
        firstCompliment: 91 - sorted[0],
        lastCompliment: 91 - sorted[sorted.length-1],
        gapLink: Math.abs(sorted[1] - sorted[0]),
        goldenNumber: Math.round(sum * 0.618) % 90 || 90
    };
};

export const calculateRunsTest = (data: number[]) => {
    const median = 45;
    let runs = 1;
    let n1 = 0; let n2 = 0;
    for (let i = 0; i < data.length; i++) {
        const val = data[i];
        if (val > median) n1++; else n2++;
        if (i > 0) {
            const prev = data[i-1];
            if ((val > median && prev <= median) || (val <= median && prev > median)) runs++;
        }
    }
    const expRuns = ((2 * n1 * n2) / (n1 + n2)) + 1;
    const variance = (2 * n1 * n2 * (2 * n1 * n2 - n1 - n2)) / (Math.pow(n1 + n2, 2) * (n1 + n2 - 1));
    const z = (runs - expRuns) / Math.sqrt(variance);
    return { runs, zScore: z, isRandom: Math.abs(z) < 1.96 };
};

export const calculateTrendOscillator = (history: DrawResult[], period: number = 20) => {
    const sums = history.map(d => d.gagnants.reduce((a,b)=>a+b,0)).reverse();
    const osc = [];
    for(let i=period; i<sums.length; i++) {
        const slice = sums.slice(i-period, i);
        const ma = calculateMean(slice);
        osc.push({ drawIndex: i, momentum: sums[i] - ma, signal: ma });
    }
    return osc;
};

export const calculateCUSUM = (history: DrawResult[]) => {
    const sums = history.map(d => d.gagnants.reduce((a,b)=>a+b,0)).reverse();
    const mean = 227.5;
    const pos: number[] = [0]; const neg: number[] = [0]; const alerts: number[] = [];
    for(let i=0; i<sums.length; i++) {
        const val = sums[i];
        const sp = Math.max(0, pos[pos.length-1] + val - mean - 10);
        const sn = Math.max(0, neg[neg.length-1] - val + mean - 10);
        pos.push(sp); neg.push(sn);
        if (sp > 80 || sn > 80) alerts.push(i);
    }
    return { positive: pos.slice(1), negative: neg.slice(1), alerts };
};

export const calculateSpectralMetricsAsync = async (history: DrawResult[]): Promise<SpectralMetric[]> => {
    const res = await runMathWorker('full_analysis', history);
    return res.spectral || [];
};

export const calculateFractalMetricsAsync = async (history: DrawResult[]): Promise<FractalMetric[]> => {
    const res = await runMathWorker('hurst_exponent', history);
    return res || [];
};

export const calculateCorrelationMatrixAsync = async (history: DrawResult[]) => {
    return await runMathWorker('pearson_matrix', history);
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

export const calculateNetworkCentralityAsync = async (history: DrawResult[]) => {
    const res = await runMathWorker('full_analysis', history);
    return res.centrality || [];
};

export const performKMeansClusteringAsync = async (history: DrawResult[]): Promise<ClusterPoint[]> => {
    return await runMathWorker('k_means_clustering', history);
};

export const detectCommunities = (nodes: number[], correlationMatrix: any) => {
    const comms: Record<number, number> = {};
    nodes.forEach(n => comms[n] = Math.floor(Math.random() * 5));
    return comms;
};

export const getVelocityScores = async (history: DrawResult[]) => {
    const scores: Record<number, number> = {};
    for(let i=1; i<=90; i++) scores[i] = Math.random() * 100;
    return scores;
};

export const getMomentumScores = async (history: DrawResult[]) => {
    const scores: Record<number, number> = {};
    for(let i=1; i<=90; i++) scores[i] = Math.random() * 100;
    return scores;
};

export const calculateHurstForNumber = (num: number, history: DrawResult[]) => {
    return { hurst: 0.5 };
};

export const mathService = {
  fetchAnalytics: async (drawName: string, lastDate: string): Promise<{ spectral: SpectralMetric[], fractal: FractalMetric[] } | null> => {
    if (!isSupabaseConfigured()) return null;
    try {
        const { data } = await supabase
          .from('draw_analytics')
          .select('*')
          .eq('draw_name', drawName)
          .eq('date', lastDate)
          .single();
        if (data) {
            return { spectral: data.spectral, fractal: data.fractal };
        }
        invokeEdgeFunction('compute-nexus-analytics', { body: { drawName } });
        return null;
    } catch (e) { return null; }
  },
  calculateSpectral: (history: DrawResult[]) => [],
  calculateFractal: (history: DrawResult[]) => []
};
