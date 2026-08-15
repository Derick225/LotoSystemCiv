import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import {
  Dna,
  Zap,
  RefreshCw,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Sliders,
  Sparkles,
  Layers,
  Download,
  ShieldCheck,
  Check,
  TrendingUp,
  Cpu,
  BarChart3,
  Award,
  Filter,
  Flame,
} from "lucide-react";
import {
  runGenomicAudit,
  GenomicAuditReport,
  GeneAuditMetric,
} from "../../services/training/genomicAuditService";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { audioEngine } from "../../utils/audioEngine";
import { useToast } from "../ui/Toast";
import { AlgoWeights } from "../../types";

export const GenomicAuditTab: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const setGlobalWeights = useNexusStore((state) => state.setGlobalWeights);

  const [depth, setDepth] = useState<number>(30);
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<
    "ALL" | "underweighted" | "overweighted" | "optimal"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressStatus, setProgressStatus] = useState<string>("");
  const [report, setReport] = useState<GenomicAuditReport | null>(null);
  const [isApplied, setIsApplied] = useState<boolean>(false);

  // Exécution de l'audit génomique
  const handleRunAudit = useCallback(async () => {
    const cleanHistory = purifyHistoryForDraw(drawName, history);
    if (cleanHistory.length < 5) {
      showToast(
        `Historique insuffisant pour l'Audit Génomique (${cleanHistory.length} tirages trouvés).`,
        "error",
      );
      return;
    }

    setIsLoading(true);
    setProgressPercent(0);
    setProgressStatus("Initialisation du profil génomique...");
    setIsApplied(false);
    audioEngine.play("scan");

    try {
      const result = await runGenomicAudit(
        drawName,
        cleanHistory,
        globalWeights,
        {
          depth,
          onProgress: (pct, msg) => {
            setProgressPercent(pct);
            setProgressStatus(msg);
          },
        },
      );

      setReport(result);
      audioEngine.play("success");
      showToast(
        `Audit Génomique complété avec succès pour ${drawName} (${result.evaluatedDrawsCount} tirages analysés)`,
        "success",
      );
    } catch (err: any) {
      console.error(err);
      audioEngine.play("error");
      showToast(`Erreur d'audit génomique : ${err.message || String(err)}`, "error");
    } finally {
      setIsLoading(false);
    }
  }, [drawName, history, globalWeights, depth, showToast]);

  // Lancement automatique au premier montage si un historique est disponible
  useEffect(() => {
    if (history.length >= 5 && !report && !isLoading) {
      handleRunAudit();
    }
  }, [drawName]);

  // Application des poids recommandés au modèle actif
  const handleApplyRecommended = () => {
    if (!report?.recommendedWeights) return;
    setGlobalWeights(report.recommendedWeights);
    setIsApplied(true);
    audioEngine.play("success");
    showToast(
      `Poids génomiques idéaux appliqués avec succès au modèle de prédiction pour ${drawName} !`,
      "success",
    );
    setTimeout(() => setIsApplied(false), 3000);
  };

  // Exportation du diagnostic génomique en JSON
  const handleExportJSON = () => {
    if (!report) return;
    audioEngine.play("click");
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_genomique_${drawName.toLowerCase().replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Rapport d'audit génomique exporté en JSON", "success");
  };

  // Filtrage des gènes
  const filteredGenes = useMemo(() => {
    if (!report) return [];
    return report.allGenes.filter((g) => {
      if (filterCategory !== "ALL" && g.category !== filterCategory) return false;
      if (filterStatus !== "ALL" && g.status !== filterStatus) return false;
      if (
        searchQuery &&
        !g.label.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !g.key.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [report, filterCategory, filterStatus, searchQuery]);

  return (
    <div className="w-full space-y-8 pb-12 animate-fade-in font-sans">
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/70 p-6 md:p-8 rounded-3xl border border-white/5 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        <div className="space-y-1.5 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-[10px] rounded-lg uppercase tracking-wider">
            <Dna size={13} className="text-emerald-400 animate-pulse" />
            Audit Génomique & Concordance d'ADN
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            Génome Algorithmique & Rendement Réel
          </h2>
          <p className="text-xs text-slate-400 font-medium max-w-2xl">
            Confrontation statistique des poids d'ADN actuels face aux résultats historiques effectifs de{" "}
            <span className="text-emerald-400 font-bold">{drawName}</span>. Isolement continu des gènes porteurs sans aucun nombre magique.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap relative z-10">
          <button
            onClick={handleExportJSON}
            disabled={!report || isLoading}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl flex items-center gap-2 transition-colors border border-white/5 disabled:opacity-40 cursor-pointer"
            title="Exporter le rapport d'audit génomique"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Exporter</span>
          </button>

          <button
            onClick={handleRunAudit}
            disabled={isLoading}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            <span>{isLoading ? "Audit en cours..." : "Relancer l'Audit"}</span>
          </button>

          {report && (
            <button
              onClick={handleApplyRecommended}
              disabled={isLoading || isApplied}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              {isApplied ? (
                <>
                  <Check size={14} className="text-white" />
                  <span>Poids Appliqués !</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>Appliquer les Poids Idéaux</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* BARRE DE PROGRESSION LORS DU CHARGEMENT */}
      {isLoading && (
        <div className="bg-slate-900/60 p-6 rounded-2xl border border-white/5 space-y-3 animate-fade-in">
          <div className="flex justify-between items-center text-xs font-mono text-slate-400">
            <span className="flex items-center gap-2">
              <Activity size={14} className="text-emerald-400 animate-spin" />
              {progressStatus}
            </span>
            <span className="font-bold text-emerald-400">{progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 to-indigo-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* DASHBOARD SYNTHÈSE & KPIS */}
      {report && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1 : Harmonie Génomique */}
            <div className="p-5 bg-slate-900/70 rounded-2xl border border-white/5 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Indice d'Harmonie Génomique ($I_{`{HG}`}$)
                </span>
                <Dna size={16} className="text-emerald-400" />
              </div>
              <div className="my-2">
                <span className="text-3xl font-black font-mono text-white">
                  {report.genomicHarmonyIndex}%
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Concordance Poids Actuels vs Idéaux
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-700"
                  style={{ width: `${report.genomicHarmonyIndex}%` }}
                />
              </div>
            </div>

            {/* KPI 2 : Efficacité Historique Moyenne */}
            <div className="p-5 bg-slate-900/70 rounded-2xl border border-white/5 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Rendement Prédictif Global
                </span>
                <TrendingUp size={16} className="text-indigo-400" />
              </div>
              <div className="my-2">
                <span className="text-3xl font-black font-mono text-indigo-400">
                  {report.overallHistoricalEfficiency}
                  <span className="text-lg text-slate-500"> / 100</span>
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Score moyen pondéré des algorithmes
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, report.overallHistoricalEfficiency)}%` }}
                />
              </div>
            </div>

            {/* KPI 3 : Gènes Porteurs / Dominants */}
            <div className="p-5 bg-slate-900/70 rounded-2xl border border-white/5 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Gènes Porteurs Élite
                </span>
                <Award size={16} className="text-amber-400" />
              </div>
              <div className="my-2">
                <span className="text-3xl font-black font-mono text-amber-400">
                  {report.dominantGenes.length}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Top porteurs ({report.dominantGenes.map((g) => g.label).slice(0, 2).join(", ")}...)
                </span>
              </div>
              <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 size={12} />
                <span>Régime optimisé pour {drawName}</span>
              </div>
            </div>

            {/* KPI 4 : Désalignement Génomique */}
            <div className="p-5 bg-slate-900/70 rounded-2xl border border-white/5 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Opportunités d'Ajustement
                </span>
                <Sliders size={16} className="text-purple-400" />
              </div>
              <div className="my-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black font-mono text-emerald-400">
                    +{report.underweightedGenes.length}
                  </span>
                  <span className="text-xl font-bold font-mono text-rose-400">
                    -{report.overweightedGenes.length}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {report.underweightedGenes.length} sous-pondérés | {report.overweightedGenes.length} sur-pondérés
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                Échantillon : {report.evaluatedDrawsCount} tirages réels
              </div>
            </div>
          </div>

          {/* TOP 5 GÈNES PORTEURS POUR LE TIRAGE ACTIF */}
          <div className="space-y-4 bg-slate-900/60 p-6 md:p-8 rounded-3xl border border-white/5 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-white/5 pb-4">
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Flame size={18} className="text-amber-400" />
                  Top 5 des Gènes Algorithmiques Dominants pour {drawName}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Algorithmes ayant historiquement délivré le plus grand nombre d'impacts gagnants réels et le plus fort gain d'information.
                </p>
              </div>
              <span className="px-3 py-1 bg-amber-500/10 text-amber-400 text-[10px] font-black uppercase rounded-lg border border-amber-500/20">
                Haute Résonance
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2">
              {report.dominantGenes.map((gene, idx) => {
                const diffPct = (gene.recommendedWeight - gene.currentWeight) * 100;
                return (
                  <div
                    key={gene.key}
                    className="p-4 bg-slate-950/70 rounded-2xl border border-white/5 flex flex-col justify-between space-y-3 relative group hover:border-emerald-500/30 transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black flex items-center justify-center font-mono">
                          #{idx + 1}
                        </span>
                        <span className="text-[9px] font-mono text-slate-500 uppercase">
                          {gene.category.split(" ")[0]}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-black font-mono rounded">
                        Score {gene.resonanceScore}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-wider truncate" title={gene.label}>
                        {gene.label}
                      </h4>
                      <div className="flex items-baseline justify-between mt-1 text-[10px] font-mono">
                        <span className="text-slate-400">Poids Actuel :</span>
                        <span className="font-bold text-slate-200">
                          {(gene.currentWeight * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between text-[10px] font-mono">
                        <span className="text-slate-400">Poids Idéal :</span>
                        <span className="font-bold text-emerald-400">
                          {(gene.recommendedWeight * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/5 space-y-1.5">
                      <div className="flex justify-between text-[9px] font-mono text-slate-400">
                        <span>Capture Top 5 :</span>
                        <span className="text-slate-200 font-bold">
                          {(gene.historicalHitRateTop5 * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-[9px] font-mono text-slate-400">
                        <span>Attribution MRR :</span>
                        <span className="text-indigo-400 font-bold">
                          {gene.meanReciprocalRank.toFixed(3)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[9px] font-mono">
                        <span>Ajustement :</span>
                        <span
                          className={`font-black flex items-center gap-0.5 ${
                            diffPct > 0
                              ? "text-emerald-400"
                              : diffPct < 0
                              ? "text-rose-400"
                              : "text-slate-400"
                          }`}
                        >
                          {diffPct > 0 ? (
                            <ArrowUpRight size={10} />
                          ) : (
                            <ArrowDownRight size={10} />
                          )}
                          {diffPct >= 0 ? "+" : ""}
                          {diffPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TABLEAU COMPARATIF DÉTAILLÉ DES 22 GÈNES */}
          <div className="space-y-6 bg-slate-900/60 p-6 md:p-8 rounded-3xl border border-white/5 shadow-sm">
            {/* Header & Filtres */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-white/5 pb-4">
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <BarChart3 size={18} className="text-indigo-400" />
                  Cartographie Complète des 22 Gènes Algorithmiques
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Comparatif dynamique des poids actifs vs poids optimaux calculés par décomposition Softmax sur les tirages réels.
                </p>
              </div>

              {/* Filtres & Recherche */}
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-slate-300 focus:outline-none"
                >
                  <option value="ALL">Toutes les Catégories</option>
                  <option value="Fréquence & Markov">Fréquence & Markov</option>
                  <option value="Physique & Signal">Physique & Signal</option>
                  <option value="Topologie & Réseau">Topologie & Réseau</option>
                  <option value="Inférence Probabiliste">Inférence Probabiliste</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e: any) => setFilterStatus(e.target.value)}
                  className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-slate-300 focus:outline-none"
                >
                  <option value="ALL">Tous les Statuts</option>
                  <option value="underweighted">Sous-Pondérés (À Booster)</option>
                  <option value="overweighted">Sur-Pondérés (À Réduire)</option>
                  <option value="optimal">Calibrés / Optimaux</option>
                </select>

                <input
                  type="text"
                  placeholder="Rechercher un gène..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none w-full sm:w-44"
                />
              </div>
            </div>

            {/* Grille des Gènes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredGenes.map((gene) => {
                const diffPct = (gene.recommendedWeight - gene.currentWeight) * 100;
                return (
                  <div
                    key={gene.key}
                    className="p-4 bg-slate-950/60 rounded-2xl border border-white/5 space-y-3 hover:border-indigo-500/30 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-black text-white uppercase tracking-wider">
                            {gene.label}
                          </h4>
                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                              gene.status === "underweighted"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : gene.status === "overweighted"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {gene.status === "underweighted"
                              ? "Sous-Pondéré"
                              : gene.status === "overweighted"
                              ? "Sur-Pondéré"
                              : "Équilibré"}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {gene.category}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-mono font-black text-indigo-400">
                          Score {gene.resonanceScore}
                        </span>
                        <span className="block text-[9px] font-mono text-slate-500">
                          MRR: {gene.meanReciprocalRank.toFixed(3)}
                        </span>
                      </div>
                    </div>

                    {/* Comparaison Visuelle Double Barre */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                          Actuel : {(gene.currentWeight * 100).toFixed(1)}%
                        </span>
                        <span className="text-emerald-400 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                          Recommandé : {(gene.recommendedWeight * 100).toFixed(1)}%
                        </span>
                      </div>

                      <div className="relative h-3 bg-slate-900 rounded-full overflow-hidden">
                        {/* Barre Actuelle */}
                        <div
                          className="absolute top-0 left-0 h-full bg-slate-600/80 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, gene.currentWeight * 400)}%` }}
                        />
                        {/* Barre Idéale */}
                        <div
                          className="absolute top-0 left-0 h-full bg-emerald-500/60 rounded-full border-r-2 border-emerald-300 transition-all duration-500"
                          style={{ width: `${Math.min(100, gene.recommendedWeight * 400)}%` }}
                        />
                      </div>
                    </div>

                    {/* Métriques Statistiques Détaillées */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-[9px] font-mono text-slate-400">
                      <div>
                        <span className="block text-slate-500">Hit Rate Top 5</span>
                        <span className="font-bold text-slate-200">
                          {(gene.historicalHitRateTop5 * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="block text-slate-500">Gain Info (r)</span>
                        <span className="font-bold text-slate-200">
                          {gene.informationEfficiency >= 0 ? "+" : ""}
                          {gene.informationEfficiency.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block text-slate-500">Écart Recommandé</span>
                        <span
                          className={`font-black ${
                            diffPct > 0
                              ? "text-emerald-400"
                              : diffPct < 0
                              ? "text-rose-400"
                              : "text-slate-400"
                          }`}
                        >
                          {diffPct >= 0 ? "+" : ""}
                          {diffPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PERFORMANCES PAR FAMILLES / CLUSTERS ALGORITHMIQUES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(report.categoryPerformance).map(([catKey, cat]) => (
              <div
                key={catKey}
                className="p-5 bg-slate-900/60 rounded-2xl border border-white/5 space-y-3"
              >
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate block">
                  {cat.label}
                </span>
                <div className="flex justify-between items-baseline">
                  <span className="text-2xl font-black font-mono text-white">
                    {cat.meanEfficiency}
                    <span className="text-xs text-slate-500"> / 100</span>
                  </span>
                  <span className="text-xs font-mono text-emerald-400 font-bold">
                    {(cat.weightShare * 100).toFixed(1)}% du total
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full"
                    style={{ width: `${Math.min(100, cat.meanEfficiency)}%` }}
                  />
                </div>
                <span className="text-[9px] text-slate-500 font-mono block">
                  {cat.geneCount} algorithmes dans cette famille
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
