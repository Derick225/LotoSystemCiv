
import { DrawResult, ProjectionItem, TopFollowerAnalysis } from '../types';
import { DRAW_SCHEDULE } from '../constants';
import { supabase } from './supabaseClient';

const isValidDate = (d: number, m: number, y: number): boolean => {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

export const formatDate = (dateStr: string, isIsoOutput: boolean = false): string => {
  if (!dateStr) return '';
  
  // Format ISO YYYY-MM-DD
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      if (!isValidDate(d, m, y)) return 'Invalid Date';
      if (isIsoOutput) return dateStr;
      return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }

  // Format FR DD/MM/YYYY
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const [d, m, y] = parts.map(Number);
        if (!isValidDate(d, m, y)) return 'Invalid Date';
        if (isIsoOutput) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        return dateStr;
    }
  }
  
  // Fallback Date Object
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

export const lotteryService = {
  /**
   * Récupère l'historique. 
   * NOTE: Ne catch pas les erreurs ici pour permettre au NexusProvider de détecter les pannes RLS/Réseau.
   */
  async fetchHistory(drawName: string): Promise<DrawResult[]> {
    const { data, error } = await supabase
      .from('draw_results')
      .select('*')
      .eq('draw_name', drawName)
      .order('date', { ascending: false });
    
    if (error) {
      console.error(`[Supabase Error] fetchHistory(${drawName}):`, error.message, error.details);
      throw error; // Propagation de l'erreur vers l'UI
    }
    
    return (data || []).map(row => ({
      id: row.id,
      drawName: row.draw_name,
      date: formatDate(row.date),
      gagnants: row.gagnants,
      machine: row.machine || [],
      version: row.version || 1
    }));
  }
};

/**
 * Déclenche la synchronisation cloud immédiate via Edge Function.
 */
export const syncDrawExternal = async (drawName?: string): Promise<number> => {
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

/**
 * Force le calcul des analyses spectrales/fractales sur le serveur.
 */
export const computeAnalytics = async (drawName: string): Promise<boolean> => {
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
  const results = await Promise.all(Object.entries(draws).map(async ([time, name]) => {
    try {
        const history = await lotteryService.fetchHistory(name);
        return { time, name, result: history[0] || null };
    } catch (e) {
        // Pour le sommaire, on tolère une erreur silencieuse (juste pas de résultat affiché)
        console.warn(`Summary fetch failed for ${name}`);
        return { time, name, result: null };
    }
  }));
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
  
  // Recherche précise incluant la date complète
  const nextTime = times.find(t => {
      const [h, m] = t.split(':').map(Number);
      const drawDate = new Date(now);
      drawDate.setHours(h, m, 0, 0);
      return drawDate.getTime() > currentTimestamp;
  });

  // Si aucun tirage restant aujourd'hui, prendre le premier de la liste (logique de boucle simplifiée pour l'affichage)
  const finalTime = nextTime || times[0];
  
  return { time: finalTime, name: schedule[finalTime] };
};

export const fetchGlobalStats = async () => {
  try {
    const { data, error } = await supabase.from('draw_results').select('gagnants').limit(1000);
    if (error) throw error;
    const counts: Record<number, number> = {};
    (data || []).forEach(row => row.gagnants.forEach((n: number) => counts[n] = (counts[n] || 0) + 1));
    return Object.entries(counts)
      .map(([n, c]) => ({ number: Number(n), count: c }))
      .sort((a, b) => b.count - a.count);
  } catch (e: any) {
    console.warn("[Nexus Engine] Global stats failed:", e?.message);
    return [];
  }
};

export const bulkAddResults = async (drawName: string, results: any[]) => {
  const mapped = results.map(r => ({
    draw_name: r.draw_name || drawName,
    date: normalizeDate(r.date),
    gagnants: r.gagnants,
    machine: r.machine || [],
    version: 1
  }));
  const { error } = await supabase.from('draw_results').upsert(mapped, { onConflict: 'draw_name, date' });
  if (error) throw error;
};

export const addResult = async (drawName: string, result: Omit<DrawResult, 'id'>) => {
  const { error } = await supabase.from('draw_results').insert({
    draw_name: drawName,
    date: normalizeDate(result.date),
    gagnants: result.gagnants,
    machine: result.machine || [],
    version: 1
  });
  if (error) throw error;
};

export const updateResult = async (drawName: string, result: DrawResult) => {
  const { error } = await supabase.from('draw_results').update({
    date: normalizeDate(result.date),
    gagnants: result.gagnants,
    machine: result.machine || [],
    version: result.version || 1
  }).eq('id', result.id);
  if (error) throw error;
};

export const deleteResult = async (drawName: string, id: string) => {
  const { error } = await supabase.from('draw_results').delete().eq('id', id);
  if (error) throw error;
};

export const fetchNextDrawProjections = async (drawName: string, lastNumbers: number[], history: DrawResult[]): Promise<ProjectionItem[]> => {
    if (!history || history.length < 2 || !lastNumbers || lastNumbers.length === 0) return [];
    
    const transitions: Record<number, Record<number, number>> = {};
    for (let i = 0; i < history.length - 1; i++) {
        const current = history[i].gagnants;
        const prev = history[i+1].gagnants;
        prev.forEach(p => {
            if (!transitions[p]) transitions[p] = {};
            current.forEach(c => {
                transitions[p][c] = (transitions[p][c] || 0) + 1;
            });
        });
    }

    const scores: Record<number, number> = {};
    lastNumbers.forEach(n => {
        const nextMap = transitions[n] || {};
        Object.entries(nextMap).forEach(([target, count]) => {
            const t = parseInt(target);
            scores[t] = (scores[t] || 0) + (count / history.length);
        });
    });

    return Object.entries(scores)
        .map(([num, prob]) => ({ number: parseInt(num), probability: Math.round(prob * 1000) }))
        .sort((a,b) => b.probability - a.probability)
        .slice(0, 10);
};

export const fetchTopFollowersAnalysis = async (drawName: string, history: DrawResult[]): Promise<TopFollowerAnalysis[]> => {
    if (!history || history.length < 5) return [];
    const { matrix, totals } = await calculateSuccessionMatrixAsync(history);
    
    return Object.entries(matrix).map(([leaderStr, followersMap]) => {
        const leader = parseInt(leaderStr);
        const total = totals[leader] || 1;
        const followers = Object.entries(followersMap)
            .map(([numStr, count]) => ({ 
                number: parseInt(numStr), 
                count: count as number, 
                probability: (count as number) / total 
            }))
            .sort((a,b) => b.count - a.count)
            .slice(0, 3);
            
        return { leader, followers };
    }).sort((a,b) => b.leader - a.leader).slice(0, 20);
};

export const fetchAssociatedNumbers = async (num: number, drawName: string, history: DrawResult[]) => {
    if (!history || history.length < 2) return { following: [] };
    
    const { matrix, totals } = await calculateSuccessionMatrixAsync(history);
    const followersMap = matrix[num] || {};
    const total = totals[num] || 1;
    
    return {
        following: Object.entries(followersMap)
            .map(([nStr, count]) => ({
                number: parseInt(nStr),
                count: count as number,
                probability: (count as number) / total
            }))
            .sort((a,b) => b.count - a.count)
            .slice(0, 5)
    };
};

const calculateSuccessionMatrixAsync = async (history: DrawResult[]) => {
    const matrix: Record<number, Record<number, number>> = {};
    const totals: Record<number, number> = {};
    
    if (!history || history.length < 2) return { matrix, totals };

    for (let i = 0; i < history.length - 1; i++) {
        const current = history[i].gagnants;
        const prev = history[i+1].gagnants;
        prev.forEach(p => {
            if (!matrix[p]) matrix[p] = {};
            totals[p] = (totals[p] || 0) + 1;
            current.forEach(c => {
                matrix[p][c] = (matrix[p][c] || 0) + 1;
            });
        });
    }
    return { matrix, totals };
};
