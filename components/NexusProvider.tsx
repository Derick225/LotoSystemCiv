
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  DrawResult, SpectralMetric, FractalMetric, AlgoWeights, 
  Prediction, SmartInsight, NumberRegularity, BrierCalibration,
  NexusContextType, OracleVocalContext, RLState
} from '../types';
import { lotteryService, checkAndSyncRecentResults, getNextScheduledDraw } from '../services/lotteryService';
import { 
    calculateVolatility, calculateRegularity, 
    detectGameRegime, calculateCorrelationMatrixAsync,
    calculateNetworkCentralityAsync, calculateSpectralMetricsAsync,
    calculateFractalMetricsAsync
} from '../services/mathService';
import { getAlgoWeightsSync, getAlgoWeights } from '../services/predictionEngine';
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
  
  // State: Computed Metrics (Moved from useMemo to State to prevent render-blocking)
  const [stats, setStats] = useState<{ number: number; count: number }[]>([]);
  const [gaps, setGaps] = useState<{ number: number; gap: number }[]>([]);
  const [volatility, setVolatility] = useState<{ score: number; status: string; trend: string } | null>(null);
  const [regime, setRegime] = useState<{ hurst: number; regime: string } | null>(null);
  const [regularity, setRegularity] = useState<NumberRegularity[]>([]);
  const [spectral, setSpectral] = useState<SpectralMetric[]>([]);
  const [fractal, setFractal] = useState<FractalMetric[]>([]);
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
      // Déclenche l'apprentissage si un nouveau résultat arrive et qu'on a une prédiction récente en mémoire
      // qui correspond au tirage précédent (donc le résultat est "nouveau" par rapport à la prédiction)
      
      const checkAndTrain = async () => {
          if (history.length < 2 || !lastPrediction || drawName === 'ALL') return;

          const lastDraw = history[0]; // Le tout dernier résultat
          
          // On vérifie si la dernière prédiction a été faite AVANT ce tirage
          // (Simple check: si la prédiction ne contient pas ce tirage dans son dataset, mais ici on simplifie)
          // On utilise une clé de stockage pour ne pas apprendre 2 fois le même tirage
          
          const rlKey = `nexus_rl_${drawName}_${lastDraw.date}`;
          const alreadyLearned = localStorage.getItem(rlKey);

          if (!alreadyLearned) {
              // Lancement du cycle RL
              try {
                  const { newWeights, state, log } = await ReinforcementLearningService.processDrawResult(
                      drawName,
                      lastDraw,
                      lastPrediction,
                      globalWeights
                  );
                  
                  // Mise à jour de l'ADN (Poids)
                  updateGlobalWeights(newWeights);
                  setRlState(state);
                  
                  // Marqueur pour ne pas répéter
                  localStorage.setItem(rlKey, 'done');
                  
                  // Feedback UI Discret
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
    
    // Reset light states immediately
    setSmartInsights([]);

    try {
        const hist = await lotteryService.fetchHistory(drawName);
        
        if (abortControllerRef.current.signal.aborted) return;

        if (hist.length === 0 && drawName !== 'ALL' && isSupabaseConfigured()) {
            await checkAndSyncRecentResults(drawName);
            const retriedHist = await lotteryService.fetchHistory(drawName);
            setHistory(retriedHist);
            if (retriedHist.length > 0) showToast(`Données restaurées pour ${drawName}`, "success");
        } else {
            setHistory(hist); 
        }
        
        // 1. Synchronous Light Calculations (Non-blocking enough)
        if (hist.length > 0) {
            // Stats
            const counts: Record<number, number> = {};
            hist.forEach(d => d.gagnants.forEach(n => counts[n] = (counts[n] || 0) + 1));
            setStats(Object.entries(counts)
              .map(([n, c]) => ({ number: Number(n), count: c }))
              .sort((a, b) => b.count - a.count));

            // Gaps
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

            // Volatility & Regime
            setVolatility(calculateVolatility(hist));
            const reg = detectGameRegime(hist);
            setRegime(reg ? { hurst: reg.hurst, regime: reg.regime } : null);
        }

        setLoading(false); // UI can show data now, heavy calcs continue

        // Chargement des poids persistants
        getAlgoWeights(drawName).then(w => {
            if (!abortControllerRef.current?.signal.aborted) setGlobalWeights(w);
        });

        // Chargement de l'état RL
        const savedRLState = localStorage.getItem(`rl_state_${drawName}`);
        if (savedRLState) setRlState(JSON.parse(savedRLState));

        const activeHistory = hist.length === 0 ? [] : hist; 

        if (activeHistory.length > 0 && drawName !== 'ALL') {
            const computeSample = activeHistory.slice(0, 300); 

            // 2. Heavy Async Calculations
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

            // Insights generation based on heavy metrics
            const gapsData = regData.map(r => ({ number: r.number, gap: r.currentGap }));
            const insights = await generateSmartInsights(drawName, computeSample, spec, gapsData, regData);
            setSmartInsights(insights);

            if (preds.length > 0) {
                // On récupère la dernière prédiction stockée pour le cycle RL
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
      // Pas de son ici pour ne pas spammer lors de l'auto-learn
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
