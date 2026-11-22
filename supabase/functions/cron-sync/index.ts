import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import {
  DRAW_SCHEDULE_UTC_DAY,
  fetchLotobonheurMonthDraws,
  formatFrenchMonthParam,
  normalizeMonthParam,
  type ParsedOfficialDraw,
} from '../_shared/lotobonheur-parser.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const GRACE_DAYS = 2        // délai avant de considérer un tirage absent comme annulé
const ACTIVE_WINDOW_DAYS = 21
const MAX_EXECUTION_TIME = 45000

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const numbersKey = (nums: number[] | null | undefined) =>
  Array.isArray(nums) && nums.length > 0 ? nums.join(',') : ''

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
  const requestedMonths: string[] | undefined = Array.isArray(body.months) ? body.months : undefined
  const monthsBackRaw = typeof body.monthsBack === 'number' ? Math.max(0, Math.min(6, Math.floor(body.monthsBack))) : null

  const log = {
    months: [] as string[],
    fetched_draws: 0,
    upserted: 0,
    unknown: new Set<string>(),
    missing: [] as Array<{ draw_name: string; date: string }>,
    cancelled_inferred: 0,
    caught_up: 0,
    snapshots_cancelled: 0,
    http_errors: [] as Array<{ month: string; drawType?: string; status: number | string }>,
    errors: [] as string[],
  }

  try {
    const now = new Date()
    const today = isoDay(now)
    const cutoff = isoDay(new Date(now.getTime() - GRACE_DAYS * 86400000))

    let months: string[]
    if (requestedMonths && requestedMonths.length > 0) {
      months = [...new Set(requestedMonths.slice(0, 6).map((m) => normalizeMonthParam(m, now)))]
    } else {
      const backCount = monthsBackRaw !== null ? monthsBackRaw : ((manualTrigger || now.getDate() <= 3) ? 1 : 0)
      months = []
      for (let i = 0; i <= backCount; i++) {
        months.push(formatFrenchMonthParam(new Date(now.getFullYear(), now.getMonth() - i, 1)))
      }
    }

    // Tirages "actifs" = ayant au moins un résultat récent (gère les changements de grille)
    const activeSince = isoDay(new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 86400000))
    const { data: recent } = await supabase.from('draw_results').select('draw_name').gte('date', activeSince).limit(2000)
    const activeNames = new Set<string>((recent || []).map((r: { draw_name: string }) => r.draw_name))

    for (const monthParam of months) {
      log.months.push(monthParam)
      try {
        const parsed = await fetchLotobonheurMonthDraws({
          monthLabel: monthParam,
          targetDrawName,
          fallbackYear: now.getFullYear(),
          timeoutMs: 20000,
        })
        if (parsed.httpErrors.length > 0) {
          log.http_errors.push(...parsed.httpErrors)
        }
        parsed.unknown.forEach((u) => log.unknown.add(u))
        const rows: ParsedOfficialDraw[] = parsed.rows
        log.fetched_draws += rows.length

        if (parsed.dayBlocks.size === 0) continue

        const sortedDays = [...parsed.dayBlocks].sort()
        const minDate = sortedDays[0], maxDate = sortedDays[sortedDays.length - 1]

        // État actuel en base pour ne réécrire que le nécessaire (gagnants OU machine mis à jour)
        const { data: existing } = await supabase
          .from('draw_results')
          .select('draw_name,date,gagnants,machine')
          .gte('date', minDate)
          .lte('date', maxDate)
          .limit(5000)
        const existingMap = new Map<string, string>(
          (existing || []).map((r: any) => [
            `${r.draw_name}|${r.date}`,
            `${numbersKey(r.gagnants)}|${numbersKey(r.machine)}`,
          ])
        )
        const { data: cancels } = await supabase
          .from('draw_cancellations')
          .select('draw_name,date,source')
          .gte('date', minDate)
          .lte('date', maxDate)
        const cancelMap = new Map<string, string>((cancels || []).map((c: any) => [`${c.draw_name}|${c.date}`, c.source]))

        const changed = rows.filter(
          (r) => existingMap.get(`${r.draw_name}|${r.date}`) !== `${numbersKey(r.gagnants)}|${numbersKey(r.machine)}`
        )
        let toProcess: Array<{ id: string; draw_name: string; date: string }> = []

        if (changed.length > 0) {
          const nowIso = new Date().toISOString()
          for (let i = 0; i < changed.length; i += 200) {
            const slice = changed.slice(i, i + 200)
            const { data: upserted, error } = await supabase
              .from('draw_results')
              .upsert(slice.map((r) => ({ ...r, updated_at: nowIso })), { onConflict: 'draw_name,date' })
              .select('id,draw_name,date')
            if (error) {
              log.errors.push(`upsert ${monthParam}: ${error.message}`)
            } else {
              log.upserted += slice.length
              if (upserted) toProcess.push(...(upserted as Array<{ id: string; draw_name: string; date: string }>))
            }
          }
        }

        // Un résultat est finalement arrivé (ou déjà présent en base) : on retire toute annulation déduite automatiquement
        const publishedKeys = new Set<string>([...parsed.foundKeys, ...existingMap.keys()])
        for (const key of publishedKeys) {
          if (cancelMap.get(key) === 'auto') {
            const [name, date] = key.split('|')
            await supabase.from('draw_cancellations').delete().eq('draw_name', name).eq('date', date).eq('source', 'auto')
            cancelMap.delete(key)
          }
        }

        // Tirages attendus mais absents du site alors que le jour est publié => annulation probable
        // (sauf si la requête ciblée pour ce tirage a échoué HTTP/timeout)
        const autoCancel: Array<Record<string, unknown>> = []
        for (const day of sortedDays) {
          if (day >= today) continue
          const expected = DRAW_SCHEDULE_UTC_DAY[new Date(`${day}T00:00:00Z`).getUTCDay()] || []
          for (const name of expected) {
            if (targetDrawName && targetDrawName !== 'ALL' && name.toUpperCase() !== targetDrawName.toUpperCase()) continue
            if (parsed.failedDrawTypes.has(name)) continue
            const key = `${name}|${day}`
            if (!activeNames.has(name) || parsed.foundKeys.has(key) || existingMap.has(key) || cancelMap.has(key)) continue
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

        // Autopsie / auto-apprentissage via gateway 'nexus-api' : uniquement pour les résultats nouveaux ou modifiés
        const started = startedAt.getTime()
        for (const result of toProcess) {
          if (Date.now() - started > MAX_EXECUTION_TIME) { log.errors.push('timeout avant la fin des autopsies'); break }
          const { data: pending } = await supabase
            .from('prediction_snapshots')
            .select('id')
            .eq('draw_name', result.draw_name)
            .eq('status', 'PENDING')
            .or(`target_date.is.null,target_date.lte.${result.date}`)
          if (!pending || pending.length === 0) continue
          for (let i = 0; i < pending.length; i += 5) {
            await Promise.all(pending.slice(i, i + 5).map((snap: { id: string }) =>
              supabase.functions.invoke('nexus-api', {
                body: { action: 'forensic-autopsy', snapshotId: snap.id, drawResultId: result.id },
              }).catch((e: unknown) => console.error(`autopsy ${snap.id}:`, e))))
          }
          await supabase.functions.invoke('nexus-api', {
            body: { action: 'self-learn', drawName: result.draw_name },
          }).catch((e: unknown) => console.error('self-learn:', e))
        }
      } catch (e) {
        log.errors.push(`${monthParam}: ${(e as Error).message}`)
      }
    }

    // Rattrapage : snapshots PENDING dont le résultat existe déjà (écrit par un autre chemin),
    // ou dont le tirage est annulé.
    try {
      const { data: pendings } = await supabase.from('prediction_snapshots')
        .select('id, draw_name, target_date').eq('status', 'PENDING').lte('target_date', today).limit(40)
      const drawsToLearn = new Set<string>()
      for (const snap of pendings || []) {
        if (Date.now() - startedAt.getTime() > MAX_EXECUTION_TIME) { log.errors.push('timeout avant la fin du rattrapage'); break }
        const { data: res } = await supabase.from('draw_results').select('id')
          .eq('draw_name', snap.draw_name).eq('date', snap.target_date).maybeSingle()
        if (res) {
          await supabase.functions.invoke('nexus-api', {
            body: { action: 'forensic-autopsy', snapshotId: snap.id, drawResultId: res.id },
          }).catch((e: unknown) => console.error(`rattrapage autopsy ${snap.id}:`, e))
          drawsToLearn.add(snap.draw_name)
          log.caught_up++
          continue
        }
        const { data: canc } = await supabase.from('draw_cancellations').select('draw_name')
          .eq('draw_name', snap.draw_name).eq('date', snap.target_date).maybeSingle()
        if (canc) {
          const { error } = await supabase.from('prediction_snapshots').update({ status: 'CANCELLED' }).eq('id', snap.id).eq('status', 'PENDING')
          if (!error) log.snapshots_cancelled++
        }
      }
      for (const name of drawsToLearn) {
        await supabase.functions.invoke('nexus-api', {
          body: { action: 'self-learn', drawName: name },
        }).catch((e: unknown) => console.error('self-learn rattrapage:', e))
      }
    } catch (e) {
      log.errors.push(`rattrapage: ${(e as Error).message}`)
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
    autopsies_caught_up: log.caught_up,
    snapshots_cancelled: log.snapshots_cancelled,
    http_errors: log.http_errors,
    error: log.errors.length ? log.errors.join(' | ').slice(0, 2000) : null,
    duration_ms: Date.now() - startedAt.getTime(),
  }).select('id').single()

  return json({
    success: status !== 'error', status, fetched: log.fetched_draws, upserted: log.upserted,
    cancelled_inferred: log.cancelled_inferred, caught_up: log.caught_up, snapshots_cancelled: log.snapshots_cancelled, missing_pending: log.missing.length, errors: log.errors, log_id: logRow?.id ?? null,
  }, status === 'error' ? 500 : 200)
})
