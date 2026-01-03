import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import type { DrawResult } from '../types';
import { normalizeDate, fetchResults } from '../services/lotteryService';
import { useEffect } from 'react';

export const lotteryKeys = {
  all: ['lottery'] as const,
  draw: (name: string) => [...lotteryKeys.all, 'draw', name] as const,
  stats: (name: string) => [...lotteryKeys.all, 'stats', name] as const,
  analytics: (name: string) => [...lotteryKeys.all, 'analytics', name] as const,
  globalMarket: () => [...lotteryKeys.all, 'global-market'] as const,
};

const getDrawTimestamp = (dateStr: string): number => {
    if (!dateStr) return 0;
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
        }
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 0 : d.getTime();
};

const sortDrawsDesc = (a: DrawResult, b: DrawResult) => {
    const timeA = getDrawTimestamp(a.date);
    const timeB = getDrawTimestamp(b.date);
    return timeB - timeA;
};

const fetchHistory = async (drawName: string): Promise<DrawResult[]> => {
  if (!drawName) return [];
  const { data } = await fetchResults(drawName);
  return data.sort(sortDrawsDesc);
};

const fetchGlobalMarketHistory = async (): Promise<DrawResult[]> => {
    if (!isSupabaseConfigured()) return [];
    
    try {
        const { data, error } = await supabase
            .from('draw_results')
            .select('*')
            .order('date', { ascending: false })
            .limit(500);

        if (error) throw new Error(error.message);

        const mapped = (data || []).map(row => ({
            id: row.id,
            date: normalizeDate(row.date),
            gagnants: row.gagnants,
            machine: row.machine || [],
            version: row.version || 1,
            drawName: row.draw_name
        }));

        return mapped.sort(sortDrawsDesc);
    } catch (e) {
        console.warn("Global market history fetch failed (Offline/Error):", e);
        return [];
    }
};

export const useDrawHistory = (drawName: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    
    // Si 'ALL', on écoute tous les inserts (filtre undefined), sinon on filtre par draw_name
    const filter = drawName === 'ALL' ? undefined : `draw_name=eq.${drawName}`;

    // Écoute Realtime des nouveaux résultats
    const channel = supabase
      .channel('draw-sync')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'draw_results', filter }, 
        () => {
          queryClient.invalidateQueries({ queryKey: lotteryKeys.draw(drawName) });
          queryClient.invalidateQueries({ queryKey: lotteryKeys.globalMarket() });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [drawName, queryClient]);

  return useQuery({
    queryKey: lotteryKeys.draw(drawName),
    queryFn: () => fetchHistory(drawName),
    enabled: !!drawName,
    staleTime: 1000 * 60,
  });
};

export const useGlobalMarketHistory = () => {
    return useQuery({
        queryKey: lotteryKeys.globalMarket(),
        queryFn: fetchGlobalMarketHistory,
        staleTime: 1000 * 60 * 5,
    });
};

export const useDrawMutation = (drawName: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newResult: Omit<DrawResult, 'id'>) => {
      if (!isSupabaseConfigured()) throw new Error("Mode hors-ligne : Écriture impossible.");
      
      const { data, error } = await supabase
        .from('draw_results')
        .upsert({
          draw_name: drawName,
          date: normalizeDate(newResult.date),
          gagnants: newResult.gagnants,
          machine: newResult.machine,
          version: newResult.version || 1
        }, { onConflict: 'draw_name, date' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lotteryKeys.draw(drawName) });
      queryClient.invalidateQueries({ queryKey: lotteryKeys.globalMarket() });
    },
  });
};

export const useDeleteDrawMutation = (drawName: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!isSupabaseConfigured()) throw new Error("Mode hors-ligne : Suppression impossible.");
      const { error } = await supabase.from('draw_results').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lotteryKeys.draw(drawName) });
      queryClient.invalidateQueries({ queryKey: lotteryKeys.globalMarket() });
    }
  });
};