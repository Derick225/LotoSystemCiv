
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    // Initialisation client Admin pour l'écriture (bypass RLS interne, mais on valide l'user avant)
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
    
    // 1. Validation de l'utilisateur (Sécurité)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        throw new Error("Token d'authentification manquant.");
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
        return new Response(JSON.stringify({ error: "Utilisateur non authentifié." }), { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    const { predictionId, rating, drawName, actualHits, user_comment } = await req.json();

    if (!predictionId) throw new Error("predictionId is required");

    // 2. Insertion sécurisée
    const { error } = await supabaseAdmin.from('prediction_feedback').upsert({
      prediction_id: predictionId,
      rating,
      draw_name: drawName,
      actual_hits: actualHits,
      user_comment,
      // On pourrait ajouter user_id ici si la table le supporte pour tracer qui a donné le feedback
      created_at: new Date().toISOString()
    });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});