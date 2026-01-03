
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupération du body pour voir si l'appel vient du Cron ou de l'UI
    let body = {};
    try {
        body = await req.json();
    } catch(e) {
        // Body vide possible si appel direct sans payload
    }
    
    const source = (body as any).source || 'manual';
    console.log(`[Nexus Cron] Sync request received from: ${source}`);

    // LOGIQUE DE SCRAPING / SYNC ICI
    // Dans cette version "Copier-Coller", nous simulons l'action pour vérifier que le Cron fonctionne.
    // Pour une vraie synchro, vous pouvez appeler ici votre fonction `proxy-results` ou insérer les données.
    
    const timestamp = new Date().toISOString();
    
    // Pour le test : on insère une entrée de log ou on met à jour une stat si nécessaire
    // const { error } = await supabase.from('draw_analytics')....

    return new Response(JSON.stringify({ 
        success: true, 
        message: `Sync exécuté avec succès à ${timestamp}`,
        source: source
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (err: any) {
    console.error("[Nexus Cron] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});