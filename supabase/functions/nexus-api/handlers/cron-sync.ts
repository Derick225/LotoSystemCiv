import { createClient } from 'supabase'
import { handleForensicAutopsy } from './forensic-autopsy.ts'
import { handleSelfLearn } from './self-learn.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Mapping des noms pour normalisation stricte (API Externe -> Interne)
const DRAW_NAMES_MAP: Record<string, string> = {
  "REVEIL": "Reveil", "ETOILE": "Etoile", "AKWABA": "Akwaba", "MONDAY SPECIAL": "Monday Special",
  "LA MATINALE": "La Matinale", "EMERGENCE": "Emergence", "SIKA": "Sika", "LUCKY TUESDAY": "Lucky Tuesday",
  "PREMIERE HEURE": "Premiere Heure", "FORTUNE": "Fortune", "BARAKA": "Baraka", "MIDWEEK": "Midweek",
  "KADO": "Kado", "PRIVILEGE": "Privilege", "MONNI": "Monni", "FORTUNE THURSDAY": "Fortune Thursday",
  "CASH": "Cash", "SOLUTION": "Solution", "WARI": "Wari", "FRIDAY BONANZA": "Friday Bonanza",
  "SOUTRA": "Soutra", "DIAMANT": "Diamant", "MOAYE": "Moaye", "NATIONAL": "National",
  "BENEDICTION": "Benediction", "PRESTIGE": "Prestige", "AWALE": "Awale", "ESPOIR": "Espoir"
}

const formatMonth = (date: Date) => {
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`
}

export async function handleCronSync(req: Request, reqBody?: any): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Configuration Supabase manquante.")
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Sécurisation de l'endpoint
    const authHeader = req.headers.get('Authorization')
    let isAuthorized = false

    if (authHeader) {
        const token = authHeader.replace('Bearer ', '')
        if (token === supabaseKey || token === Deno.env.get('SUPABASE_ANON_KEY')) {
            isAuthorized = true
        } else {
            const { data: { user }, error } = await supabase.auth.getUser(token)
            if (user && !error) isAuthorized = true
        }
    }

    if (!isAuthorized) {
        return new Response(JSON.stringify({ error: "Non autorisé." }), { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
    }

    const body = reqBody || await req.json().catch(() => ({}))
    const targetDrawName = body.drawName
    const manualTrigger = body.manualTrigger === true

    const CRON_START = Date.now()
    const MAX_EXECUTION_TIME = 45000 // 45 seconds max

    const now = new Date()
    const months = [formatMonth(now)]
    
    if (manualTrigger || now.getDate() <= 3) {
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        months.push(formatMonth(prev))
    }

    let totalInserted = 0

    for (const monthParam of months) {
        try {
            const targetUrl = `https://lotobonheur.ci/api/results?month=${encodeURIComponent(monthParam)}`
            const response = await fetch(targetUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (NexusEngine/12.0)', 'Accept': 'application/json' }
            })

            if (!response.ok) continue

            const data = await response.json()
            const weeks = data.drawsResultsWeekly || []
            const batchUpsert = []

            for (const week of weeks) {
                const yearMatch = week.startDate ? week.startDate.match(/\d{4}$/) : null
                const startYear = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear()

                if (!week.drawResultsDaily) continue

                for (const daily of week.drawResultsDaily) {
                    const dateStr = daily.date 
                    const dateMatch = dateStr.match(/(\d{2})\/(\d{2})/)
                    if (!dateMatch) continue
                    
                    let currentYear = startYear
                    if (dateMatch[2] === '01' && week.startDate && (week.startDate.includes('/12/') || week.startDate.includes('-12-'))) {
                        currentYear += 1
                    } else if (dateMatch[2] === '12' && week.startDate && (week.startDate.includes('/01/') || week.startDate.includes('-01-'))) {
                        currentYear -= 1
                    }
                    
                    const dbDate = `${currentYear}-${dateMatch[2]}-${dateMatch[1]}`
                    
                    const apiDraws = [
                        ...(daily.drawResults?.standardDraws || []),
                        ...(daily.drawResults?.turboDraws || [])
                    ]

                    for (const draw of apiDraws) {
                        let rawName = (draw.drawName || "").trim().toUpperCase()
                        rawName = rawName.replace(/^TIRAGE\s+/, "")
                        rawName = rawName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")

                        const canonicalName = DRAW_NAMES_MAP[rawName]
                        if (!canonicalName) continue

                        if (targetDrawName && targetDrawName !== 'ALL' && canonicalName.toUpperCase() !== targetDrawName.toUpperCase()) {
                            continue
                        }

                        if (!draw.winningNumbers || draw.winningNumbers.includes('..')) continue

                        const win = (draw.winningNumbers.match(/\d+/g) || []).map(Number).slice(0, 5)
                        const mac = (draw.machineNumbers?.match(/\d+/g) || []).map(Number).slice(0, 5)

                        if (win.length === 5) {
                            batchUpsert.push({
                                draw_name: canonicalName,
                                date: dbDate,
                                gagnants: win,
                                machine: mac.length === 5 ? mac : [],
                                version: 1,
                                updated_at: new Date().toISOString()
                            })
                        }
                    }
                }
            }

            if (batchUpsert.length > 0) {
                const { data: upsertedData, error } = await supabase
                    .from('draw_results')
                    .upsert(batchUpsert, { onConflict: 'draw_name, date' })
                    .select()

                if (error) {
                    console.error(`DB Error:`, error)
                } else {
                    totalInserted += batchUpsert.length
                    
                    // AUTOMATISATION (4) : Déclenchement de l'autopsie et de l'apprentissage
                    if (upsertedData && upsertedData.length > 0) {
                        for (const result of upsertedData) {
                            if (Date.now() - CRON_START > MAX_EXECUTION_TIME) {
                                console.warn(`[CRON] Timeout imminent. Skipping autopsies for ${result.draw_name}.`)
                                break
                            }

                            const { data: pendingSnapshots } = await supabase
                                .from('prediction_snapshots')
                                .select('id')
                                .eq('draw_name', result.draw_name)
                                .eq('status', 'PENDING')
                                
                            if (pendingSnapshots && pendingSnapshots.length > 0) {
                                let autopsyCount = 0
                                const chunkSize = 5
                                for (let i = 0; i < pendingSnapshots.length; i += chunkSize) {
                                    const chunk = pendingSnapshots.slice(i, i + chunkSize)
                                    
                                    // Appel direct du handler forensic-autopsy
                                    await Promise.all(chunk.map(snap => 
                                        handleForensicAutopsy(req, { snapshotId: snap.id, drawResultId: result.id })
                                            .catch(e => console.error(`Forensic autopsy trigger error for ${snap.id}:`, e))
                                    ))
                                    autopsyCount += chunk.length
                                }
                                
                                if (autopsyCount > 0) {
                                    if (Date.now() - CRON_START > MAX_EXECUTION_TIME) {
                                        console.warn(`[CRON] Timeout imminent. Skipping self-learn for ${result.draw_name}.`)
                                    } else {
                                        // Appel direct du handler self-learn
                                        await handleSelfLearn(req, { drawName: result.draw_name })
                                            .catch(e => console.error("Self-learn trigger error:", e))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`Error processing month ${monthParam}:`, e)
        }
    }

    return new Response(JSON.stringify({ 
        success: true, 
        count: totalInserted,
        message: `Sync OK : ${totalInserted} entrées.`
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: unknown) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
