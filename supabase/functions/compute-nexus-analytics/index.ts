
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { drawName } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase config error");

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // 1. Récupération de l'historique (100 derniers tirages)
    const { data: history } = await supabaseAdmin
      .from('draw_results')
      .select('gagnants, date')
      .eq('draw_name', drawName)
      .order('date', { ascending: false })
      .limit(100);

    if (!history || history.length < 15) throw new Error("Données insuffisantes pour le calcul.");

    const N = history.length;
    const spectral = [];
    const fractal = [];

    // 2. Calculs Mathématiques Intensifs
    for (let num = 1; num <= 90; num++) {
      const signal = history.map(d => (d.gagnants.includes(num) ? 1 : 0));
      const mean = signal.reduce((a, b) => a + b, 0) / N;
      
      // FFT Simplifiée (Spectral Energy)
      let maxPower = 0;
      // On scanne jusqu'à Nyquist
      for (let k = 1; k < N / 2; k++) {
        let re = 0, im = 0;
        for (let t = 0; t < N; t++) {
          const angle = (2 * Math.PI * k * t) / N;
          re += (signal[t] - mean) * Math.cos(angle);
          im -= (signal[t] - mean) * Math.sin(angle);
        }
        maxPower = Math.max(maxPower, (re * re + im * im) / N);
      }
      spectral.push({ number: num, energy: Math.min(100, Math.round(maxPower * 600)) });

      // Exposant de Hurst (R/S Analysis simplifié)
      const x = signal.map(v => v - mean);
      let cumsum = 0;
      const y = x.map(v => (cumsum += v, cumsum));
      const minY = Math.min(...y);
      const maxY = Math.max(...y);
      const R = maxY - minY;
      const variance = x.reduce((a, v) => a + v * v, 0) / N;
      const S = Math.sqrt(variance) || 1;
      
      let h = 0.5;
      if (R > 0 && S > 0) {
          h = Math.log(R / S) / Math.log(N);
      }
      
      const clampedH = Math.max(0, Math.min(1, isNaN(h) ? 0.5 : h));
      fractal.push({ number: num, hurst: parseFloat(clampedH.toFixed(3)) });
    }

    // 3. Sauvegarde en base (Table draw_analytics)
    const { error } = await supabaseAdmin.from('draw_analytics').upsert({
      draw_name: drawName,
      date: history[0].date, // Lié à la date du dernier tirage connu
      spectral,
      fractal,
      updated_at: new Date().toISOString()
    }, { onConflict: 'draw_name, date' });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, count: 90 }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
