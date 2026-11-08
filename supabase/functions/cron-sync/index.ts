import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

// Noms API (normalisés) -> noms internes
const DRAW_NAMES_MAP: Record<string, string> = {
  "REVEIL": "Reveil", "ETOILE": "Etoile", "AKWABA": "Akwaba", "MONDAY SPECIAL": "Monday Special",
  "LA MATINALE": "La Matinale", "EMERGENCE": "Emergence", "SIKA": "Sika", "LUCKY TUESDAY": "Lucky Tuesday",
  "PREMIERE HEURE": "Premiere Heure", "FORTUNE": "Fortune", "BARAKA": "Baraka", "MIDWEEK": "Midweek",
  "KADO": "Kado", "PRIVILEGE": "Privilege", "MONNI": "Monni", "FORTUNE THURSDAY": "Fortune Thursday",
  "CASH": "Cash", "SOLUTION": "Solution", "WARI": "Wari", "FRIDAY BONANZA": "Friday Bonanza",
  "SOUTRA": "Soutra", "DIAMANT": "Diamant", "MOAYE": "Moaye", "NATIONAL": "National",
  "BENEDICTION": "Benediction", "PRESTIGE": "Prestige", "AWALE": "Awale", "ESPOIR": "Espoir",
}

// Planning hebdomadaire attendu (getUTCDay : 0 = dimanche), aligné sur src/config/networks.ts
const DRAW_SCHEDULE: Record<number, string[]> = {
  1: ['Reveil', 'Etoile', 'Akwaba', 'Monday Special'],
  2: ['La Matinale', 'Emergence', 'Sika', 'Lucky Tuesday'],
  3: ['Premiere Heure', 'Fortune', 'Baraka', 'Midweek'],
  4: ['Kado', 'Privilege', 'Monni', 'Fortune Thursday'],
  5: ['Cash', 'Solution', 'Wari', 'Friday Bonanza'],
  6: ['Soutra', 'Diamant', 'Moaye', 'National'],
  0: ['Benediction', 'Prestige', 'Awale', 'Espoir'],
}

const GRACE_DAYS = 2        // délai avant de considérer un tirage absent comme annulé
const ACTIVE_WINDOW_DAYS = 21
const MAX_EXECUTION_TIME = 45000

const formatMonth = (date: Date) => {
  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startedAt = new Date()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !supabaseKey) return json({ success: false, error: 'Configuration Supabase manquante.' }, 500)

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

  // --- Authentification : secret dédié (pg_cron) ou clé service_role (appel interne) ---
  let triggerSource: 'cron' | 'internal' | null = null
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret) {
    const { data } = await supabase.rpc('verify_cron_secret', { p_secret: cronSecret })
    if (data === true) triggerSource = 'cron'
  }
  if (!triggerSource) {
    const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (bearer && bearer === supabaseKey) triggerSource = 'internal'
  }
  if (!triggerSource) return json({ error: 'Non autorisé.' }, 401)

  const body = await req.json().catch(() => ({}))
  const targetDrawName: string | undefined = body.drawName
  const manualTrigger = body.manualTrigger === true

  const log = {
    months: [] as string[],
    fetched_draws: 0,
    upserted: 0,
    unknown: new Set<string>(),
    missing: [] as Array<{ draw_name: string; date: string }>,
    cancelled_inferred: 0,
    http_errors: [] as Array<{ month: string; status: number | string }>,
    errors: [] as string[],
  }

  try {
    const now = new Date()
    const today = isoDay(now)
    const cutoff = isoDay(new Date(now.getTime() - GRACE_DAYS * 86400000))
    const months = [formatMonth(now)]
    if (manualTrigger || now.getDate() <= 3) {
      months.push(formatMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1)))
    }

    // Tirages "actifs" = ayant au moins un résultat récent (gère les changements de grille)
    const activeSince = isoDay(new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 86400000))
    const { data: recent } = await supabase.from('draw_results').select('draw_name').gte('date', activeSince).limit(2000)
    const activeNames = new Set<string>((recent || []).map((r: { draw_name: string }) => r.draw_name))

    for (const monthParam of months) {
      log.months.push(monthParam)
      try {
        const response = await fetch(`https://lotobonheur.ci/api/results?month=${encodeURIComponent(monthParam)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (NexusEngine/12.0)', 'Accept': 'application/json' },
          signal: AbortSignal.timeout(20000),
        })
        if (!response.ok) { log.http_errors.push({ month: monthParam, status: response.status }); continue }

        const data = await response.json()
        const rows: Array<Record<string, unknown>> = []
        const dayBlocks = new Set<string>()
        const foundKeys = new Set<string>()

        for (const week of data.drawsResultsWeekly || []) {
          const yearMatch = week.startDate ? String(week.startDate).match(/\d{4}$/) : null
          const startYear = yearMatch ? parseInt(yearMatch[0]) : now.getFullYear()
          for (const daily of week.drawResultsDaily || []) {
            const dateMatch = String(daily.date || '').match(/(\d{2})\/(\d{2})/)
            if (!dateMatch) continue
            let year = startYear
            const sd = String(week.startDate || '')
            if (dateMatch[2] === '01' && (sd.includes('/12/') || sd.includes('-12-'))) year += 1
            else if (dateMatch[2] === '12' && (sd.includes('/01/') || sd.includes('-01-'))) year -= 1
            const dbDate = `${year}-${dateMatch[2]}-${dateMatch[1]}`
            dayBlocks.add(dbDate)

            const apiDraws = [...(daily.drawResults?.standardDraws || []), ...(daily.drawResults?.turboDraws || [])]
            for (const draw of apiDraws) {
              let rawName = String(draw.drawName || '').trim().toUpperCase().replace(/^TIRAGE\s+/, '')
              rawName = rawName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
              const win = (String(draw.winningNumbers || '').match(/\d+/g) || []).map(Number).slice(0, 5)
              if (win.length !== 5) continue // placeholder ". - . -" : tirage pas encore effectué

              const canonicalName = DRAW_NAMES_MAP[rawName]
              if (!canonicalName) { if (rawName && rawName !== '-') log.unknown.add(String(draw.drawName).trim()); continue }
              if (targetDrawName && targetDrawName !== 'ALL' && canonicalName.toUpperCase() !== targetDrawName.toUpperCase()) continue

              const mac = (String(draw.machineNumbers || '').match(/\d+/g) || []).map(Number).slice(0, 5)
              rows.push({ draw_name: canonicalName, date: dbDate, gagnants: win, machine: mac.length === 5 ? mac : [], version: 1 })
              foundKeys.add(`${canonicalName}|${dbDate}`)
            }
          }
        }
        log.fetched_draws += rows.length
        if (dayBlocks.size === 0) continue

        const sortedDays = [...dayBlocks].sort()
        const minDate = sortedDays[0], maxDate = sortedDays[sortedDays.length - 1]

        // État actuel en base pour ne réécrire que le nécessaire
        const { data: existing } = await supabase.from('draw_results').select('draw_name,date,gagnants').gte('date', minDate).lte('date', maxDate).limit(5000)
        const existingMap = new Map<string, string>((existing || []).map((r: any) => [`${r.draw_name}|${r.date}`, (r.gagnants || []).join(',')]))
        const { data: cancels } = await supabase.from('draw_cancellations').select('draw_name,date,source').gte('date', minDate).lte('date', maxDate)
        const cancelMap = new Map<string, string>((cancels || []).map((c: any) => [`${c.draw_name}|${c.date}`, c.source]))

        const changed = rows.filter(r => existingMap.get(`${r.draw_name}|${r.date}`) !== (r.gagnants as number[]).join(','))
        let toProcess: Array<{ id: string; draw_name: string }> = []

        if (changed.length > 0) {
          const nowIso = new Date().toISOString()
          const { data: upserted, error } = await supabase.from('draw_results')
            .upsert(changed.map(r => ({ ...r, updated_at: nowIso })), { onConflict: 'draw_name,date' }).select()
          if (error) { log.errors.push(`upsert ${monthParam}: ${error.message}`) }
          else { log.upserted += changed.length; toProcess = upserted || [] }
        }

        // Un résultat est finalement arrivé : on retire l'annulation déduite automatiquement
        for (const key of foundKeys) {
          if (cancelMap.get(key) === 'auto') {
            const [name, date] = key.split('|')
            await supabase.from('draw_cancellations').delete().eq('draw_name', name).eq('date', date).eq('source', 'auto')
            cancelMap.delete(key)
          }
        }

        // Tirages attendus mais absents du site alors que le jour est publié => annulation probable
        const autoCancel: Array<Record<string, unknown>> = []
        for (const day of sortedDays) {
          if (day >= today) continue
          const expected = DRAW_SCHEDULE[new Date(`${day}T00:00:00Z`).getUTCDay()] || []
          for (const name of expected) {
            const key = `${name}|${day}`
            if (!activeNames.has(name) || foundKeys.has(key) || existingMap.has(key) || cancelMap.has(key)) continue
            if (day <= cutoff) {
              autoCancel.push({ draw_name: name, date: day, source: 'auto', reason: `Absent du site officiel plus de ${GRACE_DAYS} jours après la date` })
            } else {
              log.missing.push({ draw_name: name, date: day }) // dans le délai de grâce : simple surveillance
            }
          }
        }
        if (autoCancel.length > 0) {
          const { error } = await supabase.from('draw_cancellations').upsert(autoCancel, { onConflict: 'draw_name,date', ignoreDuplicates: true })
          if (error) log.errors.push(`cancellations: ${error.message}`)
          else log.cancelled_inferred += autoCancel.length
        }

        // Autopsie / auto-apprentissage : uniquement pour les résultats nouveaux ou modifiés
        const started = startedAt.getTime()
        for (const result of toProcess) {
          if (Date.now() - started > MAX_EXECUTION_TIME) { log.errors.push('timeout avant la fin des autopsies'); break }
          const { data: pending } = await supabase.from('prediction_snapshots').select('id').eq('draw_name', result.draw_name).eq('status', 'PENDING')
          if (!pending || pending.length === 0) continue
          for (let i = 0; i < pending.length; i += 5) {
            await Promise.all(pending.slice(i, i + 5).map((snap: { id: string }) =>
              supabase.functions.invoke('forensic-autopsy', { body: { snapshotId: snap.id, drawResultId: (result as any).id } })
                .catch((e: unknown) => console.error(`autopsy ${snap.id}:`, e))))
          }
          await supabase.functions.invoke('self-learn', { body: { drawName: result.draw_name } })
            .catch((e: unknown) => console.error('self-learn:', e))
        }
      } catch (e) {
        log.errors.push(`${monthParam}: ${(e as Error).message}`)
      }
    }
  } catch (e) {
    log.errors.push((e as Error).message)
  }

  const noData = log.fetched_draws === 0 && log.upserted === 0
  const status = log.errors.length === 0 && log.http_errors.length === 0 ? 'success'
    : (noData && (log.errors.length > 0 || log.http_errors.length >= Math.max(1, log.months.length))) ? 'error' : 'partial'

  const { data: logRow } = await supabase.from('sync_logs').insert({
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    trigger_source: triggerSource,
    status,
    months: log.months,
    fetched_draws: log.fetched_draws,
    upserted: log.upserted,
    unknown_draw_names: [...log.unknown],
    missing: log.missing,
    cancelled_inferred: log.cancelled_inferred,
    http_errors: log.http_errors,
    error: log.errors.length ? log.errors.join(' | ').slice(0, 2000) : null,
    duration_ms: Date.now() - startedAt.getTime(),
  }).select('id').single()

  return json({
    success: status !== 'error', status, fetched: log.fetched_draws, upserted: log.upserted,
    cancelled_inferred: log.cancelled_inferred, missing_pending: log.missing.length, log_id: logRow?.id ?? null,
  }, status === 'error' ? 500 : 200)
})
