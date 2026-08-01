import React, { useState, useMemo, useRef, useCallback } from "react";
import { DrawResult } from "../../types";
import { NumberBall } from "../NumberBall";
import { formatDate, syncDrawExternal } from "../../services/lotteryService";
import { useNexusStore } from "../../store/useNexusStore";
import {
  RefreshCw,
  Search,
  Activity,
  Clock,
  Binary,
  Download,
  GitCompare,
  Calendar,
  TrendingUp,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Cpu,
  Info,
  Copy,
  Check,
  X,
  Zap,
  Sliders,
  Sparkles,
} from "lucide-react";
import { ExportService } from "../../services/exportService";
import { useToast } from "../ui/Toast";
import { ListSkeleton } from "../skeletons/ListSkeleton";
import { SimilarityFinder } from "../SimilarityFinder";
import { HeatmapCalendar } from "../HeatmapCalendar";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import { audioEngine } from "../../utils/audioEngine";
import { motion, AnimatePresence } from "framer-motion";
import { useFluxMath } from "../../hooks/useFluxMath";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";

// Extended Draw Row Component (Memoized for high FPS virtual scrolling)
interface DrawRowCardProps {
  draw: DrawResult;
  index: number;
  totalCount: number;
  meanSum: number;
  onSimilarity: (d: DrawResult) => void;
}

const DrawRowCard: React.FC<DrawRowCardProps> = React.memo(
  ({ draw, index, totalCount, meanSum, onSimilarity }) => {
    const { showToast } = useToast();
    const [copied, setCopied] = useState(false);

    if (!draw) return null;

    const gagnants = draw.gagnants || [];
    const hasMachine = draw.machine && draw.machine.length > 0;

    // Calculs statistiques de la ligne
    const sum = gagnants.reduce((a, b) => a + b, 0);
    const evens = gagnants.filter((n) => n % 2 === 0).length;
    const odds = gagnants.length - evens;
    const minVal = gagnants.length > 0 ? Math.min(...gagnants) : 0;
    const maxVal = gagnants.length > 0 ? Math.max(...gagnants) : 0;
    const range = maxVal - minVal;

    // Détection de suites consécutives
    const sortedGagnants = [...gagnants].sort((a, b) => a - b);
    const consecutivePairs: Array<[number, number]> = [];
    for (let i = 0; i < sortedGagnants.length - 1; i++) {
      if (sortedGagnants[i + 1] === sortedGagnants[i] + 1) {
        consecutivePairs.push([sortedGagnants[i], sortedGagnants[i + 1]]);
      }
    }

    // Indicateur de déviation de la somme
    const sumDev = sum - meanSum;
    const sumColor =
      Math.abs(sumDev) <= 15
        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
        : sumDev > 15
          ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
          : "text-sky-400 bg-sky-500/10 border-sky-500/20";

    const handleCopy = (e: React.MouseEvent) => {
      e.stopPropagation();
      audioEngine.play("click");
      const numStr = gagnants.join(" - ");
      const machineStr = hasMachine ? ` [Special: ${draw.machine!.join(", ")}]` : "";
      navigator.clipboard.writeText(`${formatDate(draw.date)}: ${numStr}${machineStr}`);
      setCopied(true);
      showToast("Combinaison copiée dans le presse-papier", "success");
      setTimeout(() => setCopied(false), 2000);
    };

    // Sequence ID (e.g., #T-1 pour le plus récent)
    const seqNum = totalCount - index;

    return (
      <div className="px-1 h-full pb-3">
        <div
          className="bg-white dark:bg-slate-900/80 p-4 sm:p-5 rounded-[1.8rem] border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-xl dark:hover:shadow-indigo-500/10 hover:border-indigo-400/50 dark:hover:border-indigo-500/50 transition-all duration-300 group relative overflow-hidden h-full flex flex-col justify-center backdrop-blur-md"
        >
          <div className="flex flex-col lg:flex-row justify-between items-center gap-4 lg:gap-6 w-full relative z-10">
            {/* Colonne Meta Info */}
            <div className="flex flex-row lg:flex-col items-center lg:items-start justify-between lg:justify-center w-full lg:w-auto lg:min-w-[150px] text-left shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-black text-indigo-500 bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800/50 px-2 py-0.5 rounded-lg tracking-wider">
                  #T-{seqNum}
                </span>
                <span className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest truncate max-w-[90px]">
                  {draw.drawName || draw.draw_name || "LOTO"}
                </span>
              </div>

              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none tracking-tighter">
                  {formatDate(draw.date).split("/")[0]}{" "}
                  <span className="text-indigo-600 dark:text-indigo-400 text-xs sm:text-sm font-bold ml-0.5">
                    {[
                      "JAN", "FEV", "MAR", "AVR", "MAI", "JUN",
                      "JUL", "AOU", "SEP", "OCT", "NOV", "DEC",
                    ][parseInt(formatDate(draw.date).split("/")[1]) - 1] ||
                      formatDate(draw.date).split("/")[1]}
                  </span>
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 px-1.5 py-0.5 rounded-md">
                  {formatDate(draw.date).split("/")[2]}
                </span>
              </div>

              {/* Boutons Mobile rapides */}
              <div className="lg:hidden flex gap-1.5">
                <button
                  onClick={handleCopy}
                  className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl active:scale-95"
                  title="Copier"
                >
                  {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSimilarity(draw);
                  }}
                  className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl active:scale-95"
                  title="Similitudes"
                >
                  <GitCompare size={14} />
                </button>
              </div>
            </div>

            {/* Numéros Principaux & Special Balls */}
            <div className="flex flex-col items-center gap-2.5 w-full lg:w-auto flex-1">
              <div className="flex gap-1.5 sm:gap-2 flex-wrap justify-center items-center">
                {gagnants.map((n, i) => (
                  <NumberBall key={`${n}-${i}`} number={n} size="sm" />
                ))}
              </div>

              {/* Special Balls / Machine */}
              {hasMachine && (
                <div className="flex items-center gap-2 px-3.5 py-1 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 w-full sm:w-auto justify-center">
                  <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-1 shrink-0">
                    <Sparkles size={11} /> SPECIAL / ETOILES
                  </span>
                  <div className="flex gap-1.5 flex-wrap justify-center items-center">
                    {draw.machine!.map((n, i) => (
                      <span
                        key={`${n}-${i}`}
                        className="text-xs font-mono font-black text-amber-700 dark:text-amber-300 bg-amber-500/20 dark:bg-amber-500/30 px-2 py-0.5 rounded-lg border border-amber-500/30"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Metrics Badges & Actions Desktop */}
            <div className="hidden lg:flex items-center gap-3 shrink-0">
              {/* Badge Somme */}
              <div className={`text-center px-3 py-1.5 rounded-xl border ${sumColor} min-w-[65px]`}>
                <div className="text-[8px] font-black uppercase tracking-widest opacity-80 mb-0.5">
                  Somme
                </div>
                <div className="text-xs font-mono font-black">{sum}</div>
              </div>

              {/* Badge Parité */}
              <div className="text-center px-3 py-1.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 min-w-[65px]">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                  Parité
                </div>
                <div className="text-xs font-mono font-bold">
                  <span className="text-indigo-500">{evens}P</span> / <span className="text-rose-500">{odds}I</span>
                </div>
              </div>

              {/* Badge Étendue */}
              <div className="text-center px-3 py-1.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 min-w-[65px]">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                  Étendue
                </div>
                <div className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                  {range}
                </div>
              </div>

              {/* Suite consécutive détectée */}
              {consecutivePairs.length > 0 && (
                <div className="px-2.5 py-1.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-xl text-[9px] font-mono font-black uppercase tracking-wider flex items-center gap-1" title="Séquence consécutive détectée">
                  <Zap size={10} className="text-purple-400" />
                  {consecutivePairs.map(p => `${p[0]}-${p[1]}`).join(", ")}
                </div>
              )}

              {/* Floating Action Toolbar */}
              <div className="flex items-center gap-1.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <button
                  onClick={handleCopy}
                  className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:scale-110 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shadow-sm"
                  title="Copier la combinaison"
                >
                  {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSimilarity(draw);
                  }}
                  className="p-2.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-xl hover:scale-110 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all shadow-sm"
                  title="Trouver Similitudes"
                >
                  <GitCompare size={15} />
                </button>
              </div>
            </div>
          </div>

          {/* Halo d'interaction au survol */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
        </div>
      </div>
    );
  }
);

export const FluxHub: React.FC<{ history: DrawResult[] }> = ({ history }) => {
  const currentDrawName = useNexusStore((state) => state.currentDrawName);
  const refreshData = useNexusStore((state) => state.refreshData);
  const loading = useNexusStore((state) => state.loading);
  const { showToast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [similarityTarget, setSimilarityTarget] = useState<DrawResult | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [cyberFilter, setCyberFilter] = useState<
    "all" | "entropy_high" | "entropy_low" | "harmonic_even" | "harmonic_odd" | "consecutive"
  >("all");

  const handleManualRefresh = async () => {
    if (!currentDrawName) return;
    showToast("Synchronisation API...", "info");
    audioEngine.play("scan");
    try {
      await syncDrawExternal(currentDrawName);
      await refreshData(currentDrawName, true);
      showToast("Flux mis à jour avec succès", "success");
      audioEngine.play("success");
    } catch (e: any) {
      if (e?.code === "SYNC_REQUIRES_BACKEND") {
        showToast("Mode démo : aucun backend configuré, synchronisation indisponible.", "info");
      } else {
        showToast("Échec de la synchronisation.", "error");
      }
      audioEngine.play("error");
    }
  };

  // Isolation hermétique par tirage (TIRAGE ISOLATION RULE)
  const purifiedHistory = useMemo(() => {
    return purifyHistoryForDraw(currentDrawName, history);
  }, [currentDrawName, history]);

  // Filtrage cybernétique multicouche
  const filteredHistory = useMemo(() => {
    let result = purifiedHistory;

    // 1. Recherche par terme (numéro, date, nom)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(
        (h) =>
          formatDate(h.date).includes(term) ||
          (h.gagnants || []).some((n) => n.toString() === term) ||
          (h.machine || []).some((n) => n.toString() === term) ||
          (h.drawName || h.draw_name || "").toLowerCase().includes(term)
      );
    }

    // 2. Filtres de cohorte cybernétique
    if (cyberFilter !== "all") {
      const sums = result.map((h) => (h.gagnants || []).reduce((a, b) => a + b, 0));
      const meanSum = sums.length > 0 ? sums.reduce((a, b) => a + b, 0) / sums.length : 0;

      result = result.filter((h) => {
        const gagnants = h.gagnants || [];
        const hSum = gagnants.reduce((a, b) => a + b, 0);
        const evens = gagnants.filter((n) => n % 2 === 0).length;
        const odds = gagnants.length - evens;

        if (cyberFilter === "entropy_high") {
          return Math.abs(hSum - meanSum) <= 15;
        }
        if (cyberFilter === "entropy_low") {
          return Math.abs(hSum - meanSum) > 15;
        }
        if (cyberFilter === "harmonic_even") {
          return evens > odds;
        }
        if (cyberFilter === "harmonic_odd") {
          return odds > evens;
        }
        if (cyberFilter === "consecutive") {
          const sorted = [...gagnants].sort((a, b) => a - b);
          for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i + 1] === sorted[i] + 1) return true;
          }
          return false;
        }
        return true;
      });
    }

    return result;
  }, [purifiedHistory, searchTerm, cyberFilter]);

  // Évaluation des métriques cybernétiques via Web Worker
  const { metrics, isCalculating } = useFluxMath(filteredHistory);
  const {
    entropyStats,
    hurstStats,
    speedStats,
    spectrumStats,
    topCorrelations,
    trajectoryPoints,
  } = metrics;

  // Global mean sum pour le composant de carte
  const globalMeanSum = useMemo(() => {
    if (speedStats.meanSum > 0) return speedStats.meanSum;
    if (purifiedHistory.length === 0) return 0;
    const total = purifiedHistory.reduce(
      (acc, d) => acc + (d.gagnants || []).reduce((a, b) => a + b, 0),
      0
    );
    return total / purifiedHistory.length;
  }, [speedStats.meanSum, purifiedHistory]);

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useWindowVirtualizer({
    count: filteredHistory.length,
    estimateSize: () => (window.innerWidth < 768 ? 160 : 135),
    overscan: 6,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
  });

  const handleSimilarity = useCallback((d: DrawResult) => {
    setSimilarityTarget(d);
  }, []);

  if (loading && history.length === 0) return <ListSkeleton />;

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-8 w-full max-w-7xl mx-auto px-1 md:px-0">
      {/* Top Header KPI & Stats Bar */}
      <div className="bg-slate-900/90 text-white p-4 sm:p-5 rounded-[2rem] border border-slate-800/80 shadow-2xl relative overflow-hidden shrink-0">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative z-10">
          {/* Main Title & Game Identifier */}
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-500/30 ring-4 ring-indigo-500/20">
              <Activity size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black uppercase tracking-wider text-white">
                  Master Flux
                </h3>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-500/20 px-2.5 py-0.5 rounded-lg border border-indigo-500/30">
                  {currentDrawName || "GLOBAL"}
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-400 mt-0.5 flex items-center gap-2">
                <Clock size={12} className="text-indigo-400" />
                <span>
                  {filteredHistory.length} tirages analysés
                  {purifiedHistory.length !== filteredHistory.length && (
                    <span className="text-slate-500 ml-1">
                      (sur {purifiedHistory.length} total)
                    </span>
                  )}
                </span>
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4 w-full lg:w-auto">
            <div className="bg-slate-950/60 p-2.5 sm:p-3 rounded-2xl border border-slate-800/60 text-center">
              <div className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-500">
                Moy. Somme (μ)
              </div>
              <div className="text-xs sm:text-sm font-mono font-black text-indigo-400 mt-0.5">
                {globalMeanSum.toFixed(1)}{" "}
                <span className="text-[9px] text-slate-500 font-normal">
                  ±{speedStats.stdSum.toFixed(1)}
                </span>
              </div>
            </div>

            <div className="bg-slate-950/60 p-2.5 sm:p-3 rounded-2xl border border-slate-800/60 text-center">
              <div className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-500">
                Stabilité (Hurst)
              </div>
              <div className={`text-xs sm:text-sm font-mono font-black mt-0.5 ${hurstStats.color}`}>
                {hurstStats.hurst.toFixed(3)}
              </div>
            </div>

            <div className="bg-slate-950/60 p-2.5 sm:p-3 rounded-2xl border border-slate-800/60 text-center">
              <div className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-500">
                Entropie (Shannon)
              </div>
              <div className="text-xs sm:text-sm font-mono font-black text-emerald-400 mt-0.5">
                {(entropyStats.normalized * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-3 sm:p-4 rounded-[1.8rem] shadow-xl border border-slate-200/80 dark:border-slate-800/80 relative z-30 shrink-0">
        {/* Search input with instant clear */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Rechercher (Date, Numéro)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 font-bold text-xs outline-none focus:ring-4 ring-indigo-500/10 focus:border-indigo-400 transition-all text-slate-800 dark:text-white placeholder-slate-400 shadow-inner"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* View Switcher & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => {
                audioEngine.play("click");
                setViewMode("list");
              }}
              className={`p-2 rounded-lg transition-all ${
                viewMode === "list"
                  ? "bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400 font-bold"
                  : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
              title="Vue Liste Virtuelle"
            >
              <Activity size={16} />
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setViewMode("calendar");
              }}
              className={`p-2 rounded-lg transition-all ${
                viewMode === "calendar"
                  ? "bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400 font-bold"
                  : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
              title="Vue Calendrier thermique"
            >
              <Calendar size={16} />
            </button>
          </div>

          <button
            onClick={() => {
              audioEngine.play("click");
              setShowAnalytics(!showAnalytics);
            }}
            className={`px-3.5 py-2 rounded-xl transition-all border text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
              showAnalytics
                ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/30"
                : "bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800"
            }`}
          >
            <TrendingUp size={15} />
            <span>Métrique</span>
            {showAnalytics ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <button
            onClick={() =>
              ExportService.exportHistoryToCSV(
                filteredHistory,
                `Flux_${currentDrawName}_${Date.now()}`
              )
            }
            className="p-2.5 bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-white dark:hover:bg-slate-800 transition border border-slate-200 dark:border-slate-800"
            title="Export CSV du flux filtré"
          >
            <Download size={16} />
          </button>

          <button
            onClick={handleManualRefresh}
            className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-500/20 hover:bg-emerald-500 active:scale-95 transition-all"
            title="Rafraîchir & Synchroniser"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Cybernetic Cohort Quick Selector Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide shrink-0 px-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 shrink-0 flex items-center gap-1">
          <Sliders size={12} className="text-indigo-500" /> Cohortes :
        </span>
        {[
          { id: "all", label: "Toutes" },
          { id: "entropy_high", label: "Equilibrées (μ±15)" },
          { id: "entropy_low", label: "Déviantes" },
          { id: "harmonic_even", label: "Dominante Paires" },
          { id: "harmonic_odd", label: "Dominante Impaires" },
          { id: "consecutive", label: "Séquences Consécutives" },
        ].map((c) => (
          <button
            key={c.id}
            onClick={() => {
              audioEngine.play("click");
              setCyberFilter(c.id as any);
            }}
            className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap border ${
              cyberFilter === c.id
                ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/20"
                : "bg-white/80 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Expanded Cybernetics Analytics Panel */}
      <AnimatePresence>
        {showAnalytics && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden w-full shrink-0 relative z-20"
          >
            <div className="bg-slate-900 dark:bg-slate-950 p-5 sm:p-7 rounded-[2.2rem] border border-slate-800 shadow-2xl space-y-6 relative overflow-hidden my-2">
              <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
                    <Cpu size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-black uppercase tracking-widest text-white">
                      Analyse Cybernétique & Densitométrie Spectrale
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Auto-corrélation temporelle de Hurst, Entropie spectrale & Trajectoire vectorielle.
                    </p>
                  </div>
                </div>
                {isCalculating && (
                  <div className="flex items-center gap-2 text-[10px] font-mono text-indigo-400 animate-pulse">
                    <RefreshCw size={12} className="animate-spin" /> Calcul matriciel...
                  </div>
                )}
              </div>

              {/* Trajectory SVG Graph */}
              {trajectoryPoints.length > 0 ? (
                <div className="bg-slate-950/80 p-4 sm:p-5 rounded-2xl border border-slate-800">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                      <TrendingUp size={14} className="text-indigo-400" />
                      Trajectoire Temporelle de la Somme du Tirage (Série relative)
                    </span>
                    <span className="text-[9px] font-mono text-slate-500 uppercase">
                      Moyenne μ = {speedStats.meanSum.toFixed(1)}
                    </span>
                  </div>

                  <div className="h-32 w-full relative">
                    <svg
                      className="w-full h-full overflow-visible"
                      viewBox="0 0 1000 120"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <linearGradient id="flux-gradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
                          <stop offset="50%" stopColor="#a855f7" stopOpacity="0.8" />
                          <stop offset="100%" stopColor="#ec4899" stopOpacity="0.8" />
                        </linearGradient>
                      </defs>

                      {/* Line Mean */}
                      <line
                        x1="0"
                        y1="60"
                        x2="1000"
                        y2="60"
                        stroke="#475569"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />

                      {/* Path Curve */}
                      {trajectoryPoints.length > 1 && (() => {
                        const pathData = trajectoryPoints
                          .map((pt, index) => {
                            const x = (index / (trajectoryPoints.length - 1)) * 1000;
                            return `${index === 0 ? "M" : "L"} ${x} ${pt.normY}`;
                          })
                          .join(" ");

                        return (
                          <path
                            d={pathData}
                            stroke="url(#flux-gradient)"
                            strokeWidth="2.5"
                            fill="none"
                          />
                        );
                      })()}

                      {/* Points */}
                      {trajectoryPoints.map((pt, index) => {
                        const x = (index / (trajectoryPoints.length - 1)) * 1000;
                        return (
                          <g key={index} className="group/dot cursor-pointer">
                            <circle
                              cx={x}
                              cy={pt.normY}
                              r="3.5"
                              className="fill-indigo-400 stroke-slate-950 group-hover/dot:r-5 transition-all"
                              strokeWidth="1.5"
                            />
                            <title>{`Tirage: ${pt.label}\nSomme: ${pt.sum}`}</title>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              ) : null}

              {/* 4 Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Hurst */}
                <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Exposant de Hurst
                    </span>
                    <Info size={14} className="text-amber-400" />
                  </div>
                  <div className="my-2">
                    <div className={`text-2xl font-mono font-black ${hurstStats.color}`}>
                      {hurstStats.hurst.toFixed(4)}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                      {hurstStats.interpretation}
                    </div>
                  </div>
                  <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-400 h-full transition-all duration-500"
                      style={{ width: `${Math.min(hurstStats.hurst * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Entropy */}
                <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Entropie (Shannon)
                    </span>
                    <Info size={14} className="text-indigo-400" />
                  </div>
                  <div className="my-2">
                    <div className="text-2xl font-mono font-black text-indigo-300">
                      {entropyStats.entropy.toFixed(3)}{" "}
                      <span className="text-xs font-normal text-slate-500">bits</span>
                    </div>
                    <div className="text-[10px] font-bold text-indigo-400 mt-1 uppercase tracking-wider">
                      Pureté : {(entropyStats.normalized * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full transition-all duration-500"
                      style={{ width: `${entropyStats.normalized * 100}%` }}
                    />
                  </div>
                </div>

                {/* Topological Speed */}
                <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Vitesse Topologique
                    </span>
                    <Info size={14} className="text-rose-400" />
                  </div>
                  <div className="my-2">
                    <div className="text-2xl font-mono font-black text-rose-400">
                      {speedStats.topoSpeed.toFixed(2)}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                      Déplacement Euclidien
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-500">
                    Vitesse d'évolution spatiale entre tirages T et T+1.
                  </p>
                </div>

                {/* Signal Deviance */}
                <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Déviation Signal
                    </span>
                    <Info size={14} className="text-sky-400" />
                  </div>
                  <div className="my-2">
                    <div className="text-2xl font-mono font-black text-slate-200">
                      {speedStats.meanSum.toFixed(1)}
                    </div>
                    <div className="text-[10px] font-bold text-sky-400 mt-1 uppercase tracking-wider">
                      Ecart-Type σ = {speedStats.stdSum.toFixed(1)}
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-500">
                    Centre gravitationnel de la masse du tirage.
                  </p>
                </div>
              </div>

              {/* Top Z-Score Spectrogram */}
              {spectrumStats.raw.length > 0 && (
                <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                      <Binary size={14} className="text-indigo-400" />
                      Spectrogramme de Densité (Top 10 Z-Scores)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
                    {spectrumStats.raw.slice(0, 10).map((sp) => {
                      const zPct = Math.min(Math.max(((sp.zScore + 2) / 4) * 100, 10), 95);
                      const barColor =
                        sp.zScore > 0.8
                          ? "bg-rose-500 text-rose-400"
                          : sp.zScore < -0.8
                          ? "bg-sky-500 text-sky-400"
                          : "bg-indigo-500 text-indigo-400";

                      return (
                        <div
                          key={sp.num}
                          className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 flex flex-col justify-between"
                        >
                          <div className="flex justify-between items-baseline">
                            <span className="font-mono font-black text-white text-sm">
                              {sp.num}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400">
                              {sp.count}x
                            </span>
                          </div>
                          <div className="mt-2 space-y-1">
                            <div className="h-1 bg-slate-950 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${barColor.split(" ")[0]}`}
                                style={{ width: `${zPct}%` }}
                              />
                            </div>
                            <div className="text-[8px] font-mono text-slate-500 text-right">
                              Z: {sp.zScore > 0 ? "+" : ""}{sp.zScore.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Correlations */}
              {topCorrelations.length > 0 && (
                <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-3">
                    <BarChart3 size={14} className="text-indigo-400" />
                    Top 5 Paires les plus Fréquentes
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {topCorrelations.map((item, index) => (
                      <div
                        key={`${item.pair[0]}-${item.pair[1]}`}
                        className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono font-bold"
                      >
                        <span className="text-indigo-400">#{index + 1}</span>
                        <span className="text-white">
                          {item.pair[0]} + {item.pair[1]}
                        </span>
                        <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-[10px]">
                          {item.count} occ.
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Similarity Overlay */}
      {similarityTarget && (
        <div className="relative animate-slide-up mx-auto w-full mb-2 shrink-0 z-20">
          <button
            onClick={() => setSimilarityTarget(null)}
            className="absolute top-4 right-4 z-10 p-2 bg-slate-100 dark:bg-slate-900 rounded-full text-slate-500 hover:text-rose-500 transition font-bold text-xs shadow-sm"
          >
            Fermer
          </button>
          <SimilarityFinder
            currentDraw={similarityTarget}
            history={purifiedHistory}
          />
        </div>
      )}

      {/* CALENDAR VIEW */}
      {viewMode === "calendar" && (
        <div className="animate-fade-in mx-auto w-full overflow-x-auto pb-4 shrink-0">
          <div className="min-w-max flex justify-center p-4">
            <HeatmapCalendar history={purifiedHistory} />
          </div>
        </div>
      )}

      {/* VIRTUALIZED LIST VIEW */}
      {viewMode === "list" && (
        <div
          ref={parentRef}
          className="w-full bg-transparent py-1 relative min-h-[400px]"
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const draw = filteredHistory[virtualRow.index];
            return (
              <div
                key={draw ? `${draw.id}_${virtualRow.key}` : virtualRow.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
                }}
              >
                <DrawRowCard
                  draw={draw}
                  index={virtualRow.index}
                  totalCount={filteredHistory.length}
                  meanSum={globalMeanSum}
                  onSimilarity={handleSimilarity}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
