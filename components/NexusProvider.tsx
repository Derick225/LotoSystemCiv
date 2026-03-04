
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { 
  NexusContextType, DrawResult, Prediction, SmartInsight, 
  AlgoWeights, RLState, OracleVocalContext, RiskProfile
} from '../types';
import { getNextScheduledDraw } from '../services/lotteryService';
import { getAlgoWeights, saveAlgoWeights, generateMasterPrediction } from '../services/predictionEngine';
import { generateSmartInsights } from '../services/insightService';
import { getPredictionHistoryAsync, calculateHistoricalPerformance } from '../services/predictionHistoryService';
import { getSettings, saveSettings } from '../services/userPreferencesService';
import { useDrawHistory, useNexusAnalytics } from '../hooks/useLottery';

const NexusContext = createContext<NexusContextType | null>(null);

export const NexusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // --- ÉTAT UI & CONFIG ---
  const [drawName, setDrawNameState] = useState(() => {
      const next = getNextScheduledDraw();
      return next ? next.name : 'Reveil';
  });
  const [globalWeights, setGlobalWeights] = useState<AlgoWeights>(() => ({}) as any);
  const [lastPrediction, setLastPrediction] = useState<Prediction | null>(null);
  const [inspectingNumber, setInspectingNumber] = useState<number | null>(null);
  const [hoveredNumber, setHoveredNumber] = useState<number | null>(null);
  const [smartInsights, setSmartInsights] = useState<SmartInsight[]>([]);
  const [calibration, setCalibration] = useState<any>(null);
  
  // États persistants
  const [riskProfile, setRiskProfileState] = useState<RiskProfile>(() => {
      return getSettings().riskProfile as RiskProfile || 'BALANCED';
  });
  const [rlState, setRlState] = useState<RLState | null>(null);
  const [vocalContext, setVocalContext] = useState<OracleVocalContext | null>(null);
  const [isGodMode, setIsGodMode] = useState(false);

  // --- DATA FETCHING VIA REACT QUERY ---
  const { 
      data: history = [], 
      isLoading: historyLoading,
      refetch: refetchHistory 
  } = useDrawHistory(drawName);

  const {
      data: analytics,
      isLoading: analyticsLoading
  } = useNexusAnalytics(drawName, history);

  const loading = historyLoading || analyticsLoading;

  // --- EFFETS SECONDAIRES & CALCULS LÉGERS (Memoized) ---

  // 1. Initialisation Configuration (Weights & RL)
  useEffect(() => {
      let mounted = true;
      const initConfig = async () => {
          const weights = await getAlgoWeights(drawName);
          if(mounted) setGlobalWeights(weights);
          
          try {
              const rawRL = localStorage.getItem(`rl_state_${drawName}`);
              if (rawRL && mounted) setRlState(JSON.parse(rawRL));
          } catch {}
          
          // Check for persisted God Mode
          const god = localStorage.getItem('nexus_god_mode');
          if (god === 'true' && mounted) setIsGodMode(true);
      };
      initConfig();
      return () => { mounted = false; };
  }, [drawName]);

  const toggleGodMode = useCallback(() => {
      setIsGodMode(prev => {
          const next = !prev;
          localStorage.setItem('nexus_god_mode', String(next));
          if (next) console.log("%c GOD MODE ACTIVATED ", "background: #000; color: #f00; font-size: 20px; font-weight: bold;");
          return next;
      });
  }, []);

  // 2. Calcul des Stats basiques (Rapide, synchrone)
  const { stats, gaps } = useMemo(() => {
      if (!history || history.length === 0) return { stats: [], gaps: [] };
      
      const counts: Record<number, number> = {};
      history.forEach(d => d.gagnants.forEach(n => counts[n] = (counts[n] || 0) + 1));
      const computedStats = Object.entries(counts).map(([n, c]) => ({ number: Number(n), count: c })).sort((a, b) => b.count - a.count);

      const computedGaps: { number: number; gap: number }[] = [];
      for (let i = 1; i <= 90; i++) {
          let gap = 0;
          for (const draw of history) { if (draw.gagnants.includes(i)) break; gap++; }
          computedGaps.push({ number: i, gap });
      }
      return { stats: computedStats, gaps: computedGaps };
  }, [history]);

  // 3. Génération Prédiction & Insights (Dépendant des Analytics)
  useEffect(() => {
      if (!analytics || !history || history.length < 10) return;

      let mounted = true;
      const runEngine = async () => {
          try {
              // Génération de la prédiction Master
              const prediction = await generateMasterPrediction(
                  drawName, 
                  history, 
                  globalWeights, 
                  {
                      spectral: analytics.spectral, 
                      wavelet: analytics.wavelet, 
                      correlationMatrix: analytics.correlationMatrix, 
                      regularity: analytics.regularity
                  }, 
                  analytics.symbioticContext || undefined
              );
              if (mounted) setLastPrediction(prediction);

              // Insights
              const insights = await generateSmartInsights(
                  drawName, 
                  history, 
                  analytics.spectral, 
                  analytics.regularity.map(r => ({ number: r.number, gap: r.currentGap })), 
                  analytics.regularity
              );
              if (mounted) setSmartInsights(insights);

              // Calibration (Backtesting historique des prédictions)
              const preds = await getPredictionHistoryAsync(drawName);
              if (preds.length > 0 && mounted) {
                  const perf = calculateHistoricalPerformance(preds, history);
                  setCalibration({
                      overallScore: 0.25,
                      reliability: Math.min(100, Math.round(perf.accuracy * 5.0)),
                      bias: 'NEUTRAL',
                      sampleSize: perf.analyzedDrawsCount
                  });
              }
          } catch (e) {
              console.error("Engine Error", e);
          }
      };

      runEngine();
      return () => { mounted = false; };
  }, [drawName, history, analytics, globalWeights]);

  // --- ACTIONS ---

  const updateGlobalWeights = useCallback(async (w: AlgoWeights) => {
      setGlobalWeights(w); 
      await saveAlgoWeights(drawName, w);
      // Invalider ou refetch si nécessaire, mais ici le state local suffit pour la réactivité
  }, [drawName]);

  const refreshData = async (name: string, force?: boolean) => {
      setDrawNameState(name);
      if (force) {
          await refetchHistory();
      }
  };

  const setRiskProfile = useCallback(async (p: RiskProfile) => {
      setRiskProfileState(p);
      const currentSettings = getSettings();
      await saveSettings({ ...currentSettings, riskProfile: p });
  }, []);

  // --- CONTEXT VALUE ---
  const contextValue = useMemo<NexusContextType>(() => ({
    drawName,
    currentDrawName: drawName,
    history,
    stats,
    gaps,
    // Données provenant du Hook Analytique
    spectral: analytics?.spectral || [],
    wavelet: analytics?.wavelet || [],
    fractal: analytics?.fractal || [],
    volatility: analytics?.volatility || null,
    regime: analytics?.regime || null,
    correlationMatrix: analytics?.correlationMatrix || {},
    regularity: analytics?.regularity || [],
    symbioticContext: analytics?.symbioticContext || null,
    
    lastPrediction,
    inspectingNumber,
    smartInsights,
    globalWeights,
    loading,
    calibration,
    hoveredNumber,
    rlState,
    vocalContext,
    riskProfile,
    
    setDrawName: setDrawNameState,
    setLastPrediction,
    setInspectingNumber,
    setHoveredNumber,
    setRiskProfile,
    updateGlobalWeights,
    refresh: async () => { await refetchHistory(); },
    refreshData,
    isGodMode,
    toggleGodMode
  }), [
    drawName, history, stats, gaps, analytics, 
    lastPrediction, inspectingNumber, smartInsights, globalWeights, loading, calibration, hoveredNumber, rlState, vocalContext, riskProfile, isGodMode
  ]);

  return <NexusContext.Provider value={contextValue}>{children}</NexusContext.Provider>;
};

export const useNexus = () => {
  const ctx = useContext(NexusContext);
  if (!ctx) throw new Error("NexusProvider manquant.");
  return ctx;
};
