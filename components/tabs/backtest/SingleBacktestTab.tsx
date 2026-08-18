import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  runSurvivalSimulation,
  BacktestReport,
  BettingStrategy,
} from "../../../services/backtestingEngine";
import {
  Play,
  RefreshCw,
  PiggyBank,
  ThumbsUp,
  ThumbsDown,
  Activity,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  Sliders,
  Sparkles,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
  CartesianGrid,
  XAxis,
  YAxis,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { audioEngine } from "../../../utils/audioEngine";
import { motion, AnimatePresence } from "framer-motion";

interface SingleBacktestTabProps {
  drawName: string;
  history: any[];
  globalWeights: any;
}

export const SingleBacktestTab: React.FC<SingleBacktestTabProps> = React.memo(
  ({ drawName, history, globalWeights }) => {
    const [simulating, setSimulating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [report, setReport] = useState<BacktestReport | null>(null);

    // Configurable parameters
    const [strategy, setStrategy] = useState<BettingStrategy>("FLAT");
    const [depth, setDepth] = useState<number>(50);
    const [initialBankroll, setInitialBankroll] = useState<number>(50000);
    const [unitBet, setUnitBet] = useState<number>(200);
    const [payoutModel, setPayoutModel] = useState<string>("LEGACY");
    const [activeChartTab, setActiveChartTab] = useState<"EQUITY" | "UNDERWATER" | "HITS">("EQUITY");

    const isMounted = useRef(true);
    useEffect(() => {
      isMounted.current = true;
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
    }, [
      drawName,
      history,
      globalWeights,
      depth,
      strategy,
      initialBankroll,
      unitBet,
      payoutModel,
    ]);

    // Enhanced Risk Metrics & Underwater Drawdown Series
    const enhancedAnalytics = useMemo(() => {
      if (!report || !report.history || report.history.length === 0) return null;

      let peak = initialBankroll;
      const historyWithUnderwater = report.history.map((step, idx) => {
        if (step.balance > peak) peak = step.balance;
        const drawdownPct = peak > 0 ? ((step.balance - peak) / peak) * 100 : 0;
        return {
          ...step,
          drawIndex: idx + 1,
          peak,
          drawdownPct: Number(drawdownPct.toFixed(2)),
        };
      });

      // Returns array
      const profits = report.history.map((h) => h.profit);
      const sortedProfits = [...profits].sort((a, b) => a - b);
      
      // VaR 95% (5th percentile of profit)
      const var95Index = Math.floor(sortedProfits.length * 0.05);
      const var95 = sortedProfits[var95Index] || 0;
      
      // CVaR 95% (Expected Shortfall)
      const tailLosses = sortedProfits.slice(0, Math.max(1, var95Index + 1));
      const cvar95 = tailLosses.reduce((sum, v) => sum + v, 0) / tailLosses.length;

      // Hit distribution
      const hitsDistribution = [0, 1, 2, 3, 4, 5].map((hitNum) => {
        const count = report.history.filter((h) => h.hits === hitNum).length;
        return {
          hit: `${hitNum} Num`,
          count,
          percentage: Number(((count / report.history.length) * 100).toFixed(1)),
        };
      });

      // Calmar Ratio
      const cagrEstimate = ((report.netProfit / initialBankroll) * 100);
      const calmarRatio = report.maxDrawdown > 0 ? Number((cagrEstimate / report.maxDrawdown).toFixed(2)) : 0;

      // Consecutive Wins / Losses calculation
      let maxConsecutiveWins = 0;
      let maxConsecutiveLosses = 0;
      let curWins = 0;
      let curLosses = 0;

      report.history.forEach((h) => {
        if (h.profit > 0) {
          curWins++;
          curLosses = 0;
          if (curWins > maxConsecutiveWins) maxConsecutiveWins = curWins;
        } else {
          curLosses++;
          curWins = 0;
          if (curLosses > maxConsecutiveLosses) maxConsecutiveLosses = curLosses;
        }
      });

      return {
        chartData: historyWithUnderwater,
        var95: Number(var95.toFixed(0)),
        cvar95: Number(cvar95.toFixed(0)),
        calmarRatio,
        hitsDistribution,
        maxConsecutiveWins,
        maxConsecutiveLosses,
      };
    }, [report, initialBankroll]);

    return (
      <div className="space-y-8 animate-fade-in pb-16">
        {/* Control Card */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-8 md:p-10 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-12 transition-transform duration-500 pointer-events-none">
            <PiggyBank size={180} />
          </div>
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3.5 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
                  <PiggyBank size={28} />
                </div>
                <div className="text-left">
                  <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">
                    Simulation & Stress-Test Financier
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    Rejeu déterministe sur l'historique délimité de <strong className="text-emerald-400">{drawName}</strong> (Zéro fuite du futur)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 py-1.5 px-3.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                <ShieldCheck size={14} /> Isolation Stricte du Tirage
              </div>
            </div>

            {/* Parameters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto mb-8 text-left bg-slate-950/60 p-6 rounded-3xl border border-slate-800/80 shadow-inner">
              <div>
                <label
                  htmlFor="sim-strategy"
                  className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-1.5"
                >
                  Gestion des Mises
                </label>
                <select
                  id="sim-strategy"
                  value={strategy}
                  onChange={(e) => {
                    audioEngine.play("click");
                    setStrategy(e.target.value as BettingStrategy);
                  }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="FLAT">Mise Plate (Standard)</option>
                  <option value="MARTINGALE">Martingale (Doublage dynamique)</option>
                  <option value="KELLY">Critère de Kelly (Scientifique)</option>
                  <option value="CONFIDENCE_SMART">Intelligente (Confiance IA)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="sim-depth"
                  className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-1.5"
                >
                  Fenêtre de Tirages
                </label>
                <select
                  id="sim-depth"
                  value={depth}
                  onChange={(e) => {
                    audioEngine.play("click");
                    setDepth(Number(e.target.value));
                  }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value={20}>20 derniers tirages</option>
                  <option value={50}>50 derniers tirages (Standard)</option>
                  <option value={100}>100 derniers tirages (Recommandé)</option>
                  <option value={150}>150 derniers tirages (Max)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="sim-bankroll"
                  className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-1.5"
                >
                  Capital Initial (F)
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
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-3.5 py-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="sim-unitbet"
                  className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-1.5"
                >
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
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-3.5 py-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-4">
                <label
                  htmlFor="sim-payout"
                  className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-1.5"
                >
                  Barème de Gains & Cotes
                </label>
                <select
                  id="sim-payout"
                  value={payoutModel}
                  onChange={(e) => {
                    audioEngine.play("click");
                    setPayoutModel(e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
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
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {simulating ? (
                  <RefreshCw className="animate-spin text-white" size={18} />
                ) : (
                  <Play size={18} className="fill-current" />
                )}
                {simulating ? `Rejeu Temporel (${progress}%)` : "Lancer le Crash Test"}
              </button>
              {simulating && (
                <div className="absolute -bottom-2 left-2 right-2 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {report && enhancedAnalytics && (
          <div className="animate-fade-in space-y-6">
            {/* Main KPI Card */}
            <div
              className={`p-6 md:p-8 rounded-3xl border relative overflow-hidden shadow-2xl ${
                report.netProfit >= 0
                  ? "bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border-emerald-500/30"
                  : "bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-950 border-rose-500/30"
              }`}
            >
              <div className="flex flex-col items-center text-center relative z-10">
                <div
                  className={`mb-4 p-3.5 rounded-2xl ${
                    report.netProfit >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                  }`}
                >
                  {report.netProfit >= 0 ? <ThumbsUp size={28} /> : <ThumbsDown size={28} />}
                </div>

                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] mb-1">
                  Résultat Net de la Simulation
                </h4>
                <div
                  className={`text-5xl md:text-7xl font-black font-mono tracking-tighter ${
                    report.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {report.netProfit > 0 ? "+" : ""}
                  {report.netProfit.toLocaleString()} F
                </div>

                {/* KPI Matrix 6-Blocks */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-8 w-full">
                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
                    <div className="text-[9px] text-slate-400 uppercase font-black mb-1">
                      ROI Global
                    </div>
                    <div className={`text-lg font-mono font-black ${report.roi >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {report.roi.toFixed(1)}%
                    </div>
                  </div>

                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
                    <div className="text-[9px] text-slate-400 uppercase font-black mb-1">
                      Win Rate (≥1 Num)
                    </div>
                    <div className="text-lg font-mono font-black text-amber-400">
                      {report.winRate.toFixed(1)}%
                    </div>
                  </div>

                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
                    <div className="text-[9px] text-slate-400 uppercase font-black mb-1">
                      Max Drawdown
                    </div>
                    <div className="text-lg font-mono font-black text-rose-400">
                      -{report.maxDrawdown}%
                    </div>
                  </div>

                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
                    <div className="text-[9px] text-slate-400 uppercase font-black mb-1">
                      Sharpe Ratio
                    </div>
                    <div className="text-lg font-mono font-black text-indigo-400">
                      {report.sharpeRatio}
                    </div>
                  </div>

                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
                    <div className="text-[9px] text-slate-400 uppercase font-black mb-1">
                      Sortino Ratio
                    </div>
                    <div className="text-lg font-mono font-black text-cyan-400">
                      {report.sortinoRatio !== undefined ? report.sortinoRatio : "-"}
                    </div>
                  </div>

                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
                    <div className="text-[9px] text-slate-400 uppercase font-black mb-1">
                      Calmar Ratio
                    </div>
                    <div className="text-lg font-mono font-black text-emerald-400">
                      {enhancedAnalytics.calmarRatio}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Risk & Actuarial Metrics Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800">
                <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                  Value at Risk (VaR 95%)
                </span>
                <span className="text-base font-mono font-black text-rose-400">
                  {enhancedAnalytics.var95.toLocaleString()} F / tirage
                </span>
              </div>

              <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800">
                <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                  Expected Shortfall (CVaR 95%)
                </span>
                <span className="text-base font-mono font-black text-rose-500">
                  {enhancedAnalytics.cvar95.toLocaleString()} F
                </span>
              </div>

              <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800">
                <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                  Max Gains Consécutifs
                </span>
                <span className="text-base font-mono font-black text-emerald-400">
                  {enhancedAnalytics.maxConsecutiveWins} tirages
                </span>
              </div>

              <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800">
                <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                  Max Pertes Consécutives
                </span>
                <span className="text-base font-mono font-black text-amber-400">
                  {enhancedAnalytics.maxConsecutiveLosses} tirages
                </span>
              </div>
            </div>

            {/* Interactive Multi-View Chart */}
            <div className="bg-slate-900/80 p-6 md:p-8 rounded-3xl shadow-xl border border-slate-800 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Activity size={16} className="text-indigo-400" /> Analyse Graphique Multi-Échelles
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Trajectoire de capital, drawdown sous-marin et distribution des hits
                  </p>
                </div>

                <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800">
                  <button
                    onClick={() => setActiveChartTab("EQUITY")}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                      activeChartTab === "EQUITY"
                        ? "bg-indigo-600 text-white shadow-md"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Capital
                  </button>
                  <button
                    onClick={() => setActiveChartTab("UNDERWATER")}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                      activeChartTab === "UNDERWATER"
                        ? "bg-rose-600 text-white shadow-md"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Drawdown %
                  </button>
                  <button
                    onClick={() => setActiveChartTab("HITS")}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                      activeChartTab === "HITS"
                        ? "bg-amber-600 text-white shadow-md"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Hits
                  </button>
                </div>
              </div>

              <div className="h-72 w-full">
                {activeChartTab === "EQUITY" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={enhancedAnalytics.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="eqProfit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" opacity={0.5} />
                      <XAxis dataKey="drawIndex" tick={{ fill: "#64748b", fontSize: 10 }} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 10 }} domain={["auto", "auto"]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          borderColor: "#334155",
                          borderRadius: "12px",
                          fontSize: "11px",
                        }}
                        formatter={(val: number) => [`${val.toLocaleString()} F`, "Capital"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="balance"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#eqProfit)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}

                {activeChartTab === "UNDERWATER" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={enhancedAnalytics.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" opacity={0.5} />
                      <XAxis dataKey="drawIndex" tick={{ fill: "#64748b", fontSize: 10 }} />
                      <YAxis tick={{ fill: "#f43f5e", fontSize: 10 }} domain={[-100, 0]} unit="%" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          borderColor: "#334155",
                          borderRadius: "12px",
                          fontSize: "11px",
                        }}
                        formatter={(val: number) => [`${val}%`, "Drawdown"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="drawdownPct"
                        stroke="#f43f5e"
                        strokeWidth={2}
                        fill="url(#ddGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}

                {activeChartTab === "HITS" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={enhancedAnalytics.hitsDistribution} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" opacity={0.5} />
                      <XAxis dataKey="hit" tick={{ fill: "#64748b", fontSize: 10 }} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          borderColor: "#334155",
                          borderRadius: "12px",
                          fontSize: "11px",
                        }}
                      />
                      <Bar dataKey="count" fill="#f59e0b" radius={[8, 8, 0, 0]} name="Occurrences" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);
