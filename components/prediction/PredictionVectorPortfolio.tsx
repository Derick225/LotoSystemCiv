import React, { useState, useMemo } from "react";
import { NumberBall } from "../NumberBall";
import { Prediction, DrawResult } from "../../types";
import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Shield,
  Zap,
  Activity,
  Copy,
  Check,
  Download,
  Share2,
  Sliders,
  Scale,
  Waves,
  Eye,
  PieChart as PieChartIcon,
  Layers,
  ArrowRight,
} from "lucide-react";

interface PredictionVectorPortfolioProps {
  prediction: Prediction;
  history: DrawResult[];
  drawName: string;
}

export const PredictionVectorPortfolio: React.FC<
  PredictionVectorPortfolioProps
> = ({ prediction, history, drawName }) => {
  const { showToast } = useToast();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selectedVectorTab, setSelectedVectorTab] = useState<
    "primary" | "antifragile" | "harmonic"
  >("primary");
  const [inspectedNum, setInspectedNum] = useState<number | null>(null);

  // 1. Calcul déterministe des vecteurs alternatifs dérivés
  const vectors = useMemo(() => {
    const primary = prediction.suggestedNumbers || [];
    const candidates = prediction.candidates || [];
    const breakdown = prediction.breakdown || {};

    // Vecteur Anti-Fragile : Outsiders mathématiques à forte tension d'écart ou anomalie
    const scoredOutsiders = candidates
      .filter((n) => !primary.includes(n))
      .map((num) => {
        const bd = (breakdown[num] as Record<string, number>) || {};
        const gapScore = ((bd.gap ?? bd.gaps ?? 0) * 1.4) + ((bd.isolation_anomaly ?? 0) * 1.2) + ((bd.momentum ?? 0) * 0.8);
        return { num, score: gapScore };
      })
      .sort((a, b) => b.score - a.score);

    // Composition équilibrée pour l'anti-fragile (2 du primaire + 3 outsiders de rupture)
    const antifragile = [
      ...primary.slice(0, 2),
      ...scoredOutsiders.slice(0, 3).map((s) => s.num),
    ].sort((a, b) => a - b);

    // Vecteur Harmonique & Markov : Résonance fréquentielle, spectrale et chaînes markoviennes
    const scoredHarmonic = candidates
      .filter((n) => !primary.slice(0, 3).includes(n))
      .map((num) => {
        const bd = breakdown[num] || {};
        const harmScore =
          (bd.spectral || 0) * 1.3 +
          (bd.markov || 0) * 1.2 +
          (bd.inter_monthly_resonance || 0) * 1.1 +
          (bd.echo_state || 0) * 0.9;
        return { num, score: harmScore };
      })
      .sort((a, b) => b.score - a.score);

    const harmonic = [
      ...primary.slice(2, 4),
      ...scoredHarmonic.slice(0, 3).map((s) => s.num),
    ].sort((a, b) => a - b);

    return {
      primary: {
        id: "primary" as const,
        title: "Vecteur Maximum a Posteriori (MAP)",
        subtitle: "Attracteur principal issu du consensus algorithmique global",
        badge: "Consensus Optimal",
        badgeColor: "indigo",
        numbers: primary,
        confidence: prediction.confidence,
        strategy: "Consensus Bayésien & Débruitage PCA",
      },
      antifragile: {
        id: "antifragile" as const,
        title: "Vecteur Anti-Fragile (Rupture Stochastique)",
        subtitle: "Exploration des saturations d'écarts et asymétries de phase",
        badge: "Asymétrie Écart",
        badgeColor: "emerald",
        numbers: antifragile.length === 5 ? antifragile : primary,
        confidence: Math.max(40, Math.round(prediction.confidence * 0.91)),
        strategy: "Convergence d'Outsiders & Résidus d'Isolation",
      },
      harmonic: {
        id: "harmonic" as const,
        title: "Vecteur Résonance Spectrale & Markov",
        subtitle: "Harmoniques de Fourier et matrices de transition d'état",
        badge: "Cyclicité Spectrale",
        badgeColor: "purple",
        numbers: harmonic.length === 5 ? harmonic : primary,
        confidence: Math.max(40, Math.round(prediction.confidence * 0.88)),
        strategy: "Décomposition FFT & Résonance Inter-Mensuelle",
      },
    };
  }, [prediction]);

  const activeVector = vectors[selectedVectorTab];

  // 2. Métriques physiques et topologiques déterministes du vecteur actif
  const vectorMetrics = useMemo(() => {
    const nums = activeVector.numbers || [];
    if (nums.length === 0) return null;

    const sum = nums.reduce((acc, n) => acc + n, 0);
    // Espérance théorique pour 5 boules parmi 90 = 5 * (91 / 2) = 227.5
    const theoreticalExpectedSum = 227.5;
    const sumDeviationPercent = (
      ((sum - theoreticalExpectedSum) / theoreticalExpectedSum) *
      100
    ).toFixed(1);

    const evenCount = nums.filter((n) => n % 2 === 0).length;
    const oddCount = nums.length - evenCount;

    const lowCount = nums.filter((n) => n <= 45).length;
    const highCount = nums.length - lowCount;

    // Calcul de la dispersion spatiale minimale (Inter-Gap)
    const sorted = [...nums].sort((a, b) => a - b);
    let minGap = 90;
    let totalInterGaps = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      const g = sorted[i + 1] - sorted[i];
      if (g < minGap) minGap = g;
      totalInterGaps += g;
    }
    const meanInterGap = (totalInterGaps / (sorted.length - 1 || 1)).toFixed(1);

    // Entropie continue de la répartition des dizaines (1-9, 10-19, ..., 80-90)
    const decadeBuckets = new Array(9).fill(0);
    nums.forEach((n) => {
      const idx = Math.min(8, Math.floor((n - 1) / 10));
      decadeBuckets[idx]++;
    });
    let decEntropy = 0;
    decadeBuckets.forEach((c) => {
      if (c > 0) {
        const p = c / nums.length;
        decEntropy -= p * Math.log2(p);
      }
    });
    const maxDecEntropy = Math.log2(Math.min(nums.length, 9));
    const normalizedEntropy =
      maxDecEntropy > 0 ? (decEntropy / maxDecEntropy) * 100 : 80;

    return {
      sum,
      sumDeviationPercent,
      evenCount,
      oddCount,
      lowCount,
      highCount,
      minGap,
      meanInterGap,
      normalizedEntropy: Math.round(normalizedEntropy),
    };
  }, [activeVector]);

  // Copie presse-papier
  const handleCopyVector = (nums: number[], index: number) => {
    audioEngine.play("click");
    const text = nums.join(" - ");
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    showToast(`Ticket copié dans le presse-papier : ${text}`, "success");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Export JSON déterministe
  const handleExportJSON = () => {
    audioEngine.play("click");
    const exportData = {
      drawName,
      timestamp: new Date().toISOString(),
      predictionSummary: {
        confidence: prediction.confidence,
        realityAlignment: prediction.realityAlignment ?? 82,
        strategy: prediction.analysis,
      },
      vectors: {
        primary: vectors.primary.numbers,
        antifragile: vectors.antifragile.numbers,
        harmonic: vectors.harmonic.numbers,
      },
      vectorTopologicalMetrics: vectorMetrics,
      breakdown: prediction.breakdown,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexus_prediction_portfolio_${drawName.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Fiche Stratégique du Portefeuille exportée avec succès.", "success");
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-200/10 dark:shadow-none space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-500 font-mono text-xs uppercase tracking-widest font-black mb-1">
            <Layers className="size-4" /> Portefeuille Stratégique Multi-Vecteurs
          </div>
          <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Décomposition Topologique & Couverture de Phase
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Diversification du risque stochastique par formulation de vecteurs orthogonaux.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCopyVector(activeVector.numbers, 99)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all border border-slate-200 dark:border-slate-700 shadow-sm"
            title="Copier le vecteur actif"
          >
            {copiedIndex === 99 ? (
              <>
                <Check className="size-3.5 text-emerald-500" />
                <span className="text-emerald-500">Copié !</span>
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                <span>Copier Ticket</span>
              </>
            )}
          </button>

          <button
            onClick={handleExportJSON}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold transition-all border border-indigo-200 dark:border-indigo-800 shadow-sm"
            title="Télécharger la fiche JSON complète"
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">Export JSON</span>
          </button>
        </div>
      </div>

      {/* Vector Strategy Switcher Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(
          [
            {
              key: "primary",
              label: "Consensus Optimal (MAP)",
              icon: Sparkles,
              tag: "Rang 1",
            },
            {
              key: "antifragile",
              label: "Anti-Fragile (Outsiders)",
              icon: Shield,
              tag: "Exploration",
            },
            {
              key: "harmonic",
              label: "Résonance & Markov",
              icon: Waves,
              tag: "Cyclicité",
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isSelected = selectedVectorTab === tab.key;
          const vec = vectors[tab.key];

          return (
            <button
              key={tab.key}
              onClick={() => {
                audioEngine.play("click");
                setSelectedVectorTab(tab.key);
              }}
              className={`flex flex-col p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${
                isSelected
                  ? "bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 dark:border-indigo-500 ring-2 ring-indigo-500/20 shadow-md"
                  : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`flex items-center gap-1.5 text-xs font-black uppercase tracking-wider ${
                    isSelected
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <Icon className="size-4" />
                  {tab.label}
                </span>
                <span
                  className={`text-[9px] font-mono font-black px-2 py-0.5 rounded-full ${
                    isSelected
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {tab.tag}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-auto">
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  Confiance :
                </span>
                <span className="text-xs font-mono font-black text-slate-900 dark:text-white">
                  {vec.confidence}%
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Vector Visual Presentation */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedVectorTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800/80 space-y-6"
        >
          {/* Vector Title & Strategy Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h4 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                {activeVector.title}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeVector.subtitle}
              </p>
            </div>
            <div className="px-3 py-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300">
              Stratégie : <span className="text-indigo-500 font-bold">{activeVector.strategy}</span>
            </div>
          </div>

          {/* Large Number Display */}
          <div className="flex flex-wrap gap-4 md:gap-6 justify-center items-center py-4">
            {activeVector.numbers.map((num, i) => (
              <motion.div
                key={`${selectedVectorTab}-${num}`}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => {
                  audioEngine.play("click");
                  setInspectedNum(inspectedNum === num ? null : num);
                }}
                className="cursor-pointer group flex flex-col items-center gap-1.5"
              >
                <NumberBall
                  number={num}
                  size="lg"
                  isAttractor={selectedVectorTab === "primary"}
                />
                <span className="text-[9px] font-mono font-bold text-slate-400 group-hover:text-indigo-500 transition-colors">
                  {inspectedNum === num ? "Masquer" : "Détails"}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Inspected Number Micro Breakdown */}
          {inspectedNum && prediction.breakdown?.[inspectedNum] && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800/60 space-y-3"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-mono font-bold text-xs flex items-center justify-center">
                    {inspectedNum}
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Attribution Algorithmique du Numéro #{inspectedNum}
                  </span>
                </div>
                <button
                  onClick={() => setInspectedNum(null)}
                  className="text-xs font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  Fermer
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {Object.entries(prediction.breakdown[inspectedNum])
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 8)
                  .map(([algo, score]) => (
                    <div
                      key={algo}
                      className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50"
                    >
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase truncate">
                        {algo.replace(/_/g, " ")}
                      </div>
                      <div className="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                        {(Number(score) * 100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
              </div>
            </motion.div>
          )}

          {/* Topological Vector Metrics Grid */}
          {vectorMetrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Scale className="size-3 text-indigo-400" /> Somme du Ticket
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-black font-mono text-slate-900 dark:text-white">
                    {vectorMetrics.sum}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    (Écart: {Number(vectorMetrics.sumDeviationPercent) > 0 ? `+${vectorMetrics.sumDeviationPercent}` : vectorMetrics.sumDeviationPercent}%)
                  </span>
                </div>
                <div className="text-[9px] text-slate-400">
                  Espérance théorique : 227.5
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Sliders className="size-3 text-emerald-400" /> Équilibre Parité
                </div>
                <div className="text-lg font-black font-mono text-slate-900 dark:text-white">
                  {vectorMetrics.evenCount}P / {vectorMetrics.oddCount}I
                </div>
                <div className="text-[9px] text-slate-400">
                  {vectorMetrics.evenCount === 2 || vectorMetrics.evenCount === 3
                    ? "✓ Profil Hypergéométrique Optimal"
                    : "⚠️ Profil d'Asymétrie"}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Activity className="size-3 text-purple-400" /> Bas / Haut
                </div>
                <div className="text-lg font-black font-mono text-slate-900 dark:text-white">
                  {vectorMetrics.lowCount}B / {vectorMetrics.highCount}H
                </div>
                <div className="text-[9px] text-slate-400">
                  Répartition [1-45] vs [46-90]
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Zap className="size-3 text-amber-400" /> Dispersion Spatiale
                </div>
                <div className="text-lg font-black font-mono text-slate-900 dark:text-white">
                  Δ {vectorMetrics.meanInterGap}
                </div>
                <div className="text-[9px] text-slate-400">
                  Écart minimal : {vectorMetrics.minGap} boule(s)
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
