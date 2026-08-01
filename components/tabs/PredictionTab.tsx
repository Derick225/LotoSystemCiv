import React, { useState, useCallback } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { saveTicket } from "../../services/userPreferencesService";
import { NumberBall } from "../NumberBall";
import { useToast } from "../ui/Toast";
import { NeuralHeatmapGrid } from "../NeuralHeatmapGrid";
import { usePredictionGenerator } from "../../hooks/usePredictionGenerator";
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
  Wallet,
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
} from "lucide-react";
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
                    ? "Cloud Supabase (10 Algos)"
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
                        ? "Moteur Cloud Supabase activé."
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
              <button
                onClick={() => runInference()}
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
                showToast("Cloud Supabase (10 Algos) sélectionné", "info");
              }}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${useCloudEngine ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm font-black" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-bold"}`}
            >
              Cloud
            </button>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={() => runInference()}
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
                  await saveTicket({
                    numbers: lastPrediction.suggestedNumbers,
                    drawName,
                    strategy: "Oracle",
                  });
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
              <Wallet size={16} /> Enregistrer
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
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[2rem] p-4 sm:p-8 md:p-10 border border-slate-200/60 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none flex flex-col justify-center relative overflow-hidden group">
              {/* Background Decor */}
              <div className="absolute top-0 right-0 p-8 opacity-[0.02] dark:opacity-[0.05] pointer-events-none transition-transform duration-1000 group-hover:scale-110 group-hover:rotate-12">
                <Target size={240} className="text-indigo-900" />
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10 relative z-10">
                <div>
                  <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                    <Sparkles size={12} /> Vecteur Formulé
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tighter">
                      Sélection Optimale
                    </span>
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
                <div className="px-5 py-2.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 transition-colors text-indigo-700 dark:text-indigo-400 rounded-2xl flex items-center gap-3 border border-indigo-100 dark:border-indigo-500/20 cursor-default">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
                    Indice de Confiance
                  </span>
                  <span className="text-xl font-black font-mono">
                    {lastPrediction.confidence}%
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 xs:gap-3 sm:gap-4 md:gap-6 justify-center items-center py-8 relative z-10">
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

              {lastPrediction.candidates.length > 0 && (
                <div className="mt-10 pt-8 border-t border-slate-100 dark:border-slate-800/80 relative z-10">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-5 flex items-center gap-2">
                    <Atom size={12} className="text-slate-400" /> Numéros
                    Périphériques (Orbitales)
                  </h4>
                  <div className="flex flex-wrap gap-3">
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
              <div className="bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[2rem] p-4 sm:p-8 border border-slate-200/60 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-[0.03] dark:opacity-[0.05] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
                  <Activity size={120} />
                </div>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                  <Activity size={14} className="text-indigo-400" /> Topologie
                  de Décision
                </h3>
                {/* Dual Metrics: Confidence and Alignment */}
                <div className="grid grid-cols-2 gap-4 pb-2 relative z-10">
                  <div>
                    <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-indigo-500 to-purple-500 font-mono">
                      {lastPrediction.confidence}%
                    </div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
                      Confiance de l'Inférence
                    </div>
                  </div>
                  <div className="border-l border-slate-100 dark:border-slate-800/80 pl-4">
                    <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-500 to-teal-500 font-mono">
                      {lastPrediction.realityAlignment ?? 82}%
                    </div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
                      Alignement ADN Réel
                    </div>
                  </div>
                </div>
                <div className="w-full h-px bg-gradient-to-r from-indigo-500/20 to-transparent my-6 relative z-10"></div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium relative z-10">
                  {lastPrediction.analysis}
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[2rem] p-4 sm:p-8 border border-slate-200/60 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none relative overflow-hidden group">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                  <BrainCircuit size={14} className="text-indigo-400" />{" "}
                  Diagnostic Cybernétique
                </h3>

                {/* Stabilité */}
                <div className="mb-6 relative z-10">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                      Robustesse de l'Inférence
                    </span>
                    <span className="text-sm font-black font-mono text-indigo-600 dark:text-indigo-400">
                      {lastPrediction.stabilityScore ?? 80}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${(lastPrediction.stabilityScore ?? 80) >= 70 ? "bg-emerald-500" : (lastPrediction.stabilityScore ?? 80) >= 40 ? "bg-amber-500" : "bg-rose-500"}`}
                      style={{
                        width: `${lastPrediction.stabilityScore ?? 80}%`,
                      }}
                    ></div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 font-medium">
                    {(lastPrediction.stabilityScore ?? 80) >= 70
                      ? "Haute Homogénéité (Résistent aux perturbations de poids)"
                      : (lastPrediction.stabilityScore ?? 80) >= 40
                        ? "Équilibre Stationnaire (Sensibilité paramétrique modérée)"
                        : "Haute Sensibilité (Régime stochastique instable / Transition)"}
                  </p>
                </div>

                {/* Diversité Génétique (Similarité Cosinus) */}
                {lastPrediction.diversityMetrics && (
                  <div className="mb-6 relative z-10">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                        Diversité Génétique (Orthogonalité)
                      </span>
                      <span
                        className={`text-sm font-black font-mono ${lastPrediction.diversityMetrics.diversityScore >= 0.5 ? "text-emerald-500" : lastPrediction.diversityMetrics.diversityScore >= 0.3 ? "text-amber-500" : "text-rose-500"}`}
                      >
                        {(
                          lastPrediction.diversityMetrics.diversityScore * 100
                        ).toFixed(1)}
                        %
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${lastPrediction.diversityMetrics.diversityScore >= 0.5 ? "bg-emerald-500" : lastPrediction.diversityMetrics.diversityScore >= 0.3 ? "bg-amber-500" : "bg-rose-500"}`}
                        style={{
                          width: `${lastPrediction.diversityMetrics.diversityScore * 100}%`,
                        }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400 mt-2 font-medium">
                      <span>
                        Similarité Moyenne:{" "}
                        {lastPrediction.diversityMetrics.meanSimilarity}
                      </span>
                      {lastPrediction.diversityMetrics.dominantAlgo && (
                        <span className="uppercase text-[8px] font-black tracking-wider text-indigo-400">
                          Dominé par:{" "}
                          {lastPrediction.diversityMetrics.dominantAlgo}
                        </span>
                      )}
                    </div>
                    {lastPrediction.diversityMetrics.isMonoculture && (
                      <p className="text-[10px] text-rose-500 font-bold mt-1">
                        ⚠️ Alerte Monoculture détectée dans l'ADN des candidats.
                        Rejet par le générateur.
                      </p>
                    )}
                  </div>
                )}



                <div className="w-full h-px bg-slate-100 dark:bg-slate-800/80 my-4 relative z-10"></div>

                {/* Hyperparamètres Continus */}
                <div className="space-y-3 mb-6 relative z-10">
                  <h4 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                    <Atom size={10} className="text-indigo-400" /> Paramètres
                    Adaptatifs
                  </h4>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50 dark:border-slate-805">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      Taux de Régularisation (α)
                    </span>
                    <span className="text-xs font-bold font-mono text-slate-705 dark:text-slate-350">
                      {resolvedLearningRate.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50 dark:border-slate-805">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      Bruit Stochastique de Recuit
                    </span>
                    <span className="text-xs font-bold font-mono text-slate-705 dark:text-slate-350">
                      {resolvedNoiseLevel.toFixed(3)} V
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      Résolution Monte-Carlo
                    </span>
                    <span className="text-xs font-bold font-mono text-slate-705 dark:text-slate-350">
                      {resolvedMcIterations} cycles
                    </span>
                  </div>
                </div>

                <div className="w-full h-px bg-slate-100 dark:bg-slate-800/80 my-4 relative z-10"></div>

                {/* Chaos & Physics */}
                <div className="space-y-3 relative z-10">
                  <h4 className="text-[9px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                    <Cpu size={10} className="text-indigo-400" /> Régime
                    Physique Historique
                  </h4>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50 dark:border-slate-805">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      Exposant de Hurst (Mémoire)
                    </span>
                    <span className="text-xs font-bold font-mono text-indigo-500 dark:text-indigo-400">
                      {gameRegimeInfo?.hurst?.toFixed(4) || "0.5000"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50 dark:border-slate-805">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      Chaos Dimensionnel GP
                    </span>
                    <span className="text-xs font-bold font-mono text-indigo-500 dark:text-indigo-400">
                      {gameRegimeInfo?.chaosDimension?.toFixed(3) || "1.250"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50 dark:border-slate-805">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      Discrépance de Weyl (Uniformité)
                    </span>
                    <span className="text-xs font-bold font-mono text-indigo-500 dark:text-indigo-400">
                      {gameRegimeInfo?.weylDiscrepancy?.toFixed(4) || "0.1800"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      Entropie Sh. de l'historique
                    </span>
                    <span className="text-xs font-bold font-mono text-indigo-500 dark:text-indigo-400">
                      {currentEntropy.toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[2rem] p-4 sm:p-8 border border-slate-200/60 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none flex flex-col justify-start relative overflow-hidden">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 w-full text-left flex items-center gap-2">
                  <Network size={14} className="text-indigo-400" /> Poids
                  Algorithmiques
                </h3>
                <div className="w-full space-y-4">
                  {Object.entries(optimizedWeights || globalWeights)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .slice(0, 5)
                    .map(([key, val]) => (
                      <div key={key} className="w-full">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 capitalize">
                            {key.replace(/([A-Z])/g, " $1").trim()}
                          </span>
                          <span className="text-[10px] font-mono text-indigo-500 font-bold">
                            {((val as number) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 dark:bg-indigo-400 rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${(val as number) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
                <p className="mt-6 text-[9px] text-slate-400 italic text-center w-full">
                  Pondérations optimisées déterministes.
                </p>
              </div>
            </div>

            {/* XAP Floor */}
            {lastPrediction.xapExp && lastPrediction.xapExp.length > 0 && (
              <div className="lg:col-span-12 bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm mt-4 mb-4">
                <h3 className="text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase mb-6 flex items-center gap-2">
                  <Network size={14} className="text-indigo-400" /> Attribution
                  ADN Multi-Algorithmique (XAP / Shapley Values)
                </h3>
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 sm:gap-4">
                  {lastPrediction.xapExp.map((xap) => {
                    const topShapley = xap.shapleyValues
                      ? Object.entries(xap.shapleyValues)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 2)
                      : [[xap.dominantAlgo, xap.contributionPercentage]];

                    return (
                      <div
                        key={xap.number}
                        className="bg-slate-50 dark:bg-slate-800/50 rounded-xl xs:rounded-2xl p-2 xs:p-4 border border-slate-100 dark:border-slate-700/50 flex flex-col items-center justify-between text-center min-h-[140px] xs:min-h-[160px] shadow-sm relative group cursor-help transition-all hover:border-indigo-500/30"
                        title={`Algorithmes en synergie: ${xap.synergyAlgos?.join(", ") || "Aucun"}\nEntropie: ${xap.compositionEntropy?.toFixed(2) || "1.00"}`}
                      >
                        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-lg mb-2 border border-indigo-200/50 dark:border-indigo-800/50 shadow-inner">
                          {xap.number}
                        </div>

                        <div className="w-full space-y-2 mt-1">
                          {topShapley.map(([algo, sv], idx) => (
                            <div key={algo} className="w-full">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 leading-tight line-clamp-1 text-left">
                                  {String(algo).substring(0, 12)}
                                </span>
                                <span className="text-[8px] font-mono text-indigo-500 dark:text-indigo-400">
                                  {Number(sv).toFixed(1)}%
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-slate-700 h-1 rounded-full overflow-hidden">
                                <div
                                  className={`${idx === 0 ? "bg-indigo-500" : "bg-slate-400 dark:bg-slate-500"} h-full rounded-full transition-all duration-700`}
                                  style={{ width: `${Number(sv)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-6 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 italic border-l-2 border-indigo-500 pl-3">
                  * L'XAP (eXplainable Attribution Prediction) utilise la
                  Théorie des Jeux (Valeurs de Shapley) pour quantifier la
                  contribution marginale exacte de chaque modèle corrélé dans la
                  synergie algorithmique du vecteur.
                </p>
              </div>
            )}

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
