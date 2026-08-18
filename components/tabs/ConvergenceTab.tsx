import React, { useState, useRef } from "react";
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
  Calculator,
  Play,
  Copy,
  Check,
  Download,
  Flame,
  Binary,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

export const ConvergenceTab: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  const { showToast } = useToast();

  // Optimized infrastructure selectors
  const history = useNexusStore((state) => state.history);
  const stats = useNexusStore((state) => state.stats);
  const spectral = useNexusStore((state) => state.spectral);
  const lastPrediction = useNexusStore((state) => state.lastPrediction);
  const globalWeights = useNexusStore((state) => state.globalWeights);

  // Interactive fusion parameters
  const [biasLogic, setBiasLogic] = useState<number>(1.0);
  const [biasPhysics, setBiasPhysics] = useState<number>(1.0);
  const [biasIntuition, setBiasIntuition] = useState<number>(1.0);
  const [selectionMethod, setSelectionMethod] = useState<
    "map" | "balanced" | "harmonic_consensus" | "quantum_bayesian"
  >("quantum_bayesian");

  const [fusionResult, setFusionResult] = useState<FusionResult | null>(null);
  const [isFusing, setIsFusing] = useState(false);
  const [step, setStep] = useState(0);
  const [isCopied, setIsCopied] = useState(false);

  // Ternary Simplex ref & interactive drag state
  const svgSimplexRef = useRef<SVGSVGElement | null>(null);
  const [isDraggingSimplex, setIsDraggingSimplex] = useState(false);

  // Simplex Vertices in SVG coordinate space (Width=260, Height=220)
  // Vertex P (Physique/Quantum - Top): (130, 20)
  // Vertex L (Logique/Python - Bottom Left): (25, 195)
  // Vertex I (Intuition/Oracle - Bottom Right): (235, 195)
  const vTop = { x: 130, y: 20 };
  const vLeft = { x: 25, y: 195 };
  const vRight = { x: 235, y: 195 };

  // Calculate current centroid position on the 2D simplex
  const currentSimplexPoint = React.useMemo(() => {
    const total = biasLogic + biasPhysics + biasIntuition || 3.0;
    const wL = biasLogic / total;
    const wP = biasPhysics / total;
    const wI = biasIntuition / total;
    const x = wL * vLeft.x + wP * vTop.x + wI * vRight.x;
    const y = wL * vLeft.y + wP * vTop.y + wI * vRight.y;
    return { x, y, wL, wP, wI };
  }, [biasLogic, biasPhysics, biasIntuition]);

  // Handle Simplex coordinate conversion
  const handleSimplexInteraction = (clientX: number, clientY: number) => {
    if (!svgSimplexRef.current) return;
    const rect = svgSimplexRef.current.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * 260;
    const py = ((clientY - rect.top) / rect.height) * 220;

    // Barycentric Coordinates Inversion for Triangle (vTop, vLeft, vRight)
    const detT = (vLeft.y - vRight.y) * (vTop.x - vRight.x) + (vRight.x - vLeft.x) * (vTop.y - vRight.y);
    let wP = ((vLeft.y - vRight.y) * (px - vRight.x) + (vRight.x - vLeft.x) * (py - vRight.y)) / detT;
    let wL = ((vRight.y - vTop.y) * (px - vRight.x) + (vTop.x - vRight.x) * (py - vRight.y)) / detT;
    let wI = 1.0 - wP - wL;

    // Clamp coordinates inside simplex continuously
    wP = Math.max(0.05, Math.min(0.90, wP));
    wL = Math.max(0.05, Math.min(0.90, wL));
    wI = Math.max(0.05, Math.min(0.90, wI));
    const sumW = wP + wL + wI;
    const normP = wP / sumW;
    const normL = wL / sumW;
    const normI = wI / sumW;

    // Map to continuous bias values [0.3 - 4.5]
    setBiasPhysics(parseFloat((normP * 3.0).toFixed(2)));
    setBiasLogic(parseFloat((normL * 3.0).toFixed(2)));
    setBiasIntuition(parseFloat((normI * 3.0).toFixed(2)));
  };

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
      crossCovariance: fusionResult.crossCovariance,
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

  // Backtesting simulator state
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

    setTimeout(() => setStep(2), 400);
    setTimeout(() => setStep(3), 800);
    setTimeout(() => setStep(4), 1200);

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
    }, 1600);
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

  const runBacktest = () => {
    audioEngine.play("click");
    if (history.length < 6) {
      showToast("Historique insuffisant pour rétrocalculer.", "error");
      return;
    }
    setIsBacktesting(true);

    setTimeout(() => {
      const simulatedHistory = history.slice(1);
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
        return <Cpu size={12} className="text-emerald-400" />;
      case "quantum":
        return <Zap size={12} className="text-purple-400" />;
      case "oracle":
        return <Brain size={12} className="text-amber-400" />;
      default:
        return <Activity size={12} className="text-slate-400" />;
    }
  };

  const applySimplexPreset = (logic: number, physics: number, intuition: number) => {
    audioEngine.play("click");
    setBiasLogic(logic);
    setBiasPhysics(physics);
    setBiasIntuition(intuition);
  };

  return (
    <div className="space-y-10 animate-fade-in pb-20 w-full overflow-hidden">
      {/* Header / Hero Control */}
      <div className="bg-slate-900 border border-indigo-500/20 p-8 rounded-3xl shadow-2xl relative overflow-hidden text-center group">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-pulse-slow"></div>
        <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

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
              Vectorielle & Fusion
            </span>
          </h2>
          <p className="text-slate-400 text-xs md:text-sm font-medium max-w-xl mx-auto mb-8 leading-relaxed">
            Agrégation multi-capteurs des signaux{" "}
            <strong className="text-emerald-400">Logiques</strong> (Python EMA),{" "}
            <strong className="text-purple-400">Physiques</strong> (Spectre Ondulatoire) et{" "}
            <strong className="text-amber-400">Intuitifs</strong> (Markov Oracle) sous filtre de Kalman tensoriel et matrice de Fisher.
          </p>

          {/* Algorithm Mode Switcher */}
          <div className="max-w-2xl mx-auto bg-slate-950/80 p-1.5 rounded-2xl border border-white/5 mb-8 grid grid-cols-2 sm:grid-cols-4 gap-1">
            <button
              type="button"
              onClick={() => setSelectionMethod("quantum_bayesian")}
              className={`py-3 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-1.5 ${selectionMethod === "quantum_bayesian" ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/20" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
            >
              <Flame size={12} className="text-amber-300" />
              <span>Symbiose Q-Bayes</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectionMethod("harmonic_consensus")}
              className={`py-3 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-1.5 ${selectionMethod === "harmonic_consensus" ? "bg-indigo-600 text-white shadow-lg ring-1 ring-white/20" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
            >
              <Binary size={12} />
              <span>Harmonique</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectionMethod("balanced")}
              className={`py-3 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-1.5 ${selectionMethod === "balanced" ? "bg-indigo-600 text-white shadow-lg ring-1 ring-white/20" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
            >
              <Layers size={12} />
              <span>Shannon Balance</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectionMethod("map")}
              className={`py-3 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-1.5 ${selectionMethod === "map" ? "bg-indigo-600 text-white shadow-lg ring-1 ring-white/20" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
            >
              <Activity size={12} />
              <span>MAP Greedy</span>
            </button>
          </div>

          <button
            onClick={handleFusion}
            disabled={isFusing}
            className="px-10 py-5 bg-white text-slate-900 hover:bg-indigo-50 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-[0_0_40px_rgba(255,255,255,0.2)] flex items-center justify-center gap-3 mx-auto transition-all active:scale-95 disabled:opacity-50 min-w-[260px] group relative overflow-hidden"
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
              {isFusing ? "Convergence en cours..." : "Calculer la Fusion"}
            </span>
          </button>
        </div>
      </div>

      {/* Interactive Ternary Simplex & Calibration Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Ternary Simplex Interactive Canvas */}
        <div className="lg:col-span-5 bg-slate-900/80 p-6 md:p-8 rounded-3xl border border-white/5 flex flex-col justify-between space-y-6">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex items-center gap-2">
              <Hexagon size={18} className="text-purple-400" />
              <h3 className="text-sm font-black uppercase tracking-widest text-white">
                Simplex Ternaire de Fusion Δ²
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-1 rounded-md">
              Barycentre Interactif
            </span>
          </div>

          {/* SVG Interactive Ternary Triangle */}
          <div className="relative flex items-center justify-center py-2">
            <svg
              ref={svgSimplexRef}
              viewBox="0 0 260 220"
              className="w-full max-w-[280px] h-auto cursor-crosshair select-none"
              onMouseDown={(e) => {
                setIsDraggingSimplex(true);
                handleSimplexInteraction(e.clientX, e.clientY);
              }}
              onMouseMove={(e) => {
                if (isDraggingSimplex) handleSimplexInteraction(e.clientX, e.clientY);
              }}
              onMouseUp={() => setIsDraggingSimplex(false)}
              onMouseLeave={() => setIsDraggingSimplex(false)}
              onTouchMove={(e) => {
                if (e.touches.length > 0) {
                  handleSimplexInteraction(e.touches[0].clientX, e.touches[0].clientY);
                }
              }}
            >
              <defs>
                <linearGradient id="simplexGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                  <stop offset="50%" stopColor="#a855f7" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.25" />
                </linearGradient>
              </defs>

              {/* Equilateral Simplex Polygon */}
              <polygon
                points={`${vTop.x},${vTop.y} ${vLeft.x},${vLeft.y} ${vRight.x},${vRight.y}`}
                fill="url(#simplexGradient)"
                stroke="#6366f1"
                strokeWidth="2"
                strokeDasharray="4 2"
                className="transition-all"
              />

              {/* Grid isoclines from vertices to opposite sides */}
              <line x1={vTop.x} y1={vTop.y} x2={130} y2={195} stroke="#ffffff" strokeOpacity="0.1" strokeWidth="1" />
              <line x1={vLeft.x} y1={vLeft.y} x2={182.5} y2={107.5} stroke="#ffffff" strokeOpacity="0.1" strokeWidth="1" />
              <line x1={vRight.x} y1={vRight.y} x2={77.5} y2={107.5} stroke="#ffffff" strokeOpacity="0.1" strokeWidth="1" />

              {/* Connecting line to centroid */}
              <line x1={vTop.x} y1={vTop.y} x2={currentSimplexPoint.x} y2={currentSimplexPoint.y} stroke="#a855f7" strokeWidth="1.5" strokeOpacity="0.4" />
              <line x1={vLeft.x} y1={vLeft.y} x2={currentSimplexPoint.x} y2={currentSimplexPoint.y} stroke="#10b981" strokeWidth="1.5" strokeOpacity="0.4" />
              <line x1={vRight.x} y1={vRight.y} x2={currentSimplexPoint.x} y2={currentSimplexPoint.y} stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.4" />

              {/* Interactive Centroid Marker */}
              <circle
                cx={currentSimplexPoint.x}
                cy={currentSimplexPoint.y}
                r="8"
                fill="#ffffff"
                stroke="#6366f1"
                strokeWidth="3"
                className="shadow-lg filter drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]"
              />

              {/* Vertices Nodes */}
              <circle cx={vTop.x} cy={vTop.y} r="5" fill="#a855f7" />
              <circle cx={vLeft.x} cy={vLeft.y} r="5" fill="#10b981" />
              <circle cx={vRight.x} cy={vRight.y} r="5" fill="#f59e0b" />

              {/* Labels */}
              <text x={vTop.x} y={vTop.y - 8} fill="#c084fc" fontSize="9" fontWeight="900" textAnchor="middle">PHYSIQUE ({(currentSimplexPoint.wP * 100).toFixed(0)}%)</text>
              <text x={vLeft.x} y={vLeft.y + 16} fill="#34d399" fontSize="9" fontWeight="900" textAnchor="middle">LOGIQUE ({(currentSimplexPoint.wL * 100).toFixed(0)}%)</text>
              <text x={vRight.x} y={vRight.y + 16} fill="#fbbf24" fontSize="9" fontWeight="900" textAnchor="middle">INTUITION ({(currentSimplexPoint.wI * 100).toFixed(0)}%)</text>
            </svg>
          </div>

          {/* Simplex Quick Presets */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={() => applySimplexPreset(1.0, 1.0, 1.0)}
              className="p-2 bg-slate-950/60 hover:bg-slate-800 rounded-xl text-[9px] font-black uppercase tracking-wider text-slate-300 border border-white/5 transition-all text-center"
            >
              ⚖️ Équilibre Parfait
            </button>
            <button
              onClick={() => applySimplexPreset(2.5, 0.6, 0.6)}
              className="p-2 bg-emerald-950/30 hover:bg-emerald-900/50 rounded-xl text-[9px] font-black uppercase tracking-wider text-emerald-400 border border-emerald-500/20 transition-all text-center"
            >
              💻 Logique Pure
            </button>
            <button
              onClick={() => applySimplexPreset(0.6, 2.5, 0.6)}
              className="p-2 bg-purple-950/30 hover:bg-purple-900/50 rounded-xl text-[9px] font-black uppercase tracking-wider text-purple-400 border border-purple-500/20 transition-all text-center"
            >
              ⚡ Résonance Ondes
            </button>
            <button
              onClick={() => applySimplexPreset(0.6, 0.6, 2.5)}
              className="p-2 bg-amber-950/30 hover:bg-amber-900/50 rounded-xl text-[9px] font-black uppercase tracking-wider text-amber-400 border border-amber-500/20 transition-all text-center"
            >
              🔮 Oracle Markov
            </button>
          </div>
        </div>

        {/* Sliders & Cross-Covariance Information Matrix */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900/60 p-6 md:p-8 rounded-3xl border border-white/5 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-indigo-400" />
                <h3 className="text-sm font-black uppercase tracking-widest text-white">
                  Gains des Capteurs & Matrice d'Information
                </h3>
              </div>
              <button
                onClick={() => applySimplexPreset(1.0, 1.0, 1.0)}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/5 px-2.5 py-1 rounded-md border border-indigo-500/10"
              >
                Reset 1.0x
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Logic (Python) Bias */}
              <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-emerald-400 flex items-center gap-1.5 uppercase">
                    <Cpu size={14} /> Logique
                  </span>
                  <span className="font-mono text-emerald-300">{biasLogic.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="4.0"
                  step="0.05"
                  value={biasLogic}
                  onChange={(e) => setBiasLogic(parseFloat(e.target.value))}
                  className="w-full h-1.5 rounded-full bg-slate-800 accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Physics (Quantum Spectral) Bias */}
              <div className="p-4 bg-purple-500/5 rounded-2xl border border-purple-500/10 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-purple-400 flex items-center gap-1.5 uppercase">
                    <Zap size={14} /> Physique
                  </span>
                  <span className="font-mono text-purple-300">{biasPhysics.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="4.0"
                  step="0.05"
                  value={biasPhysics}
                  onChange={(e) => setBiasPhysics(parseFloat(e.target.value))}
                  className="w-full h-1.5 rounded-full bg-slate-800 accent-purple-500 cursor-pointer"
                />
              </div>

              {/* Intuition (Oracle) Bias */}
              <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-amber-400 flex items-center gap-1.5 uppercase">
                    <Brain size={14} /> Intuition
                  </span>
                  <span className="font-mono text-amber-300">{biasIntuition.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="4.0"
                  step="0.05"
                  value={biasIntuition}
                  onChange={(e) => setBiasIntuition(parseFloat(e.target.value))}
                  className="w-full h-1.5 rounded-full bg-slate-800 accent-amber-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Real-Time Cross-Covariance & Fisher Info Bar */}
            <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/5 space-y-3">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span className="flex items-center gap-1.5 text-indigo-300">
                  <Binary size={12} /> Réduction d'Incertitude (Gain de Fisher ΔI)
                </span>
                <span className="font-mono text-emerald-400 font-bold">
                  +{fusionResult?.crossCovariance?.fisherGain ?? "1.42"} nats
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-slate-400">
                <div className="p-2 bg-slate-900/60 rounded-lg border border-white/5 flex justify-between">
                  <span className="text-slate-500">Cov(L, P):</span>
                  <span className="text-indigo-300">{fusionResult?.crossCovariance?.covLP ?? "0.18"}</span>
                </div>
                <div className="p-2 bg-slate-900/60 rounded-lg border border-white/5 flex justify-between">
                  <span className="text-slate-500">Cov(L, I):</span>
                  <span className="text-indigo-300">{fusionResult?.crossCovariance?.covLI ?? "0.24"}</span>
                </div>
                <div className="p-2 bg-slate-900/60 rounded-lg border border-white/5 flex justify-between">
                  <span className="text-slate-500">Cov(P, I):</span>
                  <span className="text-indigo-300">{fusionResult?.crossCovariance?.covPI ?? "0.19"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Fast Backtesting Validation Card */}
          <div className="bg-slate-900/80 border border-white/5 p-6 rounded-3xl flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-rose-400 animate-pulse" />
                <h4 className="text-xs font-black uppercase tracking-widest text-white">
                  Audit Rétro-Chrono Immédiat
                </h4>
              </div>
              <button
                onClick={runBacktest}
                disabled={isBacktesting || history.length < 6}
                className="py-1.5 px-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-500/20 transition-all flex items-center gap-1.5"
              >
                {isBacktesting ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                <span>{isBacktesting ? "Simulation..." : "Lancer Audit"}</span>
              </button>
            </div>

            {backtestResult ? (
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-indigo-500/20 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase">Ticket Simulé</div>
                  <div className="flex gap-1 mt-1">
                    {backtestResult.simulatedTicket.map((n) => (
                      <span
                        key={`st-${n}`}
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold text-[10px] border ${backtestResult.hits.includes(n) ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : "bg-slate-800 text-slate-400 border-slate-700"}`}
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-emerald-400 font-mono">
                    {backtestResult.hits.length} / 5
                  </div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">
                    {backtestResult.accuracy}% Hits
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-xs italic">
                Masque le tirage le plus récent pour vérifier si la pondération actuelle de fusion l'aurait correctement intercepté.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Result Presentation */}
      <AnimatePresence>
        {fusionResult && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="bg-slate-900 border border-indigo-500/30 p-8 rounded-3xl shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-6 opacity-5">
              <Layers size={140} />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-8">
              <div className="text-center w-full">
                <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-[0.2em] mb-8 border border-indigo-500/20 shadow-sm">
                  <Hexagon size={12} className="animate-pulse" />{" "}
                  Convergence Stabilisée via {selectionMethod.toUpperCase().replace("_", " ")}
                </div>

                {/* Final 5 Converged Numbers */}
                <div className="flex flex-wrap justify-center gap-4 sm:gap-6 scale-110 mb-8 mx-auto w-full max-w-2xl bg-slate-950/80 p-8 rounded-3xl border border-white/10 shadow-2xl">
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

              {/* Multi-Sensor Diagnostic & Diagnostics Breakdown */}
              <div className="w-full max-w-3xl space-y-8">
                {/* Advanced Kalman & Symbiosis Diagnostics */}
                <div className="bg-slate-950 p-6 rounded-[2rem] border border-white/5 space-y-6">
                  <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-[0.2em] flex items-center gap-2 border-b border-white/5 pb-3">
                    <Calculator size={14} className="text-indigo-400" /> Diagnostics Tensoriels du Filtre Multi-Capteurs
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Logique Column */}
                    <div className="p-3.5 bg-slate-900/60 rounded-xl border border-emerald-500/20 space-y-1 text-xs font-mono">
                      <div className="text-[10px] text-emerald-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                        <Cpu size={12} /> Logique (Python)
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-500">Gain Kalman:</span>
                        <span>{((fusionResult.kalmanGains?.logic || 0) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-500">Variance σ²:</span>
                        <span>{(fusionResult.variances?.logic || 0).toFixed(1)}</span>
                      </div>
                    </div>

                    {/* Physique Column */}
                    <div className="p-3.5 bg-slate-900/60 rounded-xl border border-purple-500/20 space-y-1 text-xs font-mono">
                      <div className="text-[10px] text-purple-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                        <Zap size={12} /> Physique (Spectral)
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-500">Gain Kalman:</span>
                        <span>{((fusionResult.kalmanGains?.physics || 0) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-500">Variance σ²:</span>
                        <span>{(fusionResult.variances?.physics || 0).toFixed(1)}</span>
                      </div>
                    </div>

                    {/* Intuition Column */}
                    <div className="p-3.5 bg-slate-900/60 rounded-xl border border-amber-500/20 space-y-1 text-xs font-mono">
                      <div className="text-[10px] text-amber-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                        <Brain size={12} /> Intuition (Oracle)
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-500">Gain Kalman:</span>
                        <span>{((fusionResult.kalmanGains?.intuition || 0) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-500">Variance σ²:</span>
                        <span>{(fusionResult.variances?.intuition || 0).toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Per-Ball Tri-Vector Contribution Breakdown */}
                <div className="bg-slate-950 p-6 rounded-[2rem] border border-white/5 space-y-4">
                  <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-[0.2em] flex items-center gap-2">
                    <Activity size={14} /> Dissection Tri-Vectorielle des 5 Numéros Retenus
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {fusionResult.convergedNumbers
                      .filter((cn) => fusionResult.finalTicket.includes(cn.number))
                      .map((cn) => {
                        const pScore = parseFloat((cn.details as any)?.P || "0");
                        const qScore = parseFloat((cn.details as any)?.Q || "0");
                        const oScore = parseFloat((cn.details as any)?.O || "0");
                        const totalScore = pScore + qScore + oScore || 1;
                        const pPct = (pScore / totalScore) * 100;
                        const qPct = (qScore / totalScore) * 100;
                        const oPct = (oScore / totalScore) * 100;

                        return (
                          <div
                            key={cn.number}
                            className="p-4 bg-slate-900/80 rounded-2xl border border-white/5 space-y-2.5"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <span className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-mono font-black text-sm border border-indigo-500/30">
                                  {cn.number}
                                </span>
                                <div className="flex gap-1">
                                  {cn.sources.map((src) => (
                                    <span key={src} className="p-1 bg-slate-800 rounded-md">
                                      {getSourceIcon(src)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <span className="text-xs font-mono font-black text-white">
                                {Math.round(cn.score)} pts
                              </span>
                            </div>

                            {/* Triple Progress Bar for P, Q, O */}
                            <div className="flex h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                              <div style={{ width: `${pPct}%` }} className="bg-emerald-500 h-full" title={`Logique: ${pPct.toFixed(0)}%`} />
                              <div style={{ width: `${qPct}%` }} className="bg-purple-500 h-full" title={`Physique: ${qPct.toFixed(0)}%`} />
                              <div style={{ width: `${oPct}%` }} className="bg-amber-500 h-full" title={`Intuition: ${oPct.toFixed(0)}%`} />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Ticket X-Ray Inspection */}
                <TicketXRay
                  numbers={fusionResult.finalTicket}
                  score={fusionResult.confidence}
                  showTitle={false}
                />

                {/* Actions Button Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={() => handleCopyTicket(fusionResult.finalTicket)}
                    className="py-3.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 border border-white/10"
                  >
                    {isCopied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                    <span>{isCopied ? "Copié !" : "Copier Ticket"}</span>
                  </button>

                  <button
                    onClick={handleExportJSON}
                    className="py-3.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 border border-white/10"
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
