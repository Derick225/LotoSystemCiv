
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { month } = await req.json();
    if (!month) throw new Error("Paramètre 'month' manquant.");

    // Appel direct à l'API cible
    const targetUrl = `https://lotobonheur.ci/api/results?month=${encodeURIComponent(month)}`;
    
    console.log(`Proxying request to: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (NexusEngine/11.0)',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
        throw new Error(`Erreur source externe: ${response.status}`);
    }

    const data = await response.json();
    return new Response(JSON.stringify({ success: true, ...data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    // On renvoie 200 avec success: false pour que le client gère l'erreur proprement sans exception fetch
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: corsHeaders,
    });
  }
});
