import React from "react";
import {
  Activity,
  AlertCircle,
  ArrowUpDown,
  Award,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  Cpu,
  Database,
  FileText,
  Filter,
  HardDrive,
  HelpCircle,
  Layers,
  RefreshCw,
  Scale,
  ShieldCheck,
  Target,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { NumberBall } from "../../NumberBall";
import { audioEngine } from "../../../utils/audioEngine";
import type { NeuralPredictionPdfPayload } from "../../../services/export/pdf";
import {
  formatPercent,
  type EngineComparisonStats,
  type ForensicDateFilter,
  type ForensicEngineFilter,
  type ForensicEntry,
  type ForensicFilter,
  type ForensicSort,
} from "./types";

interface OldLogsStats {
  count: number;
  cutoff: number;
  retentionDays: number;
}

interface IAPredictionForensicLogPanelProps {
  drawName: string;
  localHistoryCount: number;
  loadingHistory: boolean;
  forensicEntries: ForensicEntry[];
  filteredForensicEntries: ForensicEntry[];
  engineComparisonStats: EngineComparisonStats;
  oldLogsStats: OldLogsStats;
  autoPurgeEnabled: boolean;
  isPurgingOldLogs: boolean;
  showEngineComparison: boolean;
  isExportingPDF: boolean;
  expandedItem: string | null;
  forensicEngineFilter: ForensicEngineFilter;
  forensicDateFilter: ForensicDateFilter;
  forensicCustomDate: string;
  forensicFilter: ForensicFilter;
  forensicSort: ForensicSort;
  onToggleAutoPurge: () => void;
  onManualPurgeOldLogs: () => void;
  onToggleEngineComparison: () => void;
  onExportForensicLogPDF: () => void;
  onRequestClearAll: () => void;
  onRequestDeleteEntry: (id: string) => void;
  onExportEntryPDF: (pred: NeuralPredictionPdfPayload) => void;
  onSetExpandedItem: (id: string | null) => void;
  onSetForensicEngineFilter: (filter: ForensicEngineFilter) => void;
  onSetForensicDateFilter: (filter: ForensicDateFilter) => void;
  onSetForensicCustomDate: (date: string) => void;
  onSetForensicFilter: (filter: ForensicFilter) => void;
  onSetForensicSort: (sort: ForensicSort) => void;
}

interface BreakdownMetricSnapshot {
  xap?: number;
  stability?: number;
}

export const IAPredictionForensicLogPanel: React.FC<IAPredictionForensicLogPanelProps> = ({
  drawName,
  localHistoryCount,
  loadingHistory,
  forensicEntries,
  filteredForensicEntries,
  engineComparisonStats,
  oldLogsStats,
  autoPurgeEnabled,
  isPurgingOldLogs,
  showEngineComparison,
  isExportingPDF,
  expandedItem,
  forensicEngineFilter,
  forensicDateFilter,
  forensicCustomDate,
  forensicFilter,
  forensicSort,
  onToggleAutoPurge,
  onManualPurgeOldLogs,
  onToggleEngineComparison,
  onExportForensicLogPDF,
  onRequestClearAll,
  onRequestDeleteEntry,
  onExportEntryPDF,
  onSetExpandedItem,
  onSetForensicEngineFilter,
  onSetForensicDateFilter,
  onSetForensicCustomDate,
  onSetForensicFilter,
  onSetForensicSort,
}) => {
  const verifiedFiltered = filteredForensicEntries.filter((e) => e.res);

  return (
    <div className="space-y-6">
      {/* Header & Global Actions */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950/30 p-6 rounded-[2rem] border border-slate-800/80 shadow-xl gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-fuchsia-500/10 text-fuchsia-400 rounded-lg border border-fuchsia-500/20">
              <ShieldCheck size={16} />
            </span>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-100 flex items-center gap-2">
              Forensic Log
              <span className="text-[10px] font-mono font-bold text-fuchsia-400 bg-fuchsia-500/10 px-2 py-0.5 rounded border border-fuchsia-500/20">
                {drawName}
              </span>
            </h3>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Registre médico-légal des inférences passées et validation empirique continue face aux tirages officiels.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <button
            onClick={onToggleAutoPurge}
            title="Activer ou désactiver la purge automatique des inférences ayant plus de 90 jours pour optimiser le stockage local"
            className={`px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all rounded-xl border cursor-pointer ${
              autoPurgeEnabled
                ? "bg-indigo-950/50 text-indigo-300 border-indigo-500/50 shadow-sm ring-1 ring-indigo-500/30"
                : "bg-slate-950/60 text-slate-500 border-slate-800 hover:text-slate-300"
            }`}
          >
            <Clock size={13} className={autoPurgeEnabled ? "text-indigo-400" : "text-slate-600"} />
            <span>Auto-Purge 90j : {autoPurgeEnabled ? "Actif" : "Désactivé"}</span>
          </button>

          <button
            onClick={onManualPurgeOldLogs}
            disabled={isPurgingOldLogs || localHistoryCount === 0}
            title="Purger manuellement les logs de prédictions ayant plus de 90 jours"
            className="px-3.5 py-2.5 text-[10px] font-black text-amber-400 hover:text-amber-200 uppercase tracking-widest flex items-center gap-2 transition-colors border border-amber-900/40 hover:border-amber-700/60 bg-amber-950/30 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Database size={13} />
            <span>{isPurgingOldLogs ? "Purge..." : "Purger >90j"}</span>
            {oldLogsStats.count > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {oldLogsStats.count}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              audioEngine.play("click");
              onToggleEngineComparison();
            }}
            className={`px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all rounded-xl border ${
              showEngineComparison
                ? "bg-fuchsia-950/40 text-fuchsia-300 border-fuchsia-700/50 shadow-sm"
                : "bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200"
            }`}
          >
            <Scale size={13} />
            <span>{showEngineComparison ? "Masquer Comparatif" : "Analyse Comparative"}</span>
          </button>

          <button
            onClick={onExportForensicLogPDF}
            disabled={isExportingPDF || forensicEntries.length === 0}
            className="flex-1 lg:flex-none px-4 py-2.5 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed border border-fuchsia-400/30"
          >
            <FileText size={14} />
            <span>{isExportingPDF ? "Génération PDF..." : "Exporter Forensic Log (PDF)"}</span>
          </button>

          <button
            onClick={() => {
              audioEngine.play("click");
              onRequestClearAll();
            }}
            disabled={localHistoryCount === 0}
            className="px-3.5 py-2.5 text-[10px] font-black text-slate-400 hover:text-rose-400 uppercase tracking-widest flex items-center gap-2 transition-colors border border-slate-800 hover:border-rose-900/50 bg-slate-950/60 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Trash2 size={13} />
            <span>Tout Vider</span>
          </button>
        </div>
      </div>

      {/* Comparative Analytics Panel (Local vs Cloud) */}
      {forensicEntries.length > 0 && showEngineComparison && (
        <div className="bg-gradient-to-br from-slate-900/90 via-slate-950/90 to-indigo-950/40 p-5 rounded-2xl border border-slate-800/80 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale size={16} className="text-fuchsia-400" />
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-200">
                Analyse Comparative des Moteurs : Local Déterministe vs Archives Pré-Unification
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-slate-400">
                Registre complet : {forensicEntries.length} inférences
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Local Engine Card */}
            <div
              onClick={() => {
                audioEngine.play("click");
                onSetForensicEngineFilter(forensicEngineFilter === "local" ? "all" : "local");
              }}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                forensicEngineFilter === "local"
                  ? "bg-emerald-950/30 border-emerald-500/80 ring-1 ring-emerald-500/40"
                  : "bg-slate-950/60 border-slate-800/80 hover:border-emerald-500/40"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                    <Cpu size={14} />
                  </span>
                  <div>
                    <div className="text-[11px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                      Moteur Local (Oracle Base)
                      {forensicEngineFilter === "local" && (
                        <span className="text-[8px] bg-emerald-500 text-slate-950 px-1.5 py-0.2 rounded font-black">
                          ACTIF
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-400">
                      100% Déterministe • Zéro Hasard • Web Workers
                    </span>
                  </div>
                </div>
                <span className="text-lg font-black text-emerald-400 font-mono">
                  {engineComparisonStats.local.total}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-850">
                <div>
                  <span className="text-[8.5px] font-semibold text-slate-400 uppercase block">
                    Précision
                  </span>
                  <span className="text-sm font-black text-emerald-400 font-mono">
                    {engineComparisonStats.local.avgPrecision.toFixed(1)}%
                  </span>
                  <span className="text-[8px] text-slate-500 block">
                    ({engineComparisonStats.local.verified} vérifiées)
                  </span>
                </div>

                <div>
                  <span className="text-[8.5px] font-semibold text-slate-400 uppercase block">
                    Exact Hits
                  </span>
                  <span className="text-sm font-black text-white font-mono">
                    {engineComparisonStats.local.hits}
                  </span>
                  <span className="text-[8px] text-amber-400 block">
                    +{engineComparisonStats.local.nearMisses} voisins
                  </span>
                </div>

                <div>
                  <span className="text-[8.5px] font-semibold text-slate-400 uppercase block">
                    Confiance Moy.
                  </span>
                  <span className="text-sm font-black text-cyan-400 font-mono">
                    {engineComparisonStats.local.avgConfidence.toFixed(1)}%
                  </span>
                  <span className="text-[8px] text-slate-500 block">stochastique</span>
                </div>
              </div>
            </div>

            {/* Cloud Engine Card */}
            <div
              onClick={() => {
                audioEngine.play("click");
                onSetForensicEngineFilter(forensicEngineFilter === "cloud" ? "all" : "cloud");
              }}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                forensicEngineFilter === "cloud"
                  ? "bg-fuchsia-950/30 border-fuchsia-500/80 ring-1 ring-fuchsia-500/40"
                  : "bg-slate-950/60 border-slate-800/80 hover:border-fuchsia-500/40"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-fuchsia-500/10 text-fuchsia-400 rounded-lg border border-fuchsia-500/20">
                    <Zap size={14} />
                  </span>
                  <div>
                    <div className="text-[11px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                      Archives Pré-Unification (Ex-Cloud)
                      {forensicEngineFilter === "cloud" && (
                        <span className="text-[8px] bg-fuchsia-500 text-white px-1.5 py-0.2 rounded font-black">
                          ACTIF
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-400">
                      Historique migré • Désormais 100% Local Rust/WASM
                    </span>
                  </div>
                </div>
                <span className="text-lg font-black text-fuchsia-400 font-mono">
                  {engineComparisonStats.cloud.total}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-850">
                <div>
                  <span className="text-[8.5px] font-semibold text-slate-400 uppercase block">
                    Précision
                  </span>
                  <span className="text-sm font-black text-fuchsia-400 font-mono">
                    {engineComparisonStats.cloud.avgPrecision.toFixed(1)}%
                  </span>
                  <span className="text-[8px] text-slate-500 block">
                    ({engineComparisonStats.cloud.verified} vérifiées)
                  </span>
                </div>

                <div>
                  <span className="text-[8.5px] font-semibold text-slate-400 uppercase block">
                    Exact Hits
                  </span>
                  <span className="text-sm font-black text-white font-mono">
                    {engineComparisonStats.cloud.hits}
                  </span>
                  <span className="text-[8px] text-amber-400 block">
                    +{engineComparisonStats.cloud.nearMisses} voisins
                  </span>
                </div>

                <div>
                  <span className="text-[8.5px] font-semibold text-slate-400 uppercase block">
                    Confiance Moy.
                  </span>
                  <span className="text-sm font-black text-cyan-400 font-mono">
                    {engineComparisonStats.cloud.avgConfidence.toFixed(1)}%
                  </span>
                  <span className="text-[8px] text-slate-500 block">stochastique</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Forensic Key Statistics / KPI Dashboard */}
      {forensicEntries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800/60 flex flex-col justify-between">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Activity size={12} className="text-indigo-400" />
              Inférences Actives
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">
                {filteredForensicEntries.length}
              </span>
              <span className="text-[10px] font-semibold text-slate-400">
                ({verifiedFiltered.length} vérifiées)
              </span>
            </div>
          </div>

          <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800/60 flex flex-col justify-between">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Target size={12} className="text-emerald-400" />
              Précision Moyenne
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-400">
                {verifiedFiltered.length > 0
                  ? (
                      verifiedFiltered.reduce((acc, e) => acc + e.precisionPct, 0) /
                      verifiedFiltered.length
                    ).toFixed(1)
                  : "0.0"}
                %
              </span>
              <span className="text-[10px] font-semibold text-slate-400">
                / ticket
              </span>
            </div>
          </div>

          <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800/60 flex flex-col justify-between">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Award size={12} className="text-fuchsia-400" />
              Exact Hits & Voisins
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-fuchsia-400">
                {filteredForensicEntries.reduce(
                  (acc, e) => acc + (e.res ? e.hits.length : 0),
                  0,
                )}
              </span>
              <span className="text-[10px] font-semibold text-amber-400">
                +
                {filteredForensicEntries.reduce(
                  (acc, e) => acc + (e.res ? e.nearMisses.length : 0),
                  0,
                )}{" "}
                voisins
              </span>
            </div>
          </div>

          <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800/60 flex flex-col justify-between">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Compass size={12} className="text-cyan-400" />
              Confiance Moyenne
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-cyan-400">
                {filteredForensicEntries.length > 0
                  ? (
                      filteredForensicEntries.reduce(
                        (acc, e) => acc + (e.item.prediction.confidence || 0),
                        0,
                      ) / filteredForensicEntries.length
                    ).toFixed(1)
                  : "0.0"}
                %
              </span>
              <span className="text-[10px] font-semibold text-slate-400">
                stochastique
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Filtering & Sorting Controls Bar */}
      {forensicEntries.length > 0 && (
        <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800/80 space-y-3.5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mr-1">
                <Layers size={13} className="text-indigo-400" />
                Moteur :
              </span>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  onSetForensicEngineFilter("all");
                }}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  forensicEngineFilter === "all"
                    ? "bg-slate-100 text-slate-950 shadow-md"
                    : "bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                Tous les Moteurs ({forensicEntries.length})
              </button>

              <button
                onClick={() => {
                  audioEngine.play("click");
                  onSetForensicEngineFilter("local");
                }}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                  forensicEngineFilter === "local"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/50"
                    : "bg-slate-950/70 text-emerald-400 hover:bg-emerald-950/30 border border-emerald-900/40"
                }`}
              >
                <Cpu size={12} />
                Local Déterministe ({engineComparisonStats.local.total})
              </button>

              <button
                onClick={() => {
                  audioEngine.play("click");
                  onSetForensicEngineFilter("cloud");
                }}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                  forensicEngineFilter === "cloud"
                    ? "bg-fuchsia-600 text-white shadow-md shadow-fuchsia-950/50"
                    : "bg-slate-950/70 text-fuchsia-400 hover:bg-fuchsia-950/30 border border-fuchsia-900/40"
                }`}
              >
                <Zap size={12} />
                Archives Pré-Unification ({engineComparisonStats.cloud.total})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <ArrowUpDown size={12} />
                Tri :
              </span>
              <select
                value={forensicSort}
                onChange={(e) => {
                  audioEngine.play("click");
                  onSetForensicSort(e.target.value as ForensicSort);
                }}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-fuchsia-500 cursor-pointer"
              >
                <option value="recent">Plus récent d'abord</option>
                <option value="precision_desc">Précision / Hits décroissant</option>
                <option value="confidence_desc">Confiance décroissante</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1 mr-1">
                <Calendar size={12} className="text-cyan-400" />
                Période :
              </span>
              {(
                [
                  { id: "all", label: "Toutes dates" },
                  { id: "today", label: "Aujourd'hui" },
                  { id: "7d", label: "7 Jours" },
                  { id: "30d", label: "30 Jours" },
                ] as const
              ).map((dateTab) => (
                <button
                  key={dateTab.id}
                  onClick={() => {
                    audioEngine.play("click");
                    onSetForensicDateFilter(dateTab.id);
                    onSetForensicCustomDate("");
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[9.5px] font-bold uppercase transition-all cursor-pointer ${
                    forensicDateFilter === dateTab.id && !forensicCustomDate
                      ? "bg-cyan-600 text-white shadow-sm"
                      : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-850"
                  }`}
                >
                  {dateTab.label}
                </button>
              ))}

              <div className="flex items-center gap-1 bg-slate-950/80 px-2 py-0.5 rounded-lg border border-slate-800">
                <input
                  type="date"
                  value={forensicCustomDate}
                  onChange={(e) => {
                    audioEngine.play("click");
                    onSetForensicCustomDate(e.target.value);
                    onSetForensicDateFilter("custom");
                  }}
                  className="bg-transparent text-slate-300 text-[9.5px] font-mono focus:outline-none cursor-pointer"
                />
                {forensicCustomDate && (
                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      onSetForensicCustomDate("");
                      onSetForensicDateFilter("all");
                    }}
                    className="text-slate-400 hover:text-rose-400 p-0.5"
                    title="Effacer la date personnalisée"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1 mr-1">
                <Filter size={12} />
                Résultat :
              </span>
              {(
                [
                  { id: "all", label: `Tous (${filteredForensicEntries.length})` },
                  {
                    id: "verified",
                    label: `Vérifiés (${verifiedFiltered.length})`,
                  },
                  {
                    id: "pending",
                    label: `En Attente (${filteredForensicEntries.filter((e) => !e.res).length})`,
                  },
                  {
                    id: "hits",
                    label: `Hits ≥1 (${filteredForensicEntries.filter((e) => e.hits.length >= 1).length})`,
                  },
                  {
                    id: "high_precision",
                    label: `Précision ≥2 (${filteredForensicEntries.filter((e) => e.hits.length >= 2).length})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    audioEngine.play("click");
                    onSetForensicFilter(tab.id);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[9.5px] font-bold uppercase transition-all cursor-pointer ${
                    forensicFilter === tab.id
                      ? "bg-fuchsia-600 text-white shadow-sm"
                      : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-850"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-800/40 text-[10px] text-slate-400">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 font-bold text-slate-300">
                <HardDrive size={12} className="text-indigo-400" />
                Stockage Local :
              </span>
              <span className="font-mono text-slate-400">
                {localHistoryCount} prédictions enregistrées
              </span>
              <span className="text-slate-600">•</span>
              <span
                className={`inline-flex items-center gap-1 font-semibold ${
                  autoPurgeEnabled ? "text-indigo-300" : "text-slate-500"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${autoPurgeEnabled ? "bg-indigo-400 animate-pulse" : "bg-slate-600"}`}
                />
                Auto-Purge 90j {autoPurgeEnabled ? "activée" : "désactivée"}
              </span>
              {oldLogsStats.count > 0 && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <Clock size={11} />
                    {oldLogsStats.count} log(s) &gt; 90 jours
                  </span>
                </>
              )}
            </div>

            {oldLogsStats.count > 0 && (
              <button
                onClick={onManualPurgeOldLogs}
                disabled={isPurgingOldLogs}
                className="text-[9.5px] font-black text-amber-300 hover:text-amber-200 uppercase tracking-wider flex items-center gap-1 hover:underline cursor-pointer disabled:opacity-50"
              >
                <Database size={11} />
                <span>Nettoyer les {oldLogsStats.count} anciens logs</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Forensic Entries Content */}
      {loadingHistory ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 animate-pulse">
          <RefreshCw className="animate-spin text-fuchsia-500" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Reconstitution du journal médico-légal...
          </p>
        </div>
      ) : filteredForensicEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-950/20 rounded-[2rem] border border-dashed border-slate-800 text-center p-6">
          <div className="p-4 bg-fuchsia-500/5 rounded-full border border-fuchsia-500/10 mb-4 animate-pulse">
            <ShieldCheck size={32} className="text-slate-500" />
          </div>
          <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">
            {localHistoryCount === 0
              ? "Aucun Registre Détecté"
              : "Aucune Entrée ne Correspond aux Filtres"}
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mt-2 leading-relaxed">
            {localHistoryCount === 0
              ? 'Générez une inférence dans l\'onglet "Oracle Base" (Local) ou "Prédiction IA" (Cloud) et enregistrez-la pour alimenter le Forensic Log.'
              : "Modifiez les filtres de moteur (Local vs Cloud) ou de date ci-dessus pour afficher vos inférences."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredForensicEntries.map(({ item, res, hits, nearMisses, precisionPct, engineType, scheduleException }) => {
            const d = new Date(item.timestamp);
            const isExpanded = expandedItem === item.id;
            const isCloud = engineType === "cloud";

            return (
              <div
                key={item.id}
                className={`bg-slate-900/20 rounded-2xl border shadow-sm overflow-hidden transition-all ${
                  isExpanded
                    ? isCloud
                      ? "border-fuchsia-500/80 ring-1 ring-fuchsia-500/30"
                      : "border-emerald-500/80 ring-1 ring-emerald-500/30"
                    : "border-slate-800/80 hover:border-indigo-500/40"
                }`}
              >
                <div
                  onClick={() => {
                    audioEngine.play("click");
                    onSetExpandedItem(isExpanded ? null : item.id);
                  }}
                  className="p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 cursor-pointer hover:bg-slate-900/30 transition-colors"
                >
                  {/* Left: Metadata & Engine Badges */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isCloud ? (
                        <span className="px-2.5 py-0.5 rounded-md bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/30 text-[9px] font-black uppercase flex items-center gap-1 shadow-sm">
                          <Zap size={10} />
                          Archive Hybride
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase flex items-center gap-1 shadow-sm">
                          <Cpu size={10} />
                          Local Déterministe
                        </span>
                      )}

                      <div className="text-sm font-black text-white">
                        {d.toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-800/60 font-mono">
                        <Clock size={10} />
                        {d.toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </div>
                      <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
                        Confiance {item.prediction.confidence}%
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {res ? (
                        hits.length > 0 ? (
                          <span className="text-[10px] font-black bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/30 uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                            <CheckCircle2 size={11} />
                            {hits.length} Exact Hit{hits.length > 1 ? "s" : ""}{" "}
                            ({precisionPct}% Précision)
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold bg-slate-950 text-slate-500 px-2.5 py-0.5 rounded-full border border-slate-900 uppercase tracking-wider flex items-center gap-1">
                            <AlertCircle size={11} />0 Hit (0.0% Précision)
                          </span>
                        )
                      ) : scheduleException ? (
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider flex items-center gap-1 ${
                            scheduleException.type === "HOLIDAY"
                              ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                              : "bg-rose-500/10 text-rose-300 border-rose-500/30"
                          }`}
                        >
                          <Calendar size={11} />
                          {scheduleException.type === "HOLIDAY" ? "Jour Férié" : "Tirage Annulé"} — {scheduleException.label}
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold bg-amber-500/10 text-amber-400 px-2.5 py-0.5 rounded-full border border-amber-500/20 uppercase tracking-wider flex items-center gap-1 animate-pulse">
                          <HelpCircle size={11} />
                          En attente du tirage officiel
                        </span>
                      )}

                      {nearMisses.length > 0 && (
                        <span className="text-[9px] font-bold text-amber-300 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-800/40 flex items-center gap-1">
                          <Zap size={10} />
                          {nearMisses.length} Voisin{nearMisses.length > 1 ? "s" : ""} (+/-1)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle: Predicted Selection */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">
                      Sélection Prédite
                    </span>
                    <div className="flex gap-1.5 flex-wrap">
                      {item.prediction.suggestedNumbers.map((n) => {
                        const isHit = res?.gagnants.includes(n);
                        const isNear =
                          !isHit &&
                          res?.gagnants.some((gn) => Math.abs(gn - n) === 1);
                        return (
                          <div key={n} className="relative">
                            {isHit && (
                              <div className="absolute -inset-1 bg-emerald-500/30 rounded-full blur animate-pulse" />
                            )}
                            {isNear && (
                              <div className="absolute -inset-1 bg-amber-500/20 rounded-full blur" />
                            )}
                            <NumberBall
                              number={n}
                              size="sm"
                              selected={!!isHit}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right: Official Result (if verified) & Action Tools */}
                  <div className="flex items-center gap-4 self-stretch lg:self-center justify-between lg:justify-end border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-800/50">
                    {res ? (
                      <div className="space-y-1">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">
                          Gagnants Officiels ({res.date})
                        </span>
                        <div className="flex gap-1 flex-wrap">
                          {res.gagnants.map((gn) => {
                            const isHit =
                              item.prediction.suggestedNumbers.includes(gn);
                            return (
                              <div
                                key={gn}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black border transition-all ${
                                  isHit
                                    ? "bg-emerald-600 border-emerald-400 text-white shadow-md shadow-emerald-900/30 ring-1 ring-emerald-400"
                                    : "bg-slate-950 border-slate-850 text-slate-500"
                                }`}
                              >
                                {gn}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : scheduleException ? (
                      <div className="text-[10px] text-slate-400 italic">
                        Aucun résultat ({scheduleException.type === "HOLIDAY" ? "Jour férié" : "Annulé"})
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-500 italic">
                        Tirage non encore publié
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const divScore = item.prediction.diversityMetrics?.diversityScore;
                          onExportEntryPDF({
                            drawName,
                            suggestedNumbers: item.prediction.suggestedNumbers,
                            candidates: item.prediction.candidates,
                            confidence: item.prediction.confidence,
                            analysis: item.prediction.analysis,
                            mathModelSummary: item.prediction.mathModelSummary,
                            stabilityScore: item.prediction.stabilityScore,
                            diversityScore: divScore,
                            realityAlignment: item.prediction.realityAlignment,
                            adversarialSurvivalScore: item.prediction.adversarialSurvivalScore,
                            adversarialRisks: item.prediction.adversarialRisks,
                            challengedNumbers: item.prediction.challengedNumbers,
                            aiRationale: item.prediction.aiRationale,
                            aiStrategicAdvice: item.prediction.aiStrategicAdvice,
                            xapExp: item.prediction.xapExp,
                            aiWeights: item.prediction.aiWeights,
                            isLocalFallback: item.prediction.isLocalFallback,
                            timestamp: item.timestamp,
                          });
                        }}
                        title="Exporter la fiche d'inférence en PDF"
                        className="p-2 text-indigo-400 hover:text-indigo-200 bg-indigo-950/40 hover:bg-indigo-900/60 rounded-xl border border-indigo-800/40 transition-all cursor-pointer"
                      >
                        <FileText size={14} />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          audioEngine.play("click");
                          onRequestDeleteEntry(item.id);
                        }}
                        title="Supprimer cette entrée"
                        className="p-2 text-slate-500 hover:text-rose-400 bg-slate-950 hover:bg-rose-950/30 rounded-xl border border-slate-800 hover:border-rose-900/40 transition-all cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>

                      <div
                        className={`p-2 rounded-full transition-transform text-slate-500 ${
                          isExpanded ? "rotate-180 bg-slate-800 text-fuchsia-400" : ""
                        }`}
                      >
                        <ChevronDown size={14} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detailed Collapsible Forensic Breakdown */}
                {isExpanded && (
                  <div
                    className="border-t border-slate-800/60 p-5 bg-slate-950/30 cursor-default space-y-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-850">
                        <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                          Moteur & Modèle Mathématique
                        </span>
                        <div className="flex items-center gap-1.5 mb-1">
                          {isCloud ? (
                            <span className="px-2 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 text-[8.5px] font-black uppercase flex items-center gap-1">
                              <Zap size={9} /> Archive Hybride
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[8.5px] font-black uppercase flex items-center gap-1">
                              <Cpu size={9} /> Local HPC
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono font-bold text-indigo-400 block leading-tight">
                          {item.prediction.mathModelSummary ||
                            item.prediction.analysis ||
                            (isCloud
                              ? "Inférence Hybride HPC (Archive pré-unification)"
                              : "Inférence Déterministe Locale • Rust/WASM & ACO")}
                        </span>
                      </div>

                      <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-850">
                        <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                          Indices de Fiabilité Stochastique
                        </span>
                        <div className="text-[10px] font-mono font-bold text-fuchsia-400 space-y-0.5">
                          <div>Index de Stabilité : {formatPercent(item.prediction.stabilityScore)}</div>
                          {item.prediction.realityAlignment !== undefined && (
                            <div className="text-cyan-400">
                              Alignement Réel : {item.prediction.realityAlignment}%
                            </div>
                          )}
                          {item.prediction.adversarialSurvivalScore !== undefined && (
                            <div className="text-amber-400">
                              Survie Adversariale : {item.prediction.adversarialSurvivalScore}%
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-850">
                        <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                          Vérification Empirique
                        </span>
                        <div className="text-[10px] font-bold space-y-0.5">
                          <div className={res ? "text-emerald-400" : "text-amber-400"}>
                            {res ? `Résultat du tirage : ${res.date}` : "En attente du résultat officiel"}
                          </div>
                          <div className="text-slate-400">
                            Exact Hits : <strong className="text-white">{hits.length}</strong> /{" "}
                            {item.prediction.suggestedNumbers.length}
                          </div>
                          <div className="text-slate-400">
                            Near-Misses : <strong className="text-amber-300">{nearMisses.length}</strong>
                          </div>
                        </div>
                      </div>
                    </div>

                    {item.prediction.breakdown && (
                      <div className="space-y-2 bg-slate-950/80 p-3.5 rounded-xl border border-slate-850">
                        <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider block">
                          Densité d'Importance des Features XAP par Numéro
                        </span>
                        <div className="flex gap-3 flex-wrap">
                          {Object.entries(item.prediction.breakdown).map(
                            ([num, rawMetrics]) => {
                              const metrics = rawMetrics as BreakdownMetricSnapshot;
                              const n = parseInt(num, 10);
                              const isHit = res?.gagnants.includes(n);
                              return (
                                <div
                                  key={num}
                                  className={`text-[9px] font-mono px-2.5 py-1.5 rounded-lg flex items-center gap-2 border ${
                                    isHit
                                      ? "bg-emerald-950/40 border-emerald-700/50 text-emerald-300"
                                      : "bg-slate-900 border-slate-800 text-slate-400"
                                  }`}
                                >
                                  <span
                                    className={`font-bold w-5 h-5 rounded-md flex items-center justify-center text-[9px] ${
                                      isHit
                                        ? "bg-emerald-600 text-white"
                                        : "bg-indigo-950 border border-indigo-900 text-indigo-300"
                                    }`}
                                  >
                                    {num}
                                  </span>
                                  <span>
                                    XAP:{" "}
                                    <strong className={isHit ? "text-emerald-400" : "text-fuchsia-400"}>
                                      {typeof metrics.xap === "number"
                                        ? `${metrics.xap.toFixed(0)}%`
                                        : "n/d"}
                                    </strong>
                                  </span>
                                  {typeof metrics.stability === "number" && (
                                    <span className="text-slate-500">
                                      Stab: {metrics.stability}%
                                    </span>
                                  )}
                                </div>
                              );
                            },
                          )}
                        </div>
                      </div>
                    )}

                    {item.prediction.adversarialRisks &&
                      item.prediction.adversarialRisks.length > 0 && (
                        <div className="bg-rose-950/15 border border-rose-900/30 p-3 rounded-xl space-y-1">
                          <span className="text-[8.5px] font-black text-rose-400 uppercase tracking-wider block">
                            Diagnostics d'Entropie & Risques Stochastiques
                          </span>
                          <ul className="list-disc list-inside space-y-0.5 text-[9px] text-rose-300/80">
                            {item.prediction.adversarialRisks.map((risk, idx) => (
                              <li key={idx}>{risk}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
