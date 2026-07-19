import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
  BrainCircuit, 
  Activity, 
  RefreshCw, 
  Layers, 
  Award,
  Info
} from "lucide-react";
import { motion as motionComponent, AnimatePresence } from "framer-motion"; // Let's use framer-motion as in the rest of the app
import { useNexusStore } from "../store/useNexusStore";
import { lotteryService } from "../services/lotteryService";
import { generateMasterPrediction } from "../services/prediction/predictionFacade";
import { NumberBall } from "./NumberBall";
import { audioEngine } from "../utils/audioEngine";
import { useToast } from "./ui/Toast";
import type { Prediction } from "../types";

export const GlobalMacroPredictionView: React.FC = () => {
  const { showToast } = useToast();
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const temporalDepth = useNexusStore((state) => state.temporalDepth);

  const [loading, setLoading] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Parameter controls
  const [adversarialMode, setAdversarialMode] = useState(false);
  const [forcedOutsiderCount] = useState(2);

  // Load ALL combined draw histories on mount
  const loadAllHistoryAndPredict = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
      setError(null);
    }
    try {
      if (!isSilent) audioEngine.play("scan");
      
      // Fetch results of ALL drawings combined
      const allHistory = await lotteryService.fetchHistory("ALL", true);
      setHistoryCount(allHistory.length);

      if (allHistory.length < 10) {
        throw new Error("Historique global insuffisant pour calculer la macro-convergence (Minimum 10 tirages requis).");
      }

      // Generate the prediction deterministically
      const pred = await generateMasterPrediction(
        "ALL_COMBINED",
        allHistory,
        temporalDepth,
        globalWeights,
        undefined,
        undefined,
        false,
        adversarialMode,
        forcedOutsiderCount
      );

      setPrediction(pred);
      if (!isSilent) {
        audioEngine.play("success");
        showToast("🔮 Macro-Convergence calculée sur l'ensemble de tous les tirages !", "success");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Échec du calcul de convergence globale.");
      if (!isSilent) audioEngine.play("error");
    } finally {
      setLoading(false);
    }
  }, [temporalDepth, globalWeights, adversarialMode, forcedOutsiderCount, showToast]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadAllHistoryAndPredict();
    }, 150);
    return () => clearTimeout(t);
  }, [loadAllHistoryAndPredict]);

  const consensusPercentages = useMemo(() => {
    if (!globalWeights) return [];
    const sum = Object.values(globalWeights).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(globalWeights)
      .map(([algo, weight]) => ({
        algo,
        percentage: Math.round((weight / sum) * 100),
      }))
      .sort((a, b) => b.percentage - a.percentage);
  }, [globalWeights]);

  return (
    <div className="glass-card border border-slate-200/60 dark:border-slate-800 rounded-[2rem] p-6 md:p-10 shadow-2xl relative overflow-hidden bg-white dark:bg-slate-900/60 animate-fade-in">
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      {/* HEADER WITH REFRESH */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 pb-6 border-b border-slate-100 dark:border-slate-800/80">
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 dark:text-indigo-400 text-[10px] font-black rounded-full uppercase tracking-widest">
            <Layers size={12} className="animate-pulse" /> Convergence Macro-Tirages ({historyCount} tirages analysés)
          </span>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
            Moteur de Convergence Globale
          </h3>
          <p className="text-slate-400 text-xs font-medium leading-relaxed max-w-xl">
            Cette prédiction analyse la séquence totale unifiée de tous les tirages confondus pour isoler les harmoniques de fond et les zones d'attraction croisées.
          </p>
        </div>

        <button
          onClick={() => loadAllHistoryAndPredict(false)}
          disabled={loading}
          className="w-full md:w-auto px-5 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? "Calcul..." : "Relancer l'Analyse"}
        </button>
      </div>

      {/* CONTENT BLOCK */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motionComponent.div 
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 gap-4"
          >
            <BrainCircuit className="text-indigo-500 animate-spin" size={48} />
            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Inférence en cours sur l'historique complet...</span>
          </motionComponent.div>
        ) : error ? (
          <motionComponent.div 
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-center space-y-3"
          >
            <span className="text-rose-500 font-bold block">Une anomalie est survenue</span>
            <p className="text-slate-400 text-xs">{error}</p>
          </motionComponent.div>
        ) : prediction ? (
          <motionComponent.div
            key="results"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-8"
          >
            {/* COMPOSANTE 1: NUMÉROS SUGGÉRÉS (THE PREDICTED BALLS) */}
            <div className="bg-slate-50 dark:bg-slate-950 p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 text-center space-y-6">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                  Combinaison Suggérée par Consensus Multi-Tirages
                </span>
                <span className="text-xs text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-wider block">
                  Vecteurs Optimaux à Haute Probabilité de Sortie
                </span>
              </div>

              {/* Balls cluster */}
              <div className="flex flex-wrap gap-4 md:gap-6 justify-center">
                {prediction.suggestedNumbers.map((num, i) => (
                  <motionComponent.div
                    key={num}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.1, type: "spring", stiffness: 100 }}
                  >
                    <NumberBall 
                      number={num} 
                      size="md" 
                      isAttractor={i === 0} 
                      confidence={prediction.confidence}
                    />
                  </motionComponent.div>
                ))}
              </div>

              {/* Confidence Gauge */}
              <div className="max-w-md mx-auto space-y-2">
                <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  <span>Confiance de l'Inférence</span>
                  <span className="text-indigo-500 font-mono">{prediction.confidence}%</span>
                </div>
                <div className="h-2 bg-slate-200 dark:bg-slate-900 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                    style={{ width: `${prediction.confidence}%` }}
                  />
                </div>
              </div>
            </div>

            {/* COMPOSANTE 2: DOUBLE-CHANCE & CANDIDATS */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Candidates balls */}
              <div className="lg:col-span-7 bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Award size={16} className="text-indigo-500" /> Numéros de Secours (Candidats)
                </h4>
                <p className="text-slate-400 text-[11px]">
                  Vecteurs secondaires d'attraction validés par l'analyse statistique des écarts (gaps) et de la balistique.
                </p>
                
                <div className="flex flex-wrap gap-3 pt-2">
                  {prediction.candidates.map((num) => (
                    <div 
                      key={num}
                      className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center font-mono font-bold text-slate-700 dark:text-slate-300 shadow-sm"
                    >
                      {num}
                    </div>
                  ))}
                </div>
              </div>

              {/* Consensus list */}
              <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Activity size={16} className="text-indigo-500" /> Profil de Pondération Actif
                </h4>

                <div className="space-y-3">
                  {consensusPercentages.slice(0, 4).map(({ algo, percentage }) => (
                    <div key={algo} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                        <span>{algo}</span>
                        <span>{percentage}%</span>
                      </div>
                      <div className="h-1 bg-slate-200 dark:bg-slate-850 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* ADVERSARIAL MODE CONTROLS */}
            <div className="flex flex-col sm:flex-row gap-6 p-5 bg-indigo-500/5 rounded-2xl border border-indigo-500/10 items-center justify-between">
              <div className="flex items-start gap-3">
                <Info className="text-indigo-500 shrink-0 mt-0.5" size={16} />
                <div>
                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 block uppercase tracking-wider">Inférence Adversaire de Laplace</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Active un modèle de régularisation qui filtre les numéros trop prévisibles pour forcer la sélection d'outsiders à fort potentiel d'écart.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0 w-full sm:w-auto justify-end">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Filtre Adversaire</span>
                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setAdversarialMode(!adversarialMode);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${adversarialMode ? "bg-indigo-600 border-indigo-500 text-white" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500"}`}
                  >
                    {adversarialMode ? "ACTIF" : "INACTIF"}
                  </button>
                </div>
              </div>
            </div>

          </motionComponent.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
