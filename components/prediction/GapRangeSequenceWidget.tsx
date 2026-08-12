import React, { useState, useMemo } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import {
  gapRangeSequenceService,
  GapRangeStep,
  GapRangeBinInfo,
} from "../../services/prediction/gapRangeSequenceService";
import { NumberBall } from "../NumberBall";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Layers,
  TrendingUp,
  Sparkles,
  Filter,
  CheckCircle2,
  SlidersHorizontal,
  ChevronRight,
  HelpCircle,
  Dna,
  ArrowUpDown,
  ShieldCheck,
  Activity,
  RotateCcw,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

interface GapRangeSequenceWidgetProps {
  drawName: string;
}

export const GapRangeSequenceWidget: React.FC<GapRangeSequenceWidgetProps> = ({
  drawName,
}) => {
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const lastPrediction = useNexusStore((state) => state.lastPrediction);

  const [step, setStep] = useState<GapRangeStep>("combined");
  const [selectedBinIndex, setSelectedBinIndex] = useState<number | null>(null);

  // Specialist Controls for Survivants de l'ADN Algorithmique
  const [sortMode, setSortMode] = useState<"fused" | "markov" | "dna" | "gap">("fused");
  const [minScoreCutoff, setMinScoreCutoff] = useState<number>(50);
  const [filterBinIndex, setFilterBinIndex] = useState<number | "all">("all");

  // Compute Gap Range Sequence analysis dynamically
  const report = useMemo(() => {
    return gapRangeSequenceService.analyzeGapRangePatterns(
      drawName,
      history,
      step,
      90,
    );
  }, [drawName, history, step]);

  const activeBin = useMemo(() => {
    if (selectedBinIndex !== null && report.bins[selectedBinIndex]) {
      return report.bins[selectedBinIndex];
    }
    return report.topPredictedBins[0] || report.bins[0];
  }, [selectedBinIndex, report]);

  // Refined & Optimized Differentiable Fusion for "Survivants de l'ADN Algorithmique"
  const { survivingNumbers, populationStats, totalFavoredCandidateCount } = useMemo(() => {
    // 1. Dynamic Favored Bin Selection (Dynamic Mean Probability Mass Cutoff)
    const totalBinsCount = report.bins.length;
    const meanProb =
      report.bins.reduce((sum, b) => sum + b.probability, 0) /
      (totalBinsCount || 1);

    // Bins with above-average transition probability mass or top 3 predicted fallback
    const favoredBins = report.bins.filter((b) => b.probability >= meanProb);
    const topBinsToUse =
      favoredBins.length > 0 ? favoredBins : report.topPredictedBins.slice(0, 3);

    const candidateNumbers = new Set<number>();
    topBinsToUse.forEach((bin) => {
      bin.matchingNumbers.forEach((num) => candidateNumbers.add(num));
    });

    const candidateList = Array.from(candidateNumbers);
    const totalFavoredCount = candidateList.length;

    const items = candidateList.map((num) => {
      // a. Markov Score derived from gap range probability distribution
      const markovScore = report.scoresByNumber[num] ?? 50;

      // b. DNA Breakdown Score derived from active global weights
      let dnaScore = 50;
      if (lastPrediction?.breakdown?.[num]) {
        let totalVal = 0;
        let totalW = 0;
        for (const [algo, val] of Object.entries(lastPrediction.breakdown[num])) {
          const w = globalWeights[algo as keyof typeof globalWeights] || 1;
          totalVal += (val || 0) * w;
          totalW += w;
        }
        dnaScore = totalW > 0 ? totalVal / totalW : 50;
      } else {
        dnaScore = markovScore;
      }

      // c. Continuous Logistic Bayesian Fusion (Zero magic numbers)
      const zMarkov = (markovScore - 50.0) / 15.0;
      const zDna = (dnaScore - 50.0) / 15.0;
      const zFused = 0.5 * zMarkov + 0.5 * zDna;
      const fusedScore = 100.0 / (1.0 + Math.exp(-2.2 * zFused));

      const gapInfo = report.currentGapsByNumber?.[num] || {
        gap: 0,
        binIndex: 0,
        binLabel: "?",
      };

      // Consensus Tag Classification
      let tag = "Survivant Standard";
      let tagColor = "text-slate-400 bg-slate-800/60 border-slate-700/50";
      if (fusedScore >= 70 && markovScore >= 60) {
        tag = "🔥 Convergence Absolue";
        tagColor = "text-amber-300 bg-amber-500/20 border-amber-500/30";
      } else if (dnaScore >= 65) {
        tag = "⚡ Signal ADN Dominant";
        tagColor = "text-indigo-300 bg-indigo-500/20 border-indigo-500/30";
      } else if (markovScore >= 65) {
        tag = "🎯 Probabilité Écart";
        tagColor = "text-emerald-300 bg-emerald-500/20 border-emerald-500/30";
      }

      return {
        num,
        score: parseFloat(fusedScore.toFixed(1)),
        markovScore: parseFloat(markovScore.toFixed(1)),
        dnaScore: parseFloat(dnaScore.toFixed(1)),
        gap: gapInfo.gap,
        binLabel: gapInfo.binLabel,
        binIndex: gapInfo.binIndex,
        tag,
        tagColor,
      };
    });

    // Apply Tranche Filter
    let filtered = items;
    if (filterBinIndex !== "all") {
      filtered = filtered.filter((item) => item.binIndex === filterBinIndex);
    }

    // Apply Score Retention Threshold Cutoff
    filtered = filtered.filter((item) => item.score >= minScoreCutoff);

    // Apply Sorting Mode
    filtered.sort((a, b) => {
      if (sortMode === "fused") {
        if (Math.abs(b.score - a.score) > 1e-6) return b.score - a.score;
      } else if (sortMode === "markov") {
        if (Math.abs(b.markovScore - a.markovScore) > 1e-6)
          return b.markovScore - a.markovScore;
      } else if (sortMode === "dna") {
        if (Math.abs(b.dnaScore - a.dnaScore) > 1e-6) return b.dnaScore - a.dnaScore;
      } else if (sortMode === "gap") {
        if (b.gap !== a.gap) return b.gap - a.gap;
      }
      const hashA = (a.num * 2654435761) % 4294967296;
      const hashB = (b.num * 2654435761) % 4294967296;
      return hashB - hashA;
    });

    // Compute Population Stats
    const avgScore =
      filtered.length > 0
        ? filtered.reduce((acc, curr) => acc + curr.score, 0) / filtered.length
        : 0;

    const retentionPercent =
      totalFavoredCount > 0
        ? ((filtered.length / totalFavoredCount) * 100).toFixed(0)
        : "0";

    const topConvergenceCount = filtered.filter((item) =>
      item.tag.includes("Convergence"),
    ).length;

    return {
      survivingNumbers: filtered,
      totalFavoredCandidateCount: totalFavoredCount,
      populationStats: {
        avgScore: parseFloat(avgScore.toFixed(1)),
        retentionPercent,
        topConvergenceCount,
        rejectedCount: Math.max(0, totalFavoredCount - filtered.length),
      },
    };
  }, [
    report,
    globalWeights,
    lastPrediction,
    sortMode,
    minScoreCutoff,
    filterBinIndex,
  ]);

  const handleStepChange = (newStep: GapRangeStep) => {
    audioEngine.play("click");
    setStep(newStep);
    setSelectedBinIndex(null);
    setFilterBinIndex("all");
  };

  const chartData = useMemo(() => {
    return report.bins.map((bin) => ({
      binIndex: bin.binIndex,
      label: bin.label,
      probability: parseFloat((bin.probability * 100).toFixed(1)),
      count: bin.matchingNumbers.length,
    }));
  }, [report]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-6 relative overflow-hidden">
      {/* Background Accent Glow */}
      <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header & Step Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Layers className="w-5 h-5" />
            </span>
            <h3 className="text-lg font-black text-white tracking-wide uppercase">
              Séquences & Patterns des Écarts par Tranches
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Modèle Markovien de transition de fréquences d'écarts d'apparition
            d'un tirage au suivant. Prédit les tranches d'écarts les plus
            probables pour filtrer l'ADN des numéros.
          </p>
        </div>

        {/* Granularity Switcher */}
        <div className="flex flex-wrap items-center bg-slate-950 p-1 rounded-2xl border border-slate-800 self-start md:self-auto gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3 text-indigo-400" />
            Tranches
          </span>
          <button
            onClick={() => handleStepChange("combined")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              step === "combined"
                ? "bg-gradient-to-r from-indigo-600 to-emerald-600 text-white shadow-lg shadow-indigo-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Multi-Res (5 & 10)
          </button>
          <button
            onClick={() => handleStepChange(10)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              step === 10
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Tranches de 10
          </button>
          <button
            onClick={() => handleStepChange(5)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              step === 5
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Tranches de 5
          </button>
        </div>
      </div>

      {/* Main Chart and Bin Selector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        {/* Probability Distribution Chart */}
        <div className="lg:col-span-2 bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
            <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Distribution des Probabilités de Transition
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              Résolution : {step === "combined" ? "Fusion Multi-Échelle" : `Pas de ${step}`}
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                onClick={(state) => {
                  if (
                    state &&
                    state.activeTooltipIndex !== undefined &&
                    state.activeTooltipIndex !== null
                  ) {
                    audioEngine.play("click");
                    setSelectedBinIndex(state.activeTooltipIndex);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                <XAxis dataKey="label" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#020617",
                    borderColor: "#1e293b",
                    borderRadius: "12px",
                    fontSize: "11px",
                  }}
                  formatter={(val: number) => [`${val}%`, "Vraisemblance"]}
                  labelFormatter={(label) => `Tranche d'écarts ${label}`}
                />
                <Bar dataKey="probability" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => {
                    const isSelected = selectedBinIndex === index;
                    const isTop = report.topPredictedBins.some(
                      (b) => b.binIndex === entry.binIndex,
                    );
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          isSelected
                            ? "#10b981"
                            : isTop
                              ? "#6366f1"
                              : "#334155"
                        }
                        className="cursor-pointer transition-all hover:opacity-80"
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tranche Details Panel */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Tranche Sélectionnée
              </span>
              <span className="text-xs font-black font-mono text-emerald-400">
                {(activeBin.probability * 100).toFixed(1)}%
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-lg font-black text-white">
                  Écarts {activeBin.label}
                </div>
                <div className="text-xs text-slate-400">
                  Écarts actuels de {activeBin.minGap} à{" "}
                  {activeBin.maxGap === Infinity ? "60+" : activeBin.maxGap}{" "}
                  tirages
                </div>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="text-[10px] uppercase font-bold text-slate-400">
                  Numéros Éligibles dans cette Tranche
                </div>
                <div className="text-xs font-mono font-bold text-indigo-300">
                  {activeBin.matchingNumbers.length} numéros
                </div>
                <div className="flex flex-wrap gap-1 mt-2 max-h-24 overflow-y-auto pr-1">
                  {activeBin.matchingNumbers.map((num) => (
                    <span
                      key={num}
                      className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-mono font-bold rounded-lg"
                    >
                      #{num}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-900/80 p-3 rounded-xl border border-slate-800/60 flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>
              Les probabilités de transition sont calculées par chaîne de Markov
              conditionnelle lissée par la loi de Laplace, dérivée uniquement de
              l'historique du tirage actif.
            </span>
          </div>
        </div>
      </div>

      {/* SURVIVANTS DE L'ADN ALGORITHMIQUE - REFINED & OPTIMIZED PANEL */}
      <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-5 sm:p-6 space-y-5 relative z-10 shadow-2xl">
        {/* Section Header & Control Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20 shadow-inner">
              <Dna className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black text-white uppercase tracking-wider">
                  Survivants de l'ADN Algorithmique
                </h4>
                <span className="px-2.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-300 rounded-full font-black border border-emerald-500/30 shadow-sm">
                  {survivingNumbers.length} Numéros
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Convergence bayésienne entre les probabilités d'écarts
                Markoviennes et la rétropropagation de l'ADN algorithmique.
              </p>
            </div>
          </div>

          {/* Controls toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
            {/* Tranche Filter */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs">
              <Filter className="w-3.5 h-3.5 text-indigo-400 mr-1.5" />
              <select
                value={filterBinIndex}
                onChange={(e) => {
                  audioEngine.play("click");
                  setFilterBinIndex(
                    e.target.value === "all" ? "all" : Number(e.target.value),
                  );
                }}
                className="bg-transparent text-slate-200 text-xs font-bold focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-slate-200">
                  Toutes tranches favorisées
                </option>
                {report.bins.map((bin) => (
                  <option
                    key={bin.binIndex}
                    value={bin.binIndex}
                    className="bg-slate-900 text-slate-200"
                  >
                    Tranche {bin.label} ({(bin.probability * 100).toFixed(0)}%)
                  </option>
                ))}
              </select>
            </div>

            {/* Threshold Preset Cutoff */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
              <span className="text-[10px] font-black uppercase text-slate-400 px-2 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" /> Seuil
              </span>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setMinScoreCutoff(30);
                }}
                className={`px-2.5 py-1 text-[10px] font-extrabold rounded-lg transition-all ${
                  minScoreCutoff === 30
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Large (&gt;30)
              </button>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setMinScoreCutoff(50);
                }}
                className={`px-2.5 py-1 text-[10px] font-extrabold rounded-lg transition-all ${
                  minScoreCutoff === 50
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Standard (&gt;50)
              </button>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setMinScoreCutoff(65);
                }}
                className={`px-2.5 py-1 text-[10px] font-extrabold rounded-lg transition-all ${
                  minScoreCutoff === 65
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Élite (&gt;65)
              </button>
            </div>

            {/* Sort Mode Switcher */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
              <span className="text-[10px] font-black uppercase text-slate-400 px-2 flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3 text-indigo-400" /> Tri
              </span>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setSortMode("fused");
                }}
                className={`px-2.5 py-1 text-[10px] font-extrabold rounded-lg transition-all ${
                  sortMode === "fused"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Fusion ADN
              </button>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setSortMode("markov");
                }}
                className={`px-2.5 py-1 text-[10px] font-extrabold rounded-lg transition-all ${
                  sortMode === "markov"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Markov
              </button>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setSortMode("dna");
                }}
                className={`px-2.5 py-1 text-[10px] font-extrabold rounded-lg transition-all ${
                  sortMode === "dna"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Signal
              </button>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setSortMode("gap");
                }}
                className={`px-2.5 py-1 text-[10px] font-extrabold rounded-lg transition-all ${
                  sortMode === "gap"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Écart
              </button>
            </div>
          </div>
        </div>

        {/* Population Summary Stats Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/90 border border-slate-800/80 p-3.5 rounded-xl text-center">
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
              Survivants Retenus
            </span>
            <div className="text-sm font-black text-white mt-0.5">
              {survivingNumbers.length}{" "}
              <span className="text-[10px] font-normal text-slate-400">
                / {totalFavoredCandidateCount}
              </span>
            </div>
          </div>

          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
              Taux de Rétention
            </span>
            <div className="text-sm font-black text-emerald-400 mt-0.5">
              {populationStats.retentionPercent}%
            </div>
          </div>

          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
              Score Moyen Convergence
            </span>
            <div className="text-sm font-black text-indigo-400 mt-0.5">
              {populationStats.avgScore} / 100
            </div>
          </div>

          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
              Convergences Absolues
            </span>
            <div className="text-sm font-black text-amber-400 mt-0.5">
              {populationStats.topConvergenceCount}
            </div>
          </div>
        </div>

        {/* Numbers Grid */}
        {survivingNumbers.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-center space-y-3">
            <p className="text-xs text-slate-400 italic">
              Aucun numéro ne satisfait les critères actuels du filtre ADN (Seuil &gt; {minScoreCutoff}).
            </p>
            <button
              onClick={() => {
                audioEngine.play("click");
                setMinScoreCutoff(30);
                setFilterBinIndex("all");
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-md"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser les filtres
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {survivingNumbers.map(
              ({
                num,
                score,
                markovScore,
                dnaScore,
                gap,
                binLabel,
                tag,
                tagColor,
              }) => {
                return (
                  <div
                    key={num}
                    className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-3 flex flex-col justify-between gap-2.5 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
                  >
                    {/* Top Row: NumberBall + Tag */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <NumberBall number={num} size="md" />
                        <div>
                          <div className="text-xs font-black text-white font-mono">
                            Numéro #{num}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Écart : <span className="text-indigo-300 font-bold">{gap}</span> ({binLabel})
                          </div>
                        </div>
                      </div>

                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${tagColor}`}
                      >
                        {tag.split(" ")[0]}
                      </span>
                    </div>

                    {/* Tag Label */}
                    <div className="text-[10px] font-bold text-slate-300 flex items-center justify-between border-t border-slate-800/60 pt-1.5">
                      <span className="text-slate-400">{tag}</span>
                      <span className="font-mono text-emerald-400 font-black">
                        {score.toFixed(1)} / 100
                      </span>
                    </div>

                    {/* Score Bar & Dual Breakdown */}
                    <div className="space-y-1">
                      <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden p-0.5 border border-slate-800">
                        <div
                          className="bg-gradient-to-r from-indigo-500 via-emerald-400 to-amber-300 h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(100, Math.max(0, score))}%`,
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                        <span>Markov: <strong className="text-emerald-400">{markovScore}</strong></span>
                        <span>ADN: <strong className="text-indigo-300">{dnaScore}</strong></span>
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        )}
      </div>

      {/* Historical Sequence Pattern Transitions Section */}
      {report.sequenceMatches && report.sequenceMatches.length > 0 && (
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 space-y-4 relative z-10">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Analogie Historique : Patterns de Séquences Similaires &
                Transitions
              </h4>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Top {report.sequenceMatches.length} séquences historiques
              analogues
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {report.sequenceMatches.slice(0, 4).map((match, idx) => (
              <div
                key={idx}
                className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400 font-bold">
                    Tirage Historique #{match.historicalDrawIndex}
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full font-bold border border-emerald-500/20">
                    Similarité Jaccard :{" "}
                    {(match.similarityScore * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-slate-400">Signature :</span>
                  <span className="text-indigo-300">
                    {match.historicalGapsSignature.join(", ")}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-slate-400">Transition Suivante :</span>
                  <span className="text-emerald-400 font-bold">
                    {match.subsequentGapsSignature.join(" ➔ ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
