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
    calculateFractalMetricsAsync, calculatePositionalRegimes,
    calculateWaveletMetricsAsync
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
  const [drawName, setDrawNameState] = useState(() => {
      const next = getNextScheduledDraw();
      return next ? next.name : 'Reveil';
  });
  const [history, setHistory] = useState<DrawResult[]>([]);
  const [loading, setLoading] = useState(false); 
  const [stats, setStats] = useState<{ number: number; count: number }[]>([]);
  const [gaps, setGaps] = useState<{ number: number; gap: number }[]>([]);
  const [volatility, setVolatility] = useState<{ score: number; status: string; trend: string } | null>(null);
  const [regime, setRegime] = useState<{ hurst: number; regime: string } | null>(null);
  const [regularity, setRegularity] = useState<NumberRegularity[]>([]);
  const [spectral, setSpectral] = useState<SpectralMetric[]>([]);
  const [wavelet, setWavelet] = useState<{number: number, energy: number}[]>([]);
  const [fractal, setFractal] = useState<FractalMetric[]>([]);
  const [positionalRegimes, setPositionalRegimes] = useState<PositionalRegime[]>([]);
  const [correlationMatrix, setCorrelationMatrix] = useState<any>({});
  const [cliques, setCliques] = useState<any[]>([]);
  const [calibration, setCalibration] = useState<BrierCalibration | null>(null);
  const [smartInsights, setSmartInsights] = useState<SmartInsight[]>([]);
  const [globalWeights, setGlobalWeights] = useState<AlgoWeights>(getAlgoWeightsSync(drawName));
  const [lastPrediction, setLastPrediction] = useState<Prediction | null>(null);
  const [rlState, setRlState] = useState<RLState | null>(null);
  const [inspectingNumber, setInspectingNumberState] = useState<number | null>(null);
  const [hoveredNumber, setHoveredNumberState] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  const [vocalContext, setVocalContext] = useState<OracleVocalContext | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const checkAndTrain = async () => {
        if (history.length < 2 || !lastPrediction || drawName === 'ALL') return;
        const lastDraw = history[0]; 
        const rlKey = `nexus_rl_${drawName}_${lastDraw.date}`;
        if (!localStorage.getItem(rlKey)) {
            try {
                const { newWeights, state, log } = await ReinforcementLearningService.processDrawResult(
                    drawName, lastDraw, lastPrediction, globalWeights
                );
                updateGlobalWeights(newWeights);
                setRlState(state);
                localStorage.setItem(rlKey, 'done');
                showToast(`🧠 ${log}`, "success");
            } catch (e) { console.error("RL Loop Error", e); }
        }
    };
    checkAndTrain();
  }, [history, lastPrediction, drawName, globalWeights]);

  const loadData = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    setLoading(true);

    try {
        const hist = await lotteryService.fetchHistory(drawName);
        if (abortControllerRef.current.signal.aborted) return;
        setHistory(hist); 
        
        if (hist.length > 0) {
            const counts: Record<number, number> = {};
            hist.forEach(d => d.gagnants.forEach(n => counts[n] = (counts[n] || 0) + 1));
            setStats(Object.entries(counts).map(([n, c]) => ({ number: Number(n), count: c })).sort((a, b) => b.count - a.count));

            const resGaps: { number: number; gap: number }[] = [];
            for (let i = 1; i <= 90; i++) {
                let gap = 0;
                for (const draw of hist) { if (draw.gagnants.includes(i)) break; gap++; }
                resGaps.push({ number: i, gap });
            }
            setGaps(resGaps);
            setVolatility(calculateVolatility(hist));
            const reg = detectGameRegime(hist);
            setRegime(reg ? { hurst: reg.hurst, regime: reg.regime } : null);
        }

        if (hist.length > 0 && drawName !== 'ALL') {
            const computeSample = hist.slice(0, 300); 
            const [spec, wav, frac, regData, corr, centrality, preds] = await Promise.all([
                calculateSpectralMetricsAsync(computeSample),
                calculateWaveletMetricsAsync(computeSample),
                calculateFractalMetricsAsync(computeSample),
                Promise.resolve(calculateRegularity(computeSample)),
                calculateCorrelationMatrixAsync(computeSample),
                calculateNetworkCentralityAsync(computeSample),
                getPredictionHistoryAsync(drawName)
            ]);
            
            if (abortControllerRef.current.signal.aborted) return;
            setSpectral(spec);
            setWavelet(wav);
            setFractal(frac);
            setRegularity(regData);
            setCorrelationMatrix(corr);
            setCliques(centrality);

            const insights = await generateSmartInsights(drawName, computeSample, spec, regData.map(r => ({ number: r.number, gap: r.currentGap })), regData);
            setSmartInsights(insights);

            if (preds.length > 0) {
                const latestPred = preds[0].prediction;
                setLastPrediction(latestPred);
                const perf = calculateHistoricalPerformance(preds, hist);
                setCalibration({
                    overallScore: 0.25 - (perf.accuracy / 100),
                    reliability: Math.min(100, Math.round(perf.accuracy * 3.5)),
                    bias: 'NEUTRAL',
                    sampleSize: perf.analyzedDrawsCount
                });
            }
        } 
    } catch (e: any) { if (e.name !== 'AbortError') setLoading(false); }
    finally { setLoading(false); }
  }, [drawName, refreshTrigger]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateGlobalWeights = useCallback((w: AlgoWeights) => {
      setGlobalWeights(w); 
      import('../services/predictionEngine').then(mod => mod.saveAlgoWeights(drawName, w));
  }, [drawName]);

  const contextValue: any = useMemo(() => ({
    drawName, history, spectral, wavelet, fractal, stats, gaps, volatility, regime, 
    lastPrediction, inspectingNumber, smartInsights, globalWeights, loading,
    correlationMatrix, regularity, calibration, cliques, hoveredNumber, rlState,
    setDrawName: setDrawNameState,
    setLastPrediction, setInspectingNumber: setInspectingNumberState,
    updateGlobalWeights, setHoveredNumber: setHoveredNumberState,
    refresh: () => loadData(),
    refreshData: (name: string, force?: boolean) => { if(force) setRefreshTrigger(t => t+1); setDrawNameState(name); }
  }), [drawName, history, spectral, wavelet, fractal, stats, gaps, volatility, regime, lastPrediction, inspectingNumber, smartInsights, globalWeights, loading, correlationMatrix, regularity, calibration, cliques, hoveredNumber, rlState]);

  return <NexusContext.Provider value={contextValue}>{children}</NexusContext.Provider>;
};

export const useNexus = () => {
  const ctx = useContext(NexusContext);
  if (!ctx) throw new Error("NexusProvider manquant.");
  return ctx;
};