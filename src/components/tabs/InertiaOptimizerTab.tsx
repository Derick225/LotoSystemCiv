import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gauge,
  Sliders,
  Play,
  RotateCcw,
  ShieldCheck,
  Waves,
  Info,
  Sparkles,
  CheckCircle2,
  History,
  Zap,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";
import { INERTIA_DAMPING_DOMAIN } from "../../services/prediction/systemInertiaEngine";
import { useInertiaCybernetics } from "../../hooks/useInertiaCybernetics";
import { InertiaPhaseSpacePlot } from "../inertia/InertiaPhaseSpacePlot";
import { InertiaTimeMachineReport } from "../inertia/InertiaTimeMachineReport";

export const InertiaOptimizerTab: React.FC<{ drawName: string }> = ({ drawName }) => {
  const {
    viscosityGain,
    massGain,
    couplingGain,
    jaccardGain,
    dampingRatio,
    isOptimizing,
    optimizedVector,
    isBacktesting,
    backtestStats,
    setBacktestStats,
    hurstIsMeasured,
    computedMetrics,
    dampingRegime,
    dampingSweepVerdict,
    scatterData,
    updateAndPersistModifiers,
    applyPreset,
    handleApplyOptimalDamping,
    triggerOptimization,
    runInertiaBacktest,
    resetControls,
    handleSavePrimaryTicket,
    handleSaveSecondaryTicket,
    handleExportToCoveringDesigns,
  } = useInertiaCybernetics(drawName);

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
              <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30 flex items-center gap-1">
                <CheckCircle2 size={11} className="text-cyan-400" />
                Calibration Dédiée : {drawName}
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
              className="px-3 py-1 bg-slate-900/80 hover:bg-cyan-950/60 text-slate-300 hover:text-cyan-300 border border-white/10 hover:border-cyan-500/30 rounded-xl text-[9px] font-mono font-bold transition-all cursor-pointer"
            >
              Harmonique Neutre (ζ=0.5)
            </button>
            <button
              onClick={() => applyPreset("trend")}
              className="px-3 py-1 bg-slate-900/80 hover:bg-indigo-950/60 text-slate-300 hover:text-indigo-300 border border-white/10 hover:border-indigo-500/30 rounded-xl text-[9px] font-mono font-bold transition-all cursor-pointer"
            >
              Persistance &amp; Tendance (α+, β+)
            </button>
            <button
              onClick={() => applyPreset("critical")}
              className="px-3 py-1 bg-slate-900/80 hover:bg-amber-950/60 text-slate-300 hover:text-amber-300 border border-white/10 hover:border-amber-500/30 rounded-xl text-[9px] font-mono font-bold transition-all cursor-pointer"
            >
              Amortissement Critique (ζ=1.0)
            </button>
            <button
              onClick={() => applyPreset("underdamped")}
              className="px-3 py-1 bg-slate-900/80 hover:bg-pink-950/60 text-slate-300 hover:text-pink-300 border border-white/10 hover:border-pink-500/30 rounded-xl text-[9px] font-mono font-bold transition-all cursor-pointer"
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
                    updateAndPersistModifiers({ viscosityGain: Number(e.target.value) });
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
                    updateAndPersistModifiers({ massGain: Number(e.target.value) });
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
                    updateAndPersistModifiers({ couplingGain: Number(e.target.value) });
                  }}
                  className="w-full h-1.5 bg-slate-800 accent-fuchsia-500 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-slate-500 uppercase font-mono">
                  <span>Gain : {couplingGain.toFixed(2)}x</span>
                  <span>Base γ : {computedMetrics.gammaCoupling.toFixed(3)}</span>
                </div>
              </div>

              {/* Couplage Jaccard d'Inertie Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                    <Zap size={10} className="text-emerald-400" /> Couplage Jaccard (δ_J-gain)
                  </span>
                  <span className="font-mono text-emerald-400 font-black">
                    {(computedMetrics.meanJaccardInertia * jaccardGain * 100).toFixed(2)}% ({jaccardGain.toFixed(2)}x)
                  </span>
                </div>
                <input
                  type="range"
                  min="0.20"
                  max="2.50"
                  step="0.05"
                  value={jaccardGain}
                  onChange={(e) => {
                    audioEngine.play("click");
                    updateAndPersistModifiers({ jaccardGain: Number(e.target.value) });
                  }}
                  className="w-full h-1.5 bg-slate-800 accent-emerald-500 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-slate-500 uppercase font-mono">
                  <span>Gain : {jaccardGain.toFixed(2)}x</span>
                  <span>J̄ : {(computedMetrics.meanJaccardInertia * 100).toFixed(2)}% (Ratio {computedMetrics.jaccardInertiaRatio.toFixed(2)}x)</span>
                </div>
              </div>

              {/* Damping Ratio ζ Slider */}
              <div className="space-y-1.5 pt-2 border-t border-white/5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-bold text-pink-400 uppercase tracking-wider flex items-center gap-1">
                    <Waves size={10} className="animate-pulse" /> Amortissement Oscillatoire (ζ)
                  </span>
                  <span className={`font-mono font-black ${dampingRegime.color}`}>
                    {dampingRatio.toFixed(2)} {dampingRegime.label}
                  </span>
                </div>
                <input
                  type="range"
                  min={INERTIA_DAMPING_DOMAIN.min}
                  max={INERTIA_DAMPING_DOMAIN.max}
                  step={INERTIA_DAMPING_DOMAIN.step}
                  value={dampingRatio}
                  onChange={(e) => {
                    audioEngine.play("click");
                    updateAndPersistModifiers({ dampingRatio: Number(e.target.value) });
                  }}
                  className="w-full h-1.5 bg-slate-800 accent-pink-500 rounded-lg cursor-pointer"
                />
                <p className="text-[8px] text-slate-500 leading-normal font-mono">
                  {dampingRegime.note}
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
                Hurst H : <strong className="text-slate-200">{hurstIsMeasured ? computedMetrics.baseHurst.toFixed(3) : "n/d"}</strong>
                {!hurstIsMeasured && (
                  <span className="ml-1 text-slate-500" title="Historique insuffisant (< 10 tirages) pour mesurer l'exposant : le moteur applique le régime neutre H = 0.5 (marche aléatoire).">
                    (neutre)
                  </span>
                )}
              </div>
              <div>
                Jaccard J̄ : <strong className="text-emerald-400 font-bold">{(computedMetrics.meanJaccardInertia * 100).toFixed(2)}%</strong>
              </div>
              <div>
                Ratio Jaccard R_J : <strong className="text-emerald-400 font-bold">{computedMetrics.jaccardInertiaRatio.toFixed(2)}x</strong>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Interactive phase space portrait map (Memoized) */}
        <InertiaPhaseSpacePlot
          scatterData={scatterData}
          optimizedVector={optimizedVector}
        />

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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={handleSavePrimaryTicket}
                      className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer shadow-lg shadow-cyan-500/10"
                    >
                      <ShieldCheck size={13} />
                      <span>Ticket Primaire (5)</span>
                    </button>
                    <button
                      onClick={handleSaveSecondaryTicket}
                      className="w-full py-2.5 bg-indigo-600/80 hover:bg-indigo-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer shadow-lg shadow-indigo-500/10"
                    >
                      <Layers size={13} />
                      <span>Couverture (Top 5)</span>
                    </button>
                  </div>
                  <button
                    onClick={handleExportToCoveringDesigns}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer"
                  >
                    <ArrowUpRight size={13} />
                    <span>Transférer au Réducteur Simplex (Covering)</span>
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

      {/* Backtesting Dashboard display (Memoized Component) */}
      <AnimatePresence>
        {backtestStats && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
          >
            <InertiaTimeMachineReport
              backtestStats={backtestStats}
              drawName={drawName}
              dampingRatio={dampingRatio}
              dampingSweepVerdict={dampingSweepVerdict}
              onClose={() => {
                audioEngine.play("click");
                setBacktestStats(null);
              }}
              onApplyOptimalDamping={handleApplyOptimalDamping}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
