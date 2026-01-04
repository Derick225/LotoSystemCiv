
import { DrawResult, ProjectionItem, TopFollowerAnalysis } from '../types';
import { DRAW_SCHEDULE } from '../constants';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getProjectionsAsync, getFollowersAnalysisAsync } from './mathService';

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

    // Tentative de récupération en ligne
    if (isSupabaseConfigured() && navigator.onLine) {
        try {
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
            
            if (data) {
                remoteData = data.map(row => ({
                  id: row.id,
                  drawName: row.draw_name,
                  date: formatDate(row.date),
                  gagnants: row.gagnants,
                  machine: row.machine || [],
                  version: row.version || 1
                }));
                
                // Mise à jour du cache local si succès
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(remoteData));
                } catch (storageErr) {
                    console.warn("Storage quota exceeded, cache update skipped.");
                }
            }
        } catch (e) {
            console.warn("Supabase fetch failed, falling back to cache.", e);
            fetchError = e;
        }
    }

    // Si on a des données fraîches, on les retourne
    if (remoteData) return remoteData;

    // Sinon, on tente le cache local (Mode Offline)
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        console.debug(`[Nexus Offline] Serving cached history for ${drawName}`);
        return JSON.parse(cached);
    }

    // Si tout échoue
    if (fetchError) throw fetchError;
    
    // Pas de config, pas de cache, pas d'erreur explicite (ex: premier lancement hors ligne sans config)
    return [];
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
  
  // Utilisation de fetchHistory pour profiter du cache au lieu de requêtes directes multiples
  // Note: C'est moins optimal que le select direct si le cache est froid, mais mieux pour le offline.
  // Pour le summary, on va quand même essayer de faire un appel optimisé si online.
  
  for (const [time, name] of Object.entries(draws)) {
      let lastDraw: DrawResult | null = null;
      
      try {
          if (isSupabaseConfigured() && navigator.onLine) {
              const { data } = await supabase
                .from('draw_results')
                .select('*')
                .ilike('draw_name', `%${name}%`)
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
              // Fallback cache via le service
              const history = await lotteryService.fetchHistory(name);
              if (history.length > 0) lastDraw = history[0];
          }
          
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
  // Utilisation d'un cache spécifique pour les stats globales lourdes
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
    const stats = Object.entries(counts)
      .map(([n, c]) => ({ number: Number(n), count: c }))
      .sort((a, b) => b.count - a.count);
      
    localStorage.setItem(cacheKey, JSON.stringify(stats));
    return stats;
  } catch (e: any) {
    console.warn("[Nexus Engine] Global stats failed, using cache.");
    const cached = localStorage.getItem(cacheKey);
    return cached ? JSON.parse(cached) : [];
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
    
    const targetDraws = ["Reveil", "Etoile", "Akwaba"];
    const demoData: any[] = [];
    
    targetDraws.forEach(drawName => {
        for (let i = 0; i < 5; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            
            const numbers = new Set<number>();
            while(numbers.size < 5) numbers.add(Math.floor(Math.random() * 90) + 1);
            
            const machine = new Set<number>();
            while(machine.size < 5) machine.add(Math.floor(Math.random() * 90) + 1);

            demoData.push({ 
                draw_name: drawName, 
                date: dateStr, 
                gagnants: Array.from(numbers), 
                machine: Array.from(machine) 
            });
        }
    });

    try {
        await supabase.from('draw_results').upsert(demoData, { onConflict: 'draw_name, date' });
        console.log("Demo data injected successfully");
    } catch (e) {
        console.error("Demo injection failed", e);
    }
};
