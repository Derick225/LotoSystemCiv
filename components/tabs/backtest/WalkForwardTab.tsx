import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  BacktestingFramework,
  WalkForwardMetric,
  MonteCarloResult,
} from "../../../services/backtestingFramework";
import { BettingStrategy } from "../../../services/backtestingEngine";
import {
  Play,
  RefreshCw,
  Activity,
  Dna,
} from "lucide-react";
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from "recharts";
import { audioEngine } from "../../../utils/audioEngine";

interface WalkForwardTabProps {
  drawName: string;
  history: any[];
  globalWeights: any;
}

export const WalkForwardTab: React.FC<WalkForwardTabProps> = React.memo(
  ({ drawName, history, globalWeights }) => {
    // Walk Forward Advanced State
    const [wfResults, setWfResults] = useState<Record<string, WalkForwardMetric> | null>(null);
    const [wfRunning, setWfRunning] = useState(false);
    const [wfProgress, setWfProgress] = useState(0);

    // Monte Carlo Advanced State
    const [mcResults, setMcResults] = useState<MonteCarloResult | null>(null);
    const [mcRunning, setMcRunning] = useState(false);

    // Params state
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
          strategy === "CONFIDENCE_SMART" ? "FLAT" : (strategy as any),
          initialBankroll,
          unitBet,
          (p) => {
            if (isMounted.current) setWfProgress(p);
          },
          payoutModel,
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
            strategyWeights: globalWeights,
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

    return (
      <div className="space-y-8 animate-slide-up w-full">
        {/* Walk Forward Cybernetic Controller */}
        <div className="bg-slate-900/80 p-8 md:p-10 rounded-3xl border border-slate-800/80 shadow-2xl relative overflow-hidden group">
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
                <label
                  htmlFor="wf-depth"
                  className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2"
                >
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
                <label
                  htmlFor="wf-strategy"
                  className="block text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2"
                >
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
                          <div className="text-[9px] font-black uppercase text-slate-500 tracking-wider">
                            Modèle de Test
                          </div>
                          <h4 className="text-xl font-black text-white uppercase tracking-tight">
                            {metric.strategyName}
                          </h4>
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
                          <span className="text-[8px] font-bold uppercase text-slate-500">
                            Solde Final
                          </span>
                          <div className="text-sm font-black text-white">
                            {metric.finalBankroll.toLocaleString()} F
                          </div>
                        </div>
                        <div className="bg-black/30 p-3 rounded-2xl border border-white/5 text-center">
                          <span className="text-[8px] font-bold uppercase text-slate-500">
                            Drawdown Max
                          </span>
                          <div className="text-sm font-black text-rose-400">
                            -{metric.maxDrawdown}%
                          </div>
                        </div>
                        <div className="bg-black/30 p-3 rounded-2xl border border-white/5 text-center" title="Brier Score du modèle (plus bas = calibration idéale)">
                          <span className="text-[8px] font-bold uppercase text-slate-500">
                            Brier Score
                          </span>
                          <div className="text-sm font-black text-indigo-400">
                            {metric.brierScore}
                          </div>
                        </div>
                      </div>

                      {/* Hits Distributions */}
                      <div className="mb-4">
                        <div className="text-[9px] font-black uppercase text-indigo-400 tracking-wider mb-2">
                          Répartition des Hits (Tirages gagnés)
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          {[1, 2, 3, 4, 5].map((k) => {
                            const count = metric.totalHits[k as 1 | 2 | 3 | 4 | 5] || 0;
                            return (
                              <div
                                key={k}
                                className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-center"
                              >
                                <div className="text-[8px] font-black text-slate-500">
                                  {k}★
                                </div>
                                <div className="text-xs font-black text-white">
                                  {count}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Audits & Diagnostics */}
                    <div className="pt-4 border-t border-slate-800/60 grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <span className="text-[8px] font-bold uppercase text-slate-500 block">
                          Indice UFI Moyen
                        </span>
                        <span className="text-xs font-black text-slate-300">
                          {metric.avgUFI} / 100
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[8px] font-bold uppercase text-slate-500 block">
                          Anomalies de l'UFI
                        </span>
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
                        "Adversarial Defensive": wfResults["Adversarial Defensive"]?.history[idx]?.balance || 0,
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
                        fontSize: "10px",
                      }}
                    />
                    <Legend
                      wrapperStyle={{
                        fontSize: "9px",
                        textTransform: "uppercase",
                        fontWeight: "900",
                      }}
                    />
                    <Line type="monotone" strokeWidth={1.5} dataKey="Baseline Random" stroke="#64748b" dot={false} />
                    <Line type="monotone" strokeWidth={1.5} dataKey="Frequency Only" stroke="#f59e0b" dot={false} />
                    <Line type="monotone" strokeWidth={3} dataKey="Full Hybrid" stroke="#6366f1" dot={false} />
                    <Line type="monotone" strokeWidth={3} dataKey="Adversarial Defensive" stroke="#10b981" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Calibration Curve and Monte Carlo Chart */}
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
                    <BarChart data={wfResults["Full Hybrid"]?.calibrationCurve || []} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.05} />
                      <XAxis dataKey="label" stroke="#475569" fontSize={9} />
                      <YAxis stroke="#475569" fontSize={9} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#020617",
                          border: "none",
                          fontSize: "10px",
                          borderRadius: "12px",
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
                        <span className="text-[8px] font-bold text-slate-500 uppercase">
                          Risque de Ruine
                        </span>
                        <div className={`text-sm font-black ${mcResults.ruinRisk > 10 ? "text-rose-400" : "text-emerald-400"}`}>
                          {mcResults.ruinRisk}%
                        </div>
                      </div>
                      <div className="text-center">
                        <span className="text-[8px] font-bold text-slate-500 uppercase font-black">
                          Capital Médian
                        </span>
                        <div className="text-sm font-black text-indigo-400">
                          {Math.round(mcResults.medianFinalBalance).toLocaleString()} F
                        </div>
                      </div>
                      <div className="text-center" title="Sharpe Ratio espéré sous de fortes perturbations">
                        <span className="text-[8px] font-bold text-slate-500 uppercase">
                          Ratio Sharpe
                        </span>
                        <div className="text-sm font-black text-amber-400">
                          {mcResults.expectedSharpe}
                        </div>
                      </div>
                    </div>

                    {/* Projection bounds */}
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-wide flex justify-between px-2 mb-2">
                      <span>Pessimiste (P5): {Math.round(mcResults.p5).toLocaleString()} F</span>
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
    );
  }
);
