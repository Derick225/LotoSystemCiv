
import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
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

    const { error } = await supabaseAdmin.from('prediction_feedback').upsert({
      prediction_id: predictionId,
      rating,
      draw_name: drawName,
      actual_hits: actualHits,
      user_comment,
      created_at: new Date().toISOString()
    });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}