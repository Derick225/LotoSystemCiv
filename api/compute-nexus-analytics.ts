
import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge', // Utilisation de Edge pour la vitesse
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- MATH UTILS ---
const calculateMean = (data: number[]) => data.reduce((a, b) => a + b, 0) / (data.length || 1);

const calculateStandardDeviation = (data: number[]) => {
    const mean = calculateMean(data);
    const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (data.length || 1);
    return Math.sqrt(variance);
};

const calculateAutocorrelation = (data: number[], lag: number) => {
    const n = data.length;
    if (n <= lag) return 0;
    const mean = calculateMean(data);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
        den += Math.pow(data[i] - mean, 2);
        if (i < n - lag) num += (data[i] - mean) * (data[i + lag] - mean);
    }
    return den === 0 ? 0 : num / den;
};

const calculateSpectralEnergy = (signal: number[]) => {
    const N = signal.length;
    let maxPower = 0;
    const harmonics = Math.min(N / 2, 25); 
    const windowedSignal = signal.map((s, i) => s * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1))));
    
    for (let k = 1; k < harmonics; k++) {
        let re = 0, im = 0;
        for (let t = 0; t < N; t++) {
            const angle = (2 * Math.PI * k * t) / N;
            re += (windowedSignal[t]) * Math.cos(angle);
            im -= (windowedSignal[t]) * Math.sin(angle);
        }
        const power = (re * re + im * im) / (N * N); 
        maxPower = Math.max(maxPower, power);
    }
    return Math.min(100, Math.round(maxPower * 2500)); 
};

const calculateHurst = (signal: number[]) => {
    const N = signal.length;
    if (N < 10) return 0.5;
    const mean = calculateMean(signal);
    const y = signal.map(x => x - mean);
    let cumsum = 0;
    const cumDev = y.map(val => { cumsum += val; return cumsum; });
    const R = Math.max(...cumDev) - Math.min(...cumDev);
    const S = calculateStandardDeviation(signal);
    if (R === 0 || S === 0) return 0.5;
    const hurst = Math.log(R / S) / Math.log(N);
    return Math.max(0, Math.min(1, hurst));
};

const calculateGapEntropy = (signal: number[]) => {
    const gaps = [];
    let currentGap = 0;
    for(const val of signal) {
        if(val === 1) { gaps.push(currentGap); currentGap = 0; } 
        else { currentGap++; }
    }
    if (gaps.length < 2) return 0;
    const freq: Record<number, number> = {};
    gaps.forEach(g => freq[g] = (freq[g] || 0) + 1);
    let entropy = 0;
    const total = gaps.length;
    Object.values(freq).forEach(count => {
        const p = count / total;
        if (p > 0) entropy -= p * Math.log2(p);
    });
    return Math.min(1, entropy / 6);
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { drawName } = await req.json();
    if (!drawName) throw new Error("drawName is required");

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase config error");

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    const { data: history, error: fetchError } = await supabaseAdmin
      .from('draw_results')
      .select('gagnants, date')
      .eq('draw_name', drawName)
      .order('date', { ascending: false })
      .limit(250); 

    if (fetchError || !history || history.length < 10) {
        return new Response(JSON.stringify({ message: "Insufficent data", drawName }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const N = history.length;
    const spectral = [];
    const fractal = [];

    for (let num = 1; num <= 90; num++) {
      const signal = history.map(d => (d.gagnants.includes(num) ? 1 : 0));
      const energy = calculateSpectralEnergy(signal);
      spectral.push({ number: num, energy, resonance: energy > 70 });

      const hurst = calculateHurst(signal);
      const gapEnt = calculateGapEntropy(signal);
      
      fractal.push({ 
          number: num, 
          hurst: parseFloat(hurst.toFixed(3)),
          gapEntropy: parseFloat(gapEnt.toFixed(3)),
          regime: hurst > 0.6 ? 'PERSISTANT' : hurst < 0.4 ? 'ANTI-PERSISTANT' : 'RANDOM'
      });
    }

    const sums = history.map((d: any) => d.gagnants.reduce((a:number, b:number) => a + b, 0));
    const stdDev = calculateStandardDeviation(sums);
    const volScore = Math.min(100, Math.round(stdDev / 2));
    const autoCorr1 = calculateAutocorrelation(sums, 1);
    const autoCorr5 = calculateAutocorrelation(sums, 5);

    let spatialDensity = 0;
    history.slice(0, 50).forEach((d: any) => {
        const sorted = [...d.gagnants].sort((a:number,b:number)=>a-b);
        let gapsSum = 0;
        for(let i=0; i<sorted.length-1; i++) gapsSum += (sorted[i+1] - sorted[i]);
        if (gapsSum < 40) spatialDensity += 1;
    });
    spatialDensity = Math.min(100, (spatialDensity / 50) * 100);

    const volatility = {
        score: volScore,
        status: volScore > 60 ? 'Chaos' : volScore > 35 ? 'Volatile' : 'Stable',
        trend: sums[0] > calculateMean(sums) ? 'up' : 'down',
        autoCorrelation: parseFloat(autoCorr1.toFixed(3)),
        weeklyCycle: parseFloat(autoCorr5.toFixed(3)),
        spatialDensity: Math.round(spatialDensity)
    };

    const lastDate = history[0].date;

    const { error } = await supabaseAdmin.from('draw_analytics').upsert({
      draw_name: drawName,
      date: lastDate, 
      spectral,
      fractal,
      volatility,
      updated_at: new Date().toISOString()
    }, { onConflict: 'draw_name, date' });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, drawName, metrics: { volatility } }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
