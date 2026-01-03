import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapping des noms de tirage (API -> Base de données)
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

const getMonthParams = () => {
    const now = new Date();
    const months = [];
    
    // Mois courant
    months.push(formatMonth(now));
    
    // Mois précédent (pour récupérer les tirages de fin de mois si on est au début du mois)
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    months.push(formatMonth(prev));
    
    return months;
};

const formatMonth = (date: Date) => {
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''; // CLEF SERVICE_ROLE OBLIGATOIRE POUR ÉCRIRE
    const supabase = createClient(supabaseUrl, supabaseKey);

    let body = {};
    try { body = await req.json(); } catch(e) {}
    const manualTrigger = (body as any).manualTrigger;
    const targetDrawName = (body as any).drawName;

    console.log(`[Sync] Démarrage de la synchronisation (Manuel: ${manualTrigger})...`);

    const months = getMonthParams();
    let totalInserted = 0;
    let totalProcessed = 0;

    for (const monthParam of months) {
        // 1. Appel API Externe
        const targetUrl = `https://lotobonheur.ci/api/results?month=${encodeURIComponent(monthParam)}`;
        console.log(`[Sync] Fetching ${monthParam}...`);
        
        const response = await fetch(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (NexusEngine/11.0)', 'Accept': 'application/json' }
        });

        if (!response.ok) {
            console.error(`[Sync] Erreur HTTP ${response.status} pour ${monthParam}`);
            continue;
        }

        const data = await response.json();
        const weeks = data.drawsResultsWeekly || [];
        const currentYear = new Date().getFullYear().toString(); // Fallback year

        const batchUpsert = [];

        // 2. Parsing et Normalisation
        for (const week of weeks) {
            const yearMatch = week.startDate ? week.startDate.match(/\d{4}$/) : null;
            const year = yearMatch ? yearMatch[0] : currentYear;

            if (!week.drawResultsDaily) continue;

            for (const daily of week.drawResultsDaily) {
                const dateStr = daily.date; 
                const dateMatch = dateStr.match(/(\d{2})\/(\d{2})/);
                if (!dateMatch) continue;
                
                // Format DB: YYYY-MM-DD
                const dbDate = `${year}-${dateMatch[2]}-${dateMatch[1]}`;

                const apiDraws = [
                    ...(daily.drawResults?.standardDraws || []),
                    ...(daily.drawResults?.turboDraws || [])
                ];

                for (const draw of apiDraws) {
                    let rawName = (draw.drawName || "").trim().toUpperCase();
                    rawName = rawName.replace(/^TIRAGE\s+/, "");

                    // Mapping vers nom canonique
                    const canonicalName = DRAW_NAMES_MAP[rawName];
                    if (!canonicalName) continue;

                    // Filtrage optionnel si un tirage spécifique est demandé
                    if (targetDrawName && targetDrawName !== 'ALL' && canonicalName.toUpperCase() !== targetDrawName.toUpperCase()) {
                        continue;
                    }

                    if (!draw.winningNumbers || draw.winningNumbers.includes('..') || draw.winningNumbers.startsWith('.')) continue;

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

        // 3. Upsert en base de données
        if (batchUpsert.length > 0) {
            const { data: inserted, error } = await supabase
                .from('draw_results')
                .upsert(batchUpsert, { onConflict: 'draw_name, date', ignoreDuplicates: false })
                .select();

            if (error) {
                console.error(`[Sync] Erreur DB:`, error);
                throw error;
            }
            
            totalInserted += inserted?.length || 0;
            totalProcessed += batchUpsert.length;
        }
    }

    console.log(`[Sync] Terminé. ${totalInserted} enregistrements mis à jour.`);

    return new Response(JSON.stringify({ 
        success: true, 
        count: totalInserted,
        processed: totalProcessed,
        message: `Synchronisation terminée : ${totalInserted} mises à jour.`
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (err: any) {
    console.error("[Sync] Exception:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});