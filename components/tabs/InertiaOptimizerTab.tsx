import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Gauge,
  Cpu,
  Sliders,
  Play,
  Award,
  RotateCcw,
  ShieldCheck,
  Waves,
  Info,
  Target,
  Compass,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  History,
  Zap,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { audioEngine } from "../../utils/audioEngine";
import { useToast } from "../ui/Toast";
import { saveTicket } from "../../services/userPreferencesService";
import {
  computeSystemInertiaMetrics,
  computeInertiaVectorScores,
  resolveOptimizedInertiaVector,
  runDeterministicInertiaBacktest,
  SystemInertiaMetrics,
  InertiaOscillatorScore,
  InertiaResolvedVector,
  InertiaBacktestResult,
} from "../../services/prediction/systemInertiaEngine";

// Custom Type-Safe Tooltip for the Phase Portrait
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-950/95 text-white p-4 rounded-2xl border border-cyan-500/20 shadow-2xl backdrop-blur-md text-[10px] space-y-1.5 font-mono max-w-[240px]">
        <div className="flex items-center justify-between">
          <p className="font-sans font-black text-xs text-cyan-400 flex items-center gap-1.5">
            <Target size={13} className="text-cyan-400" />
            Numéro {String(data.num).padStart(2, "0")}
          </p>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 font-bold">
            Z = {data.zScore > 0 ? `+${data.zScore}` : data.zScore}
          </span>
        </div>
        <div className="h-px bg-white/10 my-1" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
          <span className="text-slate-400">Score d'Inertie :</span>
          <span className="text-right font-black text-cyan-300">
            {data.score}%
          </span>
          <span className="text-slate-400">Potentiel U(g) :</span>
          <span className="text-right text-slate-200">{data.x}</span>
          <span className="text-slate-400">Attraction A(f) :</span>
          <span className="text-right text-slate-200">{data.y}</span>
          <span className="text-slate-400">Cohérence C(H) :</span>
          <span className="text-right text-indigo-300">{data.coherence}</span>
          <span className="text-slate-400">Amortiss. Δ(ζ) :</span>
          <span className="text-right text-pink-400">{data.damping}</span>
        </div>
      </div>
    );
  }
  return null;
};

export const InertiaOptimizerTab: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalRegime = useNexusStore((state) => state.regime);

  // Interactive cybernetic calibration state variables
  const [viscosityGain, setViscosityGain] = useState<number>(1.0);
  const [massGain, setMassGain] = useState<number>(1.0);
  const [couplingGain, setCouplingGain] = useState<number>(1.0);
  const [dampingRatio, setDampingRatio] = useState<number>(0.5); // ζ: Physical damping coefficient

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedVector, setOptimizedVector] = useState<InertiaResolvedVector | null>(null);

  // Backtesting stats state for retroactive audits
  const [isBacktesting, setIsBacktesting] = useState<boolean>(false);
  const [backtestStats, setBacktestStats] = useState<InertiaBacktestResult | null>(null);

  // Reset results when draw parameters are updated (Tirage Isolation rule)
  useEffect(() => {
    setOptimizedVector(null);
    setBacktestStats(null);
  }, [drawName]);

  const hurst = globalRegime?.hurst ?? 0.5;

  // 100% Deterministic Statistical Computation based on the active history (Tirage Isolation)
  const computedMetrics: SystemInertiaMetrics = useMemo(() => {
    return computeSystemInertiaMetrics(history, drawName, hurst);
  }, [history, drawName, hurst]);

  const currentModifiers = useMemo(() => ({
    viscosityGain,
    massGain,
    couplingGain,
    dampingRatio,
  }), [viscosityGain, massGain, couplingGain, dampingRatio]);

  // High fidelity phase space coordinate dataset for Recharts
  const oscillatorScores: InertiaOscillatorScore[] = useMemo(() => {
    return computeInertiaVectorScores(computedMetrics, currentModifiers);
  }, [computedMetrics, currentModifiers]);

  const scatterData = useMemo(() => {
    return oscillatorScores.map((item) => ({
      num: item.num,
      x: item.restoringPotential, // Restoring Potential mapped horizontally
      y: item.phaseAttraction,    // Phase Attraction mapped vertically
      score: item.score,
      coherence: item.fractalCoherence,
      damping: item.dampingCorrection,
      zScore: item.zScore,
      action: item.hamiltonianAction,
    }));
  }, [oscillatorScores]);

  // Cybernetic Calibration Presets
  const applyPreset = useCallback((type: "neutral" | "trend" | "critical" | "underdamped") => {
    audioEngine.play("click");
    switch (type) {
      case "neutral":
        setViscosityGain(1.0);
        setMassGain(1.0);
        setCouplingGain(1.0);
        setDampingRatio(0.5);
        showToast("Profil appliqué : Équilibre Harmonique Standard", "info");
        break;
      case "trend":
        setViscosityGain(1.75);
        setMassGain(1.5);
        setCouplingGain(0.7);
        setDampingRatio(0.35);
        showToast("Profil appliqué : Persistance Forte (Suivi de Tendance)", "info");
        break;
      case "critical":
        setViscosityGain(0.8);
        setMassGain(1.0);
        setCouplingGain(1.6);
        setDampingRatio(1.0);
        showToast("Profil appliqué : Amortissement Critique (Anti-Dispersion)", "info");
        break;
      case "underdamped":
        setViscosityGain(1.2);
        setMassGain(1.8);
        setCouplingGain(1.2);
        setDampingRatio(0.2);
        showToast("Profil appliqué : Sous-Amorti (Résonance Cyclique)", "info");
        break;
    }
  }, [showToast]);

  // Handle complete, deterministic system optimization calculations
  const triggerOptimization = () => {
    if (history.length < 10) {
      showToast(
        "Historique insuffisant pour calibrer l'inertie stochastique (min. 10 tirages requis).",
        "error",
      );
      audioEngine.play("error");
      return;
    }

    audioEngine.play("scan");
    setIsOptimizing(true);

    const calcTimeout = Math.max(
      600,
      Math.round(computedMetrics.shannonEntropyNormalized * 1200),
    );

    setTimeout(() => {
      const resolved = resolveOptimizedInertiaVector(oscillatorScores, computedMetrics);
      setOptimizedVector(resolved);
      setIsOptimizing(false);
      audioEngine.play("success");
      showToast("Optimisation de l'inertie de système achevée.", "success");
    }, calcTimeout);
  };

  // Advanced retroactive backtesting simulation (Time-Machine simulation)
  const runInertiaBacktest = async () => {
    audioEngine.play("click");
    if (history.length < 12) {
      showToast(
        "Dataset insuffisant pour rétropoler l'inertie (min. 12 tirages requis).",
        "error",
      );
      return;
    }

    setIsBacktesting(true);
    audioEngine.play("loading");

    try {
      await new Promise((r) => setTimeout(r, 900));
      const result = await runDeterministicInertiaBacktest(
        history,
        drawName,
        currentModifiers,
        hurst
      );
      setBacktestStats(result);
      audioEngine.play("success");
      showToast(
        `Rétro-audit de l'inertie complété sur ${result.trials} tirages virtuels.`,
        "success",
      );
    } catch (err: any) {
      showToast("Échec du rétro-audit : " + err.message, "error");
    } finally {
      setIsBacktesting(false);
    }
  };

  const handleSavePrimaryTicket = async () => {
    if (!optimizedVector) return;
    audioEngine.play("click");
    try {
      await saveTicket({
        numbers: optimizedVector.primary,
        drawName,
        strategy: `Inertie Système Optimisée (${optimizedVector.globalStability}%)`,
      });
      audioEngine.play("success");
      showToast("Ticket d'inertie optimal mémorisé avec succès.", "success");
    } catch (e) {
      showToast("Erreur lors de l'enregistrement.", "error");
    }
  };

  const resetControls = () => {
    audioEngine.play("click");
    setViscosityGain(1.0);
    setMassGain(1.0);
    setCouplingGain(1.0);
    setDampingRatio(0.5);
    setOptimizedVector(null);
    setBacktestStats(null);
  };

  return (
    <div className="space-y-6" id="system-inertia-optimizer-root">
      {/* Top Cybernetic Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950/40 p-6 rounded-[2rem] border border-cyan-500/20 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500/10 rounded-full blur-[90px] pointer-events-none group-hover:bg-cyan-500/15 transition-all duration-700" />
        <div className="absolute -bottom-10 -left-10 w-52 h-52 bg-indigo-500/10 rounded-full blur-[70px] pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/30 shadow-inner">
                <Gauge size={18} className="animate-pulse" />
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400 bg-cyan-500/5 px-2.5 py-1 rounded-md border border-cyan-500/20">
                Moteur Cybernétique du 2nd Ordre
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-white/5">
                N_max = {computedMetrics.safeMaxNum}
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
              Inertie Système &amp; Oscillateurs Amortis
            </h2>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Résolution différentielle continue des potentiels de renouvellement de Poisson, de l'impulsion cinétique et des équations harmoniques d'amortissement sur{" "}
              <span className="text-cyan-300 font-bold">{drawName}</span>.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 w-full lg:w-auto">
            <button
              id="btn-trigger-inertia-backtest"
              onClick={runInertiaBacktest}
              disabled={isBacktesting || isOptimizing}
              className="flex-1 lg:flex-none px-5 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2.5 border border-white/10 transition-all disabled:opacity-50 active:scale-95 cursor-pointer shadow-lg"
            >
              {isBacktesting ? (
                <>
                  <RotateCcw size={14} className="animate-spin text-pink-400" />
                  <span>Rétro-audit...</span>
                </>
              ) : (
                <>
                  <History size={14} className="text-pink-400" />
                  <span>Rétro-Audit (Time Machine)</span>
                </>
              )}
            </button>

            <button
              id="btn-trigger-inertia-optimizer"
              onClick={triggerOptimization}
              disabled={isOptimizing || isBacktesting}
              className="flex-1 lg:flex-none px-7 py-3.5 bg-gradient-to-r from-cyan-600 via-indigo-600 to-cyan-500 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] shadow-xl shadow-cyan-500/20 border border-cyan-400/30 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isOptimizing ? (
                <>
                  <RotateCcw size={14} className="animate-spin" />
                  <span>Résolution Matricielle...</span>
                </>
              ) : (
                <>
                  <Play size={14} />
                  <span>Résoudre l'Inertie</span>
                </>
              )}
            </button>

            <button
              onClick={resetControls}
              title="Réinitialiser les paramètres"
              className="p-3.5 bg-slate-900/80 text-slate-400 hover:text-white rounded-2xl border border-white/10 flex items-center justify-center transition-colors active:scale-95 cursor-pointer hover:bg-slate-800"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* Presets Row */}
        <div className="mt-5 pt-4 border-t border-white/5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5 font-sans">
            <Zap size={12} className="text-cyan-400" /> Profils Cybernétiques :
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => applyPreset("neutral")}
              className="px-3 py-1 bg-slate-900/80 hover:bg-cyan-950/60 text-slate-300 hover:text-cyan-300 border border-white/10 hover:border-cyan-500/30 rounded-xl text-[9px] font-mono font-bold transition-all"
            >
              Harmonique Neutre (ζ=0.5)
            </button>
            <button
              onClick={() => applyPreset("trend")}
              className="px-3 py-1 bg-slate-900/80 hover:bg-indigo-950/60 text-slate-300 hover:text-indigo-300 border border-white/10 hover:border-indigo-500/30 rounded-xl text-[9px] font-mono font-bold transition-all"
            >
              Persistance &amp; Tendance (α+, β+)
            </button>
            <button
              onClick={() => applyPreset("critical")}
              className="px-3 py-1 bg-slate-900/80 hover:bg-amber-950/60 text-slate-300 hover:text-amber-300 border border-white/10 hover:border-amber-500/30 rounded-xl text-[9px] font-mono font-bold transition-all"
            >
              Amortissement Critique (ζ=1.0)
            </button>
            <button
              onClick={() => applyPreset("underdamped")}
              className="px-3 py-1 bg-slate-900/80 hover:bg-pink-950/60 text-slate-300 hover:text-pink-300 border border-white/10 hover:border-pink-500/30 rounded-xl text-[9px] font-mono font-bold transition-all"
            >
              Sous-Amorti Résonant (ζ=0.2)
            </button>
          </div>
        </div>
      </div>

      {/* Main Operational Dashboard Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Tactical Curves and interactive sliders */}
        <div className="bg-slate-900/40 p-6 rounded-[2rem] border border-white/5 shadow-xl space-y-6 flex flex-col justify-between">
          <div className="space-y-6">
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2 mb-1 font-sans">
                <Sliders size={14} className="text-cyan-400" />
                Coefficients Différentiables d'Inertie
              </h3>
              <p className="text-[10px] text-slate-500 leading-normal">
                Modulation continue des tenseurs de viscosité, de masse et d'amortissement sans bifurcation.
              </p>
            </div>

            <div className="space-y-5">
              {/* Viscosité Temporelle Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-bold text-slate-400 uppercase tracking-wider">
                    Viscosité Temporelle (α-gain)
                  </span>
                  <span className="font-mono text-cyan-400 font-black">
                    {(computedMetrics.alphaViscosity * viscosityGain).toFixed(4)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.20"
                  max="2.50"
                  step="0.05"
                  value={viscosityGain}
                  onChange={(e) => {
                    audioEngine.play("click");
                    setViscosityGain(Number(e.target.value));
                  }}
                  className="w-full h-1.5 bg-slate-800 accent-cyan-500 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-slate-500 uppercase font-mono">
                  <span>Gain : {viscosityGain.toFixed(2)}x</span>
                  <span>Base α : {computedMetrics.alphaViscosity.toFixed(3)}</span>
                </div>
              </div>

              {/* Masse Thermique Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-bold text-slate-400 uppercase tracking-wider">
                    Masse Thermique Hurst (β-gain)
                  </span>
                  <span className="font-mono text-indigo-400 font-black">
                    {(computedMetrics.betaThermalMass * massGain).toFixed(4)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.20"
                  max="2.50"
                  step="0.05"
                  value={massGain}
                  onChange={(e) => {
                    audioEngine.play("click");
                    setMassGain(Number(e.target.value));
                  }}
                  className="w-full h-1.5 bg-slate-800 accent-indigo-500 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-slate-500 uppercase font-mono">
                  <span>Gain : {massGain.toFixed(2)}x</span>
                  <span>Base β : {computedMetrics.betaThermalMass.toFixed(3)}</span>
                </div>
              </div>

              {/* Couplage d'Entropie Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-bold text-slate-400 uppercase tracking-wider">
                    Couplage d'Entropie (γ-gain)
                  </span>
                  <span className="font-mono text-fuchsia-400 font-black">
                    {(computedMetrics.gammaCoupling * couplingGain).toFixed(4)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.20"
                  max="2.50"
                  step="0.05"
                  value={couplingGain}
                  onChange={(e) => {
                    audioEngine.play("click");
                    setCouplingGain(Number(e.target.value));
                  }}
                  className="w-full h-1.5 bg-slate-800 accent-fuchsia-500 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-slate-500 uppercase font-mono">
                  <span>Gain : {couplingGain.toFixed(2)}x</span>
                  <span>Base γ : {computedMetrics.gammaCoupling.toFixed(3)}</span>
                </div>
              </div>

              {/* Damping Ratio ζ Slider */}
              <div className="space-y-1.5 pt-2 border-t border-white/5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-bold text-pink-400 uppercase tracking-wider flex items-center gap-1">
                    <Waves size={10} className="animate-pulse" /> Amortissement Oscillatoire (ζ)
                  </span>
                  <span
                    className={`font-mono font-black ${
                      Math.abs(dampingRatio - 1.0) < 0.05
                        ? "text-cyan-400"
                        : dampingRatio < 1.0
                        ? "text-emerald-400"
                        : "text-amber-400"
                    }`}
                  >
                    {dampingRatio.toFixed(2)}{" "}
                    {Math.abs(dampingRatio - 1.0) < 0.05
                      ? "(Critique)"
                      : dampingRatio < 1.0
                      ? "(Sous-Amorti)"
                      : "(Sur-Amorti)"}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="2.00"
                  step="0.05"
                  value={dampingRatio}
                  onChange={(e) => {
                    audioEngine.play("click");
                    setDampingRatio(Number(e.target.value));
                  }}
                  className="w-full h-1.5 bg-slate-800 accent-pink-500 rounded-lg cursor-pointer"
                />
                <p className="text-[8px] text-slate-500 leading-normal font-mono">
                  {dampingRatio < 1.0
                    ? "ζ < 1.0 : Régime oscillatoire pseudo-périodique. Cible la résonance cyclique des retours."
                    : Math.abs(dampingRatio - 1.0) < 0.05
                    ? "ζ = 1.0 : Amortissement critique. Convergence optimale sans sur-oscillation."
                    : "ζ > 1.0 : Dissipation thermique continue. Pénalise exponentiellement les grands écarts."}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5 bg-slate-950/40 p-4 rounded-2xl space-y-2">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Info size={12} className="text-cyan-500" />
              <span className="text-[9px] font-black uppercase tracking-wider font-sans">
                Invariants Physiques Découverts
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-slate-400">
              <div>
                Pulsation ω₀ : <strong className="text-slate-200">{computedMetrics.naturalFrequencyOmega0.toFixed(3)} rad</strong>
              </div>
              <div>
                Entropie S_H : <strong className="text-slate-200">{(computedMetrics.shannonEntropyNormalized * 100).toFixed(1)}%</strong>
              </div>
              <div>
                Écart Moyen μ_g : <strong className="text-slate-200">{computedMetrics.meanGap.toFixed(1)}</strong>
              </div>
              <div>
                Hurst H : <strong className="text-slate-200">{computedMetrics.baseHurst.toFixed(3)}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Interactive phase space portrait map */}
        <div className="bg-slate-900/40 p-6 rounded-[2rem] border border-white/5 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2 mb-1 font-sans">
                <Compass size={14} className="text-cyan-400" />
                Portrait d'Espace de Phase [U(g) vs A(f)]
              </h3>
              <p className="text-[10px] text-slate-500 leading-normal">
                Projection 2D des attracteurs d'inertie : Potentiel de renouvellement $U_n$ (axe X) vs Attraction de phase $A_n$ (axe Y).
              </p>
            </div>

            {/* Interactive Recharts Scatter plot */}
            <div className="h-[220px] w-full mt-2 relative">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 10, right: 10, bottom: 20, left: -20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.03)"
                  />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Potentiel U(g)"
                    domain={[0, 1]}
                    stroke="#475569"
                    style={{ fontSize: 8, fontFamily: "monospace" }}
                    tickFormatter={(v) => `U:${v.toFixed(1)}`}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Attraction A(f)"
                    domain={[0, 1]}
                    stroke="#475569"
                    style={{ fontSize: 8, fontFamily: "monospace" }}
                    tickFormatter={(v) => `A:${v.toFixed(1)}`}
                  />
                  <RechartsTooltip
                    cursor={{
                      strokeDasharray: "3 3",
                      stroke: "rgba(6,182,212,0.2)",
                    }}
                    content={<CustomTooltip />}
                  />
                  <Scatter name="Oscillateurs d'Inertie" data={scatterData}>
                    {scatterData.map((entry) => {
                      const isPrimary = optimizedVector?.primary.includes(entry.num);
                      const isSecondary = optimizedVector?.secondary.includes(entry.num);

                      let color = "rgba(100, 116, 139, 0.45)";
                      let radius = 4;

                      if (isPrimary) {
                        color = "#06b6d4"; // Cyan Primaire
                        radius = 9;
                      } else if (isSecondary) {
                        color = "#818cf8"; // Indigo Secondaire
                        radius = 6.5;
                      } else if (entry.score > 70) {
                        color = "rgba(236, 72, 153, 0.5)";
                        radius = 5.5;
                      }

                      return (
                        <Cell
                          key={`ball-cell-${entry.num}`}
                          fill={color}
                          r={radius}
                          className="transition-all duration-300 cursor-pointer hover:stroke-white hover:stroke-1"
                        />
                      );
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <div className="absolute top-2 right-2 flex gap-3 text-[8px] font-mono select-none bg-slate-950/80 px-2 py-1 rounded-lg border border-white/5">
                <span className="flex items-center gap-1 text-cyan-300">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" /> Primaire
                </span>
                <span className="flex items-center gap-1 text-indigo-300">
                  <span className="w-2 h-2 rounded-full bg-indigo-400" /> Couverture
                </span>
              </div>
            </div>
          </div>

          <p className="text-[9px] text-slate-500 text-center leading-normal mt-2 italic font-mono">
            Survolez un oscillateur pour extraire sa signature de rappel, son Z-score et son action hamiltonienne.
          </p>
        </div>

        {/* 3. Output results side panel */}
        <div className="bg-slate-900/40 p-6 rounded-[2rem] border border-white/5 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2 mb-1 font-sans">
              <Sparkles size={14} className="text-amber-400" />
              Résolution du Vecteur Stationnaire
            </h3>
            <p className="text-[10px] text-slate-500 leading-normal mb-4">
              Extrema d'action hamiltonienne résolus sur l'espace d'états d'inertie.
            </p>
          </div>

          <AnimatePresence mode="wait">
            {isOptimizing ? (
              <motion.div
                key="optimizing-loader"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="my-auto flex flex-col items-center justify-center p-6 text-center"
              >
                <div className="relative mb-4">
                  <div className="w-12 h-12 rounded-full border border-cyan-500/20 animate-ping absolute inset-0" />
                  <div className="w-12 h-12 rounded-full border-t-2 border-r-2 border-cyan-500 animate-spin relative flex items-center justify-center">
                    <Waves className="text-cyan-400" size={16} />
                  </div>
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Résolution différentielle continue...
                </p>
              </motion.div>
            ) : optimizedVector ? (
              <motion.div
                key="optimized-results"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Primary Balls */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black uppercase text-cyan-400 tracking-wider">
                      Vecteur Primaire (5 Numéros)
                    </span>
                    <span className="text-[8px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-500/20 px-2 py-0.5 rounded font-bold">
                      STABILITÉ : {optimizedVector.globalStability}%
                    </span>
                  </div>
                  <div className="flex justify-center gap-2.5 py-2">
                    {optimizedVector.primary.map((num) => (
                      <div
                        key={`prime-ball-${num}`}
                        className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-b from-cyan-950 via-slate-900 to-slate-950 border border-cyan-500 flex items-center justify-center shadow-lg relative group transition-transform hover:scale-110 cursor-pointer"
                      >
                        <div className="absolute inset-px rounded-full bg-cyan-500/10 animate-pulse" />
                        <span className="text-sm font-black text-white group-hover:text-cyan-300 font-mono">
                          {String(num).padStart(2, "0")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Secondary coverage numbers list */}
                <div className="space-y-1.5 pt-2 border-t border-white/5">
                  <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider block">
                    Amortissements de Couverture (10 Numéros)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {optimizedVector.secondary.map((num) => (
                      <span
                        key={`sec-badge-${num}`}
                        className="text-[10px] font-mono font-bold px-2 py-0.5 bg-slate-950/80 border border-white/5 text-indigo-200 rounded-md"
                      >
                        {String(num).padStart(2, "0")}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5 flex flex-col gap-2">
                  <div className="text-[8px] font-mono text-slate-400 bg-black/40 p-2 rounded-lg border border-white/5 select-all overflow-x-auto">
                    <code>{optimizedVector.equationUsed}</code>
                  </div>
                  <button
                    onClick={handleSavePrimaryTicket}
                    className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer shadow-lg shadow-cyan-500/10"
                  >
                    <ShieldCheck size={13} />
                    <span>Mémoriser le Ticket d'Inertie</span>
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="my-auto flex flex-col items-center justify-center p-6 text-center border border-dashed border-white/10 rounded-2xl"
              >
                <Sliders
                  size={24}
                  className="text-slate-600 mb-2 animate-bounce-slow"
                />
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block font-sans">
                  Inertie non résolue
                </span>
                <span className="text-[9px] text-slate-500 max-w-[200px] mt-1 block">
                  Cliquez sur "Résoudre l'Inertie" pour projeter les équations différentielles sur l'espace d'états.
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Backtesting Dashboard display */}
      <AnimatePresence>
        {backtestStats && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="bg-slate-900/80 backdrop-blur-md rounded-[2rem] p-6 border border-cyan-500/20 space-y-6 shadow-2xl"
          >
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h4 className="text-xs font-black text-pink-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                  <CheckCircle2 size={15} /> Rétro-Audit Temporel de l'Inertie (Time Machine)
                </h4>
                <p className="text-[10px] text-slate-400 mt-0.5 font-sans">
                  Évaluation empirique rétroactive étape par étape sur les{" "}
                  <strong>{backtestStats.trials}</strong> tirages réels précédents sans biais prospectif.
                </p>
              </div>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setBacktestStats(null);
                }}
                className="text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider font-mono px-3 py-1 bg-slate-950/60 rounded-lg hover:bg-slate-950 border border-white/10 cursor-pointer"
              >
                Fermer le Diagnostic
              </button>
            </div>

            {/* Backtest Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Summary Card */}
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 space-y-3 flex flex-col justify-between">
                <div>
                  <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider block">
                    Performance Empirique
                  </span>
                  <h5 className="text-lg font-black text-white tracking-tight mt-0.5">
                    Validation Rétro-Active
                  </h5>
                </div>
                <div className="space-y-1.5 bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-slate-400">Taux de Succès (≥1) :</span>
                    <strong className="text-emerald-400 font-black">
                      {backtestStats.successRate}%
                    </strong>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-slate-400">Hits Moyens :</span>
                    <strong className="text-cyan-400 font-black">
                      {backtestStats.primaryHitsAvg} / 5
                    </strong>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-slate-400">Gain vs Hasard :</span>
                    <strong className="text-amber-400 font-black">
                      {backtestStats.empiricalGain}x
                    </strong>
                  </div>
                </div>
                <span className="text-[8px] font-mono text-slate-500 leading-normal block">
                  Rétropolation déterministe isolée respectant la causalité temporelle stricte.
                </span>
              </div>

              {/* Detailed retro events listing */}
              <div className="lg:col-span-3 bg-slate-950/40 p-4 rounded-xl border border-white/5 space-y-3 max-h-[190px] overflow-y-auto">
                <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider block pb-1 border-b border-white/5">
                  Détail Chronologique des Évaluations Rétro-Actives
                </span>
                <div className="space-y-2">
                  {backtestStats.details.map((trial, idx) => (
                    <div
                      key={`ret-tr-${idx}`}
                      className="flex justify-between items-center text-[10px] pb-1.5 border-b border-white/5 last:border-b-0"
                    >
                      <span className="font-bold text-slate-300 font-mono truncate max-w-[120px]">
                        {trial.drawDate}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-mono text-[9px]">
                          Gagnants :
                        </span>
                        <div className="flex gap-1">
                          {trial.winners.map((win: number) => {
                            const isHit = trial.matched.includes(win);
                            return (
                              <span
                                key={`win-node-${win}`}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                                  isHit
                                    ? "bg-cyan-500 text-slate-950 border border-cyan-300 font-black"
                                    : "bg-slate-900 border border-white/5 text-slate-400"
                                }`}
                              >
                                {String(win).padStart(2, "0")}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <span
                        className={`font-mono text-xs font-black ${
                          trial.hits > 0 ? "text-emerald-400" : "text-slate-600"
                        }`}
                      >
                        +{trial.hits} Hit{trial.hits > 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-3.5 bg-pink-500/5 rounded-2xl border border-pink-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between text-[10px] gap-2">
              <span className="text-slate-300 max-w-xl leading-normal">
                L'optimisation énergétique de Fourier et l'asymétrie de phase suggèrent la calibration suivante pour le régime actif :
              </span>
              <span className="font-mono font-black text-pink-400 uppercase tracking-widest bg-pink-500/10 border border-pink-500/30 px-3 py-1.5 rounded-xl">
                ζ_optimal = {backtestStats.bestDamping.toFixed(2)}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
