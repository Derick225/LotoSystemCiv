
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  DrawResult, SpectralMetric, FractalMetric, AlgoWeights, 
  Prediction, SmartInsight, NumberRegularity, BrierCalibration,
  NexusContextType, RLState, SymbioticContext, OracleVocalContext
} from '../types';
import { lotteryService, getNextScheduledDraw } from '../services/lotteryService';
import { 
    calculateVolatility, calculateRegularity, 
    detectGameRegime, calculateCorrelationMatrixAsync,
    calculateSpectralMetricsAsync,
    calculateFractalMetricsAsync, calculateWaveletMetricsAsync
} from '../services/mathService';
import { calculateSpatialMetrics } from '../services/spatialService';
import { calculateOrchestrationScores } from '../services/orchestrationService';
import { runDecisionForest } from '../services/decisionTreeService';
import { getAlgoWeights, saveAlgoWeights, generateMasterPrediction } from '../services/predictionEngine';
import { generateSmartInsights } from '../services/insightService';
import { getPredictionHistoryAsync, calculateHistoricalPerformance } from '../services/predictionHistoryService';

const NexusContext = createContext<NexusContextType | null>(null);

export const NexusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
  const [correlationMatrix, setCorrelationMatrix] = useState<any>({});
  const [calibration, setCalibration] = useState<BrierCalibration | null>(null);
  const [smartInsights, setSmartInsights] = useState<SmartInsight[]>([]);
  const [globalWeights, setGlobalWeights] = useState<AlgoWeights>(() => ({}) as any);
  const [lastPrediction, setLastPrediction] = useState<Prediction | null>(null);
  const [inspectingNumber, setInspectingNumberState] = useState<number | null>(null);
  const [hoveredNumber, setHoveredNumberState] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  const [symbioticContext, setSymbioticContext] = useState<SymbioticContext | null>(null);
  const [rlState, setRlState] = useState<RLState | null>(null);
  const [vocalContext, setVocalContext] = useState<OracleVocalContext | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    setLoading(true);

    try {
        const weights = await getAlgoWeights(drawName);
        setGlobalWeights(weights);

        // Load RL State from local storage for UI context
        try {
            const rawRL = localStorage.getItem(`rl_state_${drawName}`);
            if (rawRL) setRlState(JSON.parse(rawRL));
            else setRlState(null);
        } catch {}

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

        if (hist.length >= 10 && drawName !== 'ALL') {
            // CALCULS HPC PARALLÈLES
            const [spec, wav, frac, regData, corr, forestRes, preds] = await Promise.all([
                calculateSpectralMetricsAsync(hist),
                calculateWaveletMetricsAsync(hist),
                calculateFractalMetricsAsync(hist),
                Promise.resolve(calculateRegularity(hist)),
                calculateCorrelationMatrixAsync(hist),
                runDecisionForest(hist), // Intégration Decision Forest
                getPredictionHistoryAsync(drawName)
            ]);
            
            if (abortControllerRef.current.signal.aborted) return;
            setSpectral(spec);
            setWavelet(wav);
            setFractal(frac);
            setRegularity(regData);
            setCorrelationMatrix(corr);

            // CONSTRUCTION DU CONTEXTE SYMBIOTIQUE
            const spatial = calculateSpatialMetrics(hist);
            const orchScores = calculateOrchestrationScores(hist);
            
            const forestVotesMap: Record<number, number> = {};
            forestRes.votes.forEach(v => forestVotesMap[v.candidate] = v.score);

            const symbioticCtx: SymbioticContext = {
                spatialDeadZones: spatial.gridDensity.map((d, i) => d < (Math.max(...spatial.gridDensity) * 0.1) ? i : -1).filter(n => n !== -1),
                spatialHotZones: spatial.advancedClusters.filter(c => c.potential > 80).flatMap(c => c.numbers),
                orchestrationBoosts: {},
                spectralVeto: spec.filter(s => s.energy < 10).map(s => s.number),
                temporalTarget: null,
                forestVotes: forestVotesMap
            };

            Object.entries(orchScores).forEach(([n, score]) => {
                if (score > 30) symbioticCtx.orchestrationBoosts[parseInt(n)] = 1 + (score / 120);
            });
            
            setSymbioticContext(symbioticCtx);

            // PRÉDICTION MAÎTRE SYMBIOTIQUE
            const prediction = await generateMasterPrediction(drawName, hist, weights, {
                spectral: spec, wavelet: wav, correlationMatrix: corr, regularity: regData
            }, symbioticCtx);

            setLastPrediction(prediction);

            const insights = await generateSmartInsights(drawName, hist, spec, regData.map(r => ({ number: r.number, gap: r.currentGap })), regData);
            setSmartInsights(insights);

            if (preds.length > 0) {
                const perf = calculateHistoricalPerformance(preds, hist);
                setCalibration({
                    overallScore: 0.25,
                    reliability: Math.min(100, Math.round(perf.accuracy * 5.0)),
                    bias: 'NEUTRAL',
                    sampleSize: perf.analyzedDrawsCount
                });
            }
        } 
    } catch (e: any) { if (e.name !== 'AbortError') console.error("Nexus Load Error:", e); }
    finally { setLoading(false); }
  }, [drawName, refreshTrigger]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateGlobalWeights = useCallback(async (w: AlgoWeights) => {
      setGlobalWeights(w); 
      await saveAlgoWeights(drawName, w);
      setRefreshTrigger(t => t + 1);
  }, [drawName]);

  const contextValue = useMemo(() => ({
    drawName, currentDrawName: drawName, history, spectral, wavelet, fractal, stats, gaps, volatility, regime, 
    lastPrediction, inspectingNumber, smartInsights, globalWeights, loading,
    correlationMatrix, regularity, calibration, hoveredNumber, symbioticContext,
    rlState, vocalContext,
    setDrawName: setDrawNameState,
    setLastPrediction, setInspectingNumber: setInspectingNumberState,
    updateGlobalWeights, setHoveredNumber: setHoveredNumberState,
    refresh: () => loadData(),
    refreshData: async (name: string, force?: boolean) => { if(force) setRefreshTrigger(t => t+1); setDrawNameState(name); }
  }), [
    drawName, history, spectral, wavelet, fractal, stats, gaps, volatility, regime, 
    lastPrediction, inspectingNumber, smartInsights, globalWeights, loading, 
    correlationMatrix, regularity, calibration, hoveredNumber, loadData, updateGlobalWeights, symbioticContext,
    rlState, vocalContext
  ]);

  return <NexusContext.Provider value={contextValue}>{children}</NexusContext.Provider>;
};

export const useNexus = () => {
  const ctx = useContext(NexusContext);
  if (!ctx) throw new Error("NexusProvider manquant.");
  return ctx;
};
