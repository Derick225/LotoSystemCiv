/**
 * Nexus Production Math Worker v9.2 (Wavelet Haar Integration)
 */

export {};

const ctx = self as unknown as Worker;

/**
 * Calcule l'énergie locale via une transformée en ondelettes discrète (Haar)
 * Détecte les "pulses" de probabilité que la FFT globale ignore.
 */
const calculateWaveletEnergy = (signal: number[]): number => {
    const n = signal.length;
    if (n < 8) return 0;

    // On s'assure d'une puissance de 2 pour la décomposition de Haar
    const size = Math.pow(2, Math.floor(Math.log2(n)));
    let currentData = signal.slice(0, size);
    
    let totalEnergy = 0;
    let scale = 1;

    // Analyse Multi-Résolution (MRA)
    while (currentData.length > 1) {
        const nextData = [];
        const details = [];
        for (let i = 0; i < currentData.length; i += 2) {
            const avg = (currentData[i] + currentData[i+1]) / 2;
            const diff = (currentData[i] - currentData[i+1]) / 2;
            nextData.push(avg);
            details.push(diff);
        }
        
        // L'énergie à cette échelle est la somme des carrés des coefficients de détail
        const scaleEnergy = details.reduce((acc, d) => acc + d * d, 0);
        // On pondère plus fort les échelles fines (proches du présent)
        totalEnergy += scaleEnergy * (1 / scale);
        
        currentData = nextData;
        scale++;
    }

    return Math.min(100, Math.round(totalEnergy * 50));
};

ctx.onmessage = async (e: MessageEvent) => {
    const { requestId, task, history, payload } = e.data;
    if (!history || history.length === 0) return;

    try {
        let result: any;
        switch (task) {
            case 'full_analysis':
                result = {
                    spectral: calculateSpectralFFT(history),
                    wavelet: calculateWaveletScan(history),
                    fractal: calculateHurstExponent(history),
                };
                break;
            case 'wavelet_analysis':
                result = calculateWaveletScan(history);
                break;
            default:
                result = { status: 'OK' };
        }
        ctx.postMessage({ requestId, result });
    } catch (err: any) {
        ctx.postMessage({ requestId, error: err.message });
    }
};

function calculateWaveletScan(history: any[]) {
    const results = [];
    for (let num = 1; num <= 90; num++) {
        const signal = history.map(d => (d.gagnants.includes(num) ? 1 : 0));
        results.push({
            number: num,
            energy: calculateWaveletEnergy(signal)
        });
    }
    return results;
}

function calculateSpectralFFT(history: any[]) {
    const N = history.length;
    let globalMaxPower = 0;
    const rawPowers = [];

    for (let num = 1; num <= 90; num++) {
        const signal = history.map(d => (d.gagnants.includes(num) ? 1 : 0));
        const mean = signal.reduce((a: number, b: number) => a + b, 0) / N;
        let maxPower = 0;
        let dominantPeriod = 0;
        // Fenêtrage de Hamming
        const signalWindowed = signal.map((s, idx) => (s - mean) * (0.54 - 0.46 * Math.cos((2 * Math.PI * idx) / (N - 1))));

        const limit = Math.floor(N / 2);
        for (let k = 1; k < limit; k++) {
            let re = 0, im = 0;
            for (let n = 0; n < N; n++) {
                const angle = (2 * Math.PI * k * n) / N;
                re += signalWindowed[n] * Math.cos(angle);
                im -= signalWindowed[n] * Math.sin(angle);
            }
            const power = (re * re + im * im) / N;
            if (power > maxPower) {
                maxPower = power;
                dominantPeriod = N / k;
            }
        }
        if (maxPower > globalMaxPower) globalMaxPower = maxPower;
        rawPowers.push({ number: num, rawEnergy: maxPower, dominantPeriod });
    }

    const safeMax = globalMaxPower > 0 ? globalMaxPower : 1;
    return rawPowers.map(p => ({
        number: p.number,
        energy: Math.round((p.rawEnergy / safeMax) * 100),
        dominantPeriod: parseFloat(p.dominantPeriod.toFixed(1))
    })).sort((a,b) => b.energy - a.energy);
}

function calculateHurstExponent(history: any[]) {
    const results = [];
    const N = history.length;
    for (let num = 1; num <= 90; num++) {
        const signal = history.map(d => (d.gagnants.includes(num) ? 1 : 0));
        if (signal.length < 10) {
            results.push({ number: num, hurst: 0.5, regime: 'RANDOM' });
            continue;
        }
        const mean = signal.reduce((a: number, b: number) => a + b, 0) / N;
        const x = signal.map(v => v - mean);
        const y = new Float32Array(x.length);
        let cumsum = 0;
        for (let i = 0; i < x.length; i++) {
            cumsum += x[i];
            y[i] = cumsum;
        }
        const R = Math.max(...Array.from(y)) - Math.min(...Array.from(y));
        const S = Math.sqrt(x.reduce((a, v) => a + v * v, 0) / N) || 1;
        const h = Math.log(R / S) / Math.log(N);
        const clampedH = Math.max(0, Math.min(1, h || 0.5));
        results.push({
            number: num,
            hurst: parseFloat(clampedH.toFixed(2)),
            regime: clampedH > 0.6 ? 'PERSISTANT' : clampedH < 0.4 ? 'ANTI-PERSISTANT' : 'RANDOM'
        });
    }
    return results;
}