
import { DrawResult, ProjectionItem, TopFollowerAnalysis } from '../types';
import { DRAW_SCHEDULE } from '../constants';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getProjectionsAsync, getFollowersAnalysisAsync } from './mathService';
import { apiClient } from '../core/api/apiClient';
import { AppError, logError } from '../utils/AppError';
import { appConfig } from '../config/app.config';
import { auditLogger, InvalidInputError } from '../utils/auditLogger';

const CACHE_PREFIX = 'nexus_cache_history_';

// 1. Unified Date Parsing
export const parseAndNormalizeDate = (dateStr: string, isIsoOutput: boolean = false): string => {
    if (!dateStr) throw new InvalidInputError("Date string is required");
    
    let date: Date;
    
    // Check DD/MM/YYYY
    const frFormatMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (frFormatMatch) {
        const [_, d, m, y] = frFormatMatch;
        date = new Date(Number(y), Number(m) - 1, Number(d));
    } else {
        date = new Date(dateStr);
    }

    if (isNaN(date.getTime())) {
        throw new InvalidInputError(`Invalid date format: ${dateStr}`);
    }

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    return isIsoOutput ? `${y}-${m}-${d}` : `${d}/${m}/${y}`;
};

export const formatDate = (dateStr: string, isIsoOutput: boolean = false): string => {
    try {
        return parseAndNormalizeDate(dateStr, isIsoOutput);
    } catch {
        return dateStr;
    }
};

export const normalizeDate = (dateStr: string): string => {
    try {
        return parseAndNormalizeDate(dateStr, true);
    } catch {
        return new Date().toISOString().split('T')[0];
    }
};

const normalizeDrawName = (name: string): string => {
    return name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase().replace(/(\s[a-z])/g, (c) => c.toUpperCase());
};

// 2. Safe LocalStorage Cache
const safeCache = {
    get: <T>(key: string): T | null => {
        try {
            const isBrowser = typeof window !== 'undefined';
            if (!isBrowser) return null;
            const item = localStorage.getItem(key);
            if (!item) return null;
            const parsed = JSON.parse(item);
            if (parsed.expiry && Date.now() > parsed.expiry) {
                localStorage.removeItem(key);
                return null;
            }
            return parsed.data as T;
        } catch {
            return null;
        }
    },
    set: <T>(key: string, data: T) => {
        try {
            const isBrowser = typeof window !== 'undefined';
            if (!isBrowser) return;
            const payload = JSON.stringify({
                data,
                expiry: Date.now() + appConfig.cache.ttlMs
            });
            // Check size limit roughly
            if (payload.length > appConfig.cache.maxSizeBytes) {
                auditLogger('warn', 'safeCache', `Payload too large for key ${key}`);
                return;
            }
            localStorage.setItem(key, payload);
        } catch (e) {
            auditLogger('warn', 'safeCache', `Failed to set cache for key ${key}`);
        }
    }
};

// 4. Request Deduplication
const fetchPromises = new Map<string, Promise<DrawResult[]>>();

export const lotteryService = {
  async fetchHistory(drawName: string): Promise<DrawResult[]> {
    if (!drawName) throw new InvalidInputError("drawName is required");

    const cacheKey = `${CACHE_PREFIX}${drawName}`;
    
    if (fetchPromises.has(cacheKey)) {
        return fetchPromises.get(cacheKey)!;
    }

    const fetchPromise = (async () => {
        let remoteData: DrawResult[] | null = null;
        let fetchError: unknown = null;

        if (isSupabaseConfigured() && navigator.onLine) {
            try {
                let query = supabase
                  .from('draw_results')
                  .select('*')
                  .order('date', { ascending: false });

                if (drawName !== 'ALL') {
                    query = query.eq('draw_name', drawName);
                }
                
                query = query.limit(2000);
                
                const { data, error } = await query;
                
                if (error) throw new AppError(error.message, 'SUPABASE_FETCH_ERROR', 'high', { drawName, error });
                
                if (data) {
                    remoteData = data.map(row => ({
                      id: row.id,
                      drawName: row.draw_name,
                      date: formatDate(row.date),
                      gagnants: row.gagnants,
                      machine: row.machine || [],
                      version: row.version || 1
                    }));
                    safeCache.set(cacheKey, remoteData);
                }
            } catch (e) {
                logError(e as Error, { source: 'lotteryService.fetchHistory' });
                fetchError = e;
            }
        }

        if (remoteData) return remoteData;
        const cached = safeCache.get<DrawResult[]>(cacheKey);
        if (cached) return cached;
        if (fetchError) throw new AppError("Impossible de récupérer l'historique. Vérifiez votre connexion.", "NETWORK_ERR", "high", { error: fetchError });
        return [];
    })();

    fetchPromises.set(cacheKey, fetchPromise);
    try {
        const result = await fetchPromise;
        return result;
    } finally {
        fetchPromises.delete(cacheKey);
    }
  }
};

export const syncDrawExternal = async (drawName?: string): Promise<number> => {
  if (!isSupabaseConfigured()) return 0;
  try {
    const data = await apiClient.post<{ count: number }>('cron-sync', { drawName, manualTrigger: true });
    return data?.count || 0;
  } catch (e: unknown) {
    const err = e as Error;
    logError(new AppError(err?.message || 'Sync failed', 'SYNC_ERROR', 'medium', { drawName }), { source: 'syncDrawExternal' });
    return 0;
  }
};

export const checkAndSyncRecentResults = syncDrawExternal;

export const computeAnalytics = async (drawName: string): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;
  try {
    await apiClient.post('compute-nexus-analytics', { drawName });
    return true;
  } catch (e) {
    return false;
  }
};

export const fetchResults = async (drawName: string): Promise<{ data: DrawResult[] }> => {
  const data = await lotteryService.fetchHistory(drawName);
  return { data };
};

export const getDailySummary = async (day: string) => {
  const draws = DRAW_SCHEDULE[day] || {};
  const sortedTimes = Object.keys(draws).sort(); 
  
  const results = [];
  
  for (const time of sortedTimes) {
      const name = draws[time];
      let lastDraw: DrawResult | null = null;
      try {
          if (isSupabaseConfigured() && navigator.onLine) {
              const { data } = await supabase
                .from('draw_results')
                .select('*')
                .eq('draw_name', name)
                .order('date', { ascending: false })
                .limit(1);
              if (data && data[0]) {
                  lastDraw = {
                      id: data[0].id,
                      drawName: data[0].draw_name,
                      date: formatDate(data[0].date),
                      gagnants: data[0].gagnants,
                      machine: data[0].machine || [],
                      version: data[0].version || 1
                  };
              }
          } else {
              const history = await lotteryService.fetchHistory(name);
              if (history.length > 0) lastDraw = history[0];
          }
          results.push({ time, name, result: lastDraw });
      } catch (e) { results.push({ time, name, result: null }); }
  }
  return results;
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

export const fetchRecentStats = async (days: number = 7) => {
  const cacheKey = `nexus_recent_stats_${days}d`;
  if (!isSupabaseConfigured() || !navigator.onLine) {
      const cached = safeCache.get<any[]>(cacheKey);
      return cached || [];
  }
  try {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);
    const dateStr = dateLimit.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('draw_results')
      .select('gagnants')
      .gte('date', dateStr);

    if (error) throw error;
    
    const counts: Record<number, number> = {};
    (data || []).forEach(row => row.gagnants.forEach((n: number) => counts[n] = (counts[n] || 0) + 1));
    
    if (Object.keys(counts).length === 0) {
         return fetchGlobalStats();
    }

    const stats = Object.entries(counts)
      .map(([n, c]) => ({ number: Number(n), count: c }))
      .sort((a, b) => b.count - a.count);
    
    safeCache.set(cacheKey, stats);
    return stats;
  } catch (e) {
    const cached = safeCache.get<any[]>(cacheKey);
    return cached || [];
  }
};

export const fetchGlobalStats = async () => {
  const cacheKey = 'nexus_global_stats';
  if (!isSupabaseConfigured() || !navigator.onLine) {
      const cached = safeCache.get<any[]>(cacheKey);
      return cached || [];
  }
  try {
    const { data, error } = await supabase.from('draw_results').select('gagnants').limit(2000);
    if (error) throw error;
    const counts: Record<number, number> = {};
    (data || []).forEach(row => row.gagnants.forEach((n: number) => counts[n] = (counts[n] || 0) + 1));
    const stats = Object.entries(counts).map(([n, c]) => ({ number: Number(n), count: c })).sort((a, b) => b.count - a.count);
    safeCache.set(cacheKey, stats);
    return stats;
  } catch (e) {
    const cached = safeCache.get<any[]>(cacheKey);
    return cached || [];
  }
};

// 3. Concurrency with Semaphore
const runWithSemaphore = async <T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> => {
    const results: PromiseSettledResult<T>[] = [];
    const executing = new Set<Promise<void>>();

    for (const task of tasks) {
        const p = task().then(
            value => { results.push({ status: 'fulfilled', value }); },
            reason => { results.push({ status: 'rejected', reason }); }
        );
        
        const e: Promise<void> = p.finally(() => { executing.delete(e); });
        executing.add(e);

        if (executing.size >= limit) {
            await Promise.race(executing);
        }
    }

    await Promise.all(executing);
    return results;
};

export const triggerAutomationForNewResults = async (drawName: string, date: string, resultId?: string) => {
  if (!isSupabaseConfigured()) return;
  try {
    const { data: pendingSnapshots } = await supabase
      .from('prediction_snapshots')
      .select('id')
      .eq('draw_name', normalizeDrawName(drawName))
      .eq('status', 'PENDING');

    if (pendingSnapshots && pendingSnapshots.length > 0) {
      let targetResultId = resultId;
      if (!targetResultId) {
          const { data: resultData } = await supabase
              .from('draw_results')
              .select('id')
              .eq('draw_name', normalizeDrawName(drawName))
              .eq('date', normalizeDate(date))
              .single();
          if (resultData) targetResultId = resultData.id;
      }

      if (targetResultId) {
          const tasks = pendingSnapshots.map(snap => async () => {
              await fetch('/api/forensic-autopsy', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ snapshotId: snap.id, drawResultId: targetResultId })
              });
          });

          await runWithSemaphore(tasks, appConfig.concurrency.semaphoreLimit);

          try {
              const { LearningService } = await import('./learningService');
              await LearningService.triggerAutoLearning(normalizeDrawName(drawName));
          } catch (e) {
              auditLogger('error', 'triggerAutomationForNewResults', e);
          }
      }
    }
  } catch (e) {
    auditLogger('error', 'triggerAutomationForNewResults', e);
  }
};

export interface RawDrawResult {
    draw_name?: string;
    date: string;
    gagnants: number[];
    machine?: number[];
}

export const bulkAddResults = async (drawName: string, results: RawDrawResult[]) => {
  if (!isSupabaseConfigured()) throw new Error("Mode hors-ligne : Écriture impossible.");
  
  // Basic validation
  if (!Array.isArray(results)) throw new InvalidInputError("Results must be an array");

  const mapped = results.map(r => ({
    draw_name: r.draw_name || normalizeDrawName(drawName),
    date: normalizeDate(r.date),
    gagnants: r.gagnants,
    machine: r.machine || [],
    version: 1
  }));
  
  const { data, error } = await supabase.from('draw_results').upsert(mapped, { onConflict: 'draw_name, date' }).select();
  if (error) throw error;
  
  if (data && data.length > 0) {
      const tasks = data.map(res => async () => {
          await triggerAutomationForNewResults(res.draw_name, res.date, res.id);
      });
      await runWithSemaphore(tasks, appConfig.concurrency.semaphoreLimit);
  }
};

export const addResult = async (drawName: string, result: Omit<DrawResult, 'id'>) => {
  if (!isSupabaseConfigured()) throw new Error("Mode hors-ligne : Écriture impossible.");
  const { data, error } = await supabase.from('draw_results').insert({
    draw_name: normalizeDrawName(drawName),
    date: normalizeDate(result.date),
    gagnants: result.gagnants,
    machine: result.machine || [],
    version: 1
  }).select().single();
  if (error) throw error;
  
  if (data) {
      await triggerAutomationForNewResults(data.draw_name, data.date, data.id);
  }
};

export const updateResult = async (drawName: string, result: DrawResult) => {
  if (!isSupabaseConfigured()) throw new Error("Mode hors-ligne : Écriture impossible.");
  const { data, error } = await supabase.from('draw_results').update({
    date: normalizeDate(result.date),
    gagnants: result.gagnants,
    machine: result.machine || [],
    version: result.version || 1
  }).eq('id', result.id).select().single();
  if (error) throw error;
  
  if (data) {
      await triggerAutomationForNewResults(data.draw_name, data.date, data.id);
  }
};

export const deleteResult = async (drawName: string, id: string) => {
  if (!isSupabaseConfigured()) throw new Error("Mode hors-ligne : Suppression impossible.");
  const { error } = await supabase.from('draw_results').delete().eq('id', id);
  if (error) throw error;
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

export const injectDemoData = async () => {
    if (!isSupabaseConfigured()) return;
    const targetDraws = ["Reveil", "Etoile", "Akwaba", "Monday Special"];
    const demoData: any[] = [];
    targetDraws.forEach(drawName => {
        for (let i = 0; i < 5; i++) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const numbers = new Set<number>();
            while(numbers.size < 5) numbers.add(Math.floor(Math.random() * 90) + 1);
            const machine = new Set<number>();
            while(machine.size < 5) machine.add(Math.floor(Math.random() * 90) + 1);
            demoData.push({ draw_name: drawName, date: dateStr, gagnants: Array.from(numbers), machine: Array.from(machine) });
        }
    });
    try { await supabase.from('draw_results').upsert(demoData, { onConflict: 'draw_name, date' }); } catch (e: unknown) { logError(new AppError((e as Error).message || "Demo injection failed", "DEMO_INJECTION_ERROR", "low", { error: e }), { source: 'injectDemoData' }); }
};

