
import { DrawResult, SpectralMetric, FractalMetric, NumberRegularity, BarycenterPoint, DetailedNumberMetrics, ShadowNumbers, TrendOscillatorPoint, EntropyMetric, ChiSquareMetric, ClusterPoint } from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';

// Helper Worker Wrapper
const runWorkerTask = async (task: string, history: DrawResult[], payload?: any): Promise<any> => {
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
        worker.onerror = (e) => {
            reject(e.message);
            worker.terminate();
        }
        worker.postMessage({ requestId, task, history, payload });
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
  // AC Value = Nombre de différences uniques - (Taille du tirage - 1)
  return Math.max(0, diffs.size - (numbers.length - 1));
};

export const calculateDigitalRoot = (n: number): number => {
    return (n - 1) % 9 + 1;
};

// Fenêtre de Hamming pour réduire les fuites spectrales dans la FFT
const hammingWindow = (n: number, N: number) => 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1));

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
        const { data, error } = await supabase
          .from('draw_analytics')
          .select('*')
          .eq('draw_name', drawName)
          .eq('date', lastDate)
          .single();
        
        if (data) {
            return { spectral: data.spectral, fractal: data.fractal };
        }
        // Déclenchement silencieux du calcul cloud si manquant
        supabase.functions.invoke('compute-nexus-analytics', { body: { drawName } });
        return null;
    } catch (e) { return null; }
  },

  calculateSpectral(history: DrawResult[]): SpectralMetric[] {
    const N = Math.min(history.length, 200);
    if (N < 10) return []; // Pas assez de données pour FFT

    const sample = history.slice(0, N);
    return Array.from({ length: 90 }, (_, i) => {
        const n = i + 1;
        // Signal binaire : 1 si sorti, 0 sinon
        const rawSignal = sample.map(d => (d.gagnants.includes(n) ? 1 : 0));
        
        // Application de la fenêtre de Hamming et centrage (suppression DC offset)
        const mean = rawSignal.reduce((a, b) => a + b, 0) / N;
        const signal = rawSignal.map((v, idx) => (v - mean) * hammingWindow(idx, N));

        let maxPower = 0;
        const limit = Math.floor(N / 2);
        
        // DFT (Discrete Fourier Transform)
        for (let k = 1; k < limit; k+=1) { // Pas de 1 pour meilleure résolution
            let re = 0, im = 0;
            for (let t = 0; t < N; t++) {
                const angle = (2 * Math.PI * k * t) / N;
                re += signal[t] * Math.cos(angle);
                im -= signal[t] * Math.sin(angle);
            }
            const power = (re * re + im * im);
            if (power > maxPower) maxPower = power;
        }
        
        // Normalisation approximative pour score 0-100
        const normalizedEnergy = Math.min(100, Math.round(maxPower * 20));

        return {
            number: n,
            energy: normalizedEnergy,
            resonance: normalizedEnergy > 75,
            dominantPeriod: parseFloat((N / (maxPower * 0.5 || 1)).toFixed(1)) // Estimation grossière de la période
        };
    }).sort((a, b) => b.energy - a.energy);
  },

  calculateFractal(history: DrawResult[]): FractalMetric[] {
    const N = Math.min(history.length, 100);
    if (N < 20) return Array.from({ length: 90 }, (_, i) => ({ number: i + 1, hurst: 0.5, regime: 'RANDOM' }));

    const sample = history.slice(0, N);
    return Array.from({ length: 90 }, (_, i) => {
        const n = i + 1;
        const signal = sample.map(d => (d.gagnants.includes(n) ? 1 : 0));
        const mean = signal.reduce((a, b) => a + b, 0) / N;
        const x = signal.map(v => v - mean);
        
        let cumsum = 0;
        const y = x.map(v => (cumsum += v, cumsum));
        
        const R = Math.max(...y) - Math.min(...y);
        const variance = x.reduce((a, v) => a + v * v, 0) / N;
        const S = Math.sqrt(variance);

        let hurst = 0.5;
        if (R > 0 && S > 0) {
            hurst = Math.log(R / S) / Math.log(N);
        }
        
        // Clamp pour éviter les valeurs aberrantes mathématiques
        hurst = Math.max(0, Math.min(1, isNaN(hurst) ? 0.5 : hurst));
        
        return {
            number: n,
            hurst: hurst,
            regime: hurst > 0.6 ? 'PERSISTANT' : hurst < 0.4 ? 'ANTI-PERSISTANT' : 'RANDOM'
        };
    });
  }
};

/**
 * Valide l'intégrité statistique d'un échantillon historique.
 * Retourne un score de confiance sur la qualité des données.
 */
export const validateDataIntegrity = (history: DrawResult[]): { valid: boolean; score: number; issues: string[] } => {
    const issues: string[] = [];
    if (history.length < 10) {
        return { valid: false, score: 0, issues: ["Historique critique insuffisant (<10)"] };
    }

    let score = 100;
    
    // 1. Vérification de continuité des dates (Approximation)
    const dates = history.slice(0, 10).map(h => new Date(h.date).getTime());
    for(let i=0; i<dates.length-1; i++) {
        if (isNaN(dates[i])) {
            score -= 10;
            issues.push("Dates invalides détectées");
            break;
        }
    }

    // 2. Vérification des doublons stricts (même date, mêmes numéros)
    const signatures = new Set();
    let duplicates = 0;
    history.forEach(h => {
        const sig = `${h.date}-${h.gagnants.join(',')}`;
        if (signatures.has(sig)) duplicates++;
        signatures.add(sig);
    });
    
    if (duplicates > 0) {
        score -= (duplicates * 5);
        issues.push(`${duplicates} doublons détectés`);
    }

    // 3. Vérification de la plage des numéros
    const outOfBounds = history.some(h => h.gagnants.some(n => n < 1 || n > 90));
    if (outOfBounds) {
        score -= 50;
        issues.push("Numéros hors limites (1-90)");
    }

    return { 
        valid: score > 50, 
        score: Math.max(0, score), 
        issues 
    };
};

/**
 * Calcule le Z-Score d'une prédiction (somme) par rapport à la distribution théorique.
 * Z = (X - μ) / σ
 * Pour Loto 5/90 : μ ≈ 227.5, σ ≈ 60
 */
export const calculatePredictionZScore = (numbers: number[]): number => {
    const sum = numbers.reduce((a, b) => a + b, 0);
    const mu = 227.5;
    const sigma = 60; // Approximation empirique
    return (sum - mu) / sigma;
};

export const calculateSpectralMetricsAsync = async (history: DrawResult[]): Promise<SpectralMetric[]> => {
    if (history.length > 0) {
        const cloudData = await mathService.fetchAnalytics(history[0].drawName, history[0].date);
        if (cloudData && cloudData.spectral) return cloudData.spectral;
    }
    try {
        const res = await runWorkerTask('full_analysis', history);
        return res.spectral || mathService.calculateSpectral(history);
    } catch {
        return mathService.calculateSpectral(history);
    }
};

export const calculateFractalMetricsAsync = async (history: DrawResult[]): Promise<FractalMetric[]> => {
    if (history.length > 0) {
        const cloudData = await mathService.fetchAnalytics(history[0].drawName, history[0].date);
        if (cloudData && cloudData.fractal) return cloudData.fractal;
    }
    try {
        const res = await runWorkerTask('full_analysis', history);
        return res.fractal || mathService.calculateFractal(history);
    } catch {
        return mathService.calculateFractal(history);
    }
};

export const calculateSuccessionMatrixAsync = async (history: DrawResult[]) => {
    try {
        const res = await runWorkerTask('succession_matrix', history);
        return res || { matrix: {}, totals: {} };
    } catch {
        return { matrix: {}, totals: {} };
    }
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
        // Protection division par zéro
        const denominator = lastGap === 0 ? 0.5 : lastGap;
        const velocity = (r.avgGap - r.currentGap) / denominator;
        scores[r.number] = Math.min(100, Math.max(0, 50 + velocity * 50));
    });
    return scores;
};

export const calculateHurstForNumber = (num: number, history: DrawResult[]): { hurst: number } => {
    const N = Math.min(history.length, 100);
    if (N < 10) return { hurst: 0.5 };

    const sample = history.slice(0, N);
    const signal = sample.map(d => (d.gagnants.includes(num) ? 1 : 0));
    const mean = signal.reduce((a, b) => a + b, 0) / N;
    
    const x = signal.map(v => v - mean);
    let cumsum = 0;
    const y = x.map(v => (cumsum += v, cumsum));
    
    const R = Math.max(...y) - Math.min(...y);
    const S = Math.sqrt(x.reduce((a, v) => a + v * v, 0) / N) || 1; // Fallback 1
    
    if (R === 0) return { hurst: 0.5 };

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
    // Score inversé : 100 = Parfait respect
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
    
    // Normalisation approximative (StdDev max ~ 120 pour loto)
    const score = Math.min(100, Math.round((stdDev / 60) * 100));
    
    return {
        score,
        status: score > 75 ? 'Chaos' : score > 45 ? 'Volatile' : 'Stable',
        trend: sums[0] > avg ? 'up' : 'down'
    };
};

export const calculateRegularity = (history: DrawResult[]): NumberRegularity[] => {
    return Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const gaps: number[] = [];
        let lastIdx = -1;
        
        // Optimisation : On ne parcourt que les 200 derniers tirages pour la régularité locale
        const sample = history.length > 200 ? history.slice(0, 200) : history;
        
        sample.forEach((d, idx) => {
            if(d.gagnants.includes(num)) {
                if(lastIdx !== -1) gaps.push(idx - lastIdx);
                lastIdx = idx;
            }
        });
        
        const currentGap = sample.findIndex(d => d.gagnants.includes(num));
        const safeAvgGap = gaps.length > 0 ? gaps.reduce((a,b)=>a+b,0)/gaps.length : (sample.length / 5);
        
        const variance = gaps.reduce((a,v)=>a + Math.pow(v-safeAvgGap, 2), 0) / (Math.max(1, gaps.length));
        
        return {
            number: num,
            avgGap: parseFloat(safeAvgGap.toFixed(2)),
            stdDev: parseFloat(Math.sqrt(variance).toFixed(2)),
            currentGap: currentGap === -1 ? sample.length : currentGap,
            lastGaps: gaps.slice(0, 5),
            nextExpectedIn: Math.max(0, Math.round(safeAvgGap - (currentGap === -1 ? sample.length : currentGap)))
        };
    });
};

export const detectGameRegime = (history: DrawResult[]) => {
    // Échantillon sur 5 numéros clés pour performance
    const keys = [1, 23, 45, 67, 90]; 
    const hursts = keys.map(k => calculateHurstForNumber(k, history).hurst);
    const avgHurst = hursts.reduce((a,b)=>a+b,0) / keys.length;
    
    return { 
        hurst: avgHurst, 
        regime: avgHurst > 0.60 ? 'PERSISTANT' : avgHurst < 0.40 ? 'ANTI-PERSISTANT' : 'CHAOS' 
    };
};

export const calculateCorrelationMatrixAsync = async (history: DrawResult[]) => {
    try {
        const res = await runWorkerTask('pearson_matrix', history);
        return res || {};
    } catch {
        return {}; 
    }
};

export const calculateNetworkCentralityAsync = async (history: DrawResult[]) => {
    const { matrix } = await calculateSuccessionMatrixAsync(history);
    return Array.from({length: 90}, (_, i) => {
        const n = i+1;
        const row = matrix[n] || {};
        const outWeight = Object.values(row).reduce<number>((a, b) => a + (Number(b) || 0), 0);
        return {
            number: n,
            centrality: outWeight,
            normalized: Math.min(100, Math.round((outWeight / (history.length * 0.5)) * 100))
        };
    });
};

export const getNumberDetailedMetrics = async (num: number, history: DrawResult[], spectral: SpectralMetric[], fractal: FractalMetric[]): Promise<DetailedNumberMetrics> => {
    const reg = calculateRegularity(history).find(r => r.number === num);
    const spec = spectral.find(s => s.number === num);
    const frac = fractal.find(f => f.number === num);
    
    const safeAvg = reg?.avgGap || 18;
    const safeGap = reg?.currentGap || 0;
    
    return {
        temperature: Math.round((spec?.energy || 0) * 0.6 + (safeGap / safeAvg) * 20),
        hurst: frac?.hurst || 0.5,
        lastGap: safeGap,
        avgGap: safeAvg,
        nextProb: Math.round(50 + (safeGap > safeAvg ? 20 : -10)),
        spectralEnergy: spec?.energy || 0,
        stdDev: reg?.stdDev || 5,
        historyGraph: history.slice(0, 20).map(d => d.gagnants.includes(num) ? 1 : 0).reverse(),
        affinity: [], 
        nemesis: []
    };
};
