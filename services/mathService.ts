
import { DrawResult, SpectralMetric, FractalMetric, NumberRegularity, BarycenterPoint, DetailedNumberMetrics, ShadowNumbers, TrendOscillatorPoint, EntropyMetric, ChiSquareMetric, ClusterPoint } from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';

// --- SEEDABLE PRNG (Deterministic) ---
class SeededRandom {
    private seed: number;
    constructor(seed: number) { this.seed = seed; }
    next() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}

// --- WORKER SINGLETON MANAGEMENT ---
let mathWorkerInstance: Worker | null = null;
const workerPendingPromises = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void; timeout: number }>();

const getMathWorker = (): Worker | null => {
    if (typeof Worker === 'undefined') return null;
    
    if (!mathWorkerInstance) {
        mathWorkerInstance = new Worker(new URL('./workers/math.worker.ts', import.meta.url), { type: 'module' });
        
        mathWorkerInstance.onmessage = (e) => {
            const { requestId, result, error } = e.data;
            const promise = workerPendingPromises.get(requestId);
            
            if (promise) {
                clearTimeout(promise.timeout);
                if (error) promise.reject(error);
                else promise.resolve(result);
                workerPendingPromises.delete(requestId);
            }
        };

        mathWorkerInstance.onerror = (e) => {
            console.error("Math Worker Error:", e);
        };
    }
    return mathWorkerInstance;
};

const runWorkerTask = async (task: string, history: DrawResult[], payload?: any): Promise<any> => {
    const worker = getMathWorker();
    if (!worker) return null; // Fallback

    return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36).substring(7);
        const timeout = window.setTimeout(() => {
            if (workerPendingPromises.has(requestId)) {
                workerPendingPromises.delete(requestId);
                reject(new Error(`Worker task ${task} timed out`));
            }
        }, 30000);

        workerPendingPromises.set(requestId, { resolve, reject, timeout });
        worker.postMessage({ requestId, task, history, payload });
    });
};

// --- NOUVEAUX ALGORITHMES AVANCÉS ---

/**
 * Simulation Monte Carlo
 * Simule 10,000 tirages futurs basés sur les probabilités pondérées actuelles (Fréquence + Ecart).
 */
export const runMonteCarloSimulation = (history: DrawResult[]): Record<number, number> => {
    const iterations = 10000;
    const scores: Record<number, number> = {};
    const weights: number[] = new Array(91).fill(0);
    const N = Math.min(history.length, 50);
    
    // Calcul des poids de base (Fréquence récente + Ecart)
    for (let i = 1; i <= 90; i++) {
        let freq = 0;
        let gap = 0;
        let found = false;
        
        for (let j = 0; j < N; j++) {
            if (history[j].gagnants.includes(i)) {
                freq++;
                if (!found) found = true;
            } else if (!found) {
                gap++;
            }
        }
        // Formule de poids : Fréquence * (1 + Gap/20)
        weights[i] = (freq + 1) * (1 + (gap / 20));
    }

    const totalWeight = weights.reduce((a, b) => a + b, 0);

    // Simulation
    for (let i = 0; i < iterations; i++) {
        const draw = new Set<number>();
        while (draw.size < 5) {
            let r = Math.random() * totalWeight;
            for (let num = 1; num <= 90; num++) {
                r -= weights[num];
                if (r <= 0) {
                    draw.add(num);
                    break;
                }
            }
        }
        draw.forEach(num => {
            scores[num] = (scores[num] || 0) + 1;
        });
    }

    // Normalisation 0-100
    const maxScore = Math.max(...Object.values(scores));
    const normalized: Record<number, number> = {};
    for (let i = 1; i <= 90; i++) {
        normalized[i] = ((scores[i] || 0) / maxScore) * 100;
    }
    return normalized;
};

/**
 * LSTM Simplifié (Heuristic Pattern Sequencer)
 * Analyse les micro-séquences de 3 tirages pour prédire la suite.
 * Agit comme une mémoire à court terme pondérée.
 */
export const runLSTMPatternHeuristic = (history: DrawResult[]): Record<number, number> => {
    const scores: Record<number, number> = {};
    if (history.length < 10) return scores;

    // Fenêtre glissante de 3 tirages
    const depth = Math.min(history.length - 3, 50);
    
    for (let i = 0; i < depth; i++) {
        // Séquence actuelle observée : T-1, T-2
        const t1 = history[i+1].gagnants;
        const t2 = history[i+2].gagnants;
        
        // Cible : T (ce qu'on veut prédire)
        const target = history[i].gagnants;
        
        // Poids temporel (plus c'est récent, plus c'est important)
        const timeWeight = 1 - (i / depth);

        // On cherche cette structure dans le passé plus lointain
        for (let j = i + 1; j < depth; j++) {
            const p1 = history[j+1].gagnants;
            const p2 = history[j+2].gagnants;
            
            // Similitude Jaccard entre les contextes (T-1 vs P-1 et T-2 vs P-2)
            const inter1 = t1.filter(n => p1.includes(n)).length;
            const inter2 = t2.filter(n => p2.includes(n)).length;
            
            const similarity = (inter1 + inter2) / 10; // Max 1.0
            
            if (similarity > 0.3) {
                // Si le contexte est similaire, on booste les numéros qui ont suivi (history[j])
                const consequent = history[j].gagnants;
                consequent.forEach(n => {
                    scores[n] = (scores[n] || 0) + (similarity * timeWeight * 10);
                });
            }
        }
    }

    // Normalisation
    const maxVal = Math.max(...Object.values(scores), 1);
    for(let i=1; i<=90; i++) {
        scores[i] = Math.min(100, ((scores[i] || 0) / maxVal) * 100);
    }
    return scores;
};

/**
 * Détection d'Anomalies (Isolation Forest Proxy)
 * Identifie les numéros qui se comportent "bizarrement" (Écarts anormaux, fréquences aberrantes).
 * Dans le loto, une anomalie peut être un signe de sortie imminente (correction statistique).
 */
export const detectAnomalies = (history: DrawResult[]): Record<number, number> => {
    const scores: Record<number, number> = {};
    const reg = calculateRegularity(history);
    
    // Calcul des moyennes globales
    const avgGlobalGap = reg.reduce((a, b) => a + b.avgGap, 0) / reg.length;
    const avgGlobalStd = reg.reduce((a, b) => a + b.stdDev, 0) / reg.length;

    reg.forEach(r => {
        let anomalyScore = 0;
        
        // 1. Écart monstrueux (> 3x la moyenne historique du numéro)
        if (r.currentGap > r.avgGap * 3) anomalyScore += 50;
        
        // 2. Régularité suspecte (StdDev trop faible = trop régulier pour du hasard)
        if (r.stdDev < avgGlobalStd * 0.5 && r.lastGaps.length > 5) anomalyScore += 30;
        
        // 3. Fréquence aberrante (trop chaud ou trop froid par rapport au groupe)
        const zScoreGap = (r.currentGap - avgGlobalGap) / avgGlobalStd;
        if (Math.abs(zScoreGap) > 2.5) anomalyScore += 20;

        scores[r.number] = Math.min(100, anomalyScore);
    });

    return scores;
};

// --- ANCIENNES FONCTIONS (CONSERVÉES) ---

export const calculateACValue = (numbers: number[]): number => {
  const diffs = new Set();
  const sorted = [...numbers].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      diffs.add(Math.abs(sorted[j] - sorted[i]));
    }
  }
  return Math.max(0, diffs.size - (numbers.length - 1));
};

export const calculateDigitalRoot = (n: number): number => {
    return (n - 1) % 9 + 1;
};

export const calculateGapTrend = (history: DrawResult[]): { trend: 'ACCELERATING' | 'DECELERATING' | 'STABLE', velocity: number, avgGapHistory: number[] } => {
    const SAMPLE_SIZE = Math.min(history.length, 12);
    if (SAMPLE_SIZE < 5) return { trend: 'STABLE', velocity: 0, avgGapHistory: [] };

    const gapHistorySeries: number[] = [];

    for (let i = 0; i < SAMPLE_SIZE; i++) {
        const currentDraw = history[i];
        const pastDraws = history.slice(i + 1);
        
        let sumGaps = 0;
        currentDraw.gagnants.forEach(n => {
            let gap = 0;
            for (const past of pastDraws) {
                if (past.gagnants.includes(n)) break;
                gap++;
            }
            sumGaps += gap;
        });
        
        gapHistorySeries.push(sumGaps / 5);
    }

    const chronological = [...gapHistorySeries].reverse();
    const recent = chronological.slice(-5);
    let slope = 0;
    if (recent.length >= 2) {
        const xMean = (recent.length - 1) / 2;
        const yMean = recent.reduce((a, b) => a + b, 0) / recent.length;
        let num = 0, den = 0;
        recent.forEach((y, x) => {
            num += (x - xMean) * (y - yMean);
            den += Math.pow(x - xMean, 2);
        });
        slope = den !== 0 ? num / den : 0;
    }

    let trend: 'ACCELERATING' | 'DECELERATING' | 'STABLE' = 'STABLE';
    if (slope < -0.5) trend = 'ACCELERATING';
    else if (slope > 0.5) trend = 'DECELERATING';

    return { trend, velocity: slope, avgGapHistory: chronological };
};

export const calculatePoissonProbability = (lambda: number, k: number): number => {
    if (lambda <= 0) return 0;
    const ratio = k / lambda;
    let score = 0;
    if (ratio < 0.5) score = 10 + (ratio * 20); 
    else if (ratio >= 0.5 && ratio <= 2.5) score = 30 + ((ratio - 0.5) * 35);
    else if (ratio > 2.5 && ratio <= 4.0) score = 100 - ((ratio - 2.5) * 20);
    else score = Math.max(5, 70 * Math.exp(-(ratio - 4))); 
    return Math.round(Math.max(0, Math.min(100, score)));
};

export const calculateWaveletEnergy = (signal: number[]): number => {
    let data = [...signal];
    let energy = 0;
    for (let level = 0; level < 3; level++) {
        if (data.length < 2) break;
        const nextData = [];
        let detailSum = 0;
        for (let i = 0; i < data.length - 1; i += 2) {
            const avg = (data[i] + data[i+1]) / 2; 
            const detail = (data[i] - data[i+1]) / 2; 
            nextData.push(avg);
            detailSum += Math.abs(detail);
        }
        energy += detailSum * Math.pow(2, 2 - level);
        data = nextData;
    }
    return Math.min(100, Math.round(energy * 50));
};

export const calculateCUSUM = (history: DrawResult[]): { positive: number[], negative: number[], alerts: number[] } => {
    const means = history.map(d => d.gagnants.reduce((a,b)=>a+b,0));
    const target = 227.5; 
    const k = 15; 
    const h = 80; 
    let cp = 0; 
    let cn = 0; 
    const pSeries = [];
    const nSeries = [];
    const alerts = [];
    for (let i = history.length - 1; i >= 0; i--) {
        const val = means[i];
        cp = Math.max(0, cp + (val - target) - k);
        cn = Math.max(0, cn + (target - val) - k);
        pSeries.push(parseFloat(cp.toFixed(1)));
        nSeries.push(parseFloat(cn.toFixed(1))); 
        if (cp > h || cn > h) {
            alerts.push(history.length - 1 - i); 
        }
    }
    return { positive: pSeries, negative: nSeries, alerts };
};

export const calculateTechnicalResistance = (num: number, history: DrawResult[]): number => {
    let resistanceScore = 0;
    let lastGap = 0;
    let gaps: number[] = [];
    const limit = Math.min(history.length, 100);
    for (let i=0; i<limit; i++) {
        if (history[i].gagnants.includes(num)) {
            gaps.push(lastGap);
            lastGap = 0;
        } else {
            lastGap++;
        }
    }
    const currentGap = lastGap;
    if (gaps.length > 2) {
        gaps.forEach(g => {
            const diff = Math.abs(currentGap - g);
            if (diff === 0) resistanceScore += 30; 
            else if (diff <= 2) resistanceScore += 10; 
        });
    }
    return Math.min(100, resistanceScore);
};

export const calculateGravityField = (history: DrawResult[]): Record<number, number> => {
    const gravity: Record<number, number> = {};
    const DECAY = 0.8;
    const G_CONST = 100;
    for(let i=1; i<=90; i++) gravity[i] = 0;
    const limit = Math.min(history.length, 10);
    for (let t = 0; t < limit; t++) {
        const draw = history[t];
        const timeWeight = Math.pow(DECAY, t);
        draw.gagnants.forEach(winner => {
            for (let target = 1; target <= 90; target++) {
                if (target === winner) continue;
                let dist = Math.abs(winner - target);
                if (dist > 45) dist = 90 - dist; 
                if (dist < 10) {
                    const force = (G_CONST / (dist * dist)) * timeWeight;
                    gravity[target] += force;
                }
            }
        });
    }
    return gravity;
};

export const mathService = {
  async fetchAnalytics(drawName: string, lastDate: string): Promise<{ spectral: SpectralMetric[], fractal: FractalMetric[] } | null> {
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
        supabase.functions.invoke('compute-nexus-analytics', { body: { drawName } });
        return null;
    } catch (e) { return null; }
  },
  calculateSpectral(history: DrawResult[]): SpectralMetric[] { return []; },
  calculateFractal(history: DrawResult[]): FractalMetric[] { return []; }
};

export const validateDataIntegrity = (history: DrawResult[]): { valid: boolean; score: number; issues: string[] } => {
    const issues: string[] = [];
    if (history.length < 10) {
        return { valid: false, score: 0, issues: ["Historique critique insuffisant (<10)"] };
    }
    let score = 100;
    const dates = history.slice(0, 10).map(h => new Date(h.date).getTime());
    for(let i=0; i<dates.length-1; i++) {
        if (isNaN(dates[i])) {
            score -= 10;
            issues.push("Dates invalides détectées");
            break;
        }
    }
    return { valid: score > 50, score: Math.max(0, score), issues };
};

export const calculateSpectralMetricsAsync = async (history: DrawResult[]): Promise<SpectralMetric[]> => {
    if (history.length > 0) {
        const cloudData = await mathService.fetchAnalytics(history[0].drawName, history[0].date);
        if (cloudData && cloudData.spectral) return cloudData.spectral;
    }
    try {
        const res = await runWorkerTask('full_analysis', history);
        return res.spectral || [];
    } catch { return []; }
};

export const calculateFractalMetricsAsync = async (history: DrawResult[]): Promise<FractalMetric[]> => {
    if (history.length > 0) {
        const cloudData = await mathService.fetchAnalytics(history[0].drawName, history[0].date);
        if (cloudData && cloudData.fractal) return cloudData.fractal;
    }
    try {
        const res = await runWorkerTask('full_analysis', history);
        return res.fractal || [];
    } catch { return []; }
};

export const calculateSuccessionMatrixAsync = async (history: DrawResult[]) => {
    try {
        const res = await runWorkerTask('succession_matrix', history);
        return res || { matrix: {}, totals: {} };
    } catch { return { matrix: {}, totals: {} }; }
};

export const calculateCorrelationMatrixAsync = async (history: DrawResult[]) => {
    try {
        const res = await runWorkerTask('pearson_matrix', history);
        return res || {};
    } catch { return {}; }
};

export const calculateNetworkCentralityAsync = async (history: DrawResult[]) => {
    try {
        const res = await runWorkerTask('full_analysis', history);
        return res.centrality || [];
    } catch { return []; }
};

export const getProjectionsAsync = async (history: DrawResult[], lastNumbers: number[]) => {
    try {
        return await runWorkerTask('next_projections', history, { lastNumbers });
    } catch { return []; }
};

export const getFollowersAnalysisAsync = async (history: DrawResult[]) => {
    try {
        return await runWorkerTask('followers_analysis', history);
    } catch { return []; }
};

export const calculateRegularity = (history: DrawResult[]): NumberRegularity[] => {
    const regularities: NumberRegularity[] = [];
    const N = Math.min(history.length, 200);
    const sample = history.slice(0, N);
    for (let num = 1; num <= 90; num++) {
        let lastGap = 0;
        const gaps: number[] = [];
        for (let i = 0; i < sample.length; i++) {
            if (sample[i].gagnants.includes(num)) {
                gaps.push(lastGap);
                lastGap = 0;
            } else {
                lastGap++;
            }
        }
        if (gaps.length > 0) {
            const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
            const variance = gaps.reduce((a, b) => a + Math.pow(b - avgGap, 2), 0) / gaps.length;
            const stdDev = Math.sqrt(variance);
            regularities.push({
                number: num,
                avgGap: parseFloat(avgGap.toFixed(1)),
                stdDev: parseFloat(stdDev.toFixed(1)),
                currentGap: lastGap,
                lastGaps: gaps.slice(0, 5),
                nextExpectedIn: Math.max(0, Math.round(avgGap - lastGap))
            });
        } else {
            regularities.push({
                number: num,
                avgGap: N,
                stdDev: 0,
                currentGap: lastGap,
                lastGaps: [],
                nextExpectedIn: 0
            });
        }
    }
    return regularities;
};

export const calculateVolatility = (history: DrawResult[]): { score: number, status: string, trend: string } => {
    const sums = history.slice(0, 20).map(d => d.gagnants.reduce((a, b) => a + b, 0));
    if (sums.length < 2) return { score: 0, status: 'Unknown', trend: 'flat' };
    const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
    const variance = sums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sums.length;
    const stdDev = Math.sqrt(variance);
    const volatilityScore = Math.min(100, Math.round(stdDev)); 
    let status = 'Stable';
    if (volatilityScore > 60) status = 'Chaos';
    else if (volatilityScore > 30) status = 'Volatile';
    const trend = sums[0] > mean ? 'high' : 'low';
    return { score: volatilityScore, status, trend };
};

export const detectGameRegime = (history: DrawResult[]) => {
    const N = Math.min(history.length, 50);
    if(N < 10) return { regime: 'NEUTRE', hurst: 0.5 };
    
    const recent = history.slice(0, 10).flatMap(d => d.gagnants);
    const unique = new Set(recent).size;
    const ratio = unique / 50; 
    const hurstApprox = 1 - ratio; 
    
    let regime = 'NEUTRE';
    if (hurstApprox > 0.6) regime = 'PERSISTANT';
    else if (hurstApprox < 0.4) regime = 'ANTI-PERSISTANT';
    else if (ratio > 0.8) regime = 'CHAOS'; // Beaucoup de numéros uniques = chaos
    
    return { regime, hurst: hurstApprox };
};

export const getNumberDetailedMetrics = async (
    num: number, 
    history: DrawResult[],
    spectral: SpectralMetric[],
    fractal: FractalMetric[]
): Promise<DetailedNumberMetrics> => {
    const reg = calculateRegularity(history).find(r => r.number === num);
    const spec = spectral.find(s => s.number === num);
    const frac = fractal.find(f => f.number === num);
    const corr = await calculateCorrelationMatrixAsync(history);
    const historyGraph = history.slice(0, 20).map(d => d.gagnants.includes(num) ? 1 : 0).reverse();
    const affinities = corr[num]?.affinities || {};
    const topAffinities = Object.entries(affinities)
        .sort((a: any, b: any) => b[1] - a[1])
        .slice(0, 5)
        .map(x => parseInt(x[0]));
    const nemesis = Object.entries(affinities)
        .sort((a: any, b: any) => a[1] - b[1])
        .slice(0, 5)
        .map(x => parseInt(x[0]));
    const temp = (spec?.energy || 0) + (frac?.hurst ? frac.hurst * 50 : 25);
    return {
        temperature: Math.min(100, temp),
        hurst: frac?.hurst || 0.5,
        lastGap: reg?.currentGap || 0,
        avgGap: reg?.avgGap || 0,
        nextProb: Math.max(0, 100 - (reg?.nextExpectedIn || 0) * 10),
        spectralEnergy: spec?.energy || 0,
        stdDev: reg?.stdDev || 0,
        historyGraph,
        affinity: topAffinities,
        nemesis
    };
};

export const getMomentumScores = (history: DrawResult[]): Record<number, number> => {
    const scores: Record<number, number> = {};
    for (let i = 1; i <= 90; i++) {
        const recent = history.slice(0, 10).filter(h => h.gagnants.includes(i)).length;
        const previous = history.slice(10, 20).filter(h => h.gagnants.includes(i)).length;
        scores[i] = (recent - previous) * 20 + 50; 
    }
    return scores;
};

export const getVelocityScores = (history: DrawResult[]): Record<number, number> => {
    const scores: Record<number, number> = {};
    const regularity = calculateRegularity(history);
    regularity.forEach(r => {
        const lastGap = r.lastGaps[0] || r.avgGap;
        const denominator = lastGap === 0 ? 0.5 : lastGap;
        const velocity = (r.avgGap - r.currentGap) / denominator;
        scores[r.number] = Math.min(100, Math.max(0, 50 + velocity * 50));
    });
    return scores;
};

export const calculateHurstForNumber = (num: number, history: DrawResult[]): { hurst: number } => {
    const N = Math.min(history.length, 50);
    let occurrences = 0;
    history.slice(0, N).forEach(d => { if(d.gagnants.includes(num)) occurrences++; });
    const freq = occurrences / N;
    const h = 0.5 + (freq - 0.05) * 5; 
    return { hurst: Math.max(0, Math.min(1, h)) };
};

export const calculateShadowNumbers = (draw: DrawResult): ShadowNumbers => {
    const sum = draw.gagnants.reduce((a,b) => a+b, 0);
    return {
        sumModulo: sum % 90,
        firstCompliment: 91 - draw.gagnants[0],
        lastCompliment: 91 - draw.gagnants[draw.gagnants.length - 1],
        gapLink: Math.abs(draw.gagnants[0] - draw.gagnants[1]),
        goldenNumber: Math.round(sum * 0.618) % 90 + 1
    };
};

export const calculateRunsTest = (winners: number[]): { runs: number; zScore: number; isRandom: boolean } => {
    if (winners.length < 2) return { runs: 0, zScore: 0, isRandom: true };
    const median = 45.5;
    const binary = winners.map(n => n > median);
    let runs = 1;
    for(let i=1; i<binary.length; i++) if(binary[i] !== binary[i-1]) runs++;
    const n1 = binary.filter(v => v).length;
    const n2 = binary.length - n1;
    if (n1 === 0 || n2 === 0) return { runs, zScore: 0, isRandom: false };
    const expectedRuns = ((2 * n1 * n2) / binary.length) + 1;
    const variance = (2 * n1 * n2 * (2 * n1 * n2 - binary.length)) / (Math.pow(binary.length, 2) * (binary.length - 1));
    const zScore = variance > 0 ? (runs - expectedRuns) / Math.sqrt(variance) : 0;
    return { runs, zScore, isRandom: Math.abs(zScore) < 1.96 };
};

export const calculateTrendOscillator = (history: DrawResult[], limit: number): TrendOscillatorPoint[] => {
    return history.slice(0, limit).map((d, i) => {
        const past = history.slice(i + 1, i + 11);
        const pastAvg = past.length > 0 ? past.reduce((acc, curr) => acc + curr.gagnants.reduce((a,b)=>a+b,0), 0) / (past.length * 5) : 45.5;
        const currentAvg = d.gagnants.reduce((a,b)=>a+b,0) / 5;
        return {
            drawIndex: i,
            momentum: currentAvg - pastAvg,
            signal: Math.sin(i * 0.5) * 10
        };
    });
};

export const predictBarycenterShift = (trajectory: BarycenterPoint[]): BarycenterPoint => {
    if (trajectory.length < 2) return trajectory[0] || { x: 4.5, y: 4 };
    const last = trajectory[trajectory.length - 1];
    const prev = trajectory[trajectory.length - 2];
    return { x: last.x + (last.x - prev.x) * 0.5, y: last.y + (last.y - prev.y) * 0.5 };
};

export const calculateShannonEntropy = (history: DrawResult[]): EntropyMetric => {
    const freq: Record<number, number> = {};
    let total = 0;
    history.forEach(d => d.gagnants.forEach(n => {
        freq[n] = (freq[n] || 0) + 1;
        total++;
    }));
    let entropy = 0;
    if (total === 0) return { normalized: 0 };
    Object.values(freq).forEach(count => {
        const p = count / total;
        if (p > 0) entropy -= p * Math.log2(p);
    });
    return { normalized: entropy / Math.log2(90) };
};

export const calculateChiSquare = (freqMap: Record<number, number>, total: number): ChiSquareMetric => {
    let chi = 0;
    const expected = total / 90;
    if (expected === 0) return { score: 0 };
    for(let i=1; i<=90; i++) {
        const observed = freqMap[i] || 0;
        chi += Math.pow(observed - expected, 2) / expected;
    }
    return { score: parseFloat(chi.toFixed(2)) };
};

export const calculateFractalIndex = (history: DrawResult[]): number => {
    const regime = detectGameRegime(history);
    return regime.hurst;
};

export const performKMeansClusteringAsync = async (history: DrawResult[]): Promise<ClusterPoint[]> => {
    const reg = calculateRegularity(history);
    return reg.map(r => {
        const freq = history.slice(0, 30).filter(h => h.gagnants.includes(r.number)).length;
        let cluster = 'Neutre';
        if (r.currentGap > 25) cluster = 'Dormeur';
        else if (freq >= 4 && r.avgGap < 15) cluster = 'Sprinter';
        else if (r.stdDev < 1.5) cluster = 'Marathonien';
        return {
            number: r.number,
            x: r.currentGap,
            y: freq,
            cluster
        };
    });
};

export const detectCommunities = (nums: number[], correlationMatrix: any): Record<number, number> => {
    const comms: Record<number, number> = {};
    nums.forEach((n, i) => {
        const affs = correlationMatrix[n]?.affinities || {};
        const entries = Object.entries(affs);
        if (entries.length > 0) {
            const bestFriend = entries.sort((a: any, b: any) => b[1] - a[1])[0];
            comms[n] = bestFriend ? (parseInt(bestFriend[0]) % 8) : (i % 8);
        } else {
            comms[n] = i % 8;
        }
    });
    return comms;
};

export const calculateBenfordCompliance = (numbers: number[]): ChiSquareMetric => {
    const firstDigits = numbers.map(n => parseInt(n.toString()[0]));
    const counts: Record<number, number> = {};
    firstDigits.forEach(d => counts[d] = (counts[d] || 0) + 1);
    let chi = 0;
    for(let d=1; d<=9; d++) {
        const observed = (counts[d] || 0) / Math.max(1, numbers.length);
        const expected = Math.log10(1 + 1/d);
        chi += Math.pow(observed - expected, 2) / expected;
    }
    return { score: Math.max(0, 100 - chi * 100) };
};

export const findHistoricalMatches = (draw: DrawResult, history: DrawResult[], limit: number = 5) => {
    return history
      .map((h, index) => ({ h, index }))
      .filter(({ h }) => h.id !== draw.id)
      .map(({ h, index }) => {
        const intersection = draw.gagnants.filter(n => h.gagnants.includes(n)).length;
        const similarity = (intersection / 5) * 100;
        const nextDraw = index > 0 ? history[index - 1] : null;
        return {
            match: h,
            nextDraw,
            similarity
        };
      })
      .filter(item => item.similarity >= 40)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
};
