
/**
 * Nexus Production Math Worker v8.1
 * Traitement analytique lourd sur l'ENTIÈRETÉ de l'historique.
 */

export {};

// Fix: Explicitly type self as Worker using safe casting
const ctx = self as unknown as Worker;

ctx.onmessage = async (e: MessageEvent) => {
    const { requestId, task, history } = e.data;
    if (!history || history.length === 0) return;

    try {
        let result: any;
        switch (task) {
            case 'full_analysis':
                result = performFullComputePipeline(history);
                break;
            case 'pearson_matrix':
                result = calculatePearsonMatrix(history);
                break;
            case 'hurst_exponent':
                result = calculateHurstExponent(history);
                break;
            case 'stochastic_audit':
                result = performStructuralAudit(history);
                break;
            default:
                throw new Error(`Task ${task} unknown`);
        }
        ctx.postMessage({ requestId, result });
    } catch (err: any) {
        ctx.postMessage({ requestId, error: err.message });
    }
};

function performFullComputePipeline(history: any[]) {
    return {
        spectral: calculateSpectralFFT(history),
        fractal: calculateHurstExponent(history),
        audit: performStructuralAudit(history), // Utilisation complète
        centrality: calculateEigenvectorCentrality(history),
        correlations: calculatePearsonMatrix(history)
    };
}

function calculatePearsonMatrix(history: any[]) {
    const N = history.length; // Intégralité
    const nodes = 90;
    const matrix: Record<number, { affinities: Record<number, number> }> = {};
    
    const vectors: Float32Array[] = new Array(nodes + 1);
    for (let i = 1; i <= nodes; i++) {
        vectors[i] = new Float32Array(N);
        for (let t = 0; t < N; t++) {
            vectors[i][t] = history[t].gagnants.includes(i) ? 1 : 0;
        }
    }

    for (let i = 1; i <= nodes; i++) {
        matrix[i] = { affinities: {} };
        const vecI = vectors[i]!;
        const meanI = vecI.reduce((a, b) => a + b, 0) / N;
        
        for (let j = 1; j <= nodes; j++) {
            if (i === j) continue;
            const vecJ = vectors[j]!;
            const meanJ = vecJ.reduce((a, b) => a + b, 0) / N;
            
            let num = 0, denI = 0, denJ = 0;
            for (let t = 0; t < N; t++) {
                const dI = vecI[t] - meanI;
                const dJ = vecJ[t] - meanJ;
                num += dI * dJ;
                denI += dI * dI;
                denJ += dJ * dJ;
            }
            
            const r = denI * denJ === 0 ? 0 : num / Math.sqrt(denI * denJ);
            if (Math.abs(r) > 0.05) { // Seuil réduit pour capturer plus de signaux sur l'historique complet
                matrix[i].affinities[j] = parseFloat(r.toFixed(4));
            }
        }
    }
    return matrix;
}

function calculateHurstExponent(history: any[]) {
    const nodes = 90;
    const results = [];
    const N = history.length;
    
    for (let num = 1; num <= nodes; num++) {
        const signal = history.map(d => (d.gagnants.includes(num) ? 1 : 0));
        if (signal.length < 10) {
            results.push({ number: num, hurst: 0.5, regime: 'RANDOM', strength: 0 });
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
            regime: clampedH > 0.6 ? 'PERSISTANT' : clampedH < 0.4 ? 'ANTI-PERSISTANT' : 'RANDOM',
            strength: Math.abs(clampedH - 0.5) * 200
        });
    }
    return results;
}

function calculateSpectralFFT(history: any[]) {
    const N = history.length;
    const results = [];
    for (let num = 1; num <= 90; num++) {
        const signal = history.map(d => (d.gagnants.includes(num) ? 1 : 0));
        const mean = signal.reduce((a: number, b: number) => a + b, 0) / N;
        let maxPower = 0;
        let dominantPeriod = 0;
        
        // Résolution spectrale accrue sur l'historique complet
        const limit = Math.floor(N / 2);
        for (let k = 1; k < limit; k++) {
            let re = 0, im = 0;
            for (let n = 0; n < N; n++) {
                const angle = (2 * Math.PI * k * n) / N;
                re += (signal[n] - mean) * Math.cos(angle);
                im -= (signal[n] - mean) * Math.sin(angle);
            }
            const power = (re * re + im * im) / N;
            if (power > maxPower) {
                maxPower = power;
                dominantPeriod = N / k;
            }
        }
        results.push({ 
            number: num, 
            energy: Math.min(100, Math.round(maxPower * 500)), 
            dominantPeriod: parseFloat(dominantPeriod.toFixed(1)), 
            waveform: signal.slice(0, 30),
            isResonating: maxPower > 0.15
        });
    }
    return results;
}

function performStructuralAudit(sample: any[]) {
    const allNums = sample.flatMap(d => d.gagnants);
    const N = allNums.length;
    const freq: Record<number, number> = {};
    allNums.forEach(n => freq[n] = (freq[n] || 0) + 1);

    let entropy = 0;
    Object.values(freq).forEach(count => {
        const p = count / N;
        if (p > 0) entropy -= p * Math.log2(p);
    });
    const maxEntropy = Math.log2(90);
    
    const normalizedEntropy = entropy / maxEntropy;

    return {
        entropy: parseFloat(normalizedEntropy.toFixed(4)),
        isRandom: normalizedEntropy > 0.88,
        anomalies: normalizedEntropy < 0.8 ? ["Structure ordonnée anormale détectée"] : []
    };
}

function calculateEigenvectorCentrality(history: any[]) {
    const nodes = 90;
    const adj = new Float32Array(nodes * nodes).fill(0);
    history.forEach(draw => {
        const nums = draw.gagnants;
        for(let i=0; i<nums.length; i++) {
            for(let j=i+1; j<nums.length; j++) {
                const u = nums[i]-1, v = nums[j]-1;
                if (u >= 0 && u < 90 && v >= 0 && v < 90) {
                    adj[u * nodes + v] += 1;
                    adj[v * nodes + u] += 1;
                }
            }
        }
    });
    let centrality = new Float32Array(nodes).fill(1/nodes);
    for(let iter=0; iter<15; iter++) {
        const next = new Float32Array(nodes).fill(0);
        for(let i=0; i<nodes; i++) {
            for(let j=0; j<nodes; j++) {
                next[i] += adj[i * nodes + j] * centrality[j];
            }
        }
        const norm = Math.sqrt(Array.from(next).reduce((a,v) => a + v*v, 0));
        if(norm > 0) for(let i=0; i<nodes; i++) next[i] /= norm;
        centrality = next;
    }
    const max = Math.max(...Array.from(centrality));
    return Array.from(centrality).map((s, i) => ({
        number: i + 1,
        centrality: s,
        normalized: Math.round((s / (max || 1)) * 100)
    }));
}
