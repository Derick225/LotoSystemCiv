
/**
 * Nexus Production Math Worker v12.0 (Deep Science Edition)
 * Implémentations mathématiques réelles (DFT, Haar, Hurst R/S).
 */

export {};

const ctx = self as unknown as Worker;

// --- UTILS MATHS DE PRÉCISION ---

const mean = (data: number[]) => data.reduce((a, b) => a + b, 0) / (data.length || 1);

const stdDev = (data: number[]) => {
    const mu = mean(data);
    const variance = data.reduce((a, b) => a + Math.pow(b - mu, 2), 0) / (data.length || 1);
    return Math.sqrt(variance);
};

// --- ALGORITHMES RÉELS ---

/**
 * Transformée de Fourier Discrète (DFT) Réelle
 * Identifie les cycles de sortie périodiques.
 */
function computeDFT(signal: number[]): { frequency: number, power: number, period: number }[] {
    const N = signal.length;
    const spectrum = [];
    
    // Calcul sur la moitié du spectre (Nyquist)
    for (let k = 1; k < N / 2; k++) {
        let re = 0;
        let im = 0;
        for (let n = 0; n < N; n++) {
            // Application d'une fenêtre de Hanning pour réduire le leakage spectral
            const window = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
            const val = signal[n] * window;
            
            const angle = (2 * Math.PI * k * n) / N;
            re += val * Math.cos(angle);
            im -= val * Math.sin(angle);
        }
        const magnitude = Math.sqrt(re * re + im * im);
        spectrum.push({
            frequency: k,
            power: magnitude,
            period: N / k
        });
    }
    return spectrum;
}

/**
 * Transformée en Ondelettes de Haar (1 niveau)
 * Isole l'énergie des changements brusques récents.
 */
function computeHaarWaveletEnergy(signal: number[]): number {
    const vals = [...signal];
    if (vals.length % 2 !== 0) vals.pop();
    let energy = 0;
    
    for (let i = 0; i < vals.length; i += 2) {
        // Coefficient de détail (Haute fréquence)
        const detail = (vals[i] - vals[i+1]) / Math.sqrt(2);
        energy += Math.pow(detail, 2);
    }
    return energy;
}

/**
 * Analyse R/S (Rescaled Range) pour Hurst robuste
 * Mesure la persistance (mémoire) du numéro.
 */
function computeRobustHurst(signal: number[]): number {
    const N = signal.length;
    if (N < 20) return 0.5;

    // Calcul sur 3 tailles de fenêtres pour régression
    const windowSizes = [Math.floor(N/2), Math.floor(N/4), Math.floor(N/8)].filter(w => w > 4);
    const logRs: number[] = [];
    const logSizes: number[] = [];

    for (const wSize of windowSizes) {
        const chunksCount = Math.floor(N / wSize);
        let totalRS = 0;

        for (let i = 0; i < chunksCount; i++) {
            const chunk = signal.slice(i * wSize, (i + 1) * wSize);
            const m = mean(chunk);
            const y = chunk.map(v => v - m);
            
            let sum = 0;
            const z = y.map(v => { sum += v; return sum; });
            
            const R = Math.max(...z) - Math.min(...z);
            const S = stdDev(chunk) || 1;
            totalRS += R / S;
        }
        
        const avgRS = totalRS / chunksCount;
        if (avgRS > 0) {
            logRs.push(Math.log(avgRS));
            logSizes.push(Math.log(wSize));
        }
    }

    if (logRs.length < 2) return 0.5;
    
    // Régression linéaire simple (Pente = Hurst)
    const mX = mean(logSizes);
    const mY = mean(logRs);
    let num = 0, den = 0;
    for(let i=0; i<logRs.length; i++) {
        num += (logSizes[i] - mX) * (logRs[i] - mY);
        den += Math.pow(logSizes[i] - mX, 2);
    }
    
    return den !== 0 ? Math.max(0, Math.min(1, num / den)) : 0.5;
}

// --- WORKER HANDLER ---

ctx.onmessage = async (e: MessageEvent) => {
    const { requestId, task, history, payload } = e.data;
    if (!history || history.length === 0) return;

    try {
        let result: any;
        switch (task) {
            case 'full_analysis':
                result = {
                    spectral: runSpectral(history),
                    wavelet: runWavelet(history),
                    fractal: runFractal(history)
                };
                break;
            case 'wavelet_analysis':
                result = runWavelet(history);
                break;
            default:
                result = { status: 'OK' };
        }
        ctx.postMessage({ requestId, result });
    } catch (err: any) {
        ctx.postMessage({ requestId, error: err.message });
    }
};

function runSpectral(history: any[]) {
    const N = Math.min(history.length, 128);
    const data = history.slice(0, N);
    const results = [];
    let globalMax = 0;

    for (let num = 1; num <= 90; num++) {
        const signal = data.map(d => (d.gagnants.includes(num) ? 1 : -1));
        const spectrum = computeDFT(signal);
        
        let maxP = 0;
        spectrum.forEach(s => { if (s.power > maxP) maxP = s.power; });
        if (maxP > globalMax) globalMax = maxP;
        
        results.push({ number: num, raw: maxP });
    }

    return results.map(r => ({
        number: r.number,
        energy: Math.round((r.raw / (globalMax || 1)) * 100),
        resonance: (r.raw / (globalMax || 1)) > 0.8
    })).sort((a,b) => b.energy - a.energy);
}

function runWavelet(history: any[]) {
    const data = history.slice(0, 64);
    const results = [];
    for (let num = 1; num <= 90; num++) {
        const signal = data.map(d => (d.gagnants.includes(num) ? 1 : 0));
        const energy = computeHaarWaveletEnergy(signal);
        results.push({ number: num, energy: Math.min(100, Math.round(energy * 15)) });
    }
    return results;
}

function runFractal(history: any[]) {
    const data = history.slice(0, 250);
    const results = [];
    for (let num = 1; num <= 90; num++) {
        const signal = data.map(d => (d.gagnants.includes(num) ? 1 : 0));
        const h = computeRobustHurst(signal);
        results.push({
            number: num,
            hurst: parseFloat(h.toFixed(3)),
            regime: h > 0.6 ? 'PERSISTANT' : h < 0.4 ? 'ANTI-PERSISTANT' : 'RANDOM'
        });
    }
    return results;
}
