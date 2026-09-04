import React, { useState, useMemo, useCallback } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import {
  gapRangeSequenceService,
  GapRangeStep,
  GapRangeBinInfo,
} from "../../services/prediction/gapRangeSequenceService";
import { NumberBall } from "../NumberBall";
import { useToast } from "../ui/Toast";
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
  Search,
  Copy,
  Check,
  Flame,
  Zap,
  Target,
  BrainCircuit,
  Sliders,
  Cpu,
  Atom,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

interface GapRangeSequenceWidgetProps {
  drawName: string;
}

type SurvivorSortMode = "fused" | "dna" | "markov" | "quantum" | "proof" | "gap";
type SurvivorCategoryFilter =
  | "ALL"
  | "CONVERGENCE"
  | "DNA_DOMINANT"
  | "MARKOV"
  | "TAMIS_BOOSTED"
  | "CRITICAL_GAP"
  | "PROOF_ONLY";

export const GapRangeSequenceWidget: React.FC<GapRangeSequenceWidgetProps> = ({
  drawName,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const lastPrediction = useNexusStore((state) => state.lastPrediction);

  const [step, setStep] = useState<GapRangeStep>("combined");
  const [selectedBinIndex, setSelectedBinIndex] = useState<number | null>(null);

  // Specialist Controls for Survivants de l'ADN Algorithmique & Filtres
  const [sortMode, setSortMode] = useState<SurvivorSortMode>("fused");
  const [categoryFilter, setCategoryFilter] =
    useState<SurvivorCategoryFilter>("ALL");
  const [minScoreCutoff, setMinScoreCutoff] = useState<number>(50);
  const [filterBinIndex, setFilterBinIndex] = useState<number | "all">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Compute Gap Range Sequence analysis dynamically with Active Algorithmic DNA weights
  const report = useMemo(() => {
    return gapRangeSequenceService.analyzeGapRangePatterns(
      drawName,
      history,
      step,
      90,
      globalWeights
    );
  }, [drawName, history, step, globalWeights]);

  const activeBin = useMemo(() => {
    if (selectedBinIndex !== null && report.bins[selectedBinIndex]) {
      return report.bins[selectedBinIndex];
    }
    return report.topPredictedBins[0] || report.bins[0];
  }, [selectedBinIndex, report]);

  // Refined & Optimized Differentiable Fusion for "Survivants de l'ADN Algorithmique" & Décision Tamisée
  const { survivingNumbers, populationStats, totalFavoredCandidateCount } = useMemo(() => {
    // Check Tirage Isolation on lastPrediction (ZÉRO POLLUTION INTER-TIRAGES)
    const normalizeName = (s?: string) =>
      (s || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/^(loto|tirage)\s+/i, "")
        .replace(/[\s\-_/]+/g, " ")
        .trim();

    const isPredictionForActiveDraw =
      lastPrediction &&
      normalizeName(lastPrediction.drawName) === normalizeName(drawName);

    // 1. Dynamic Favored Bin Selection (Dynamic Mean Probability Mass Cutoff)
    const totalBinsCount = report.bins.length;
    const meanProb =
      totalBinsCount > 0
        ? report.bins.reduce((sum, b) => sum + b.probability, 0) / totalBinsCount
        : 1.0 / 11;

    // Bins with above-average transition probability mass or top 3 predicted fallback
    const favoredBins = report.bins.filter((b) => b.probability >= meanProb);
    const topBinsToUse =
      favoredBins.length > 0 ? favoredBins : report.topPredictedBins.slice(0, 3);
    const favoredBinIndices = new Set(topBinsToUse.map((b) => b.binIndex));

    // Evaluate all domain numbers 1..90 with their continuous gap/Markov/DNA metrics
    const allDomainNumbers: number[] = Array.from({ length: 90 }, (_, i) => i + 1);

    const items = allDomainNumbers.map((num) => {
      // a. Raw Markov Score derived from gap range transition probability distribution
      const rawMarkovScore =
        report.rawScoresByNumber?.[num] ?? (report.scoresByNumber?.[num] ?? 50);

      // b. DNA Affinity & Multiplier from the active algorithmic DNA (ZÉRO NOMBRE MAGIQUE)
      const dnaMultiplier = report.dnaMultipliers?.[num] ?? 1.0;
      let dnaAffinity = report.dnaAffinity?.[num] ?? 50;

      // c. If last prediction belongs strictly to active draw, refine with consensus breakdown
      let dnaScore = dnaAffinity;
      if (isPredictionForActiveDraw && lastPrediction?.breakdown?.[num]) {
        let totalVal = 0;
        let totalW = 0;
        for (const [algo, val] of Object.entries(lastPrediction.breakdown[num])) {
          const w = globalWeights[algo as keyof typeof globalWeights] || 1;
          totalVal += (Number(val) || 0) * w;
          totalW += w;
        }
        if (totalW > 0) {
          dnaScore = totalVal / totalW;
          dnaAffinity = Math.round(0.5 * dnaAffinity + 0.5 * dnaScore);
        }
      }

      const zScore = report.zScoresByNumber?.[num] ?? 0;
      const lift = report.liftsByNumber?.[num] ?? 1.0;
      const quantumCoherence = report.quantumCoherenceByNumber?.[num] ?? 50;
      const empiricalProof = report.empiricalProofConfidence?.[num] ?? 50;
      const burstMomentum = report.burstMomentumByNumber?.[num] ?? 50;

      // d. Continuous Differentiable Sieved Score from report (calculated via dynamic SNR DNA Sieve)
      const baseSievedScore = report.scoresByNumber?.[num] ?? (rawMarkovScore * dnaMultiplier);
      const sievedScore = Math.max(0, Math.min(100, baseSievedScore));

      const gapInfo = report.currentGapsByNumber?.[num] || {
        gap: 0,
        binIndex: 0,
        binLabel: "?",
      };

      const isFavoredTranche = favoredBinIndices.has(gapInfo.binIndex);
      const isDnaBoosted = dnaMultiplier >= 1.03;
      const isCriticalGap = gapInfo.gap >= 18;
      const isHighMarkov = rawMarkovScore >= 60;
      const isHighDna = dnaAffinity >= 65;
      const isConvergence = isHighMarkov && isHighDna && sievedScore >= 65;

      // Unified, Deterministic Category & Tag Assignment
      let tag = "Survivant Standard";
      let tagColor = "text-slate-400 bg-slate-800/60 border-slate-700/50";
      let categoryKey: SurvivorCategoryFilter = "ALL";

      if (isConvergence) {
        tag = "🔥 Convergence Tamisée Élite";
        tagColor = "text-amber-300 bg-amber-500/20 border-amber-500/30 shadow-amber-500/10";
        categoryKey = "CONVERGENCE";
      } else if (isHighDna) {
        tag = "⚡ Signal ADN Dominant";
        tagColor = "text-indigo-300 bg-indigo-500/20 border-indigo-500/30";
        categoryKey = "DNA_DOMINANT";
      } else if (isHighMarkov) {
        tag = "🎯 Transition Écart";
        tagColor = "text-emerald-300 bg-emerald-500/20 border-emerald-500/30";
        categoryKey = "MARKOV";
      } else if (isDnaBoosted) {
        tag = "✨ Tamisé ADN +";
        tagColor = "text-cyan-300 bg-cyan-500/20 border-cyan-500/30";
        categoryKey = "TAMIS_BOOSTED";
      } else if (isCriticalGap) {
        tag = "⏳ Rupture d'Écart";
        tagColor = "text-rose-300 bg-rose-500/20 border-rose-500/30";
        categoryKey = "CRITICAL_GAP";
      }

      return {
        num,
        score: parseFloat(sievedScore.toFixed(1)),
        rawMarkovScore: parseFloat(rawMarkovScore.toFixed(1)),
        markovScore: parseFloat(rawMarkovScore.toFixed(1)),
        dnaScore: parseFloat(dnaScore.toFixed(1)),
        dnaAffinity,
        dnaMultiplier: parseFloat(dnaMultiplier.toFixed(2)),
        isDnaBoosted,
        zScore,
        lift,
        quantumCoherence,
        empiricalProof,
        burstMomentum,
        gap: gapInfo.gap,
        binLabel: gapInfo.binLabel,
        binIndex: gapInfo.binIndex,
        isFavoredTranche,
        tag,
        tagColor,
        categoryKey,
      };
    });

    // Baseline candidate count for favored tranches
    const favoredCandidateCount = items.filter((item) => item.isFavoredTranche).length;

    // Apply Tranche Filter:
    // If "all", default to numbers in favored transition tranches (high transition probability).
    // If a specific tranche is selected, show all numbers belonging to that selected tranche.
    let filtered =
      filterBinIndex === "all"
        ? items.filter((item) => item.isFavoredTranche)
        : items.filter((item) => item.binIndex === filterBinIndex);

    // Apply Category Filter (100% Synchronized with Category Keys)
    if (categoryFilter !== "ALL") {
      if (categoryFilter === "PROOF_ONLY") {
        filtered = filtered.filter((item) => item.zScore > 0 && item.empiricalProof >= 60);
      } else if (categoryFilter === "CONVERGENCE") {
        filtered = filtered.filter(
          (item) => item.categoryKey === "CONVERGENCE" || (item.score >= 65 && item.markovScore >= 58 && item.dnaAffinity >= 60)
        );
      } else if (categoryFilter === "DNA_DOMINANT") {
        filtered = filtered.filter(
          (item) => item.categoryKey === "DNA_DOMINANT" || item.dnaAffinity >= 65
        );
      } else if (categoryFilter === "MARKOV") {
        filtered = filtered.filter(
          (item) => item.categoryKey === "MARKOV" || item.rawMarkovScore >= 60
        );
      } else if (categoryFilter === "TAMIS_BOOSTED") {
        filtered = filtered.filter((item) => item.isDnaBoosted);
      } else if (categoryFilter === "CRITICAL_GAP") {
        filtered = filtered.filter((item) => item.gap >= 18);
      }
    }

    // Apply Search Query Filter (Supports single number substring or comma/space separated list)
    if (searchQuery.trim() !== "") {
      const searchTokens = searchQuery
        .trim()
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      if (searchTokens.length > 0) {
        filtered = filtered.filter((item) => {
          const numStr = item.num.toString();
          return searchTokens.some(
            (token) => numStr === token || numStr.includes(token)
          );
        });
      }
    }

    // Apply Score Retention Threshold Cutoff
    filtered = filtered.filter((item) => item.score >= minScoreCutoff);

    // Apply Sorting Mode (Deterministic with LCG tie-breaker)
    filtered.sort((a, b) => {
      if (sortMode === "fused") {
        if (Math.abs(b.score - a.score) > 1e-6) return b.score - a.score;
      } else if (sortMode === "dna") {
        if (Math.abs(b.dnaAffinity - a.dnaAffinity) > 1e-6) return b.dnaAffinity - a.dnaAffinity;
        if (Math.abs(b.dnaScore - a.dnaScore) > 1e-6) return b.dnaScore - a.dnaScore;
      } else if (sortMode === "markov") {
        if (Math.abs(b.rawMarkovScore - a.rawMarkovScore) > 1e-6)
          return b.rawMarkovScore - a.rawMarkovScore;
      } else if (sortMode === "quantum") {
        if (Math.abs(b.quantumCoherence - a.quantumCoherence) > 1e-6)
          return b.quantumCoherence - a.quantumCoherence;
      } else if (sortMode === "proof") {
        if (Math.abs(b.empiricalProof - a.empiricalProof) > 1e-6)
          return b.empiricalProof - a.empiricalProof;
        if (Math.abs(b.zScore - a.zScore) > 1e-6) return b.zScore - a.zScore;
      } else if (sortMode === "gap") {
        if (b.gap !== a.gap) return b.gap - a.gap;
      }
      const hashA = (a.num * 2654435761) % 4294967296;
      const hashB = (b.num * 2654435761) % 4294967296;
      return hashB - hashA;
    });

    // Compute Population Stats
    const baselineCandidateCount =
      filterBinIndex === "all"
        ? favoredCandidateCount
        : items.filter((item) => item.binIndex === filterBinIndex).length;

    const avgScore =
      filtered.length > 0
        ? filtered.reduce((acc, curr) => acc + curr.score, 0) / filtered.length
        : 0;

    const avgDnaAffinity =
      filtered.length > 0
        ? filtered.reduce((acc, curr) => acc + curr.dnaAffinity, 0) / filtered.length
        : 50;

    const retentionPercent =
      baselineCandidateCount > 0
        ? Math.min(100, Math.round((filtered.length / baselineCandidateCount) * 100)).toString()
        : "0";

    const topConvergenceCount = filtered.filter(
      (item) => item.categoryKey === "CONVERGENCE" || item.score >= 68
    ).length;

    return {
      survivingNumbers: filtered,
      totalFavoredCandidateCount: baselineCandidateCount,
      populationStats: {
        avgScore: parseFloat(avgScore.toFixed(1)),
        avgDnaAffinity: Math.round(avgDnaAffinity),
        retentionPercent,
        topConvergenceCount,
        rejectedCount: Math.max(0, baselineCandidateCount - filtered.length),
      },
    };
  }, [
    report,
    drawName,
    globalWeights,
    lastPrediction,
    sortMode,
    categoryFilter,
    minScoreCutoff,
    filterBinIndex,
    searchQuery,
  ]);

  const handleStepChange = (newStep: GapRangeStep) => {
    audioEngine.play("click");
    setStep(newStep);
    setSelectedBinIndex(null);
    setFilterBinIndex("all");
  };

  const handleCopyNumbers = useCallback(
    (count?: number) => {
      let targetList = survivingNumbers;
      if (count && count < survivingNumbers.length) {
        // When requesting top count (e.g. Top 5 Élite), prioritize highest consensus score
        targetList = [...survivingNumbers]
          .sort((a, b) => b.score - a.score)
          .slice(0, count);
      }
      if (targetList.length === 0) return;

      const numsString = targetList.map((item) => item.num).join(", ");
      navigator.clipboard.writeText(numsString);
      setCopiedId("all");
      audioEngine.play("success");
      showToast(
        `${targetList.length} numéro(s) survivant(s) copié(s) : [${numsString}]`,
        "success"
      );

      setTimeout(() => setCopiedId(null), 2500);
    },
    [survivingNumbers, showToast]
  );

  const handleCopySingle = useCallback(
    (num: number) => {
      navigator.clipboard.writeText(num.toString());
      setCopiedId(`num_${num}`);
      audioEngine.play("click");
      showToast(`Numéro #${num} copié dans le presse-papier`, "info");
      setTimeout(() => setCopiedId(null), 2000);
    },
    [showToast]
  );

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
                  Décision & Survivants de l'ADN Algorithmique
                </h4>
                <span className="px-2.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-300 rounded-full font-black border border-emerald-500/30 shadow-sm">
                  {survivingNumbers.length} Numéros
                </span>
                <span className="px-2 py-0.5 text-[9px] bg-amber-500/15 text-amber-300 rounded-full font-bold border border-amber-500/25 flex items-center gap-1">
                  <Sparkles size={10} /> Tamis ADN Actif
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Filtrage différentiable continu : les transitions d'écarts de tranches sont tamisées par l'ADN algorithmique ({report.dnaSieveInfo?.dominantAlgos?.join(', ') || 'Global'}).
              </p>
            </div>
          </div>

          {/* Quick Copy & Export Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopyNumbers(5)}
              disabled={survivingNumbers.length === 0}
              className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40"
              title="Copier le Top 5 Élite"
            >
              <Flame size={13} className="text-amber-400" />
              <span>Top 5 Élite</span>
            </button>

            <button
              onClick={() => handleCopyNumbers()}
              disabled={survivingNumbers.length === 0}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 disabled:opacity-40"
            >
              {copiedId === "all" ? (
                <>
                  <Check size={13} className="text-emerald-300" />
                  <span>Copié !</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span>Copier ({survivingNumbers.length})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Category Filters Pills Bar */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/90 p-2 rounded-xl border border-slate-800">
          <span className="text-[10px] font-black uppercase text-slate-400 px-2 flex items-center gap-1">
            <Filter className="w-3 h-3 text-indigo-400" /> Filtres :
          </span>

          <button
            onClick={() => {
              audioEngine.play("click");
              setCategoryFilter("ALL");
            }}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
              categoryFilter === "ALL"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            Tous les Survivants
          </button>

          <button
            onClick={() => {
              audioEngine.play("click");
              setCategoryFilter("CONVERGENCE");
            }}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 ${
              categoryFilter === "CONVERGENCE"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/10"
            }`}
          >
            <Flame size={12} />
            Convergence Élite
          </button>

          <button
            onClick={() => {
              audioEngine.play("click");
              setCategoryFilter("DNA_DOMINANT");
            }}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 ${
              categoryFilter === "DNA_DOMINANT"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-indigo-300/80 hover:text-indigo-200 hover:bg-indigo-500/10"
            }`}
          >
            <Zap size={12} />
            Signal ADN
          </button>

          <button
            onClick={() => {
              audioEngine.play("click");
              setCategoryFilter("MARKOV");
            }}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 ${
              categoryFilter === "MARKOV"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-emerald-300/80 hover:text-emerald-200 hover:bg-emerald-500/10"
            }`}
          >
            <Target size={12} />
            Markov Transition
          </button>

          <button
            onClick={() => {
              audioEngine.play("click");
              setCategoryFilter("TAMIS_BOOSTED");
            }}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 ${
              categoryFilter === "TAMIS_BOOSTED"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-cyan-300/80 hover:text-cyan-200 hover:bg-cyan-500/10"
            }`}
          >
            <Sparkles size={12} />
            Tamisé ADN +
          </button>

          <button
            onClick={() => {
              audioEngine.play("click");
              setCategoryFilter("CRITICAL_GAP");
            }}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 ${
              categoryFilter === "CRITICAL_GAP"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-rose-300/80 hover:text-rose-200 hover:bg-rose-500/10"
            }`}
          >
            ⏳ Rupture Écart
          </button>

          <button
            onClick={() => {
              audioEngine.play("click");
              setCategoryFilter("PROOF_ONLY");
            }}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 ${
              categoryFilter === "PROOF_ONLY"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-purple-300/80 hover:text-purple-200 hover:bg-purple-500/10"
            }`}
          >
            <ShieldCheck size={12} />
            Preuve Statistique
          </button>
        </div>

        {/* Controls Grid Toolbar */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
          {/* Tranche Filter */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
              <Filter className="w-3 h-3 text-indigo-400" /> Tranche d'Écart
            </span>
            <select
              value={filterBinIndex}
              onChange={(e) => {
                audioEngine.play("click");
                setFilterBinIndex(
                  e.target.value === "all" ? "all" : Number(e.target.value)
                );
              }}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
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

          {/* Sort Mode Selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3 text-emerald-400" /> Tri Prioritaire
            </span>
            <select
              value={sortMode}
              onChange={(e) => {
                audioEngine.play("click");
                setSortMode(e.target.value as SurvivorSortMode);
              }}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="fused">Fusion ADN (Consensus Optimal)</option>
              <option value="dna">Signal ADN (Affinité Génomique)</option>
              <option value="markov">Markov (Probabilité Transition)</option>
              <option value="quantum">Quantique (Cohérence Spectrale)</option>
              <option value="proof">Preuve Statistique (Z-Score & Lift)</option>
              <option value="gap">Écart (Tension d'Absence)</option>
            </select>
          </div>

          {/* Threshold Filter Slider & Presets */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
              <span className="flex items-center gap-1">
                <Sliders className="w-3 h-3 text-amber-400" /> Seuil Score Min
              </span>
              <span className="text-amber-300 font-mono font-black">{minScoreCutoff}/100</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={90}
                step={5}
                value={minScoreCutoff}
                onChange={(e) => setMinScoreCutoff(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex gap-1 shrink-0">
                {[30, 50, 65].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      audioEngine.play("click");
                      setMinScoreCutoff(preset);
                    }}
                    className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                      minScoreCutoff === preset
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Number Search Filter */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
              <Search className="w-3 h-3 text-cyan-400" /> Recherche Numéro
            </span>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ex: 7, 24, 88..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-2 text-[10px] text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Telemetry & Mathematical Diagnostics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-mono">Concordance ADN</span>
            <span className="font-bold text-indigo-300 font-mono">
              {report.dnaSieveInfo?.dnaConcordanceMean ?? 50}%
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-mono">Intensité Tamisage (SNR)</span>
            <span className="font-bold text-emerald-400 font-mono">
              {report.dnaSieveInfo?.sieveIntensityPercent ?? 55}%
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-mono">Entropie Shannon</span>
            <span className="font-bold text-amber-300 font-mono">
              {report.entropyBits ?? 0} bits
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-mono">Markov Ordre 2</span>
            <span className="font-bold text-cyan-300 font-mono">
              {report.markovOrder2Confidence ? `${report.markovOrder2Confidence}%` : 'Actif'}
            </span>
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
              Aucun numéro ne satisfait les critères actuels du filtre (Seuil &gt; {minScoreCutoff}, Filtre: {categoryFilter}).
            </p>
            <button
              onClick={() => {
                audioEngine.play("click");
                setMinScoreCutoff(30);
                setCategoryFilter("ALL");
                setFilterBinIndex("all");
                setSearchQuery("");
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-md"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser tous les filtres
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
                dnaAffinity,
                dnaMultiplier,
                isDnaBoosted,
                zScore,
                lift,
                quantumCoherence,
                empiricalProof,
                gap,
                binLabel,
                tag,
                tagColor,
              }) => {
                const isItemCopied = copiedId === `num_${num}`;
                return (
                  <div
                    key={num}
                    className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-3.5 flex flex-col justify-between gap-3 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
                  >
                    {/* Top Row: NumberBall + Tag + Quick Copy */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <NumberBall number={num} size="md" />
                        <div>
                          <div className="text-xs font-black text-white font-mono flex items-center gap-1.5">
                            <span>#{num}</span>
                            {isDnaBoosted && (
                              <span className="text-[8px] font-black px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                ADN+
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Écart : <span className="text-indigo-300 font-bold">{gap}</span> ({binLabel})
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopySingle(num)}
                          className="p-1 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                          title={`Copier #${num}`}
                        >
                          {isItemCopied ? (
                            <Check size={12} className="text-emerald-400" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Tag Label Badge */}
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${tagColor} truncate`}
                      >
                        {tag}
                      </span>
                      <span className="font-mono text-emerald-400 font-black text-xs">
                        {score.toFixed(1)}/100
                      </span>
                    </div>

                    {/* Score Bar */}
                    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden p-0.5 border border-slate-800">
                      <div
                        className="bg-gradient-to-r from-indigo-500 via-emerald-400 to-amber-300 h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(0, score))}%`,
                        }}
                      />
                    </div>

                    {/* Multi-Signal Diagnostic Metrics Grid */}
                    <div className="grid grid-cols-2 gap-1.5 bg-slate-950/60 p-2 rounded-xl border border-slate-800/70 text-[9px] font-mono">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Markov :</span>
                        <span className="font-bold text-emerald-400">{markovScore}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Signal ADN :</span>
                        <span className="font-bold text-indigo-300">{dnaAffinity}%</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Tamis Multiplier :</span>
                        <span className={`font-bold ${dnaMultiplier >= 1.03 ? 'text-amber-300' : 'text-slate-400'}`}>
                          {dnaMultiplier}x
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Z-Score / Lift :</span>
                        <span className={`font-bold ${zScore > 0 ? 'text-emerald-300' : zScore < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                          {zScore > 0 ? `+${zScore}` : zScore} / {lift}x
                        </span>
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
