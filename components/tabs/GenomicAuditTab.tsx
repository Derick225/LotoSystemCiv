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
  PieChart,
  Search,
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
import { normalizeWeights } from "../../services/predictionEngine";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

type InoculationProfile = "FULL_RECOMMENDED" | "TOP_5_ELITE" | "ANTI_OVERFITTING" | "MAX_STABILITY";

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
  const [selectedProfile, setSelectedProfile] = useState<InoculationProfile>("FULL_RECOMMENDED");

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

  // Application des profils d'inoculation génomique
  const handleApplyProfile = (profile: InoculationProfile) => {
    if (!report?.allGenes) return;
    audioEngine.play("click");
    setSelectedProfile(profile);

    let candidateWeights: Record<string, number> = {};

    switch (profile) {
      case "TOP_5_ELITE": {
        const top5 = report.dominantGenes.slice(0, 5);
        top5.forEach((g) => {
          candidateWeights[g.key] = Math.max(0.01, g.resonanceScore);
        });
        break;
      }
      case "ANTI_OVERFITTING": {
        // Uniformise légèrement en réduisant l'écart-type des poids
        const meanWeight = 1.0 / report.allGenes.length;
        report.allGenes.forEach((g) => {
          candidateWeights[g.key] = (g.recommendedWeight * 0.6) + (meanWeight * 0.4);
        });
        break;
      }
      case "MAX_STABILITY": {
        // Pondération accentuée par la consistance temporelle (MRR)
        report.allGenes.forEach((g) => {
          candidateWeights[g.key] = g.recommendedWeight * (1 + g.meanReciprocalRank);
        });
        break;
      }
      case "FULL_RECOMMENDED":
      default: {
        candidateWeights = { ...report.recommendedWeights };
        break;
      }
    }

    const normalized = normalizeWeights(candidateWeights as AlgoWeights);
    setGlobalWeights(normalized);
    setIsApplied(true);
    audioEngine.play("success");
    showToast(
      `Profil génomique [${profile}] inoculé avec succès au moteur de ${drawName} !`,
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

  // Chart data: Top 10 Genes recommended vs current
  const chartData = useMemo(() => {
    if (!report) return [];
    return report.dominantGenes.slice(0, 10).map((g) => ({
      name: g.label.length > 14 ? g.label.slice(0, 12) + "..." : g.label,
      Actuel: Number((g.currentWeight * 100).toFixed(1)),
      Idéal: Number((g.recommendedWeight * 100).toFixed(1)),
      Score: g.resonanceScore,
    }));
  }, [report]);

  return (
    <div className="w-full space-y-8 pb-16 animate-fade-in font-sans">
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/80 p-6 md:p-8 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
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
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl flex items-center gap-2 transition-colors border border-slate-700 disabled:opacity-40 cursor-pointer"
            title="Exporter le rapport d'audit génomique"
          >
            <Download size={14} />
            <span>Export JSON</span>
          </button>

          <button
            onClick={handleRunAudit}
            disabled={isLoading}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            <span>{isLoading ? "Audit en cours..." : "Relancer l'Audit"}</span>
          </button>
        </div>
      </div>

      {/* CHARGEMENT / PROGRESSION */}
      {isLoading && (
        <div className="bg-slate-900/90 p-8 rounded-3xl border border-slate-800 shadow-xl space-y-4 text-center">
          <div className="flex items-center justify-center gap-3 text-emerald-400">
            <Cpu size={24} className="animate-spin" />
            <h3 className="text-sm font-black uppercase tracking-wider">
              Analyse Rétrospective & Calcul des Gradients Génomiques
            </h3>
          </div>
          <p className="text-xs text-slate-400 font-mono">{progressStatus}</p>
          <div className="w-full max-w-md mx-auto h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* RAPPORT PRINCIPAL */}
      {report && !isLoading && (
        <div className="space-y-8 animate-fade-in">
          {/* KPI CARDS 4 BLOCKS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1 : Index d'Harmonie */}
            <div className="p-5 bg-slate-900/70 rounded-2xl border border-slate-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Index d'Harmonie ADN
                </span>
                <Sparkles size={16} className="text-amber-400" />
              </div>
              <div className="my-2">
                <div className="text-3xl font-black font-mono text-white">
                  {report.genomicHarmonyIndex.toFixed(1)}
                  <span className="text-sm text-slate-500 font-normal"> / 100</span>
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Concordance globale des 22 gènes
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-amber-400 h-full rounded-full"
                  style={{ width: `${report.genomicHarmonyIndex}%` }}
                />
              </div>
            </div>

            {/* KPI 2 : Efficacité Historique Globale */}
            <div className="p-5 bg-slate-900/70 rounded-2xl border border-slate-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Efficacité Historique Globale
                </span>
                <ShieldCheck size={16} className="text-emerald-400" />
              </div>
              <div className="my-2">
                <div className="text-3xl font-black font-mono text-emerald-400">
                  {report.overallHistoricalEfficiency.toFixed(1)}%
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Taux de corrélation et capture
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                Échantillon : {report.evaluatedDrawsCount} tirages
              </div>
            </div>

            {/* KPI 3 : Gènes Porteurs Dominants */}
            <div className="p-5 bg-slate-900/70 rounded-2xl border border-slate-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Gènes Porteurs Élite
                </span>
                <Award size={16} className="text-indigo-400" />
              </div>
              <div className="my-2">
                <span className="text-3xl font-black font-mono text-indigo-400">
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

            {/* KPI 4 : Opportunités d'Ajustement */}
            <div className="p-5 bg-slate-900/70 rounded-2xl border border-slate-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
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

          {/* INOCULATION GÉNOMIQUE SÉLECTIVE & CHART COMPARATIF */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Colonne Gauche : Sélecteur d'Inoculation (4 cols) */}
            <div className="lg:col-span-5 bg-slate-900/80 p-6 md:p-8 rounded-3xl border border-slate-800 space-y-6 shadow-xl flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="p-2.5 bg-emerald-600/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                    <Zap size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-white">
                      Inoculation Génomique
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      Injecter un profil d'ADN calibré dans le moteur actif
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {[
                    { id: "FULL_RECOMMENDED", label: "Idéal Complet (Softmax Global)", desc: "Ajuste les 22 algorithmes selon leur rendement réel" },
                    { id: "TOP_5_ELITE", label: "Top 5 Élite (Pure Concentration)", desc: "Focalise 100% du poids sur les 5 meilleurs gènes" },
                    { id: "ANTI_OVERFITTING", label: "Anti-Surapprentissage (L2 Damp)", desc: "Atténue les poids extrêmes pour maximiser la robustesse" },
                    { id: "MAX_STABILITY", label: "Haute Résilience (MRR Pondéré)", desc: "Favorise les algorithmes à concordance temporelle constante" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleApplyProfile(p.id as InoculationProfile)}
                      className={`w-full p-3.5 rounded-2xl text-left border transition-all flex flex-col gap-0.5 cursor-pointer ${
                        selectedProfile === p.id && isApplied
                          ? "bg-emerald-600/20 border-emerald-500 text-white shadow-lg"
                          : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black uppercase tracking-wider">{p.label}</span>
                        <Check size={14} className={isApplied && selectedProfile === p.id ? "text-emerald-400" : "opacity-0"} />
                      </div>
                      <span className="text-[10px] text-slate-400">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 text-[10px] font-mono text-slate-500">
                Isolation stricte : les modifications s'appliquent exclusivement à <strong className="text-slate-300">{drawName}</strong>.
              </div>
            </div>

            {/* Colonne Droite : Graphique Comparatif Actuel vs Idéal (7 cols) */}
            <div className="lg:col-span-7 bg-slate-900/80 p-6 md:p-8 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <BarChart3 size={16} className="text-indigo-400" />
                  Top 10 Gènes : Poids Actuel vs Idéal Recommandé (%)
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Concordance différentielle calculée sur les tirages réels
                </p>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" opacity={0.5} />
                    <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 9 }} angle={-25} textAnchor="end" />
                    <YAxis tick={{ fill: "#64748b", fontSize: 9 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        borderRadius: "12px",
                        fontSize: "10px",
                      }}
                    />
                    <Bar dataKey="Actuel" fill="#64748b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Idéal" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* TABLEAU COMPARATIF COMPLET DES 22 GÈNES */}
          <div className="space-y-6 bg-slate-900/60 p-6 md:p-8 rounded-3xl border border-slate-800 shadow-xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers size={16} className="text-indigo-400" />
                  Cartographie Exhaustive des 22 Gènes
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Analyse détaillée du Mean Reciprocal Rank (MRR) et de l'Information Coefficient
                </p>
              </div>

              {/* Barre de Recherche */}
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher un gène..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Tableau des Gènes */}
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="pb-3 px-3">Gène Algorithmique</th>
                    <th className="pb-3 px-3">Catégorie</th>
                    <th className="pb-3 px-3">Poids Actuel</th>
                    <th className="pb-3 px-3">Poids Idéal</th>
                    <th className="pb-3 px-3">Attribution MRR</th>
                    <th className="pb-3 px-3">Capture Top-5</th>
                    <th className="pb-3 px-3 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredGenes.map((gene) => {
                    const diffPct = (gene.recommendedWeight - gene.currentWeight) * 100;
                    return (
                      <tr key={gene.key} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3 font-bold text-slate-200 font-sans">{gene.label}</td>
                        <td className="py-3 px-3 text-slate-400 text-[10px] font-sans">{gene.category}</td>
                        <td className="py-3 px-3 text-slate-400">{(gene.currentWeight * 100).toFixed(1)}%</td>
                        <td className="py-3 px-3 text-emerald-400 font-bold">{(gene.recommendedWeight * 100).toFixed(1)}%</td>
                        <td className="py-3 px-3 text-indigo-400">{gene.meanReciprocalRank.toFixed(3)}</td>
                        <td className="py-3 px-3 text-slate-300">{(gene.historicalHitRateTop5 * 100).toFixed(1)}%</td>
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              gene.status === "underweighted"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : gene.status === "overweighted"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {gene.status === "underweighted" ? "Sous-pondéré" : gene.status === "overweighted" ? "Sur-pondéré" : "Optimal"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
