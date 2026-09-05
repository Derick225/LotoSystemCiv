import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  runDecisionForest,
  calculateFeatureImportance,
  FEATURES_LABELS,
  type DecisionForestConfig,
  type DecisionForestDiagnostics,
} from "../../services/decisionTreeService";
import type { ForestVote, DecisionNode } from "../../types";
import { NumberBall } from "../NumberBall";
import { useToast } from "../ui/Toast";
import { useNexusStore } from "../../store/useNexusStore";
import {
  Vote,
  Users,
  BrainCircuit,
  Ghost,
  EyeOff,
  ShieldCheck,
  Check,
  Sparkles,
  HelpCircle,
  Scale,
  GitBranch,
  Sliders,
  Copy,
  Search,
  Zap,
  BarChart3,
  Filter,
  RefreshCw,
  Columns,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Info,
  CheckCircle2,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

interface DecisionTreeTabProps {
  drawName: string;
}

type FilterMode = "consensus" | "average" | "shadow" | "quantum_pruning";

/**
 * Visualiseur arborescent dynamique du chemin de décision
 */
const DecisionPathNodeView: React.FC<{
  node: DecisionNode | null;
  depth?: number;
}> = ({ node, depth = 0 }) => {
  if (!node) return null;

  if (node.type === "outcome" || node.type === "leaf") {
    const probVal = node.prob ?? 0.5;
    const isHigh = probVal >= 0.6;
    const isMedium = probVal >= 0.4 && probVal < 0.6;

    return (
      <div
        className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl font-mono text-xs border backdrop-blur-sm transition-all ${
          isHigh
            ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-300 shadow-sm shadow-emerald-950"
            : isMedium
              ? "bg-blue-950/80 border-blue-500/40 text-blue-300 shadow-sm shadow-blue-950"
              : "bg-rose-950/80 border-rose-500/40 text-rose-300 shadow-sm shadow-rose-950"
        }`}
      >
        <Sparkles
          size={14}
          className={`shrink-0 ${
            isHigh
              ? "text-emerald-400"
              : isMedium
                ? "text-blue-400"
                : "text-rose-400"
          }`}
        />
        <div className="flex items-center justify-between w-full">
          <span className="font-bold">{node.label}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 border border-white/10 uppercase tracking-widest font-black">
            Feuille N{depth}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 font-mono text-xs">
      <div className="flex items-center justify-between bg-slate-900/90 border border-indigo-500/30 px-3.5 py-2.5 rounded-xl text-indigo-300 shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1 rounded-lg bg-indigo-500/20 text-indigo-400 shrink-0">
            <GitBranch size={13} />
          </div>
          <span className="font-semibold truncate">{node.label}</span>
        </div>
        <span className="text-[9px] font-black uppercase text-indigo-400/80 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20 shrink-0 ml-2">
          Bifurcation N{depth + 1}
        </span>
      </div>
      {node.children && node.children.length > 0 && (
        <div className="pl-4 sm:pl-6 border-l-2 border-indigo-500/30 space-y-2.5">
          {node.children.map((child, i) => (
            <DecisionPathNodeView key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export const DecisionTreeTab: React.FC<DecisionTreeTabProps> = ({
  drawName,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const nexusLoading = useNexusStore((state) => state.loading);

  const [candidates, setCandidates] = useState<ForestVote[]>([]);
  const [allCandidates, setAllCandidates] = useState<ForestVote[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<ForestVote | null>(
    null,
  );
  const [comparisonCandidate, setComparisonCandidate] =
    useState<ForestVote | null>(null);
  const [isCompareMode, setIsCompareMode] = useState(false);

  // Filtres et configuration
  const [filterMode, setFilterMode] = useState<FilterMode>("consensus");
  const [displayLimit, setDisplayLimit] = useState<"5" | "10" | "20" | "all">(
    "10",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFeatures, setSelectedFeatures] =
    useState<string[]>(FEATURES_LABELS);
  const [enableDnaSieve, setEnableDnaSieve] = useState(true);
  const [numTreesConfig, setNumTreesConfig] = useState<number>(0); // 0 = Auto
  const [maxDepthConfig, setMaxDepthConfig] = useState<number>(0); // 0 = Auto
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const [dnaSieveInfo, setDnaSieveInfo] = useState<{
    active: boolean;
    dominantAlgos: string[];
    dnaConcordanceMean: number;
    sieveIntensityPercent?: number;
    entropyBits?: number;
  } | null>(null);

  const [diagnostics, setDiagnostics] =
    useState<DecisionForestDiagnostics | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const [globalImportance, setGlobalImportance] = useState<
    Array<{ name: string; val: number }>
  >([]);

  // Détection des données machine dans l'historique du tirage
  const hasMachineData = useMemo(() => {
    return history.some(
      (d) => Array.isArray(d.machine) && d.machine.length > 0,
    );
  }, [history]);

  const load = useCallback(async () => {
    if (history.length < 40) return;
    setLocalLoading(true);
    try {
      const config: DecisionForestConfig = {
        numTrees: numTreesConfig > 0 ? numTreesConfig : undefined,
        maxDepth: maxDepthConfig > 0 ? maxDepthConfig : undefined,
        enableDnaSieve,
      };

      const {
        votes,
        allVotes,
        dataset,
        diagnostics: diag,
        dnaSieveInfo: sieveData,
      } = await runDecisionForest(
        history,
        filterMode,
        selectedFeatures,
        drawName,
        globalWeights,
        config,
      );

      const fullList = allVotes && allVotes.length > 0 ? allVotes : votes;
      setCandidates(votes);
      setAllCandidates(fullList);
      setDnaSieveInfo(sieveData || null);
      setDiagnostics(diag || null);

      if (votes.length > 0) {
        setSelectedCandidate((prev) => {
          if (prev) {
            const found = fullList.find((c) => c.candidate === prev.candidate);
            if (found) return found;
          }
          return votes[0];
        });

        // Importance des features post-entraînement via corrélation de Pearson
        const impMap = calculateFeatureImportance(dataset, selectedFeatures);
        const impArray = Object.entries(impMap)
          .map(([name, val]) => ({ name, val }))
          .sort((a, b) => b.val - a.val);
        setGlobalImportance(impArray);
      } else {
        setSelectedCandidate(null);
        setGlobalImportance([]);
      }
    } catch {
      showToast("Calcul de bifurcation échoué", "error");
    } finally {
      setLocalLoading(false);
    }
  }, [
    history,
    filterMode,
    selectedFeatures,
    drawName,
    globalWeights,
    enableDnaSieve,
    numTreesConfig,
    maxDepthConfig,
    showToast,
  ]);

  useEffect(() => {
    if (history.length >= 40) {
      load();
    } else {
      setLocalLoading(false);
    }
  }, [load, history.length]);

  // Filtrage des candidats affichés selon la limite et la recherche
  const displayedCandidates = useMemo(() => {
    let list = allCandidates.length > 0 ? allCandidates : candidates;

    if (searchQuery.trim()) {
      const searchNum = parseInt(searchQuery.trim(), 10);
      if (!isNaN(searchNum)) {
        const found = list.filter((c) => c.candidate === searchNum);
        if (found.length > 0) return found;
      }
    }

    if (displayLimit === "5") return list.slice(0, 5);
    if (displayLimit === "10") return list.slice(0, 10);
    if (displayLimit === "20") return list.slice(0, 20);
    return list;
  }, [allCandidates, candidates, displayLimit, searchQuery]);

  const toggleFeature = (feat: string) => {
    audioEngine.play("click");
    if (selectedFeatures.includes(feat)) {
      if (selectedFeatures.length <= 1) {
        showToast("Au moins une caractéristique doit rester active", "info");
        return;
      }
      setSelectedFeatures((prev) => prev.filter((f) => f !== feat));
    } else {
      setSelectedFeatures((prev) => [...prev, feat]);
    }
  };

  const copyTopSelection = () => {
    audioEngine.play("click");
    const topList = candidates.slice(0, 5);
    if (topList.length === 0) return;

    const formatted =
      `🎯 SÉLECTION DÉCISIONNELLE (${filterMode.toUpperCase()}) - ${drawName}\n` +
      `Quintette Élite : ` +
      topList.map((c) => `#${c.candidate} (${c.score}%)`).join(" • ") +
      `\nTamis ADN : ${enableDnaSieve ? "Actif" : "Désactivé"} | Concordance moyenne : ${dnaSieveInfo?.dnaConcordanceMean ?? 50}%\n` +
      `Gini : ${diagnostics?.giniImpurity ?? "0.18"} | Réduction Entropie : ${diagnostics?.entropyReduction ?? "0.82"}`;

    navigator.clipboard.writeText(formatted).then(() => {
      setCopied(true);
      showToast("Sélection copiée dans le presse-papier", "success");
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const getTheme = () => {
    if (filterMode === "consensus")
      return {
        border: "border-emerald-500",
        bg: "bg-emerald-600",
        text: "text-emerald-400",
        gradient: "from-slate-900 via-slate-900 to-emerald-950",
        badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
      };
    if (filterMode === "average")
      return {
        border: "border-blue-500",
        bg: "bg-blue-600",
        text: "text-blue-400",
        gradient: "from-slate-900 via-slate-900 to-blue-950",
        badge: "bg-blue-500/10 text-blue-300 border-blue-500/20",
      };
    if (filterMode === "quantum_pruning")
      return {
        border: "border-purple-500",
        bg: "bg-purple-600",
        text: "text-purple-400",
        gradient: "from-slate-900 via-slate-900 to-purple-950",
        badge: "bg-purple-500/10 text-purple-300 border-purple-500/20",
      };
    return {
      border: "border-rose-500",
      bg: "bg-rose-600",
      text: "text-rose-400",
      gradient: "from-slate-900 via-slate-900 to-rose-950",
      badge: "bg-rose-500/10 text-rose-300 border-rose-500/20",
    };
  };

  const theme = getTheme();

  if (
    nexusLoading ||
    (localLoading && candidates.length === 0 && history.length >= 40)
  ) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-6 bg-slate-900/30 rounded-3xl border border-slate-800 border-dashed">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin"></div>
          <Vote className="absolute inset-0 m-auto text-emerald-500 w-10 h-10 animate-pulse" />
        </div>
        <p className="font-black text-emerald-500 uppercase tracking-[0.3em] text-xs">
          Calibration de la Forêt Décisionnelle...
        </p>
      </div>
    );
  }

  if (history.length < 40) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-900/30 rounded-3xl border border-slate-800 border-dashed gap-4">
        <BrainCircuit className="text-amber-500 w-16 h-16 animate-pulse mb-2" />
        <h3 className="text-xl font-bold text-white">
          Historique insuffisant pour la Forêt de Décision
        </h3>
        <p className="text-slate-400 text-sm max-w-md leading-relaxed">
          L'algorithme de Forêt Décisionnelle floue nécessite au moins{" "}
          <span className="text-amber-500 font-bold">
            40 tirages historiques
          </span>{" "}
          pour calibrer ses bifurcations avec rigueur statistique.
        </p>
        <div className="px-4 py-2 bg-slate-800/50 rounded-2xl border border-slate-700/50 text-xs text-slate-300 mt-2 font-mono">
          Historique actif pour{" "}
          <span className="text-indigo-400 font-bold">{drawName}</span> :{" "}
          {history.length} / 40 tirages
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header Principal & Station de Commande */}
      <div
        className={`p-6 sm:p-8 rounded-3xl border shadow-2xl relative overflow-hidden transition-all duration-300 ${
          filterMode === "shadow"
            ? "bg-slate-950 border-rose-500/30"
            : "bg-slate-900 border-slate-800"
        }`}
      >
        <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
          <BrainCircuit size={200} />
        </div>

        <div className="relative z-10 flex flex-col xl:flex-row justify-between gap-6 items-start xl:items-center">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <div
                className={`p-3 rounded-2xl bg-white/5 border border-white/10 ${theme.text}`}
              >
                {filterMode === "shadow" ? (
                  <Ghost size={22} />
                ) : filterMode === "average" ? (
                  <Scale size={22} />
                ) : filterMode === "quantum_pruning" ? (
                  <BrainCircuit size={22} />
                ) : (
                  <Users size={22} />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black uppercase tracking-[0.3em] opacity-80 text-slate-300">
                    {filterMode === "shadow"
                      ? "Mode Dissidents & Outsiders"
                      : filterMode === "average"
                        ? "Mode Équilibre Médian"
                        : filterMode === "quantum_pruning"
                          ? "Élagage Quantique OOB"
                          : "Vote Consensus Majoritaire"}
                  </h3>
                  <span className="text-[9px] font-black tracking-widest text-indigo-400 uppercase bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                    Forêt Déterministe v7.5
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {diagnostics && (
                    <span className="text-[9px] font-black tracking-widest text-emerald-400 uppercase bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5">
                      <CheckCircle2 size={10} />
                      Gini: {diagnostics.giniImpurity ?? 0.18} • ΔH:{" "}
                      {diagnostics.entropyReduction ?? 0.82}
                    </span>
                  )}
                  {dnaSieveInfo && (
                    <span
                      className={`text-[9px] font-black tracking-widest uppercase px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 border transition-all ${
                        enableDnaSieve
                          ? "text-amber-300 bg-amber-500/10 border-amber-500/20"
                          : "text-slate-400 bg-slate-800/50 border-slate-700"
                      }`}
                    >
                      <Sparkles size={10} className="text-amber-400" />
                      Tamis ADN : {enableDnaSieve ? "Actif" : "Bypass"}{" "}
                      {enableDnaSieve &&
                        `(${dnaSieveInfo.dnaConcordanceMean}% conc. • ${dnaSieveInfo.sieveIntensityPercent ?? 60}% intensité)`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-none mb-2">
              Bifurcation &amp; Décision des{" "}
              <span className={theme.text}>
                {filterMode === "shadow"
                  ? "Outsiders"
                  : filterMode === "average"
                    ? "Médians"
                    : filterMode === "quantum_pruning"
                      ? "Quantiques"
                      : "Experts"}
              </span>
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm font-medium max-w-xl">
              {filterMode === "shadow"
                ? "Filtre Mahalanobis ciblant les numéros à écart critique saturé mais délaissés par le consensus."
                : filterMode === "average"
                  ? "Cible la zone Gaussienne d'équilibre (40-60%) : valeurs de retour à la moyenne hautement régulières."
                  : filterMode === "quantum_pruning"
                    ? "Élagage par réduction d'entropie et décroissance d'ondes supprimant les bifurcations instables."
                    : "Majorité absolue de la forêt floue (Score > 60%) pondérée par l'ADN algorithmique du tirage."}
            </p>
          </div>

          {/* Contrôles de Mode & Actions Rapides */}
          <div className="flex flex-col sm:flex-row xl:flex-col gap-3 w-full xl:w-auto">
            {/* SELECTEUR DE MODE */}
            <div className="flex flex-wrap bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shadow-inner gap-1">
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setFilterMode("consensus");
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  filterMode === "consensus"
                    ? "bg-emerald-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <ShieldCheck size={13} /> Top
              </button>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setFilterMode("average");
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  filterMode === "average"
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Scale size={13} /> Moyen
              </button>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setFilterMode("quantum_pruning");
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  filterMode === "quantum_pruning"
                    ? "bg-purple-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <BrainCircuit size={13} /> Quantique
              </button>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setFilterMode("shadow");
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  filterMode === "shadow"
                    ? "bg-rose-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <EyeOff size={13} /> Ombre
              </button>
            </div>

            {/* Boutons d'Action & Panneau de Paramétrage */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setIsConfigOpen(!isConfigOpen);
                }}
                className={`flex-1 px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  isConfigOpen
                    ? "bg-indigo-600 border-indigo-500 text-white shadow-md"
                    : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800"
                }`}
              >
                <SlidersHorizontal size={13} />
                <span>Calibrage &amp; Tamis</span>
                {isConfigOpen ? (
                  <ChevronUp size={13} />
                ) : (
                  <ChevronDown size={13} />
                )}
              </button>

              <button
                onClick={copyTopSelection}
                className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-bold transition-all flex items-center gap-1.5"
                title="Copier le quintette sélectionné"
              >
                {copied ? (
                  <Check size={13} className="text-emerald-400" />
                ) : (
                  <Copy size={13} />
                )}
                <span>{copied ? "Copié !" : "Copier Top 5"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Panneau Déroulant de Calibrage et Sélection des Caractéristiques */}
        {isConfigOpen && (
          <div className="mt-6 pt-6 border-t border-slate-800/80 grid md:grid-cols-3 gap-6 animate-fade-in bg-slate-950/60 p-5 rounded-2xl border">
            {/* Colonne 1 : Activation des Features */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Filter size={12} className="text-indigo-400" />
                  Caractéristiques Actives ({selectedFeatures.length}/7)
                </span>
                <button
                  onClick={() => {
                    audioEngine.play("click");
                    setSelectedFeatures(FEATURES_LABELS);
                  }}
                  className="text-[9px] text-indigo-400 hover:underline font-bold"
                >
                  Tout activer
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FEATURES_LABELS.map((feat) => {
                  const isActive = selectedFeatures.includes(feat);
                  const isMachine = feat === "Machine Leak";
                  const isMachineDisabled = isMachine && !hasMachineData;

                  return (
                    <button
                      key={feat}
                      disabled={isMachineDisabled}
                      onClick={() => toggleFeature(feat)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1.5 ${
                        isMachineDisabled
                          ? "bg-slate-900/50 border-slate-800 text-slate-600 cursor-not-allowed opacity-60"
                          : isActive
                            ? "bg-indigo-600/30 border-indigo-500/50 text-indigo-200"
                            : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300"
                      }`}
                      title={
                        isMachineDisabled
                          ? "Aucune donnée Machine pour ce tirage"
                          : `Basculer ${feat}`
                      }
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${
                          isMachineDisabled
                            ? "bg-slate-700"
                            : isActive
                              ? "bg-indigo-400"
                              : "bg-slate-700"
                        }`}
                      />
                      <span>{feat}</span>
                      {isMachineDisabled && (
                        <span className="text-[8px] opacity-70">
                          (Sans Machine)
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Colonne 2 : Architecture de la Forêt */}
            <div className="space-y-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sliders size={12} className="text-emerald-400" />
                Hyperparamètres Ensemble
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                    Nombre d'Arbres :
                  </label>
                  <select
                    value={numTreesConfig}
                    onChange={(e) => {
                      audioEngine.play("click");
                      setNumTreesConfig(parseInt(e.target.value, 10));
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  >
                    <option value={0}>Auto (Adaptatif)</option>
                    <option value={30}>30 Arbres (Rapide)</option>
                    <option value={60}>60 Arbres (Standard)</option>
                    <option value={100}>100 Arbres (Profond)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                    Profondeur Max :
                  </label>
                  <select
                    value={maxDepthConfig}
                    onChange={(e) => {
                      audioEngine.play("click");
                      setMaxDepthConfig(parseInt(e.target.value, 10));
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  >
                    <option value={0}>Auto (Dynamique)</option>
                    <option value={4}>4 Niveaux</option>
                    <option value={6}>6 Niveaux</option>
                    <option value={8}>8 Niveaux</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Colonne 3 : Tamis ADN & Recalibration */}
            <div className="space-y-3 flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles size={12} className="text-amber-400" />
                Tamisage ADN Algorithmique
              </span>
              <div className="flex items-center justify-between bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-300 font-medium">
                  Modulation par l'ADN Actif
                </span>
                <button
                  onClick={() => {
                    audioEngine.play("click");
                    setEnableDnaSieve(!enableDnaSieve);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                    enableDnaSieve
                      ? "bg-amber-500 text-black shadow-sm"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  }`}
                >
                  {enableDnaSieve ? "ACTIF" : "DÉSACTIVÉ"}
                </button>
              </div>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  load();
                }}
                disabled={localLoading}
                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <RefreshCw
                  size={12}
                  className={localLoading ? "animate-spin" : ""}
                />
                <span>Recalibrer la Forêt</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Grille Principale : Liste des Candidats & Fiche Détaillée */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Colonne Gauche : Liste & Sélecteur de Candidats */}
        <div className="lg:col-span-4 bg-slate-900/90 p-5 rounded-3xl border border-slate-800 shadow-xl flex flex-col gap-4 max-h-[850px]">
          {/* Header de la liste */}
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h4
                className={`font-black text-xs uppercase tracking-widest flex items-center gap-2 ${theme.text}`}
              >
                <Vote size={15} />
                Résultats du Vote
              </h4>
              <span className="px-2.5 py-0.5 bg-slate-800 rounded-full text-[10px] font-mono font-bold text-slate-400">
                {displayedCandidates.length} Candidats
              </span>
            </div>

            {/* Barre de Recherche & Filtre de Volume */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="text"
                  placeholder="Chercher n° (1-90)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800">
                {(["5", "10", "20", "all"] as const).map((limit) => (
                  <button
                    key={limit}
                    onClick={() => {
                      audioEngine.play("click");
                      setDisplayLimit(limit);
                      setSearchQuery("");
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                      displayLimit === limit && !searchQuery
                        ? "bg-indigo-600 text-white"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {limit === "all" ? "90" : limit}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Liste déroulante des candidats */}
          <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar pr-1">
            {displayedCandidates.map((c, idx) => {
              const isSelected = selectedCandidate?.candidate === c.candidate;
              const isCompared =
                comparisonCandidate?.candidate === c.candidate;

              return (
                <button
                  key={c.candidate}
                  onClick={() => {
                    audioEngine.play("click");
                    if (isCompareMode) {
                      setComparisonCandidate(c);
                    } else {
                      setSelectedCandidate(c);
                    }
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left transform active:scale-[0.98] ${
                    isSelected
                      ? `${theme.bg} ${theme.border} text-white shadow-lg`
                      : isCompared
                        ? "bg-indigo-950/80 border-indigo-500/50 text-indigo-200"
                        : "bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={`text-[10px] font-black w-5 shrink-0 font-mono ${
                        isSelected ? "text-white/70" : "text-slate-500"
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <NumberBall
                      number={c.candidate}
                      size="sm"
                      selected={isSelected}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-xs">
                          Numéro {c.candidate}
                        </span>
                        {c.isDnaBoosted && (
                          <span
                            className={`text-[8px] font-black px-1.5 py-0.2 rounded border ${
                              isSelected
                                ? "bg-amber-400/20 border-amber-300/40 text-amber-200"
                                : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                            }`}
                          >
                            +{Math.round(((c.dnaMultiplier ?? 1) - 1) * 100)}%
                            ADN
                          </span>
                        )}
                        {c.features.isConsensusTrap && (
                          <span className="text-[8px] font-black px-1.5 py-0.2 rounded bg-rose-500/20 border border-rose-500/30 text-rose-300">
                            Piège
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-[10px] font-medium flex items-center gap-2 mt-0.5 ${
                          isSelected ? "text-white/80" : "text-slate-400"
                        }`}
                      >
                        <span className="font-bold">{c.score}%</span>
                        <span className="opacity-70">
                          (Forêt: {c.rawScore ?? c.score}% • Conc:{" "}
                          {c.concordance ?? 50}%)
                        </span>
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <Check size={15} className="text-white shrink-0 ml-1.5" />
                  )}
                </button>
              );
            })}

            {displayedCandidates.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-xs italic">
                Aucun candidat trouvé pour cette recherche.
              </div>
            )}
          </div>
        </div>

        {/* Colonne Droite : Fiche d'Inférence, Trace de Décision & Comparateur */}
        <div className="lg:col-span-8 space-y-6">
          {selectedCandidate ? (
            <>
              {/* Carte Principale de l'Élu */}
              <div
                className={`p-6 sm:p-7 rounded-3xl shadow-2xl relative overflow-hidden transition-all duration-500 bg-gradient-to-br ${theme.gradient} border ${
                  filterMode === "shadow"
                    ? "border-rose-800/40"
                    : filterMode === "average"
                      ? "border-blue-800/40"
                      : "border-emerald-800/40"
                }`}
              >
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
                  {/* Attracteur Central */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className="text-[9px] font-black uppercase tracking-widest mb-3 px-3.5 py-1 rounded-full border bg-white/10 border-white/20 text-white">
                      Élu Prioritaire
                    </div>
                    <NumberBall
                      number={selectedCandidate.candidate}
                      size="xl"
                      isAttractor
                    />
                    <div className="mt-3 text-[10px] font-mono text-slate-300 text-center">
                      Concordance :{" "}
                      <strong className="text-white">
                        {selectedCandidate.concordance ?? 50}%
                      </strong>
                    </div>
                  </div>

                  {/* Analyse & Scores Détaillés */}
                  <div className="flex-1 text-center md:text-left">
                    <div className="flex flex-wrap items-baseline gap-3 justify-center md:justify-start">
                      <div className="text-5xl sm:text-6xl font-black text-white leading-none">
                        {selectedCandidate.score}%
                      </div>
                      <div className="flex flex-wrap gap-1.5 pb-1">
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-slate-300">
                          Forêt Brute :{" "}
                          {selectedCandidate.rawScore ??
                            selectedCandidate.score}
                          %
                        </span>
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center gap-1">
                          <Sparkles size={11} /> Tamis ADN :{" "}
                          {selectedCandidate.dnaAffinity ?? 50}% (x
                          {selectedCandidate.dnaMultiplier ?? 1.0})
                        </span>
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300">
                          Arbres : {selectedCandidate.concordance ?? 50}% OUI
                        </span>
                      </div>
                    </div>

                    <h4 className="text-sm font-bold text-slate-300 mt-2 mb-4">
                      Probabilité d'apparition estimée après tamisage continu par
                      l'ADN
                    </h4>

                    {/* Explication Contextuelle Différentiable */}
                    <div className="bg-black/35 p-4 sm:p-5 rounded-2xl border border-white/10 backdrop-blur-md space-y-2.5 text-left">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Sparkles size={12} className="text-amber-400" /> Logique
                        d'Inférence Mathématique
                      </h5>
                      <p className="text-xs text-slate-200 leading-relaxed font-medium">
                        {filterMode === "shadow"
                          ? `Le numéro ${selectedCandidate.candidate} présente une distance de Mahalanobis favorable. Retard temporel critique sans surchauffe de consensus.`
                          : filterMode === "average"
                            ? `Le numéro ${selectedCandidate.candidate} est positionné dans la zone de régularité Gaussienne. Faible vulnérabilité aux corrections statistiques.`
                            : `Le numéro ${selectedCandidate.candidate} réunit une forte fréquence récente, un écart sous tension et une validation topologique de voisinage.`}
                      </p>

                      {selectedCandidate.isDnaBoosted && (
                        <div className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl flex items-center gap-2">
                          <Sparkles
                            size={14}
                            className="text-amber-400 shrink-0"
                          />
                          <span>
                            <strong>Amplification ADN :</strong> +
                            {Math.round(
                              ((selectedCandidate.dnaMultiplier ?? 1) - 1) *
                                100,
                            )}
                            % de poids en raison d'une forte résonance avec les
                            moteurs dominants (
                            {dnaSieveInfo?.dominantAlgos
                              .slice(0, 3)
                              .join(", ") || "Actifs"}
                            ).
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Chemin de Décision & Arbre d'Inférence Trace */}
              {selectedCandidate.decisionPath && (
                <div className="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-indigo-500/30 backdrop-blur-md space-y-3">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400 flex items-center gap-2">
                      <GitBranch size={15} /> Chemin de Décision &amp;
                      Bifurcation (N°{selectedCandidate.candidate})
                    </h4>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Parcours déterministe sur l'arbre maître
                    </span>
                  </div>
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
                    <DecisionPathNodeView
                      node={selectedCandidate.decisionPath}
                    />
                  </div>
                </div>
              )}

              {/* Empreinte des 7 Caractéristiques / Jauges d'Inférence */}
              <div className="bg-slate-900/60 p-5 sm:p-6 rounded-3xl border border-slate-800 backdrop-blur-md">
                <div className="flex justify-between items-center mb-5">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-300 flex items-center gap-2">
                    <BrainCircuit
                      size={15}
                      className="text-emerald-400 animate-pulse"
                    />
                    Empreinte des Signaux d'Inférence
                  </h4>
                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setIsCompareMode(!isCompareMode);
                      if (!isCompareMode && !comparisonCandidate) {
                        const other = candidates.find(
                          (c) => c.candidate !== selectedCandidate.candidate,
                        );
                        if (other) setComparisonCandidate(other);
                      }
                    }}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                      isCompareMode
                        ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    <Columns size={13} />
                    <span>
                      {isCompareMode
                        ? "Fermer Comparateur"
                        : "Mode Comparateur"}
                    </span>
                  </button>
                </div>

                {/* Grille des Features avec Mode Comparaison optionnel */}
                <div className="grid sm:grid-cols-2 gap-3.5">
                  {selectedFeatures.map((featName, idx) => {
                    const val = selectedCandidate.features.values?.[idx] ?? 0;
                    const percent = Math.round(val * 100);

                    const compareVal = comparisonCandidate
                      ? comparisonCandidate.features.values?.[idx] ?? 0
                      : null;
                    const comparePercent =
                      compareVal !== null ? Math.round(compareVal * 100) : null;

                    let description = "Densité intermédiaire.";
                    if (featName === "Critical Gap") {
                      description =
                        val > 0.7
                          ? "Écart critique saturé, propice à une sortie."
                          : "Écart sous tension stable.";
                    } else if (featName === "Frequency") {
                      description =
                        val > 0.7
                          ? "Dynamique de sortie très élevée sur la fenêtre de Breiman."
                          : "Inertie de sortie basse, en phase de latence.";
                    } else if (featName === "Shadow") {
                      description =
                        val > 0.6
                          ? "Forte probabilité d'ombre (écart actif sans consensus)."
                          : "Ombre résiduelle faible.";
                    } else if (featName === "Consensus Trap") {
                      description =
                        val > 0.5
                          ? "Attention : Surpoids de consensus détecté (risque de faux positif)."
                          : "Absence de piège de consensus.";
                    } else if (featName === "Neighbor") {
                      description =
                        val > 0.6
                          ? "Proximité topologique avec les récents vainqueurs."
                          : "Isolement spatial temporaire.";
                    } else if (featName === "Machine Leak") {
                      description =
                        val > 0.6
                          ? "Forte congruence avec la signature machine."
                          : "Signature machine neutre.";
                    } else if (featName === "Norm Gap") {
                      description =
                        val > 0.7
                          ? "Probabilité cumulative de retour à la moyenne élevée."
                          : "Index de retour régulier.";
                    }

                    return (
                      <div
                        key={featName}
                        className="p-3.5 bg-slate-950/70 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-black uppercase text-slate-300 tracking-wider">
                            {featName}
                          </span>
                          <div className="flex items-center gap-1.5 font-mono">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                              N°{selectedCandidate.candidate}: {percent}%
                            </span>
                            {comparePercent !== null &&
                              comparisonCandidate && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-500/40 text-indigo-300">
                                  N°{comparisonCandidate.candidate}:{" "}
                                  {comparePercent}%
                                </span>
                              )}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          {/* Barre Candidat 1 */}
                          <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${
                                val > 0.75
                                  ? "from-rose-500 to-amber-500"
                                  : "from-indigo-500 to-emerald-400"
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>

                          {/* Barre Comparateur Candidat 2 */}
                          {comparePercent !== null && (
                            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-400"
                                style={{ width: `${comparePercent}%` }}
                              />
                            </div>
                          )}

                          <p className="text-[10px] text-slate-400 leading-normal font-medium pt-1">
                            {description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center bg-slate-900/40 rounded-3xl border-2 border-dashed border-slate-800 text-slate-400 p-8 text-center min-h-[400px]">
              <Vote size={48} className="mb-4 opacity-20 text-indigo-400" />
              <p className="text-xs font-bold uppercase tracking-widest">
                Sélectionnez un candidat dans la liste pour inspecter sa décision
              </p>
            </div>
          )}

          {/* Guide Pédagogique & Poids Décisionnels Globaux (Pearson R²) */}
          <div className="grid md:grid-cols-2 gap-5">
            <div className="p-5 rounded-2xl border bg-slate-900/60 border-slate-800 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <HelpCircle size={20} className="text-indigo-400 shrink-0" />
                <div>
                  <h5 className="text-xs font-black uppercase mb-1.5 text-indigo-300">
                    Comprendre la Forêt Décisionnelle
                  </h5>
                  <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                    La forêt floue combine des dizaines d'arbres de décision
                    autonomes calibrés sur les tirages passés.
                    <br />
                    <br />
                    • <strong>Top :</strong> Forte concordance majoritaire (&gt;
                    60%).
                    <br />
                    • <strong>Moyen :</strong> Équilibre statistique régulier
                    (40-60%).
                    <br />
                    • <strong>Quantique :</strong> Filtrage stabilisé par
                    élagage OOB.
                    <br />• <strong>Ombre :</strong> Détection de signaux
                    faibles sous tension.
                  </p>
                </div>
              </div>
            </div>

            {globalImportance.length > 0 && (
              <div className="p-5 rounded-2xl border bg-slate-900/60 border-slate-800 flex flex-col">
                <div className="flex justify-between items-center mb-3">
                  <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                    <BarChart3 size={13} className="text-purple-400" />
                    Poids Décisionnels (Pearson R²)
                  </h5>
                  <span className="text-[9px] font-mono text-slate-500">
                    Impact relatif
                  </span>
                </div>
                <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[140px] custom-scrollbar pr-1">
                  {globalImportance.map((imp, idx) => (
                    <div
                      key={imp.name}
                      className="flex justify-between items-center text-xs"
                    >
                      <span
                        className="text-[10px] font-bold text-slate-300 truncate pr-2 max-w-[130px]"
                        title={imp.name}
                      >
                        {imp.name}
                      </span>
                      <div className="flex items-center gap-2 w-1/2">
                        <div className="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              idx === 0
                                ? "bg-purple-500"
                                : idx === 1
                                  ? "bg-indigo-500"
                                  : "bg-slate-600"
                            }`}
                            style={{
                              width: `${Math.min(100, Math.max(0, imp.val * 100))}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-mono font-black text-slate-400 w-8 text-right">
                          {(imp.val * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
