
import { DrawResult, ProjectionItem, TopFollowerAnalysis } from '../types';
import { DRAW_SCHEDULE } from '../constants';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getProjectionsAsync, getFollowersAnalysisAsync } from './mathService';
import { apiClient } from '../core/api/apiClient';
import { AppError, logError } from '../utils/AppError';

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

export const lotteryService = {
  async fetchHistory(drawName: string): Promise<DrawResult[]> {
    const cacheKey = `${CACHE_PREFIX}${drawName}`;
    let remoteData: DrawResult[] | null = null;
    let fetchError: any = null;

    if (isSupabaseConfigured() && navigator.onLine) {
        try {
            let query = supabase
              .from('draw_results')
              .select('*')
              .order('date', { ascending: false });

            if (drawName && drawName !== 'ALL') {
                query = query.eq('draw_name', normalizeDrawName(drawName));
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
                try { localStorage.setItem(cacheKey, JSON.stringify(remoteData)); } catch (e) {}
            }
        } catch (e) {
            logError(e, { source: 'lotteryService.fetchHistory' });
            fetchError = e;
        }
    }

    if (remoteData) return remoteData;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
    if (fetchError) throw new AppError("Impossible de récupérer l'historique. Vérifiez votre connexion.", "NETWORK_ERR", "high", { error: fetchError });
    return [];
  }
};

export const syncDrawExternal = async (drawName?: string): Promise<number> => {
  if (!isSupabaseConfigured()) return 0;
  try {
    const data = await apiClient.post<{ count: number }>('cron-sync', { drawName, manualTrigger: true });
    return data?.count || 0;
  } catch (e: any) {
    logError(new AppError(e?.message || 'Sync failed', 'SYNC_ERROR', 'medium', { drawName }), { source: 'syncDrawExternal' });
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
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : [];
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
    
    localStorage.setItem(cacheKey, JSON.stringify(stats));
    return stats;
  } catch (e) {
    const cached = localStorage.getItem(cacheKey);
    return cached ? JSON.parse(cached) : [];
  }
};

export const fetchGlobalStats = async () => {
  const cacheKey = 'nexus_global_stats';
  if (!isSupabaseConfigured() || !navigator.onLine) {
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : [];
  }
  try {
    const { data, error } = await supabase.from('draw_results').select('gagnants').limit(2000);
    if (error) throw error;
    const counts: Record<number, number> = {};
    (data || []).forEach(row => row.gagnants.forEach((n: number) => counts[n] = (counts[n] || 0) + 1));
    const stats = Object.entries(counts).map(([n, c]) => ({ number: Number(n), count: c })).sort((a, b) => b.count - a.count);
    localStorage.setItem(cacheKey, JSON.stringify(stats));
    return stats;
  } catch (e) {
    const cached = localStorage.getItem(cacheKey);
    return cached ? JSON.parse(cached) : [];
  }
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
      let autopsyCount = 0;
      for (const snap of pendingSnapshots) {
        // We need the result ID to trigger autopsy. If not provided, fetch it.
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
            await apiClient.post('forensic-autopsy', { 
                snapshotId: snap.id, 
                drawResultId: targetResultId 
            }).catch(e => console.error("Forensic autopsy trigger error:", e));
            autopsyCount++;
        }
      }

      if (autopsyCount > 0) {
        try {
            const { LearningService } = await import('./learningService');
            await LearningService.triggerAutoLearning(normalizeDrawName(drawName));
        } catch (e) {
            console.error("Self-learn trigger error:", e);
        }
      }
    }
  } catch (e) {
    console.error("Error triggering automation:", e);
  }
};

export const bulkAddResults = async (drawName: string, results: any[]) => {
  if (!isSupabaseConfigured()) throw new Error("Mode hors-ligne : Écriture impossible.");
  const mapped = results.map(r => ({
    draw_name: r.draw_name || normalizeDrawName(drawName),
    date: normalizeDate(r.date),
    gagnants: r.gagnants,
    machine: r.machine || [],
    version: 1
  }));
  const { data, error } = await supabase.from('draw_results').upsert(mapped, { onConflict: 'draw_name, date' }).select();
  if (error) throw error;
  
  // Trigger automation for all inserted/updated results
  if (data && data.length > 0) {
      for (const res of data) {
          await triggerAutomationForNewResults(res.draw_name, res.date, res.id);
      }
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


