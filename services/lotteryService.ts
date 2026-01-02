
import { DrawResult, ProjectionItem, TopFollowerAnalysis } from '../types';
import { DRAW_SCHEDULE } from '../constants';
import { supabase, isSupabaseConfigured } from './supabaseClient';

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

// Normalisation du nom pour correspondre à la DB (Title Case)
const normalizeDrawName = (name: string): string => {
    return name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase().replace(/(\s[a-z])/g, (c) => c.toUpperCase());
};

export const lotteryService = {
  async fetchHistory(drawName: string): Promise<DrawResult[]> {
    // Évite les appels réseau inutiles si Supabase n'est pas configuré
    if (!isSupabaseConfigured()) {
        console.debug(`[Mode Hors-Ligne] Historique simulé pour ${drawName} (Pas de clés Supabase)`);
        return [];
    }

    try {
        // Utilisation de jokers (%) pour une recherche flexible (ex: "REVEIL" trouvera "TIRAGE REVEIL")
        const { data, error } = await supabase
          .from('draw_results')
          .select('*')
          .ilike('draw_name', `%${drawName}%`) 
          .order('date', { ascending: false });
        
        if (error) {
          console.error(`[Supabase Error] Fetch ${drawName}:`, error);
          throw error; 
        }
        
        if (!data || data.length === 0) {
             // Log discret pour le développement sans spammer la prod si c'est juste vide
             console.log(`[Supabase] Aucune donnée pour le filtre "%${drawName}%".`);
             return [];
        }
        
        return data.map(row => ({
          id: row.id,
          drawName: row.draw_name, // On garde le nom de la DB
          date: formatDate(row.date),
          gagnants: row.gagnants,
          machine: row.machine || [],
          version: row.version || 1
        }));
    } catch (e: any) {
        const msg = e.message || String(e);
        // Gestion silencieuse des erreurs de connexion courantes
        if (msg.includes('Failed to fetch') || msg.includes('Network request failed') || msg.includes('error parsing')) {
            console.warn(`[Supabase Offline] Récupération historique ${drawName} ignorée (Problème réseau).`);
        } else {
            console.error(`[Supabase Critical] fetchHistory(${drawName}):`, msg);
        }
        return [];
    }
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
          const history = await lotteryService.fetchHistory(name);
          results.push({ time, name, result: history[0] || null });
      } catch (e) {
          // Fail silent pour l'UI
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
