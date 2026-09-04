import React, { useState, useMemo, useCallback } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import {
  runAlternativeRealitiesSimulation,
  BacktestReport,
} from "../../services/backtestingEngine";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { TrendingUp, Scale, Zap, Trophy, RefreshCw } from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

const chartMargin = { top: 10, right: 0, left: 0, bottom: 0 };
const tooltipStyle = {
  borderRadius: "16px",
  border: "none",
  backgroundColor: "#0f172a",
  color: "#fff",
  fontSize: "11px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
};
const legendStyle = {
  fontSize: "10px",
  fontWeight: "bold" as const,
  paddingTop: "20px",
};

interface ParallelSimulationTabProps {
  drawName?: string;
}

export const ParallelSimulationTab: React.FC<ParallelSimulationTabProps> = React.memo(({ drawName: propDrawName }) => {
  const rawHistory = useNexusStore((state) => state.history);
  const storeDrawName = useNexusStore((state) => state.drawName);
  const drawName = propDrawName || storeDrawName || "Reveil";
  const history = useMemo(
    () => (drawName ? purifyHistoryForDraw(drawName, rawHistory) : rawHistory),
    [drawName, rawHistory]
  );
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const [reports, setReports] = useState<{
    flat: BacktestReport;
    martingale: BacktestReport;
    kelly: BacktestReport;
    confidence_smart: BacktestReport;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  // Configuration options
  const [depth, setDepth] = useState<number>(60);
  const [initialBankroll, setInitialBankroll] = useState<number>(50000);
  const [unitBet, setUnitBet] = useState<number>(200);

  const handleRun = useCallback(async () => {
    if (history.length < 10) return;
    audioEngine.play("click");
    setLoading(true);
    try {
      const results = await runAlternativeRealitiesSimulation(
        drawName,
        history,
        globalWeights,
        depth,
        initialBankroll,
        unitBet,
      );
      audioEngine.play("success");
      setReports(results);
    } catch (e) {
      console.error(e);
      audioEngine.play("error");
    } finally {
      setLoading(false);
    }
  }, [drawName, history, globalWeights, depth, initialBankroll, unitBet]);

  const bestStrategy = useMemo(() => {
    if (!reports) return null;
    const strategies = Object.entries(reports) as [string, BacktestReport][];
    return strategies.sort((a, b) => b[1].netProfit - a[1].netProfit)[0];
  }, [reports]);

  const chartData = useMemo(() => {
    return reports
      ? (reports.flat?.history || []).map(
          (h: { date: string; balance: number }, i: number) => ({
            date: h.date,
            "Mise Plate": h.balance,
            Martingale: reports.martingale?.history[i]?.balance || 0,
            Kelly: reports.kelly?.history[i]?.balance || 0,
            "IA Prédictive": reports.confidence_smart?.history[i]?.balance || 0,
          }),
        )
      : [];
  }, [reports]);

  const getStrategyLabel = (key: string) => {
    switch (key) {
      case "flat":
        return "Mise Plate (Prudent)";
      case "martingale":
        return "Martingale (Spéculatif)";
      case "kelly":
        return "Critère de Kelly (Scientifique)";
      case "confidence_smart":
        return "IA Prédictive (Adaptatif)";
      default:
        return key;
    }
  };

  const getStrategyColor = (key: string) => {
    switch (key) {
      case "flat":
        return "text-slate-400";
      case "martingale":
        return "text-rose-400";
      case "kelly":
        return "text-amber-400";
      case "confidence_smart":
        return "text-indigo-400";
      default:
        return "text-white";
    }
  };

  return (
    <div className="space-y-8 animate-fade-in px-1 md:px-0">
      <div className="bg-slate-900 p-8 md:p-6 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <TrendingUp size={160} />
        </div>
        <div className="relative z-10 text-center max-w-3xl mx-auto">
          <h3 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter mb-4">
            Simulateur <span className="text-indigo-500">Multivarié</span>
          </h3>
          <p className="text-slate-400 text-sm font-medium mb-8 leading-relaxed max-w-xl mx-auto">
            Le vortex calcule simultanément 4 univers parallèles basés sur nos
            modèles de Sizing de risque réels. Quel profil tire le meilleur
            parti de l'ADN ?
          </p>

          {/* Configuration Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 text-left bg-slate-950/40 p-5 rounded-2xl border border-slate-800/60">
            <div>
              <label className="block text-[9px] font-black uppercase text-indigo-400 tracking-wider mb-2">
                Profondeur Historique
              </label>
              <select
                value={depth}
                onChange={(e) => {
                  audioEngine.play("click");
                  setDepth(Number(e.target.value));
                }}
                className="w-full glass-card neural-border rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-300 focus:outline-none"
              >
                <option value={30}>30 Tirages (Rapide)</option>
                <option value={60}>60 Tirages (Standard)</option>
                <option value={100}>100 Tirages (Profond)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="parallel-bankroll"
                className="block text-[9px] font-black uppercase text-indigo-400 tracking-wider mb-2"
              >
                Capital de Départ (F)
              </label>
              <input
                id="parallel-bankroll"
                type="number"
                step={5000}
                min={1000}
                value={initialBankroll}
                onChange={(e) =>
                  setInitialBankroll(Math.max(1000, Number(e.target.value)))
                }
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-400 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="parallel-unitbet"
                className="block text-[9px] font-black uppercase text-indigo-400 tracking-wider mb-2"
              >
                Mise de Base (F)
              </label>
              <input
                id="parallel-unitbet"
                type="number"
                step={50}
                min={50}
                value={unitBet}
                onChange={(e) =>
                  setUnitBet(Math.max(50, Number(e.target.value)))
                }
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-400 focus:outline-none"
              />
            </div>
          </div>

          <button
            onClick={handleRun}
            disabled={loading}
            className="w-full md:w-auto px-12 py-5 bg-white hover:bg-indigo-50 text-slate-900 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center justify-center gap-3 mx-auto transition-all active:scale-95 disabled:opacity-50 group"
          >
            {loading ? (
              <RefreshCw className="animate-spin text-indigo-600" size={18} />
            ) : (
              <Zap
                className="text-amber-500 group-hover:scale-110 transition-transform"
                size={18}
              />
            )}
            {loading ? "Calcul des futurs..." : "Lancer le Vortex"}
          </button>
        </div>
      </div>

      {reports && (
        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden relative">
            <div className="flex justify-between items-center mb-8 px-2">
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Scale size={14} /> Trajectoires de Richesse Parallèles
              </h4>
            </div>
            <div className="h-[360px] w-full overflow-hidden flex justify-center items-center">
              {chartData && chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={chartMargin}>
                    <defs>
                      <linearGradient
                        id="colorFlat"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#94a3b8"
                          stopOpacity={0.15}
                        />
                        <stop
                          offset="95%"
                          stopColor="#94a3b8"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="colorMartingale"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#f43f5e"
                          stopOpacity={0.15}
                        />
                        <stop
                          offset="95%"
                          stopColor="#f43f5e"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="colorKelly"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#fbbf24"
                          stopOpacity={0.15}
                        />
                        <stop
                          offset="95%"
                          stopColor="#fbbf24"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="colorConfidenceSmart"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#6366f1"
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="95%"
                          stopColor="#6366f1"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      opacity={0.1}
                    />
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend iconType="circle" wrapperStyle={legendStyle} />
                    <Area
                      type="monotone"
                      dataKey="Mise Plate"
                      stroke="#94a3b8"
                      fill="url(#colorFlat)"
                      strokeWidth={2}
                      fillOpacity={1}
                    />
                    <Area
                      type="monotone"
                      dataKey="Martingale"
                      stroke="#f43f5e"
                      fill="url(#colorMartingale)"
                      strokeWidth={2}
                      fillOpacity={1}
                    />
                    <Area
                      type="monotone"
                      dataKey="Kelly"
                      stroke="#fbbf24"
                      fill="url(#colorKelly)"
                      strokeWidth={2}
                      fillOpacity={1}
                    />
                    <Area
                      type="monotone"
                      dataKey="IA Prédictive"
                      stroke="#6366f1"
                      fill="url(#colorConfidenceSmart)"
                      strokeWidth={3.5}
                      fillOpacity={1}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <span className="text-slate-500 text-xs">
                  Ajustement du vortex...
                </span>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-4">
            {(Object.entries(reports) as Array<[string, BacktestReport]>).map(
              ([strat, rep]) => {
                const isBest = bestStrategy && bestStrategy[0] === strat;
                return (
                  <div
                    key={strat}
                    className={`p-5 rounded-2xl border transition-all relative overflow-hidden group ${isBest ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 scale-105 z-10 border-transparent" : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-indigo-300"}`}
                  >
                    {isBest && (
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Trophy size={60} />
                      </div>
                    )}

                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span
                          className={`text-[9px] font-black uppercase tracking-widest ${isBest ? "text-indigo-200" : "text-slate-400"}`}
                        >
                          Gestion Financière
                        </span>
                        <h5
                          className={`text-sm font-black uppercase ${isBest ? "text-white" : getStrategyColor(strat)}`}
                        >
                          {getStrategyLabel(strat)}
                        </h5>
                      </div>
                      {isBest && (
                        <Trophy size={16} className="text-amber-400" />
                      )}
                    </div>

                    <div className="flex items-baseline gap-2 mb-3">
                      <span
                        className={`text-xl font-black ${isBest ? "text-white" : rep.netProfit >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                      >
                        {rep.netProfit > 0 ? "+" : ""}
                        {rep.netProfit.toLocaleString()} F
                      </span>
                      <span
                        className={`text-[9px] font-bold ${isBest ? "text-indigo-200" : "text-slate-400"}`}
                      >
                        Net
                      </span>
                    </div>

                    <div
                      className={`h-1.5 w-full rounded-full overflow-hidden mb-3 ${isBest ? "bg-indigo-800" : "bg-slate-100 dark:bg-slate-700"}`}
                    >
                      <div
                        className={`h-full ${rep.netProfit >= 0 ? "bg-emerald-400" : "bg-rose-400"}`}
                        style={{
                          width: `${Math.min(100, Math.abs(rep.roi))}%`,
                        }}
                      ></div>
                    </div>

                    <div
                      className={`grid grid-cols-2 gap-2 text-[10px] font-bold uppercase ${isBest ? "text-indigo-200" : "text-slate-500"}`}
                    >
                      <div>ROI: {rep.roi.toFixed(1)}%</div>
                      <div>Win Rate: {rep.winRate.toFixed(1)}%</div>
                      <div>Sharpe: {rep.sharpeRatio}</div>
                      <div>Drawdown: -{rep.maxDrawdown}%</div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>
      )}
    </div>
  );
});

ParallelSimulationTab.displayName = "ParallelSimulationTab";
