
import { DrawResult, SpectralMetric, FractalMetric, NumberRegularity, BarycenterPoint, DetailedNumberMetrics, ShadowNumbers, TrendOscillatorPoint, EntropyMetric, ChiSquareMetric, ClusterPoint } from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';

// Helper Worker Wrapper
const runWorkerTask = async (task: string, history: DrawResult[]): Promise<any> => {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./workers/math.worker.ts', import.meta.url), { type: 'module' });
        const requestId = Math.random().toString(36).substring(7);
        
        worker.onmessage = (e) => {
            if (e.data.requestId === requestId) {
                if (e.data.error) reject(e.data.error);
                else resolve(e.data.result);
                worker.terminate();
            }
        };
        worker.postMessage({ requestId, task, history });
    });
};

export const calculateACValue = (numbers: number[]): number => {
  const diffs = new Set();
  const sorted = [...numbers].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      diffs.add(Math.abs(sorted[j] - sorted[i]));
    }
  }
  return diffs.size - (numbers.length - 1);
};

export const calculateDigitalRoot = (n: number): number => {
    return (n - 1) % 9 + 1;
};

export const mathService = {
  async fetchAnalytics(drawName: string, date: string): Promise<{ spectral: SpectralMetric[], fractal: FractalMetric[] } | null> {
    if (!isSupabaseConfigured()) return null;
    try {
        const { data, error } = await supabase
          .from('draw_analytics')
          .select('spectral, fractal')
          .eq('draw_name', drawName)
          .eq('date', date)
          .single();
        if (error || !data) return null;
        return { spectral: data.spectral, fractal: data.fractal };
    } catch (e) { return null; }
  },

  // Fallback synchrone rapide
  calculateSpectral(history: DrawResult[]): SpectralMetric[] {
    const N = history.length;
    if (N < 2) return [];
    return Array.from({ length: 90 }, (_, i) => {
        const n = i + 1;
        const signal = history.map(d => (d.gagnants.includes(n) ? 1 : 0));
        const mean = signal.reduce((a, b) => a + b, 0) / N;
        let maxPower = 0;
        const limit = Math.floor(N / 2);
        for (let k = 1; k < limit; k++) {
            let re = 0, im = 0;
            for (let t = 0; t < N; t++) {
                const angle = (2 * Math.PI * k * t) / N;
                re += (signal[t] - mean) * Math.cos(angle);
                im -= (signal[t] - mean) * Math.sin(angle);
            }
            const power = (re * re + im * im) / N;
            if (power > maxPower) maxPower = power;
        }
        return {
            number: n,
            energy: Math.min(100, Math.round(maxPower * 600)),
            resonance: (maxPower * 600) > 75,
            dominantPeriod: parseFloat((N / (maxPower * 10 || 1)).toFixed(1))
        };
    }).sort((a, b) => b.energy - a.energy);
  },

  calculateFractal(history: DrawResult[]): FractalMetric[] {
    const N = history.length;
    if (N < 10) return [];
    return Array.from({ length: 90 }, (_, i) => {
        const n = i + 1;
        const signal = history.map(d => (d.gagnants.includes(n) ? 1 : 0));
        const mean = signal.reduce((a, b) => a + b, 0) / N;
        const x = signal.map(v => v - mean);
        let cumsum = 0;
        const y = x.map(v => (cumsum += v, cumsum));
        const R = Math.max(...y) - Math.min(...y);
        const S = Math.sqrt(x.reduce((a, v) => a + v * v, 0) / N) || 1;
        const h = Math.log(R / S) / Math.log(N);
        const hurst = Math.max(0, Math.min(1, isNaN(h) ? 0.5 : h));
        return {
            number: n,
            hurst: hurst,
            regime: hurst > 0.58 ? 'PERSISTANT' : hurst < 0.42 ? 'ANTI-PERSISTANT' : 'RANDOM'
        };
    });
  }
};

export const calculateSpectralMetricsAsync = async (history: DrawResult[]): Promise<SpectralMetric[]> => {
    try {
        const res = await runWorkerTask('full_analysis', history);
        return res.spectral || mathService.calculateSpectral(history);
    } catch {
        return mathService.calculateSpectral(history);
    }
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
        const velocity = (r.avgGap - r.currentGap) / (lastGap || 1);
        scores[r.number] = Math.min(100, Math.max(0, 50 + velocity * 50));
    });
    return scores;
};

export const calculateHurstForNumber = (num: number, history: DrawResult[]): { hurst: number } => {
    const N = history.length;
    const signal = history.map(d => (d.gagnants.includes(num) ? 1 : 0));
    const mean = signal.reduce((a, b) => a + b, 0) / N;
    const x = signal.map(v => v - mean);
    let cumsum = 0;
    const y = x.map(v => (cumsum += v, cumsum));
    const R = Math.max(...y) - Math.min(...y);
    const S = Math.sqrt(x.reduce((a, v) => a + v * v, 0) / N) || 1;
    const h = Math.log(R / S) / Math.log(N);
    return { hurst: isNaN(h) ? 0.5 : Math.max(0, Math.min(1, h)) };
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
    const expectedRuns = ((2 * n1 * n2) / binary.length) + 1;
    const variance = (2 * n1 * n2 * (2 * n1 * n2 - binary.length)) / (Math.pow(binary.length, 2) * (binary.length - 1));
    const zScore = (runs - expectedRuns) / (Math.sqrt(variance) || 1);
    
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
    Object.values(freq).forEach(count => {
        const p = count / total;
        if (p > 0) entropy -= p * Math.log2(p);
    });
    return { normalized: entropy / Math.log2(90) };
};

export const calculateChiSquare = (freqMap: Record<number, number>, total: number): ChiSquareMetric => {
    let chi = 0;
    const expected = total / 90;
    for(let i=1; i<=90; i++) {
        const observed = freqMap[i] || 0;
        chi += Math.pow(observed - expected, 2) / (expected || 1);
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
        const bestFriend = Object.entries(affs).sort((a: any, b: any) => b[1] - a[1])[0];
        comms[n] = bestFriend ? (parseInt(bestFriend[0]) % 8) : (i % 8);
    });
    return comms;
};

export const calculateBenfordCompliance = (numbers: number[]): ChiSquareMetric => {
    const firstDigits = numbers.map(n => parseInt(n.toString()[0]));
    const counts: Record<number, number> = {};
    firstDigits.forEach(d => counts[d] = (counts[d] || 0) + 1);
    let chi = 0;
    for(let d=1; d<=9; d++) {
        const observed = (counts[d] || 0) / numbers.length;
        const expected = Math.log10(1 + 1/d);
        chi += Math.pow(observed - expected, 2) / expected;
    }
    return { score: Math.max(0, 100 - chi * 100) };
};

export const findHistoricalMatches = (draw: DrawResult, history: DrawResult[], limit: number = 5) => {
    return history
      .filter(h => h.id !== draw.id)
      .map(h => {
        const intersection = draw.gagnants.filter(n => h.gagnants.includes(n)).length;
        const similarity = (intersection / 5) * 100;
        return {
            match: h,
            nextDraw: history[history.indexOf(h) - 1] || null,
            similarity
        };
      })
      .filter(m => m.similarity >= 40)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
};

export const calculateVolatility = (history: DrawResult[]) => {
    if (history.length < 2) return { score: 0, status: 'Stable', trend: 'steady' };
    const sums = history.map(d => d.gagnants.reduce((a,b)=>a+b, 0));
    const avg = sums.reduce((a,b)=>a+b,0) / sums.length;
    const variance = sums.reduce((a,v)=>a + Math.pow(v-avg, 2), 0) / sums.length;
    const stdDev = Math.sqrt(variance);
    return {
        score: Math.min(100, Math.round((stdDev / 50) * 100)),
        status: stdDev > 60 ? 'Chaos' : stdDev > 35 ? 'Volatile' : 'Stable',
        trend: sums[0] > avg ? 'up' : 'down'
    };
};

export const calculateRegularity = (history: DrawResult[]): NumberRegularity[] => {
    return Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const gaps: number[] = [];
        let lastIdx = -1;
        history.forEach((d, idx) => {
            if(d.gagnants.includes(num)) {
                if(lastIdx !== -1) gaps.push(idx - lastIdx);
                lastIdx = idx;
            }
        });
        const currentGap = history.findIndex(d => d.gagnants.includes(num));
        const avgGap = gaps.length > 0 ? gaps.reduce((a,b)=>a+b,0)/gaps.length : 18;
        const variance = gaps.reduce((a,v)=>a + Math.pow(v-avgGap, 2), 0) / (gaps.length || 1);
        return {
            number: num,
            avgGap: parseFloat(avgGap.toFixed(2)),
            stdDev: parseFloat(Math.sqrt(variance).toFixed(2)),
            currentGap: currentGap === -1 ? history.length : currentGap,
            lastGaps: gaps.slice(0, 5),
            nextExpectedIn: Math.max(0, Math.round(avgGap - currentGap))
        };
    });
};

export const detectGameRegime = (history: DrawResult[]) => {
    const hurst = calculateFractalIndex(history);
    return { 
        hurst, 
        regime: hurst > 0.60 ? 'PERSISTANT' : hurst < 0.40 ? 'CHAOS' : 'NOMINAL' 
    };
};

export const calculateCorrelationMatrixAsync = async (history: DrawResult[]) => {
    try {
        const res = await runWorkerTask('pearson_matrix', history);
        return res || {};
    } catch {
        return {}; // Fallback empty
    }
};

export const calculateNetworkCentralityAsync = async (history: DrawResult[]) => {
    const { matrix, totals } = await calculateSuccessionMatrixAsync(history);
    return Array.from({length: 90}, (_, i) => {
        const n = i+1;
        const outWeight = Object.values(matrix[n] || {}).reduce((a,b)=>a+(b as number), 0);
        return {
            number: n,
            centrality: outWeight,
            normalized: Math.min(100, Math.round((outWeight / (history.length * 5)) * 1000))
        };
    });
};

export const calculateSuccessionMatrixAsync = async (history: DrawResult[]) => {
    const matrix: Record<number, Record<number, number>> = {};
    const totals: Record<number, number> = {};
    
    if (!history || history.length < 2) return { matrix, totals };

    for (let i = 0; i < history.length - 1; i++) {
        const current = history[i].gagnants;
        const prev = history[i+1].gagnants;
        prev.forEach(p => {
            if (!matrix[p]) matrix[p] = {};
            totals[p] = (totals[p] || 0) + 1;
            current.forEach(c => {
                matrix[p][c] = (matrix[p][c] || 0) + 1;
            });
        });
    }
    return { matrix, totals };
};

export const getNumberDetailedMetrics = async (num: number, history: DrawResult[], spectral: SpectralMetric[], fractal: FractalMetric[]): Promise<DetailedNumberMetrics> => {
    const reg = calculateRegularity(history).find(r => r.number === num);
    const spec = spectral.find(s => s.number === num);
    const frac = fractal.find(f => f.number === num);
    
    return {
        temperature: Math.round((spec?.energy || 0) * 0.7 + (reg?.currentGap || 0)),
        hurst: frac?.hurst || 0.5,
        lastGap: reg?.currentGap || 0,
        avgGap: reg?.avgGap || 18,
        nextProb: Math.round(50 + (reg ? (reg.currentGap / reg.avgGap) * 20 : 0)),
        spectralEnergy: spec?.energy || 0,
        stdDev: reg?.stdDev || 2.5,
        historyGraph: history.slice(0, 20).map(d => d.gagnants.includes(num) ? 1 : 0).reverse(),
        affinity: Object.entries((await calculateCorrelationMatrixAsync(history.slice(0, 50)))[num]?.affinities || {})
            .sort((a:any, b:any) => b[1] - a[1]).slice(0, 3).map(e => parseInt(e[0])),
        nemesis: []
    };
};
