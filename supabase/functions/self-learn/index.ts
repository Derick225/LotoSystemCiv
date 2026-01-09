
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONFIG = {
    POPULATION_SIZE: 15,
    GENERATIONS: 8,
    SAMPLE_DEPTH: 20
};

// Fitness function simplifiée
const quickFitness = (weights: any, history: any[], metrics: any) => {
    let score = 0;
    const wFreq = weights.frequency || 0.1;
    // On utilise les métriques pré-calculées
    if (metrics.hotNumbers) {
        for(const num of metrics.hotNumbers) {
            score += wFreq * 10;
        }
    }
    return score;
};

const mutate = (weights: any) => {
    const newW = { ...weights };
    const keys = Object.keys(newW);
    if (keys.length === 0) return newW;
    
    const key = keys[Math.floor(Math.random() * keys.length)];
    const noise = (Math.random() - 0.5) * 0.3;
    newW[key] = Math.max(0.01, Math.min(1.0, (newW[key] || 0.1) + noise));
    return newW;
};

serve(async (req: Request) => {
  // 1. Gestion CORS immédiate (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
        throw new Error("Configuration Serveur Incomplète : SUPABASE_SERVICE_ROLE_KEY manquante.");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Parsing sécurisé du body
    let body;
    try {
        body = await req.json();
    } catch (e) {
        throw new Error("Corps de requête JSON invalide.");
    }
    
    const { drawName } = body;
    if (!drawName) throw new Error("Paramètre 'drawName' requis.");

    // 2. Récupération Données
    const { data: history, error: dbError } = await supabase
        .from('draw_results')
        .select('gagnants')
        .eq('draw_name', drawName)
        .order('date', { ascending: false })
        .limit(CONFIG.SAMPLE_DEPTH + 5);

    if (dbError) throw new Error(`Erreur DB: ${dbError.message}`);

    const { data: currentW } = await supabase
        .from('algo_weights')
        .select('weights')
        .eq('draw_name', drawName)
        .single();

    if (!history || history.length < 10) {
        return new Response(JSON.stringify({ 
            success: false, 
            message: "Historique insuffisant pour l'apprentissage." 
        }), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    // 3. Logique Métier (Optimisation)
    const counts: Record<number, number> = {};
    history.forEach((d: any) => {
        if (Array.isArray(d.gagnants)) {
            d.gagnants.forEach((n: number) => counts[n] = (counts[n]||0)+1);
        }
    });
    
    const hotNumbers = Object.entries(counts)
        .sort((a:any, b:any) => b[1]-a[1])
        .slice(0, 10)
        .map(x => parseInt(x[0]));
        
    const metrics = { hotNumbers };

    let bestWeights = currentW?.weights || { 
        frequency: 0.2, gap: 0.2, spectral: 0.1, markov: 0.2, spatial: 0.1 
    };
    
    let bestScore = quickFitness(bestWeights, history, metrics);
    let improved = false;

    // Boucle génétique
    for (let g = 0; g < CONFIG.GENERATIONS; g++) {
        for (let p = 0; p < CONFIG.POPULATION_SIZE; p++) {
            const candidate = mutate(bestWeights);
            const score = quickFitness(candidate, history, metrics);
            
            if (score > bestScore) {
                bestScore = score;
                bestWeights = candidate;
                improved = true;
            }
        }
    }

    // 4. Sauvegarde
    if (improved) {
        await supabase.from('algo_weights').upsert({
            draw_name: drawName,
            weights: bestWeights,
            updated_at: new Date().toISOString()
        });
    }

    return new Response(JSON.stringify({ 
        success: true, 
        improved, 
        message: improved ? "Optimisation réussie (Nouveaux poids appliqués)." : "Modèle stable (Aucune mutation bénéfique).",
        weights: bestWeights 
    }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: any) {
    // Catch-all pour garantir le retour JSON avec CORS
    console.error("Self-Learn Error:", error);
    return new Response(JSON.stringify({ 
        success: false, 
        error: error.message || "Erreur interne inconnue" 
    }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});