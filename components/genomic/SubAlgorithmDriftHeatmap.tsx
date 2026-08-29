import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { useForensicData } from "../../hooks/useForensicData";
import {
  computeSubAlgorithmDivergenceCorrelations,
  SubAlgoHeatmapData,
  SubAlgoCorrelationMetric,
} from "../../services/prediction/algorithmDivergenceCorrelationService";
import { synchronizeAlgorithmsToDnaReference } from "../../services/prediction/dnaAuditService";
import { computeChronologicalAlgoReinforcement } from "../../services/prediction/weightsManager";
import { audioEngine } from "../../utils/audioEngine";
import { useToast } from "../ui/Toast";
import {
  Flame,
  AlertTriangle,
  ShieldCheck,
  ArrowRightLeft,
  Search,
  Filter,
  RefreshCw,
  Layers,
  Sparkles,
  Zap,
  Activity,
  Sliders,
  ChevronDown,
  ChevronUp,
  Cpu,
  BarChart3,
  TrendingDown,
  Scale,
  Ban,
  CheckCircle2,
  Info,
} from "lucide-react";
import { AlgoKey } from "../../shared/prediction.types";

interface SubAlgorithmDriftHeatmapProps {
  drawName: string;
  className?: string;
}

type HeatmapViewMode = "METRICS_HEATMAP" | "TIMELINE_HEATMAP" | "CROSS_HEATMAP";
type SortOption =
  | "WORST_FIRST"
  | "BEST_FIRST"
  | "DRIFT_DELTA"
  | "CORRELATION"
  | "PROOF_SCORE"
  | "CATEGORY"
  | "NAME";

export const SubAlgorithmDriftHeatmap: React.FC<SubAlgorithmDriftHeatmapProps> = ({
  drawName,
  className = "",
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const setGlobalWeights = useNexusStore((state) => state.setGlobalWeights);
  const updateGlobalWeights = useNexusStore((state) => state.updateGlobalWeights);
  const addAgentLog = useNexusStore((state) => state.addAgentLog);

  // Données médico-légales
  const { reports, loading: forensicLoading, refreshLocal } = useForensicData(drawName);

  // État de la heatmap
  const [heatmapData, setHeatmapData] = useState<SubAlgoHeatmapData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Filtres et Contrôles
  const [viewMode, setViewMode] = useState<HeatmapViewMode>("METRICS_HEATMAP");
  const [sortBy, setSortBy] = useState<SortOption>("WORST_FIRST");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedAlgo, setSelectedAlgo] = useState<SubAlgoCorrelationMetric | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    algo: string;
    metric: string;
    value: string | number;
    description: string;
  } | null>(null);

  // Calcul déterministe de la Heatmap
  const loadHeatmapData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await computeSubAlgorithmDivergenceCorrelations(
        drawName,
        history,
        globalWeights,
        reports
      );
      setHeatmapData(data);
      if (data.highestToxicityAlgo && !selectedAlgo) {
        setSelectedAlgo(data.highestToxicityAlgo);
      }
    } catch (err: any) {
      console.error("[HEATMAP LOAD ERROR]", err);
    } finally {
      setLoading(false);
    }
  }, [drawName, history, globalWeights, reports]);

  useEffect(() => {
    loadHeatmapData();
  }, [loadHeatmapData]);

  // Ré-harmonisation 1-Click
  const handleHarmonizeAll = async () => {
    try {
      setIsSyncing(true);
      try {
        audioEngine.play("scan");
      } catch (e) {}

      const syncResult = await synchronizeAlgorithmsToDnaReference(
        drawName,
        history,
        globalWeights
      );

      setGlobalWeights(syncResult.synchronizedWeights);
      await loadHeatmapData();

      addAgentLog({
        id: `dna_reharmonize_heatmap_${Date.now()}`,
        timestamp: new Date(),
        action: `Harmonisation complète des sous-algorithmes depuis la Heatmap d'Écarts (${drawName}).`,
        type: "AUTOTUNE",
        impact: `Alignement rétabli à 100% sur l'ADN canonique.`,
      });

      try {
        audioEngine.play("success");
      } catch (e) {}

      showToast(
        `Tous les moteurs de calcul ont été ré-alignés sur la signature ADN de ${drawName}.`,
        "success"
      );
    } catch (e: any) {
      showToast(`Erreur lors de la ré-harmonisation : ${e.message}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  // Neutralisation directe des algorithmes toxiques
  const handleQuarantineToxicAlgos = () => {
    if (!heatmapData) return;
    const toxicAlgos = heatmapData.correlationMetrics.filter(
      (m) => m.status === "CRITICAL_UNDERPERFORMING" || m.toxicityIndex >= 65
    );

    if (toxicAlgos.length === 0) {
      showToast("Aucun moteur n'est actuellement en état critique de toxicité.", "info");
      return;
    }

    try {
      audioEngine.play("click");
    } catch (e) {}

    const newWeights = { ...globalWeights };
    toxicAlgos.forEach((algo) => {
      // Ramener au seuil d'amortissement minimal sécurisé (0.015)
      newWeights[algo.algoKey] = 0.015;
    });

    setGlobalWeights(newWeights);
    loadHeatmapData();

    addAgentLog({
      id: `quarantine_toxic_algos_${Date.now()}`,
      timestamp: new Date(),
      action: `Mise en quarantaine et abaissement des poids de ${toxicAlgos.length} sous-algorithmes toxiques.`,
      type: "AUTOTUNE",
      impact: `Atténuation immédiate des amplifications d'erreurs.`,
    });

    showToast(
      `${toxicAlgos.length} moteur(s) sous-performants ont été neutralisés avec succès.`,
      "success"
    );
  };

  // Verrouillage IA : Activer et booster EXCLUSIVEMENT les algorithmes ayant fait leurs preuves
  const handleReinforceProvenOnly = () => {
    try {
      audioEngine.play("click");
    } catch (e) {}

    const reinforcedWeights = computeChronologicalAlgoReinforcement(
      drawName,
      history,
      globalWeights
    );

    setGlobalWeights(reinforcedWeights);
    loadHeatmapData();

    addAgentLog({
      id: `empirical_proof_reinforce_${Date.now()}`,
      timestamp: new Date(),
      action: `Application stricte du principe de Preuve Empirique sur ${drawName} : 0 hausse pour les non-prouvés.`,
      type: "AUTOTUNE",
      impact: `Poids redistribués uniquement sur les sous-algorithmes statistiquement validés.`,
    });

    showToast(
      `Poids recalibrés : seuls les algorithmes aux performances réelles prouvées sont renforcés.`,
      "success"
    );
  };

  // Ré-alignement individuel d'un algorithme
  const handleSingleAlgoRealignment = (algo: SubAlgoCorrelationMetric) => {
    try {
      audioEngine.play("click");
    } catch (e) {}

    updateGlobalWeights({
      ...globalWeights,
      [algo.algoKey]: algo.canonicalWeight,
    });

    showToast(
      `Le moteur "${algo.label}" a été ré-aligné sur son poids canonique (${algo.canonicalWeight.toFixed(4)}).`,
      "success"
    );
    loadHeatmapData();
  };

  // Filtrage et Tri des métriques pour l'affichage
  const processedMetrics = useMemo(() => {
    if (!heatmapData) return [];

    let list = [...heatmapData.correlationMetrics];

    // Filtre par catégorie
    if (categoryFilter === "CRITICAL_ONLY") {
      list = list.filter((m) => m.status === "CRITICAL_UNDERPERFORMING" || m.toxicityIndex >= 60);
    } else if (categoryFilter !== "ALL") {
      list = list.filter((m) => m.category === categoryFilter);
    }

    // Filtre par texte de recherche
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.label.toLowerCase().includes(q) ||
          m.algoKey.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q)
      );
    }

    // Tri dynamique
    list.sort((a, b) => {
      switch (sortBy) {
        case "WORST_FIRST":
          return b.toxicityIndex - a.toxicityIndex;
        case "BEST_FIRST":
          return a.toxicityIndex - b.toxicityIndex;
        case "DRIFT_DELTA":
          return b.weightDriftDelta - a.weightDriftDelta;
        case "CORRELATION":
          return b.errorCorrelation - a.errorCorrelation;
        case "PROOF_SCORE":
          return b.proofScore - a.proofScore;
        case "CATEGORY":
          return a.category.localeCompare(b.category);
        case "NAME":
          return a.label.localeCompare(b.label);
        default:
          return b.toxicityIndex - a.toxicityIndex;
      }
    });

    return list;
  }, [heatmapData, categoryFilter, searchQuery, sortBy]);

  // Fonction utilitaire pour générer la couleur continue de la cellule (0 à 100)
  const getHeatmapColor = (value: number, inverse: boolean = false) => {
    // Normalisation 0 - 100
    const v = Math.min(100, Math.max(0, value));
    const score = inverse ? 100 - v : v;

    if (score < 25) {
      // Vert émeraude (Optimal / Très fiable)
      return "bg-emerald-950/70 text-emerald-300 border-emerald-500/30 hover:border-emerald-400";
    } else if (score < 45) {
      // Cyan / Bleu (Nominal / Stable)
      return "bg-cyan-950/60 text-cyan-300 border-cyan-500/30 hover:border-cyan-400";
    } else if (score < 65) {
      // Ambre / Jaune (Dérive modérée / Attention)
      return "bg-amber-950/70 text-amber-300 border-amber-500/40 hover:border-amber-400";
    } else {
      // Rose / Rouge vif (Toxique / Sous-performant critique)
      return "bg-rose-950/80 text-rose-300 border-rose-500/50 hover:border-rose-400 font-bold animate-pulse";
    }
  };

  const getHeatmapBgStyle = (value: number) => {
    const v = Math.min(100, Math.max(0, value)) / 100;
    if (v < 0.25) {
      return { backgroundColor: `rgba(16, 185, 129, ${0.15 + v * 0.4})` };
    } else if (v < 0.5) {
      return { backgroundColor: `rgba(6, 182, 212, ${0.2 + v * 0.4})` };
    } else if (v < 0.75) {
      return { backgroundColor: `rgba(245, 158, 11, ${0.25 + v * 0.5})` };
    } else {
      return { backgroundColor: `rgba(225, 29, 72, ${0.35 + v * 0.55})` };
    }
  };

  return (
    <div
      id="sub-algorithm-drift-heatmap-container"
      className={`space-y-6 animate-fade-in ${className}`}
    >
      {/* En-Tête & Résumé Analytique */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              <span className="px-3 py-1 bg-gradient-to-r from-rose-500/20 to-amber-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5 shadow-sm shadow-rose-500/20">
                <Flame size={12} className="text-rose-400" />
                Heatmap de Corrélation des Écarts
              </span>
              <span className="px-3 py-1 bg-white/5 border border-white/10 text-slate-300 text-[10px] font-mono uppercase tracking-widest rounded-full">
                {drawName}
              </span>

              {heatmapData && heatmapData.underperformingCount > 0 ? (
                <span className="px-3 py-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5 animate-pulse">
                  <AlertTriangle size={12} />
                  {heatmapData.underperformingCount} Moteur(s) Sous-Performant(s)
                </span>
              ) : (
                <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5">
                  <CheckCircle2 size={12} />
                  Tous les Moteurs Sont Alignés
                </span>
              )}
            </div>

            <h3 className="text-xl md:text-3xl font-black text-white uppercase tracking-tight">
              Corrélations Écarts & Sous-Algorithmes
            </h3>

            <p className="text-xs md:text-sm text-slate-400 leading-relaxed">
              Matrice thermo-statistique croisant les signaux émis par chaque sous-algorithme
              avec les erreurs de prédiction réelles sur{" "}
              <span className="text-white font-bold">{drawName}</span>. Permet d'isoler
              instantanément les moteurs de calcul générant des dérives de poids et des faux positifs.
            </p>
          </div>

          {/* Boutons d'Action Rapide */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <button
              id="refresh-heatmap-btn"
              onClick={() => {
                refreshLocal();
                loadHeatmapData();
              }}
              disabled={loading || forensicLoading}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin text-indigo-400" : ""} />
              Actualiser
            </button>

            {heatmapData && heatmapData.underperformingCount > 0 && (
              <button
                id="quarantine-toxic-btn"
                onClick={handleQuarantineToxicAlgos}
                className="px-4 py-3 bg-rose-950/80 hover:bg-rose-900/90 text-rose-200 border border-rose-500/50 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-rose-900/30"
                title="Abaisse automatiquement les poids des algorithmes à forte corrélation d'erreur"
              >
                <Ban size={14} className="text-rose-400" />
                Neutraliser Toxiques ({heatmapData.underperformingCount})
              </button>
            )}

            <button
              id="reinforce-proven-only-btn"
              onClick={handleReinforceProvenOnly}
              className="px-4 py-3 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-500/50 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-950/40"
              title="Garantit qu'aucun algorithme ne voit son poids augmenté s'il ne fait pas ses preuves"
            >
              <ShieldCheck size={14} className="text-emerald-400" />
              Filtrer par Preuve Empirique
            </button>

            <button
              id="harmonize-all-heatmap-btn"
              onClick={handleHarmonizeAll}
              disabled={isSyncing}
              className="px-5 py-3 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-rose-600/30 ring-2 ring-rose-400/30 transition-all active:scale-95 disabled:opacity-50"
            >
              <ArrowRightLeft size={16} className={isSyncing ? "animate-spin" : ""} />
              {isSyncing ? "Ré-alignement..." : "Harmoniser l'ADN"}
            </button>
          </div>
        </div>

        {/* Métriques d'Agrégation Haute Précision */}
        {heatmapData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 mt-6 pt-6 border-t border-white/5">
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5">
              <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5">
                <Cpu size={12} className="text-indigo-400" />
                Moteurs Évalués
              </div>
              <div className="text-sm md:text-lg font-mono font-black text-white mt-0.5">
                {heatmapData.totalAlgorithms}
                <span className="text-[10px] text-slate-500 font-normal ml-1">sous-algos</span>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5">
              <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5">
                <AlertTriangle size={12} className="text-rose-400" />
                Moteurs Pénalisants
              </div>
              <div className="text-sm md:text-lg font-mono font-black text-rose-400 mt-0.5">
                {heatmapData.underperformingCount}
                <span className="text-[10px] text-slate-500 font-normal ml-1">
                  ({Math.round((heatmapData.underperformingCount / heatmapData.totalAlgorithms) * 100)}%)
                </span>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5">
              <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5">
                <Flame size={12} className="text-amber-400" />
                Toxicité Moyenne
              </div>
              <div className="text-sm md:text-lg font-mono font-black text-amber-300 mt-0.5">
                {heatmapData.averageToxicity}%
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5">
              <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5">
                <Activity size={12} className="text-cyan-400" />
                Pire Moteur Détecté
              </div>
              <div className="text-xs md:text-sm font-black text-white mt-1 truncate">
                {heatmapData.highestToxicityAlgo ? (
                  <span className="text-rose-300 font-mono">
                    {heatmapData.highestToxicityAlgo.label} ({heatmapData.highestToxicityAlgo.toxicityIndex}%)
                  </span>
                ) : (
                  <span className="text-emerald-400">Aucun</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Barre d'Outils : Modes de Visualisation, Tri et Filtres */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 bg-slate-900/70 p-4 rounded-3xl border border-white/10 backdrop-blur-md">
        {/* Sélecteur de Mode */}
        <div className="inline-flex p-1 bg-slate-950/80 border border-white/10 rounded-2xl gap-1 overflow-x-auto">
          <button
            id="heatmap-mode-metrics"
            onClick={() => setViewMode("METRICS_HEATMAP")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 ${
              viewMode === "METRICS_HEATMAP"
                ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <BarChart3 size={13} />
            Matrice Dimensions d'Écart
          </button>

          <button
            id="heatmap-mode-timeline"
            onClick={() => setViewMode("TIMELINE_HEATMAP")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 ${
              viewMode === "TIMELINE_HEATMAP"
                ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Activity size={13} />
            Derniers Tirages Réels
          </button>

          <button
            id="heatmap-mode-cross"
            onClick={() => setViewMode("CROSS_HEATMAP")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 ${
              viewMode === "CROSS_HEATMAP"
                ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Layers size={13} />
            Co-Dérive Inter-Moteurs
          </button>
        </div>

        {/* Contrôles de Recherche et de Tri */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Recherche */}
          <div className="relative min-w-[180px] flex-1 sm:flex-none">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              id="heatmap-search-input"
              type="text"
              placeholder="Chercher un sous-algo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-slate-950/70 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
            />
          </div>

          {/* Tri */}
          <select
            id="heatmap-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-3 py-2 bg-slate-950/70 border border-white/10 rounded-xl text-xs font-bold text-slate-200 focus:outline-none focus:border-rose-500 cursor-pointer"
          >
            <option value="WORST_FIRST">⚠️ Moins Performants en Premier</option>
            <option value="BEST_FIRST">✨ Plus Performants en Premier</option>
            <option value="PROOF_SCORE">🛡️ Preuve Empirique (Z-Score)</option>
            <option value="DRIFT_DELTA">📈 Plus Forte Dérive (Δw)</option>
            <option value="CORRELATION">🔗 Corrélation d'Erreur (r)</option>
            <option value="CATEGORY">📁 Par Catégorie</option>
            <option value="NAME">🔤 Nom Alphabétique</option>
          </select>

          {/* Filtre de Catégorie */}
          <select
            id="heatmap-category-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950/70 border border-white/10 rounded-xl text-xs font-bold text-slate-200 focus:outline-none focus:border-rose-500 cursor-pointer"
          >
            <option value="ALL">Tous les Moteurs</option>
            <option value="CRITICAL_ONLY">🚨 Défaillants Uniquement</option>
            <option value="Fréquentiel & Transition">Fréquentiel & Transition</option>
            <option value="Mathématique & Structural">Mathématique & Structural</option>
            <option value="Dynamiques Avancées">Dynamiques Avancées</option>
          </select>
        </div>
      </div>

      {/* Légende Thermo-Statistique */}
      <div className="bg-slate-950/60 p-3 rounded-2xl border border-white/5 flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono">
        <div className="flex items-center gap-2 text-slate-400 font-bold uppercase tracking-wider">
          <Info size={12} className="text-indigo-400" />
          Échelle Thermo-Colorimétrique de Dérive :
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-600 inline-block border border-emerald-400/40" />
            <span className="text-emerald-300 font-bold">0-25% Optimal & Fidèle</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-cyan-600 inline-block border border-cyan-400/40" />
            <span className="text-cyan-300">25-45% Nominal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-500 inline-block border border-amber-400/40" />
            <span className="text-amber-300 font-bold">45-65% Dérive Modérée</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-600 inline-block border border-rose-400/50 animate-pulse" />
            <span className="text-rose-300 font-bold">65-100% Critique / Toxique</span>
          </div>
        </div>
      </div>

      {/* VUE 1 : MATRICE DES DIMENSIONS D'ÉCART */}
      {viewMode === "METRICS_HEATMAP" && (
        <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-5 md:p-6 shadow-2xl overflow-x-auto">
          <table className="w-full border-collapse text-left min-w-[900px]">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase font-black tracking-widest text-slate-400">
                <th className="py-3 px-4 w-60">Sous-Algorithme & Catégorie</th>
                <th className="py-3 px-3 text-center">Poids Actif / Canon</th>
                <th className="py-3 px-3 text-center">Preuve Empirique</th>
                <th className="py-3 px-3 text-center">Dérive Δw</th>
                <th className="py-3 px-3 text-center">Corrélation Erreur (r)</th>
                <th className="py-3 px-3 text-center">Perte Wasserstein</th>
                <th className="py-3 px-3 text-center">Faux Positifs</th>
                <th className="py-3 px-3 text-center">Sensibilité Voisins</th>
                <th className="py-3 px-3 text-center">Indice Toxicité</th>
                <th className="py-3 px-3 text-center">Action Corrective</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {processedMetrics.map((metric) => {
                const isSelected = selectedAlgo?.algoKey === metric.algoKey;
                const isCritical = metric.status === "CRITICAL_UNDERPERFORMING";
                const isDrifting = metric.weightDriftDelta >= 0.05;

                return (
                  <tr
                    key={metric.algoKey}
                    onClick={() => setSelectedAlgo(metric)}
                    className={`cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? "bg-rose-950/40 ring-1 ring-rose-500/50"
                        : "hover:bg-slate-800/50"
                    }`}
                  >
                    {/* Nom de l'algorithme */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            isCritical
                              ? "bg-rose-500 animate-pulse"
                              : isDrifting
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                          }`}
                        />
                        <div>
                          <div className="font-bold text-white tracking-tight flex items-center gap-1.5">
                            {metric.label}
                            {isCritical && (
                              <span className="px-1.5 py-0.2 bg-rose-500/20 text-rose-300 text-[8px] font-mono uppercase font-black rounded border border-rose-500/40">
                                Sous-Performant
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {metric.category} • {metric.algoKey}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Poids Actif vs Canonique */}
                    <td className="py-3 px-3 text-center font-mono text-[11px]">
                      <span className="text-white font-bold">{metric.activeWeight.toFixed(3)}</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-slate-400">{metric.canonicalWeight.toFixed(3)}</span>
                    </td>

                    {/* Cellule Preuve Empirique (Z-score & Validité) */}
                    <td className="py-2.5 px-3 text-center">
                      <div
                        className={`py-1.5 px-2 rounded-xl border text-[10px] font-mono font-bold flex items-center justify-center gap-1 shadow-sm transition-transform hover:scale-105 ${
                          metric.hasEmpiricalProof && metric.proofScore > 0
                            ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/40"
                            : "bg-slate-950/80 text-slate-400 border-white/10"
                        }`}
                      >
                        {metric.hasEmpiricalProof && metric.proofScore > 0 ? (
                          <>
                            <ShieldCheck size={12} className="text-emerald-400 shrink-0" />
                            <span>+{metric.proofScore.toFixed(2)}σ</span>
                          </>
                        ) : (
                          <>
                            <Ban size={12} className="text-rose-400 shrink-0" />
                            <span>{metric.proofScore <= 0 ? `${metric.proofScore.toFixed(2)}σ` : "0 preuve"}</span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Cellule Dérive de Poids (Δw) */}
                    <td className="py-2.5 px-3 text-center">
                      <div
                        className={`py-1.5 px-2.5 rounded-xl border text-[11px] font-mono font-bold transition-transform hover:scale-105 ${getHeatmapColor(
                          metric.weightDriftDelta * 400
                        )}`}
                      >
                        +{(metric.weightDriftDelta * 100).toFixed(1)}%
                      </div>
                    </td>

                    {/* Cellule Corrélation Linéaire d'Erreur (r) */}
                    <td className="py-2.5 px-3 text-center">
                      <div
                        className={`py-1.5 px-2.5 rounded-xl border text-[11px] font-mono font-bold transition-transform hover:scale-105 ${getHeatmapColor(
                          Math.max(0, metric.errorCorrelation) * 100
                        )}`}
                      >
                        {metric.errorCorrelation >= 0 ? `+${metric.errorCorrelation.toFixed(2)}` : metric.errorCorrelation.toFixed(2)}
                      </div>
                    </td>

                    {/* Cellule Perte de Wasserstein */}
                    <td className="py-2.5 px-3 text-center">
                      <div
                        className={`py-1.5 px-2.5 rounded-xl border text-[11px] font-mono font-bold transition-transform hover:scale-105 ${getHeatmapColor(
                          metric.wassersteinLoss * 100
                        )}`}
                      >
                        {metric.wassersteinLoss.toFixed(2)}
                      </div>
                    </td>

                    {/* Cellule Faux Positifs */}
                    <td className="py-2.5 px-3 text-center">
                      <div
                        className={`py-1.5 px-2.5 rounded-xl border text-[11px] font-mono font-bold transition-transform hover:scale-105 ${getHeatmapColor(
                          metric.falsePositiveRate * 100
                        )}`}
                      >
                        {Math.round(metric.falsePositiveRate * 100)}%
                      </div>
                    </td>

                    {/* Cellule Sensibilité Voisins/Miroirs */}
                    <td className="py-2.5 px-3 text-center">
                      <div
                        className={`py-1.5 px-2.5 rounded-xl border text-[11px] font-mono font-bold transition-transform hover:scale-105 ${getHeatmapColor(
                          metric.nearMissSensitivity * 100
                        )}`}
                      >
                        {Math.round(metric.nearMissSensitivity * 100)}%
                      </div>
                    </td>

                    {/* Cellule Score Composite de Toxicité */}
                    <td className="py-2.5 px-3 text-center">
                      <div
                        className={`py-1.5 px-3 rounded-xl border text-xs font-mono font-black shadow-sm transition-transform hover:scale-105 ${getHeatmapColor(
                          metric.toxicityIndex
                        )}`}
                      >
                        {metric.toxicityIndex}%
                      </div>
                    </td>

                    {/* Action Rapide */}
                    <td className="py-2.5 px-3 text-center">
                      {isDrifting ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSingleAlgoRealignment(metric);
                          }}
                          className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                          title="Ré-aligner sur le poids canonique"
                        >
                          Ré-aligner
                        </button>
                      ) : (
                        <span className="text-[10px] text-emerald-400 font-mono font-bold flex items-center justify-center gap-1">
                          <CheckCircle2 size={12} /> Alignée
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* VUE 2 : CHRONOLOGIE PAR TIRAGE RÉCENT */}
      {viewMode === "TIMELINE_HEATMAP" && heatmapData && (
        <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-5 md:p-6 shadow-2xl overflow-x-auto space-y-4">
          <div className="text-xs text-slate-400">
            Affiche l'intensité de divergence de chaque moteur de calcul lors des{" "}
            <span className="text-white font-bold">10 derniers tirages réels</span> de{" "}
            <span className="text-white font-bold">{drawName}</span>. Les cases rouges indiquent
            un tirage où l'algorithme a gravement divergé des résultats gagnants.
          </div>

          <table className="w-full border-collapse text-left min-w-[950px]">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase font-black tracking-widest text-slate-400">
                <th className="py-3 px-4 w-56">Sous-Algorithme</th>
                <th className="py-3 px-2 text-center">Toxicité</th>
                {heatmapData.recentDrawHeaders.map((hdr, hIdx) => (
                  <th key={hIdx} className="py-3 px-2 text-center">
                    <div>{hdr.label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {processedMetrics.map((metric) => (
                <tr
                  key={metric.algoKey}
                  onClick={() => setSelectedAlgo(metric)}
                  className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="font-bold text-white tracking-tight">{metric.label}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{metric.category}</div>
                  </td>

                  <td className="py-2.5 px-2 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold ${getHeatmapColor(
                        metric.toxicityIndex
                      )}`}
                    >
                      {metric.toxicityIndex}%
                    </span>
                  </td>

                  {/* Cellules par tirage */}
                  {metric.drawDivergences.map((drawDiv, dIdx) => (
                    <td key={dIdx} className="py-2 px-1.5 text-center">
                      <div
                        className={`py-2 px-1 rounded-xl text-[10px] font-mono font-bold border transition-transform hover:scale-110 ${getHeatmapColor(
                          drawDiv.divergenceScore
                        )}`}
                        title={`Tirage ${drawDiv.drawDate} : Divergence ${drawDiv.divergenceScore}%`}
                      >
                        {drawDiv.divergenceScore}%
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* VUE 3 : CO-DÉRIVE ET INTER-CORRÉLATIONS D'ERREUR */}
      {viewMode === "CROSS_HEATMAP" && heatmapData && (
        <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-5 md:p-6 shadow-2xl space-y-4">
          <div className="text-xs text-slate-400 leading-relaxed">
            Met en évidence les paires de sous-algorithmes qui accumulent des erreurs communes
            (co-dérive). Une forte valeur (&gt;70%) signale une redondance toxique où deux moteurs
            amplifient mutuellement les mauvaises prédictions.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {heatmapData.crossCorrelations.slice(0, 15).map((cross, cIdx) => (
              <div
                key={cIdx}
                className={`p-4 rounded-2xl border transition-all ${
                  cross.isRedundantOrAmplifying
                    ? "bg-rose-950/40 border-rose-500/40 shadow-lg shadow-rose-950/30"
                    : "bg-slate-950/60 border-white/5"
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-0.5">
                    <div className="font-bold text-white text-xs flex items-center gap-1.5">
                      <span>{cross.labelA}</span>
                      <span className="text-slate-500 font-normal">↔</span>
                      <span>{cross.labelB}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Corrélation Croisée : r = {cross.crossErrorCorrelation >= 0 ? `+${cross.crossErrorCorrelation.toFixed(2)}` : cross.crossErrorCorrelation.toFixed(2)}
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold ${getHeatmapColor(
                      cross.coDriftIndex
                    )}`}
                  >
                    {cross.coDriftIndex}%
                  </span>
                </div>

                {cross.isRedundantOrAmplifying && (
                  <div className="mt-2 text-[10px] text-rose-300 font-bold flex items-center gap-1">
                    <AlertTriangle size={11} className="text-rose-400" />
                    Amplification de Bruit Réciproque Détectée
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PANNEAU DE DIAGNOSTIC DÉTAILLÉ DE L'ALGORITHME SÉLECTIONNÉ */}
      {selectedAlgo && (
        <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono uppercase tracking-widest text-slate-400">
                  Diagnostic Médico-Légal :
                </span>
                <span className="text-lg font-black text-white">{selectedAlgo.label}</span>
                <span className="px-2.5 py-0.5 bg-white/5 border border-white/10 text-slate-300 font-mono text-[10px] rounded-lg">
                  {selectedAlgo.algoKey}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full font-mono font-bold text-[10px] ${getHeatmapColor(
                    selectedAlgo.toxicityIndex
                  )}`}
                >
                  Indice de Toxicité : {selectedAlgo.toxicityIndex}%
                </span>
              </div>
              <p className="text-xs text-slate-300">{selectedAlgo.diagnostics}</p>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <button
                id="realign-selected-algo-btn"
                onClick={() => handleSingleAlgoRealignment(selectedAlgo)}
                className="flex-1 md:flex-none px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-amber-600/30 flex items-center justify-center gap-2"
              >
                <Sliders size={13} />
                Ré-aligner ce Moteur
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-950/60 p-3 rounded-xl border border-white/5">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Poids Actif vs Canon</div>
              <div className="text-xs font-mono font-bold text-white mt-1">
                {selectedAlgo.activeWeight.toFixed(4)}{" "}
                <span className="text-slate-500 font-normal">
                  (vs {selectedAlgo.canonicalWeight.toFixed(4)})
                </span>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-white/5">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Corrélation d'Erreur</div>
              <div className="text-xs font-mono font-bold text-rose-300 mt-1">
                r = {selectedAlgo.errorCorrelation >= 0 ? `+${selectedAlgo.errorCorrelation.toFixed(2)}` : selectedAlgo.errorCorrelation.toFixed(2)}
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-white/5">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Perte Wasserstein</div>
              <div className="text-xs font-mono font-bold text-cyan-300 mt-1">
                W1 = {selectedAlgo.wassersteinLoss.toFixed(3)}
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-white/5">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Fiabilité Globale</div>
              <div className="text-xs font-mono font-bold text-emerald-400 mt-1">
                {selectedAlgo.reliabilityScore}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
