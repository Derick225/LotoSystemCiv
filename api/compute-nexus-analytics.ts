
import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- MATH UTILS OPTIMISÉS ---
const calculateMean = (data: number[]) => data.length === 0 ? 0 : data.reduce((a, b) => a + b, 0) / data.length;

const calculateStandardDeviation = (data: number[]) => {
    if (data.length === 0) return 0;
    const mean = calculateMean(data);
    const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
};

/**
 * Calcul de l'énergie spectrale optimisé (Moins de trigo, plus de rapidité)
 */
const calculateSpectralEnergy = (signal: number[]) => {
    const N = signal.length;
    if (N < 4) return 0;
    let maxPower = 0;
    const harmonics = Math.min(N / 2, 20); // Limité à 20 pour performance Edge
    
    const windowedSignal = signal.map((s, i) => s * (0.54 - 0.46 * Math.cos((6.283185 * i) / (N - 1))));
    
    for (let k = 1; k < harmonics; k++) {
        let re = 0, im = 0;
        const angleStep = (6.283185 * k) / N;
        for (let t = 0; t < N; t++) {
            const angle = angleStep * t;
            re += windowedSignal[t] * Math.cos(angle);
            im -= windowedSignal[t] * Math.sin(angle);
        }
        maxPower = Math.max(maxPower, (re * re + im * im) / (N * N));
    }
    return Math.min(100, Math.round(maxPower * 3000)); 
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
      .limit(200); // Réduit à 200 pour garantir le temps d'exécution

    if (fetchError || !history || history.length < 5) {
        return new Response(JSON.stringify({ message: "No data", drawName }), { headers: corsHeaders });
    }

    const spectral = [];
    const fractal = [];

    // Pipeline HPC condensé pour tenir dans le timeout Edge
    for (let num = 1; num <= 90; num++) {
      const signal = history.map(d => (d.gagnants.includes(num) ? 1 : 0));
      const energy = calculateSpectralEnergy(signal);
      
      spectral.push({ number: num, energy, resonance: energy > 75 });
      
      // Hurst ultra-rapide
      const mean = calculateMean(signal);
      const y = signal.map(x => x - mean);
      let cs = 0;
      const dev = y.map(v => { cs += v; return cs; });
      const R = Math.max(...dev) - Math.min(...dev);
      const S = calculateStandardDeviation(signal) || 1;
      const h = Math.log(R / S + 0.001) / Math.log(history.length);

      fractal.push({ 
          number: num, 
          hurst: parseFloat(Math.max(0, Math.min(1, h)).toFixed(3)),
          regime: h > 0.6 ? 'PERSISTANT' : h < 0.4 ? 'ANTI-PERSISTANT' : 'RANDOM'
      });
    }

    const sums = history.map((d: any) => d.gagnants.reduce((a:number, b:number) => a + b, 0));
    const stdDev = calculateStandardDeviation(sums);

    const volatility = {
        score: Math.min(100, Math.round(stdDev / 1.8)),
        status: stdDev > 45 ? 'Chaos' : stdDev > 25 ? 'Volatile' : 'Stable',
        updated_at: new Date().toISOString()
    };

    const { error } = await supabaseAdmin.from('draw_analytics').upsert({
      draw_name: drawName,
      date: history[0].date, 
      spectral,
      fractal,
      volatility
    }, { onConflict: 'draw_name, date' });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, drawName }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
