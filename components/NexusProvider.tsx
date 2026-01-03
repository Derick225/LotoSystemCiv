
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  DrawResult, SpectralMetric, FractalMetric, AlgoWeights, 
  Prediction, SmartInsight, NumberRegularity, BrierCalibration,
  NexusContextType, OracleVocalContext
} from '../types';
import { lotteryService } from '../services/lotteryService';
import { 
    mathService, calculateVolatility, calculateRegularity, 
    detectGameRegime, calculateCorrelationMatrixAsync,
    calculateNetworkCentralityAsync
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
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Trigger pour forcer le reload
  
  // High-Level States
  const [correlationMatrix, setCorrelationMatrix] = useState<any>({});
  const [regularity, setRegularity] = useState<NumberRegularity[]>([]);
  const [cliques, setCliques] = useState<any[]>([]);
  const [vocalContext, setVocalContext] = useState<OracleVocalContext | null>(null);

  // Refs pour éviter les boucles dans les effects
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
    // Annulation de la requête précédente si elle existe
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    try {
        // Chargement Historique
        const hist = await lotteryService.fetchHistory(drawName);
        
        // Si le composant est démonté ou une nouvelle requête est partie, on arrête
        if (abortControllerRef.current.signal.aborted) return;

        setHistory(hist); 
        
        // Synchronisation ADN IA
        setGlobalWeights(getAlgoWeights(drawName));

        // Pipeline HPC Parallèle (Optimisé pour éviter Stack Overflow)
        if (hist.length > 0) {
            // OPTIMISATION CRITIQUE : Si mode 'ALL', on saute les calculs complexes
            if (drawName === 'ALL') {
                 setSpectral([]);
                 setFractal([]);
                 setRegularity([]);
                 setCorrelationMatrix({});
                 setCliques([]);
                 setSmartInsights([]);
            } else {
                // On limite l'échantillon pour les calculs lourds (Max 500 derniers tirages)
                // Cela garde l'interface fluide tout en ayant une précision suffisante
                const computeSample = hist.slice(0, 500);

                const [spec, frac, regData, corr, centrality] = await Promise.all([
                    Promise.resolve(mathService.calculateSpectral(computeSample)),
                    Promise.resolve(mathService.calculateFractal(computeSample)),
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

                // Analyse Cognitive (Insights)
                const gaps = regData.map(r => ({ number: r.number, gap: r.currentGap }));
                const insights = await generateSmartInsights(drawName, computeSample, spec, gaps, regData);
                setSmartInsights(insights);
            }
        } else {
            // Reset des états si pas de données
            setSpectral([]);
            setFractal([]);
            setRegularity([]);
            setSmartInsights([]);
        }

        setLastPrediction(null); // Reset prediction on draw change

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
             // Silencieux pour les erreurs mineures
        }
        setHistory([]); 
    } finally {
        if (!abortControllerRef.current?.signal.aborted) {
            setLoading(false);
        }
    }
  }, [drawName, refreshTrigger, showToast]);

  // Effet unique pour charger les données quand drawName ou le trigger change
  useEffect(() => { 
    loadData();
    return () => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [loadData]);

  // Actions Publiques
  const setDrawName = useCallback((name: string) => {
      audioEngine.play('click');
      setDrawNameState(name);
  }, []);

  const refreshData = useCallback(async (name: string, force?: boolean) => {
      audioEngine.play('scan');
      if (name !== drawName) {
          setDrawNameState(name); // Cela déclenchera loadData via useEffect
      } else if (force) {
          setRefreshTrigger(prev => prev + 1); // Cela déclenchera loadData via useEffect
      }
  }, [drawName]);

  // Memos
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
