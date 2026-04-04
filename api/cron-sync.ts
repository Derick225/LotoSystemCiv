
import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 60,
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapping des noms pour normalisation stricte (API Externe -> Interne)
const DRAW_NAMES_MAP: Record<string, string> = {
  "REVEIL": "Reveil", "ETOILE": "Etoile", "AKWABA": "Akwaba", "MONDAY SPECIAL": "Monday Special",
  "LA MATINALE": "La Matinale", "EMERGENCE": "Emergence", "SIKA": "Sika", "LUCKY TUESDAY": "Lucky Tuesday",
  "PREMIERE HEURE": "Premiere Heure", "FORTUNE": "Fortune", "BARAKA": "Baraka", "MIDWEEK": "Midweek",
  "KADO": "Kado", "PRIVILEGE": "Privilege", "MONNI": "Monni", "FORTUNE THURSDAY": "Fortune Thursday",
  "CASH": "Cash", "SOLUTION": "Solution", "WARI": "Wari", "FRIDAY BONANZA": "Friday Bonanza",
  "SOUTRA": "Soutra", "DIAMANT": "Diamant", "MOAYE": "Moaye", "NATIONAL": "National",
  "BENEDICTION": "Benediction", "PRESTIGE": "Prestige", "AWALE": "Awale", "ESPOIR": "Espoir"
};

const formatMonth = (date: Date) => {
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) throw new Error("Configuration Supabase manquante (SERVICE_ROLE_KEY).");

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Sécurisation de l'endpoint
    const authHeader = req.headers.get('Authorization');
    let isAuthorized = false;

    if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        // 1. Vérifier si c'est la clé Service Role (utilisée par le Cron Job)
        if (token === supabaseKey) {
            isAuthorized = true;
        } else {
            // 2. Vérifier si c'est un JWT utilisateur valide (déclenchement manuel)
            const { data: { user }, error } = await supabase.auth.getUser(token);
            if (user && !error) {
                isAuthorized = true;
            }
        }
    }

    if (!isAuthorized) {
        return new Response(JSON.stringify({ error: "Non autorisé. Jeton manquant ou invalide." }), { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    const body = await req.json().catch(() => ({}));
    
    const targetDrawName = body.drawName;
    const manualTrigger = body.manualTrigger === true;

    const now = new Date();
    const months = [formatMonth(now)];
    
    if (manualTrigger || now.getDate() <= 3) {
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        months.push(formatMonth(prev));
    }

    let totalInserted = 0;

    for (const monthParam of months) {
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
                const startYear = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();

                if (!week.drawResultsDaily) continue;

                for (const daily of week.drawResultsDaily) {
                    const dateStr = daily.date; 
                    const dateMatch = dateStr.match(/(\d{2})\/(\d{2})/);
                    if (!dateMatch) continue;
                    
                    let currentYear = startYear;
                    if (dateMatch[2] === '01' && week.startDate && (week.startDate.includes('/12/') || week.startDate.includes('-12-'))) {
                        currentYear += 1;
                    } else if (dateMatch[2] === '12' && week.startDate && (week.startDate.includes('/01/') || week.startDate.includes('-01-'))) {
                        currentYear -= 1;
                    }
                    
                    const dbDate = `${currentYear}-${dateMatch[2]}-${dateMatch[1]}`;
                    
                    const apiDraws = [
                        ...(daily.drawResults?.standardDraws || []),
                        ...(daily.drawResults?.turboDraws || [])
                    ];

                    for (const draw of apiDraws) {
                        let rawName = (draw.drawName || "").trim().toUpperCase();
                        rawName = rawName.replace(/^TIRAGE\s+/, "");
                        
                        // Normalize accents
                        rawName = rawName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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
                const { data: upsertedData, error } = await supabase
                    .from('draw_results')
                    .upsert(batchUpsert, { onConflict: 'draw_name, date' })
                    .select();

                if (error) {
                    console.error(`DB Error:`, error);
                } else {
                    totalInserted += batchUpsert.length;
                    
                    // AUTOMATISATION (4) : Déclenchement de l'autopsie et de l'apprentissage
                    if (upsertedData && upsertedData.length > 0) {
                        for (const result of upsertedData) {
                            // Chercher les prédictions en attente pour ce tirage
                            const { data: pendingSnapshots } = await supabase
                                .from('prediction_snapshots')
                                .select('id')
                                .eq('draw_name', result.draw_name)
                                .eq('status', 'PENDING');
                                
                            if (pendingSnapshots && pendingSnapshots.length > 0) {
                                let autopsyCount = 0;
                                for (const snap of pendingSnapshots) {
                                    console.log(`Triggering autopsy for snapshot ${snap.id} and result ${result.id}`);
                                    // Appeler la fonction d'autopsie
                                    await supabase.functions.invoke('forensic-autopsy', {
                                        body: { snapshotId: snap.id, drawResultId: result.id }
                                    }).catch(e => console.error("Forensic autopsy trigger error:", e));
                                    autopsyCount++;
                                }
                                
                                // Si on a fait au moins une autopsie, on déclenche le self-learning pour ce tirage
                                if (autopsyCount > 0) {
                                    console.log(`Triggering self-learning for ${result.draw_name}`);
                                    await supabase.functions.invoke('self-learn', {
                                        body: { drawName: result.draw_name }
                                    }).catch(e => console.error("Self-learn trigger error:", e));
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`Error processing month ${monthParam}:`, e);
        }
    }

    return new Response(JSON.stringify({ 
        success: true, 
        count: totalInserted,
        message: `Sync OK : ${totalInserted} entrées.`
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}