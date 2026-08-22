import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  getCyclicCandidates,
  getSeasonalAffinity,
  getDayAffinity,
  getCrossMonthResonanceAnalysis,
  getCausalFlowAnalysis,
  type CyclicCandidate,
  type CrossMonthResonanceAnalysis,
  type CausalFlowAnalysis,
  type CausalDependencyFlow,
} from "../../services/temporalAnalysisService";
import { NumberBall } from "../NumberBall";
import { useNexusStore } from "../../store/useNexusStore";
import {
  RotateCw,
  Link,
  ArrowRight,
  Hourglass,
  Calendar,
  TrendingUp,
  Sparkles,
  Activity,
  Dna,
  Zap,
  Layers,
  Filter,
  Compass,
  Cpu,
  ShieldCheck,
  BarChart3,
  Waves,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type CycleBandFilter = "ALL" | "ULTRA-COURT" | "COURT" | "MOYEN" | "LONG" | "CRITICAL";
type CausalSourceTab = "GAGNANTS" | "MACHINES" | "ATTRACTEURS";

export const TemporalTab: React.FC<{ drawName: string }> = ({ drawName }) => {
  const history = useNexusStore((state) => state.history);
  const regularity = useNexusStore((state) => state.regularity);
  const nexusLoading = useNexusStore((state) => state.loading);
  const globalWeights = useNexusStore((state) => state.globalWeights);

  const [cyclicData, setCyclicData] = useState<CyclicCandidate[]>([]);
  const [cycleBandFilter, setCycleBandFilter] = useState<CycleBandFilter>("ALL");
  const [seasonalData, setSeasonalData] = useState<{ number: number; count: number }[]>([]);
  const [decayTrendData, setDecayTrendData] = useState<{ number: number; score: number }[]>([]);
  const [currentMonthName, setCurrentMonthName] = useState("");
  const [crossMonthResonance, setCrossMonthResonance] = useState<CrossMonthResonanceAnalysis | null>(null);
  const [selectedResonanceMonth, setSelectedResonanceMonth] = useState<number | null>(null);

  // Causal Flux State
  const [causalAnalysis, setCausalAnalysis] = useState<CausalFlowAnalysis | null>(null);
  const [causalSourceTab, setCausalSourceTab] = useState<CausalSourceTab>("GAGNANTS");
  const [selectedSourceNum, setSelectedSourceNum] = useState<number | null>(null);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    const load = async () => {
      if (history.length > 5) {
        // 1. Horloges Cycliques & Phase Harmonique
        const cycles = await getCyclicCandidates(drawName, history);
        if (isMounted.current) setCyclicData(cycles);

        // 2. Affinité Saisonnière
        const seasonal = getSeasonalAffinity(history, drawName);
        const monthsFr = [
          "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
          "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
        ];
        if (isMounted.current) {
          setSeasonalData(seasonal.topNumbers.slice(0, 6));
          setCurrentMonthName(monthsFr[seasonal.monthIndex]);
        }

        // 3. Tendance Dynamique Amortie
        const dayAff = getDayAffinity(history, drawName);
        if (isMounted.current) {
          setDecayTrendData(dayAff.slice(0, 6));
        }

        // 4. Résonance Inter-Mensuelle & Tamis ADN Algorithmique
        const resonanceDetail = getCrossMonthResonanceAnalysis(
          history,
          drawName,
          globalWeights,
        );
        if (isMounted.current) {
          setCrossMonthResonance(resonanceDetail);
        }

        // 5. Analyse Complète des Flux de Causalité (Markov & Granger Lift)
        const causalReport = getCausalFlowAnalysis(drawName, history);
        if (isMounted.current) {
          setCausalAnalysis(causalReport);
          if (causalReport.gagnantsCausalFlows.length > 0) {
            setSelectedSourceNum(causalReport.gagnantsCausalFlows[0].source);
          }
        }
      }
    };
    load();
    return () => {
      isMounted.current = false;
    };
  }, [drawName, history, regularity, globalWeights]);

  // Filtered cyclic candidates
  const filteredCycles = useMemo(() => {
    if (cycleBandFilter === "ALL") return cyclicData.slice(0, 9);
    if (cycleBandFilter === "CRITICAL") return cyclicData.filter(c => c.nextDateEstimate === "CRITIQUE" || c.nextDateEstimate === "RETARD").slice(0, 9);
    return cyclicData.filter(c => c.cycleBand === cycleBandFilter).slice(0, 9);
  }, [cyclicData, cycleBandFilter]);

  // Selected flow for active causal source
  const currentCausalFlow = useMemo(() => {
    if (!causalAnalysis) return null;
    const flows = causalSourceTab === "GAGNANTS" 
      ? causalAnalysis.gagnantsCausalFlows 
      : causalAnalysis.machineCausalFlows;
    if (selectedSourceNum === null) return flows[0] || null;
    return flows.find(f => f.source === selectedSourceNum) || flows[0] || null;
  }, [causalAnalysis, causalSourceTab, selectedSourceNum]);

  if (nexusLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
        <Hourglass className="text-amber-500 animate-spin" size={48} />
        <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">
          Synchronisation Temporelle & Flux Causal...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-20 w-full overflow-hidden">
      {/* ========================================================= */}
      {/* 1. MODULE "TEMPS" : HORLOGES CYCLIQUES & HARMONIQUES     */}
      {/* ========================================================= */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 md:p-8 rounded-3xl shadow-2xl border border-slate-800 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-12 transition-transform duration-500">
          <RotateCw size={200} />
        </div>

        <div className="relative z-10">
          {/* Header with band filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/20 rounded-2xl text-amber-500 border border-amber-500/30">
                <Hourglass size={24} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
                  Horloges Cycliques <span className="text-xs text-amber-400 font-mono font-normal">Harmonic PLL</span>
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                  Détection de périodicité spectrale & phase d'oscillation
                </p>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap gap-1.5 bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800">
              {(["ALL", "CRITICAL", "ULTRA-COURT", "COURT", "MOYEN", "LONG"] as CycleBandFilter[]).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setCycleBandFilter(filter)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                    cycleBandFilter === filter
                      ? "bg-amber-500 text-slate-950 shadow-md scale-105"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  {filter === "ALL" ? "Tous" : filter === "CRITICAL" ? "⚡ Critiques" : filter}
                </button>
              ))}
            </div>
          </div>

          {/* Candidates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCycles.map((c, idx) => {
              const isCrit = c.nextDateEstimate === "CRITIQUE";
              const isRetard = c.nextDateEstimate === "RETARD";
              return (
                <motion.div
                  key={c.number}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`p-6 rounded-[2rem] border relative overflow-hidden group hover:-translate-y-1 transition-all duration-300 ${
                    isCrit
                      ? "bg-amber-950/25 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.1)]"
                      : isRetard
                      ? "bg-rose-950/20 border-rose-500/30"
                      : "bg-slate-950/50 border-slate-800/80"
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <NumberBall
                      number={c.number}
                      size="md"
                      glow={isCrit}
                    />
                    <div className="text-right space-y-1">
                      <div
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border ${
                          isCrit
                            ? "text-amber-400 border-amber-500/30 bg-amber-500/10 animate-pulse"
                            : isRetard
                            ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
                            : "text-slate-400 border-slate-700 bg-slate-800/50"
                        }`}
                      >
                        {c.nextDateEstimate}
                      </div>
                      <div className="text-[9px] font-mono text-slate-500 uppercase">
                        Bande {c.cycleBand}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Gap Progression */}
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                        Écart / Cycle Moyen
                      </span>
                      <span className="text-white font-mono font-black text-xs">
                        {c.gap} <span className="text-slate-500">/ {c.avg} moy</span>
                      </span>
                    </div>

                    {/* Continuous Phase Progress Bar */}
                    <div className="w-full h-2 bg-slate-800/80 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isCrit ? "bg-gradient-to-r from-amber-500 to-amber-300" : "bg-gradient-to-r from-indigo-500 to-cyan-400"
                        }`}
                        style={{
                          width: `${Math.min(100, c.phaseProgress)}%`,
                        }}
                      />
                    </div>

                    {/* Metric Indicators */}
                    <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-800/60 text-center">
                      <div className="p-1.5 rounded-xl bg-slate-900/40 border border-slate-800/50">
                        <span className="text-[8px] text-slate-400 uppercase font-black block">Phase θ</span>
                        <span className="text-[11px] font-mono font-bold text-amber-400">{c.phaseAngleDeg}°</span>
                      </div>
                      <div className="p-1.5 rounded-xl bg-slate-900/40 border border-slate-800/50">
                        <span className="text-[8px] text-slate-400 uppercase font-black block">Facteur Q</span>
                        <span className="text-[11px] font-mono font-bold text-cyan-400">{c.qualityFactor}</span>
                      </div>
                      <div className="p-1.5 rounded-xl bg-slate-900/40 border border-slate-800/50">
                        <span className="text-[8px] text-slate-400 uppercase font-black block">Imminence</span>
                        <span className="text-[11px] font-mono font-bold text-emerald-400">{c.harmonicReadiness}%</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. MODULE "RÉSONANCE INTER-MENSUELLE & TAMIS ADN"         */}
      {/* ========================================================= */}
      {crossMonthResonance && crossMonthResonance.sourceMonthIndex !== -1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-slate-900/80 via-indigo-950/40 to-slate-900/90 p-6 md:p-8 rounded-3xl border border-indigo-500/30 shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
            <Dna size={180} className="text-indigo-400" />
          </div>

          <div className="flex flex-col lg:flex-row gap-8 items-start relative z-10">
            {/* Info Card & DNA Sieve Breakdown */}
            <div className="lg:w-5/12 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 rounded-2xl text-amber-400 border border-amber-500/30 shadow-inner">
                  <Dna size={22} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-400 block">
                    Couplage Cohorte & Génome Algorithmique
                  </span>
                  <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                    Résonance Inter-Mensuelle & Tamis ADN
                  </h3>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Modélisation vectorielle de cohorte ({crossMonthResonance.sourceMonthName} →{" "}
                <span className="text-white font-bold">{crossMonthResonance.currentMonthName}</span>, similarité cosinus{" "}
                <strong className="text-emerald-400 font-mono">
                  {(crossMonthResonance.correlation * 100).toFixed(1)}%
                </strong>). Les projections multivariées de cohorte sont filtrées par le tamis continu de l'ADN algorithmique actif.
              </p>

              {/* Concordance Gauge & Telemetry Box */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-indigo-500/20 space-y-3">
                <div className="flex items-center justify-between text-[11px] font-black text-indigo-300 uppercase tracking-wide">
                  <span className="flex items-center gap-1.5"><Activity size={14} className="text-emerald-400" /> Concordance ADN Moyenne</span>
                  <span className="text-emerald-400 font-mono font-bold text-sm">{crossMonthResonance.dnaSieveInfo?.dnaConcordanceMean || 50}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden p-0.5">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 rounded-full transition-all duration-700"
                    style={{ width: `${crossMonthResonance.dnaSieveInfo?.dnaConcordanceMean || 50}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 text-[10px] border-t border-slate-800/80">
                  <div>
                    <span className="text-slate-500 uppercase font-black block">Intensité Tamis :</span>
                    <span className="text-amber-400 font-mono font-bold">
                      {crossMonthResonance.dnaSieveInfo?.sieveIntensityPercent ?? 65}%
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 uppercase font-black block">Entropie Shannon :</span>
                    <span className="text-cyan-300 font-mono font-bold">
                      {crossMonthResonance.dnaSieveInfo?.entropyBits ?? 3.9} bits
                    </span>
                  </div>
                </div>
                <div className="pt-1">
                  <span className="text-[10px] text-slate-400 block mb-1.5 font-bold uppercase tracking-wider">
                    Gènes Dominants Actifs :
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {crossMonthResonance.dnaSieveInfo?.dominantAlgos?.map((algo, i) => (
                      <span
                        key={i}
                        className="text-[9px] font-mono font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 rounded-lg"
                      >
                        {algo}
                      </span>
                    )) || <span className="text-slate-500 text-xs">Génome Global</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Top Sieved Candidates & Cross Matrix */}
            <div className="lg:w-7/12 w-full space-y-6">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Sélection Élite Tamisée (Brut vs Tamisé)
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1">
                    <Sparkles size={10} /> Transfert Continu Boltzmann & Tamis ADN
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {crossMonthResonance.topNumbers.slice(0, 8).map((item) => (
                    <div
                      key={item.number}
                      className="p-3 bg-slate-950/70 hover:bg-slate-950/90 border border-slate-800 hover:border-indigo-500/50 rounded-2xl transition-all duration-300 flex flex-col justify-between gap-2 group shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <NumberBall number={item.number} size="sm" />
                        {item.isDnaBoosted ? (
                          <span className="text-[8px] font-black text-amber-400 uppercase bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                            <Zap size={8} /> +ADN
                          </span>
                        ) : (
                          <span className="text-[8px] font-mono text-slate-500">
                            Δ {item.sieveDeltaPercent > 0 ? `+${item.sieveDeltaPercent}` : item.sieveDeltaPercent}%
                          </span>
                        )}
                      </div>

                      <div className="flex items-end justify-between pt-1 border-t border-slate-800/60">
                        <div>
                          <span className="text-[8px] text-slate-500 uppercase font-black block">Score Tamisé</span>
                          <span className="text-xs font-mono font-black text-emerald-400">{item.score}%</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[8px] text-slate-500 uppercase font-black block">ADN Compat</span>
                          <span className="text-[10px] font-mono font-bold text-indigo-300">{item.dnaCompatibility}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 12-Month Cross Correlation Grid */}
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2.5">
                  Matrice de corrélation temporelle croisée (vs {crossMonthResonance.currentMonthName})
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
                  {crossMonthResonance.allMonthsCorrelation.map((m) => {
                    const isPeak = m.monthIndex === crossMonthResonance.sourceMonthIndex;
                    const isCurrent = m.monthIndex === crossMonthResonance.currentMonthIndex;
                    return (
                      <div
                        key={m.monthIndex}
                        className={`p-2 rounded-xl border flex flex-col justify-between transition-all ${
                          isPeak
                            ? "bg-indigo-500/20 border-indigo-500/40 shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                            : isCurrent
                            ? "bg-slate-900/60 border-slate-700/60"
                            : "bg-slate-950/40 border-slate-800/50"
                        }`}
                      >
                        <div className="flex justify-between items-center mb-0.5">
                          <span
                            className={`text-[8px] font-black uppercase tracking-tight ${
                              isPeak ? "text-indigo-300 font-bold" : isCurrent ? "text-slate-300" : "text-slate-500"
                            }`}
                          >
                            {m.monthName.slice(0, 4)}
                          </span>
                          {isPeak && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
                          {isCurrent && <span className="text-[7px] font-mono font-bold text-indigo-400 uppercase">Actuel</span>}
                        </div>
                        <span
                          className={`text-[11px] font-mono font-bold ${
                            isPeak ? "text-emerald-400" : isCurrent ? "text-slate-300" : "text-slate-400"
                          }`}
                        >
                          {(m.correlation * 100).toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ========================================================= */}
      {/* 3. SAISONNALITÉ & TENDANCES DYNAMIQUES                   */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* SAISONNALITÉ SILVERMAN */}
        <div className="bg-slate-900/60 p-6 md:p-8 rounded-3xl shadow-xl border border-slate-800 relative overflow-hidden">
          <div className="flex items-center gap-3 mb-6 relative z-10">
            <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 border border-indigo-500/20">
              <Calendar size={20} />
            </div>
            <div>
              <h4 className="text-lg font-black text-white uppercase tracking-tight">
                Affinités Saisonnières
              </h4>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">
                Noyau Gaussien de Silverman : Mois de {currentMonthName}
              </p>
            </div>
          </div>

          <div className="space-y-3 relative z-10">
            {seasonalData.map((item) => {
              const maxVal = seasonalData[0]?.count || 1;
              const percentage = Math.round((item.count / maxVal) * 100);
              return (
                <div
                  key={item.number}
                  className="flex items-center justify-between p-3 bg-slate-950/50 rounded-2xl border border-slate-800/80 hover:border-indigo-500/30 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <NumberBall number={item.number} size="sm" />
                    <span className="text-xs text-slate-400 font-mono">
                      Densité KDE
                    </span>
                  </div>
                  <div className="flex items-center gap-4 w-40">
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold text-indigo-400 w-12 text-right">
                      {item.count.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* MOMENTS DYNAMIQUES & OUBLI ADAPTATIF */}
        <div className="bg-slate-900/60 p-6 md:p-8 rounded-3xl shadow-xl border border-slate-800 relative overflow-hidden">
          <div className="flex items-center gap-3 mb-6 relative z-10">
            <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20">
              <TrendingUp size={20} />
            </div>
            <div>
              <h4 className="text-lg font-black text-white uppercase tracking-tight">
                Moments Dynamiques
              </h4>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">
                Décroissance exponentielle couplée à l'exposant de Hurst
              </p>
            </div>
          </div>

          <div className="space-y-3 relative z-10">
            {decayTrendData.map((item) => (
              <div
                key={item.number}
                className="flex items-center justify-between p-3 bg-slate-950/50 rounded-2xl border border-slate-800/80 hover:border-emerald-500/30 transition-all"
              >
                <div className="flex items-center gap-3">
                  <NumberBall number={item.number} size="sm" />
                  <span className="text-xs text-slate-400 font-mono">
                    Élan Adaptatif
                  </span>
                </div>
                <div className="flex items-center gap-4 w-40">
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${item.score}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400 w-12 text-right">
                    {item.score}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. MODULE "FLUX DE CAUSALITÉ" : GRANGER LIFT & ENTROPIE   */}
      {/* ========================================================= */}
      <div className="bg-slate-900/80 p-6 md:p-8 rounded-3xl shadow-2xl border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 relative z-10">
          <div>
            <h4 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <Link className="text-indigo-400" size={22} /> Flux de Causalité & Transfert d'Entropie
            </h4>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">
              Impact vectoriel directionnel T-1 ➔ T (Lift de Granger & Probabilités Markoviennes)
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
            <button
              onClick={() => setCausalSourceTab("GAGNANTS")}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                causalSourceTab === "GAGNANTS"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Gagnants T-1
            </button>
            <button
              onClick={() => setCausalSourceTab("MACHINES")}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                causalSourceTab === "MACHINES"
                  ? "bg-cyan-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Machines T-1
            </button>
            <button
              onClick={() => setCausalSourceTab("ATTRACTEURS")}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                causalSourceTab === "ATTRACTEURS"
                  ? "bg-amber-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ⚡ Attracteurs T
            </button>
          </div>
        </div>

        {/* Content based on sub-tab */}
        {causalSourceTab === "ATTRACTEURS" ? (
          <div className="space-y-4 relative z-10">
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">
                Numéros cibles recevant la plus forte attraction causale combinée depuis les 5 gagnants et 5 machines du tirage précédent.
              </span>
              <span className="text-amber-400 font-mono font-bold">
                Lift Moyen Système : {causalAnalysis?.meanSystemLift || 1.0}x
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {causalAnalysis?.topGlobalAttractors.map((attractor, idx) => (
                <div
                  key={attractor.number}
                  className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-amber-500/40 transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <NumberBall number={attractor.number} size="md" glow={idx === 0} />
                    <div>
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">
                        Attraction Globale
                      </span>
                      <span className="text-sm font-mono font-black text-amber-400">
                        {attractor.totalCausalPull} pts
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] font-black text-slate-500 uppercase block">Max Lift</span>
                    <span className="text-xs font-mono font-bold text-emerald-400">{attractor.maxLift}x</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 relative z-10">
            {/* Interactive Source Nodes Selector */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-black uppercase text-slate-400 tracking-wider">
                Sélectionner la Source :
              </span>
              {(causalSourceTab === "GAGNANTS"
                ? causalAnalysis?.gagnantsCausalFlows
                : causalAnalysis?.machineCausalFlows
              )?.map((flow) => {
                const isSelected = selectedSourceNum === flow.source;
                return (
                  <button
                    key={flow.source}
                    onClick={() => setSelectedSourceNum(flow.source)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border transition-all ${
                      isSelected
                        ? "bg-indigo-600/30 border-indigo-500 text-white shadow-lg scale-105"
                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <NumberBall number={flow.source} size="sm" />
                    <div className="text-left">
                      <span className="text-[8px] font-black uppercase text-slate-400 block">Transitions</span>
                      <span className="text-[10px] font-mono font-bold text-indigo-300">{flow.totalTransitions}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Visual Directional Flow Graph */}
            {currentCausalFlow && (
              <div className="p-6 rounded-3xl bg-slate-950/80 border border-slate-800 space-y-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                        Noeud Source (T-1)
                      </span>
                      <NumberBall number={currentCausalFlow.source} size="lg" glow />
                    </div>
                    <div>
                      <h5 className="text-sm font-black text-white uppercase tracking-tight">
                        Causalité induite depuis le N° {currentCausalFlow.source}
                      </h5>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {currentCausalFlow.totalTransitions} occurrences historiques • Lift moyen: {currentCausalFlow.meanLift}x
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                    <Activity size={14} className="text-emerald-400" />
                    <span className="text-slate-400">Attracteur dominant :</span>
                    <strong className="text-amber-400">N° {currentCausalFlow.dominantAttractor}</strong>
                  </div>
                </div>

                {/* Target Nodes Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {currentCausalFlow.targets.map((tgt, idx) => (
                    <div
                      key={tgt.number}
                      className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-indigo-500/40 transition-all flex flex-col justify-between gap-3 group"
                    >
                      <div className="flex items-center justify-between">
                        <NumberBall number={tgt.number} size="md" />
                        <span className="text-xs font-mono font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg">
                          {tgt.lift}x Lift
                        </span>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span className="text-[10px] font-medium">Probabilité</span>
                          <span className="font-mono font-bold text-white">{tgt.probability}%</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span className="text-[10px] font-medium">Entropie Transf.</span>
                          <span className="font-mono text-cyan-300">{tgt.transferEntropyBits} bits</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span className="text-[10px] font-medium">Z-Score</span>
                          <span className="font-mono text-amber-400">+{tgt.zScore}σ</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
