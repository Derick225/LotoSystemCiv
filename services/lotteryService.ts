
import { DrawResult, ProjectionItem, TopFollowerAnalysis } from '../types';
import { DRAW_SCHEDULE } from '../constants';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getProjectionsAsync, getFollowersAnalysisAsync } from './mathService';

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
    if (!isSupabaseConfigured()) {
        console.debug(`[Mode Hors-Ligne] Historique simulé pour ${drawName} (Pas de clés Supabase)`);
        return [];
    }

    let query = supabase
      .from('draw_results')
      .select('*')
      .order('date', { ascending: false });

    if (drawName && drawName !== 'ALL') {
        query = query.ilike('draw_name', `%${drawName}%`);
    }
    
    query = query.limit(2000);
    
    const { data, error } = await query;
    if (error) throw error;
    
    if (!data || data.length === 0) return [];
    
    return data.map(row => ({
      id: row.id,
      drawName: row.draw_name,
      date: formatDate(row.date),
      gagnants: row.gagnants,
      machine: row.machine || [],
      version: row.version || 1
    }));
  }
};

export const syncDrawExternal = async (drawName?: string): Promise<number> => {
  if (!isSupabaseConfigured()) return 0;
  try {
    const { data, error } = await supabase.functions.invoke('cron-sync', { 
      body: { drawName, manualTrigger: true } 
    });
    if (error) throw error;
    return data?.count || 0;
  } catch (e: any) {
    console.warn("Cloud Sync Failover:", e?.message);
    return 0;
  }
};

export const checkAndSyncRecentResults = syncDrawExternal;

export const computeAnalytics = async (drawName: string): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.functions.invoke('compute-nexus-analytics', {
      body: { drawName }
    });
    return !error;
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
  const results = [];
  for (const [time, name] of Object.entries(draws)) {
      try {
          const { data } = await supabase
            .from('draw_results')
            .select('*')
            .ilike('draw_name', `%${name}%`)
            .order('date', { ascending: false })
            .limit(1);
            
          const lastDraw = data && data[0] ? {
              id: data[0].id,
              drawName: data[0].draw_name,
              date: formatDate(data[0].date),
              gagnants: data[0].gagnants,
              machine: data[0].machine || [],
              version: data[0].version || 1
          } : null;

          results.push({ time, name, result: lastDraw });
      } catch (e) {
          results.push({ time, name, result: null });
      }
  }
  return results;
};

export const getNextScheduledDraw = () => {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const now = new Date();
  const today = days[now.getDay()];
  const schedule = DRAW_SCHEDULE[today];
  if (!schedule) return null;
  
  const times = Object.keys(schedule).sort();
  const currentTimestamp = now.getTime();
  
  const nextTime = times.find(t => {
      const [h, m] = t.split(':').map(Number);
      const drawDate = new Date(now);
      drawDate.setHours(h, m, 0, 0);
      return drawDate.getTime() > currentTimestamp;
  });

  const finalTime = nextTime || times[0];
  return { time: finalTime, name: schedule[finalTime] };
};

export const fetchGlobalStats = async () => {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase.from('draw_results').select('gagnants').limit(1000);
    if (error) throw error;
    const counts: Record<number, number> = {};
    (data || []).forEach(row => row.gagnants.forEach((n: number) => counts[n] = (counts[n] || 0) + 1));
    return Object.entries(counts)
      .map(([n, c]) => ({ number: Number(n), count: c }))
      .sort((a, b) => b.count - a.count);
  } catch (e: any) {
    console.warn("[Nexus Engine] Global stats failed (Mode offline).");
    return [];
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
  const { error } = await supabase.from('draw_results').upsert(mapped, { onConflict: 'draw_name, date' });
  if (error) throw error;
};

export const addResult = async (drawName: string, result: Omit<DrawResult, 'id'>) => {
  if (!isSupabaseConfigured()) throw new Error("Mode hors-ligne : Écriture impossible.");
  const { error } = await supabase.from('draw_results').insert({
    draw_name: normalizeDrawName(drawName),
    date: normalizeDate(result.date),
    gagnants: result.gagnants,
    machine: result.machine || [],
    version: 1
  });
  if (error) throw error;
};

export const updateResult = async (drawName: string, result: DrawResult) => {
  if (!isSupabaseConfigured()) throw new Error("Mode hors-ligne : Écriture impossible.");
  const { error } = await supabase.from('draw_results').update({
    date: normalizeDate(result.date),
    gagnants: result.gagnants,
    machine: result.machine || [],
    version: result.version || 1
  }).eq('id', result.id);
  if (error) throw error;
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
    
    const sorted = Object.entries(followers)
        .map(([n, c]) => ({ number: Number(n), count: c }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
        
    return { following: sorted };
};

export const injectDemoData = async () => {
    if (!isSupabaseConfigured()) return;
    
    const demoData = [
        { draw_name: "Reveil", date: "2024-03-10", gagnants: [5, 12, 45, 67, 88], machine: [1, 2, 3, 4, 5] },
        { draw_name: "Reveil", date: "2024-03-09", gagnants: [1, 15, 30, 48, 70], machine: [10, 20, 30, 40, 50] },
        { draw_name: "Reveil", date: "2024-03-08", gagnants: [10, 25, 33, 55, 89], machine: [11, 22, 33, 44, 55] },
        { draw_name: "Reveil", date: "2024-03-07", gagnants: [3, 19, 41, 60, 75], machine: [6, 7, 8, 9, 10] },
        { draw_name: "Reveil", date: "2024-03-06", gagnants: [8, 14, 28, 52, 63], machine: [60, 70, 80, 85, 90] },
    ];

    try {
        await supabase.from('draw_results').insert(demoData);
        console.log("Demo data injected successfully");
    } catch (e) {
        console.error("Demo injection failed", e);
    }
};
