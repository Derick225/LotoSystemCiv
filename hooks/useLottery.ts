
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import type { DrawResult } from '../types';
import { normalizeDate, fetchResults, fetchRecentStats, getDailySummary } from '../services/lotteryService';
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
  globalStats: (drawName: string = 'global') => [...lotteryKeys.all, 'global-stats-hot', drawName] as const,
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
    
    const normalizedDrawName = drawName === 'ALL' ? 'ALL' : drawName.trim().charAt(0).toUpperCase() + drawName.trim().slice(1).toLowerCase().replace(/(\s[a-z])/g, (c) => c.toUpperCase());
    const filter = normalizedDrawName === 'ALL' ? undefined : `draw_name=eq.${normalizedDrawName}`;
    const channelId = `draw-sync-${drawName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'draw_results', filter }, 
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
    staleTime: 0, // Always consider history stale to fetch latest if needed
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

export const useGlobalStats = (drawName?: string) => {
    return useQuery({
        queryKey: lotteryKeys.globalStats(drawName),
        // On demande spécifiquement les stats des 7 derniers jours pour "High-Heat 7d"
        queryFn: () => fetchRecentStats(7, drawName),
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

            // Statistical calculation for gridDensity
            const densities = spatial.gridDensity.slice(1);
            const numPoints = densities.length;
            const meanDensity = densities.reduce((a, b) => a + b, 0) / (numPoints || 1);
            const varDensity = densities.reduce((acc, d) => acc + Math.pow(d - meanDensity, 2), 0) / (numPoints || 1);
            const stdDensity = Math.sqrt(varDensity);

            // Statistical calculation for spec energy
            const spectralEnergies = spec.map(s => s.energy || 0);
            const meanEnergy = spectralEnergies.reduce((a, b) => a + b, 0) / (spectralEnergies.length || 1);
            const varEnergy = spectralEnergies.reduce((acc, e) => acc + Math.pow(e - meanEnergy, 2), 0) / (spectralEnergies.length || 1);
            const stdEnergy = Math.sqrt(varEnergy);

            // Statistical calculation for cluster potentials
            const potentials = spatial.advancedClusters.map(c => c.potential || 0);
            const meanPotential = potentials.length > 0 ? potentials.reduce((a, b) => a + b, 0) / potentials.length : 50;
            const varPotential = potentials.length > 0 ? potentials.reduce((acc, p) => acc + Math.pow(p - meanPotential, 2), 0) / potentials.length : 100;
            const stdPotential = Math.sqrt(varPotential);

            // Dynamic thresholds instead of hardcoded numbers:
            // DeadZones are those under 1.5 standard deviations from the mean
            const deadZoneThreshold = Math.max(0, meanDensity - 1.5 * stdDensity);
            
            // HotZones are those cluster potentials inside the top distribution (mean + 1.0 * stdPotential)
            const hotZoneThreshold = Math.max(50, meanPotential + 1.0 * stdPotential);
            
            // Spectral veto is anything under 1.5 standard deviations of average spectral heat
            const spectralVetoThreshold = Math.max(0.5, meanEnergy - 1.5 * stdEnergy);

            // Orchestration Boost values - soft continuous activation mapping
            // Instead of linear mapping for score > 30 and fixed 120 denominator,
            // we calculate the mean of active orchestration scores to normalize the boosts.
            const rawOrchScores = Object.values(orchScores).map(Number);
            const meanOrch = rawOrchScores.length > 0 ? rawOrchScores.reduce((a, b) => a + b, 0) / rawOrchScores.length : 15;
            const varOrch = rawOrchScores.length > 0 ? rawOrchScores.reduce((acc, s) => acc + Math.pow(s - meanOrch, 2), 0) / rawOrchScores.length : 100;
            const stdOrch = Math.sqrt(varOrch);
            
            const symbioticContext = {
                spatialDeadZones: spatial.gridDensity.map((d, i) => (i > 0 && d < deadZoneThreshold) ? i : -1).filter(n => n !== -1),
                spatialHotZones: spatial.advancedClusters.filter(c => c.potential > hotZoneThreshold).flatMap(c => c.numbers),
                orchestrationBoosts: {} as Record<number, number>,
                spectralVeto: spec.filter(s => s.energy < spectralVetoThreshold).map(s => s.number),
                temporalTarget: null,
                forestVotes: forestVotesMap
            };

            Object.entries(orchScores).forEach(([n, score]) => {
                // Continuous soft threshold using a sigmoid function instead of binary constraint
                // We use (score - mean) / std dev to measure statistical significance.
                const zScore = stdOrch > 0 ? (score - meanOrch) / stdOrch : 0;
                // If score is significantly higher than average (zScore > 1.0), we apply the boost dynamically and continuously.
                const activation = 1 / (1 + Math.exp(-2.0 * (zScore - 1.0)));
                if (activation > 0.01) {
                    symbioticContext.orchestrationBoosts[parseInt(n)] = 1 + (score / (3 * meanOrch + 1e-9)) * activation;
                }
            });

            return {
                spectral: spec,
                wavelet: wav,
                fractal: frac,
                regularity: regData,
                correlationMatrix: corr,
                symbioticContext,
                volatility: vol,
                regime: reg || null,
                forestRes // Access to raw forest data if needed
            };
        },
        enabled: !!history && history.length >= 10,
        staleTime: 1000 * 60 * 30, // Ces calculs sont lourds et changent peu, on cache 30min
        gcTime: 1000 * 60 * 60, // Garder en mémoire 1h
    });
};
