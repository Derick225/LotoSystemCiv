
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  DrawResult, SpectralMetric, FractalMetric, AlgoWeights, 
  Prediction, SmartInsight, NumberRegularity, BrierCalibration,
  NexusContextType, OracleVocalContext
} from '../types';
import { lotteryService, checkAndSyncRecentResults } from '../services/lotteryService';
import { 
    calculateVolatility, calculateRegularity, 
    detectGameRegime, calculateCorrelationMatrixAsync,
    calculateNetworkCentralityAsync, calculateSpectralMetricsAsync,
    calculateFractalMetricsAsync
} from '../services/mathService';
import { getAlgoWeightsSync, getAlgoWeights } from '../services/predictionEngine';
import { generateSmartInsights } from '../services/insightService';
import { getPredictionHistoryAsync, calculateHistoricalPerformance } from '../services/predictionHistoryService';
import { audioEngine } from '../utils/audioEngine';
import { useToast } from './ui/Toast'; 
import { testDatabaseConnection, isSupabaseConfigured } from '../services/supabaseClient'; 

const NexusContext = createContext<NexusContextType | null>(null);

export const NexusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showToast } = useToast(); 
  
  // Core State
  const [drawName, setDrawNameState] = useState('Reveil');
  const [history, setHistory] = useState<DrawResult[]>([]);
  
  // Computed State (Lazy)
  const [spectral, setSpectral] = useState<SpectralMetric[]>([]);
  const [fractal, setFractal] = useState<FractalMetric[]>([]);
  const [globalWeights, setGlobalWeights] = useState<AlgoWeights>(getAlgoWeightsSync('Reveil'));
  const [lastPrediction, setLastPrediction] = useState<Prediction | null>(null);
  const [inspectingNumber, setInspectingNumber] = useState<number | null>(null);
  
  // Status Flags
  const [loading, setLoading] = useState(false); // Loading history
  const [computing, setComputing] = useState(false); // Loading math
  
  const [smartInsights, setSmartInsights] = useState<SmartInsight[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  
  // High-Level States
  const [correlationMatrix, setCorrelationMatrix] = useState<any>({});
  const [regularity, setRegularity] = useState<NumberRegularity[]>([]);
  const [cliques, setCliques] = useState<any[]>([]);
  const [vocalContext, setVocalContext] = useState<OracleVocalContext | null>(null);
  const [calibration, setCalibration] = useState<BrierCalibration | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Vérification initiale de la connexion
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

  const loadData = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setComputing(true); // On indique que des calculs vont suivre

    try {
        // 1. Chargement Historique (Prioritaire)
        const hist = await lotteryService.fetchHistory(drawName);
        
        if (abortControllerRef.current.signal.aborted) return;

        // Auto-Repair Check
        if (hist.length === 0 && drawName !== 'ALL' && isSupabaseConfigured()) {
            await checkAndSyncRecentResults(drawName);
            const retriedHist = await lotteryService.fetchHistory(drawName);
            setHistory(retriedHist);
            if (retriedHist.length > 0) showToast(`Données restaurées pour ${drawName}`, "success");
        } else {
            setHistory(hist); 
        }
        
        // Fin du chargement critique (UI débloquée)
        setLoading(false);

        // 2. Chargement Poids (Async)
        getAlgoWeights(drawName).then(w => {
            if (!abortControllerRef.current?.signal.aborted) setGlobalWeights(w);
        });

        // 3. Calculs HPC (Non-bloquants, en arrière plan)
        const activeHistory = hist.length === 0 ? [] : hist; 

        if (activeHistory.length > 0 && drawName !== 'ALL') {
            const computeSample = activeHistory.slice(0, 500);

            // On lance les calculs en parallèle
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

            const gaps = regData.map(r => ({ number: r.number, gap: r.currentGap }));
            const insights = await generateSmartInsights(drawName, computeSample, spec, gaps, regData);
            setSmartInsights(insights);

            if (preds.length > 5) {
                const perf = calculateHistoricalPerformance(preds, activeHistory);
                setCalibration({
                    overallScore: 0.25 - (perf.accuracy / 100),
                    reliability: Math.min(100, Math.round(perf.accuracy * 3.5)),
                    bias: perf.accuracy > 20 ? 'OPTIMIST' : 'NEUTRAL',
                    sampleSize: perf.analyzedDrawsCount
                });
            } else {
                setCalibration({ overallScore: 0.33, reliability: 50, bias: 'NEUTRAL', sampleSize: 0 });
            }
        } else {
            // Reset metrics if no data
            setSpectral([]); setFractal([]); setRegularity([]); setSmartInsights([]); setCalibration(null);
        }

        setLastPrediction(null); 

    } catch (e: any) {
        if (e.name === 'AbortError') return;
        console.error("Nexus Kernel Error:", e);
        setHistory([]); 
    } finally {
        if (!abortControllerRef.current?.signal.aborted) {
            setLoading(false);
            setComputing(false);
        }
    }
  }, [drawName, refreshTrigger, showToast]);

  useEffect(() => { 
    loadData();
    return () => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [loadData]);

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

  const stats = useMemo(() => {
    const counts: Record<number, number> = {};
    history.forEach(d => d.gagnants.forEach(n => counts[n] = (counts[n] || 0) + 1));
    return Object.entries(counts)
      .map(([n, c]) => ({ number: Number(n), count: c }))
      .sort((a, b) => b.count - a.count);
  }, [history]);

  const gaps = useMemo(() => {
    if (drawName === 'ALL') return [];
    const res: { number: number; gap: number }[] = [];
    for (let i = 1; i <= 90; i++) {
      let gap = 0;
      for (const draw of history) {
        if (draw.gagnants.includes(i)) break;
        gap++;
      }
      res.push({ number: i, gap });
    }
    return res;
  }, [history, drawName]);

  const volatility = useMemo(() => history.length > 0 ? calculateVolatility(history) : null, [history]);
  const regime = useMemo(() => history.length > 0 ? detectGameRegime(history) : null, [history]);

  const contextValue: NexusContextType = {
    drawName,
    setDrawName,
    currentDrawName: drawName,
    history,
    spectral,
    fractal,
    stats,
    gaps,
    volatility,
    regime: regime ? { hurst: regime.hurst, regime: regime.regime } : null,
    lastPrediction,
    setLastPrediction,
    inspectingNumber,
    setInspectingNumber: (n) => { if(n) audioEngine.play('click'); setInspectingNumber(n); },
    smartInsights,
    globalWeights,
    updateGlobalWeights: (w: AlgoWeights) => { audioEngine.play('success'); setGlobalWeights(w); saveAlgoWeights(drawName, w); },
    loading, // Is data loading?
    refresh: () => refreshData(drawName, true),
    refreshData,
    correlationMatrix,
    regularity,
    calibration,
    velocity: {}, 
    cliques,
    vocalContext
  };

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

// Circular dependency fix helper
import { saveAlgoWeights } from '../services/predictionEngine';
