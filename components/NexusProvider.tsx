
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
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
import { useToast } from './ui/Toast'; // Import du Toast
import { testDatabaseConnection, isSupabaseConfigured } from '../services/supabaseClient'; // Import du test

const NexusContext = createContext<NexusContextType | null>(null);

export const NexusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showToast } = useToast(); // Hook pour les notifications
  const [drawName, setDrawName] = useState('Reveil');
  const [history, setHistory] = useState<DrawResult[]>([]);
  const [spectral, setSpectral] = useState<SpectralMetric[]>([]);
  const [fractal, setFractal] = useState<FractalMetric[]>([]);
  const [globalWeights, setGlobalWeights] = useState<AlgoWeights>(getAlgoWeights('Reveil'));
  const [lastPrediction, setLastPrediction] = useState<Prediction | null>(null);
  const [inspectingNumber, setInspectingNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [smartInsights, setSmartInsights] = useState<SmartInsight[]>([]);
  
  // High-Level States
  const [correlationMatrix, setCorrelationMatrix] = useState<any>({});
  const [regularity, setRegularity] = useState<NumberRegularity[]>([]);
  const [cliques, setCliques] = useState<any[]>([]);
  const [vocalContext, setVocalContext] = useState<OracleVocalContext | null>(null);

  // Vérification initiale de la connexion
  useEffect(() => {
      const checkConnection = async () => {
          if (!isSupabaseConfigured()) {
              showToast("⚠️ Config Supabase manquante !", "error");
              return;
          }
          const status = await testDatabaseConnection();
          if (!status.success) {
              console.error("DB Connection Error:", status.error);
              showToast(`Erreur Base de Données: ${status.error}`, "error");
          }
      };
      checkConnection();
  }, []);

  const loadData = useCallback(async (targetDraw: string = drawName, forceSync: boolean = false) => {
    setLoading(true);
    try {
        const hist = await lotteryService.fetchHistory(targetDraw);
        
        if (hist.length === 0) {
            // Pas d'erreur, mais pas de données : peut être normal (nouveau jeu) ou RLS bloquant
            console.warn(`[Nexus] Aucun résultat trouvé pour ${targetDraw}. Vérifiez RLS si des données existent.`);
        }

        setHistory(hist);
        
        // Synchronisation ADN IA
        setGlobalWeights(getAlgoWeights(targetDraw));

        // Pipeline HPC Parallèle (Web Worker simulation for main thread safety)
        const [spec, frac, regData, corr, centrality] = await Promise.all([
            Promise.resolve(mathService.calculateSpectral(hist)),
            Promise.resolve(mathService.calculateFractal(hist)),
            Promise.resolve(calculateRegularity(hist)),
            calculateCorrelationMatrixAsync(hist),
            calculateNetworkCentralityAsync(hist)
        ]);
        
        setSpectral(spec);
        setFractal(frac);
        setRegularity(regData);
        setCorrelationMatrix(corr);
        setCliques(centrality);

        // Analyse Cognitive (Insights)
        const gaps = regData.map(r => ({ number: r.number, gap: r.currentGap }));
        const insights = await generateSmartInsights(targetDraw, hist, spec, gaps, regData);
        setSmartInsights(insights);

        // Clean-up si le tirage a changé
        if (targetDraw !== drawName) setLastPrediction(null);

    } catch (e: any) {
        console.error("Nexus Kernel Error:", e);
        showToast("Erreur chargement données.", "error");
    } finally {
        setLoading(false);
    }
  }, [drawName, showToast]);

  useEffect(() => { 
    loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    const counts: Record<number, number> = {};
    history.forEach(d => d.gagnants.forEach(n => counts[n] = (counts[n] || 0) + 1));
    return Object.entries(counts)
      .map(([n, c]) => ({ number: Number(n), count: c }))
      .sort((a, b) => b.count - a.count);
  }, [history]);

  const gaps = useMemo(() => {
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
  }, [history]);

  const volatility = useMemo(() => history.length > 0 ? calculateVolatility(history) : null, [history]);
  const regime = useMemo(() => history.length > 0 ? detectGameRegime(history) : null, [history]);

  const contextValue: NexusContextType = {
    drawName,
    setDrawName: (n) => { audioEngine.play('click'); setDrawName(n); },
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
    refresh: () => loadData(drawName, true),
    refreshData: async (name: string, force?: boolean) => { audioEngine.play('scan'); setDrawName(name); await loadData(name, force); },
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
