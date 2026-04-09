
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import type { DrawResult, SpectralMetric, FractalMetric, NumberRegularity } from '../types';
import { normalizeDate, fetchResults, fetchGlobalStats, fetchRecentStats, getDailySummary } from '../services/lotteryService';
import { 
    calculateSpectralMetricsAsync, 
    calculateWaveletMetricsAsync, 
    calculateFractalMetricsAsync, 
    calculateRegularity, 
    calculateCorrelationMatrixAsync, 
    calculateVolatility,
    detectGameRegime
} from '../services/mathService';
import { calculateSpatialMetrics } from '../services/spatialService';
import { calculateOrchestrationScores } from '../services/orchestrationService';
import { runDecisionForest } from '../services/decisionTreeService';
import { useEffect } from 'react';

export const lotteryKeys = {
  all: ['lottery'] as const,
  draw: (name: string) => [...lotteryKeys.all, 'draw', name] as const,
  stats: (name: string) => [...lotteryKeys.all, 'stats', name] as const,
  analytics: (name: string, historyHash: string) => [...lotteryKeys.all, 'analytics', name, historyHash] as const,
  globalMarket: () => [...lotteryKeys.all, 'global-market'] as const,
  dailySummary: (day: string) => [...lotteryKeys.all, 'daily-summary', day] as const,
  globalStats: () => [...lotteryKeys.all, 'global-stats-hot'] as const,
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

export const useDrawHistory = (drawName: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    
    const filter = drawName === 'ALL' ? undefined : `draw_name=eq.${drawName}`;

    const channel = supabase
      .channel('draw-sync')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'draw_results', filter }, 
        () => {
          queryClient.invalidateQueries({ queryKey: lotteryKeys.draw(drawName) });
          queryClient.invalidateQueries({ queryKey: lotteryKeys.all }); 
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [drawName, queryClient]);

  return useQuery({
    queryKey: lotteryKeys.draw(drawName),
    queryFn: () => fetchHistory(drawName),
    enabled: !!drawName,
    staleTime: 1000 * 60 * 5, 
  });
};

export const useDailySummary = (day: string) => {
    return useQuery({
        queryKey: lotteryKeys.dailySummary(day),
        queryFn: () => getDailySummary(day),
        staleTime: 1000 * 60 * 2, 
        refetchInterval: 1000 * 60 * 5, 
    });
};

export const useGlobalStats = () => {
    return useQuery({
        queryKey: lotteryKeys.globalStats(),
        // On demande spécifiquement les stats des 7 derniers jours pour "High-Heat 7d"
        queryFn: () => fetchRecentStats(7),
        staleTime: 1000 * 60 * 30, 
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
      queryClient.invalidateQueries({ queryKey: lotteryKeys.all });
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
      queryClient.invalidateQueries({ queryKey: lotteryKeys.all });
    }
  });
};

// --- NOUVEAU : HOOK ANALYTIQUE HPC ---
// Encapsule tous les calculs lourds dans un Worker Query
export const useNexusAnalytics = (drawName: string, history: DrawResult[] | undefined) => {
    const historyHash = history && history.length > 0 ? history[0].id : 'empty';

    return useQuery({
        queryKey: lotteryKeys.analytics(drawName, historyHash),
        queryFn: async () => {
            if (!history || history.length < 10) return null;

            // Calculs Mathématiques via Workers
            const [spec, wav, frac, regData, corr, forestRes] = await Promise.all([
                calculateSpectralMetricsAsync(history),
                calculateWaveletMetricsAsync(history),
                calculateFractalMetricsAsync(history),
                Promise.resolve(calculateRegularity(history)), // Synchrone mais rapide
                calculateCorrelationMatrixAsync(history),
                runDecisionForest(history)
            ]);

            // Calculs Contextuels
            const spatial = calculateSpatialMetrics(history);
            const orchScores = calculateOrchestrationScores(history);
            const vol = calculateVolatility(history);
            const reg = detectGameRegime(history);

            // Construction Symbiotique
            const forestVotesMap: Record<number, number> = {};
            forestRes.votes.forEach(v => forestVotesMap[v.candidate] = v.score);

            const symbioticContext = {
                spatialDeadZones: spatial.gridDensity.map((d, i) => d < (Math.max(...spatial.gridDensity) * 0.1) ? i : -1).filter(n => n !== -1),
                spatialHotZones: spatial.advancedClusters.filter(c => c.potential > 80).flatMap(c => c.numbers),
                orchestrationBoosts: {} as Record<number, number>,
                spectralVeto: spec.filter(s => s.energy < 10).map(s => s.number),
                temporalTarget: null,
                forestVotes: forestVotesMap
            };

            Object.entries(orchScores).forEach(([n, score]) => {
                if (score > 30) symbioticContext.orchestrationBoosts[parseInt(n)] = 1 + (score / 120);
            });

            return {
                spectral: spec,
                wavelet: wav,
                fractal: frac,
                regularity: regData,
                correlationMatrix: corr,
                symbioticContext,
                volatility: vol,
                regime: reg ? { hurst: reg.hurst, regime: reg.regime } : null,
                forestRes // Access to raw forest data if needed
            };
        },
        enabled: !!history && history.length >= 10,
        staleTime: 1000 * 60 * 30, // Ces calculs sont lourds et changent peu, on cache 30min
        gcTime: 1000 * 60 * 60, // Garder en mémoire 1h
    });
};
