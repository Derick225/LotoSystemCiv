import React, { useState, useCallback, useMemo } from "react";
import { useNexusStore } from "../../store/useNexusStore";
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
import { PredictionVectorPortfolio } from "../prediction/PredictionVectorPortfolio";
import { XAPTransparencyPanel } from "../prediction/XAPTransparencyPanel";
import { NeuralWeightsAuditDashboard } from "../prediction/NeuralWeightsAuditDashboard";
import { OracleScenarioMatrixDeck } from "../prediction/OracleScenarioMatrixDeck";
import { exportService } from "../../services/exportService";
import { evaluateAlgoEmpiricalProof } from "../../services/prediction/weightsManager";
import { getPrimaryInterDrawFamily } from "../../constants";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { Prediction } from "../../types";
import {
  Activity,
  Target,
  RefreshCw,
  AlertTriangle,
  BrainCircuit,
  Atom,
  ShieldCheck,
  Network,
  Globe,
  TrendingUp,
  Cpu,
  WifiOff,
  Sparkles,
  FileText,
  Sliders,
  CheckCircle2,
  Lock,
  Layers,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const PredictionTab = React.memo<{ drawName: string }>(({ drawName }) => {
  const { showToast } = useToast();

  const rawHistory = useNexusStore((state) => state.history);
  const history = React.useDeferredValue(rawHistory);
  const rawLastPrediction = useNexusStore((state) => state.lastPrediction);
  const lastPrediction = React.useDeferredValue(rawLastPrediction);
  const setLastPrediction = useNexusStore((state) => state.setLastPrediction);

  // Isolation stricte de la prédiction au nom du tirage actif (ZÉRO POLLUTION INTER-TIRAGES)
  const activePrediction = useMemo(() => {
    if (lastPrediction && (!lastPrediction.drawName || lastPrediction.drawName === drawName)) {
      return lastPrediction;
    }
    return null;
  }, [lastPrediction, drawName]);

  const nexusLoading = useNexusStore((state) => state.loading);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const inspectingNumber = useNexusStore((state) => state.inspectingNumber);

  const [showCyberFlags, setShowCyberFlags] = useState(false);
  const [isTrainingDashboardOpen, setIsTrainingDashboardOpen] = useState(false);
  const [isAuditDashboardOpen, setIsAuditDashboardOpen] = useState(false);
  const [isExportingForensicPDF, setIsExportingForensicPDF] = useState(false);

  // Famille Inter-Tirages Déterministe
  const interDrawFamily = useMemo(() => {
    return (
      getPrimaryInterDrawFamily(drawName) || {
        id: "FAMILY_10H_16H_SUN19H55",
        name: "Famille Nationale LONACI (10H, 16H & Dimanche 19H55)",
        shortName: "10H/16H/Dim-19H55",
      }
    );
  }, [drawName]);

  // Diagnostic réseau & local
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
    networkDiagnosticMessage: "Moteur connecté aux relais stochastiques locaux & distants.",
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
    volatilityScore,
    activeHistory,
    runInference,
    runMonteCarlo,
  } = usePredictionGenerator(drawName);

  // Synchronisation dynamique de l'état réseau (en ligne / hors-ligne)
  React.useEffect(() => {
    const handleOnline = () => {
      setNetworkState((prev) => ({
        ...prev,
        isOffline: false,
        networkDiagnosticMessage: "Moteur connecté aux relais stochastiques distants.",
      }));
    };
    const handleOffline = () => {
      setNetworkState((prev) => ({
        ...prev,
        isOffline: true,
        networkDiagnosticMessage: "Mode hors-ligne : utilisation du moteur cybernétique autonome local (100% In-Browser).",
      }));
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Adoption directe d'un scénario alternatif comme vecteur principal
  const handleAdoptScenarioTicket = useCallback(
    (numbers: number[], scenarioName: string) => {
      if (!activePrediction) return;
      const updatedPrediction: Prediction = {
        ...activePrediction,
        suggestedNumbers: [...numbers].sort((a, b) => a - b),
        scenarioName,
        analysis: `${activePrediction.analysis} [Scénario Actif : ${scenarioName}]`,
      };
      setLastPrediction(updatedPrediction);
    },
    [activePrediction, setLastPrediction]
  );

  const handleTriggerForensicReport = useCallback(async () => {
    audioEngine.play("click");
    if (!activePrediction) {
      showToast("Veuillez d'abord générer une prédiction pour exporter le rapport forensic.", "info");
      return;
    }

    setIsExportingForensicPDF(true);
    try {
      const isolatedHistory = activeHistory.length > 0 ? activeHistory : purifyHistoryForDraw(drawName, history);
      const sample = isolatedHistory.length > 0 ? isolatedHistory : history;
      const hasMachineData = sample.some((d) => Array.isArray(d.machine) && d.machine.length > 0);

      const proofs = evaluateAlgoEmpiricalProof(drawName, sample);

      await exportService.generateForensicStochasticReportPDF({
        drawName,
        suggestedNumbers: activePrediction.suggestedNumbers,
        candidates: activePrediction.candidates,
        confidence: activePrediction.confidence,
        stabilityScore: activePrediction.stabilityScore,
        realityAlignment: activePrediction.realityAlignment,
        currentEntropy: currentEntropy,
        gameRegimeInfo: {
          regime: gameRegimeInfo?.regime || "Régime Mixte Stationnaire",
          hurst: gameRegimeInfo?.hurst ?? 0.52,
          chaosDimension: gameRegimeInfo?.chaosDimension ?? 1.25,
          weylDiscrepancy: gameRegimeInfo?.weylDiscrepancy ?? 0.18,
          entropy: currentEntropy,
          volatility: volatilityScore,
        },
        resolvedNoiseLevel,
        resolvedLearningRate,
        resolvedMcIterations,
        appliedWeights: (optimizedWeights || globalWeights) as Record<string, number>,
        empiricalProofs: proofs as any,
        breakdown: activePrediction.breakdown as any,
        analysis: activePrediction.analysis,
        hasMachineData,
      });

      showToast("Rapport Forensic exporté avec succès (PDF).", "success");
    } catch (error) {
      console.error("Forensic export failed:", error);
      showToast("Erreur lors de la génération du rapport forensic.", "error");
    } finally {
      setIsExportingForensicPDF(false);
    }
  }, [
    activePrediction,
    drawName,
    history,
    activeHistory,
    currentEntropy,
    gameRegimeInfo,
    volatilityScore,
    resolvedNoiseLevel,
    resolvedLearningRate,
    resolvedMcIterations,
    optimizedWeights,
    globalWeights,
    showToast,
  ]);

  const checkNetworkAndAuth = useCallback(async () => {
    setNetworkState((prev) => ({ ...prev, checkingConnection: true }));
    const online = navigator.onLine;
    await new Promise((resolve) => setTimeout(resolve, 600));
    setNetworkState((prev) => ({
      ...prev,
      isOffline: !online,
      checkingConnection: false,
      networkDiagnosticMessage: online
        ? "Moteur connecté aux relais stochastiques distants."
        : "Mode hors-ligne : utilisation du moteur cybernétique autonome local (100% In-Browser).",
    }));
  }, []);

  if (nexusLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
        <Cpu className="text-slate-400 animate-spin" size={32} />
        <p className="text-sm font-medium uppercase tracking-widest text-slate-500">
          Initialisation Oracle Base...
        </p>
      </div>
    );
  }

  // ÉTAT INITIAL / EMPTY STATE : Command Center Oracle Base
  if (!activePrediction && !isComputing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] w-full max-w-4xl mx-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden px-6 py-12 text-center transition-all">
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
              className={`flex-1 xs:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-full border transition-colors ${
                quantumMode
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300"
                  : "bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-300"
              }`}
            >
              <Atom size={14} className={quantumMode ? "animate-spin-slow" : ""} />
              <span className="text-xs font-semibold uppercase tracking-wider">Quantique</span>
            </button>
            <PredictionFeatureLab showCyberFlags={showCyberFlags} setShowCyberFlags={setShowCyberFlags} />
          </div>
        </div>

        {/* Main Identity */}
        <div className="relative z-10 flex flex-col items-center mt-12 w-full">
          <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-950/50 rounded-full flex items-center justify-center border border-indigo-200 dark:border-indigo-800 mb-6 shadow-inner text-indigo-600 dark:text-indigo-400">
            <Target size={34} />
          </div>

          <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2 text-center">
            Oracle Base
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6 text-center px-4">
            Moteur stochastique prédictif à 19 algorithmes déterministes. Génération de vecteurs absolus & synthèse multi-scénarios.
          </p>

          {/* Network & Local Diagnostic */}
          <PredictionNetworkDiagnostic
            networkState={networkState}
            checkNetworkAndAuth={checkNetworkAndAuth}
          />

          {/* Architecture & Telemetry Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl mx-auto mb-6 text-left">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Moteur Déterministe
                </span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-mono font-bold">
                  100% Local
                </span>
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                19 Algorithmes • Web Workers
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                Markov, Poisson, Hawkes, FFT, Lyapunov, Entropie, SGD
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Couplage Inter-Tirages
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-mono font-bold">
                  {interDrawFamily.shortName}
                </span>
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                {interDrawFamily.name}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                Isolation stricte des 3 familles étanches (AGENTS.md)
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md mx-auto mb-4">
            <button
              onClick={() => runInference()}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-xl text-sm font-semibold uppercase tracking-wider transition-colors shadow-md shadow-indigo-600/20 group cursor-pointer"
            >
              <Activity size={18} className="group-hover:animate-pulse" />
              Lancer la génération
            </button>

            <button
              onClick={runMonteCarlo}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-black dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white px-6 py-4 rounded-xl text-sm font-semibold uppercase tracking-wider transition-colors shadow-sm group cursor-pointer"
            >
              <RefreshCw
                size={18}
                className="group-hover:rotate-180 transition-transform duration-500"
              />
              Monte Carlo
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ÉTAT AVEC RÉSULTATS : ORACLE BASE DASHBOARD COMPLET
  return (
    <div className="w-full mx-auto space-y-8 animate-fade-in pb-24">
      {networkState.isOffline && (
        <div className="bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 p-4 rounded-2xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-between gap-3 max-w-4xl mx-auto shadow-inner animate-slide-up">
          <div className="flex items-center gap-3 text-center sm:text-left">
            <WifiOff size={16} className="animate-pulse shrink-0 text-rose-500" />
            <span>
              Mode Hors-ligne Actif : La prédiction a été formulée via le moteur stochastique autonome local.
            </span>
          </div>
          <button
            type="button"
            onClick={checkNetworkAndAuth}
            disabled={networkState.checkingConnection}
            className="text-[10px] font-black uppercase tracking-widest bg-rose-500/10 hover:bg-rose-500/25 px-4 py-2 rounded-xl border border-rose-500/30 transition-colors shrink-0 flex items-center gap-1.5 text-rose-600 dark:text-rose-300"
          >
            <RefreshCw size={10} className={networkState.checkingConnection ? "animate-spin" : ""} />
            Reconnexion
          </button>
        </div>
      )}

      {/* Header Result & Control Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4 w-full lg:w-auto">
          <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center shadow-inner shrink-0">
            <Activity size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Convergence Absolue
              </h2>
              {activePrediction?.scenarioName && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase border border-indigo-500/20">
                  {activePrediction.scenarioName}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Oracle Base • Confiance: {activePrediction?.confidence ?? 0}% • Famille : {interDrawFamily.name}
            </p>
          </div>
        </div>

        {/* Engine Badges */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-500/10 dark:bg-emerald-950/40 rounded-xl border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
            <Cpu size={14} className="shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-wider">
              19 Algos Déterministes
            </span>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-500/10 dark:bg-amber-950/40 rounded-xl border border-amber-500/30 text-amber-600 dark:text-amber-400">
            <Network size={14} className="shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-wider">
              {interDrawFamily.shortName}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
          <button
            onClick={() => setIsAuditDashboardOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors rounded-xl font-semibold text-xs uppercase tracking-wider border border-slate-200 dark:border-slate-700 cursor-pointer"
            title="Inspecter et modifier les poids algorithmiques"
          >
            <Sliders size={15} className="text-indigo-500" />
            <span>Audit des Poids</span>
          </button>

          <button
            onClick={handleTriggerForensicReport}
            disabled={isExportingForensicPDF || isComputing}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors rounded-xl font-semibold text-xs uppercase tracking-wider border border-indigo-200 dark:border-indigo-800/80 shadow-sm disabled:opacity-50 cursor-pointer"
            title="Exporter en PDF le rapport forensic stochastique"
          >
            <FileText size={15} className="text-indigo-600 dark:text-indigo-400" />
            <span>{isExportingForensicPDF ? "Exportation..." : "Rapport Forensic"}</span>
          </button>

          <button
            onClick={() => runInference()}
            disabled={isComputing}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white transition-colors rounded-xl font-semibold text-xs uppercase tracking-wider disabled:opacity-50 shadow-md shadow-indigo-600/20 group cursor-pointer"
          >
            {isComputing ? (
              <RefreshCw className="animate-spin" size={16} />
            ) : (
              <RefreshCw
                size={16}
                className="group-hover:rotate-180 transition-transform duration-500"
              />
            )}
            Relancer
          </button>
        </div>
      </div>

      {/* Computation Overlay & Results Container */}
      <div className="relative min-h-[400px]">
        {isComputing && activePrediction && (
          <div className="absolute inset-0 z-50 bg-slate-50/60 dark:bg-slate-950/60 backdrop-blur-md rounded-3xl flex items-center justify-center p-4 transition-all duration-300">
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

        {isComputing && !activePrediction && (
          <div className="mb-8">
            <PredictionComputationOverlay
              isComputing={isComputing}
              computingStep={computingStep}
              historyLength={history.length}
              progress={computingProgress}
            />
          </div>
        )}

        {activePrediction && (
          <div className="space-y-8">
            {/* Top Grid: Primary Vector + Metrics Sidebar */}
            <div className="grid lg:grid-cols-12 gap-8">
              {/* Primary Vector Card */}
              <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 md:p-10 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none flex flex-col justify-center relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-[0.02] dark:opacity-[0.05] pointer-events-none transition-transform duration-1000 group-hover:scale-110 group-hover:rotate-12">
                  <Target size={240} className="text-indigo-900" />
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10 relative z-10">
                  <div>
                    <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                      <Sparkles size={12} /> Vecteur Formulé (Oracle Base)
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
                      {activePrediction.confidence}%
                    </span>
                  </div>
                </div>

                {/* Main Suggested Balls */}
                <div className="flex flex-wrap gap-3 sm:gap-4 md:gap-6 justify-center items-center py-8 relative z-10">
                  {activePrediction.suggestedNumbers.map((num, i) => (
                    <motion.div
                      initial={{ scale: 0, opacity: 0, y: 20 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      transition={{
                        delay: i * 0.08,
                        type: "spring",
                        stiffness: 220,
                        damping: 16,
                      }}
                      key={num}
                    >
                      <NumberBall number={num} size="xl" isAttractor />
                    </motion.div>
                  ))}
                </div>

                {/* Peripheral Candidates */}
                {activePrediction.candidates.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800/80 relative z-10">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                      <Atom size={12} className="text-slate-400" /> Numéros Périphériques (Orbitales Secondaires)
                    </h4>
                    <div className="flex flex-wrap gap-2.5">
                      {activePrediction.candidates.slice(0, 10).map((num, i) => (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.4 + i * 0.04 }}
                          key={num}
                        >
                          <NumberBall number={num} size="sm" glow={false} />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar: Topology, Robustness & Uncertainty */}
              <div className="lg:col-span-4 space-y-6">
                {/* Decision Topology */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <Activity size={14} className="text-indigo-400" /> Topologie de Décision
                  </h3>

                  <div className="grid grid-cols-2 gap-4 pb-2">
                    <div>
                      <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                        {activePrediction.confidence}%
                      </div>
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
                        Confiance Inférence
                      </div>
                    </div>
                    <div className="border-l border-slate-100 dark:border-slate-800/80 pl-4">
                      <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        {activePrediction.realityAlignment ?? 82}%
                      </div>
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
                        Alignement ADN Réel
                      </div>
                    </div>
                  </div>

                  <div className="w-full h-px bg-slate-100 dark:bg-slate-800 my-4"></div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                    {activePrediction.analysis}
                  </p>
                </div>

                {/* Cybernetic Diagnostics */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <BrainCircuit size={14} className="text-indigo-400" /> Diagnostic Cybernétique
                  </h3>

                  {/* Inference Robustness */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                        Robustesse Inférence
                      </span>
                      <span className="text-xs font-black font-mono text-indigo-600 dark:text-indigo-400">
                        {activePrediction.stabilityScore ?? 80}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${activePrediction.stabilityScore ?? 80}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Genetic Diversity */}
                  {activePrediction.diversityMetrics && (
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                          Diversité Génétique
                        </span>
                        <span className="text-xs font-black font-mono text-emerald-600 dark:text-emerald-400">
                          {(activePrediction.diversityMetrics.diversityScore * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${activePrediction.diversityMetrics.diversityScore * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Adaptive Continuous Hyperparameters */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400">Taux Régularisation (α)</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        {resolvedLearningRate.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400">Bruit Stochastique</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        {resolvedNoiseLevel.toFixed(3)} V
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400">Cycles Monte-Carlo</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        {resolvedMcIterations}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Oracle Scenario Matrix Deck (Interactive Multi-Scenario Synthesizer & Morphing) */}
            <OracleScenarioMatrixDeck
              prediction={activePrediction}
              drawName={drawName}
              onAdoptTicket={handleAdoptScenarioTicket}
            />

            {/* Comprehensive XAP Transparency Panel */}
            <XAPTransparencyPanel
              prediction={activePrediction}
              drawName={drawName}
              gameRegimeInfo={gameRegimeInfo}
              resolvedNoiseLevel={resolvedNoiseLevel}
              resolvedLearningRate={resolvedLearningRate}
            />

            {/* Neural Heatmap Floor */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
              <NeuralHeatmapGrid
                breakdown={activePrediction.breakdown}
                suggestedNumbers={activePrediction.suggestedNumbers}
              />
            </div>

            {/* Multi-Vector Strategic Portfolio */}
            <PredictionVectorPortfolio
              prediction={activePrediction}
              history={history}
              drawName={drawName}
            />

            {/* Gap Range Sequence Pattern Module */}
            <GapRangeSequenceWidget drawName={drawName} />
          </div>
        )}
      </div>

      <ExplainabilityDrawer />
      <TrainingEvolutionDrawer
        isOpen={isTrainingDashboardOpen}
        onClose={() => setIsTrainingDashboardOpen(false)}
        drawName={drawName}
      />

      {/* Modal Dashboard d'Audit des Poids Neuronaux */}
      <AnimatePresence>
        {isAuditDashboardOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-5xl my-auto"
            >
              <NeuralWeightsAuditDashboard
                isModal={true}
                onClose={() => setIsAuditDashboardOpen(false)}
                onApplySuccess={() => {
                  setIsAuditDashboardOpen(false);
                  runInference();
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default PredictionTab;
