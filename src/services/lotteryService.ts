
import { DrawResult, ProjectionItem, TopFollowerAnalysis, AlgoWeights } from '../types';
import { DRAW_SCHEDULE, isDrawWithoutMachine, getDrawFullTimestamp } from '../constants';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getProjectionsAsync, getFollowersAnalysisAsync } from './mathService';
import { apiClient } from '../core/api/apiClient';
import { AppError, logError, getErrorMessage } from '../utils/AppError';
import { logger } from '../utils/logger';
import { globalCache, CACHE_TTL } from './cache/CacheService';
import {
  getDrawException,
  getWeekdayReferenceDateIso,
  findNextActiveScheduledSlot,
  toCanonicalIsoDate,
  syncDrawCancellationsFromDb,
  type DrawException,
  type SkippedDrawSlot,
} from './drawScheduleExceptionService';
import {
  computeFrequencyCountsHpc,
  initializeLotoEngineWasm,
  appendSingleDrawToStore,
  clearStoreTimeline,
  getStoreFrequencies,
  getStoreCurrentGaps,
  getStoreDrawCount,
  runNativePredictionHpc,
  analyzeDrawHistoryHpc,
  generateDiversifiedPortfolioHpc,
  type NativePredictionResultHpc,
  type PriorAnalysisReportHpc,
  type PredictionPortfolioHpc,
} from './wasm/lotoEngineBridge';
import {
  logActivePredictionDna,
  getPredictionDnaLogs,
  qualifyNumberDna,
  reconcileDnaLogsWithDrawResult,
  getOrReconstructWinningNumbersDna,
  calculateDnaPerformanceDrift,
  type PredictionDnaAuditLog,
  type NumberDnaAttribution,
  type DnaPerformanceDriftReport,
} from './prediction/dnaAuditLogService';
import { validateDrawRecord } from './storage/hermeticStorageGuard';

/**
 * Constantes fondamentales du système de loterie 5/90.
 * Regroupe et documente toutes les valeurs théoriques et opérationnelles officielles pour éradiquer les nombres magiques.
 */
export const LOTTERY_CONSTANTS = {
  /** Nombre total de boules dans l'urne pour les tirages 5/90 (Source officielle: Loto Civil/National) */
  TOTAL_NUMBERS: 90,
  
  /** Nombre de numéros tirés par tirage (gagnants / machine) (Source officielle: Loto Civil 5/90) */
  NUMBERS_PER_DRAW: 5,
  
  /** Taille par défaut de l'historique de secours déterministe pour assurer une convergence statistique */
  FALLBACK_HISTORY_DEPTH: 250,
  
  /** Graine première de grand ordre pour l'initialisation du générateur congruentiel linéaire (LCG) déterministe */
  SEED_PRIME: 99991,
  
  /** Nombre de jours par défaut pour l'agrégation statistique récente (fenêtre d'observation standard) */
  DEFAULT_STATS_DAYS: 7,
  
  /** Limite de lecture maximale des tirages de l'historique pour préserver l'occupation mémoire en client */
  MAX_HISTORY_LIMIT: 2000,
  
  /** Identifiant global représentant l'agrégation de tous les tirages */
  ALL_DRAWS_IDENTIFIER: 'ALL',
};

const CACHE_PREFIX = 'nexus_cache_history_';

const isValidDate = (d: number, m: number, y: number): boolean => {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

export const formatDate = (dateStr: string, isIsoOutput: boolean = false): string => {
  if (!dateStr) return '';
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      if (!isValidDate(d, m, y)) return 'Invalid Date';
      if (isIsoOutput) return dateStr;
      return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const [d, m, y] = parts.map(Number);
        if (!isValidDate(d, m, y)) return 'Invalid Date';
        if (isIsoOutput) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        return dateStr;
    }
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  if (isIsoOutput) return `${y}-${m}-${d}`;
  return `${d}/${m}/${y}`;
};

export const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  if (dateStr.includes('/')) {
    const [d, m, y] = dateStr.split('/');
    return `${y}-${m}-${d}`;
  }
  return dateStr;
};

const normalizeDrawName = (name: string): string => {
    return name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase().replace(/(\s[a-z])/g, (c) => c.toUpperCase());
};

export function getDrawTimestamp(dateStr: string, drawName?: string, explicitTime?: string): number {
  return getDrawFullTimestamp(dateStr, drawName, explicitTime);
}

const inFlightHistoryFetches = new Map<string, Promise<DrawResult[]>>();
const lastDeltaSyncByDraw = new Map<string, number>();
const DELTA_SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes de cooldown entre synchronisations différentielles par tirage
const SUPABASE_PAGE_SIZE = 1000;
const DELTA_OVERLAP_DAYS = 7;

const shiftIsoDateDays = (isoDate: string, deltaDays: number): string => {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoDate;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + deltaDays));
  return dt.toISOString().slice(0, 10);
};

const mapDbRowToDrawResult = (row: any): DrawResult => {
  const dName = normalizeDrawName(String(row.draw_name || row.drawName || ''));
  const withoutMachine = isDrawWithoutMachine(dName);
  const rawMachine = Array.isArray(row.machine) ? row.machine : [];
  return {
    id: String(row.id || `draw_${dName.replace(/\s+/g, '_')}_${normalizeDate(String(row.date || ''))}`),
    drawName: dName,
    date: formatDate(String(row.date || '')),
    gagnants: Array.isArray(row.gagnants) ? row.gagnants : [],
    machine: withoutMachine || rawMachine.length !== 5 ? [] : rawMachine,
    version: row.version || 1,
  };
};

const sanitizeMachineForDb = (drawName: string, machine?: number[] | null): number[] | null => {
  if (isDrawWithoutMachine(drawName)) return null;
  if (!Array.isArray(machine) || machine.length !== 5) return null;
  return machine;
};

const invalidateDailySummariesCache = async (): Promise<void> => {
  const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  await Promise.all(
    days.map((d) => globalCache.delete(globalCache.generateKey('daily_summary', d)).catch(() => {}))
  );
};

const mergeDeltaResults = (deltaRows: DrawResult[], existing: DrawResult[]): DrawResult[] => {
  const byKey = new Map<string, DrawResult>();
  for (const item of existing) {
    const val = validateDrawRecord(item);
    if (!val.valid || !val.cleanDraw) continue;
    const clean = val.cleanDraw;
    const key = `${normalizeDrawName(clean.drawName)}_${normalizeDate(clean.date)}`;
    byKey.set(key, clean);
  }
  for (const row of deltaRows) {
    const val = validateDrawRecord(row);
    if (!val.valid || !val.cleanDraw) continue;
    const clean = val.cleanDraw;
    const key = `${normalizeDrawName(clean.drawName)}_${normalizeDate(clean.date)}`;
    byKey.set(key, clean);
  }
  return Array.from(byKey.values())
    .sort((a, b) => getDrawTimestamp(b.date, b.drawName) - getDrawTimestamp(a.date, a.drawName))
    .slice(0, LOTTERY_CONSTANTS.MAX_HISTORY_LIMIT);
};

interface PaginatedSupabaseFetchOptions {
  drawName?: string;
  sinceDate?: string;
  untilDate?: string;
  maxRows?: number;
  timeoutMs?: number;
}

const fetchFromSupabasePaginated = async (
  opts: PaginatedSupabaseFetchOptions
): Promise<DrawResult[]> => {
  const maxRows = Math.max(1, opts.maxRows ?? LOTTERY_CONSTANTS.MAX_HISTORY_LIMIT);
  const timeoutMs = opts.timeoutMs ?? 6000;
  const collected: DrawResult[] = [];
  let offset = 0;

  while (collected.length < maxRows) {
    const remaining = maxRows - collected.length;
    const batchSize = Math.min(SUPABASE_PAGE_SIZE, remaining);
    let query = supabase
      .from('draw_results')
      .select('id,draw_name,date,gagnants,machine,version')
      .order('date', { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (opts.drawName && opts.drawName !== LOTTERY_CONSTANTS.ALL_DRAWS_IDENTIFIER) {
      query = query.eq('draw_name', normalizeDrawName(opts.drawName));
    }
    if (opts.sinceDate) {
      query = query.gte('date', normalizeDate(opts.sinceDate));
    }
    if (opts.untilDate) {
      query = query.lte('date', normalizeDate(opts.untilDate));
    }

    let queryTimer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      queryTimer = setTimeout(() => {
        reject(new AppError(`Supabase request timeout after ${timeoutMs}ms`, 'NETWORK_TIMEOUT', 'low', { drawName: opts.drawName }));
      }, timeoutMs);
    });

    let res: { data: any[] | null; error: any };
    try {
      res = (await Promise.race([query, timeoutPromise])) as { data: any[] | null; error: any };
    } finally {
      if (queryTimer) clearTimeout(queryTimer);
    }

    if (res.error) {
      throw new AppError(getErrorMessage(res.error), 'SUPABASE_FETCH_ERROR', 'medium', {
        drawName: opts.drawName,
        error: res.error,
      });
    }

    const rows = res.data || [];
    for (const row of rows) {
      collected.push(mapDbRowToDrawResult(row));
    }

    if (rows.length < batchSize) {
      break;
    }
    offset += batchSize;
  }

  return collected.sort((a, b) => getDrawTimestamp(b.date, b.drawName) - getDrawTimestamp(a.date, a.drawName));
};

const lastSyncedFingerprintByDraw = new Map<string, string>();

/**
 * Réinitialise l'empreinte de synchronisation du store Rust pour forcer un rechargement
 */
export const clearHistorySyncFingerprint = (targetDrawName?: string): void => {
  if (targetDrawName) {
    lastSyncedFingerprintByDraw.delete(targetDrawName.trim().toUpperCase());
  } else {
    lastSyncedFingerprintByDraw.clear();
  }
};

const hashDrawsDigest = (draws: DrawResult[], drawKey: string): string => {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const mixChar = (code: number) => {
    h1 ^= code & 0xff;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= (code >>> 0) + ((h1 >>> 6) & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  };
  for (let i = 0; i < drawKey.length; i++) mixChar(drawKey.charCodeAt(i));
  mixChar(draws.length);

  for (let idx = 0; idx < draws.length; idx++) {
    const d = draws[idx];
    const date = d?.date || '';
    const dName = d?.drawName || '';
    for (let i = 0; i < date.length; i++) mixChar(date.charCodeAt(i));
    mixChar(0x3a);
    for (let i = 0; i < dName.length; i++) mixChar(dName.charCodeAt(i));
    mixChar(0x7c);
    const gag = d?.gagnants;
    if (Array.isArray(gag)) {
      for (let j = 0; j < gag.length; j++) mixChar(gag[j] | 0);
    }
    mixChar(0x2f);
    const mach = d?.machine;
    if (Array.isArray(mach)) {
      for (let j = 0; j < mach.length; j++) mixChar(mach[j] | 0);
    }
    mixChar(0x0a);
  }
  return `${drawKey}:${draws.length}:${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}`;
};

/**
 * Synchronise l'historique contigu en mémoire vive dans le store Rust Core (WASM).
 * Applique :
 * 1. Un contrôle d'idempotence strict O(N) sur l'ensemble des enregistrements (détecte toute édition interne).
 * 2. Un tri chronologique ascendant (flèche du temps) pour que history.last() soit le plus récent.
 * 3. La conversion en secondes POSIX des horodatages.
 * 4. La validation hermétique unitaire (5 entiers uniques ∈ [1, 90], zéro synthétique).
 */
export const syncHistoryToRustStore = (draws: DrawResult[], targetDrawName?: string): void => {
  if (!draws || draws.length === 0) return;
  const drawKey = (targetDrawName || 'GLOBAL').trim().toUpperCase();

  const fingerprint = hashDrawsDigest(draws, drawKey);
  const previousFingerprint = lastSyncedFingerprintByDraw.get(drawKey);

  if (previousFingerprint === fingerprint) {
    return; // Déjà synchronisé à l'identique, no-op strict
  }

  try {
    // Si une timeline précédemment gérée a été modifiée (y compris édition médiane ou suppression),
    // réinitialiser proprement pour éviter de conserver d'anciens enregistrements obsolètes.
    if (previousFingerprint !== undefined && targetDrawName) {
      clearStoreTimeline(drawKey);
    }

    // Inversion chronologique stricte : du plus ancien au plus récent
    const chronological = [...draws].reverse();

    for (const d of chronological) {
      const val = validateDrawRecord(d, { allowSynthetic: true });
      if (!val.valid || !val.cleanDraw) continue;
      const clean = val.cleanDraw;

      const tsMs = getDrawTimestamp(clean.date, clean.drawName || targetDrawName);
      const tsSec = Math.floor(tsMs / 1000); // Secondes POSIX
      appendSingleDrawToStore(
        clean.drawName || targetDrawName || 'GLOBAL',
        tsSec,
        clean.gagnants,
        clean.machine || []
      );
    }
    lastSyncedFingerprintByDraw.set(drawKey, fingerprint);
  } catch (err) {
    console.warn('[lotteryService] Erreur synchronisation store Rust :', err);
  }
};

export interface SyncStatusRecord {
  id: number;
  started_at: string;
  finished_at: string | null;
  trigger_source: string;
  status: string;
  months: string[];
  fetched_draws: number;
  upserted: number;
  cancelled_inferred: number;
  autopsies_caught_up: number;
  snapshots_cancelled: number;
  error: string | null;
  duration_ms: number | null;
}

export const lotteryService = {
  async fetchHistory(drawName: string, force?: boolean): Promise<DrawResult[]> {
    const cacheKey = globalCache.generateKey('history', drawName);
    const now = Date.now();
    const lastSync = lastDeltaSyncByDraw.get(drawName) || 0;

    // Stale-While-Revalidate + Delta-Sync : Si un cache réel valide existe et force=false, retour instantané
    if (!force) {
      const fastSync = globalCache.getSync<DrawResult[]>(cacheKey, drawName);
      const realFastSync = fastSync ? fastSync.filter(d => !d.id?.startsWith('deterministic-')) : null;
      if (realFastSync && realFastSync.length > 0) {
        return realFastSync;
      }

      const cached = await globalCache.get<DrawResult[]>(cacheKey, drawName);
      const realCached = cached ? cached.filter(d => !d.id?.startsWith('deterministic-')) : null;
      if (realCached && realCached.length > 0) {
        // Rafraîchissement Delta-Sync discret en arrière-plan uniquement si le cooldown de 5 min est écoulé
        if (isSupabaseConfigured() && navigator.onLine && (now - lastSync > DELTA_SYNC_COOLDOWN_MS)) {
          lastDeltaSyncByDraw.set(drawName, now);
          (async () => {
            try {
              const latestIsoDate = normalizeDate(realCached[0].date);
              const overlapSince = shiftIsoDateDays(latestIsoDate, -DELTA_OVERLAP_DAYS);
              const delta = await fetchFromSupabasePaginated({
                drawName,
                sinceDate: overlapSince,
                maxRows: 300,
                timeoutMs: 4500,
              });
              if (delta.length > 0) {
                const prevHash = hashDrawsDigest(realCached, drawName);
                const merged = mergeDeltaResults(delta, realCached);
                const nextHash = hashDrawsDigest(merged, drawName);
                if (nextHash !== prevHash) {
                  if (merged.length > realCached.length) {
                    await globalCache.registerNewDraw(drawName, merged.length);
                  }
                  await globalCache.set(cacheKey, merged, CACHE_TTL.HISTORY, drawName);
                  await invalidateDailySummariesCache();
                  syncHistoryToRustStore(merged, drawName);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName, source: 'background-delta' } }));
                  }
                }
              }
              syncDrawCancellationsFromDb(false).catch(() => {});
            } catch {
              // Silently ignore background delta revalidation failures
            }
          })();
        }
        syncHistoryToRustStore(realCached, drawName);
        return realCached;
      }
    }

    const inFlightKey = `${drawName}_${force ? '1' : '0'}`;
    if (inFlightHistoryFetches.has(inFlightKey)) {
      return inFlightHistoryFetches.get(inFlightKey)!;
    }

    const fetchPromise = (async (): Promise<DrawResult[]> => {
      const existingCached = await globalCache.get<DrawResult[]>(cacheKey, drawName);
      const realExisting = existingCached ? existingCached.filter(d => !d.id?.startsWith('deterministic-')) : [];
      const hasRealCache = realExisting.length > 0;

      if (isSupabaseConfigured() && navigator.onLine) {
        try {
          // DELTA-SYNC avec recouvrement de 7 jours pour capter aussi les corrections/retards récents
          const sinceDate = hasRealCache
            ? shiftIsoDateDays(normalizeDate(realExisting[0].date), -DELTA_OVERLAP_DAYS)
            : undefined;
          const fetchedRows = await fetchFromSupabasePaginated({
            drawName,
            sinceDate,
            maxRows: hasRealCache ? 400 : LOTTERY_CONSTANTS.MAX_HISTORY_LIMIT,
            timeoutMs: hasRealCache ? 4500 : 8000,
          });

          lastDeltaSyncByDraw.set(drawName, Date.now());
          const finalData = hasRealCache
            ? mergeDeltaResults(fetchedRows, realExisting)
            : fetchedRows;

          if (finalData.length > 0) {
            syncHistoryToRustStore(finalData, drawName);
            await globalCache.registerNewDraw(drawName, finalData.length);
            await globalCache.set(cacheKey, finalData, CACHE_TTL.HISTORY, drawName);
            return finalData;
          }
        } catch (e) {
          const isTimeoutOrNetwork =
            (e instanceof AppError && (e.code === 'NETWORK_TIMEOUT' || e.severity === 'low')) ||
            (e instanceof Error && (e.message.toLowerCase().includes('timeout') || e.message.toLowerCase().includes('fetch')));
          if (isTimeoutOrNetwork) {
            console.warn(`[LotteryService] Requête distante Supabase non aboutie (${getErrorMessage(e)}). Bascule locale fluide.`);
          } else {
            logError(e, { source: 'lotteryService.fetchHistory' });
          }
        }
      }

      // Fallback to real cache if network fails or offline
      if (realExisting.length > 0) {
        syncHistoryToRustStore(realExisting, drawName);
        return realExisting;
      }

      // ÉRADICATION TOTALE DES DONNÉES SIMULÉES : ZÉRO FAUX TIRAGE GÉNÉRÉ
      console.warn(`[LotteryService] Aucun tirage réel disponible pour '${drawName}' (mode hors-ligne ou base non synchronisée). Aucune donnée simulée n'est générée.`);
      return [];
    })();

    inFlightHistoryFetches.set(inFlightKey, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      inFlightHistoryFetches.delete(inFlightKey);
    }
  },

  /**
   * Récupère les résultats d'un tirage (ou de tous les tirages 'ALL') sur une plage de dates ISO/FR inclusive.
   */
  async fetchResultsByDateRange(drawName: string, startDate: string, endDate: string): Promise<DrawResult[]> {
    const startIso = normalizeDate(startDate);
    const endIso = normalizeDate(endDate);

    if (isSupabaseConfigured() && navigator.onLine) {
      try {
        return await fetchFromSupabasePaginated({
          drawName,
          sinceDate: startIso,
          untilDate: endIso,
          maxRows: LOTTERY_CONSTANTS.MAX_HISTORY_LIMIT,
          timeoutMs: 7000,
        });
      } catch (e) {
        logError(e, { source: 'lotteryService.fetchResultsByDateRange' });
      }
    }

    const fallback = await this.fetchHistory(drawName);
    return fallback.filter((d) => {
      const iso = normalizeDate(d.date);
      return iso >= startIso && iso <= endIso;
    });
  },

  /**
   * Récupère une page précise de résultats depuis Supabase (avec fallback local).
   */
  async fetchResultsPage(
    drawName: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<{ data: DrawResult[]; total: number; page: number; pageSize: number; hasMore: boolean }> {
    const safePage = Math.max(1, Math.floor(page));
    const safeSize = Math.max(1, Math.min(200, Math.floor(pageSize)));
    const from = (safePage - 1) * safeSize;
    const to = from + safeSize - 1;

    if (isSupabaseConfigured() && navigator.onLine) {
      try {
        let query = supabase
          .from('draw_results')
          .select('id,draw_name,date,gagnants,machine,version', { count: 'exact' })
          .order('date', { ascending: false })
          .range(from, to);

        if (drawName && drawName !== LOTTERY_CONSTANTS.ALL_DRAWS_IDENTIFIER) {
          query = query.eq('draw_name', normalizeDrawName(drawName));
        }

        const { data, count, error } = await query;
        if (!error && data) {
          const mapped = data.map(mapDbRowToDrawResult);
          const total = typeof count === 'number' ? count : from + mapped.length;
          return {
            data: mapped,
            total,
            page: safePage,
            pageSize: safeSize,
            hasMore: from + mapped.length < total,
          };
        }
      } catch (e) {
        logError(e, { source: 'lotteryService.fetchResultsPage' });
      }
    }

    const all = await this.fetchHistory(drawName);
    const slice = all.slice(from, to + 1);
    return {
      data: slice,
      total: all.length,
      page: safePage,
      pageSize: safeSize,
      hasMore: from + slice.length < all.length,
    };
  },

  /**
   * Récupère le dernier résultat connu pour chacun des tirages demandés via la RPC `get_draw_results_summary`
   * (une seule requête indexée) avec repli automatique sur requête directe / cache local.
   */
  async fetchLatestResults(drawNames?: string[], lookbackDays: number = 30): Promise<Map<string, DrawResult>> {
    const latestMap = new Map<string, DrawResult>();
    if (!isSupabaseConfigured() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return latestMap;
    }

    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_draw_results_summary', {
        p_draw_names: drawNames && drawNames.length > 0 ? drawNames : null,
        p_days: lookbackDays,
      });

      if (!rpcErr && Array.isArray(rpcData)) {
        for (const row of rpcData) {
          const mapped = mapDbRowToDrawResult(row);
          if (mapped.drawName && !latestMap.has(mapped.drawName)) {
            latestMap.set(mapped.drawName, mapped);
          }
        }
        return latestMap;
      }
    } catch {
      // Fallback ci-dessous si la RPC n'est pas encore déployée
    }

    const recentCutoff = new Date(Date.now() - lookbackDays * 86400000).toISOString().split('T')[0];
    let query = supabase
      .from('draw_results')
      .select('id,draw_name,date,gagnants,machine,version')
      .gte('date', recentCutoff)
      .order('date', { ascending: false })
      .limit(Math.max(30, (drawNames?.length || 28) * 3));

    if (drawNames && drawNames.length > 0) {
      query = query.in('draw_name', drawNames);
    }

    const { data, error } = await query;
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const mapped = mapDbRowToDrawResult(row);
        if (mapped.drawName && !latestMap.has(mapped.drawName)) {
          latestMap.set(mapped.drawName, mapped);
        }
      }
    }

    return latestMap;
  },

  /**
   * Consulte les dernières exécutions de synchronisation serveur (`sync_logs`) via RPC sécurisée.
   */
  async fetchRecentSyncStatus(limit: number = 10): Promise<SyncStatusRecord[]> {
    if (!isSupabaseConfigured() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return [];
    }
    try {
      const { data, error } = await supabase.rpc('get_recent_sync_status', { p_limit: limit });
      if (error || !Array.isArray(data)) return [];
      return data;
    } catch {
      return [];
    }
  },

  /**
   * Récupère directement les résultats officiels depuis l'API distante via le proxy Express (`/api/results`)
   * ou via l'Edge Function `nexus-api?action=proxy-results`.
   */
  async fetchOfficialResultsFromApi(options: {
    month?: string;
    months?: string[];
    monthsBack?: number;
    drawName?: string;
    refresh?: boolean;
  } = {}): Promise<{
    success: boolean;
    source: 'express-api' | 'edge-proxy';
    months: string[];
    draws: DrawResult[];
    unknownDrawNames: string[];
  }> {
    const params = new URLSearchParams();
    if (options.months && options.months.length > 0) params.set('month', options.months.join(','));
    else if (options.month) params.set('month', options.month);
    if (options.monthsBack !== undefined) params.set('monthsBack', String(options.monthsBack));
    if (options.drawName && options.drawName !== LOTTERY_CONSTANTS.ALL_DRAWS_IDENTIFIER) {
      params.set('drawName', options.drawName);
    }
    if (options.refresh) params.set('refresh', '1');

    if (typeof window !== 'undefined') {
      try {
        const resp = await fetch(`/api/results?${params.toString()}`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(12000),
        });
        const ct = resp.headers.get('content-type') || '';
        if (resp.ok && ct.includes('application/json')) {
          const payload = await resp.json();
          if (payload && Array.isArray(payload.draws)) {
            return {
              success: Boolean(payload.success),
              source: 'express-api',
              months: Array.isArray(payload.months) ? payload.months : [],
              draws: payload.draws.map(mapDbRowToDrawResult),
              unknownDrawNames: Array.isArray(payload.unknownDrawNames) ? payload.unknownDrawNames : [],
            };
          }
        }
      } catch {
        // Fallback sur Edge proxy ci-dessous
      }
    }

    if (isSupabaseConfigured()) {
      const edgeRes = await apiClient.post<{
        success: boolean;
        months?: string[];
        draws?: Array<{ drawName: string; date: string; gagnants: number[]; machine?: number[]; version?: number }>;
        unknownDrawNames?: string[];
      }>(
        'proxy-results',
        {
          month: options.month,
          months: options.months,
          monthsBack: options.monthsBack ?? 1,
          drawName: options.drawName,
        },
        { suppressErrorLogging: true }
      );

      return {
        success: Boolean(edgeRes?.success),
        source: 'edge-proxy',
        months: Array.isArray(edgeRes?.months) ? edgeRes.months : [],
        draws: Array.isArray(edgeRes?.draws) ? edgeRes.draws.map(mapDbRowToDrawResult) : [],
        unknownDrawNames: Array.isArray(edgeRes?.unknownDrawNames) ? edgeRes.unknownDrawNames : [],
      };
    }

    throw new AppError(
      'Aucune passerelle API distante accessible pour récupérer les résultats officiels.',
      'SYNC_REQUIRES_BACKEND',
      'low',
      options
    );
  },

  /**
   * Enregistre systématiquement l'ADN actif utilisé lors de la génération d'une prédiction.
   */
  async logPredictionDna(
    drawName: string,
    predictionId: string,
    suggestedNumbers: number[],
    activeWeights: AlgoWeights,
    history?: DrawResult[],
    metrics?: { entropy?: number; hurst?: number; confidence?: number; regime?: string }
  ): Promise<PredictionDnaAuditLog> {
    return logActivePredictionDna(drawName, predictionId, suggestedNumbers, activeWeights, history, metrics);
  },

  /**
   * Récupère la liste des logs d'audit ADN pour un tirage isolé.
   */
  async getPredictionDnaLogs(drawName: string, limit?: number): Promise<PredictionDnaAuditLog[]> {
    return getPredictionDnaLogs(drawName, limit);
  },

  /**
   * Récupère ou reconstruit l'ADN prédictif qui a généré chaque numéro gagnant d'un tirage passé.
   */
  async getWinningNumbersDna(
    drawName: string,
    drawResult: DrawResult,
    fullHistory: DrawResult[],
    activeWeights?: AlgoWeights
  ): Promise<Record<number, NumberDnaAttribution>> {
    return getOrReconstructWinningNumbersDna(drawName, drawResult, fullHistory, activeWeights);
  },

  /**
   * Calcule le drift de performance entre l'ADN injecté par le moteur neural et la réalité statistique observée.
   */
  async computeDnaDrift(
    drawName: string,
    history: DrawResult[],
    injectedWeights: AlgoWeights
  ): Promise<DnaPerformanceDriftReport> {
    return calculateDnaPerformanceDrift(drawName, history, injectedWeights);
  },

  /**
   * Exécute l'inférence stochastique directement dans le moteur Rust Core (WASM / SIMD).
   * 0 ms de latence réseau, zéro requête Supabase.
   */
  async predictWithNativeRustWasm(
    drawName: string,
    history?: DrawResult[],
    weights?: AlgoWeights
  ): Promise<NativePredictionResultHpc> {
    await initializeLotoEngineWasm();
    const data = history && history.length > 0 ? history : await this.fetchHistory(drawName);
    syncHistoryToRustStore(data, drawName);

    const winCols = LOTTERY_CONSTANTS.NUMBERS_PER_DRAW;
    const flat = new Uint8Array(data.length * winCols);
    for (let d = 0; d < data.length; d++) {
      const g = data[d].gagnants || [];
      const offset = d * winCols;
      for (let c = 0; c < winCols; c++) {
        flat[offset + c] = g[c] || 0;
      }
    }

    return runNativePredictionHpc({
      flatWinners: flat,
      numDraws: data.length,
      frequencyWeight: weights?.frequency ?? 1.2,
      gapWeight: weights?.gap ?? 0.8,
      markovWeight: weights?.markov ?? 0.5,
      hurstWeight: weights?.fractal ?? 0.3,
    });
  },

  /**
   * Analyse préalable exhaustive en mémoire vive Rust (Hurst, FFT, Entropie, Régime).
   * Calibre les indicateurs stochastiques fiables avant toute génération prédictive.
   */
  async analyzeDrawPrior(drawName: string): Promise<PriorAnalysisReportHpc> {
    await initializeLotoEngineWasm();
    await this.fetchHistory(drawName);
    return analyzeDrawHistoryHpc(drawName);
  },

  /**
   * Génère un portefeuille de tickets diversifiés (anti-monoculture) avec répulsion quadratique.
   * 100% exécuté en RAM Wasm locale sans aucune requête réseau Supabase.
   */
  async generateDiversifiedPortfolio(drawName: string, numTickets: number = 5): Promise<PredictionPortfolioHpc> {
    await initializeLotoEngineWasm();
    await this.fetchHistory(drawName);
    return generateDiversifiedPortfolioHpc(drawName, numTickets);
  }
};

/**
 * @deprecated INTERDIT EN PRODUCTION (politique stricte de données réelles).
 * Réservé exclusivement aux tests unitaires isolés. Toute invocation depuis le code
 * applicatif viole le contrat « Zéro Fausse Donnée » : aucun tirage simulé ne doit
 * jamais être fabriqué, affiché ou persisté hors contexte de test.
 */
export const generateDeterministicFallbackHistory = (drawName: string): DrawResult[] => {
  let hash = 0;
  for (let i = 0; i < drawName.length; i++) {
    hash = (hash << 5) - hash + drawName.charCodeAt(i);
    hash |= 0;
  }
  let seed = Math.abs(hash || LOTTERY_CONSTANTS.SEED_PRIME);

  const lcg = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const results: DrawResult[] = [];
  const baseDate = new Date();

  for (let i = LOTTERY_CONSTANTS.FALLBACK_HISTORY_DEPTH; i >= 1; i--) {
    const date = new Date(baseDate.getTime() - i * 24 * 60 * 60 * 1000);
    const dayStr = String(date.getDate()).padStart(2, '0');
    const monthStr = String(date.getMonth() + 1).padStart(2, '0');
    const yearStr = date.getFullYear();
    const formattedDate = `${dayStr}/${monthStr}/${yearStr}`;

    const gagnantsPool = new Set<number>();
    while (gagnantsPool.size < LOTTERY_CONSTANTS.NUMBERS_PER_DRAW) {
      const val = Math.floor(lcg() * LOTTERY_CONSTANTS.TOTAL_NUMBERS) + 1;
      gagnantsPool.add(val);
    }
    const gagnants = Array.from(gagnantsPool).sort((a, b) => a - b);

    const withoutMachine = isDrawWithoutMachine(drawName);
    let machine: number[] = [];
    if (!withoutMachine) {
      const machinePool = new Set<number>();
      while (machinePool.size < LOTTERY_CONSTANTS.NUMBERS_PER_DRAW) {
        const val = Math.floor(lcg() * LOTTERY_CONSTANTS.TOTAL_NUMBERS) + 1;
        if (!gagnantsPool.has(val)) {
          machinePool.add(val);
        }
      }
      machine = Array.from(machinePool).sort((a, b) => a - b);
    }

    results.push({
      id: `deterministic-${drawName.replace(/\s+/g, '-')}-${i}-${formattedDate.replace(/\//g, '')}`,
      drawName,
      date: formattedDate,
      gagnants,
      machine,
      version: 1
    });
  }

  return results.reverse();
};

export interface SyncExternalOptions {
  monthsBack?: number;
  months?: string[];
  skipRemoteApi?: boolean;
}

export interface SyncExternalDetailedResult {
  addedCount: number;
  upsertedCount: number;
  fetchedCount: number;
  source: 'edge-cron-sync' | 'express-api' | 'edge-proxy' | 'supabase-db';
  months: string[];
}

const persistFetchedDrawsToLocalCache = async (
  draws: DrawResult[],
  targetDraw: string
): Promise<number> => {
  if (!draws || draws.length === 0) return 0;

  const byDraw = new Map<string, DrawResult[]>();
  for (const d of draws) {
    const cleanName = normalizeDrawName(d.drawName);
    const list = byDraw.get(cleanName) || [];
    list.push({ ...d, drawName: cleanName });
    byDraw.set(cleanName, list);
  }

  let totalAdded = 0;
  for (const [dName, items] of byDraw.entries()) {
    const cacheKey = globalCache.generateKey('history', dName);
    const prevRaw = await globalCache.get<DrawResult[]>(cacheKey, dName);
    const prev = (prevRaw || []).filter((r) => !r.id?.startsWith('deterministic-'));
    const merged = mergeDeltaResults(items, prev);
    const addedForDraw = Math.max(0, merged.length - prev.length);
    totalAdded += addedForDraw;

    await globalCache.set(cacheKey, merged, CACHE_TTL.HISTORY, dName);
    await globalCache.registerNewDraw(dName, merged.length);
    syncHistoryToRustStore(merged, dName);
  }

  if (targetDraw === LOTTERY_CONSTANTS.ALL_DRAWS_IDENTIFIER) {
    const allKey = globalCache.generateKey('history', targetDraw);
    const prevAllRaw = await globalCache.get<DrawResult[]>(allKey, targetDraw);
    const prevAll = (prevAllRaw || []).filter((r) => !r.id?.startsWith('deterministic-'));
    const mergedAll = mergeDeltaResults(draws, prevAll);
    await globalCache.set(allKey, mergedAll, CACHE_TTL.HISTORY, targetDraw);
    await globalCache.registerNewDraw(targetDraw, mergedAll.length);
    syncHistoryToRustStore(mergedAll, targetDraw);
  }

  await invalidateDailySummariesCache();
  return totalAdded;
};

export const syncDrawExternalDetailed = async (
  drawName?: string,
  options: SyncExternalOptions = {}
): Promise<SyncExternalDetailedResult> => {
  const targetDraw = drawName || LOTTERY_CONSTANTS.ALL_DRAWS_IDENTIFIER;
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  const supabaseReady = isSupabaseConfigured();

  if (!supabaseReady) {
    if (!isOnline || typeof window === 'undefined') {
      const err = new AppError(
        "Synchronisation indisponible : aucun backend n'est configuré (mode démo hors-ligne). " +
          "Aucune donnée n'est inventée ; configurez Supabase pour synchroniser de vrais résultats.",
        'SYNC_REQUIRES_BACKEND',
        'low',
        { drawName }
      );
      logError(err, { source: 'syncDrawExternal-offline' });
      throw err;
    }

    // Tente d'utiliser le proxy Express local (/api/results) si le serveur Express tourne
    try {
      const apiRes = await lotteryService.fetchOfficialResultsFromApi({
        drawName: targetDraw !== LOTTERY_CONSTANTS.ALL_DRAWS_IDENTIFIER ? targetDraw : undefined,
        months: options.months,
        monthsBack: options.monthsBack ?? 1,
        refresh: true,
      });

      const added = await persistFetchedDrawsToLocalCache(apiRes.draws, targetDraw);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName: targetDraw, source: 'express-api' } }));
      }
      return {
        addedCount: added,
        upsertedCount: added,
        fetchedCount: apiRes.draws.length,
        source: apiRes.source,
        months: apiRes.months,
      };
    } catch {
      const err = new AppError(
        "Synchronisation indisponible : aucun backend n'est configuré (mode démo hors-ligne). " +
          "Aucune donnée n'est inventée ; configurez Supabase pour synchroniser de vrais résultats.",
        'SYNC_REQUIRES_BACKEND',
        'low',
        { drawName }
      );
      logError(err, { source: 'syncDrawExternal-offline' });
      throw err;
    }
  }

  try {
    const prevCached = await globalCache.get<DrawResult[]>(globalCache.generateKey('history', targetDraw), targetDraw);
    const prevCount = prevCached ? prevCached.filter((d) => !d.id?.startsWith('deterministic-')).length : 0;

    let remoteSource: SyncExternalDetailedResult['source'] = 'supabase-db';
    let remoteUpserted = 0;
    let remoteFetched = 0;
    let syncedMonths: string[] = [];

    if (!options.skipRemoteApi && isOnline) {
      let edgeWorked = false;
      try {
        const edgeRes = await apiClient.post<{
          success?: boolean;
          count?: number;
          upserted?: number;
          fetched?: number;
          months?: string[];
        }>(
          'cron-sync',
          {
            drawName: targetDraw !== LOTTERY_CONSTANTS.ALL_DRAWS_IDENTIFIER ? targetDraw : undefined,
            manualTrigger: true,
            monthsBack: options.monthsBack,
            months: options.months,
          },
          { suppressErrorLogging: true }
        );

        if (edgeRes && edgeRes.success !== false) {
          edgeWorked = true;
          remoteSource = 'edge-cron-sync';
          remoteUpserted = Number(edgeRes.upserted ?? edgeRes.count ?? 0);
          remoteFetched = Number(edgeRes.fetched ?? 0);
          syncedMonths = Array.isArray(edgeRes.months) ? edgeRes.months : [];
        }
      } catch {
        // Fallback sur Express /api/results/sync ou proxy-results si cron-sync Edge n'est pas joignable
      }

      if (!edgeWorked && typeof window !== 'undefined') {
        try {
          const resp = await fetch('/api/results/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              drawName: targetDraw !== LOTTERY_CONSTANTS.ALL_DRAWS_IDENTIFIER ? targetDraw : undefined,
              months: options.months,
              monthsBack: options.monthsBack ?? 1,
              persist: true,
            }),
            signal: AbortSignal.timeout(15000),
          });
          const ct = resp.headers.get('content-type') || '';
          if (resp.ok && ct.includes('application/json')) {
            const apiPayload = await resp.json();
            if (apiPayload && Array.isArray(apiPayload.draws)) {
              remoteSource = 'express-api';
              remoteFetched = apiPayload.draws.length;
              remoteUpserted = Number(apiPayload.upserted ?? 0);
              syncedMonths = Array.isArray(apiPayload.months) ? apiPayload.months : [];

              if (!apiPayload.persisted && apiPayload.draws.length > 0) {
                const mappedDraws = apiPayload.draws.map(mapDbRowToDrawResult);
                await persistFetchedDrawsToLocalCache(mappedDraws, targetDraw);
              }
            }
          }
        } catch {
          // On continue avec le rechargement direct de la table Supabase draw_results
        }
      }
    }

    await invalidateDailySummariesCache();
    syncDrawCancellationsFromDb(true).catch(() => {});

    const updated = await lotteryService.fetchHistory(targetDraw, true);
    const newCount = updated.filter((d) => !d.id?.startsWith('deterministic-')).length;
    const addedCount = Math.max(0, newCount - prevCount);

    if (typeof window !== 'undefined' && (addedCount > 0 || remoteUpserted > 0)) {
      window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName: targetDraw, source: remoteSource } }));
    }

    return {
      addedCount,
      upsertedCount: remoteUpserted,
      fetchedCount: remoteFetched || updated.length,
      source: remoteSource,
      months: syncedMonths,
    };
  } catch (e: unknown) {
    logError(new AppError(getErrorMessage(e) || 'Sync failed', 'SYNC_ERROR', 'medium', { drawName }), {
      source: 'syncDrawExternal',
    });
    throw e;
  }
};

export const syncDrawExternal = async (
  drawName?: string,
  options?: SyncExternalOptions
): Promise<number> => {
  const res = await syncDrawExternalDetailed(drawName, options);
  return Math.max(res.addedCount, res.upsertedCount);
};

export const checkAndSyncRecentResults = async (
  drawName?: string,
  options?: SyncExternalOptions
): Promise<number> => {
  return syncDrawExternal(drawName, options);
};

export const computeAnalytics = async (drawName: string): Promise<boolean> => {
  try {
    await initializeLotoEngineWasm();
    await lotteryService.fetchHistory(drawName);
    return true;
  } catch {
    return false;
  }
};

export const fetchResults = async (drawName: string, force?: boolean): Promise<{ data: DrawResult[] }> => {
  const data = await lotteryService.fetchHistory(drawName, force);
  return { data };
};

export const fetchOfficialResultsFromApi: typeof lotteryService.fetchOfficialResultsFromApi = (options) =>
  lotteryService.fetchOfficialResultsFromApi(options);

export const fetchRecentSyncStatus: typeof lotteryService.fetchRecentSyncStatus = (limit) =>
  lotteryService.fetchRecentSyncStatus(limit);

export const fetchResultsByDateRange: typeof lotteryService.fetchResultsByDateRange = (drawName, startDate, endDate) =>
  lotteryService.fetchResultsByDateRange(drawName, startDate, endDate);

export const fetchResultsPage: typeof lotteryService.fetchResultsPage = (drawName, page, pageSize) =>
  lotteryService.fetchResultsPage(drawName, page, pageSize);

export const fetchLatestResults: typeof lotteryService.fetchLatestResults = (drawNames, lookbackDays) =>
  lotteryService.fetchLatestResults(drawNames, lookbackDays);

export interface DailySummaryItem {
  time: string;
  name: string;
  result: DrawResult | null;
  targetDateIso?: string;
  hasResultForTargetDate?: boolean;
  exception?: DrawException | null;
  isSkipped?: boolean;
}

const enrichDailySummaryWithExceptions = (
  day: string,
  items: { time: string; name: string; result: DrawResult | null }[]
): DailySummaryItem[] => {
  const targetDateIso = getWeekdayReferenceDateIso(day);
  return items.map((item) => {
    const resultDateIso = item.result?.date ? toCanonicalIsoDate(item.result.date) : null;
    const hasResultForTargetDate = Boolean(resultDateIso && resultDateIso === targetDateIso);
    const exception = getDrawException(targetDateIso, item.name);
    const isSkipped = Boolean(exception && !hasResultForTargetDate);
    return {
      ...item,
      targetDateIso,
      hasResultForTargetDate,
      exception,
      isSkipped,
    };
  });
};

export const getDailySummary = async (day: string): Promise<DailySummaryItem[]> => {
  const draws = DRAW_SCHEDULE[day] || {};
  const sortedTimes = Object.keys(draws).sort();
  const drawNames = sortedTimes.map((time) => draws[time]);
  const summaryCacheKey = globalCache.generateKey('daily_summary', day);

  const cachedSummary = await globalCache.get<{ time: string; name: string; result: DrawResult | null }[]>(summaryCacheKey);
  if (cachedSummary && cachedSummary.length > 0 && cachedSummary.some((s) => s.result !== null)) {
    return enrichDailySummaryWithExceptions(day, cachedSummary);
  }

  if (isSupabaseConfigured() && navigator.onLine) {
    try {
      // Hydratation discrète des annulations serveur (respecte son cooldown de 5 min)
      syncDrawCancellationsFromDb(false).catch(() => {});

      const latestByDraw = await lotteryService.fetchLatestResults(drawNames, 30);
      if (latestByDraw.size > 0) {
        const summaryResult = sortedTimes.map((time) => ({
          time,
          name: draws[time],
          result: latestByDraw.get(draws[time]) || null,
        }));
        await globalCache.set(summaryCacheKey, summaryResult, CACHE_TTL.SHORT);
        return enrichDailySummaryWithExceptions(day, summaryResult);
      }
    } catch (err) {
      console.warn('[getDailySummary] Batch fetch fallback:', err);
    }
  }

  // Fallback sur les caches d'historiques locaux par tirage
  const promises = sortedTimes.map(async (time) => {
    const name = draws[time];
    let lastDraw: DrawResult | null = null;
    try {
      const history = await lotteryService.fetchHistory(name);
      if (history.length > 0) lastDraw = history[0];
      return { time, name, result: lastDraw };
    } catch {
      return { time, name, result: null };
    }
  });

  const fallbackSummary = await Promise.all(promises);
  await globalCache.set(summaryCacheKey, fallbackSummary, CACHE_TTL.SHORT);
  return enrichDailySummaryWithExceptions(day, fallbackSummary);
};

export interface NextScheduledDrawInfo {
  time: string;
  name: string;
  day: string;
  dateIso: string;
  targetTimestamp: number;
  skippedSlots: SkippedDrawSlot[];
}

export const getNextScheduledDraw = (fromDate: Date = new Date()): NextScheduledDrawInfo | null => {
  const activeSlot = findNextActiveScheduledSlot(DRAW_SCHEDULE, fromDate, 14);
  if (activeSlot) {
    return activeSlot;
  }

  // Repli ultime si 14 jours complets étaient exceptionnellement neutralisés
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const tomorrowIndex = (fromDate.getDay() + 1) % 7;
  const tomorrowName = days[tomorrowIndex];
  const tomorrowSchedule = DRAW_SCHEDULE[tomorrowName];
  if (!tomorrowSchedule) return null;
  const tomorrowTimes = Object.keys(tomorrowSchedule).sort();
  const firstDraw = tomorrowTimes[0];
  const target = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + 1);
  const [h, m] = firstDraw.split(':').map(Number);
  target.setHours(h, m, 0, 0);
  return {
    time: firstDraw,
    name: tomorrowSchedule[firstDraw],
    day: tomorrowName,
    dateIso: toCanonicalIsoDate(target),
    targetTimestamp: target.getTime(),
    skippedSlots: [],
  };
};

export const fetchRecentStats = async (days: number = 7, drawName?: string) => {
  const cacheKey = globalCache.generateKey('recent_stats', `${days}d`, drawName || 'global');
  
  const cached = await globalCache.get<any>(cacheKey, drawName);
  if (cached) return cached;

  // 100% Calculé en Rust/WASM depuis l'historique Delta-Sync local (Zéro requête supplémentaire vers Supabase)
  const stats = await computeRecentStatsFromHistory(days, drawName);
  await globalCache.set(cacheKey, stats, CACHE_TTL.MEDIUM, drawName);
  return stats;
};

export const fetchGlobalStats = async (drawName?: string) => {
  const cacheKey = globalCache.generateKey('global_stats', drawName || 'global');
  
  const cached = await globalCache.get<any>(cacheKey, drawName);
  if (cached) return cached;

  // 100% Calculé en Rust/WASM depuis l'historique Delta-Sync local (Zéro requête supplémentaire vers Supabase)
  const stats = await computeGlobalStatsFromHistory(drawName);
  await globalCache.set(cacheKey, stats, CACHE_TTL.MEDIUM, drawName);
  return stats;
};

const flattenDrawsForHpc = (draws: DrawResult[]): Int32Array => {
  const winCols = LOTTERY_CONSTANTS.NUMBERS_PER_DRAW;
  const flat = new Int32Array(draws.length * winCols);
  for (let d = 0; d < draws.length; d++) {
    const g = draws[d].gagnants || [];
    const offset = d * winCols;
    for (let c = 0; c < winCols; c++) {
      flat[offset + c] = g[c] || 0;
    }
  }
  return flat;
};

const computeRecentStatsFromHistory = async (days: number, drawName?: string): Promise<{ number: number, count: number }[]> => {
  try {
    await initializeLotoEngineWasm();
    const history = await lotteryService.fetchHistory(drawName || 'ALL');
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);
    
    const filteredHistory = history.filter(h => {
      const hTime = getDrawTimestamp(h.date);
      return hTime >= dateLimit.getTime();
    });
    const sample = filteredHistory.length > 0 ? filteredHistory : history.slice(0, 30);
    const flat = flattenDrawsForHpc(sample);
    const countsArr = computeFrequencyCountsHpc(flat, sample.length, LOTTERY_CONSTANTS.NUMBERS_PER_DRAW);

    const out: { number: number; count: number }[] = [];
    for (let n = 1; n <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; n++) {
      if (countsArr[n] > 0) {
        out.push({ number: n, count: countsArr[n] });
      }
    }
    return out.sort((a, b) => b.count - a.count || a.number - b.number);
  } catch (_) {
    return [];
  }
};

const computeGlobalStatsFromHistory = async (drawName?: string): Promise<{ number: number, count: number }[]> => {
  try {
    const targetDraw = drawName || 'ALL';
    if (getStoreDrawCount(targetDraw) > 0) {
      const countsArr = getStoreFrequencies(targetDraw);
      const out: { number: number; count: number }[] = [];
      for (let n = 1; n <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; n++) {
        if (countsArr[n] > 0) {
          out.push({ number: n, count: countsArr[n] });
        }
      }
      return out.sort((a, b) => b.count - a.count || a.number - b.number);
    }
    const history = await lotteryService.fetchHistory(targetDraw);
    const flat = flattenDrawsForHpc(history);
    const countsArr = computeFrequencyCountsHpc(flat, history.length, LOTTERY_CONSTANTS.NUMBERS_PER_DRAW);

    const out: { number: number; count: number }[] = [];
    for (let n = 1; n <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; n++) {
      if (countsArr[n] > 0) {
        out.push({ number: n, count: countsArr[n] });
      }
    }
    return out.sort((a, b) => b.count - a.count || a.number - b.number);
  } catch (_) {
    return [];
  }
};

export const triggerAutomationForNewResults = async (drawName: string, date: string, resultId?: string, _forceLocal: boolean = true) => {
  // LOGIQUE D'AUTOPSIE 100% LOCALE (Full Feedback Loop Rust/WASM sans appel d'Edge Function Supabase)
  try {
    const { getPredictionHistoryAsync, linkPredictionToResult, findMatchingResultForPrediction } = await import('./predictionHistoryService');
    const { performForensicAnalysis, saveForensicReport, getForensicReportByPredictionId, getDismissedAutopsyPredictionIds } = await import('./postPredictionAnalysisService');
    const { purifyHistoryForDraw } = await import('../utils/arrayUtils');

    const history = await lotteryService.fetchHistory(drawName);
    const resultToMatch = history.find((r) => r.date === normalizeDate(date) || r.id === resultId);
    
    if (!resultToMatch) return;

    const unlinkedOrTargetPredictions = (await getPredictionHistoryAsync(drawName)).filter(
      p => !p.drawResultId || p.drawResultId === resultToMatch.id
    );

    const dismissedPredictionIds = await getDismissedAutopsyPredictionIds();
    const cleanHistory = purifyHistoryForDraw(drawName, history);
    let autopsiesRun = 0;
    
    for (const pred of unlinkedOrTargetPredictions) {
      if (dismissedPredictionIds.has(pred.id)) continue;

      // Matching temporel déterministe unifié
      const match = pred.drawResultId === resultToMatch.id
        ? resultToMatch
        : findMatchingResultForPrediction(pred, history);

      if (match && match.id === resultToMatch.id) {
          const existingReport = await getForensicReportByPredictionId(pred.id);
          if (!existingReport) {
            logger.debug({ predictionId: pred.id }, `[Autopsy Locale] Execution forensics`);
            const report = await performForensicAnalysis(
              drawName,
              resultToMatch.date,
              pred.prediction.suggestedNumbers,
              resultToMatch.gagnants,
              pred.prediction.breakdown,
              pred.id,
              resultToMatch.id,
              true, // skipLLM for automated background analysis
              cleanHistory
            );
            await saveForensicReport(report);
            autopsiesRun++;

            // Auto-Calibration Rétroactive en Boucle Fermée (Continuous Closed-Loop SGD)
            try {
              const { generateLearningSession, applyForensicAdjustments } = await import('./forensicTrainingBridge');
              const learningSession = await generateLearningSession(report, cleanHistory);
              if (learningSession && learningSession.adjustments && learningSession.adjustments.length > 0) {
                await applyForensicAdjustments(learningSession);
                logger.info({ drawName }, `[Closed-Loop Auto-Feedback] Poids algorithmiques mis à jour`);
              }
            } catch (closedLoopErr) {
              logger.warn({ err: closedLoopErr }, "[Closed-Loop Auto-Feedback] Auto-ajustement non critique");
            }
          }
          if (pred.drawResultId !== resultToMatch.id) {
            await linkPredictionToResult(pred.id, resultToMatch.id);
          }
      }
    }

    // Réconciliation systématique des logs ADN actifs avec les numéros du tirage réel
    try {
      const reconciledDnaCount = await reconcileDnaLogsWithDrawResult(drawName, resultToMatch, cleanHistory);
      if (reconciledDnaCount > 0) {
        logger.info({ reconciledDnaCount, date: resultToMatch.date }, `[ADN Audit] Log(s) ADN réconcilié(s)`);
      }
    } catch (dnaErr) {
      logger.warn({ err: dnaErr }, "[ADN Audit] Erreur lors de la réconciliation ADN");
    }

    if (autopsiesRun > 0) {
       logger.info({ autopsiesRun }, `[Autopsie] Autopsie(s) effectuée(s).`);
    } else {
       logger.debug(`[Autopsie] Enregistrement d'un nouveau tirage sans autopsie.`);
    }
  } catch (e) {
    console.error("Local automation trigger failed:", e);
  }
};

export const bulkAddResults = async (drawName: string, results: { date: string, draw_num?: string, numbers?: string[], gagnants: number[], machine?: number[], draw_name?: string }[]) => {
  const mappedLocal = results.map((r, i) => {
    const targetName = normalizeDrawName(r.draw_name || drawName);
    const withoutMachine = isDrawWithoutMachine(targetName);
    const normDate = normalizeDate(r.date);
    const validMac = !withoutMachine && Array.isArray(r.machine) && r.machine.length === 5 ? r.machine : [];
    return {
      id: (r as any).id || `draw_import_${targetName.replace(/\s+/g, '_')}_${normDate}_${i}`,
      draw_name: targetName,
      date: normDate,
      gagnants: r.gagnants,
      machine: validMac,
      version: 1
    };
  });

  if (!isSupabaseConfigured()) {
    const byDraw = new Map<string, typeof mappedLocal>();
    for (const item of mappedLocal) {
      const list = byDraw.get(item.draw_name) || [];
      list.push(item);
      byDraw.set(item.draw_name, list);
    }
    for (const [dName, items] of byDraw.entries()) {
      const cacheKey = globalCache.generateKey('history', dName);
      const existing = (await globalCache.get<DrawResult[]>(cacheKey, dName)) || [];
      const dateSet = new Set(existing.map(e => normalizeDate(e.date)));
      const newItems: DrawResult[] = [];
      for (const it of items) {
        if (!dateSet.has(it.date)) {
          dateSet.add(it.date);
          newItems.push({
            id: it.id,
            drawName: it.draw_name,
            date: formatDate(it.date),
            gagnants: it.gagnants,
            machine: it.machine,
            version: 1,
          });
        }
      }
      const combined = [...newItems, ...existing].sort((a, b) => getDrawTimestamp(b.date, b.drawName) - getDrawTimestamp(a.date, a.drawName));
      await globalCache.set(cacheKey, combined, CACHE_TTL.HISTORY, dName);
      await globalCache.registerNewDraw(dName, combined.length);
      await invalidateDailySummariesCache();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName: dName } }));
      }
    }
    return mappedLocal;
  }

  const dbPayload = mappedLocal.map((item) => ({
    draw_name: item.draw_name,
    date: item.date,
    gagnants: item.gagnants,
    machine: sanitizeMachineForDb(item.draw_name, item.machine),
    version: item.version,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase.from('draw_results').upsert(dbPayload, { onConflict: 'draw_name,date' }).select();
  if (error) throw error;

  await invalidateDailySummariesCache();
  await globalCache.delete(globalCache.generateKey('history', drawName));

  // Trigger automation for all inserted/updated results
  if (data && data.length > 0) {
      for (const res of data) {
          await triggerAutomationForNewResults(res.draw_name, res.date, res.id);
      }
      if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName } }));
      }
  }
  return data;
};

export const addResult = async (drawName: string, result: Omit<DrawResult, 'id'>) => {
  const targetName = normalizeDrawName(drawName);
  const withoutMachine = isDrawWithoutMachine(targetName);
  const normalizedDateStr = normalizeDate(result.date);
  const sanitizedMachine = withoutMachine || !Array.isArray(result.machine) || result.machine.length !== 5 ? [] : result.machine;

  if (!isSupabaseConfigured()) {
    const cacheKey = globalCache.generateKey('history', targetName);
    const existing = (await globalCache.get<DrawResult[]>(cacheKey, targetName)) || [];
    const newEntry: DrawResult = {
      id: `draw_loc_${targetName.replace(/\s+/g, '_')}_${normalizedDateStr}_${result.gagnants.join('_')}`,
      drawName: targetName,
      date: formatDate(normalizedDateStr),
      gagnants: result.gagnants,
      machine: sanitizedMachine,
      version: 1,
    };
    const combined = [newEntry, ...existing.filter(e => normalizeDate(e.date) !== normalizedDateStr)];
    combined.sort((a, b) => getDrawTimestamp(b.date, b.drawName) - getDrawTimestamp(a.date, a.drawName));
    await globalCache.set(cacheKey, combined, CACHE_TTL.HISTORY, targetName);
    await invalidateDailySummariesCache();
    lastSyncedFingerprintByDraw.delete(targetName.trim().toUpperCase());
    appendSingleDrawToStore(
      targetName,
      Math.floor(getDrawTimestamp(normalizedDateStr, targetName) / 1000),
      result.gagnants,
      sanitizedMachine
    );
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName: targetName } }));
    }
    return newEntry;
  }

  const { data, error } = await supabase.from('draw_results').upsert({
    draw_name: targetName,
    date: normalizedDateStr,
    gagnants: result.gagnants,
    machine: sanitizeMachineForDb(targetName, sanitizedMachine),
    version: 1,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'draw_name,date' }).select().single();
  if (error) throw error;

  await invalidateDailySummariesCache();
  await globalCache.delete(globalCache.generateKey('history', targetName));

  if (data) {
      lastSyncedFingerprintByDraw.delete(data.draw_name.trim().toUpperCase());
      appendSingleDrawToStore(
        data.draw_name,
        Math.floor(getDrawTimestamp(data.date, data.draw_name) / 1000),
        data.gagnants,
        data.machine || []
      );
      await triggerAutomationForNewResults(data.draw_name, data.date, data.id);
      if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName: data.draw_name } }));
      }
  }
  return data;
};

export const updateResult = async (drawName: string, result: DrawResult) => {
  const targetName = normalizeDrawName(drawName);
  const withoutMachine = isDrawWithoutMachine(targetName);
  const normalizedDateStr = normalizeDate(result.date);
  const sanitizedMachine = withoutMachine || !Array.isArray(result.machine) || result.machine.length !== 5 ? [] : result.machine;

  if (!isSupabaseConfigured()) {
    const cacheKey = globalCache.generateKey('history', drawName);
    const history = await globalCache.get<DrawResult[]>(cacheKey, drawName);
    if (history) {
      const updatedHistory = history.map(item => item.id === result.id ? {
        ...item,
        date: formatDate(normalizedDateStr),
        gagnants: result.gagnants,
        machine: sanitizedMachine,
        version: (item.version || 1) + 1,
      } : item);
      await globalCache.set(cacheKey, updatedHistory, CACHE_TTL.HISTORY, drawName);
      await invalidateDailySummariesCache();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName } }));
      }
    }
    return;
  }

  const { data, error } = await supabase.from('draw_results').update({
    date: normalizedDateStr,
    gagnants: result.gagnants,
    machine: sanitizeMachineForDb(targetName, sanitizedMachine),
    version: result.version || 1,
    updated_at: new Date().toISOString(),
  }).eq('id', result.id).select().single();
  if (error) throw error;

  await invalidateDailySummariesCache();
  await globalCache.delete(globalCache.generateKey('history', drawName));

  if (data) {
      await triggerAutomationForNewResults(data.draw_name, data.date, data.id);
      if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName: data.draw_name } }));
      }
  }
};

export const deleteResult = async (drawName: string, id: string) => {
  if (!isSupabaseConfigured()) {
    const cacheKey = globalCache.generateKey('history', drawName);
    const history = await globalCache.get<DrawResult[]>(cacheKey, drawName);
    if (history) {
      const updatedHistory = history.filter(item => item.id !== id);
      await globalCache.set(cacheKey, updatedHistory, CACHE_TTL.HISTORY, drawName);
      await globalCache.registerNewDraw(drawName, updatedHistory.length);
      await invalidateDailySummariesCache();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName } }));
      }
    }
    return;
  }

  const { error } = await supabase.from('draw_results').delete().eq('id', id);
  if (error) throw error;

  const cacheKey = globalCache.generateKey('history', drawName);
  await globalCache.delete(cacheKey);
  await invalidateDailySummariesCache();

  if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName } }));
  }
};

export const bulkDeleteResults = async (drawName: string, ids: string[]) => {
  if (!isSupabaseConfigured()) {
    const cacheKey = globalCache.generateKey('history', drawName);
    const history = await globalCache.get<DrawResult[]>(cacheKey, drawName);
    if (history) {
      const updatedHistory = history.filter(item => !ids.includes(item.id));
      await globalCache.set(cacheKey, updatedHistory, CACHE_TTL.HISTORY, drawName);
      await globalCache.registerNewDraw(drawName, updatedHistory.length);
      await invalidateDailySummariesCache();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName } }));
      }
    }
    return;
  }
  const { error } = await supabase.from('draw_results').delete().in('id', ids);
  if (error) throw error;

  const cacheKey = globalCache.generateKey('history', drawName);
  await globalCache.delete(cacheKey);
  await invalidateDailySummariesCache();

  if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName } }));
  }
};

export const purgeAllResults = async (drawName: string) => {
  if (!isSupabaseConfigured()) {
    const cacheKey = globalCache.generateKey('history', drawName);
    await globalCache.delete(cacheKey);
    await globalCache.registerNewDraw(drawName, 0);
    await invalidateDailySummariesCache();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName } }));
    }
    return;
  }
  const { error } = await supabase.from('draw_results').delete().eq('draw_name', normalizeDrawName(drawName));
  if (error) throw error;

  const cacheKey = globalCache.generateKey('history', drawName);
  await globalCache.delete(cacheKey);
  await globalCache.registerNewDraw(drawName, 0);
  await invalidateDailySummariesCache();

  if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName } }));
  }
};

export const fetchNextDrawProjections = async (drawName: string, lastNumbers: number[], history: DrawResult[]): Promise<ProjectionItem[]> => {
    return await getProjectionsAsync(history, lastNumbers);
};

export const fetchTopFollowersAnalysis = async (drawName: string, history: DrawResult[]): Promise<TopFollowerAnalysis[]> => {
    return await getFollowersAnalysisAsync(history);
};

export const fetchAssociatedNumbers = async (number: number, drawName: string, history: DrawResult[]): Promise<{ following: { number: number; count: number }[] }> => {
    const followers: Record<number, number> = {};
    for (let i = 0; i < history.length - 1; i++) {
        const prev = history[i+1].gagnants;
        if (prev.includes(number)) {
            const current = history[i].gagnants;
            current.forEach(n => followers[n] = (followers[n] || 0) + 1);
        }
    }
    const sorted = Object.entries(followers).map(([n, c]) => ({ number: Number(n), count: c })).sort((a, b) => b.count - a.count).slice(0, 10);
    return { following: sorted };
};

export {
  logActivePredictionDna,
  getPredictionDnaLogs,
  qualifyNumberDna,
  reconcileDnaLogsWithDrawResult,
  getOrReconstructWinningNumbersDna,
  calculateDnaPerformanceDrift,
  type PredictionDnaAuditLog,
  type NumberDnaAttribution,
  type DnaPerformanceDriftReport,
};


