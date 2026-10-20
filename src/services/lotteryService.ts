
import { DrawResult, ProjectionItem, TopFollowerAnalysis, AlgoWeights } from '../types';
import { DRAW_SCHEDULE, isDrawWithoutMachine, getDrawFullTimestamp } from '../constants';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getProjectionsAsync, getFollowersAnalysisAsync } from './mathService';
import { apiClient } from '../core/api/apiClient';
import { AppError, logError, getErrorMessage } from '../utils/AppError';
import { globalCache, CACHE_TTL } from './cache/CacheService';
import {
  computeFrequencyCountsHpc,
  initializeLotoEngineWasm,
  appendSingleDrawToStore,
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

const inFlightHistoryFetches = new Map<string, Promise<DrawResult[]>>();
const lastDeltaSyncByDraw = new Map<string, number>();
const DELTA_SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes de cooldown entre synchronisations différentielles par tirage

const mergeDeltaResults = (deltaRows: DrawResult[], existing: DrawResult[]): DrawResult[] => {
  const byKey = new Map<string, DrawResult>();
  for (const item of existing) {
    if (item.id && item.id.startsWith('deterministic-')) continue;
    const key = `${normalizeDrawName(item.drawName)}_${normalizeDate(item.date)}`;
    byKey.set(key, item);
  }
  for (const row of deltaRows) {
    const key = `${normalizeDrawName(row.drawName)}_${normalizeDate(row.date)}`;
    byKey.set(key, row);
  }
  return Array.from(byKey.values())
    .sort((a, b) => getDrawTimestamp(b.date, b.drawName) - getDrawTimestamp(a.date, a.drawName))
    .slice(0, LOTTERY_CONSTANTS.MAX_HISTORY_LIMIT);
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

/**
 * Synchronise l'historique contigu en mémoire vive dans le store Rust Core (WASM).
 * Applique :
 * 1. Un contrôle d'idempotence strict par empreinte (zéro ré-injection cumulative).
 * 2. Un tri chronologique ascendant (flèche du temps) pour que history.last() soit le plus récent.
 * 3. La conversion en secondes POSIX des horodatages.
 */
export const syncHistoryToRustStore = (draws: DrawResult[], targetDrawName?: string): void => {
  if (!draws || draws.length === 0) return;
  const drawKey = (targetDrawName || 'GLOBAL').trim().toUpperCase();

  // Empreinte d'idempotence robuste basée sur le drawKey, la cardinalité et les signatures des bornes
  const newest = draws[0];
  const oldest = draws[draws.length - 1];
  const fingerprint = `${drawKey}:${draws.length}:${newest?.date || ''}:${newest?.gagnants?.join(',') || ''}:${oldest?.date || ''}:${oldest?.gagnants?.join(',') || ''}`;

  if (lastSyncedFingerprintByDraw.get(drawKey) === fingerprint) {
    return; // Déjà synchronisé, no-op strict
  }

  try {
    // Inversion chronologique stricte : du plus ancien au plus récent
    const chronological = [...draws].reverse();

    for (const d of chronological) {
      if (d.gagnants && d.gagnants.length >= LOTTERY_CONSTANTS.NUMBERS_PER_DRAW) {
        const tsMs = getDrawTimestamp(d.date, d.drawName || targetDrawName);
        const tsSec = Math.floor(tsMs / 1000); // Secondes POSIX
        appendSingleDrawToStore(
          d.drawName || targetDrawName || 'GLOBAL',
          tsSec,
          d.gagnants,
          d.machine || []
        );
      }
    }
    lastSyncedFingerprintByDraw.set(drawKey, fingerprint);
  } catch (err) {
    console.warn('[lotteryService] Erreur synchronisation store Rust :', err);
  }
};

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
            let bgTimer: ReturnType<typeof setTimeout> | undefined;
            try {
              const latestIsoDate = normalizeDate(realCached[0].date);
              let query = supabase
                .from('draw_results')
                .select('*')
                .gte('date', latestIsoDate)
                .order('date', { ascending: false });

              if (drawName && drawName !== LOTTERY_CONSTANTS.ALL_DRAWS_IDENTIFIER) {
                query = query.eq('draw_name', normalizeDrawName(drawName));
              }
              query = query.limit(100);

              const bgTimeoutPromise = new Promise<never>((_, reject) => {
                bgTimer = setTimeout(() => reject(new AppError('Background delta refresh timeout', 'NETWORK_TIMEOUT', 'low')), 4000);
              });

              const res = (await Promise.race([query, bgTimeoutPromise])) as { data: any[] | null; error: any };
              const { data } = res || {};
              if (data && data.length > 0) {
                const delta = data.map(row => ({
                  id: row.id,
                  drawName: row.draw_name,
                  date: formatDate(row.date),
                  gagnants: row.gagnants,
                  machine: row.machine || [],
                  version: row.version || 1
                }));
                const merged = mergeDeltaResults(delta, realCached);
                if (merged.length > realCached.length) {
                  await globalCache.registerNewDraw(drawName, merged.length);
                }
                await globalCache.set(cacheKey, merged, CACHE_TTL.HISTORY, drawName);
              }
            } catch {
              // Silently ignore background delta revalidation failures
            } finally {
              if (bgTimer) clearTimeout(bgTimer);
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
      const hasRealCache = existingCached && existingCached.length > 0 && !existingCached[0]?.id?.startsWith('deterministic-');

      if (isSupabaseConfigured() && navigator.onLine) {
        let queryTimer: ReturnType<typeof setTimeout> | undefined;
        try {
            let query = supabase
              .from('draw_results')
              .select('*')
              .order('date', { ascending: false });

            if (drawName && drawName !== LOTTERY_CONSTANTS.ALL_DRAWS_IDENTIFIER) {
                query = query.eq('draw_name', normalizeDrawName(drawName));
            }
            
            // DELTA-SYNC : Si une base locale réelle existe déjà, on ne télécharge que les tirages >= à la dernière date connue
            if (hasRealCache) {
                const latestIsoDate = normalizeDate(existingCached[0].date);
                query = query.gte('date', latestIsoDate).limit(200);
            } else {
                query = query.limit(LOTTERY_CONSTANTS.MAX_HISTORY_LIMIT);
            }
            
            // Timeout de protection réseau à 3500ms avec nettoyage garanti du timer
            const timeoutPromise = new Promise<never>((_, reject) => {
              queryTimer = setTimeout(() => {
                reject(new AppError('Supabase request timeout after 3500ms', 'NETWORK_TIMEOUT', 'low', { drawName }));
              }, 3500);
            });

            let res: { data: any[] | null; error: any };
            try {
              res = (await Promise.race([query, timeoutPromise])) as {
                data: any[] | null;
                error: any;
              };
            } finally {
              if (queryTimer) clearTimeout(queryTimer);
            }

            const { data, error } = res;
            
            if (error) {
                throw new AppError(getErrorMessage(error), 'SUPABASE_FETCH_ERROR', 'medium', { drawName, error });
            }
            
            if (data) {
                lastDeltaSyncByDraw.set(drawName, Date.now());
                const fetchedRows: DrawResult[] = data.map(row => ({
                  id: row.id,
                  drawName: row.draw_name,
                  date: formatDate(row.date),
                  gagnants: row.gagnants,
                  machine: row.machine || [],
                  version: row.version || 1
                }));

                const finalData = hasRealCache
                  ? mergeDeltaResults(fetchedRows, existingCached)
                  : fetchedRows;

                if (finalData.length > 0) {
                  syncHistoryToRustStore(finalData, drawName);
                  await globalCache.registerNewDraw(drawName, finalData.length);
                  await globalCache.set(cacheKey, finalData, CACHE_TTL.HISTORY, drawName);
                  return finalData;
                }
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
        } finally {
            if (queryTimer) clearTimeout(queryTimer);
        }
    }

    // Fallback to real cache if network fails or offline
    if (existingCached && existingCached.length > 0) {
      const realCached = existingCached.filter(d => !d.id?.startsWith('deterministic-'));
      if (realCached.length > 0) {
        syncHistoryToRustStore(realCached, drawName);
        return realCached;
      }
    }

    // ÉRADICATION TOTALE DES DONNÉES SIMULÉES : ZÉRO FAUX TIRAGE GÉNÉRÉ
    // Si la synchronisation réseau échoue et qu'aucun tirage réel n'est en cache,
    // on renvoie un tableau vide pour afficher l'état d'attente de synchronisation.
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

export const getDrawTimestamp = (dateStr: string, drawName?: string, explicitTime?: string): number => {
    return getDrawFullTimestamp(dateStr, drawName, explicitTime);
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

export const syncDrawExternal = async (drawName?: string): Promise<number> => {
  if (!isSupabaseConfigured()) {
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

  try {
    // Delta-Sync local depuis la table draw_results de Supabase (Zéro appel d'Edge Function coûteux)
    const targetDraw = drawName || LOTTERY_CONSTANTS.ALL_DRAWS_IDENTIFIER;
    const prevCached = await globalCache.get<DrawResult[]>(globalCache.generateKey('history', targetDraw), targetDraw);
    const prevCount = prevCached ? prevCached.filter(d => !d.id?.startsWith('deterministic-')).length : 0;
    const updated = await lotteryService.fetchHistory(targetDraw, true);
    const newCount = updated.filter(d => !d.id?.startsWith('deterministic-')).length;
    return Math.max(0, newCount - prevCount);
  } catch (e: unknown) {
    logError(new AppError(getErrorMessage(e) || 'Sync failed', 'SYNC_ERROR', 'medium', { drawName }), { source: 'syncDrawExternal' });
    throw e;
  }
};

export const checkAndSyncRecentResults = async (drawName?: string): Promise<number> => {
    return syncDrawExternal(drawName);
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

export const getDailySummary = async (day: string) => {
  const draws = DRAW_SCHEDULE[day] || {};
  const sortedTimes = Object.keys(draws).sort(); 
  const drawNames = sortedTimes.map((time) => draws[time]);
  const summaryCacheKey = globalCache.generateKey('daily_summary', day);

  const cachedSummary = await globalCache.get<{ time: string; name: string; result: DrawResult | null }[]>(summaryCacheKey);
  if (cachedSummary && cachedSummary.length > 0 && cachedSummary.some(s => s.result !== null)) {
    return cachedSummary;
  }
  
  if (isSupabaseConfigured() && navigator.onLine) {
    try {
      // Delta-Window de 14 jours et limite stricte pour éviter de télécharger toute la table draw_results
      const recentCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('draw_results')
        .select('*')
        .in('draw_name', drawNames)
        .gte('date', recentCutoff)
        .order('date', { ascending: false })
        .limit(Math.max(20, drawNames.length * 3));

      if (!error && data && data.length > 0) {
        const latestByDraw = new Map<string, DrawResult>();
        for (const row of data) {
          if (!latestByDraw.has(row.draw_name)) {
            latestByDraw.set(row.draw_name, {
              id: row.id,
              drawName: row.draw_name,
              date: formatDate(row.date),
              gagnants: row.gagnants,
              machine: row.machine || [],
              version: row.version || 1
            });
          }
        }
        const summaryResult = sortedTimes.map(time => ({
          time,
          name: draws[time],
          result: latestByDraw.get(draws[time]) || null
        }));
        await globalCache.set(summaryCacheKey, summaryResult, CACHE_TTL.SHORT);
        return summaryResult;
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
      } catch (e) {
          return { time, name, result: null };
      }
  });
  
  const fallbackSummary = await Promise.all(promises);
  await globalCache.set(summaryCacheKey, fallbackSummary, CACHE_TTL.SHORT);
  return fallbackSummary;
};

export const getNextScheduledDraw = () => {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const now = new Date();
  const todayName = days[now.getDay()];
  const schedule = DRAW_SCHEDULE[todayName];
  if (!schedule) return null;
  const times = Object.keys(schedule).sort((a, b) => {
      const [h1, m1] = a.split(':').map(Number);
      const [h2, m2] = b.split(':').map(Number);
      return (h1 * 60 + m1) - (h2 * 60 + m2);
  });
  const currentTimestamp = now.getTime();
  const nextTime = times.find(t => {
      const [h, m] = t.split(':').map(Number);
      const drawDate = new Date(now);
      drawDate.setHours(h, m, 0, 0);
      return drawDate.getTime() > currentTimestamp;
  });
  if (nextTime) {
      return { time: nextTime, name: schedule[nextTime], day: todayName };
  } else {
      const tomorrowIndex = (now.getDay() + 1) % 7;
      const tomorrowName = days[tomorrowIndex];
      const tomorrowSchedule = DRAW_SCHEDULE[tomorrowName];
      const tomorrowTimes = Object.keys(tomorrowSchedule).sort();
      const firstDraw = tomorrowTimes[0];
      return { time: firstDraw, name: tomorrowSchedule[firstDraw], day: tomorrowName };
  }
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
            console.log(`[Autopsy Locale] Execution forensics pour prédiction ${pred.id}`);
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
                console.log(`[Closed-Loop Auto-Feedback] Poids algorithmiques mis à jour de manière continue pour ${drawName}`);
              }
            } catch (closedLoopErr) {
              console.warn("[Closed-Loop Auto-Feedback] Auto-ajustement non critique :", closedLoopErr);
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
        console.log(`[ADN Audit] ${reconciledDnaCount} log(s) ADN réconcilié(s) avec le tirage ${resultToMatch.date}`);
      }
    } catch (dnaErr) {
      console.warn("[ADN Audit] Erreur lors de la réconciliation ADN:", dnaErr);
    }

    if (autopsiesRun > 0) {
       console.log(`[Autopsie] ${autopsiesRun} autopsie(s) effectuée(s).`);
    } else {
       console.log(`[Autopsie] Enregistrement d'un nouveau tirage sans autopsie.`);
    }
  } catch (e) {
    console.error("Local automation trigger failed:", e);
  }
};

export const bulkAddResults = async (drawName: string, results: { date: string, draw_num?: string, numbers?: string[], gagnants: number[], machine?: number[], draw_name?: string }[]) => {
  const mapped = results.map((r, i) => {
    const targetName = r.draw_name || normalizeDrawName(drawName);
    const withoutMachine = isDrawWithoutMachine(targetName);
    const normDate = normalizeDate(r.date);
    return {
      id: (r as any).id || `draw_import_${targetName.replace(/\s+/g, '_')}_${normDate}_${i}`,
      draw_name: targetName,
      date: normDate,
      gagnants: r.gagnants,
      machine: withoutMachine ? [] : (r.machine || []),
      version: 1
    };
  });

  if (!isSupabaseConfigured()) {
    const byDraw = new Map<string, typeof mapped>();
    for (const item of mapped) {
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
      const combined = [...newItems, ...existing].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      await globalCache.set(cacheKey, combined, CACHE_TTL.HISTORY, dName);
      await globalCache.registerNewDraw(dName, combined.length);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName: dName } }));
      }
    }
    return mapped;
  }

  const { data, error } = await supabase.from('draw_results').upsert(mapped, { onConflict: 'draw_name, date' }).select();
  if (error) throw error;
  
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
  const sanitizedMachine = withoutMachine ? [] : (result.machine || []);

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
    combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    await globalCache.set(cacheKey, combined, CACHE_TTL.HISTORY, targetName);
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

  const { data, error } = await supabase.from('draw_results').insert({
    draw_name: targetName,
    date: normalizedDateStr,
    gagnants: result.gagnants,
    machine: sanitizedMachine,
    version: 1
  }).select().single();
  if (error) throw error;
  
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
  const withoutMachine = isDrawWithoutMachine(drawName);
  const normalizedDateStr = normalizeDate(result.date);
  const sanitizedMachine = withoutMachine ? [] : (result.machine || []);

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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName } }));
      }
    }
    return;
  }

  const { data, error } = await supabase.from('draw_results').update({
    date: normalizedDateStr,
    gagnants: result.gagnants,
    machine: sanitizedMachine,
    version: result.version || 1
  }).eq('id', result.id).select().single();
  if (error) throw error;
  
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

  if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('DRAW_RESULTS_UPDATED', { detail: { drawName } }));
  }
};

export const purgeAllResults = async (drawName: string) => {
  if (!isSupabaseConfigured()) {
    const cacheKey = globalCache.generateKey('history', drawName);
    await globalCache.delete(cacheKey);
    await globalCache.registerNewDraw(drawName, 0);
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


