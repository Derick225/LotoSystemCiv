import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- DATA SCIENCE KERNEL (Optimized for Edge) ---

const calculateMean = (data: number[]) => {
    if (data.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length;
};

const calculateStandardDeviation = (data: number[]) => {
    if (data.length < 2) return 0;
    const mean = calculateMean(data);
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) sumSq += (data[i] - mean) ** 2;
    return Math.sqrt(sumSq / data.length);
};

/**
 * Calcul de l'Énergie Spectrale (Approximation FFT)
 * Détecte la périodicité d'un numéro.
 * Optimisé : Utilise une LUT pour le cos/sin si possible, ou boucle réduite.
 */
const calculateSpectralEnergy = (signal: number[]) => {
    const N = signal.length;
    if (N < 4) return 0;
    let maxPower = 0;
    // On analyse seulement les basses fréquences (cycles pertinents pour le loto)
    const harmonics = Math.min(N / 2, 16); 
    
    // Pré-calcul de la fenêtre de Hamming
    const window = new Float32Array(N);
    const PI2_N = (2 * Math.PI) / (N - 1);
    for(let i=0; i<N; i++) window[i] = 0.54 - 0.46 * Math.cos(PI2_N * i);

    for (let k = 1; k < harmonics; k++) {
        let re = 0, im = 0;
        const angleStep = (2 * Math.PI * k) / N;
        for (let t = 0; t < N; t++) {
            const wVal = signal[t] * window[t];
            // Si le signal est 0, on skip (optimisation pour signaux clairsemés)
            if (Math.abs(wVal) < 0.001) continue;
            
            const angle = angleStep * t;
            re += wVal * Math.cos(angle);
            im -= wVal * Math.sin(angle);
        }
        const power = (re * re + im * im);
        if (power > maxPower) maxPower = power;
    }
    // Normalisation heuristique
    return Math.min(100, Math.round(Math.sqrt(maxPower) * 25)); 
};

/**
 * Exposant de Hurst (R/S Analysis simplifié)
 * Mesure la persistance de la série temporelle.
 * H > 0.5 : Persistant (Tendance)
 * H < 0.5 : Anti-persistant (Retour à la moyenne)
 */
const calculateHurst = (signal: number[]) => {
    const N = signal.length;
    if (N < 20) return 0.5; // Pas assez de données

    const mean = calculateMean(signal);
    const y = new Float32Array(N);
    for(let i=0; i<N; i++) y[i] = signal[i] - mean;
    
    let currentSum = 0;
    let maxCum = -Infinity;
    let minCum = Infinity;
    
    for(let i=0; i<N; i++) {
        currentSum += y[i];
        if(currentSum > maxCum) maxCum = currentSum;
        if(currentSum < minCum) minCum = currentSum;
    }

    const R = maxCum - minCum;
    const S = calculateStandardDeviation(signal);

    if (R === 0 || S === 0) return 0.5;

    // Formule Anis-Lloyd simplifiée
    const hurst = Math.log(R / S) / Math.log(N / 2);
    return Math.max(0.01, Math.min(0.99, hurst));
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { drawName } = await req.json();
    if (!drawName) throw new Error("Paramètre 'drawName' requis");

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) throw new Error("Erreur Configuration Supabase");

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // 1. Récupération optimisée (seulement les colonnes nécessaires)
    const { data: history, error: fetchError } = await supabaseAdmin
      .from('draw_results')
      .select('gagnants, date')
      .eq('draw_name', drawName)
      .order('date', { ascending: false })
      .limit(150); // Suffisant pour convergence mathématique

    if (fetchError || !history || history.length < 10) {
        return new Response(JSON.stringify({ message: "Données insuffisantes", drawName }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const spectral = [];
    const fractal = [];

    // 2. Traitement Vectoriel
    // On itère sur les 90 numéros
    for (let num = 1; num <= 90; num++) {
      // Transformation en signal binaire (Time Series)
      const signal = history.map(d => (d.gagnants.includes(num) ? 1 : 0));
      
      const energy = calculateSpectralEnergy(signal);
      const h = calculateHurst(signal);
      
      if (energy > 10 || Math.abs(h - 0.5) > 0.05) { // On ne stocke que ce qui est significatif
          spectral.push({ number: num, energy, resonance: energy > 70 });
          fractal.push({ 
              number: num, 
              hurst: parseFloat(h.toFixed(3)),
              regime: h > 0.55 ? 'PERSISTANT' : h < 0.45 ? 'ANTI-PERSISTANT' : 'RANDOM'
          });
      }
    }

    // 3. Calcul Volatilité Globale
    const sums = history.map((d: any) => d.gagnants.reduce((a:number, b:number) => a + b, 0));
    const stdDev = calculateStandardDeviation(sums);
    const volScore = Math.min(100, Math.round(stdDev / 1.8));

    const volatility = {
        score: volScore,
        status: volScore > 60 ? 'Chaos' : volScore > 30 ? 'Volatile' : 'Stable',
        updated_at: new Date().toISOString()
    };

    // 4. Sauvegarde
    const { error } = await supabaseAdmin.from('draw_analytics').upsert({
      draw_name: drawName,
      date: history[0].date, 
      spectral,
      fractal,
      volatility,
      updated_at: new Date().toISOString()
    }, { onConflict: 'draw_name, date' });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, drawName, metrics: { volatility } }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}