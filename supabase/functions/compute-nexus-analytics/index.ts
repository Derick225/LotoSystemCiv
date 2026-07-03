import { createClient } from 'supabase'
import { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts"
import { mean, stdDev, computeDFT, matMul } from "../_shared/math-utils.ts"
import { DrawResult } from "../_shared/types.ts";

// --- VALIDATION SCHEMAS ---
const AnalyticsRequestSchema = z.object({
    task: z.string().optional(),
    drawName: z.string().optional(),
    history: z.array(z.record(z.unknown())).optional(),
    payload: z.object({
        matrix: z.array(z.array(z.number())).optional(),
        variance: z.number().optional(),
        features: z.array(z.array(z.number())).optional(),
        labels: z.array(z.number()).optional(),
        lambda: z.number().optional()
    }).optional()
});

// --- Specialized Math Core Functions ---

export function computeHaarWaveletEnergy(signal: number[]): number {
    const vals = [...signal];
    if (vals.length % 2 !== 0) vals.pop();
    let energy = 0;
    for (let i = 0; i < vals.length; i += 2) {
        const detail = (vals[i] - vals[i+1]) / Math.sqrt(2);
        energy += Math.pow(detail, 2);
    }
    return energy;
}

export function computeRobustHurst(signal: number[]): number {
    const N = signal.length;
    if (N < 20) return 0.5;
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
    const mX = mean(logSizes);
    const mY = mean(logRs);
    let num = 0, den = 0;
    for(let i=0; i<logRs.length; i++) {
        num += (logSizes[i] - mX) * (logRs[i] - mY);
        den += Math.pow(logSizes[i] - mX, 2);
    }
    return den !== 0 ? Math.max(0, Math.min(1, num / den)) : 0.5;
}

// Matrix Operations (Specific ones not in shared)
export const transpose = (A: number[][]): number[][] => {
    const m = A.length;
    const n = A[0].length;
    const C = Array(n).fill(0).map(() => Array(m).fill(0));
    for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) C[j][i] = A[i][j];
    }
    return C;
};

export const matSub = (A: number[][], B: number[][]): number[][] => A.map((row, i) => row.map((val, j) => val - B[i][j]));
export const matAdd = (A: number[][], B: number[][]): number[][] => A.map((row, i) => row.map((val, j) => val + B[i][j]));
export const scalarMul = (A: number[][], scalar: number): number[][] => A.map(row => row.map(val => val * scalar));
export const vecNorm = (v: number[][]): number => {
    let sum = 0;
    for (let i = 0; i < v.length; i++) sum += v[i][0] * v[i][0];
    return Math.sqrt(sum);
};

export function computeEigenDecomposition(matrix: number[][]): { values: number[], vectors: number[][] } {
    const n = matrix.length;
    let A = matrix.map(row => [...row]);
    const eigenValues: number[] = [];
    const eigenVectors: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
        let v = Array(n).fill(0).map((_, i) => [ (i % 2 === 0 ? 1 : -1) / Math.sqrt(n > 0 ? n : 1) ]);
        let norm = vecNorm(v);
        if (norm === 0) { v[0][0] = 1; norm = 1; }
        v = scalarMul(v, 1/norm);
        let lastV = v.map(row => [...row]);
        for (let iter = 0; iter < 40; iter++) {
            const Av = matMul(A, v);
            norm = vecNorm(Av);
            if (norm < 1e-9) break;
            v = scalarMul(Av, 1/norm);
            let diff = 0;
            for(let k=0; k<n; k++) diff += Math.pow(v[k][0] - lastV[k][0], 2);
            if (Math.sqrt(diff) < 1e-6) break;
            lastV = v.map(row => [...row]);
        }
        const Av = matMul(A, v);
        const eigenvalue = matMul(transpose(v), Av)[0][0];
        eigenValues.push(eigenvalue);
        for(let k=0; k<n; k++) eigenVectors[k][i] = v[k][0];
        const vvT = matMul(v, transpose(v));
        const deflation = scalarMul(vvT, eigenvalue);
        A = matSub(A, deflation);
    }
    return { values: eigenValues, vectors: eigenVectors };
}

export function denoiseFeaturesPCA(data: number[][], varianceThreshold: number = 0.95): number[][] {
    if (!data || data.length === 0) return [];
    const nSamples = data.length;
    const nFeatures = data[0].length;
    
    // 1. Standard Scaling (Z-score normalization)
    const means = Array(nFeatures).fill(0);
    const stdDevs = Array(nFeatures).fill(0);
    
    for(let i=0; i<nSamples; i++) {
        for(let j=0; j<nFeatures; j++) means[j] += data[i][j];
    }
    for(let j=0; j<nFeatures; j++) means[j] /= nSamples;
    
    for(let i=0; i<nSamples; i++) {
        for(let j=0; j<nFeatures; j++) stdDevs[j] += Math.pow(data[i][j] - means[j], 2);
    }
    for(let j=0; j<nFeatures; j++) {
        stdDevs[j] = Math.sqrt(stdDevs[j] / (nSamples - 1)) || 1; // Avoid division by zero
    }
    
    const scaledData = data.map(row => row.map((val, j) => (val - means[j]) / stdDevs[j]));

    // 2. PCA on scaled data
    const covariance = scalarMul(matMul(transpose(scaledData), scaledData), 1 / (nSamples - 1));
    const { values, vectors } = computeEigenDecomposition(covariance);
    const totalVariance = values.reduce((a, b) => a + Math.abs(b), 0);
    let k = 1;
    let currentVar = 0;
    for (let i = 0; i < nFeatures; i++) {
        currentVar += Math.abs(values[i]);
        if (totalVariance > 0 && currentVar / totalVariance >= varianceThreshold) { k = i + 1; break; }
    }
    const topKVectors = vectors.map(row => row.slice(0, k));
    const projected = matMul(scaledData, topKVectors);
    
    // 3. Reconstruct and inverse transform
    const reconstructedScaled = matMul(projected, transpose(topKVectors));
    const reconstructed = reconstructedScaled.map((row, i) => 
        row.map((val, j) => (val * stdDevs[j]) + means[j])
    );
    
    return reconstructed;
}

export function trainRidgeRegression(features: number[][], labels: number[], lambda: number = 0.1): number[] {
    if (!features || features.length === 0 || features.length !== labels.length) return [];
    const nFeatures = features[0].length;
    const nSamples = features.length;
    let weights = Array(nFeatures).fill(0);
    let learningRate = 0.05; // Start slightly higher
    
    for (let iter = 0; iter < 200; iter++) { // Increased max iterations
        const gradients = Array(nFeatures).fill(0);
        let maxGradient = 0;
        
        for (let i = 0; i < nSamples; i++) {
            let pred = 0;
            for (let j = 0; j < nFeatures; j++) pred += features[i][j] * weights[j];
            const error = pred - labels[i];
            for (let j = 0; j < nFeatures; j++) gradients[j] += (2 / nSamples) * error * features[i][j];
        }
        
        for (let j = 0; j < nFeatures; j++) {
            gradients[j] += 2 * lambda * weights[j];
            weights[j] -= learningRate * gradients[j];
            if (Math.abs(gradients[j]) > maxGradient) maxGradient = Math.abs(gradients[j]);
        }
        
        // Early stopping & Learning Rate Decay
        if (maxGradient < 1e-4) break; 
        learningRate *= 0.98; // Decay learning rate
    }
    return weights;
}

export function runGapEfficiency(history: DrawResult[]) {
    if (!history || history.length === 0) return [];
    const efficiencies = [];
    const depth = Math.min(history.length, 300);
    const subHistory = history.slice(0, depth);
    const draws = subHistory.map(h => new Set(h.gagnants));
    for (let num = 1; num <= 90; num++) {
        const gaps: number[] = [];
        let currentCounter = 0;
        let isFirst = true;
        let currentGap = 0;
        for (const drawSet of draws) {
            if (drawSet.has(num)) {
                if (isFirst) { currentGap = currentCounter; isFirst = false; }
                else { gaps.push(currentCounter); }
                currentCounter = 0;
            } else { currentCounter++; }
        }
        if (isFirst) currentGap = currentCounter;
        let maxGap = currentGap;
        let avgGap = 0;
        let sigma = 1;
        if (gaps.length > 0) {
            maxGap = Math.max(Math.max(...gaps), currentGap);
            let sum = 0;
            for(let g of gaps) sum += g;
            avgGap = sum / gaps.length;
            let sumSq = 0;
            for(let g of gaps) sumSq += (g - avgGap) ** 2;
            sigma = Math.sqrt(sumSq / gaps.length) || 1;
        }
        const zScore = (currentGap - avgGap) / sigma;
        const breakoutProb = (1 / (1 + Math.exp(-(zScore - 0.5) * 1.5))) * 100;
        const fatigueIndex = avgGap > 0 ? (maxGap / avgGap) : 1;
        const positionScore = maxGap > 0 ? (currentGap / maxGap) * 100 : 0;
        const pressureScore = Math.min(100, Math.max(0, (zScore + 1) * 33));
        const maturityScore = Math.round((positionScore * 0.4) + (pressureScore * 0.6));
        let zone = 'COLD';
        if (zScore > 2.5 || maturityScore > 90) zone = 'CRITICAL';
        else if (zScore > 1.0 || maturityScore > 70) zone = 'HOT';
        else if (zScore > 0 || maturityScore > 40) zone = 'WARMING';
        efficiencies.push({
            number: num, currentGap, maxGap, avgGap, probabilityAtCurrentGap: Math.round(breakoutProb),
            maturityScore, zone, zScore, fatigueIndex, breakoutProb
        });
    }
    return efficiencies.sort((a: { zScore: number }, b: { zScore: number }) => b.zScore - a.zScore);
}

export function runSpectral(history: DrawResult[]) {
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

export function runFractal(history: DrawResult[]) {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Configuration Supabase manquante.")
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Auth Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return new Response(JSON.stringify({ error: "Non autorisé." }), { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
        return new Response(JSON.stringify({ error: "Non autorisé." }), { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    const body = await req.json();
    const validation = AnalyticsRequestSchema.safeParse(body);

    if (!validation.success) {
        return new Response(JSON.stringify({ error: "Invalid Request payload", details: validation.error.format() }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }

    const { task, payload, history, drawName } = validation.data;

    // --- LOGIQUE DE CACHE ---
    // Le cache est basé sur drawName + task + ID du dernier tirage
    if (drawName && task) {
        // Récupérer l'ID du dernier tirage pour ce jeu
        const { data: lastDraw } = await supabase
            .from('draw_results')
            .select('id')
            .eq('draw_name', drawName)
            .order('date', { ascending: false })
            .limit(1)
            .single();

        if (lastDraw) {
            const { data: cached } = await supabase
                .from('analytics_cache')
                .select('result')
                .eq('draw_name', drawName)
                .eq('task', task)
                .eq('last_draw_id', lastDraw.id)
                .maybeSingle();

            if (cached) {
                console.log(`[CACHE HIT] ${drawName} - ${task}`);
                return new Response(JSON.stringify({ 
                    success: true, 
                    result: cached.result,
                    cached: true
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        }
    }

    if (drawName && !task) {
        const { data: results, error: fetchError } = await supabase
            .from('draw_results')
            .select('gagnants, date')
            .eq('draw_name', drawName)
            .order('date', { ascending: false })
            .limit(100);

        if (fetchError) throw fetchError;
        if (!results || results.length === 0) {
            return new Response(JSON.stringify({ success: true, message: "Pas de données pour l'analyse." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const frequencies: Record<number, number> = {};
        results.forEach(r => {
            r.gagnants.forEach((n: number) => {
                frequencies[n] = (frequencies[n] || 0) + 1;
            });
        });

        const sortedFrequencies = Object.entries(frequencies)
            .map(([num, count]) => ({ number: parseInt(num), count }))
            .sort((a, b) => b.count - a.count);

        const hotNumbers = sortedFrequencies.slice(0, 5).map(x => x.number);
        const coldNumbers = sortedFrequencies.slice(-5).map(x => x.number).reverse();
        
        return new Response(JSON.stringify({ 
            success: true, 
            analytics: {
                drawName,
                analyzedDraws: results.length,
                hotNumbers,
                coldNumbers,
                lastUpdate: new Date().toISOString()
            }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!task) {
        throw new Error("Paramètre manquant: task ou drawName")
    }

    let result: unknown;
    switch (task) {
        case 'full_analysis':
            result = {
                spectral: runSpectral(history || []),
                fractal: runFractal(history || [])
            };
            break;
        case 'hurst_exponent': 
            result = runFractal(history || []);
            break;
        case 'DENOISE_PCA':
            result = denoiseFeaturesPCA(payload?.matrix || [], payload?.variance || 0.95);
            break;
        case 'TRAIN_RIDGE':
            result = trainRidgeRegression(payload?.features || [], payload?.labels || [], payload?.lambda || 0.1);
            break;
        case 'GAP_EFFICIENCY':
            result = runGapEfficiency(history || []);
            break;
        case 'SPECTRAL_METRICS':
            result = runSpectral(history || []);
            break;
        default:
            throw new Error(`Tâche inconnue: ${task}`);
    }
    
    // Sauvegarde en cache si applicable
    if (drawName && task && result) {
        const { data: lastDraw } = await supabase
            .from('draw_results')
            .select('id')
            .eq('draw_name', drawName)
            .order('date', { ascending: false })
            .limit(1)
            .single();

        if (lastDraw) {
            await supabase
                .from('analytics_cache')
                .upsert({
                    draw_name: drawName,
                    task,
                    last_draw_id: lastDraw.id,
                    result,
                    created_at: new Date().toISOString()
                }, { onConflict: 'draw_name,task,last_draw_id' });
        }
    }
    
    return new Response(JSON.stringify({ 
        success: true, 
        result
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    const err = error as Error;
    console.error("Compute Error:", err)
    return new Response(JSON.stringify({ success: false, error: err.message || "Unknown Error" }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
