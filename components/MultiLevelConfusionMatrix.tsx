import React, { useState, useMemo } from "react";
import {
  Target,
  Zap,
  Layers,
  Sparkles,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  Info,
  Compass,
  Repeat,
  Crosshair,
} from "lucide-react";
import { ForensicReport } from "../types";
import { audioEngine } from "../utils/audioEngine";

interface MultiLevelConfusionMatrixProps {
  reports: ForensicReport[];
  drawName: string;
  className?: string;
  onSelectReport?: (report: ForensicReport) => void;
}

export const MultiLevelConfusionMatrix: React.FC<MultiLevelConfusionMatrixProps> = ({
  reports,
  drawName,
  className = "",
  onSelectReport,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [hoveredCell, setHoveredCell] = useState<{ num: number; stats: any } | null>(null);

  // Consolidation des catégories balistiques sur l'ensemble des rapports
  const consolidatedStats = useMemo(() => {
    let exactHits = 0;
    let neighbors1 = 0; // +/- 1
    let neighbors2 = 0; // +/- 2
    let sameDecade = 0;
    let mirrors = 0; // 91 - n
    let machineLeaks = 0;
    let pureMisses = 0;
    let totalPredicted = 0;

    // Cartographie globale 1-90 des occurrences de hits et de proximités
    const numberPerformance: Record<
      number,
      {
        predictedCount: number;
        hitCount: number;
        nearCount: number;
        actualAppearances: number;
      }
    > = {};

    for (let i = 1; i <= 90; i++) {
      numberPerformance[i] = {
        predictedCount: 0,
        hitCount: 0,
        nearCount: 0,
        actualAppearances: 0,
      };
    }

    reports.forEach((rep) => {
      const actualList = rep.combo || [];
      const actualSet = new Set(actualList);
      
      actualList.forEach((win) => {
        if (win >= 1 && win <= 90) {
          numberPerformance[win].actualAppearances++;
        }
      });

      // Extraire les numéros prédits
      let preds: number[] = [];
      if (Array.isArray(rep.matches)) {
        preds = rep.matches.map((m) => m.predicted).filter((n): n is number => typeof n === "number");
      }
      if (preds.length === 0 && rep.missedOpportunities) {
        preds = actualList; // fallback
      }

      preds.forEach((pred) => {
        if (pred < 1 || pred > 90) return;
        totalPredicted++;
        numberPerformance[pred].predictedCount++;

        if (actualSet.has(pred)) {
          exactHits++;
          numberPerformance[pred].hitCount++;
        } else {
          const directNear1 = actualSet.has(pred - 1) || actualSet.has(pred + 1);
          const directNear2 = !directNear1 && (actualSet.has(pred - 2) || actualSet.has(pred + 2));
          const mirrorVal = 91 - pred;
          const isMirror = actualSet.has(mirrorVal);
          const predDecade = Math.floor((pred - 1) / 10);
          const hasSameDecade = actualList.some(
            (w) => Math.floor((w - 1) / 10) === predDecade && w !== pred
          );

          if (directNear1) {
            neighbors1++;
            numberPerformance[pred].nearCount++;
          } else if (directNear2) {
            neighbors2++;
            numberPerformance[pred].nearCount += 0.5;
          } else if (isMirror) {
            mirrors++;
          } else if (hasSameDecade) {
            sameDecade++;
          } else {
            pureMisses++;
          }
        }
      });
    });

    const safeTotal = Math.max(1, totalPredicted);

    // Calcul de l'Indice de Capture Proximale (ICP) continu
    // ICP pondère les hits directs et les frôlements physiques dans l'espace topologique
    const proximalCaptureIndex = Math.min(
      100,
      Math.max(
        0,
        ((exactHits * 1.0 +
          neighbors1 * 0.65 +
          neighbors2 * 0.35 +
          mirrors * 0.25 +
          sameDecade * 0.15) /
          safeTotal) *
          100
      )
    );

    return {
      exactHits,
      neighbors1,
      neighbors2,
      sameDecade,
      mirrors,
      machineLeaks,
      pureMisses,
      totalPredicted,
      proximalCaptureIndex,
      numberPerformance,
      rates: {
        exact: (exactHits / safeTotal) * 100,
        near1: (neighbors1 / safeTotal) * 100,
        near2: (neighbors2 / safeTotal) * 100,
        sameDecade: (sameDecade / safeTotal) * 100,
        mirror: (mirrors / safeTotal) * 100,
        miss: (pureMisses / safeTotal) * 100,
      },
    };
  }, [reports]);

  const categories = [
    {
      id: "exact",
      label: "Impacts Exacts (Hits)",
      count: consolidatedStats.exactHits,
      rate: consolidatedStats.rates.exact,
      color: "bg-emerald-500",
      textColor: "text-emerald-500 dark:text-emerald-400",
      borderColor: "border-emerald-500/30",
      bgLight: "bg-emerald-500/10",
      icon: Target,
      desc: "Numéro prédit identique au numéro réel sorti.",
    },
    {
      id: "near1",
      label: "Frôlements Immédiats (±1)",
      count: consolidatedStats.neighbors1,
      rate: consolidatedStats.rates.near1,
      color: "bg-teal-500",
      textColor: "text-teal-500 dark:text-teal-400",
      borderColor: "border-teal-500/30",
      bgLight: "bg-teal-500/10",
      icon: Crosshair,
      desc: "Voisin direct à 1 unité de distance (Tension spatiale haute).",
    },
    {
      id: "near2",
      label: "Attraction Locale (±2)",
      count: consolidatedStats.neighbors2,
      rate: consolidatedStats.rates.near2,
      color: "bg-cyan-500",
      textColor: "text-cyan-500 dark:text-cyan-400",
      borderColor: "border-cyan-500/30",
      bgLight: "bg-cyan-500/10",
      icon: Compass,
      desc: "Zone de convergence à 2 unités sur le tore 1-90.",
    },
    {
      id: "mirror",
      label: "Symétries Miroirs (91-n)",
      count: consolidatedStats.mirrors,
      rate: consolidatedStats.rates.mirror,
      color: "bg-indigo-500",
      textColor: "text-indigo-500 dark:text-indigo-400",
      borderColor: "border-indigo-500/30",
      bgLight: "bg-indigo-500/10",
      icon: Repeat,
      desc: "Inversion symétrique sur l'axe central du plateau.",
    },
    {
      id: "decade",
      label: "Résonance Décennale",
      count: consolidatedStats.sameDecade,
      rate: consolidatedStats.rates.sameDecade,
      color: "bg-amber-500",
      textColor: "text-amber-500 dark:text-amber-400",
      borderColor: "border-amber-500/30",
      bgLight: "bg-amber-500/10",
      icon: Layers,
      desc: "Même tranche de dizaine ciblée avec succès.",
    },
    {
      id: "miss",
      label: "Dérive Stochastique",
      count: consolidatedStats.pureMisses,
      rate: consolidatedStats.rates.miss,
      color: "bg-slate-400",
      textColor: "text-slate-500 dark:text-slate-400",
      borderColor: "border-slate-500/20",
      bgLight: "bg-slate-500/10",
      icon: Zap,
      desc: "Absence de résonance spatiale immédiate.",
    },
  ];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header & Proximal Capture Index Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-indigo-500/10 text-indigo-500 rounded-xl">
                <Compass size={20} />
              </span>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-white">
                  Matrice de Confusion Multi-Niveaux & Décomposition Balistique
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Analyse des impacts exacts et résonances spectrales ({drawName}) sur {reports.length} tirages audités.
                </p>
              </div>
            </div>
          </div>

          {/* Continuum Bar */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
              <span className="uppercase">Répartition Balistique des Prédictions</span>
              <span className="font-mono">{consolidatedStats.totalPredicted} numéros audités</span>
            </div>
            <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className={`h-full ${cat.color} transition-all duration-500`}
                  style={{ width: `${Math.max(0.5, cat.rate)}%` }}
                  title={`${cat.label}: ${cat.count} (${cat.rate.toFixed(1)}%)`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ICP Score */}
        <div className="lg:col-span-4 bg-gradient-to-br from-indigo-900/20 via-slate-900/40 to-slate-900/60 p-6 rounded-3xl border border-indigo-500/30 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">
              Indice de Capture Proximale (ICP)
            </span>
            <Sparkles size={16} className="text-indigo-400 animate-pulse" />
          </div>

          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-white">
                {consolidatedStats.proximalCaptureIndex.toFixed(1)}%
              </span>
              <span className="text-xs font-bold text-indigo-300">/ 100</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              Mesure continue combinant la précision exacte et l'attraction spatio-topologique des prédictions.
            </p>
          </div>

          <div className="pt-2 border-t border-indigo-500/20 flex items-center justify-between text-[10px]">
            <span className="text-slate-400">Efficacité Topologique :</span>
            <span className="font-bold text-emerald-400 font-mono">
              {(consolidatedStats.rates.exact + consolidatedStats.rates.near1 + consolidatedStats.rates.near2).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Category Breakdown Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <div
              key={cat.id}
              onClick={() => {
                try {
                  audioEngine.play("click");
                } catch (e) {}
                setSelectedFilter(selectedFilter === cat.id ? "all" : cat.id);
              }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                selectedFilter === cat.id
                  ? `${cat.bgLight} ${cat.borderColor} ring-2 ring-indigo-500/40`
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40"
              }`}
            >
              <div className="flex justify-between items-start">
                <span className={`p-1.5 rounded-lg ${cat.bgLight} ${cat.textColor}`}>
                  <Icon size={14} />
                </span>
                <span className="text-[10px] font-black font-mono text-slate-700 dark:text-slate-200">
                  {cat.rate.toFixed(1)}%
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 block line-clamp-1">
                  {cat.label}
                </span>
                <span className="text-base font-black font-mono text-slate-900 dark:text-white">
                  {cat.count}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Topo-Resonance 1-90 Board Matrix */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
              <Sliders size={14} className="text-indigo-500" />
              Grille de Résonance Balistique (1 à 90)
            </h4>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Densité de capture des numéros lors des prédictions passées.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[9px] font-bold text-slate-400 uppercase">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded bg-emerald-500" />
              <span>Hit Direct</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded bg-teal-500" />
              <span>Frôlement (±1)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              <span>Neutre</span>
            </div>
          </div>
        </div>

        {/* 90-Ball Matrix Grid */}
        <div className="grid grid-cols-10 sm:grid-cols-15 md:grid-cols-18 gap-1.5 p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800/80">
          {Array.from({ length: 90 }, (_, i) => {
            const num = i + 1;
            const perf = consolidatedStats.numberPerformance[num] || {
              predictedCount: 0,
              hitCount: 0,
              nearCount: 0,
              actualAppearances: 0,
            };

            let cellBg = "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800";
            if (perf.hitCount > 0) {
              cellBg = "bg-emerald-500 text-white font-black shadow-sm shadow-emerald-500/20 border-emerald-400";
            } else if (perf.nearCount > 0) {
              cellBg = "bg-teal-500/20 text-teal-600 dark:text-teal-300 font-bold border-teal-500/30";
            } else if (perf.predictedCount > 0) {
              cellBg = "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
            }

            return (
              <div
                key={num}
                onMouseEnter={() => setHoveredCell({ num, stats: perf })}
                onMouseLeave={() => setHoveredCell(null)}
                className={`h-7 rounded-lg border flex items-center justify-center text-[10px] font-mono transition-transform hover:scale-110 cursor-pointer ${cellBg}`}
                title={`Numéro ${num}: ${perf.hitCount} hits, ${perf.nearCount} proximités, ${perf.predictedCount} prédictions`}
              >
                {num}
              </div>
            );
          })}
        </div>

        {/* Hover inspection detail banner */}
        {hoveredCell ? (
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-between text-xs animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black flex items-center justify-center font-mono">
                {hoveredCell.num}
              </span>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                Audité {hoveredCell.stats.predictedCount} fois en prédiction
              </span>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="text-emerald-500 font-bold">
                {hoveredCell.stats.hitCount} Hits direct(s)
              </span>
              <span className="text-teal-500 font-bold">
                {hoveredCell.stats.nearCount} Proximité(s) (±1/±2)
              </span>
              <span className="text-slate-400">
                Sorti {hoveredCell.stats.actualAppearances} fois dans les tirages réels
              </span>
            </div>
          </div>
        ) : (
          <div className="p-2.5 text-center text-[10px] text-slate-400 italic">
            Survolez un numéro de la grille pour inspecter ses statistiques balistiques détaillées.
          </div>
        )}
      </div>
    </div>
  );
};
