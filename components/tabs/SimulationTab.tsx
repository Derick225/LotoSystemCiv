import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import {
  runSurvivalSimulation,
  BacktestReport,
  BettingStrategy,
} from "../../services/backtestingEngine";
import { LearningService, LearningStatus } from "../../services/learningService";
import {
  Play,
  RefreshCw,
  Trophy,
  PiggyBank,
  ThumbsUp,
  ThumbsDown,
  Activity,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Dna,
  Repeat
} from "lucide-react";
import { ParallelSimulationTab } from "./ParallelSimulationTab";
import { DeterministicReplayInspector } from "../DeterministicReplayInspector";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
  CartesianGrid,
  XAxis,
  YAxis,
  LineChart,
  Line,
  BarChart,
  Bar,
  Legend
} from "recharts";
import { audioEngine } from "../../utils/audioEngine";
import { BacktestingFramework, WalkForwardMetric, MonteCarloResult } from "../../services/backtestingFramework";

export const SimulationTab: React.FC<{ drawName: string }> = React.memo(
  ({ drawName }) => {
    const history = useNexusStore((state) => state.history);
    const globalWeights = useNexusStore((state) => state.globalWeights);
    const setGlobalWeights = useNexusStore((state) => state.setGlobalWeights);
    const nexusLoading = useNexusStore((state) => state.loading);
    const [mode, setMode] = useState<"single" | "comparative" | "walkforward" | "replay">("single");
    const [simulating, setSimulating] = useState(false);
    const [learning, setLearning] = useState(false);
    const [learningResult, setLearningResult] = useState<LearningStatus | null>(null);
    const [progress, setProgress] = useState(0);
    const [report, setReport] = useState<BacktestReport | null>(null);

    // Advanced configurable parameters
    const [strategy, setStrategy] = useState<BettingStrategy>("FLAT");
    const [depth, setDepth] = useState<number>(50);
    const [initialBankroll, setInitialBankroll] = useState<number>(50000);
    const [unitBet, setUnitBet] = useState<number>(200);
    const [payoutModel, setPayoutModel] = useState<string>("LEGACY");

    // Walk Forward Advanced State
    const [wfResults, setWfResults] = useState<Record<string, WalkForwardMetric> | null>(null);
    const [wfRunning, setWfRunning] = useState(false);
    const [wfProgress, setWfProgress] = useState(0);

    // Monte Carlo Advanced State
    const [mcResults, setMcResults] = useState<MonteCarloResult | null>(null);
    const [mcRunning, setMcRunning] = useState(false);

    const isMounted = useRef(true);
    useEffect(() => {
      return () => {
        isMounted.current = false;
      };
    }, []);

    const handleRun = useCallback(async () => {
      if (history.length < 10) return;
      audioEngine.play("click");
      setSimulating(true);
      setReport(null);
      setProgress(0);

      try {
        const result = await runSurvivalSimulation(
          drawName,
          history,
          globalWeights,
          depth,
          strategy,
          (p) => {
            if (isMounted.current) setProgress(p);
          },
          initialBankroll,
          unitBet,
          payoutModel,
        );

        if (isMounted.current) {
          audioEngine.play("success");
          setReport(result);
          setSimulating(false);
          setProgress(100);
        }
      } catch (e) {
        console.error(e);
        audioEngine.play("error");
        if (isMounted.current) setSimulating(false);
      }
    }, [drawName, history, globalWeights, depth, strategy, initialBankroll, unitBet, payoutModel]);

    const handleAutoRegulate = useCallback(async () => {
      audioEngine.play("click");
      setLearning(true);
      setLearningResult(null);
      try {
        // CORRECTION CRITIQUE : on force l'enregistrement de l'amélioration s'il y en a une (force = true)
        const result = await LearningService.triggerAutoLearning(drawName, globalWeights, false, true);
        if (isMounted.current) {
          setLearningResult(result);
          if (result.improvement && result.weights) {
            setGlobalWeights(result.weights);
            audioEngine.play("success");
          } else {
            audioEngine.play("error");
          }
          setLearning(false);
        }
      } catch (e) {
         console.error(e);
         audioEngine.play("error");
         if (isMounted.current) {
           setLearning(false);
           setLearningResult({
             lastRun: new Date().toISOString(),
             improvement: false,
             message: `Échec de l'optimisation cybernétique : ${e instanceof Error ? e.message : String(e)}`,
           });
         }
      }
    }, [drawName, globalWeights, setGlobalWeights]);

    const handleRunWalkForward = useCallback(async () => {
      if (history.length < 10) return;
      audioEngine.play("click");
      setWfRunning(true);
      setWfResults(null);
      setMcResults(null); 
      setWfProgress(0);

      try {
        const results = await BacktestingFramework.runWalkForward(
          drawName,
          history,
          globalWeights,
          depth,
          strategy === "CONFIDENCE_SMART" ? "FLAT" : strategy as any, // fallback standard of Kelly / Martingale / Flat
          initialBankroll,
          unitBet,
          (p) => {
            if (isMounted.current) setWfProgress(p);
          },
          payoutModel
        );

        if (isMounted.current) {
          audioEngine.play("success");
          setWfResults(results);
          setWfRunning(false);
          setWfProgress(100);
        }
      } catch (e) {
        console.error(e);
        audioEngine.play("error");
        if (isMounted.current) setWfRunning(false);
      }
    }, [drawName, history, globalWeights, depth, strategy, initialBankroll, unitBet, payoutModel]);

    const handleRunMonteCarlo = useCallback(() => {
      audioEngine.play("click");
      setMcRunning(true);
      setMcResults(null);

      setTimeout(() => {
        try {
          const results = BacktestingFramework.runMonteCarlo({
            runs: 1000,
            depth,
            initialBankroll,
            unitBet,
            strategyWeights: globalWeights
          });

          if (isMounted.current) {
            audioEngine.play("success");
            setMcResults(results);
            setMcRunning(false);
          }
        } catch (e) {
          console.error(e);
          audioEngine.play("error");
          if (isMounted.current) setMcRunning(false);
        }
      }, 80);
    }, [depth, initialBankroll, unitBet, globalWeights]);

    if (nexusLoading)
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
          <Activity className="text-indigo-500 animate-spin" size={48} />
          <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">
            Synchronisation Temporelle...
          </p>
        </div>
      );

    return (
      <div className="space-y-8 animate-fade-in pb-16 w-full">
        {/* Mode Switcher */}
        <div className="flex justify-center mb-4">
          <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 shadow-inner overflow-x-auto max-w-full">
            <button
              onClick={() => {
                audioEngine.play("click");
                setMode("single");
              }}
              className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 shrink-0 ${mode === "single" ? "bg-white text-slate-900 shadow-lg" : "text-slate-500 hover:text-white"}`}
            >
              <Activity size={14} /> Backtest Standard
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setMode("comparative");
              }}
              className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 shrink-0 ${mode === "comparative" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-white"}`}
            >
              <TrendingUp size={14} /> Comparateur Stratégique
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setMode("walkforward");
              }}
              className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 shrink-0 ${mode === "walkforward" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-white"}`}
            >
              <Dna size={14} /> Walk-Forward & MC
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setMode("replay");
              }}
              className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 shrink-0 ${mode === "replay" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-white"}`}
            >
              <Repeat size={14} /> Replay Déterministe
            </button>
          </div>
        </div>

        {mode === "replay" ? (
          <div className="animate-slide-up">
            <DeterministicReplayInspector drawName={drawName} />
          </div>
        ) : mode === "single" ? (
          <div className="space-y-8 animate-slide-up">
            {/* Control Card */}
            <div className="bg-slate-900 p-8 md:p-8 rounded-3xl border border-slate-800 shadow-2xl text-center relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-12 transition-transform duration-500">
                <PiggyBank size={180} />
              </div>
              <div className="relative z-10">
                <div className="inline-block p-5 bg-indigo-600/20 rounded-3xl border border-indigo-500/30 mb-6 shadow-lg shadow-indigo-600/10">
                  <PiggyBank size={40} className="text-indigo-400" />
                </div>
                <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">
                  Crash Test Financier
                </h3>
                <p className="text-slate-400 text-sm font-medium max-w-lg mx-auto mb-4 leading-relaxed">
                  Rejouez l'historique réel en appliquant l'ADN prédictif actuel. Configurez les règles de gestion du risque ci-dessous.
                </p>
                <div className="flex items-center justify-center gap-2 mb-8 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 py-2 px-4 rounded-full mx-auto w-fit text-[10px] font-black uppercase tracking-widest">
                  <Activity size={12} /> Mode Time Machine Strict : 100% Isolé (Zéro fuite du futur)
                </div>

                {/* Advanced Parameters Configuration Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto mb-8 text-left bg-slate-950/40 p-6 rounded-2xl border border-slate-800/60 shadow-inner">
                  <div>
                    <label htmlFor="sim-strategy" className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2">
                      Stratégie de Sizing
                    </label>
                    <select
                      id="sim-strategy"
                      value={strategy}
                      onChange={(e) => {
                        audioEngine.play("click");
                        setStrategy(e.target.value as BettingStrategy);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="FLAT">Mise Plate (Standard)</option>
                      <option value="MARTINGALE">Martingale (Double après perte)</option>
                      <option value="KELLY">Critère de Kelly (Scientifique)</option>
                      <option value="CONFIDENCE_SMART">Intelligente (Confiance IA)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="sim-depth" className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2">
                      Période de Backtest (Tirages)
                    </label>
                    <select
                      id="sim-depth"
                      value={depth}
                      onChange={(e) => {
                        audioEngine.play("click");
                        setDepth(Number(e.target.value));
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
                    >
                      <option value={20}>20 derniers tirages</option>
                      <option value={50}>50 derniers tirages (Standard)</option>
                      <option value={100}>100 derniers tirages (Recommandé)</option>
                      <option value={150}>150 derniers tirages (Max)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="sim-bankroll" className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2">
                      Capital de Départ (F)
                    </label>
                    <input
                      id="sim-bankroll"
                      type="number"
                      step={5000}
                      min={1000}
                      max={1000000}
                      value={initialBankroll}
                      onChange={(e) => {
                        setInitialBankroll(Math.max(1000, Number(e.target.value)));
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="sim-unitbet" className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2">
                      Mise de Base (F)
                    </label>
                    <input
                      id="sim-unitbet"
                      type="number"
                      step={50}
                      min={50}
                      max={10000}
                      value={unitBet}
                      onChange={(e) => {
                        setUnitBet(Math.max(50, Number(e.target.value)));
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="sim-payout" className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2">
                      Modèle de Gains (Cote de Gains)
                    </label>
                    <select
                      id="sim-payout"
                      value={payoutModel}
                      onChange={(e) => {
                        audioEngine.play("click");
                        setPayoutModel(e.target.value);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="LEGACY">Classique (×15 / ×100 / ×1500 / ×15000)</option>
                      <option value="STANDARD">LONACI Standard (×15 / ×240 / ×2100 / ×15000 / ×40000)</option>
                      <option value="DOUBLE_CHANCE">LONACI Double Chance (×10 / ×100 / ×1000 / ×5000 / ×20000)</option>
                      <option value="DOUBLE_CHANCE_MACHINE">LONACI Double Chance Machine (×8 / ×80 / ×800 / ×4000 / ×15000)</option>
                    </select>
                  </div>
                </div>

                <div className="max-w-md mx-auto relative flex flex-col gap-3">
                  <button
                    onClick={handleRun}
                    disabled={simulating}
                    className="w-full py-5 bg-white hover:bg-indigo-50 text-slate-900 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-2xl flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group/btn"
                  >
                    {simulating ? (
                      <RefreshCw
                        className="animate-spin text-indigo-600"
                        size={18}
                      />
                    ) : (
                      <Play
                        size={18}
                        className="fill-current group-hover/btn:scale-110 transition-transform"
                      />
                    )}
                    {simulating
                      ? `Calcul en cours ${progress}%`
                      : "Lancer la Simulation"}
                  </button>
                  <button
                    onClick={handleAutoRegulate}
                    disabled={learning || simulating}
                    className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-inner border border-slate-700 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group/btn2"
                  >
                    {learning ? (
                      <RefreshCw
                        className="animate-spin text-indigo-400"
                        size={16}
                      />
                    ) : (
                      <Dna
                        size={16}
                        className="group-hover/btn2:rotate-12 transition-transform"
                      />
                    )}
                    {learning ? "Régulation génétique..." : "Auto-Réguler l'ADN"}
                  </button>
                  {simulating && (
                    <div className="absolute -bottom-2 left-2 right-2 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  )}
                  
                  {/* Panneau de Feedback de l'Auto-Régulation de l'ADN */}
                  {learningResult && (
                    <div className="mt-6 text-left bg-slate-950/80 p-6 rounded-3xl border border-slate-800/80 shadow-2xl animate-scale-in w-full">
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/60">
                        <div className="flex items-center gap-2">
                          <Dna className={learningResult.improvement ? "text-emerald-400 animate-pulse" : "text-slate-400"} size={18} />
                          <span className="text-[10px] font-black uppercase text-slate-300 tracking-wider">
                            Rapport d'Auto-Régulation ADN
                          </span>
                        </div>
                        <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full border ${
                          learningResult.improvement 
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                            : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                        }`}>
                          {learningResult.improvement ? "Optimisé" : "Déjà Optimal"}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 font-medium mb-4 leading-relaxed">
                        {learningResult.message}
                      </p>

                      {learningResult.criticalDecision && (
                        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/40 text-[11px] text-indigo-300 leading-relaxed font-semibold mb-4">
                          {learningResult.criticalDecision}
                        </div>
                      )}

                      {/* Comparaison Champion-Challenger */}
                      {learningResult.oldScore !== undefined && learningResult.newScore !== undefined && (
                        <div className="grid grid-cols-2 gap-4 mb-4 pt-2">
                          <div className="bg-slate-900/60 p-3 rounded-2xl border border-slate-800/50 text-center">
                            <span className="text-[8px] font-bold uppercase text-slate-500 block mb-1">Efficacité Avant</span>
                            <span className="text-sm font-black text-slate-400">
                              {learningResult.oldScore.toFixed(2)} pts
                            </span>
                          </div>
                          <div className="bg-slate-900/60 p-3 rounded-2xl border border-slate-800/50 text-center">
                            <span className="text-[8px] font-bold uppercase text-emerald-500 block mb-1">Efficacité Après</span>
                            <span className="text-sm font-black text-emerald-400">
                              {learningResult.newScore.toFixed(2)} pts {learningResult.improvement && `(+${learningResult.delta}%)`}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Détail des changements de l'ADN */}
                      {learningResult.weightChanges && Object.keys(learningResult.weightChanges).length > 0 && (
                        <div className="space-y-2 mt-4 pt-2 border-t border-slate-800/40">
                          <span className="text-[8px] font-black uppercase text-indigo-400 tracking-wider block mb-2">
                            Réajustement des Poids IA
                          </span>
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            {Object.entries(learningResult.weightChanges).map(([algo, change]) => {
                              const absChangePercent = Math.abs(change * 100).toFixed(1);
                              return (
                                <div key={algo} className="flex items-center justify-between bg-slate-900/30 px-3 py-2 rounded-xl border border-slate-800/30">
                                  <span className="text-slate-400 capitalize font-medium">{algo}</span>
                                  {change > 0.001 ? (
                                    <span className="text-emerald-400 font-bold font-mono">+{absChangePercent}%</span>
                                  ) : change < -0.001 ? (
                                    <span className="text-rose-400 font-bold font-mono">-{absChangePercent}%</span>
                                  ) : (
                                    <span className="text-slate-500 font-bold font-mono">0.0%</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {report && (
              <div className="animate-scale-in space-y-6">
                {/* Main KPI Card */}
                <div
                  className={`p-6 md:p-8 rounded-3xl border relative overflow-hidden shadow-2xl ${report.netProfit >= 0 ? "bg-gradient-to-br from-emerald-900/50 to-slate-900 border-emerald-500/30" : "bg-gradient-to-br from-rose-900/50 to-slate-900 border-rose-500/30"}`}
                >
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>

                  <div className="flex flex-col items-center text-center relative z-10">
                    <div
                      className={`mb-6 p-4 rounded-full ${report.netProfit >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}
                    >
                      {report.netProfit >= 0 ? (
                        <ThumbsUp size={32} />
                      ) : (
                        <ThumbsDown size={32} />
                      )}
                    </div>

                    <h4 className="text-xs font-black uppercase text-slate-400 mb-2 tracking-[0.3em]">
                      Résultat Net
                    </h4>
                    <div
                      className={`text-6xl md:text-8xl font-black tracking-tighter ${report.netProfit >= 0 ? "text-emerald-400 drop-shadow-[0_0_30px_rgba(52,211,153,0.3)]" : "text-rose-400 drop-shadow-[0_0_30px_rgba(251,113,133,0.3)]"}`}
                    >
                      {report.netProfit > 0 ? "+" : ""}
                      {report.netProfit.toLocaleString()} F
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-12 w-full max-w-4xl">
                      <div className="bg-black/30 p-5 rounded-3xl border border-white/5">
                        <div className="text-xs text-slate-500 uppercase font-black mb-1">
                          ROI Global
                        </div>
                        <div
                          className={`text-xl font-black ${report.roi >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                        >
                          {report.roi.toFixed(1)}%
                        </div>
                      </div>
                      <div className="bg-black/30 p-5 rounded-3xl border border-white/5">
                        <div className="text-xs text-slate-500 uppercase font-black mb-1">
                          Précision
                        </div>
                        <div className="text-xl font-black text-amber-400">
                          {report.winRate.toFixed(1)}%
                        </div>
                      </div>
                      <div className="bg-black/30 p-5 rounded-3xl border border-white/5">
                        <div className="text-xs text-slate-500 uppercase font-black mb-1">
                          Drawdown Max
                        </div>
                        <div className="text-xl font-black text-rose-400">
                          -{report.maxDrawdown}%
                        </div>
                      </div>
                      <div className="bg-black/30 p-5 rounded-3xl border border-white/5">
                        <div className="text-xs text-slate-500 uppercase font-black mb-1">
                          Sharpe Ratio
                        </div>
                        <div className="text-xl font-black text-indigo-400">
                          {report.sharpeRatio}
                        </div>
                      </div>
                      <div className="bg-black/30 p-5 rounded-3xl border border-white/5">
                        <div className="text-xs text-slate-500 uppercase font-black mb-1" title="Pénalise uniquement la volatilité négative">
                          Sortino Ratio
                        </div>
                        <div className="text-xl font-black text-indigo-400">
                          {report.sortinoRatio !== undefined ? report.sortinoRatio : "-"}
                        </div>
                      </div>
                      <div className="bg-black/30 p-5 rounded-3xl border border-white/5">
                        <div className="text-xs text-slate-500 uppercase font-black mb-1" title="Profit Net / Drawdown Max">
                          Recovery Factor
                        </div>
                        <div className="text-xl font-black text-indigo-400">
                          {report.recoveryFactor !== undefined ? report.recoveryFactor : "-"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chart Area */}
                <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 h-80 relative overflow-hidden">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2 absolute top-8 left-8 z-10">
                    <Activity size={14} /> Courbe de Capital
                  </h4>
                  <div className="w-full h-full flex justify-center items-center">
                    {report.history && report.history.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={report.history}
                        margin={{ top: 20, right: 0, left: 0, bottom: 0 }}
                      >
                      <defs>
                        <linearGradient
                          id="colorProfit"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#10b981"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#10b981"
                            stopOpacity={0}
                          />
                        </linearGradient>
                        <linearGradient
                          id="colorLoss"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#f43f5e"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#f43f5e"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        opacity={0.1}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "16px",
                          border: "none",
                          backgroundColor: "#0f172a",
                          color: "#fff",
                          fontSize: "10px",
                          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.5)",
                        }}
                        formatter={(value: number) => [
                          `${value.toLocaleString()} F`,
                          "Capital",
                        ]}
                      />
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={["auto", "auto"]} />
                      <Area
                        type="monotone"
                        dataKey="balance"
                        stroke={report.netProfit >= 0 ? "#10b981" : "#f43f5e"}
                        strokeWidth={3}
                        fill={`url(#${report.netProfit >= 0 ? "colorProfit" : "colorLoss"})`}
                        animationDuration={1500}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  ) : (
                    <span className="text-slate-500 text-xs text-center relative z-20">Données insuffisantes</span>
                  )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : mode === "comparative" ? (
          <ParallelSimulationTab />
        ) : (
          <div className="space-y-8 animate-slide-up w-full">
            {/* Walk Forward Cybernetic Controller */}
            <div className="bg-slate-900 p-8 md:p-10 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-12 transition-transform duration-500">
                <Dna size={180} />
              </div>
              <div className="relative z-10 text-center max-w-2xl mx-auto">
                <div className="inline-block p-5 bg-indigo-600/20 rounded-3xl border border-indigo-500/30 mb-6 shadow-lg shadow-indigo-600/10">
                  <Dna size={40} className="text-indigo-400" />
                </div>
                <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">
                  Validation Walk-Forward Continue
                </h3>
                <p className="text-slate-400 text-sm font-medium leading-relaxed mb-6">
                  Le test de robustesse suprême. Simulez l'intégralité de la chaîne d'apprentissage par l'erreur (DNA backpropagation + calibration bayésienne) sur une fenêtre glissante temporelle stricte.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
                  <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 py-1.5 px-4 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                    <Activity size={12} /> Entraînement sur N / Test sur N+1
                  </div>
                  <div className="bg-blue-500/10 text-blue-400 border border-blue-500/20 py-1.5 px-4 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                    <Dna size={12} /> Comparatif 4 modèles
                  </div>
                </div>

                {/* Configurations Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left bg-slate-950/40 p-6 rounded-2xl border border-slate-800/60 shadow-inner mb-6">
                  <div>
                    <label htmlFor="wf-depth" className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2">
                      Profondeur de Test (Tirages)
                    </label>
                    <select
                      id="wf-depth"
                      value={depth}
                      onChange={(e) => {
                        audioEngine.play("click");
                        setDepth(Number(e.target.value));
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
                    >
                      <option value={20}>20 derniers tirages</option>
                      <option value={50}>50 derniers tirages (Standard)</option>
                      <option value={100}>100 derniers tirages (Validation Robuste)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="wf-strategy" className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2">
                      Régime de Risque (Mises)
                    </label>
                    <select
                      id="wf-strategy"
                      value={strategy}
                      onChange={(e) => {
                        audioEngine.play("click");
                        setStrategy(e.target.value as BettingStrategy);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="FLAT">Mise Plate (Standard)</option>
                      <option value="MARTINGALE">Martingale Éperonnée</option>
                      <option value="KELLY">Kelly Fractionnaire Scientifique</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleRunWalkForward}
                  disabled={wfRunning}
                  className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-2xl flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {wfRunning ? (
                    <RefreshCw className="animate-spin text-white" size={18} />
                  ) : (
                    <Play size={18} className="fill-current" />
                  )}
                  {wfRunning ? `Exécution Forensique glissante ${wfProgress}%` : "Lancer le Walk-Forward de Test"}
                </button>
              </div>
            </div>

            {wfResults && (
              <div className="space-y-8 animate-scale-in">
                {/* 4 Models Cards Comparative Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {Object.values(wfResults).map((metric) => {
                    const isProfitable = metric.finalBankroll >= metric.initBankroll;
                    const brierQuality = metric.brierScore < 0.055 ? "Excellente" : metric.brierScore < 0.058 ? "Optimisée" : "Incomplète";
                    return (
                      <div
                        key={metric.strategyName}
                        className={`p-6 rounded-3xl border bg-slate-950/60 flex flex-col justify-between ${
                          metric.strategyName === "Full Hybrid"
                            ? "border-indigo-500/40 bg-gradient-to-br from-indigo-950/20 to-slate-950 shadow-indigo-600/5 shadow-2xl"
                            : metric.strategyName === "Adversarial Defensive"
                            ? "border-emerald-500/40 bg-gradient-to-br from-emerald-950/20 to-slate-950 shadow-emerald-600/5"
                            : "border-slate-800"
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <div className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Modèle de Test</div>
                              <h4 className="text-xl font-black text-white uppercase tracking-tight">{metric.strategyName}</h4>
                            </div>
                            <span
                              className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${
                                isProfitable 
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              }`}
                            >
                              {metric.roi >= 0 ? "+" : ""}{metric.roi}% ROI
                            </span>
                          </div>

                          {/* Capital / Drawdowns */}
                          <div className="grid grid-cols-3 gap-2 mb-6">
                            <div className="bg-black/30 p-3 rounded-2xl border border-white/5 text-center">
                              <span className="text-[8px] font-bold uppercase text-slate-500">Solde Final</span>
                              <div className="text-sm font-black text-white">{metric.finalBankroll.toLocaleString()} F</div>
                            </div>
                            <div className="bg-black/30 p-3 rounded-2xl border border-white/5 text-center">
                              <span className="text-[8px] font-bold uppercase text-slate-500">Drawdown Max</span>
                              <div className="text-sm font-black text-rose-400">-{metric.maxDrawdown}%</div>
                            </div>
                            <div className="bg-black/30 p-3 rounded-2xl border border-white/5 text-center" title="Brier Score du modèle (plus bas = calibration idéale)">
                              <span className="text-[8px] font-bold uppercase text-slate-500">Brier Score</span>
                              <div className="text-sm font-black text-indigo-400">{metric.brierScore}</div>
                            </div>
                          </div>

                          {/* Hits Distributions */}
                          <div className="mb-4">
                            <div className="text-[9px] font-black uppercase text-indigo-400 tracking-wider mb-2">Répartition des Hits (Tirages gagnés)</div>
                            <div className="grid grid-cols-5 gap-1.5">
                              {[1, 2, 3, 4, 5].map((k) => {
                                const count = metric.totalHits[k as 1|2|3|4|5] || 0;
                                return (
                                  <div key={k} className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-center">
                                    <div className="text-[8px] font-black text-slate-500">{k}★</div>
                                    <div className="text-xs font-black text-white">{count}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Audits & Diagnostics */}
                        <div className="pt-4 border-t border-slate-800/60 grid grid-cols-2 gap-4 mt-4">
                          <div>
                            <span className="text-[8px] font-bold uppercase text-slate-500 block">Indice UFI Moyen</span>
                            <span className="text-xs font-black text-slate-300">{metric.avgUFI} / 100</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[8px] font-bold uppercase text-slate-500 block">Anomalies de l'UFI</span>
                            <span className={`text-xs font-black uppercase ${metric.blackSwanCount > 0 ? "text-amber-400" : "text-slate-400"}`}>
                              {metric.blackSwanCount} Cygnes Noirs
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Multiline Capital Curve Chart */}
                <div className="bg-slate-900/50 p-6 md:p-8 rounded-3xl border border-slate-800 shadow-xl h-96 relative">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Activity size={14} /> Courbes Comparatives de Capital (Walk-Forward)
                  </h4>
                  <div className="w-full h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={(() => {
                          const hybridHist = wfResults["Full Hybrid"]?.history || [];
                          return hybridHist.map((entry, idx) => ({
                            date: entry.date,
                            "Baseline Random": wfResults["Baseline Random"]?.history[idx]?.balance || 0,
                            "Frequency Only": wfResults["Frequency Only"]?.history[idx]?.balance || 0,
                            "Full Hybrid": wfResults["Full Hybrid"]?.history[idx]?.balance || 0,
                            "Adversarial Defensive": wfResults["Adversarial Defensive"]?.history[idx]?.balance || 0
                          }));
                        })()}
                        margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.05} />
                        <XAxis dataKey="date" hide />
                        <YAxis stroke="#475569" fontSize={10} domain={["auto", "auto"]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#020617",
                            border: "1px solid #1e293b",
                            borderRadius: "12px",
                            fontSize: "10px"
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "9px", textTransform: "uppercase", fontWeight: "900" }} />
                        <Line type="monotone" strokeWidth={1.5} dataKey="Baseline Random" stroke="#64748b" dot={false} />
                        <Line type="monotone" strokeWidth={1.5} dataKey="Frequency Only" stroke="#f59e0b" dot={false} />
                        <Line type="monotone" strokeWidth={3} dataKey="Full Hybrid" stroke="#6366f1" dot={false} />
                        <Line type="monotone" strokeWidth={3} dataKey="Adversarial Defensive" stroke="#10b981" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Calibration Curve and Brier Probability Calibration Chart */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Calibration Card */}
                  <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800 h-96 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <Activity size={14} /> Courbe de Calibration Probabiliste (Full Hybrid)
                      </h4>
                      <p className="text-[10px] text-slate-500 mb-6">
                        Compare la probabilité estimée du modèle avec le taux réel historique d'apparition dans chaque tranche de confiance.
                      </p>
                    </div>
                    <div className="w-full h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={wfResults["Full Hybrid"]?.calibrationCurve || []}
                          margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" opacity={0.05} />
                          <XAxis dataKey="label" stroke="#475569" fontSize={9} />
                          <YAxis stroke="#475569" fontSize={9} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#020617",
                              border: "none",
                              fontSize: "10px",
                              borderRadius: "12px"
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: "9px" }} />
                          <Bar name="Attendu (Théorique)" dataKey="expectedProb" fill="#312e81" radius={[4, 4, 0, 0]} />
                          <Bar name="Réel Constaté" dataKey="actualRate" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Monte Carlo Simulator Card */}
                  <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800 h-96 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <Activity size={14} /> Stress-Test de Ruine Monte Carlo (1000 Runs)
                      </h4>
                      <p className="text-[10px] text-slate-500 mb-4">
                        Soumettez l'algorithme d'estimation de probabilité à 1 000 trajectoires stochastiques déterministes pour modéliser le comportement de drawdown maximal absolu.
                      </p>
                    </div>

                    {!mcResults ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                        <button
                          onClick={handleRunMonteCarlo}
                          disabled={mcRunning}
                          className="px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50"
                        >
                          {mcRunning ? "Stress-Test en cours..." : "Calculer le Risque de Faillite"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col justify-between mt-2">
                        {/* MC KPIs */}
                        <div className="grid grid-cols-3 gap-3 mb-4 bg-black/45 p-4 rounded-2xl border border-white/5">
                          <div className="text-center">
                            <span className="text-[8px] font-bold text-slate-500 uppercase">Risque de Ruine</span>
                            <div className={`text-sm font-black ${mcResults.bankruptcyProbability > 0.1 ? "text-rose-400" : "text-emerald-400"}`}>
                              {mcResults.ruinRisk}%
                            </div>
                          </div>
                          <div className="text-center">
                            <span className="text-[8px] font-bold text-slate-500 uppercase font-black">Capital Médian</span>
                            <div className="text-sm font-black text-indigo-400">
                              {Math.round(mcResults.medianFinalBalance).toLocaleString()} F
                            </div>
                          </div>
                          <div className="text-center" title="Sharpe Ratio espéré sous de fortes perturbations">
                            <span className="text-[8px] font-bold text-slate-500 uppercase">Ratio Sharpe</span>
                            <div className="text-sm font-black text-amber-400">
                              {mcResults.expectedSharpe}
                            </div>
                          </div>
                        </div>

                        {/* Projection bound */}
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-wide flex justify-between px-2 mb-2">
                          <span>Intervalle Pessimiste (P5): {Math.round(mcResults.p5).toLocaleString()} F</span>
                          <span>Optimiste (P95): {Math.round(mcResults.p95).toLocaleString()} F</span>
                        </div>

                        {/* Trajectories Mini Graph */}
                        <div className="w-full h-32 opacity-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={mcResults.trajectorySamples[0].map((_, stepIdx) => ({
                                name: stepIdx,
                                path0: mcResults.trajectorySamples[0]?.[stepIdx] || 0,
                                path1: mcResults.trajectorySamples[1]?.[stepIdx] || 0,
                                path2: mcResults.trajectorySamples[2]?.[stepIdx] || 0,
                                path3: mcResults.trajectorySamples[3]?.[stepIdx] || 0,
                              }))}
                            >
                              <CartesianGrid strokeDasharray="3 3" opacity={0.03} />
                              <Area type="monotone" dataKey="path0" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.05} dot={false} />
                              <Area type="monotone" dataKey="path1" stroke="#34d399" fill="#34d399" fillOpacity={0.05} dot={false} />
                              <Area type="monotone" dataKey="path2" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.05} dot={false} />
                              <Area type="monotone" dataKey="path3" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.05} dot={false} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);
