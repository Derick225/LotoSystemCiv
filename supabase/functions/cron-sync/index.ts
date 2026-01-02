
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
    
    if (!supabaseUrl || !supabaseKey) {
        throw new Error("Configuration Supabase manquante (URL ou SERVICE_ROLE_KEY)");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
    
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const now = new Date();
    const monthsToFetch = [`${monthNames[now.getMonth()]} ${now.getFullYear()}`];
    
    // Si on est en début de mois (avant le 7), on vérifie aussi le mois précédent pour être sûr
    if (now.getDate() < 7) {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      monthsToFetch.push(`${monthNames[prev.getMonth()]} ${prev.getFullYear()}`);
    }

    let totalInserted = 0;

    for (const monthParam of monthsToFetch) {
      const targetUrl = `https://lotobonheur.ci/api/results?month=${encodeURIComponent(monthParam)}`;
      console.log(`Fetching: ${targetUrl}`);
      
      const res = await fetch(targetUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'NexusEngine/11.0' }
      });
      
      if (!res.ok) {
          console.error(`Failed to fetch ${monthParam}: ${res.status}`);
          continue;
      }
      
      const data = await res.json();

      if (data.drawsResultsWeekly) {
        const drawsToUpsert = [];
        for (const week of data.drawsResultsWeekly) {
          // Extraction année
          const yearMatch = week.startDate ? week.startDate.match(/\d{4}$/) : null;
          const year = yearMatch ? yearMatch[0] : now.getFullYear().toString();

          for (const daily of week.drawResultsDaily) {
            // Extraction date JJ/MM
            const dateMatch = daily.date.match(/(\d{2})\/(\d{2})/);
            if (!dateMatch) continue;
            
            // Format ISO YYYY-MM-DD pour la base de données
            const isoDate = `${year}-${dateMatch[2]}-${dateMatch[1]}`;

            const allDayDraws = [
              ...(daily.drawResults?.standardDraws || []),
              ...(daily.drawResults?.nightDraws || []),
              ...(daily.drawResults?.turboDraws || [])
            ];

            for (const draw of allDayDraws) {
              if (draw.winningNumbers && !draw.winningNumbers.includes('..') && !draw.winningNumbers.startsWith('.')) {
                const win = (draw.winningNumbers.match(/\d+/g) || []).map(Number);
                const mac = (draw.machineNumbers?.match(/\d+/g) || []).map(Number);

                if (win.length === 5) {
                  drawsToUpsert.push({
                    draw_name: (draw.drawName || "UNKNOWN").trim(),
                    date: isoDate,
                    gagnants: win,
                    machine: mac.length === 5 ? mac : [],
                    version: 1
                  });
                }
              }
            }
          }
        }

        if (drawsToUpsert.length > 0) {
          // Upsert en masse (nécessite une contrainte unique sur draw_name + date dans la DB)
          const { error, data: inserted } = await supabaseAdmin
            .from('draw_results')
            .upsert(drawsToUpsert, { onConflict: 'draw_name, date' })
            .select('id');
            
          if (error) {
              console.error("Supabase Error:", error);
          } else {
              totalInserted += (inserted?.length || 0);
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, count: totalInserted }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
