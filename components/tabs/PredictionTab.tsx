import React, { useState, useCallback } from "react";
import { useNexusStore } from "../../store/useNexusStore";

import { NumberBall } from "../NumberBall";
import { useToast } from "../ui/Toast";
import { NeuralHeatmapGrid } from "../NeuralHeatmapGrid";
import { usePredictionGenerator } from "../../hooks/usePredictionGenerator";
import { useForensicData } from "../../hooks/useForensicData";
import { ExplainabilityDrawer } from "../ExplainabilityDrawer";
import { audioEngine } from "../../utils/audioEngine";
import { TrainingEvolutionDrawer } from "../TrainingEvolutionDrawer";
import { PredictionFeatureLab } from "../prediction/PredictionFeatureLab";
import { PredictionNetworkDiagnostic } from "../prediction/PredictionNetworkDiagnostic";
import { PredictionComputationOverlay } from "../prediction/PredictionComputationOverlay";
import { GapRangeSequenceWidget } from "../prediction/GapRangeSequenceWidget";
import {
  Activity,
  Target,
  RefreshCw,
  Save,
  AlertTriangle,
  BrainCircuit,
  Atom,
  ShieldAlert,
  Network,
  Globe,
  TrendingUp,
  Cpu,
  WifiOff,
  Sparkles,
  Volume2,
  CheckCircle2,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Sliders,
} from "lucide-react";
import { speechEngine } from "../../utils/speechEngine";
import { motion } from "framer-motion";

export const PredictionTab = React.memo<{ drawName: string }>(
  ({ drawName }) => {
    const { showToast } = useToast();

    const rawHistory = useNexusStore((state) => state.history);
    const history = React.useDeferredValue(rawHistory);
    const rawLastPrediction = useNexusStore((state) => state.lastPrediction);
    const lastPrediction = React.useDeferredValue(rawLastPrediction);
    const setLastPrediction = useNexusStore((state) => state.setLastPrediction);
    const nexusLoading = useNexusStore((state) => state.loading);
    const globalWeights = useNexusStore((state) => state.globalWeights);
    const updateGlobalWeights = useNexusStore(
      (state) => state.updateGlobalWeights,
    );
    const spectral = useNexusStore((state) => state.spectral);
    const correlationMatrix = useNexusStore((state) => state.correlationMatrix);
    const regularity = useNexusStore((state) => state.regularity);
    const volatility = useNexusStore((state) => state.volatility);
    const symbioticContext = useNexusStore((state) => state.symbioticContext);
    const fractal = useNexusStore((state) => state.fractal);
    const isForensicOptimized = useNexusStore(
      (state) => state.isForensicOptimized,
    );
    const inspectingNumber = useNexusStore((state) => state.inspectingNumber);

    const useCloudEngine = useNexusStore((state) => state.useCloudEngine);
    const setUseCloudEngine = useNexusStore((state) => state.setUseCloudEngine);

    const [showCyberFlags, setShowCyberFlags] = useState(false);
    const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
    const [isTrainingDashboardOpen, setIsTrainingDashboardOpen] =
      useState(false);

    // Network and Authentication state wrappers
    const [networkState, setNetworkState] = useState<{
      isOffline: boolean;
      checkingConnection: boolean;
      authStatus: "checking" | "authenticated" | "anonymous" | "error";
      userEmail: string | null;
      networkDiagnosticMessage: string;
      simulatingOffline: boolean;
    }>({
      isOffline: !navigator.onLine,
      checkingConnection: false,
      authStatus: "checking",
      userEmail: null,
      networkDiagnosticMessage:
        "Moteur connecté aux relais stochastiques distants.",
      simulatingOffline: false,
    });

    const {
      isComputing,
      computingStep,
      computingProgress,
      activeDNA,
      quantumMode,
      setQuantumMode,
      isChaotic,
      isOptimizing,
      optimizedWeights,
      previousWeights,
      currentEntropy,
      resolvedLearningRate,
      resolvedNoiseLevel,
      resolvedMcIterations,
      gameRegimeInfo,
      runInference,
      runMonteCarlo,
      handleOptimizeWeights,
    } = usePredictionGenerator(drawName);

    const { reports } = useForensicData(drawName);

    const rlhfMetrics = React.useMemo(() => {
      const recent = reports.slice(0, 5);
      if (recent.length === 0) return { score: 100, consecutiveFailures: 0, status: 'neutral' };
      
      let consecutiveFailures = 0;
      let totalScore = 0;
      
      for (const r of recent) {
        const perfScore = 100 - (r.divergenceMetric ?? 100);
        if (perfScore < 40) {
          consecutiveFailures++;
        } else {
          break;
        }
      }
      
      recent.forEach(r => {
        const perfScore = 100 - (r.divergenceMetric ?? 100);
        totalScore += perfScore;
      });
      const avgScore = totalScore / recent.length;
      
      return {
        score: Math.round(avgScore),
        consecutiveFailures,
        status: consecutiveFailures >= 3 ? 'critical' : consecutiveFailures > 0 ? 'warning' : 'optimal'
      };
    }, [reports]);

    const handleRunInference = async () => {
      let specificWeights = undefined;
      if (rlhfMetrics.status === 'critical') {
        const current = globalWeights && Object.keys(globalWeights).length > 0 ? { ...globalWeights } : null;
        if (current) {
           const penalized = { ...current };
           const keys = Object.keys(penalized) as (keyof typeof penalized)[];
           const uniform = 1.0 / (keys.length || 1);
           // Dampening towards uniform distribution (max entropy)
           keys.forEach(k => {
              penalized[k] = penalized[k] * 0.5 + uniform * 0.5;
           });
           specificWeights = penalized;
        }
      }
      runInference(specificWeights);
    };

    const checkNetworkAndAuth = useCallback(async () => {
      setNetworkState((prev) => ({ ...prev, checkingConnection: true }));
      const online = navigator.onLine;
      await new Promise((resolve) => setTimeout(resolve, 800));
      setNetworkState((prev) => ({
        ...prev,
        isOffline: !online,
        checkingConnection: false,
        networkDiagnosticMessage: online
          ? "Moteur connecté aux relais stochastiques distants."
          : "Mode hors-ligne : utilisation du moteur cybernétique autonome local.",
      }));
    }, []);

    if (nexusLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
          <Cpu className="text-slate-400 animate-spin" size={32} />
          <p className="text-sm font-medium uppercase tracking-widest text-slate-500">
            Initialisation Oracle...
          </p>
        </div>
      );
    }

    if (!lastPrediction && !isComputing) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[500px] w-full max-w-4xl mx-auto rounded-3xl glass-card neural-border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden px-6 py-12 text-center transition-all">
          {/* Header Controls */}
          <div className="w-full flex flex-col xs:flex-row xs:absolute xs:top-6 xs:left-6 xs:right-6 justify-between items-center gap-3 z-10 mb-8 xs:mb-0 xs:px-6">
            <div className="flex gap-2">
              <button
                onClick={() => setIsTrainingDashboardOpen(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-full border bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors w-full xs:w-auto text-center"
              >
                <TrendingUp size={14} />
                <span className="text-xs font-semibold uppercase tracking-wider hidden sm:inline">
                  Évolution
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2 w-full xs:w-auto justify-center xs:justify-end">
              <button
                onClick={() => setQuantumMode(!quantumMode)}
                className={`flex-1 xs:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-full border transition-colors ${quantumMode ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300" : "bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-300"} `}
              >
                <Atom
                  size={14}
                  className={quantumMode ? "animate-spin-slow" : ""}
                />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Quantique
                </span>
              </button>
              <PredictionFeatureLab
                showCyberFlags={showCyberFlags}
                setShowCyberFlags={setShowCyberFlags}
              />
            </div>
          </div>

          {/* Main Identity */}
          <div className="relative z-10 flex flex-col items-center mt-12 w-full">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center border border-slate-200 dark:border-slate-700 mb-6 shadow-sm">
              <Target
                size={32}
                className="text-indigo-600 dark:text-indigo-400"
              />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white uppercase tracking-tight mb-2 text-center">
              Oracle Base
            </h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6 text-center px-4">
              Moteur stochastique prédictif. Génération de vecteurs absolus via
              réseaux convergents.
            </p>

            {/* Fallback Diagnostics widget */}
            <PredictionNetworkDiagnostic
              networkState={networkState}
              checkNetworkAndAuth={checkNetworkAndAuth}
            />

            {/* Selector of Execution Engine */}
            <div className="w-full max-w-md mx-auto mb-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-4 text-left">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500 dark:text-indigo-400 block">
                  Moteur d'Exécution
                </span>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  {useCloudEngine
                    ? "Cloud Firebase (10 Algos)"
                    : "Calcul Local Intégral (19 Algos)"}
                </span>
                <span className="text-[9px] text-slate-400 block leading-normal">
                  {useCloudEngine
                    ? "Délégation haute performance aux serveurs de calcul."
                    : "Moteur local complet avec les 19 modèles mathématiques d'écarts."}
                </span>
              </div>
              <label className="relative flex items-center shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCloudEngine}
                  onChange={(e) => {
                    try {
                      audioEngine.play("click");
                    } catch (err) {}
                    setUseCloudEngine(e.target.checked);
                    showToast(
                      e.target.checked
                        ? "Moteur Cloud Firebase activé."
                        : "Calcul Local Intégral activé.",
                      "info",
                    );
                  }}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md mx-auto mb-8">
              <div className="sm:col-span-2">
                <div className={`p-3 rounded-xl border flex items-start gap-3 transition-colors ${
                  rlhfMetrics.status === 'critical' ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400' :
                  rlhfMetrics.status === 'warning' ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400' :
                  'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                }`}>
                  <BrainCircuit size={18} className={`shrink-0 mt-0.5 ${
                    rlhfMetrics.status === 'critical' ? 'text-rose-500' :
                    rlhfMetrics.status === 'warning' ? 'text-amber-500' :
                    'text-emerald-500'
                  }`} />
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-wider mb-1 flex items-center gap-2">
                      Score de Fiabilité RLHF: {rlhfMetrics.score}%
                      {rlhfMetrics.status === 'critical' && <span className="bg-rose-500 text-white px-1.5 py-0.5 rounded text-[8px] animate-pulse">PÉNALITÉ APPLIQUÉE</span>}
                    </h4>
                    <p className="text-[9px] leading-relaxed opacity-90">
                      {rlhfMetrics.status === 'critical' 
                        ? `Le modèle a échoué sur les ${rlhfMetrics.consecutiveFailures} derniers tirages. Une pénalité d'amortissement bayésienne sera appliquée sur les poids algorithmiques.` 
                        : rlhfMetrics.status === 'warning'
                        ? `Attention : ${rlhfMetrics.consecutiveFailures} échec(s) récent(s). Le moteur ajuste dynamiquement la variance.`
                        : "Fiabilité optimale confirmée par l'autopsie des derniers tirages."}
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleRunInference}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-xl text-sm font-semibold uppercase tracking-wider transition-colors shadow-sm group"
              >
                <Activity size={18} className="group-hover:animate-pulse" />{" "}
                Lancer la génération
              </button>
              <button
                onClick={runMonteCarlo}
                className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-black dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white px-6 py-4 rounded-xl text-sm font-semibold uppercase tracking-wider transition-colors shadow-sm group"
              >
                <RefreshCw
                  size={18}
                  className="group-hover:rotate-180 transition-transform duration-500"
                />{" "}
                Monte Carlo
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full mx-auto space-y-8 animate-fade-in pb-24">
        {networkState.isOffline && (
          <div className="bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 p-4 rounded-2xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-between gap-3 max-w-4xl mx-auto shadow-inner animate-slide-up">
            <div className="flex items-center gap-3 text-center sm:text-left">
              <WifiOff
                size={16}
                className="animate-pulse shrink-0 text-rose-500"
              />
              <span>
                Mode Hors-ligne Actif : La prédiction a été formulée via le
                moteur stochastique autonome. L'enregistrement au serveur est
                désactivé.
              </span>
            </div>
            <button
              type="button"
              onClick={checkNetworkAndAuth}
              disabled={networkState.checkingConnection}
              className="text-[10px] font-black uppercase tracking-widest bg-rose-500/10 hover:bg-rose-500/25 px-4 py-2 rounded-xl border border-rose-500/30 transition-colors shrink-0 flex items-center gap-1.5 text-rose-600 dark:text-rose-300"
            >
              <RefreshCw
                size={10}
                className={
                  networkState.checkingConnection ? "animate-spin" : ""
                }
              />
              Reconconnexion
            </button>
          </div>
        )}

        {/* Header Result */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center shadow-inner">
              <Activity size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                Convergence Absolue
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Oracle Nexus • Confiance: {lastPrediction?.confidence ?? 0}%
              </p>
            </div>
          </div>

          {/* New inline engine switch */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-150 dark:border-slate-850">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Moteur
            </span>
            <button
              onClick={() => {
                try {
                  audioEngine.play("click");
                } catch (err) {}
                setUseCloudEngine(false);
                showToast(
                  "Calcul Local Intégral (19 Algos) sélectionné",
                  "info",
                );
              }}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${!useCloudEngine ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm font-black" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-bold"}`}
            >
              Local (19 Algos)
            </button>
            <button
              onClick={() => {
                try {
                  audioEngine.play("click");
                } catch (err) {}
                setUseCloudEngine(true);
                showToast("Cloud Firebase (10 Algos) sélectionné", "info");
              }}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${useCloudEngine ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm font-black" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-bold"}`}
            >
              Cloud
            </button>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={handleRunInference}
              disabled={isComputing}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors rounded-xl font-semibold text-xs uppercase tracking-wider disabled:opacity-50 group"
            >
              {isComputing ? (
                <RefreshCw className="animate-spin" size={16} />
              ) : (
                <RefreshCw
                  size={16}
                  className="group-hover:rotate-180 transition-transform duration-500"
                />
              )}
              Relancer la génération
            </button>
            <button
              onClick={async () => {
                if (!lastPrediction) return;
                try {
                  showToast("Sauvegardé dans le portefeuille", "success");
                } catch (error) {
                  console.error(
                    "[Oracle Base] Failed to save ticket to database portfolio:",
                    error,
                  );
                  showToast(
                    "Sauvegardé temporairement (Réseau déconnecté)",
                    "info",
                  );
                }
              }}
              disabled={isComputing || !lastPrediction}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white hover:bg-indigo-700 transition-colors rounded-xl font-semibold text-xs uppercase tracking-wider shadow-sm disabled:opacity-50"
            >
              <Save size={16} /> Enregistrer
            </button>
          </div>
        </div>

        {/* Computation Overlay & Results Grid Container */}
        <div className="relative min-h-[400px]">
          {isComputing && lastPrediction && (
            <div className="absolute inset-0 z-50 bg-slate-50/60 dark:bg-slate-950/60 backdrop-blur-md rounded-3xl sm:rounded-[2rem] flex items-center justify-center p-4 transition-all duration-300">
              <div className="w-full max-w-xl">
                <PredictionComputationOverlay
                  isComputing={isComputing}
                  computingStep={computingStep}
                  historyLength={history.length}
                  progress={computingProgress}
                />
              </div>
            </div>
          )}

          {isComputing && !lastPrediction && (
            <div className="mb-8">
              <PredictionComputationOverlay
                isComputing={isComputing}
                computingStep={computingStep}
                historyLength={history.length}
                progress={computingProgress}
              />
            </div>
          )}

          {lastPrediction && (
            <div className="grid lg:grid-cols-12 gap-8">
              {/* Primary Vector */}
              <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[2rem] p-4 sm:p-8 md:p-10 border border-slate-200/60 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none flex flex-col justify-between relative overflow-hidden group">
                {/* Background Decor */}
                <div className="absolute top-0 right-0 p-8 opacity-[0.02] dark:opacity-[0.05] pointer-events-none transition-transform duration-1000 group-hover:scale-110 group-hover:rotate-12">
                  <Target size={240} className="text-indigo-900" />
                </div>

                <div>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 relative z-10">
                    <div>
                      <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                        <Sparkles size={12} /> Vecteur Formulé
                      </h3>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tighter">
                          Sélection Optimale
                        </span>
                        <button
                          onClick={() => {
                            try { audioEngine.play("click"); } catch (e) {}
                            speechEngine.speakNumbers(lastPrediction.suggestedNumbers, drawName);
                            showToast("Lecture vocale des numéros...", "info");
                          }}
                          className="px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                        >
                          <Volume2 size={16} className="animate-pulse" />
                          <span>Écouter 🔊</span>
                        </button>
                        {isChaotic && (
                          <div
                            className="bg-orange-500/10 text-orange-600 dark:text-orange-400 p-2 rounded-xl"
                            title="Mode Chaotique Détecté"
                          >
                            <AlertTriangle size={20} />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Badge de Confiance Intuitif */}
                    <div className={`px-4 py-2 rounded-2xl flex items-center gap-2.5 border font-black text-xs uppercase tracking-wider shadow-sm ${
                      lastPrediction.confidence >= 80
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        : lastPrediction.confidence >= 65
                        ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                    }`}>
                      <span className="text-base">
                        {lastPrediction.confidence >= 80 ? "⭐" : lastPrediction.confidence >= 65 ? "⚡" : "⚖️"}
                      </span>
                      <div>
                        <div className="text-[9px] font-bold opacity-80">Indice de Confiance</div>
                        <div className="text-sm font-black font-mono leading-none">{lastPrediction.confidence}%</div>
                      </div>
                    </div>
                  </div>

                  {/* Numbers Display */}
                  <div className="flex flex-wrap gap-2 xs:gap-3 sm:gap-4 md:gap-6 justify-center items-center py-6 relative z-10">
                    {lastPrediction.suggestedNumbers.map((num, i) => (
                      <motion.div
                        initial={{ scale: 0, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        transition={{
                          delay: i * 0.1,
                          type: "spring",
                          stiffness: 200,
                          damping: 15,
                        }}
                        key={num}
                      >
                        <NumberBall number={num} size="xl" isAttractor />
                      </motion.div>
                    ))}
                  </div>

                  {/* Conseil Simple de l'Assistant */}
                  <div className="mt-6 p-4 sm:p-5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/50 flex items-start gap-3.5 shadow-sm relative z-10">
                    <div className="p-2.5 rounded-xl bg-indigo-600 text-white shrink-0 mt-0.5 shadow-sm">
                      <Lightbulb size={20} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-black uppercase text-indigo-950 dark:text-indigo-200 tracking-wider flex items-center gap-2">
                        Conseil de l'Assistant
                      </h4>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                        {lastPrediction.confidence >= 80
                          ? "Cette sélection présente une excellente régularité. Ces 5 numéros sont fortement recommandés pour votre prochain ticket."
                          : lastPrediction.confidence >= 65
                          ? "Combinaison équilibrée combinant numéros fréquents et retardataires. Idéale pour varier vos combinaisons."
                          : "Sélection à régularité modérée. Vous pouvez la compléter avec 1 ou 2 de vos numéros favoris."}
                      </p>
                    </div>
                  </div>
                </div>

                {lastPrediction.candidates.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800/80 relative z-10">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                      <Atom size={12} className="text-slate-400" /> Numéros Complémentaires (Optionnels)
                    </h4>
                    <div className="flex flex-wrap gap-2.5">
                      {lastPrediction.candidates.slice(0, 10).map((num, i) => (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.6 + i * 0.05 }}
                          key={num}
                        >
                          <NumberBall number={num} size="sm" glow={false} />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Meta Info */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[2rem] p-5 sm:p-8 border border-slate-200/60 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6 opacity-[0.03] dark:opacity-[0.05] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
                    <Activity size={120} />
                  </div>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-500" /> Indicateurs de Qualité
                  </h3>

                  <div className="space-y-4 relative z-10">
                    {/* Confiance */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Niveau de Confiance</span>
                        <span className="text-xs font-black font-mono text-indigo-600 dark:text-indigo-400">{lastPrediction.confidence}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${lastPrediction.confidence}%` }} />
                      </div>
                    </div>

                    {/* Stabilité */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Stabilité du Tirage</span>
                        <span className="text-xs font-black font-mono text-emerald-600 dark:text-emerald-400">{lastPrediction.stabilityScore ?? 80}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${lastPrediction.stabilityScore ?? 80}%` }} />
                      </div>
                    </div>

                    {/* Alignement ADN */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Alignement Historique</span>
                        <span className="text-xs font-black font-mono text-teal-600 dark:text-teal-400">{lastPrediction.realityAlignment ?? 82}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${lastPrediction.realityAlignment ?? 82}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="w-full h-px bg-slate-100 dark:bg-slate-800/80 my-6 relative z-10"></div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium relative z-10">
                    {lastPrediction.analysis}
                  </p>

                  <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => {
                        audioEngine.play("click");
                        setShowAdvancedDetails(!showAdvancedDetails);
                      }}
                      className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer border border-slate-200/60 dark:border-slate-700/60"
                    >
                      <Sliders size={14} className="text-indigo-500" />
                      <span>{showAdvancedDetails ? "Masquer Détails Experts" : "Afficher Détails Experts"}</span>
                      {showAdvancedDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Advanced Technical Details (Collapsed by default for visual clarity) */}
              {showAdvancedDetails && (
                <>
                  <div className="lg:col-span-12 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                      <BrainCircuit size={14} className="text-indigo-400" /> Diagnostic Technique Approfondi
                    </h3>

                    <div className="grid md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <span className="text-xs text-slate-400 font-bold uppercase">Taux de Régularisation (α)</span>
                        <div className="text-sm font-mono font-bold text-slate-800 dark:text-slate-200">{resolvedLearningRate.toFixed(4)}</div>
                      </div>
                      <div className="space-y-2">
                        <span className="text-xs text-slate-400 font-bold uppercase">Bruit Stochastique</span>
                        <div className="text-sm font-mono font-bold text-slate-800 dark:text-slate-200">{resolvedNoiseLevel.toFixed(3)} V</div>
                      </div>
                      <div className="space-y-2">
                        <span className="text-xs text-slate-400 font-bold uppercase">Cycles Monte-Carlo</span>
                        <div className="text-sm font-mono font-bold text-slate-800 dark:text-slate-200">{resolvedMcIterations} cycles</div>
                      </div>
                    </div>
                  </div>

                  {/* Heatmap Floor */}
                  <div className="lg:col-span-12 bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <NeuralHeatmapGrid
                      breakdown={lastPrediction.breakdown}
                      suggestedNumbers={lastPrediction.suggestedNumbers}
                    />
                  </div>

                  {/* Gap Range Sequence Pattern Module */}
                  <div className="lg:col-span-12 mt-4">
                    <GapRangeSequenceWidget drawName={drawName} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <ExplainabilityDrawer />
        <TrainingEvolutionDrawer
          isOpen={isTrainingDashboardOpen}
          onClose={() => setIsTrainingDashboardOpen(false)}
          drawName={drawName}
        />
      </div>
    );
  },
);

export default PredictionTab;
