import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertCircle,
  Award,
  BrainCircuit,
  Calendar,
  Compass,
  ListFilter,
  Play,
  RefreshCw,
  Sliders,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { BacktestChartPoint, BacktestResult, BacktestStats } from "./types";

interface IAPredictionBacktestPanelProps {
  drawName: string;
  historyLength: number;
  backtestDepth: number;
  maxCapableDepth: number;
  isEligibleForBacktest: boolean;
  backtestRunning: boolean;
  backtestProgress: number;
  backtestError: string | null;
  backtestResults: BacktestResult[] | null;
  stats: BacktestStats | null;
  chartData: BacktestChartPoint[];
  onChangeBacktestDepth: (depth: number) => void;
  onRunBacktesting: () => void;
}

export const IAPredictionBacktestPanel: React.FC<IAPredictionBacktestPanelProps> = ({
  drawName,
  historyLength,
  backtestDepth,
  maxCapableDepth,
  isEligibleForBacktest,
  backtestRunning,
  backtestProgress,
  backtestError,
  backtestResults,
  stats,
  chartData,
  onChangeBacktestDepth,
  onRunBacktesting,
}) => {
  return (
    <div className="space-y-6">
      {/* Controller Card */}
      <div className="bg-slate-900/40 p-6 rounded-[2rem] border border-slate-800/80 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
          <div className="space-y-1.5 w-full md:w-auto">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-1.5">
              <Sliders size={14} className="text-fuchsia-400" />
              Paramétrage de l'Audit Temporel
            </h3>
            <p className="text-[11px] text-slate-500">
              Sélecteur de la profondeur de validation glissante du réseau
              de neurones.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-6 w-full md:w-auto">
            {isEligibleForBacktest ? (
              <div className="flex-1 sm:w-64 space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>Profondeur d'Audit :</span>
                  <span className="text-fuchsia-400 font-bold">
                    {backtestDepth} tirages
                  </span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={Math.min(15, maxCapableDepth)}
                  value={backtestDepth}
                  onChange={(e) => onChangeBacktestDepth(parseInt(e.target.value, 10))}
                  disabled={backtestRunning}
                  className="w-full accent-fuchsia-500 cursor-pointer h-1 bg-slate-800 rounded-lg appearance-none"
                  style={{ minHeight: "44px" }}
                />
              </div>
            ) : (
              <span className="text-[10px] text-amber-500 font-mono">
                Max possible : {maxCapableDepth} tirages (insuffisant pour
                audit complet)
              </span>
            )}

            <button
              onClick={onRunBacktesting}
              disabled={backtestRunning || !isEligibleForBacktest}
              className="px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2.5 transition-all duration-300 hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              style={{ minHeight: "44px" }}
            >
              {backtestRunning ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Audit {backtestProgress}%</span>
                </>
              ) : (
                <>
                  <Play size={14} />
                  <span>Lancer l'Évaluation</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {backtestRunning && (
          <div className="w-full h-1 bg-slate-950 rounded-full mt-6 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-indigo-500"
              style={{ width: `${backtestProgress}%` }}
              animate={{ backgroundPosition: ["0px 0px", "100px 0px"] }}
              transition={{ repeat: Infinity, duration: 1 }}
            />
          </div>
        )}
      </div>

      {/* Backtest Error */}
      {backtestError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3">
          <AlertCircle className="text-rose-400 flex-shrink-0" size={16} />
          <div className="space-y-1">
            <p className="text-xs font-bold text-rose-300">
              Anomalie d'exécution
            </p>
            <p className="text-[11px] text-rose-400/95 leading-relaxed">
              {backtestError}
            </p>
          </div>
        </div>
      )}

      {/* Eligibility warning */}
      {!isEligibleForBacktest && (
        <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-[2rem] space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle
              size={18}
              className="text-amber-400 animate-pulse"
            />
            <h4 className="text-xs font-black uppercase text-amber-300 tracking-wide">
              Historique Insuffisant
            </h4>
          </div>
          <p className="text-xs text-amber-400/90 leading-relaxed">
            Le backtesting requiert au moins 11 tirages historiques rédigés
            dans <strong className="text-white">{drawName}</strong> (10
            tirages pour armer l'algorithme spectral et 1 tirage cible
            minimum pour tester). Actuellement, vous disposez uniquement de{" "}
            <strong className="text-white">{historyLength}</strong>{" "}
            tirages. Veuillez injecter ou charger davantage de données.
          </p>
        </div>
      )}

      {/* Results Display */}
      <AnimatePresence mode="wait">
        {backtestRunning ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 bg-slate-950/20 rounded-[2rem] border border-slate-800/50"
          >
            <BrainCircuit
              className="text-indigo-400 animate-pulse mb-4"
              size={32}
            />
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-300">
              Backtesting Récursif Temporel
            </h4>
            <p className="text-[10px] text-slate-500 mt-2 max-w-xs text-center leading-relaxed">
              L'IA simule l'état exact du pool stochastique à chaque tirage
              passé, gère sans biais les données temporelles, et compare les
              configurations de poids.
            </p>
          </motion.div>
        ) : stats && backtestResults ? (
          <motion.div
            key="backtest-active-results"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            {/* Summary Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800/80 shadow-md">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">
                    Taux de Résonance
                  </span>
                  <Award size={14} className="text-fuchsia-400" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg md:text-2xl font-black text-white">
                    {stats.resonanceRate.toFixed(1)}%
                  </span>
                  <span className="text-[9px] text-fuchsia-400/90 font-mono">
                    vs 25.4% aléatoire
                  </span>
                </div>
                <span className="text-[8px] text-slate-500 mt-1 block">
                  Tirages ayant au moins 1 direct hit
                </span>
              </div>

              <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800/80 shadow-md">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">
                    Moyenne Direct Hits
                  </span>
                  <Target size={14} className="text-indigo-400" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg md:text-2xl font-black text-white">
                    {stats.avgDirectHits.toFixed(2)}
                  </span>
                  <span className="text-[9px] text-indigo-400/95 font-mono">
                    /tirage
                  </span>
                </div>
                <span className="text-[8px] text-slate-500 mt-1 block">
                  Hits directs par tirage testé (sur 5)
                </span>
              </div>

              <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800/80 shadow-md">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">
                    Signification (Z-Score)
                  </span>
                  <TrendingUp size={14} className="text-emerald-400" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg md:text-2xl font-black text-white">
                      {stats.zScore >= 0
                        ? `+${stats.zScore.toFixed(2)}`
                        : stats.zScore.toFixed(2)}{" "}
                      σ
                    </span>
                  </div>
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[7.5px] font-bold uppercase tracking-wider leading-none
                      ${
                        stats.zScore > 1.96
                          ? "bg-emerald-550/10 text-emerald-400 border border-emerald-500/20"
                          : stats.zScore > 0
                            ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                            : "bg-slate-800 text-slate-400"
                      }`}
                  >
                    {stats.zScore > 1.96
                      ? "Hautement Significatif (>95%)"
                      : stats.zScore > 0
                        ? "Supérieur à l'aléatoire"
                        : "Ligne de base"}
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800/80 shadow-md">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">
                    Gain Déterministe
                  </span>
                  <Compass size={14} className="text-amber-400" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg md:text-2xl font-black text-white">
                    x{stats.alphaGain.toFixed(1)}
                  </span>
                  <span className="text-[9px] text-amber-400 font-mono">
                    vs Aléatoire
                  </span>
                </div>
                <span className="text-[8px] text-slate-500 mt-1 block">
                  Multiplicateur de capture d'information
                </span>
              </div>
            </div>

            {/* Recharts Visualisation */}
            <div className="bg-slate-900/30 p-6 rounded-[2rem] border border-slate-800/80 shadow-xl">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2 mb-6">
                <TrendingUp size={14} className="text-indigo-400" />
                Dynamique de Convergence d'Audit Temporel
              </h3>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 30, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="tirage"
                      stroke="#64748b"
                      fontSize={9}
                      fontFamily="monospace"
                    />
                    <YAxis
                      stroke="#64748b"
                      domain={[0, 5]}
                      fontSize={9}
                      tickCount={6}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#020617",
                        borderColor: "#1e293b",
                        borderRadius: "1rem",
                        fontSize: "10px",
                      }}
                    />
                    <Legend
                      wrapperStyle={{
                        fontSize: "10px",
                        paddingTop: "10px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Hits Directs"
                      stroke="#d946ef"
                      strokeWidth={3}
                      activeDot={{ r: 6 }}
                      dot={{ strokeWidth: 2, r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Hits Candidats"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Detailed History list */}
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
                <ListFilter size={14} className="text-fuchsia-400" />
                Journal Médico-Légal de Validation
              </h3>

              <div className="space-y-3">
                {backtestResults.map((res) => {
                  const totalHits =
                    res.suggestedHits.length + res.candidatesHits.length;
                  return (
                    <div
                      key={res.drawId}
                      className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/70 hover:border-slate-700/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 flex items-center gap-1">
                            <Calendar size={10} />
                            {res.date.split("T")[0]}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-950 font-mono text-[9px] font-bold text-slate-300 border border-slate-800 rounded-md">
                            Tirage #{res.drawId.split("-")[0].slice(0, 8)}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          Indice de confiance initial : {res.confidence}%
                        </p>
                      </div>

                      {/* Numbers Grid */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 flex-1 justify-end">
                        <div>
                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                            Sélection Directe prédite
                          </span>
                          <div className="flex gap-1.5 flex-wrap">
                            {res.suggestedPredicted.map((num) => {
                              const isHit = res.suggestedHits.includes(num);
                              const isVoisin = res.nearMisses.some(
                                (v) => v.num === num && v.type === "voisin",
                              );
                              const isMirror = res.nearMisses.some(
                                (v) => v.num === num && v.type === "miroir",
                              );

                              return (
                                <div
                                  key={num}
                                  className={`w-8 h-8 rounded-full flex flex-col items-center justify-center font-black font-mono text-[11px] transition-all
                                    ${
                                      isHit
                                        ? "bg-fuchsia-500 text-white shadow-md shadow-fuchsia-500/20 scale-105 border border-fuchsia-400"
                                        : isVoisin
                                          ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/20"
                                          : isMirror
                                            ? "bg-amber-500/10 text-amber-300 border border-amber-500/40 hover:bg-amber-500/20 animate-pulse"
                                            : "bg-slate-950 text-slate-500 border border-slate-800"
                                    }`}
                                  title={
                                    isHit
                                      ? "HIT Direct !"
                                      : isVoisin
                                        ? "Near Miss Voisin (+/-1) !"
                                        : isMirror
                                          ? "Near Miss Miroir (inversé) !"
                                          : ""
                                  }
                                >
                                  {String(num).padStart(2, "0")}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                            Gagnants Réels du Tirage
                          </span>
                          <div className="flex gap-1.5 flex-wrap">
                            {res.actualGagnants.map((num) => {
                              const wasFoundDirect =
                                res.suggestedHits.includes(num);
                              const wasFoundCandidate =
                                res.candidatesHits.includes(num);

                              return (
                                <div
                                  key={num}
                                  className={`w-8 h-8 rounded-full flex items-center justify-center font-black font-mono text-[11px] border
                                    ${
                                      wasFoundDirect
                                        ? "bg-gradient-to-br from-fuchsia-500 to-indigo-500 text-white border-white/40 shadow-inner"
                                        : wasFoundCandidate
                                          ? "bg-indigo-950 text-indigo-300 border-indigo-500/30"
                                          : "bg-slate-800/40 text-slate-300 border-slate-700/40"
                                    }`}
                                >
                                  {String(num).padStart(2, "0")}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Row statistics summary */}
                      <div className="border-t md:border-t-0 md:border-l border-slate-850 pt-3 md:pt-0 md:pl-5 flex flex-col justify-center items-start md:items-end min-w-[120px] shrink-0">
                        <span className="text-[9px] font-black uppercase text-slate-400">
                          {totalHits} Hit{totalHits > 1 ? "s" : ""} total
                        </span>
                        <div className="text-[8.5px] text-slate-500 mt-0.5 space-y-0.5 md:text-right">
                          {res.suggestedHits.length > 0 && (
                            <p className="text-fuchsia-400 font-bold">
                              {res.suggestedHits.length} Sélections Directes
                            </p>
                          )}
                          {res.candidatesHits.length > 0 && (
                            <p className="text-indigo-400 font-bold">
                              {res.candidatesHits.length} Candidats
                            </p>
                          )}
                          {res.nearMisses.length > 0 && (
                            <p className="text-amber-400/90">
                              {res.nearMisses.length} Near Misses
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="backtest-idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 bg-slate-950/30 rounded-[2rem] border border-dashed border-slate-850 text-center p-6"
          >
            <div className="p-4 bg-fuchsia-500/5 rounded-full border border-fuchsia-500/10 mb-4">
              <Activity
                size={32}
                className="text-slate-600 dark:text-slate-400"
              />
            </div>
            <h4 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              Ajustement de l'ADN Algorithmique
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mt-2 leading-relaxed font-medium">
              Configurez la profondeur temporelle ci-dessus et cliquez sur
              lancer pour initier l'audit retrospectif du moteur de
              transition stochastique.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
