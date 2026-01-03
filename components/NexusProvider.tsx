
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  DrawResult, SpectralMetric, FractalMetric, AlgoWeights, 
  Prediction, SmartInsight, NumberRegularity, BrierCalibration,
  NexusContextType, OracleVocalContext
} from '../types';
import { lotteryService } from '../services/lotteryService';
import { 
    calculateVolatility, calculateRegularity, 
    detectGameRegime, calculateCorrelationMatrixAsync,
    calculateNetworkCentralityAsync, calculateSpectralMetricsAsync,
    calculateFractalMetricsAsync
} from '../services/mathService';
import { getAlgoWeights } from '../services/predictionEngine';
import { generateSmartInsights } from '../services/insightService';
import { audioEngine } from '../utils/audioEngine';
import { useToast } from './ui/Toast'; 
import { testDatabaseConnection, isSupabaseConfigured } from '../services/supabaseClient'; 

const NexusContext = createContext<NexusContextType | null>(null);

export const NexusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showToast } = useToast(); 
  
  // State
  const [drawName, setDrawNameState] = useState('Reveil');
  const [history, setHistory] = useState<DrawResult[]>([]);
  const [spectral, setSpectral] = useState<SpectralMetric[]>([]);
  const [fractal, setFractal] = useState<FractalMetric[]>([]);
  const [globalWeights, setGlobalWeights] = useState<AlgoWeights>(getAlgoWeights('Reveil'));
  const [lastPrediction, setLastPrediction] = useState<Prediction | null>(null);
  const [inspectingNumber, setInspectingNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [smartInsights, setSmartInsights] = useState<SmartInsight[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  
  // High-Level States
  const [correlationMatrix, setCorrelationMatrix] = useState<any>({});
  const [regularity, setRegularity] = useState<NumberRegularity[]>([]);
  const [cliques, setCliques] = useState<any[]>([]);
  const [vocalContext, setVocalContext] = useState<OracleVocalContext | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Vérification initiale de la connexion
  useEffect(() => {
      const checkConnection = async () => {
          if (!isSupabaseConfigured()) {
              console.log("Nexus en mode local (Pas de connexion Supabase)");
              return;
          }
          const status = await testDatabaseConnection();
          if (!status.success) {
              console.error("DB Connection Error:", status.error);
              if (!status.error.includes("Variables d'environnement")) {
                  showToast(`Erreur Base de Données: ${status.error}`, "error");
              }
          }
      };
      checkConnection();
  }, []);

  const loadData = useCallback(async () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    try {
        const hist = await lotteryService.fetchHistory(drawName);
        
        if (abortControllerRef.current.signal.aborted) return;

        setHistory(hist); 
        setGlobalWeights(getAlgoWeights(drawName));

        if (hist.length > 0) {
            if (drawName === 'ALL') {
                 setSpectral([]);
                 setFractal([]);
                 setRegularity([]);
                 setCorrelationMatrix({});
                 setCliques([]);
                 setSmartInsights([]);
            } else {
                const computeSample = hist.slice(0, 500);

                // UTILISATION DES ASYNC WRAPPERS POUR DÉCHARGER LE THREAD PRINCIPAL
                const [spec, frac, regData, corr, centrality] = await Promise.all([
                    calculateSpectralMetricsAsync(computeSample),
                    calculateFractalMetricsAsync(computeSample),
                    Promise.resolve(calculateRegularity(computeSample)),
                    calculateCorrelationMatrixAsync(computeSample),
                    calculateNetworkCentralityAsync(computeSample)
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
            }
        } else {
            setSpectral([]);
            setFractal([]);
            setRegularity([]);
            setSmartInsights([]);
        }

        setLastPrediction(null); 

    } catch (e: any) {
        if (e.name === 'AbortError') return;

        let errorMessage = "Erreur inconnue";
        if (typeof e === 'string') errorMessage = e;
        else if (e instanceof Error) errorMessage = e.message;
        else if (e && typeof e === 'object') errorMessage = e.message || "Erreur non sérialisable";
        
        console.error("Nexus Kernel Error:", errorMessage);
        
        if (errorMessage.includes('42P01')) {
             showToast("Table 'draw_results' introuvable.", "error");
        } else if (!errorMessage.includes('aborted')) {
             // Silence
        }
        setHistory([]); 
    } finally {
        if (!abortControllerRef.current?.signal.aborted) {
            setLoading(false);
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
    updateGlobalWeights: (w: AlgoWeights) => { audioEngine.play('success'); setGlobalWeights(w); },
    loading,
    refresh: () => refreshData(drawName, true),
    refreshData,
    correlationMatrix,
    regularity,
    calibration: { overallScore: 0.124, reliability: 82, bias: 'NEUTRAL', sampleSize: 30 },
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
