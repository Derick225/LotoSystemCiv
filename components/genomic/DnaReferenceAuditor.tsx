import React, { useState, useEffect, useCallback } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import {
  Dna,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Cpu,
  Layers,
  ArrowRightLeft,
  Search,
  Fingerprint,
  Zap,
  Flame,
} from "lucide-react";
import {
  runSystematicDnaAudit,
  synchronizeAlgorithmsToDnaReference,
  DnaAuditReport,
  AlgorithmDnaAuditItem,
} from "../../services/prediction/dnaAuditService";
import { audioEngine } from "../../utils/audioEngine";
import { useToast } from "../ui/Toast";

export const DnaReferenceAuditor: React.FC<{
  drawName: string;
  className?: string;
}> = ({ drawName, className = "" }) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const setGlobalWeights = useNexusStore((state) => state.setGlobalWeights);
  const addAgentLog = useNexusStore((state) => state.addAgentLog);
  const navigateToModule = useNexusStore((state) => state.navigateToModule);

  const [report, setReport] = useState<DnaAuditReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const executeAudit = useCallback(async () => {
    try {
      setLoading(true);
      const auditResult = await runSystematicDnaAudit(
        drawName,
        history,
        globalWeights
      );
      setReport(auditResult);
    } catch (err: any) {
      console.error("[DNA AUDIT ERROR]", err);
      showToast(
        `Erreur lors de l'audit ADN : ${err.message || "Erreur inconnue"}`,
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [drawName, history, globalWeights, showToast]);

  useEffect(() => {
    executeAudit();
  }, [executeAudit]);

  const handleSynchronizeAll = async () => {
    try {
      setSyncing(true);
      try {
        audioEngine.play("scan");
      } catch (e) {}

      const syncResult = await synchronizeAlgorithmsToDnaReference(
        drawName,
        history,
        globalWeights
      );

      setGlobalWeights(syncResult.synchronizedWeights);
      setReport(syncResult.report);

      addAgentLog({
        id: `dna_sync_${Date.now()}`,
        timestamp: new Date(),
        action: `Synchronisation complète de l'ADN de référence (${drawName}) sur 23 algorithmes.`,
        type: "AUTOTUNE",
        impact: `Cohérence portée à ${syncResult.report.coherenceScore}%.`,
      });

      try {
        audioEngine.play("success");
      } catch (e) {}

      showToast(
        `ADN de référence synchronisé avec succès pour tous les algorithmes (${drawName}).`,
        "success"
      );
    } catch (err: any) {
      showToast(
        `Échec de synchronisation : ${err.message || "Erreur"}`,
        "error"
      );
    } finally {
      setSyncing(false);
    }
  };

  const filteredAlgorithms = (report?.algorithmAuditList || []).filter(
    (algo: AlgorithmDnaAuditItem) => {
      const matchesSearch =
        algo.label.toLowerCase().includes(searchFilter.toLowerCase()) ||
        algo.key.toLowerCase().includes(searchFilter.toLowerCase()) ||
        algo.mathematicalBasis
          .toLowerCase()
          .includes(searchFilter.toLowerCase());

      const matchesCategory =
        categoryFilter === "ALL" ||
        (categoryFilter === "DRIFTED" && !algo.isAligned) ||
        (categoryFilter === "ALIGNED" && algo.isAligned) ||
        algo.category.toUpperCase() === categoryFilter.toUpperCase();

      return matchesSearch && matchesCategory;
    }
  );

  return (
    <div
      id="dna-reference-auditor"
      className={`space-y-6 md:space-y-8 animate-fade-in ${className}`}
    >
      {/* Panneau Principal de Statut et d'Alignement Global */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        {/* Glow FX d'arrière-plan */}
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              <span className="px-3 py-1 bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5">
                <Dna size={12} className="animate-spin-slow" />
                Audit ADN Référence
              </span>
              <span className="px-3 py-1 bg-white/5 border border-white/10 text-slate-300 text-[10px] font-mono uppercase tracking-widest rounded-full">
                {drawName}
              </span>
              {report?.isFullySynchronized ? (
                <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5">
                  <CheckCircle2 size={12} />
                  100% Alignement ADN
                </span>
              ) : (
                <span className="px-3 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5 animate-pulse">
                  <AlertTriangle size={12} />
                  {report?.driftedAlgorithmsCount} Dérive(s) Détectée(s)
                </span>
              )}
            </div>

            <h3 className="text-xl md:text-3xl font-black text-white uppercase tracking-tight">
              Audit & Synchronisation de l'ADN Algorithmique
            </h3>

            <p className="text-xs md:text-sm text-slate-400 leading-relaxed">
              Vérifie en continu que tous les algorithmes de prédiction du
              moteur opèrent sur la même matrice d'ADN comportemental,
              les mêmes bornes de Hurst/Entropie et la distribution canonique
              normalisée pour le tirage actif.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <button
              id="view-drift-heatmap-from-auditor-btn"
              onClick={() => navigateToModule("Genomique", "DRIFT_HEATMAP")}
              className="px-4 py-3.5 bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 border border-rose-500/40 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
              title="Ouvrir la Heatmap des Corrélations Écarts & Sous-Algorithmes"
            >
              <Flame size={14} className="text-rose-400" />
              Heatmap Écarts
            </button>

            <button
              id="refresh-dna-audit-btn"
              onClick={executeAudit}
              disabled={loading || syncing}
              className="px-4 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={loading ? "animate-spin text-indigo-400" : ""}
              />
              Réauditer
            </button>

            <button
              id="sync-all-dna-btn"
              onClick={handleSynchronizeAll}
              disabled={syncing || loading}
              className={`px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 shadow-xl transition-all active:scale-95 text-white ${
                report?.isFullySynchronized
                  ? "bg-slate-800 hover:bg-slate-750 border border-emerald-500/30 text-emerald-300"
                  : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-600/30 ring-2 ring-indigo-400/30"
              }`}
            >
              <ArrowRightLeft
                size={16}
                className={syncing ? "animate-spin text-white" : ""}
              />
              {syncing
                ? "Synchronisation..."
                : report?.isFullySynchronized
                  ? "Resynchroniser l'ADN"
                  : "Synchroniser les Algorithmes"}
            </button>
          </div>
        </div>

        {/* Métriques d'empreinte & Signature statistique */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 md:gap-4 mt-6 pt-6 border-t border-white/5">
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5">
              <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5">
                <Fingerprint size={12} className="text-indigo-400" />
                Empreinte ADN
              </div>
              <div className="text-xs md:text-sm font-mono font-bold text-indigo-300 mt-1 truncate">
                {report.referenceDnaFingerprint}
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5">
              <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-emerald-400" />
                Cohérence Globale
              </div>
              <div className="text-sm md:text-lg font-black text-emerald-400 mt-0.5">
                {report.coherenceScore}%
                <span className="text-[10px] text-slate-400 font-normal ml-1">
                  ({report.alignedAlgorithmsCount}/{report.totalAlgorithmsCount})
                </span>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5">
              <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5">
                <AlertTriangle size={12} className="text-rose-400" />
                Seuil Critique (τ)
              </div>
              <div className="text-xs md:text-sm font-mono font-bold text-rose-300 mt-1">
                {(report.criticalDriftThreshold * 100).toFixed(1)}%{" "}
                <span className="text-[10px] text-slate-400 font-normal">
                  (Δmax: {(report.maxWeightDriftDelta * 100).toFixed(1)}%)
                </span>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5">
              <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5">
                <Cpu size={12} className="text-purple-400" />
                Hurst / Mémoire
              </div>
              <div className="text-xs md:text-sm font-mono font-bold text-slate-200 mt-1">
                H = {report.statisticalSignature.hurstExponent}{" "}
                <span className="text-[10px] text-slate-400 font-normal">
                  ({report.statisticalSignature.hurstExponent > 0.5 ? "Persistant" : "Mean-Revert"})
                </span>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5">
              <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5">
                <Layers size={12} className="text-cyan-400" />
                Entropie Shannon
              </div>
              <div className="text-xs md:text-sm font-mono font-bold text-cyan-300 mt-1">
                {report.statisticalSignature.shannonEntropy} bits
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Barre de Filtrage & Recherche des Algorithmes */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-900/60 p-4 rounded-2xl border border-white/5 backdrop-blur-md">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            id="dna-search-input"
            type="text"
            placeholder="Filtrer par nom d'algorithme, clé ou fondement mathématique..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-950/60 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "ALL", label: "Tous" },
            { id: "DRIFTED", label: "En Dérive" },
            { id: "ALIGNED", label: "Alignés" },
            { id: "CORE", label: "Core" },
            { id: "ADVANCED", label: "Avancés" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                categoryFilter === cat.id
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grille des Algorithmes et de leur Alignement ADN */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAlgorithms.map((algo) => (
          <div
            key={algo.key}
            className={`p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
              algo.isAligned
                ? "bg-slate-900/60 border-white/5 hover:border-indigo-500/30"
                : "bg-amber-950/20 border-amber-500/30 shadow-lg shadow-amber-500/5"
            }`}
          >
            <div className="space-y-3">
              {/* Header de la carte d'algorithme */}
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-slate-500">
                    {algo.category} • {algo.key}
                  </div>
                  <h4 className="text-sm font-black text-white mt-0.5">
                    {algo.label}
                  </h4>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${
                    algo.isAligned
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse"
                  }`}
                >
                  {algo.isAligned ? (
                    <>
                      <CheckCircle2 size={10} />
                      Aligné
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={10} />
                      Dérive
                    </>
                  )}
                </span>
              </div>

              {/* Fondement Mathématique & Checksum ADN */}
              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-white/5 space-y-1.5 text-[11px]">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Signature ADN :</span>
                  <span className="font-mono text-indigo-300 font-bold">
                    {algo.dnaSignature}
                  </span>
                </div>
                <div className="text-slate-400 leading-tight text-[10px]">
                  <span className="text-slate-500">Fondement :</span>{" "}
                  {algo.mathematicalBasis}
                </div>
              </div>

              {/* Comparaison des Poids & Dérive */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 text-[10px] uppercase font-bold">
                    Poids Actif / Canonique
                  </span>
                  <span className="font-mono font-bold text-slate-200">
                    {(algo.activeWeight * 100).toFixed(1)}% /{" "}
                    <span className="text-indigo-400">
                      {(algo.canonicalWeight * 100).toFixed(1)}%
                    </span>
                  </span>
                </div>

                {/* Progress bar de l'écart */}
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                  <div
                    className={`h-full transition-all ${
                      algo.isAligned ? "bg-indigo-500" : "bg-amber-400"
                    }`}
                    style={{
                      width: `${Math.min(100, algo.canonicalWeight * 100 * 3)}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Pied de carte : Résonance & Statut */}
            <div className="pt-4 mt-3 border-t border-white/5 flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1 text-slate-400">
                <Zap size={11} className="text-amber-400" />
                <span>Résonance : </span>
                <span className="font-bold text-slate-200">
                  {algo.spectralResonance}
                </span>
              </div>

              <div className="text-slate-400 font-mono text-[9px]">
                {algo.isDeterministic ? "Déterministe" : "Non-Déterministe"}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredAlgorithms.length === 0 && (
        <div className="text-center py-16 bg-slate-900/40 rounded-3xl border border-white/5">
          <Dna size={32} className="mx-auto text-slate-600 mb-3" />
          <p className="text-sm font-bold text-slate-400">
            Aucun algorithme ne correspond aux critères de filtre.
          </p>
        </div>
      )}
    </div>
  );
};
