import React, { useState, useRef, useEffect, useCallback } from "react";
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
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { audioEngine } from "../../../utils/audioEngine";

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

    return (
      <div className="space-y-8 animate-slide-up">
        {/* Control Card */}
        <div className="bg-slate-900/80 p-8 md:p-10 rounded-3xl border border-slate-800/80 shadow-2xl text-center relative overflow-hidden group">
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
              Rejouez l'historique réel en appliquant l'ADN prédictif actuel. Configurez les règles de gestion de risque ci-dessous.
            </p>
            <div className="flex items-center justify-center gap-2 mb-8 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 py-2 px-4 rounded-full mx-auto w-fit text-[10px] font-black uppercase tracking-widest">
              <Activity size={12} /> Mode Time Machine Strict : 100% Isolé (Zéro fuite du futur)
            </div>

            {/* Parameters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto mb-8 text-left bg-slate-950/40 p-6 rounded-2xl border border-slate-800/60 shadow-inner">
              <div>
                <label
                  htmlFor="sim-strategy"
                  className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2"
                >
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
                <label
                  htmlFor="sim-depth"
                  className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2"
                >
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
                <label
                  htmlFor="sim-bankroll"
                  className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2"
                >
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
                <label
                  htmlFor="sim-unitbet"
                  className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2"
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
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="sim-payout"
                  className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2"
                >
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
                  <RefreshCw className="animate-spin text-indigo-600" size={18} />
                ) : (
                  <Play size={18} className="fill-current group-hover/btn:scale-110 transition-transform" />
                )}
                {simulating ? `Calcul en cours ${progress}%` : "Lancer la Simulation"}
              </button>
              {simulating && (
                <div className="absolute -bottom-2 left-2 right-2 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  ></div>
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
                  {report.netProfit >= 0 ? <ThumbsUp size={32} /> : <ThumbsDown size={32} />}
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
                    <div className={`text-xl font-black ${report.roi >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
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
                    <AreaChart data={report.history} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "16px",
                          border: "none",
                          backgroundColor: "#0f172a",
                          color: "#fff",
                          fontSize: "10px",
                          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.5)",
                        }}
                        formatter={(value: number) => [`${value.toLocaleString()} F`, "Capital"]}
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
                  <span className="text-slate-500 text-xs text-center relative z-20">
                    Données insuffisantes
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);
