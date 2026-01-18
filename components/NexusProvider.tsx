
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  DrawResult, SpectralMetric, FractalMetric, AlgoWeights, 
  Prediction, SmartInsight, NumberRegularity, BrierCalibration,
  NexusContextType, OracleVocalContext, RLState, PositionalRegime
} from '../types';
import { lotteryService, checkAndSyncRecentResults, getNextScheduledDraw } from '../services/lotteryService';
import { 
    calculateVolatility, calculateRegularity, 
    detectGameRegime, calculateCorrelationMatrixAsync,
    calculateNetworkCentralityAsync, calculateSpectralMetricsAsync,
    calculateFractalMetricsAsync, calculatePositionalRegimes
} from '../services/mathService';
import { getAlgoWeightsSync, getAlgoWeights, generateMasterPrediction } from '../services/predictionEngine';
import { generateSmartInsights } from '../services/insightService';
import { getPredictionHistoryAsync, calculateHistoricalPerformance, savePredictionToHistory } from '../services/predictionHistoryService';
import { ReinforcementLearningService } from '../services/reinforcementLearningService';
import { LearningService } from '../services/learningService'; 
import { audioEngine } from '../utils/audioEngine';
import { useToast } from './ui/Toast'; 
import { testDatabaseConnection, isSupabaseConfigured } from '../services/supabaseClient'; 

const NexusContext = createContext<NexusContextType | null>(null);

export const NexusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showToast } = useToast(); 
  
  // State: Core Identification
  const [drawName, setDrawNameState] = useState(() => {
      const next = getNextScheduledDraw();
      return next ? next.name : 'Reveil';
  });

  // State: Data Layer
  const [history, setHistory] = useState<DrawResult[]>([]);
  const [loading, setLoading] = useState(false); 
  
  // State: Computed Metrics
  const [stats, setStats] = useState<{ number: number; count: number }[]>([]);
  const [gaps, setGaps] = useState<{ number: number; gap: number }[]>([]);
  const [volatility, setVolatility] = useState<{ score: number; status: string; trend: string } | null>(null);
  const [regime, setRegime] = useState<{ hurst: number; regime: string } | null>(null);
  const [regularity, setRegularity] = useState<NumberRegularity[]>([]);
  const [spectral, setSpectral] = useState<SpectralMetric[]>([]);
  const [fractal, setFractal] = useState<FractalMetric[]>([]);
  const [positionalRegimes, setPositionalRegimes] = useState<PositionalRegime[]>([]);
  const [correlationMatrix, setCorrelationMatrix] = useState<any>({});
  const [cliques, setCliques] = useState<any[]>([]);
  const [calibration, setCalibration] = useState<BrierCalibration | null>(null);
  const [smartInsights, setSmartInsights] = useState<SmartInsight[]>([]);

  // State: User Interactions & Configuration
  const [globalWeights, setGlobalWeights] = useState<AlgoWeights>(getAlgoWeightsSync(drawName));
  const [lastPrediction, setLastPrediction] = useState<Prediction | null>(null);
  const [rlState, setRlState] = useState<RLState | null>(null);

  const [inspectingNumber, setInspectingNumberState] = useState<number | null>(null);
  const [hoveredNumber, setHoveredNumberState] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  const [vocalContext, setVocalContext] = useState<OracleVocalContext | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Connection Check
  useEffect(() => {
      const checkConnection = async () => {
          if (!isSupabaseConfigured()) return;
          const status = await testDatabaseConnection();
          if (!status.success && !status.error.includes("Variables d'environnement")) {
              showToast(`Erreur Base de Données: ${status.error}`, "error");
          }
      };
      checkConnection();
  }, []);

  // --- REINFORCEMENT LEARNING LOOP (AUTO-CALIBRATION) ---
  useEffect(() => {
      const checkAndTrain = async () => {
          if (history.length < 2 || !lastPrediction || drawName === 'ALL') return;

          const lastDraw = history[0]; 
          const rlKey = `nexus_rl_${drawName}_${lastDraw.date}`;
          const alreadyLearned = localStorage.getItem(rlKey);

          if (!alreadyLearned) {
              try {
                  const { newWeights, state, log } = await ReinforcementLearningService.processDrawResult(
                      drawName,
                      lastDraw,
                      lastPrediction,
                      globalWeights
                  );
                  updateGlobalWeights(newWeights);
                  setRlState(state);
                  localStorage.setItem(rlKey, 'done');
                  showToast(`🧠 ${log}`, "success");
              } catch (e) {
                  console.error("RL Loop Error", e);
              }
          }
      };
      checkAndTrain();
  }, [history, lastPrediction, drawName, globalWeights]);


  // --- CORE DATA LOADING ---
  const loadData = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setSmartInsights([]);

    try {
        const hist = await lotteryService.fetchHistory(drawName);
        if (abortControllerRef.current.signal.aborted) return;

        if (hist.length === 0 && drawName !== 'ALL' && isSupabaseConfigured()) {
            await checkAndSyncRecentResults(drawName);
            const retriedHist = await lotteryService.fetchHistory(drawName);
            setHistory(retriedHist);
        } else {
            setHistory(hist); 
        }
        
        if (hist.length > 0) {
            const counts: Record<number, number> = {};
            hist.forEach(d => d.gagnants.forEach(n => counts[n] = (counts[n] || 0) + 1));
            setStats(Object.entries(counts)
              .map(([n, c]) => ({ number: Number(n), count: c }))
              .sort((a, b) => b.count - a.count));

            if (drawName !== 'ALL') {
                const resGaps: { number: number; gap: number }[] = [];
                for (let i = 1; i <= 90; i++) {
                    let gap = 0;
                    for (const draw of hist) {
                        if (draw.gagnants.includes(i)) break;
                        gap++;
                    }
                    resGaps.push({ number: i, gap });
                }
                setGaps(resGaps);
            }

            setVolatility(calculateVolatility(hist));
            const reg = detectGameRegime(hist);
            setRegime(reg ? { hurst: reg.hurst, regime: reg.regime } : null);
        }

        setLoading(false);

        getAlgoWeights(drawName).then(w => {
            if (!abortControllerRef.current?.signal.aborted) setGlobalWeights(w);
        });

        const savedRLState = localStorage.getItem(`rl_state_${drawName}`);
        if (savedRLState) setRlState(JSON.parse(savedRLState));

        const activeHistory = hist.length === 0 ? [] : hist; 

        if (activeHistory.length > 0 && drawName !== 'ALL') {
            const computeSample = activeHistory.slice(0, 300); 

            // NOUVEAU: Analyse positionnelle
            const posRegimes = calculatePositionalRegimes(computeSample);
            setPositionalRegimes(posRegimes);

            const [spec, frac, regData, corr, centrality, preds] = await Promise.all([
                calculateSpectralMetricsAsync(computeSample),
                calculateFractalMetricsAsync(computeSample),
                Promise.resolve(calculateRegularity(computeSample)),
                calculateCorrelationMatrixAsync(computeSample),
                calculateNetworkCentralityAsync(computeSample),
                getPredictionHistoryAsync(drawName)
            ]);
            
            if (abortControllerRef.current.signal.aborted) return;

            setSpectral(spec);
            setFractal(frac);
            setRegularity(regData);
            setCorrelationMatrix(corr);
            setCliques(centrality);

            const gapsData = regData.map(r => ({ number: r.number, gap: r.currentGap }));
            const insights = await generateSmartInsights(drawName, computeSample, spec, gapsData, regData);
            setSmartInsights(insights);

            if (preds.length > 0) {
                const latestPred = preds[0].prediction;
                setLastPrediction(latestPred);
                const perf = calculateHistoricalPerformance(preds, activeHistory);
                setCalibration({
                    overallScore: 0.25 - (perf.accuracy / 100),
                    reliability: Math.min(100, Math.round(perf.accuracy * 3.5)),
                    bias: perf.accuracy > 20 ? 'OPTIMIST' : 'NEUTRAL',
                    sampleSize: perf.analyzedDrawsCount
                });
            } else {
                const theoreticalVol = calculateVolatility(computeSample);
                const theoreticalReliability = Math.max(30, 95 - (theoreticalVol.score || 50));
                setCalibration({ 
                    overallScore: 0.5, 
                    reliability: theoreticalReliability, 
                    bias: 'NEUTRAL', 
                    sampleSize: activeHistory.length 
                });
            }
        } 

    } catch (e: any) {
        if (e.name === 'AbortError') return;
        console.error("Nexus Kernel Error:", e);
        setHistory([]); 
        setLoading(false);
    }
  }, [drawName, refreshTrigger, showToast]);

  useEffect(() => { 
    loadData();
    return () => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [loadData]);

  // --- ACTIONS ---

  const setDrawName = useCallback((name: string) => {
      audioEngine.play('click');
      setDrawNameState(name);
  }, []);

  const refreshData = useCallback(async (name: string, force?: boolean) => {
      audioEngine.play('scan');
      if (name !== drawName) {
          setDrawNameState(name);
      } else if (force) {
          setRefreshTrigger(prev => prev + 1);
      }
  }, [drawName]);

  const updateGlobalWeights = useCallback((w: AlgoWeights) => {
      setGlobalWeights(w); 
      import('../services/predictionEngine').then(mod => mod.saveAlgoWeights(drawName, w));
  }, [drawName]);

  const setInspectingNumber = useCallback((n: number | null) => {
      if(n) audioEngine.play('click');
      setInspectingNumberState(n);
  }, []);

  const setHoveredNumber = useCallback((n: number | null) => {
      setHoveredNumberState(n);
  }, []);

  const refresh = useCallback(() => refreshData(drawName, true), [drawName, refreshData]);

  const contextValue: NexusContextType = useMemo(() => ({
    drawName,
    setDrawName,
    currentDrawName: drawName,
    history,
    spectral,
    fractal,
    stats,
    gaps,
    volatility,
    regime,
    lastPrediction,
    setLastPrediction,
    inspectingNumber,
    setInspectingNumber,
    smartInsights,
    globalWeights,
    updateGlobalWeights,
    loading,
    refresh,
    refreshData,
    correlationMatrix,
    regularity,
    calibration,
    velocity: {}, 
    cliques,
    vocalContext,
    hoveredNumber,
    setHoveredNumber,
    rlState
  }), [
    drawName, history, spectral, fractal, stats, gaps, volatility, regime, 
    lastPrediction, inspectingNumber, smartInsights, globalWeights, 
    loading, correlationMatrix, regularity, calibration, cliques, 
    vocalContext, hoveredNumber, rlState
  ]);

  return (
    <NexusContext.Provider value={contextValue}>
      {children}
    </NexusContext.Provider>
  );
};

export const useNexus = () => {
  const ctx = useContext(NexusContext);
  if (!ctx) throw new Error("NexusProvider manquant.");
  return ctx;
};
