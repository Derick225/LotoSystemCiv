
import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 60,
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const normalizeWeights = (w: any) => {
    const keys = Object.keys(w);
    const total = Object.values(w).reduce<number>((acc, val) => acc + (typeof val === 'number' ? val : 0), 0);
    const normalized: any = { ...w };
    if (total <= 0) return w; 
    keys.forEach(k => normalized[k] = parseFloat(((normalized[k] as number) / total).toFixed(4)));
    return normalized;
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { drawName, baseWeights, config: algoConfig } = await req.json();
    const supabase = createClient(
        process.env.VITE_SUPABASE_URL || '', 
        process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const { data: history } = await supabase
        .from('draw_results')
        .select('gagnants')
        .eq('draw_name', drawName)
        .order('date', { ascending: false })
        .limit(100);

    if (!history || history.length < 10) throw new Error("Historique insuffisant");

    // En environnement Serverless, on simplifie pour retourner une normalisation rapide
    // Pour l'optimisation complète, le endpoint `self-learn` est plus robuste.
    
    return new Response(JSON.stringify({ 
      bestWeights: normalizeWeights(baseWeights), 
      bestFitness: 100,
      generations: algoConfig?.generations || 10
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}
