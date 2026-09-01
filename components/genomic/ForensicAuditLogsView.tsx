import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { useForensicData } from "../../hooks/useForensicData";
import {
  runSystematicDnaAudit,
  synchronizeAlgorithmsToDnaReference,
  DnaAuditReport,
  AlgorithmDnaAuditItem,
} from "../../services/prediction/dnaAuditService";
import { ForensicReport, ForensicEvidence, ScoreDivergence, CounterfactualResult } from "../../types";
import { formatDateSafely } from "../../utils/dateUtils";
import { audioEngine } from "../../utils/audioEngine";
import { logger } from "../../utils/logger";
import { useToast } from "../ui/Toast";
import {
  FileText,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Sliders,
  ArrowRightLeft,
  Search,
  Filter,
  RefreshCw,
  Zap,
  TrendingDown,
  Layers,
  ChevronDown,
  ChevronUp,
  Fingerprint,
  Scale,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Activity,
  Cpu,
  Hash,
} from "lucide-react";
import { LABELS_MAP } from "../../hooks/useAlgorithmSync";

interface ForensicAuditLogsViewProps {
  drawName: string;
  className?: string;
}

export const ForensicAuditLogsView: React.FC<ForensicAuditLogsViewProps> = ({
  drawName,
  className = "",
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const setGlobalWeights = useNexusStore((state) => state.setGlobalWeights);
  const addAgentLog = useNexusStore((state) => state.addAgentLog);

  // Hook des données médico-légales réelles
  const {
    reports,
    loading: forensicLoading,
    refreshLocal,
    deleteReport,
  } = useForensicData(drawName);

  // État de l'audit ADN et de la synchronisation des poids
  const [dnaAudit, setDnaAudit] = useState<DnaAuditReport | null>(null);
  const [auditLoading, setAuditLoading] = useState<boolean>(true);
  const [isSyncingWeights, setIsSyncingWeights] = useState<boolean>(false);

  // Filtres et Recherche
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedFilter, setSelectedFilter] = useState<
    "ALL" | "ANOMALY_ONLY" | "EXACT_HITS" | "NEAR_MISSES" | "HIGH_DIVERGENCE"
  >("ALL");

  // Élément étendu pour analyse approfondie
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  // Exécution de l'audit ADN synchronisé
  const loadDnaAudit = useCallback(async () => {
    try {
      setAuditLoading(true);
      const audit = await runSystematicDnaAudit(drawName, history, globalWeights);
      setDnaAudit(audit);
    } catch (e: any) {
      console.error("[FORENSIC LOGS DNA AUDIT ERROR]", e);
    } finally {
      setAuditLoading(false);
    }
  }, [drawName, history, globalWeights]);

  useEffect(() => {
    loadDnaAudit();
  }, [loadDnaAudit]);

  // Synchronisation 1-Click depuis la vue Forensic Logs
  const handleQuickSync = async () => {
    try {
      setIsSyncingWeights(true);
      try {
        audioEngine.play("scan");
      } catch (err) {
        logger.debug({ err }, "Audio error non-bloquant");
      }

      const syncResult = await synchronizeAlgorithmsToDnaReference(
        drawName,
        history,
        globalWeights
      );

      setGlobalWeights(syncResult.synchronizedWeights);
      setDnaAudit(syncResult.report);

      addAgentLog({
        id: `dna_sync_forensic_${Date.now()}`,
        timestamp: new Date(),
        action: `Resynchronisation des poids initiée depuis les Forensic Logs (${drawName}).`,
        type: "AUTOTUNE",
        impact: `Alignement ADN rétabli à ${syncResult.report.coherenceScore}%.`,
      });

      try {
        audioEngine.play("success");
      } catch (err) {
        logger.debug({ err }, "Audio error non-bloquant");
      }

      showToast(
        `Tous les poids algorithmiques ont été resynchronisés sur l'ADN canonique.`,
        "success"
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur";
      showToast(
        `Erreur lors de la synchronisation : ${msg}`,
        "error"
      );
    } finally {
      setIsSyncingWeights(false);
    }
  };

  // Algorithmes avec anomalie de poids détectée
  const driftedAlgorithms = useMemo(() => {
    if (!dnaAudit) return [];
    return dnaAudit.algorithmAuditList.filter((a) => !a.isAligned);
  }, [dnaAudit]);

  // Mapping des anomalies de poids pour chaque rapport
  const enrichedReports = useMemo(() => {
    return reports.map((report) => {
      const matches = Array.isArray(report.matches) ? report.matches : [];
      const exactHits = matches.filter((m: ForensicEvidence) => m.errorType === "Hit");
      const nearMisses = matches.filter((m: ForensicEvidence) => m.errorType === "Voisin" || m.errorType === "Miroir" || m.errorType === "Shadow");
      const missedOpportunities = Array.isArray(report.missedOpportunities) ? report.missedOpportunities : [];
      const divergences = Array.isArray(report.scoreDivergence) ? report.scoreDivergence : [];

      // Détection des anomalies algorithmiques croisées avec l'audit ADN
      const affectedAlgorithms: {
        key: string;
        label: string;
        deltaWeight: number;
        reason: string;
        isDrifted: boolean;
      }[] = [];

      divergences.forEach((div: ScoreDivergence) => {
        const driftItem = driftedAlgorithms.find(
          (d) => d.key === div.algo || d.label.toLowerCase() === div.algo.toLowerCase()
        );
        if (driftItem) {
          affectedAlgorithms.push({
            key: driftItem.key,
            label: driftItem.label,
            deltaWeight: driftItem.weightDriftDelta,
            reason: `Poids décalé de ${(driftItem.weightDriftDelta * 100).toFixed(1)}% par rapport à l'ADN canonique.`,
            isDrifted: true,
          });
        }
      });

      // Si aucune divergence explicite n'a été liée, mais que le système a des algorithmes décalés
      if (affectedAlgorithms.length === 0 && driftedAlgorithms.length > 0 && exactHits.length < 3) {
        driftedAlgorithms.slice(0, 3).forEach((d) => {
          affectedAlgorithms.push({
            key: d.key,
            label: d.label,
            deltaWeight: d.weightDriftDelta,
            reason: `Dérive d'apprentissage active lors de ce tirage (Δ = ${(d.weightDriftDelta * 100).toFixed(1)}%).`,
            isDrifted: true,
          });
        });
      }

      const hasWeightAnomaly = affectedAlgorithms.length > 0;
      const divergencePct = report.divergenceMetric ?? Math.round(100 - (exactHits.length / 5) * 100);

      return {
        ...report,
        exactHits,
        nearMisses,
        missedOpportunities,
        affectedAlgorithms,
        hasWeightAnomaly,
        divergencePct,
      };
    });
  }, [reports, driftedAlgorithms]);

  // Filtrage des rapports
  const filteredReports = useMemo(() => {
    return enrichedReports.filter((rep) => {
      const matchSearch =
        !searchQuery ||
        rep.date?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rep.drawName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rep.matches?.some(
          (m: any) =>
            m.predicted?.toString() === searchQuery ||
            m.actual?.toString() === searchQuery
        ) ||
        rep.affectedAlgorithms?.some((a) =>
          a.label.toLowerCase().includes(searchQuery.toLowerCase())
        );

      if (!matchSearch) return false;

      if (selectedFilter === "ANOMALY_ONLY") {
        return rep.hasWeightAnomaly;
      }
      if (selectedFilter === "EXACT_HITS") {
        return rep.exactHits.length > 0;
      }
      if (selectedFilter === "NEAR_MISSES") {
        return rep.nearMisses.length > 0;
      }
      if (selectedFilter === "HIGH_DIVERGENCE") {
        return (rep.divergencePct || 0) >= 60;
      }
      return true;
    });
  }, [enrichedReports, searchQuery, selectedFilter]);

  // Statistiques Globales des Logs Médico-Légaux
  const globalStats = useMemo(() => {
    const total = enrichedReports.length;
    if (total === 0) {
      return {
        totalReports: 0,
        totalHits: 0,
        totalNearMisses: 0,
        anomaliesCount: 0,
        avgRmse: 0,
        avgWasserstein: 0,
      };
    }

    let hits = 0;
    let near = 0;
    let anomalies = 0;
    let sumRmse = 0;
    let sumWasserstein = 0;

    enrichedReports.forEach((r) => {
      hits += r.exactHits.length;
      near += r.nearMisses.length;
      if (r.hasWeightAnomaly) anomalies++;
      sumRmse += r.rmse || 0;
      sumWasserstein += r.wassersteinLoss || 0;
    });

    return {
      totalReports: total,
      totalHits: hits,
      totalNearMisses: near,
      anomaliesCount: anomalies,
      avgRmse: parseFloat((sumRmse / total).toFixed(2)),
      avgWasserstein: parseFloat((sumWasserstein / total).toFixed(2)),
    };
  }, [enrichedReports]);

  return (
    <div
      id="forensic-audit-logs-view"
      className={`space-y-6 md:space-y-8 animate-fade-in ${className}`}
    >
      {/* En-tête avec Résumé des Anomalies de Poids et Synchronisation */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              <span className="px-3 py-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5">
                <FileText size={12} />
                Forensic Logs & Écarts
              </span>
              <span className="px-3 py-1 bg-white/5 border border-white/10 text-slate-300 text-[10px] font-mono uppercase tracking-widest rounded-full">
                {drawName}
              </span>

              {driftedAlgorithms.length > 0 ? (
                <span className="px-3 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5 animate-pulse">
                  <AlertTriangle size={12} />
                  {driftedAlgorithms.length} Anomalie(s) de Poids Active(s)
                </span>
              ) : (
                <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5">
                  <CheckCircle2 size={12} />
                  Poids Canoniques Synchronisés
                </span>
              )}
            </div>

            <h3 className="text-xl md:text-3xl font-black text-white uppercase tracking-tight">
              Écarts Médico-Légaux & Dérives de Poids
            </h3>

            <p className="text-xs md:text-sm text-slate-400 leading-relaxed">
              Trace les écarts topologiques entre les prédictions historiques et les
              combinaisons gagnantes réelles. Met en exergue l'impact des anomalies de
              poids algorithmiques et permet leur réalignement immédiat.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <button
              id="refresh-forensic-logs-btn"
              onClick={() => {
                refreshLocal();
                loadDnaAudit();
              }}
              disabled={forensicLoading || auditLoading}
              className="px-4 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={forensicLoading || auditLoading ? "animate-spin text-indigo-400" : ""}
              />
              Actualiser
            </button>

            {driftedAlgorithms.length > 0 && (
              <button
                id="quick-sync-weights-btn"
                onClick={handleQuickSync}
                disabled={isSyncingWeights}
                className="px-6 py-3.5 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 shadow-xl shadow-rose-600/20 ring-2 ring-rose-400/30 transition-all active:scale-95 disabled:opacity-50"
              >
                <ArrowRightLeft
                  size={16}
                  className={isSyncingWeights ? "animate-spin" : ""}
                />
                {isSyncingWeights ? "Resynchronisation..." : "Corriger les Poids"}
              </button>
            )}
          </div>
        </div>

        {/* Métriques d'Agrégation */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 mt-6 pt-6 border-t border-white/5">
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5">
            <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5">
              <FileText size={12} className="text-indigo-400" />
              Rapports Audités
            </div>
            <div className="text-sm md:text-lg font-mono font-black text-white mt-0.5">
              {globalStats.totalReports}
              <span className="text-[10px] text-slate-500 font-normal ml-1">tirages</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5">
            <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-amber-400" />
              Anomalies de Poids
            </div>
            <div className="text-sm md:text-lg font-mono font-black text-amber-300 mt-0.5">
              {globalStats.anomaliesCount}
              <span className="text-[10px] text-slate-500 font-normal ml-1">
                ({driftedAlgorithms.length} algos)
              </span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5">
            <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5">
              <Scale size={12} className="text-cyan-400" />
              RMSE Moyen
            </div>
            <div className="text-sm md:text-lg font-mono font-black text-cyan-300 mt-0.5">
              {globalStats.avgRmse}
            </div>
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5">
            <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5">
              <Activity size={12} className="text-emerald-400" />
              Impacts Précis
            </div>
            <div className="text-sm md:text-lg font-mono font-black text-emerald-400 mt-0.5">
              {globalStats.totalHits} Hits{" "}
              <span className="text-xs text-amber-400 font-bold">
                + {globalStats.totalNearMisses} Voisins
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Alerte si des Dérives de Poids Sont Détectées */}
      {driftedAlgorithms.length > 0 && (
        <div className="bg-amber-950/30 border border-amber-500/30 rounded-3xl p-5 md:p-6 shadow-xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl shrink-0 mt-0.5">
              <AlertOctagon size={20} />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-amber-300 uppercase tracking-wide">
                Décalage des Poids Algorithmiques Détecté
              </h4>
              <p className="text-xs text-amber-200/80 leading-relaxed">
                Les algorithmes suivants divergent de la signature canonique du tirage{" "}
                <span className="font-bold text-white">({drawName})</span> :{" "}
                {driftedAlgorithms.map((a) => a.label).join(", ")}. Cela peut fausser
                l'assignation des probabilités et créer des écarts avec les résultats réels.
              </p>
            </div>
          </div>

          <button
            onClick={handleQuickSync}
            disabled={isSyncingWeights}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shrink-0 transition-all shadow-md shadow-amber-600/30"
          >
            Resynchroniser ({driftedAlgorithms.length})
          </button>
        </div>
      )}

      {/* Barre de Recherche et Sélecteurs de Filtres */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-900/60 p-4 rounded-2xl border border-white/5 backdrop-blur-md">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            id="forensic-logs-search"
            type="text"
            placeholder="Rechercher par date, numéro, algorithme ou type d'anomalie..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-950/60 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "ALL", label: "Tous les Logs" },
            { id: "ANOMALY_ONLY", label: "Anomalies de Poids" },
            { id: "EXACT_HITS", label: "Avec Hits" },
            { id: "NEAR_MISSES", label: "Voisins & Miroirs" },
            { id: "HIGH_DIVERGENCE", label: "Forte Divergence" },
          ].map((filter) => (
            <button
              key={filter.id}
              onClick={() => setSelectedFilter(filter.id as any)}
              className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                selectedFilter === filter.id
                  ? "bg-rose-600 text-white shadow-md shadow-rose-600/20"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste des Entrées de Logs Médico-Légaux */}
      <div className="space-y-4">
        {filteredReports.map((report) => {
          const isExpanded = expandedReportId === report.id;
          const formattedDate = formatDateSafely(report.date);
          const combo = report.combo || [];
          const matches = Array.isArray(report.matches) ? report.matches : [];

          return (
            <div
              key={report.id}
              className={`bg-slate-900/70 border rounded-3xl p-5 md:p-6 transition-all duration-300 relative overflow-hidden ${
                report.hasWeightAnomaly
                  ? "border-amber-500/30 hover:border-amber-500/50 shadow-lg shadow-amber-500/5"
                  : "border-white/10 hover:border-indigo-500/30"
              }`}
            >
              {/* En-tête de la ligne de log */}
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 bg-white/5 border border-white/10 text-slate-300 text-[10px] font-mono rounded-lg">
                      {formattedDate}
                    </span>
                    <span className="text-xs font-black text-white uppercase tracking-tight">
                      {report.drawName}
                    </span>

                    {report.hasWeightAnomaly ? (
                      <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black uppercase tracking-widest rounded-full flex items-center gap-1">
                        <AlertTriangle size={10} />
                        Anomalie de Poids ({report.affectedAlgorithms.length})
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[9px] font-black uppercase tracking-widest rounded-full flex items-center gap-1">
                        <CheckCircle2 size={10} />
                        Poids Conformes
                      </span>
                    )}

                    {report.exactHits.length > 0 && (
                      <span className="px-2.5 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[9px] font-black uppercase tracking-widest rounded-full">
                        {report.exactHits.length} Hit(s) Exact(s)
                      </span>
                    )}
                  </div>

                  {/* Numéros Prédits vs Résultats Réels */}
                  <div className="flex items-center gap-4 flex-wrap pt-1 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 text-[10px] uppercase font-black">
                        Prédits :
                      </span>
                      <div className="flex items-center gap-1">
                        {matches.map((m: any, idx: number) => {
                          const isHit = m.errorType === "Hit";
                          const isNear = m.errorType === "Voisin" || m.errorType === "Miroir";
                          return (
                            <span
                              key={idx}
                              className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono font-bold text-[10px] ${
                                isHit
                                  ? "bg-emerald-500 text-slate-950 ring-2 ring-emerald-400 shadow-md shadow-emerald-500/30"
                                  : isNear
                                  ? "bg-amber-500/30 text-amber-300 border border-amber-500/50"
                                  : "bg-slate-800 text-slate-300 border border-white/10"
                              }`}
                            >
                              {m.predicted}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {combo.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 text-[10px] uppercase font-black">
                          Résultats Réels :
                        </span>
                        <div className="flex items-center gap-1">
                          {combo.map((num: number, idx: number) => {
                            const isMatched = matches.some((m: any) => m.predicted === num);
                            return (
                              <span
                                key={idx}
                                className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono font-bold text-[10px] ${
                                  isMatched
                                    ? "bg-indigo-600 text-white ring-1 ring-indigo-400"
                                    : "bg-slate-950 text-slate-400 border border-white/5"
                                }`}
                              >
                                {num}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Métriques d'écart & Bouton d'extension */}
                <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-end pt-2 lg:pt-0 border-t lg:border-t-0 border-white/5">
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <div className="text-[9px] uppercase font-mono tracking-widest text-slate-500">
                        Divergence
                      </div>
                      <div
                        className={`text-xs font-black font-mono ${
                          report.divergencePct >= 70
                            ? "text-rose-400"
                            : report.divergencePct >= 40
                            ? "text-amber-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {report.divergencePct}%
                      </div>
                    </div>

                    <div>
                      <div className="text-[9px] uppercase font-mono tracking-widest text-slate-500">
                        RMSE
                      </div>
                      <div className="text-xs font-bold font-mono text-cyan-300">
                        {report.rmse ?? "--"}
                      </div>
                    </div>

                    <div>
                      <div className="text-[9px] uppercase font-mono tracking-widest text-slate-500">
                        Wasserstein
                      </div>
                      <div className="text-xs font-bold font-mono text-purple-300">
                        {report.wassersteinLoss ?? "--"}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Section Dépliée : Analyse Approfondie & Anomalies de Poids */}
              {isExpanded && (
                <div className="mt-5 pt-5 border-t border-white/10 space-y-4 animate-fade-in text-xs">
                  {/* Mise en exergue des anomalies de calcul de poids */}
                  {report.hasWeightAnomaly && (
                    <div className="bg-amber-950/40 border border-amber-500/30 rounded-2xl p-4 space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 font-black uppercase text-[10px] tracking-wider">
                        <AlertTriangle size={14} />
                        Anomalies de Poids et Dérives Constatées
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {report.affectedAlgorithms.map((algo, aIdx) => (
                          <div
                            key={aIdx}
                            className="bg-slate-950/70 p-2.5 rounded-xl border border-amber-500/20 flex flex-col justify-between text-[11px]"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-white">{algo.label}</span>
                              <span className="text-amber-300 font-mono font-bold">
                                Δ = +{(algo.deltaWeight * 100).toFixed(1)}%
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                              {algo.reason}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tableau des Écarts Par Numéro */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Layers size={12} className="text-indigo-400" />
                      Détail des Écarts Par Numéro Prédit
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                      {matches.map((m: any, mIdx: number) => {
                        const isHit = m.errorType === "Hit";
                        const isNear = m.errorType === "Voisin" || m.errorType === "Miroir";
                        return (
                          <div
                            key={mIdx}
                            className={`p-3 rounded-2xl border flex flex-col justify-between space-y-1.5 ${
                              isHit
                                ? "bg-emerald-950/30 border-emerald-500/40"
                                : isNear
                                ? "bg-amber-950/30 border-amber-500/40"
                                : "bg-slate-950/60 border-white/5"
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-base font-mono font-black text-white">
                                #{m.predicted}
                              </span>
                              <span
                                className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                  isHit
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : isNear
                                    ? "bg-amber-500/20 text-amber-300"
                                    : "bg-slate-800 text-slate-400"
                                }`}
                              >
                                {m.errorType || "Écart"} {m.delta ? `(${m.delta})` : ""}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {isHit ? (
                                <span className="text-emerald-400">Sorti exactement au tirage</span>
                              ) : isNear ? (
                                <span>Voisin / Inversion du résultat {m.actual}</span>
                              ) : (
                                <span>Écart pur (Distance modulaire)</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Occasions Manquées (Signaux forts non retenus) */}
                  {report.missedOpportunities.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Sparkles size={12} className="text-purple-400" />
                        Occasions Manquées Détectées
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {report.missedOpportunities.map((miss, misIdx) => (
                          <div
                            key={misIdx}
                            className="bg-purple-950/30 border border-purple-500/30 px-3 py-1.5 rounded-xl text-[11px] flex items-center gap-2"
                          >
                            <span className="font-mono font-black text-purple-300">
                              #{miss.number}
                            </span>
                            <span className="text-slate-300 text-[10px]">
                              {miss.reason || "Signal sous-pondéré"}
                            </span>
                            {miss.bestAlgo && (
                              <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-[9px] font-mono rounded">
                                {miss.bestAlgo}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Analyse IA / Médico-Légale */}
                  {report.aiAnalysis && (
                    <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-white/5 text-[11px] text-slate-300 leading-relaxed space-y-1">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        Diagnostic d'Autopsie
                      </div>
                      <p>{report.aiAnalysis}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredReports.length === 0 && (
        <div className="text-center py-16 bg-slate-900/40 rounded-3xl border border-white/5">
          <FileText size={32} className="mx-auto text-slate-600 mb-3" />
          <p className="text-sm font-bold text-slate-400">
            Aucun log médico-légal ne correspond aux critères de filtre.
          </p>
        </div>
      )}
    </div>
  );
};
