
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Liste officielle des tirages à surveiller (UPPERCASE pour matching facile)
const TARGET_DRAWS = [
  'REVEIL', 'ETOILE', 'AKWABA', 'MONDAY SPECIAL',
  'LA MATINALE', 'EMERGENCE', 'SIKA', 'LUCKY TUESDAY',
  'PREMIERE HEURE', 'FORTUNE', 'BARAKA', 'MIDWEEK',
  'KADO', 'PRIVILEGE', 'MONNI', 'FORTUNE THURSDAY',
  'CASH', 'SOLUTION', 'WARI', 'FRIDAY BONANZA',
  'SOUTRA', 'DIAMANT', 'MOAYE', 'NATIONAL',
  'BENEDICTION', 'PRESTIGE', 'AWALE', 'ESPOIR'
];

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
    
    // Si on est en début de mois, on vérifie aussi le mois précédent pour éviter les trous
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
          const yearMatch = week.startDate ? week.startDate.match(/\d{4}$/) : null;
          const year = yearMatch ? yearMatch[0] : now.getFullYear().toString();

          if (!week.drawResultsDaily) continue;

          for (const daily of week.drawResultsDaily) {
            const dateMatch = daily.date.match(/(\d{2})\/(\d{2})/);
            if (!dateMatch) continue;
            
            const isoDate = `${year}-${dateMatch[2]}-${dateMatch[1]}`;

            const allDayDraws = [
              ...(daily.drawResults?.standardDraws || []),
              ...(daily.drawResults?.turboDraws || [])
            ];

            for (const draw of allDayDraws) {
              let drawName = (draw.drawName || "UNKNOWN").trim().toUpperCase();
              
              // Nettoyage standard (ex: "TIRAGE REVEIL" -> "REVEIL")
              drawName = drawName.replace(/^TIRAGE\s+/, "");

              // Vérification si c'est un tirage cible valide
              const matchedTarget = TARGET_DRAWS.find(t => drawName === t || drawName.includes(t));
              
              if (!matchedTarget) continue;

              if (draw.winningNumbers && !draw.winningNumbers.includes('..') && !draw.winningNumbers.startsWith('.')) {
                const win = (draw.winningNumbers.match(/\d+/g) || []).map(Number);
                const mac = (draw.machineNumbers?.match(/\d+/g) || []).map(Number);

                if (win.length === 5) {
                  // Normalisation en Title Case pour le front (ex: 'Reveil')
                  const formattedName = matchedTarget.charAt(0).toUpperCase() + matchedTarget.slice(1).toLowerCase().replace(/(\s[a-z])/g, (c) => c.toUpperCase());

                  drawsToUpsert.push({
                    draw_name: formattedName, 
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
          // Dédoublonnage avant insert pour éviter les erreurs batch
          const uniqueDraws = Array.from(new Map(drawsToUpsert.map(item => [`${item.draw_name}_${item.date}`, item])).values());

          const { error, data: inserted } = await supabaseAdmin
            .from('draw_results')
            .upsert(uniqueDraws, { onConflict: 'draw_name, date' })
            .select('id');
            
          if (error) {
              console.error("Supabase Upsert Error:", error);
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
