import React, { useState } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { calculateFusion } from "../../services/fusionService";
import { FusionResult, Prediction } from "../../types";
import { savePredictionToHistory } from "../../services/predictionHistoryService";
import { NumberBall } from "../NumberBall";
import { TicketXRay } from "../TicketXRay";
import { useToast } from "../ui/Toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cpu,
  Zap,
  Brain,
  Hexagon,
  ArrowDown,
  Save,
  RefreshCw,
  Layers,
  GitMerge,
  Activity,
  Network,
  Sliders,
  Info,
  Settings,
  HelpCircle,
  CheckCircle2,
  Calculator,
  Play,
  Copy,
  Check,
  Download,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

export const ConvergenceTab: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  const { showToast } = useToast();

  // Selecteurs optimisés de l'infrastructure
  const history = useNexusStore((state) => state.history);
  const stats = useNexusStore((state) => state.stats);
  const spectral = useNexusStore((state) => state.spectral);
  const lastPrediction = useNexusStore((state) => state.lastPrediction);
  const globalWeights = useNexusStore((state) => state.globalWeights);

  // Paramètres interactifs de fusion
  const [biasLogic, setBiasLogic] = useState<number>(1.0);
  const [biasPhysics, setBiasPhysics] = useState<number>(1.0);
  const [biasIntuition, setBiasIntuition] = useState<number>(1.0);
  const [selectionMethod, setSelectionMethod] = useState<
    "map" | "balanced" | "harmonic_consensus"
  >("map");

  const [fusionResult, setFusionResult] = useState<FusionResult | null>(null);
  const [isFusing, setIsFusing] = useState(false);
  const [step, setStep] = useState(0);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyTicket = (numbers: number[]) => {
    audioEngine.play("click");
    const text = numbers.join(" - ");
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    showToast(`Ticket Convergence copié : ${text}`, "success");
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleExportJSON = () => {
    if (!fusionResult) return;
    audioEngine.play("click");
    const data = {
      drawName,
      timestamp: new Date().toISOString(),
      method: selectionMethod,
      finalTicket: fusionResult.finalTicket,
      confidence: fusionResult.confidence,
      entropy: fusionResult.entropy,
      kalmanGains: fusionResult.kalmanGains,
      variances: fusionResult.variances,
      convergedNumbers: fusionResult.convergedNumbers,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `convergence_${drawName.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Fiche de Convergence exportée.", "success");
  };

  // Simulation de backtesting rapide
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [backtestResult, setBacktestResult] = useState<{
    hits: number[];
    accuracy: number;
    simulatedTicket: number[];
    actualGagnants: number[];
  } | null>(null);

  const handleFusion = React.useCallback(() => {
    audioEngine.play("click");
    if (history.length < 5) {
      audioEngine.play("error");
      showToast("Historique insuffisant pour la convergence.", "error");
      return;
    }
    audioEngine.play("loading");
    setIsFusing(true);
    setStep(1);

    // Séquence d'animation cybernétique de la boucle de rétroaction
    setTimeout(() => setStep(2), 500);
    setTimeout(() => setStep(3), 1000);
    setTimeout(() => setStep(4), 1500);

    setTimeout(() => {
      const result = calculateFusion(
        history,
        stats,
        spectral,
        lastPrediction,
        globalWeights,
        { logic: biasLogic, physics: biasPhysics, intuition: biasIntuition },
        selectionMethod,
      );
      setFusionResult(result);
      setIsFusing(false);
      setStep(0);
      audioEngine.play("success");
      showToast("Convergence thermique stabilisée avec succès.", "success");
    }, 2000);
  }, [
    history,
    stats,
    spectral,
    lastPrediction,
    globalWeights,
    biasLogic,
    biasPhysics,
    biasIntuition,
    selectionMethod,
    showToast,
  ]);

  const handleSave = async () => {
    audioEngine.play("click");
    if (!fusionResult) return;

    const breakdown: Record<number, Record<string, number>> = {};
    fusionResult.finalTicket.forEach((num) => {
      const convergedData = fusionResult.convergedNumbers.find(
        (cn) => cn.number === num,
      );
      const p = parseFloat((convergedData?.details as any)?.P || "0");
      const q = parseFloat((convergedData?.details as any)?.Q || "0");
      const o = parseFloat((convergedData?.details as any)?.O || "0");
      breakdown[num] = {
        logic: p,
        physics: q,
        intuition: o,
        orchestration: parseFloat((convergedData?.score || 0).toString()),
      };
    });

    const predictionObj: Prediction = {
      suggestedNumbers: fusionResult.finalTicket,
      candidates: fusionResult.finalTicket,
      confidence: fusionResult.confidence,
      analysis: `Convergence multi-capteurs via algorithme [${selectionMethod.toUpperCase()}]`,
      breakdown: breakdown,
      timestamp: Date.now(),
    };
    await savePredictionToHistory(drawName, predictionObj, undefined, {
      spectral,
    });

    audioEngine.play("success");
    showToast("Ticket Fusion sauvegardé et validé.", "success");
  };

  // Logic de backtesting déterministe
  const runBacktest = () => {
    audioEngine.play("click");
    if (history.length < 6) {
      showToast("Historique insuffisant pour rétrocalculer.", "error");
      return;
    }
    setIsBacktesting(true);

    setTimeout(() => {
      const simulatedHistory = history.slice(1); // On cache le dernier résultat historique
      const result = calculateFusion(
        simulatedHistory,
        stats,
        spectral,
        lastPrediction,
        globalWeights,
        { logic: biasLogic, physics: biasPhysics, intuition: biasIntuition },
        selectionMethod,
      );

      const lastActualDraw = history[0];
      const hits = result.finalTicket.filter((n) =>
        lastActualDraw.gagnants.includes(n),
      );

      setBacktestResult({
        hits,
        accuracy: Math.round(
          (hits.length / lastActualDraw.gagnants.length) * 100,
        ),
        simulatedTicket: result.finalTicket,
        actualGagnants: lastActualDraw.gagnants,
      });
      setIsBacktesting(false);
      audioEngine.play("success");
      showToast(
        `Backtest calibré : ${hits.length} hits identifiés sur le tirage précédent.`,
        "success",
      );
    }, 1200);
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case "python":
        return <Cpu size={12} className="text-emerald-500" />;
      case "quantum":
        return <Zap size={12} className="text-purple-500" />;
      case "oracle":
        return <Brain size={12} className="text-amber-500" />;
      default:
        return <Activity size={12} className="text-slate-500" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case "python":
        return "Logique";
      case "quantum":
        return "Physique";
      case "oracle":
        return "Intuition";
      default:
        return "Inconnu";
    }
  };

  const resetBiases = () => {
    setBiasLogic(1.0);
    setBiasPhysics(1.0);
    setBiasIntuition(1.0);
    showToast("Multiplicateurs réinitialisés à 1.0", "info");
  };

  return (
    <div className="space-y-10 animate-fade-in pb-20 w-full overflow-hidden">
      {/* Header / Control */}
      <div className="bg-slate-900 border border-indigo-500/20 p-8 rounded-3xl shadow-2xl relative overflow-hidden text-center group">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-pulse-slow"></div>
        <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

        {/* Background Grid Pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-50"></div>

        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <GitMerge size={140} />
        </div>

        <div className="relative z-10">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-2xl mb-6 border border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
            <Network size={32} className="text-indigo-400 animate-spin-slow" />
          </div>
          <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter uppercase mb-4 drop-shadow-lg">
            Synthèse{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              Vectorielle
            </span>
          </h2>
          <p className="text-slate-400 text-xs md:text-sm font-medium max-w-xl mx-auto mb-8 leading-relaxed">
            Le moteur de synthèse agrège les signaux{" "}
            <strong className="text-emerald-400">Logiques</strong>{" "}
            (Algorithmes),{" "}
            <strong className="text-purple-400">Physiques</strong> (Spectral) et{" "}
            <strong className="text-amber-400">Intuitifs</strong> (Oracle) pour
            modéliser une topologie absolue d'équilibrage, unique à votre ADN.
          </p>

          {/* Selecteur d'algorithme de convergence */}
          <div className="max-w-xl mx-auto bg-slate-950/80 p-1.5 rounded-2xl border border-white/5 mb-8 flex flex-col sm:flex-row gap-1">
            <button
              type="button"
              onClick={() => setSelectionMethod("map")}
              className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${selectionMethod === "map" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
            >
              MAP (Direct-Greedy)
            </button>
            <button
              type="button"
              onClick={() => setSelectionMethod("balanced")}
              className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${selectionMethod === "balanced" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
            >
              Diversifié (Shannon Balance)
            </button>
            <button
              type="button"
              onClick={() => setSelectionMethod("harmonic_consensus")}
              className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${selectionMethod === "harmonic_consensus" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
            >
              Consensus Harmonique
            </button>
          </div>

          <button
            onClick={handleFusion}
            disabled={isFusing}
            className="px-10 py-5 bg-white text-slate-900 hover:bg-indigo-50 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-[0_0_40px_rgba(255,255,255,0.2)] flex items-center justify-center gap-3 mx-auto transition-all active:scale-95 disabled:opacity-50 min-w-[240px] group relative overflow-hidden"
          >
            {isFusing && (
              <div className="absolute inset-0 bg-indigo-100 animate-pulse"></div>
            )}
            <span className="relative z-10 flex items-center gap-3">
              {isFusing ? (
                <RefreshCw className="animate-spin" size={18} />
              ) : (
                <Hexagon
                  size={18}
                  className="group-hover:rotate-12 transition-transform"
                />
              )}
              {isFusing ? "Calcul de l'état..." : "Lancer la Synthèse"}
            </span>
          </button>
        </div>
      </div>

      {/* Interactive Sliders & Calibration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Advanced Sliders Config */}
        <div className="lg:col-span-2 bg-slate-900/60 p-6 md:p-8 rounded-3xl border border-white/5 space-y-6">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex items-center gap-2">
              <Sliders size={18} className="text-indigo-400" />
              <h3 className="text-sm font-black uppercase tracking-widest text-white">
                Rétro-Ajustement de l'ADN de Fusion
              </h3>
            </div>
            <button
              onClick={resetBiases}
              className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/5 px-2.5 py-1 rounded-md border border-indigo-500/10"
            >
              Réinitialiser
            </button>
          </div>

          <div className="space-y-6">
            {/* Logic (Python) Bias Slider */}
            <div className="space-y-2 p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 transition-colors hover:border-emerald-500/20">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                  <Cpu size={14} /> Logique (Algorithmique)
                </span>
                <span className="font-mono text-emerald-300">
                  {biasLogic.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="5.0"
                step="0.1"
                value={biasLogic}
                onChange={(e) => setBiasLogic(parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full bg-slate-800 accent-emerald-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Module l'impact des estimateurs fréquentiels, d'historiques
                bruts, de momentums et de tendances de fond.
              </p>
            </div>

            {/* Physics (Spectral) Bias Slider */}
            <div className="space-y-2 p-4 bg-purple-500/5 rounded-2xl border border-purple-500/10 transition-colors hover:border-purple-500/20">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-purple-400 flex items-center gap-1.5 uppercase tracking-wide">
                  <Zap size={14} /> Physique (Vecteurs Spectrawave)
                </span>
                <span className="font-mono text-purple-300">
                  {biasPhysics.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="5.0"
                step="0.1"
                value={biasPhysics}
                onChange={(e) => setBiasPhysics(parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full bg-slate-800 accent-purple-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Augmente ou diminue l'importance des oscillations d'ondes
                temporelles et des spectres résonnants continus.
              </p>
            </div>

            {/* Intuition (Oracle) Bias Slider */}
            <div className="space-y-2 p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10 transition-colors hover:border-amber-500/20">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-amber-400 flex items-center gap-1.5 uppercase tracking-wide">
                  <Brain size={14} /> Intuition (Oracle & Chaînes de Markov)
                </span>
                <span className="font-mono text-amber-300">
                  {biasIntuition.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="5.0"
                step="0.1"
                value={biasIntuition}
                onChange={(e) => setBiasIntuition(parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full bg-slate-800 accent-amber-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Module l'influence des signatures markoviennes, d'affinités
                croisées et des prévisions du réseau cybernétique principal.
              </p>
            </div>
          </div>
        </div>

        {/* Cybernetic Loop Backtesting simulation */}
        <div className="bg-slate-900 border border-white/5 p-6 md:p-8 rounded-3xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-4">
              <Activity size={18} className="text-rose-400 animate-pulse" />
              <h3 className="text-sm font-black uppercase tracking-widest text-white">
                Validation Rétro-Chrono
              </h3>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed mb-6">
              Permet d'évaluer l'efficacité de vos configurations en masquant
              virtuellement le tirage le plus récent et en mesurant si la fusion
              l'aurait correctement intercepté.
            </p>

            <AnimatePresence mode="wait">
              {backtestResult ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-4 bg-slate-950/80 rounded-2xl border border-indigo-500/20 space-y-3"
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold">
                      Précision simulée :
                    </span>
                    <span
                      className={`font-black uppercase tracking-wider ${backtestResult.hits.length > 0 ? "text-emerald-400" : "text-amber-400"}`}
                    >
                      {backtestResult.hits.length} hits (
                      {backtestResult.accuracy}%)
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">
                      Ticket Proposé
                    </div>
                    <div className="flex gap-1.5">
                      {backtestResult.simulatedTicket.map((n) => {
                        const isHit = backtestResult.hits.includes(n);
                        return (
                          <span
                            key={`st-${n}`}
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold text-[10px] border ${isHit ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.2)]" : "bg-slate-800 text-slate-400 border-slate-750"}`}
                          >
                            {n}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1 pt-1 border-t border-white/5">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">
                      Tirage Réel
                    </div>
                    <div className="flex gap-1.5">
                      {backtestResult.actualGagnants.slice(0, 5).map((n) => {
                        const isHit = backtestResult.hits.includes(n);
                        return (
                          <span
                            key={`gt-${n}`}
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold text-[10px] border ${isHit ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-black" : "bg-slate-900 text-slate-500 border-white/5"}`}
                          >
                            {n}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="p-4 bg-slate-950/40 rounded-2xl border border-dashed border-white/5 text-center text-slate-500 text-xs italic py-10">
                  En attente d'une simulation de rétro-calcul.
                </div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={runBacktest}
            disabled={isBacktesting || history.length < 6}
            className="w-full mt-6 py-3.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 rounded-2xl font-black text-xs uppercase tracking-widest border border-indigo-500/20 shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40"
          >
            {isBacktesting ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            {isBacktesting
              ? "Calibration..."
              : "Simuler sur le Tirage Précédent"}
          </button>
        </div>
      </div>

      {/* Neural Synapses SVG Visualizer */}
      <div className="bg-slate-950 border border-white/5 rounded-3xl p-6 relative overflow-hidden h-[300px] flex items-center justify-center">
        <div className="absolute top-4 left-6 flex items-center gap-1.5">
          <Activity size={14} className="text-indigo-500 animate-pulse" />
          <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
            Matrice de flux synaptique multi-capteurs
          </h4>
        </div>

        {/* SVG Wiring Canvas */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Background glows */}
          <defs>
            <linearGradient id="emit-green" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="emit-purple" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="emit-amber" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.2" />
            </linearGradient>
            <filter
              id="glow-heavy"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Left Channels to Central Core lines */}
          <path
            d="M 120 70 Q 250 150 450 150"
            fill="none"
            stroke={step === 1 ? "url(#emit-green)" : "#334155"}
            strokeWidth={step === 1 ? 3 : 1.5}
            className={step === 1 ? "animate-pulse" : ""}
          />
          <path
            d="M 120 150 L 450 150"
            fill="none"
            stroke={step === 2 ? "url(#emit-purple)" : "#334155"}
            strokeWidth={step === 2 ? 3 : 1.5}
            className={step === 2 ? "animate-pulse" : ""}
          />
          <path
            d="M 120 230 Q 250 150 450 150"
            fill="none"
            stroke={step === 3 ? "url(#emit-amber)" : "#334155"}
            strokeWidth={step === 3 ? 3 : 1.5}
            className={step === 3 ? "animate-pulse" : ""}
          />

          {/* Sensor dots flying along path if fusing */}
          {isFusing && (
            <>
              <circle r="4" fill="#10b981" filter="url(#glow-heavy)">
                <animateMotion
                  dur="1s"
                  repeatCount="indefinite"
                  path="M 120 70 Q 250 150 450 150"
                />
              </circle>
              <circle r="4" fill="#a855f7" filter="url(#glow-heavy)">
                <animateMotion
                  dur="0.9s"
                  repeatCount="indefinite"
                  path="M 120 150 L 450 150"
                />
              </circle>
              <circle r="4" fill="#f59e0b" filter="url(#glow-heavy)">
                <animateMotion
                  dur="1.1s"
                  repeatCount="indefinite"
                  path="M 120 230 Q 250 150 450 150"
                />
              </circle>
            </>
          )}
        </svg>

        {/* Left Side: 3 Nodes */}
        <div className="absolute left-6 inset-y-0 flex flex-col justify-center gap-10">
          {/* Logique */}
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all duration-300 ${step === 1 || fusionResult ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.3)]" : "bg-slate-900 text-slate-500 border-white/5"}`}
            >
              <Cpu size={18} className={step === 1 ? "animate-bounce" : ""} />
            </div>
            <div className="text-left select-none">
              <span className="text-[10px] text-slate-500 font-black tracking-widest block">
                LOGIQUE
              </span>
              <span className="text-xs font-mono text-slate-300 font-bold">
                {biasLogic.toFixed(1)}x
              </span>
            </div>
          </div>

          {/* Physique */}
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all duration-300 ${step === 2 || fusionResult ? "bg-purple-500/10 text-purple-400 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.3)]" : "bg-slate-900 text-slate-500 border-white/5"}`}
            >
              <Zap size={18} className={step === 2 ? "animate-bounce" : ""} />
            </div>
            <div className="text-left select-none">
              <span className="text-[10px] text-slate-500 font-black tracking-widest block">
                PHYSIQUE
              </span>
              <span className="text-xs font-mono text-slate-300 font-bold">
                {biasPhysics.toFixed(1)}x
              </span>
            </div>
          </div>

          {/* Intuition */}
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all duration-300 ${step === 3 || fusionResult ? "bg-amber-500/10 text-amber-400 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.3)]" : "bg-slate-900 text-slate-500 border-white/5"}`}
            >
              <Brain size={18} className={step === 3 ? "animate-bounce" : ""} />
            </div>
            <div className="text-left select-none">
              <span className="text-[10px] text-slate-500 font-black tracking-widest block">
                INTUITION
              </span>
              <span className="text-xs font-mono text-slate-300 font-bold">
                {biasIntuition.toFixed(1)}x
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Fusion Core */}
        <div className="absolute right-12 flex flex-col items-center">
          <div
            className={`w-28 h-28 rounded-full flex flex-col items-center justify-center border transition-all duration-1000 relative ${isFusing ? "bg-indigo-500/20 border-indigo-400 shadow-[0_0_60px_rgba(99,102,241,0.5)] scale-110" : fusionResult ? "bg-indigo-950/40 border-indigo-500/60 shadow-[0_0_30px_rgba(99,102,241,0.2)]" : "bg-slate-900 border-white/5"}`}
          >
            {/* Swirling outer boundary if fusing */}
            {isFusing && (
              <div className="absolute inset-0 rounded-full border-2 border-indigo-400/30 border-t-indigo-400 animate-spin"></div>
            )}
            <Hexagon
              size={32}
              className={`text-indigo-400 ${isFusing ? "animate-pulse" : ""}`}
            />
            <span className="text-[10px] text-slate-400 font-black tracking-widest uppercase mt-2">
              {isFusing ? "SYNAPSE" : "CORE"}
            </span>
            {fusionResult && (
              <span className="text-[10px] text-emerald-400 font-mono font-bold mt-1">
                K-Consensus
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Source Streams (Legacy reference kept polished) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6 relative">
        {/* Connection lines background */}
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-800/50 -z-10 hidden md:block"></div>

        {/* Python Node */}
        <div
          className={`p-4 rounded-2xl border transition-all duration-500 relative overflow-hidden text-center flex flex-col justify-between min-h-[140px] shadow-sm transform-gpu ${step === 1 || (fusionResult && selectionMethod === "map" && biasLogic > 1.0) ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.15)] scale-105 z-10" : "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100 hover:scale-[1.02]"}`}
        >
          {step === 1 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-emerald-500 animate-[shimmer_2s_infinite]"></div>
          )}
          <div className="mt-2 relative z-10">
            <div
              className={`w-10 h-10 rounded-2xl mx-auto mb-3 flex items-center justify-center transition-colors ${step === 1 || fusionResult ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-200 dark:bg-slate-800 text-slate-400"}`}
            >
              <Cpu size={20} className={step === 1 ? "animate-pulse" : ""} />
            </div>
            <h3
              className={`text-xs md:text-[10px] font-black uppercase tracking-widest ${step === 1 || fusionResult ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`}
            >
              Logique (Python)
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-1 justify-center pb-2 relative z-10">
            {fusionResult ? (
              fusionResult.sources.python.slice(0, 3).map((n) => (
                <span
                  key={n}
                  className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400"
                >
                  {n}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400 italic">--</span>
            )}
          </div>
        </div>

        {/* Quantum Node */}
        <div
          className={`p-4 rounded-2xl border transition-all duration-500 relative overflow-hidden text-center flex flex-col justify-between min-h-[140px] shadow-sm transform-gpu ${step === 2 || (fusionResult && selectionMethod === "map" && biasPhysics > 1.0) ? "bg-purple-50 dark:bg-purple-900/20 border-purple-500/40 shadow-[0_0_30px_rgba(168,85,247,0.15)] scale-105 z-10" : "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100 hover:scale-[1.02]"}`}
        >
          {step === 2 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-purple-500 animate-[shimmer_2s_infinite]"></div>
          )}
          <div className="mt-2 relative z-10">
            <div
              className={`w-10 h-10 rounded-2xl mx-auto mb-3 flex items-center justify-center transition-colors ${step === 2 || fusionResult ? "bg-purple-500/10 text-purple-500" : "bg-slate-200 dark:bg-slate-800 text-slate-400"}`}
            >
              <Zap size={20} className={step === 2 ? "animate-pulse" : ""} />
            </div>
            <h3
              className={`text-xs md:text-[10px] font-black uppercase tracking-widest ${step === 2 || fusionResult ? "text-purple-600 dark:text-purple-400" : "text-slate-500"}`}
            >
              Physique (Spectral)
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-1 justify-center pb-2 relative z-10">
            {fusionResult ? (
              fusionResult.sources.quantum.slice(0, 3).map((n) => (
                <span
                  key={n}
                  className="px-1.5 py-0.5 rounded-md bg-purple-500/10 text-xs font-mono font-bold text-purple-600 dark:text-purple-400"
                >
                  {n}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400 italic">--</span>
            )}
          </div>
        </div>

        {/* Oracle Node */}
        <div
          className={`p-4 rounded-2xl border transition-all duration-500 relative overflow-hidden text-center flex flex-col justify-between min-h-[140px] shadow-sm transform-gpu ${step === 3 || (fusionResult && selectionMethod === "map" && biasIntuition > 1.0) ? "bg-amber-50 dark:bg-amber-900/20 border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.15)] scale-105 z-10" : "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100 hover:scale-[1.02]"}`}
        >
          {step === 3 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-amber-500 animate-[shimmer_2s_infinite]"></div>
          )}
          <div className="mt-2 relative z-10">
            <div
              className={`w-10 h-10 rounded-2xl mx-auto mb-3 flex items-center justify-center transition-colors ${step === 3 || fusionResult ? "bg-amber-500/10 text-amber-500" : "bg-slate-200 dark:bg-slate-800 text-slate-400"}`}
            >
              <Brain size={20} className={step === 3 ? "animate-pulse" : ""} />
            </div>
            <h3
              className={`text-xs md:text-[10px] font-black uppercase tracking-widest ${step === 3 || fusionResult ? "text-amber-600 dark:text-amber-400" : "text-slate-500"}`}
            >
              Intuition (Oracle)
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-1 justify-center pb-2 relative z-10">
            {fusionResult ? (
              fusionResult.sources.oracle.slice(0, 3).map((n) => (
                <span
                  key={n}
                  className="px-1.5 py-0.5 rounded-md bg-amber-500/10 text-xs font-mono font-bold text-amber-600 dark:text-amber-400"
                >
                  {n}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400 italic">--</span>
            )}
          </div>
        </div>
      </div>

      {/* Animation Connector */}
      <div className="flex justify-center -my-6 relative z-10">
        <div
          className={`bg-slate-900 p-4 rounded-full border border-slate-800 shadow-2xl z-20 transition-all duration-500 ${step === 4 ? "scale-125 border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.5)]" : ""}`}
        >
          <ArrowDown
            className={`text-slate-500 ${isFusing ? "animate-bounce text-indigo-500" : ""}`}
            size={24}
          />
        </div>
      </div>

      {/* Result Zone */}
      <AnimatePresence>
        {fusionResult && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="bg-white dark:bg-slate-800 p-8 md:p-6 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-6 opacity-5">
              <Layers size={140} />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-8">
              <div className="text-center relative z-10 w-full mb-6">
                <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-[0.2em] mb-8 border border-indigo-500/20 shadow-sm backdrop-blur-sm">
                  <Hexagon size={12} className="animate-pulse-slow" />{" "}
                  Convergence Atteinte via {selectionMethod.toUpperCase()}
                </div>
                <div className="flex flex-wrap justify-center gap-4 sm:gap-6 scale-110 mb-8 mx-auto w-full max-w-2xl bg-slate-50/50 dark:bg-slate-900/50 p-8 rounded-3xl border border-slate-100 dark:border-slate-800">
                  {fusionResult.finalTicket.map((n, i) => (
                    <motion.div
                      key={n}
                      initial={{ scale: 0, opacity: 0, y: 15 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      transition={{
                        delay: i * 0.1,
                        type: "spring",
                        stiffness: 250,
                        damping: 20,
                      }}
                    >
                      <NumberBall number={n} size="xl" isAttractor />
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="w-full max-w-2xl space-y-8">
                {/* Advanced Kalman Diagnostics (Moteur Cybernétique) */}
                <div className="bg-slate-950 p-6 rounded-[2rem] border border-white/5 space-y-6">
                  <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-[0.2em] flex items-center gap-2 border-b border-white/5 pb-3">
                    <Calculator size={14} className="text-indigo-400" /> Audit
                    Mathématique (Filtre de Kalman Continu)
                  </h4>

                  {/* Equation Render */}
                  <div className="p-4 bg-slate-900/50 rounded-2xl border border-white/5 text-center font-mono text-xs text-slate-300">
                    <div className="text-[10px] text-slate-500 mb-1">
                      Équation d'État Multi-Capteur Réelle
                    </div>
                    {selectionMethod === "harmonic_consensus" ? (
                      <span>X_est = 1.0 / ∑ (K_i / S_i_norm)</span>
                    ) : (
                      <span>X_est = (sP * Kp) + (sQ * Kq) + (sO * Ko)</span>
                    )}
                  </div>

                  {/* Diagnostic Metrics Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Logique Column */}
                    <div className="p-3 bg-slate-900/30 rounded-xl border border-emerald-500/10">
                      <div className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                        <Cpu size={12} /> Logique
                      </div>
                      <div className="mt-2 space-y-1 text-slate-300 text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Gain (Kp) :</span>
                          <span>
                            {(
                              (fusionResult.kalmanGains?.logic || 0) * 100
                            ).toFixed(1)}
                            %
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Variance (σ²) :
                          </span>
                          <span>
                            {(fusionResult.variances?.logic || 0).toFixed(1)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Physique Column */}
                    <div className="p-3 bg-slate-900/30 rounded-xl border border-purple-500/10">
                      <div className="text-[9px] text-purple-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                        <Zap size={12} /> Physique
                      </div>
                      <div className="mt-2 space-y-1 text-slate-300 text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Gain (Kq) :</span>
                          <span>
                            {(
                              (fusionResult.kalmanGains?.physics || 0) * 100
                            ).toFixed(1)}
                            %
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Variance (σ²) :
                          </span>
                          <span>
                            {(fusionResult.variances?.physics || 0).toFixed(1)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Intuition Column */}
                    <div className="p-3 bg-slate-900/30 rounded-xl border border-amber-500/10">
                      <div className="text-[9px] text-amber-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                        <Brain size={12} /> Intuition
                      </div>
                      <div className="mt-2 space-y-1 text-slate-300 text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Gain (Ko) :</span>
                          <span>
                            {(
                              (fusionResult.kalmanGains?.intuition || 0) * 100
                            ).toFixed(1)}
                            %
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Variance (σ²) :
                          </span>
                          <span>
                            {(fusionResult.variances?.intuition || 0).toFixed(
                              1,
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-[9px] text-slate-500 italic text-center">
                    Les gains de Kalman s'adaptent dynamiquement de façon
                    inversement proportionnelle à la variance historique du
                    capteur.
                  </div>
                </div>

                {/* Matrice de Convergence */}
                <div className="bg-slate-50 dark:bg-slate-900/50 p-6 sm:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700/50 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none group-hover:scale-110 group-hover:rotate-12 transition-transform duration-1000">
                    <Layers size={120} />
                  </div>
                  <h4 className="text-[10px] font-black uppercase text-indigo-500 tracking-[0.2em] mb-6 flex items-center gap-2">
                    <Activity
                      size={14}
                      className="text-indigo-400 animate-pulse"
                    />{" "}
                    Matrice de Convergence
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                    {fusionResult.convergedNumbers
                      .filter((cn) =>
                        fusionResult.finalTicket.includes(cn.number),
                      )
                      .map((cn) => (
                        <div
                          key={cn.number}
                          className="flex items-center justify-between p-4 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-black text-lg border border-indigo-500/20">
                              {cn.number}
                            </div>
                            <div className="flex gap-1.5">
                              {cn.sources.map((src) => (
                                <div
                                  key={src}
                                  className="p-2 bg-slate-50 dark:bg-slate-900 rounded-xl text-slate-500"
                                  title={getSourceLabel(src)}
                                >
                                  {getSourceIcon(src)}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-black text-slate-900 dark:text-white">
                              {Math.round(cn.score)}{" "}
                              <span className="text-[10px] text-slate-400">
                                pts
                              </span>
                            </div>
                            <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mt-0.5">
                              Score
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Métriques Globales */}
                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 sm:p-6 rounded-2xl border border-slate-100 dark:border-slate-700/50 min-w-0 font-medium">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400 tracking-widest px-2">
                        <span>Cohérence Totale</span>
                        <span className="text-indigo-500 text-sm">
                          {fusionResult.confidence}%
                        </span>
                      </div>
                      <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-shimmer rounded-full"
                          style={{
                            width: `${fusionResult.confidence}%`,
                            backgroundSize: "200% 100%",
                          }}
                        ></div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400 tracking-widest px-2">
                        <span>Entropie Résiduelle</span>
                        <span className="text-amber-500 text-sm">
                          {(fusionResult.entropy * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full"
                          style={{ width: `${fusionResult.entropy * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* Distribution des Sources */}
                  <div className="mb-8">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 px-2 flex items-center gap-2">
                      <Layers size={14} className="text-indigo-500" /> Poids des
                      Vecteurs Réels
                    </h4>
                    <div className="flex h-4 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 gap-0.5">
                      {(() => {
                        const ticketSources = fusionResult.convergedNumbers
                          .filter((cn) =>
                            fusionResult.finalTicket.includes(cn.number),
                          )
                          .flatMap((cn) => cn.sources);

                        const total = ticketSources.length || 1;
                        const pythonCount = ticketSources.filter(
                          (s) => s === "python",
                        ).length;
                        const quantumCount = ticketSources.filter(
                          (s) => s === "quantum",
                        ).length;
                        const oracleCount = ticketSources.filter(
                          (s) => s === "oracle",
                        ).length;

                        const pPct = (pythonCount / total) * 100;
                        const qPct = (quantumCount / total) * 100;
                        const oPct = (oracleCount / total) * 100;

                        return (
                          <>
                            <div
                              className="h-full bg-emerald-500 rounded-l-full transition-all duration-500"
                              style={{ width: `${pPct}%` }}
                              title={`Logique: ${Math.round(pPct)}%`}
                            ></div>
                            <div
                              className="h-full bg-purple-500 transition-all duration-500"
                              style={{ width: `${qPct}%` }}
                              title={`Physique: ${Math.round(qPct)}%`}
                            ></div>
                            <div
                              className="h-full bg-amber-500 rounded-r-full transition-all duration-500"
                              style={{ width: `${oPct}%` }}
                              title={`Intuition: ${Math.round(oPct)}%`}
                            ></div>
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex justify-between mt-2 px-2 text-xs font-bold uppercase tracking-widest">
                      <span className="text-emerald-500">Logique (Log)</span>
                      <span className="text-purple-500">Physique (Phys)</span>
                      <span className="text-amber-500">Intuition (Int)</span>
                    </div>
                  </div>

                  <TicketXRay
                    numbers={fusionResult.finalTicket}
                    score={fusionResult.confidence}
                    showTitle={false}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
                    <button
                      onClick={() => handleCopyTicket(fusionResult.finalTicket)}
                      className="py-3.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 border border-slate-200 dark:border-slate-700"
                    >
                      {isCopied ? (
                        <>
                          <Check size={16} className="text-emerald-500" />
                          <span className="text-emerald-500">Copié !</span>
                        </>
                      ) : (
                        <>
                          <Copy size={16} />
                          <span>Copier Ticket</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleExportJSON}
                      className="py-3.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 border border-slate-200 dark:border-slate-700"
                    >
                      <Download size={16} />
                      <span>Export JSON</span>
                    </button>

                    <button
                      onClick={handleSave}
                      className="py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                      <Save size={16} />
                      <span>Enregistrer</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
