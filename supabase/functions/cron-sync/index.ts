
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapping des noms pour normalisation stricte (API Externe -> Interne)
const DRAW_NAMES_MAP: Record<string, string> = {
  "REVEIL": "Reveil", 
  "ETOILE": "Etoile", 
  "AKWABA": "Akwaba", 
  "MONDAY SPECIAL": "Monday Special",
  
  "LA MATINALE": "La Matinale", 
  "EMERGENCE": "Emergence", 
  "SIKA": "Sika", 
  "LUCKY TUESDAY": "Lucky Tuesday",
  
  "PREMIERE HEURE": "Premiere Heure", 
  "FORTUNE": "Fortune", 
  "BARAKA": "Baraka", 
  "MIDWEEK": "Midweek",
  
  "KADO": "Kado", 
  "PRIVILEGE": "Privilege", 
  "MONNI": "Monni", 
  "FORTUNE THURSDAY": "Fortune Thursday",
  
  "CASH": "Cash", 
  "SOLUTION": "Solution", 
  "WARI": "Wari", 
  "FRIDAY BONANZA": "Friday Bonanza",
  
  "SOUTRA": "Soutra", 
  "DIAMANT": "Diamant", 
  "MOAYE": "Moaye", 
  "NATIONAL": "National",
  
  "BENEDICTION": "Benediction", 
  "PRESTIGE": "Prestige", 
  "AWALE": "Awale", 
  "ESPOIR": "Espoir"
};

const formatMonth = (date: Date) => {
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseKey) throw new Error("Configuration Supabase manquante.");

    const supabase = createClient(supabaseUrl, supabaseKey);
    let body: any = {};
    try { body = await req.json(); } catch(e) {}
    
    const targetDrawName = body.drawName;
    const manualTrigger = body.manualTrigger === true;

    // Stratégie d'optimisation : On ne charge que le mois en cours par défaut
    // Sauf si c'est un trigger manuel ou si on est en début de mois (pour attraper la fin du mois précédent)
    const now = new Date();
    const months = [formatMonth(now)];
    
    if (manualTrigger || now.getDate() <= 3) {
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        months.push(formatMonth(prev));
    }

    let totalInserted = 0;

    for (const monthParam of months) {
        // Timeout protection loop
        try {
            const targetUrl = `https://lotobonheur.ci/api/results?month=${encodeURIComponent(monthParam)}`;
            const response = await fetch(targetUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (NexusEngine/11.0)', 'Accept': 'application/json' }
            });

            if (!response.ok) continue;

            const data = await response.json();
            const weeks = data.drawsResultsWeekly || [];
            const currentYear = new Date().getFullYear().toString();
            const batchUpsert = [];

            for (const week of weeks) {
                const yearMatch = week.startDate ? week.startDate.match(/\d{4}$/) : null;
                const year = yearMatch ? yearMatch[0] : currentYear;

                if (!week.drawResultsDaily) continue;

                for (const daily of week.drawResultsDaily) {
                    const dateStr = daily.date; 
                    const dateMatch = dateStr.match(/(\d{2})\/(\d{2})/);
                    if (!dateMatch) continue;
                    
                    const dbDate = `${year}-${dateMatch[2]}-${dateMatch[1]}`;
                    
                    const apiDraws = [
                        ...(daily.drawResults?.standardDraws || []),
                        ...(daily.drawResults?.turboDraws || [])
                    ];

                    for (const draw of apiDraws) {
                        let rawName = (draw.drawName || "").trim().toUpperCase();
                        rawName = rawName.replace(/^TIRAGE\s+/, "");

                        // Normalisation stricte via la MAP
                        const canonicalName = DRAW_NAMES_MAP[rawName];
                        if (!canonicalName) continue;

                        if (targetDrawName && targetDrawName !== 'ALL' && canonicalName.toUpperCase() !== targetDrawName.toUpperCase()) {
                            continue;
                        }

                        if (!draw.winningNumbers || draw.winningNumbers.includes('..')) continue;

                        const win = (draw.winningNumbers.match(/\d+/g) || []).map(Number).slice(0, 5);
                        const mac = (draw.machineNumbers?.match(/\d+/g) || []).map(Number).slice(0, 5);

                        if (win.length === 5) {
                            batchUpsert.push({
                                draw_name: canonicalName,
                                date: dbDate,
                                gagnants: win,
                                machine: mac.length === 5 ? mac : [],
                                version: 1,
                                updated_at: new Date().toISOString()
                            });
                        }
                    }
                }
            }

            if (batchUpsert.length > 0) {
                // Batch insert pour la performance
                const { error } = await supabase
                    .from('draw_results')
                    .upsert(batchUpsert, { onConflict: 'draw_name, date' });

                if (error) console.error(`DB Error:`, error);
                else totalInserted += batchUpsert.length;
            }
        } catch (e) {
            console.error(`Error processing month ${monthParam}:`, e);
        }
    }

    return new Response(JSON.stringify({ 
        success: true, 
        count: totalInserted,
        message: `Sync OK : ${totalInserted} entrées.`
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
