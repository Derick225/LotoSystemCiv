import { createClient } from 'supabase'
import { corsHeaders } from '../../_shared/cors.ts'
import {
  LOTOBONHEUR_API_URL,
  DRAW_SCHEDULE_UTC_DAY,
  formatFrenchMonthParam,
  normalizeMonthParam,
  parseLotobonheurResponse,
  type ParsedOfficialDraw,
} from '../../_shared/lotobonheur-parser.ts'
import { handleForensicAutopsy } from './forensic-autopsy.ts'
import { handleSelfLearn } from './self-learn.ts'

const GRACE_DAYS = 2
const ACTIVE_WINDOW_DAYS = 21
const MAX_EXECUTION_TIME = 45000

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const numbersKey = (nums: number[] | null | undefined) =>
  Array.isArray(nums) && nums.length > 0 ? nums.join(',') : ''

export async function handleCronSync(req: Request, reqBody?: any): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startedAt = new Date()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Configuration Supabase manquante.')
    }

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

    // Sécurisation de l'endpoint (pg_cron / service_role / client avec clé anon ou session JWT)
    const authHeader = req.headers.get('Authorization')
    const cronSecret = req.headers.get('x-cron-secret')
    let isAuthorized = false

    if (cronSecret) {
      const { data: verified } = await supabase.rpc('verify_cron_secret', { p_secret: cronSecret }).catch(() => ({ data: false }))
      if (verified === true) isAuthorized = true
    }
    if (!isAuthorized && authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()
      if (token === supabaseKey || token === Deno.env.get('SUPABASE_ANON_KEY')) {
        isAuthorized = true
      } else if (token) {
        const { data: { user }, error } = await supabase.auth.getUser(token)
        if (user && !error) isAuthorized = true
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Non autorisé.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = reqBody || await req.json().catch(() => ({}))
    const targetDrawName: string | undefined = body.drawName
    const manualTrigger = body.manualTrigger === true
    const requestedMonths: string[] | undefined = Array.isArray(body.months) ? body.months : undefined
    const monthsBackRaw = typeof body.monthsBack === 'number' ? Math.max(0, Math.min(6, Math.floor(body.monthsBack))) : null

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

    const log = {
      months: [] as string[],
      fetched_draws: 0,
      upserted: 0,
      unknown: new Set<string>(),
      missing: [] as Array<{ draw_name: string; date: string }>,
      cancelled_inferred: 0,
      caught_up: 0,
      snapshots_cancelled: 0,
      skipped_invalid: 0,
      http_errors: [] as Array<{ month: string; status: number | string }>,
      errors: [] as string[],
    }

    const activeSince = isoDay(new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 86400000))
    const { data: recent } = await supabase
      .from('draw_results')
      .select('draw_name')
      .gte('date', activeSince)
      .limit(2000)
    const activeNames = new Set<string>((recent || []).map((r: { draw_name: string }) => r.draw_name))
    const upsertedResults: Array<{ id: string; draw_name: string; date: string; gagnants: number[]; machine: number[] | null; version: number }> = []

    for (const monthParam of months) {
      log.months.push(monthParam)
      try {
        const targetUrl = `${LOTOBONHEUR_API_URL}?month=${encodeURIComponent(monthParam)}`
        const response = await fetch(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (NexusEngine/12.0)', 'Accept': 'application/json' },
          signal: AbortSignal.timeout(20000),
        })

        if (!response.ok) {
          log.http_errors.push({ month: monthParam, status: response.status })
          continue
        }

        const data = await response.json()
        const parsed = parseLotobonheurResponse(data, {
          targetDrawName,
          fallbackYear: now.getFullYear(),
        })
        parsed.unknown.forEach((u) => log.unknown.add(u))
        log.skipped_invalid += parsed.skippedInvalidCount

        const rows: ParsedOfficialDraw[] = parsed.rows
        log.fetched_draws += rows.length

        if (parsed.dayBlocks.size === 0) continue

        const sortedDays = [...parsed.dayBlocks].sort()
        const minDate = sortedDays[0]
        const maxDate = sortedDays[sortedDays.length - 1]

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

        const toProcess: typeof upsertedResults = []
        if (changed.length > 0) {
          const nowIso = new Date().toISOString()
          for (let i = 0; i < changed.length; i += 200) {
            const slice = changed.slice(i, i + 200)
            const { data: upsertedData, error } = await supabase
              .from('draw_results')
              .upsert(slice.map((r) => ({ ...r, updated_at: nowIso })), { onConflict: 'draw_name,date' })
              .select('id,draw_name,date,gagnants,machine,version')

            if (error) {
              log.errors.push(`upsert ${monthParam}: ${error.message}`)
            } else {
              log.upserted += slice.length
              if (upsertedData) {
                toProcess.push(...(upsertedData as typeof upsertedResults))
                upsertedResults.push(...(upsertedData as typeof upsertedResults))
              }
            }
          }
        }

        // Retirer toute annulation 'auto' si le tirage officiel est finalement paru
        for (const key of parsed.foundKeys) {
          if (cancelMap.get(key) === 'auto') {
            const [name, date] = key.split('|')
            await supabase.from('draw_cancellations').delete().eq('draw_name', name).eq('date', date).eq('source', 'auto')
            cancelMap.delete(key)
          }
        }

        // Détection d'annulations / jours fériés manquants après GRACE_DAYS
        const autoCancel: Array<Record<string, unknown>> = []
        for (const day of sortedDays) {
          if (day >= today) continue
          const expected = DRAW_SCHEDULE_UTC_DAY[new Date(`${day}T00:00:00Z`).getUTCDay()] || []
          for (const name of expected) {
            if (targetDrawName && targetDrawName !== 'ALL' && name.toUpperCase() !== targetDrawName.toUpperCase()) continue
            const key = `${name}|${day}`
            if (!activeNames.has(name) || parsed.foundKeys.has(key) || existingMap.has(key) || cancelMap.has(key)) continue
            if (day <= cutoff) {
              autoCancel.push({
                draw_name: name,
                date: day,
                source: 'auto',
                reason: `Absent du site officiel plus de ${GRACE_DAYS} jours après la date`,
              })
            } else {
              log.missing.push({ draw_name: name, date: day })
            }
          }
        }
        if (autoCancel.length > 0) {
          const { error } = await supabase
            .from('draw_cancellations')
            .upsert(autoCancel, { onConflict: 'draw_name,date', ignoreDuplicates: true })
          if (error) log.errors.push(`cancellations: ${error.message}`)
          else log.cancelled_inferred += autoCancel.length
        }

        // Autopsie & self-learn uniquement pour les nouveaux tirages ou mises à jour
        for (const result of toProcess) {
          if (Date.now() - startedAt.getTime() > MAX_EXECUTION_TIME) {
            log.errors.push('timeout avant la fin des autopsies')
            break
          }
          const { data: pendingSnapshots } = await supabase
            .from('prediction_snapshots')
            .select('id')
            .eq('draw_name', result.draw_name)
            .eq('status', 'PENDING')
            .or(`target_date.is.null,target_date.lte.${result.date}`)

          if (pendingSnapshots && pendingSnapshots.length > 0) {
            for (let i = 0; i < pendingSnapshots.length; i += 5) {
              const chunk = pendingSnapshots.slice(i, i + 5)
              await Promise.all(
                chunk.map((snap: { id: string }) =>
                  handleForensicAutopsy(req, { snapshotId: snap.id, drawResultId: result.id }).catch((e) =>
                    console.error(`Forensic autopsy trigger error for ${snap.id}:`, e)
                  )
                )
              )
            }
            if (Date.now() - startedAt.getTime() <= MAX_EXECUTION_TIME) {
              await handleSelfLearn(req, { drawName: result.draw_name }).catch((e) =>
                console.error('Self-learn trigger error:', e)
              )
            }
          }
        }
      } catch (e: any) {
        log.errors.push(`${monthParam}: ${e?.message || String(e)}`)
      }
    }

    // Journalisation sécurisée (ignore silencieusement si la table sync_logs n'est pas encore créée)
    const noData = log.fetched_draws === 0 && log.upserted === 0
    const status =
      log.errors.length === 0 && log.http_errors.length === 0
        ? 'success'
        : noData && (log.errors.length > 0 || log.http_errors.length >= Math.max(1, log.months.length))
          ? 'error'
          : 'partial'

    try {
      await supabase.from('sync_logs').insert({
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        trigger_source: 'internal',
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
      })
    } catch {
      // Non bloquant si migration sync_logs non encore appliquée
    }

    return new Response(
      JSON.stringify({
        success: status !== 'error',
        status,
        count: log.upserted,
        fetched: log.fetched_draws,
        upserted: log.upserted,
        cancelled_inferred: log.cancelled_inferred,
        skipped_invalid: log.skipped_invalid,
        months: log.months,
        http_errors: log.http_errors,
        results: upsertedResults,
        message: `Sync OK : ${log.upserted} mis à jour sur ${log.fetched_draws} tirages lus.`,
      }),
      {
        status: status === 'error' ? 502 : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}
