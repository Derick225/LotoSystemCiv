import { DrawResult } from '../../types';

export type FluxMathAction = 
  | { type: 'CALCULATE_METRICS', payload: { draws: DrawResult[] } };

export interface SpectrumData {
  num: number;
  count: number;
  ratio: number;
  zScore: number;
}

export interface FluxMathResult {
  entropyStats: { entropy: number; normalized: number; maxEntropy: number };
  hurstStats: { hurst: number; interpretation: string; color: string };
  speedStats: { topoSpeed: number; meanSum: number; stdSum: number };
  spectrumStats: { raw: SpectrumData[]; maxCount: number; avgOcc: number };
  topCorrelations: { pair: [number, number]; count: number }[];
  trajectoryPoints: { label: string; sum: number; normY: number }[];
}

const calculateShannonEntropy = (draws: DrawResult[]): { entropy: number; normalized: number; maxEntropy: number } => {
    if (draws.length === 0) return { entropy: 0, normalized: 0, maxEntropy: 0 };
    
    const frequencies: { [key: number]: number } = {};
    let totalOccurrences = 0;
    
    draws.forEach(draw => {
        draw.gagnants.forEach(n => {
            frequencies[n] = (frequencies[n] || 0) + 1;
            totalOccurrences++;
        });
    });

    let entropy = 0;
    const uniqueNumbersCount = Object.keys(frequencies).length;
    
    for (const n in frequencies) {
        const p = frequencies[n] / totalOccurrences;
        if (p > 0) {
            entropy -= p * Math.log2(p);
        }
    }

    const maxEntropy = uniqueNumbersCount > 1 ? Math.log2(uniqueNumbersCount) : 0;
    const normalized = maxEntropy > 0 ? (entropy / maxEntropy) : 0;

    return { entropy, normalized, maxEntropy };
};

const calculateHurstExponent = (draws: DrawResult[]): { hurst: number; interpretation: string; color: string } => {
    if (draws.length < 8) {
        return { hurst: 0.5, interpretation: 'Neutre (Série insuffisante)', color: 'text-slate-400' };
    }
    
    const series = [...draws].reverse().map(d => d.gagnants.reduce((sum, n) => sum + n, 0));
    const N = series.length;
    
    const mean = series.reduce((a, b) => a + b, 0) / N;
    const variance = series.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / N;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) {
        return { hurst: 0.5, interpretation: 'Neutre (Variance nulle)', color: 'text-slate-400' };
    }

    let cumul = 0;
    const cumulSeries: number[] = [];
    for (let i = 0; i < N; i++) {
        cumul += (series[i] - mean);
        cumulSeries.push(cumul);
    }

    const maxVal = Math.max(...cumulSeries);
    const minVal = Math.min(...cumulSeries);
    const R = maxVal - minVal;

    if (R === 0) {
        return { hurst: 0.5, interpretation: 'Neutre', color: 'text-slate-400' };
    }

    const hurst = Math.log(R / stdDev) / Math.log(N);
    const boundedHurst = Math.min(Math.max(hurst, 0.01), 0.99);

    let interpretation = 'Aléatoire (Marche Brownienne)';
    let color = 'text-amber-400';

    if (boundedHurst > 0.58) {
        interpretation = 'Persistant (Tendances fortes)';
        color = 'text-emerald-400';
    } else if (boundedHurst < 0.42) {
        interpretation = 'Anti-persistant (Retour à la moyenne)';
        color = 'text-indigo-400';
    }

    return { hurst: boundedHurst, interpretation, color };
};

const calculateStateMetrics = (draws: DrawResult[]) => {
    if (draws.length < 2) return { topoSpeed: 0, meanSum: 0, stdSum: 0 };
    
    let totalDistance = 0;
    const sums = draws.map(d => d.gagnants.reduce((a, b) => a + b, 0));
    const meanSum = sums.reduce((a, b) => a + b, 0) / draws.length;
    const variance = sums.reduce((a, b) => a + Math.pow(b - meanSum, 2), 0) / draws.length;
    const stdSum = Math.sqrt(variance);

    for (let i = 0; i < draws.length - 1; i++) {
        const a = [...draws[i].gagnants].sort((x, y) => x - y);
        const b = [...draws[i + 1].gagnants].sort((x, y) => x - y);
        let sumSquares = 0;
        const len = Math.min(a.length, b.length);
        for (let j = 0; j < len; j++) {
            sumSquares += Math.pow(a[j] - b[j], 2);
        }
        totalDistance += Math.sqrt(sumSquares);
    }

    const topoSpeed = totalDistance / (draws.length - 1);
    return { topoSpeed, meanSum, stdSum };
};

const calculateNumbersSpectrum = (draws: DrawResult[]) => {
    const counts: { [key: number]: number } = {};
    draws.forEach(draw => {
        draw.gagnants.forEach(n => {
            counts[n] = (counts[n] || 0) + 1;
        });
    });

    const values = Object.values(counts);
    if (values.length === 0) return { raw: [], maxCount: 1, avgOcc: 0 };
    
    const sum = values.reduce((a, b) => a + b, 0);
    const avgOcc = sum / values.length;
    const maxCount = Math.max(...values, 1);

    const sortedSpectrum = Object.entries(counts)
        .map(([num, count]) => ({
            num: parseInt(num),
            count,
            ratio: count / sum,
            zScore: avgOcc > 0 ? (count - avgOcc) / (Math.sqrt(avgOcc) || 1) : 0
        }))
        .sort((a, b) => b.count - a.count);

    return {
        raw: sortedSpectrum,
        maxCount,
        avgOcc
    };
};

const extractTopCorrelations = (draws: DrawResult[]) => {
    const pairFreqs: { [key: string]: { pair: [number, number]; count: number } } = {};
    
    draws.forEach(draw => {
        const nums = [...draw.gagnants].sort((a, b) => a - b);
        for (let i = 0; i < nums.length; i++) {
            for (let j = i + 1; j < nums.length; j++) {
                const key = `${nums[i]}-${nums[j]}`;
                if (!pairFreqs[key]) {
                    pairFreqs[key] = { pair: [nums[i], nums[j]], count: 0 };
                }
                pairFreqs[key].count++;
            }
        }
    });

    return Object.values(pairFreqs)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
};

const calculateTrajectoryPoints = (draws: DrawResult[]) => {
    if (draws.length === 0) return [];
    
    const items = [...draws].slice(0, 24).reverse();
    const sums = items.map(d => d.gagnants.reduce((a, b) => a + b, 0));
    const minS = Math.min(...sums, 1);
    const maxS = Math.max(...sums, 2);
    const range = maxS - minS || 1;

    return items.map((draw) => {
        const sum = draw.gagnants.reduce((a, b) => a + b, 0);
        
        // Simple manual date formatting to avoid bringing in complex dependencies in worker
        const d = new Date(draw.date);
        const label = !isNaN(d.getTime()) 
          ? `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
          : draw.date.split('/').slice(0,2).join('/');
          
        return {
            label,
            sum,
            normY: 100 - ((sum - minS) / range * 80 + 10) 
        };
    });
};

self.onmessage = (e: MessageEvent<FluxMathAction>) => {
  const { type, payload } = e.data;
  if (type === 'CALCULATE_METRICS') {
    const { draws } = payload;
    const result: FluxMathResult = {
      entropyStats: calculateShannonEntropy(draws),
      hurstStats: calculateHurstExponent(draws),
      speedStats: calculateStateMetrics(draws),
      spectrumStats: calculateNumbersSpectrum(draws),
      topCorrelations: extractTopCorrelations(draws),
      trajectoryPoints: calculateTrajectoryPoints(draws)
    };
    self.postMessage({ type: 'METRICS_RESULT', payload: result });
  }
};
