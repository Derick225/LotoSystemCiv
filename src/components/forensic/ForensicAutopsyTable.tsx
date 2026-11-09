import React, { memo, useState, useMemo, useEffect } from "react";
import {
  Search,
  X,
  ArrowUpDown,
  Trash2,
  CheckSquare,
  Check,
  CheckCircle2,
  Activity,
  Target,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ForensicReport } from "../../types";
import { audioEngine } from "../../utils/audioEngine";
import { formatDateSafely } from "../../utils/dateUtils";

export type SortOption = "date_desc" | "date_asc" | "hits_desc" | "hits_asc" | "drift_desc";
export type StatusFilterOption = "all" | "perfect" | "elite" | "partial" | "drift";

const REPORTS_PER_PAGE = 12;

const getReportHits = (rep: ForensicReport): number => {
  if (typeof rep.matches === "number") return rep.matches;
  if (Array.isArray(rep.matches)) {
    return rep.matches.filter((m) => m.errorType === "Hit").length;
  }
  return 0;
};

const getDisplayStability = (rep: ForensicReport): string => {
  const val = rep.postMortemStabilityScore ?? rep.forensicScore;
  if (val === undefined || val === null) return "n/d";
  return `${val}`;
};

export interface ForensicAutopsyTableProps {
  reports: ForensicReport[];
  driftCount: number;
  isDeletingBatch: boolean;
  selectedReportIds: Set<string>;
  onToggleSelectReport: (id: string, e?: React.MouseEvent) => void;
  onSelectAllFiltered: (ids: Set<string>) => void;
  onDeselectAll: () => void;
  onDeleteSelected: () => void;
  onDeleteDriftReports: () => void;
  onDeleteReport: (id: string, predictionId?: string, e?: React.MouseEvent) => void;
  onOpenReport: (rep: ForensicReport) => void;
  onFlashAutopsy: () => void;
}

export const ForensicAutopsyTable: React.FC<ForensicAutopsyTableProps> = memo(
  ({
    reports,
    driftCount,
    isDeletingBatch,
    selectedReportIds,
    onToggleSelectReport,
    onSelectAllFiltered,
    onDeselectAll,
    onDeleteSelected,
    onDeleteDriftReports,
    onDeleteReport,
    onOpenReport,
    onFlashAutopsy,
  }) => {
    const [statusFilter, setStatusFilter] = useState<StatusFilterOption>("all");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [sortBy, setSortBy] = useState<SortOption>("date_desc");
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);

    // Filtrage et Tri des rapports d'audit
    const filteredReports = useMemo(() => {
      let list = [...reports];

      // Status filter
      if (statusFilter !== "all") {
        list = list.filter((rep) => {
          const hits = getReportHits(rep);
          if (statusFilter === "perfect") return hits === 5;
          if (statusFilter === "elite") return hits >= 3 && hits < 5;
          if (statusFilter === "partial") return hits > 0 && hits < 3;
          if (statusFilter === "drift") return hits === 0;
          return true;
        });
      }

      // Search query (Date or Number search)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        list = list.filter((rep) => {
          const dateMatch = rep.date && rep.date.toLowerCase().includes(q);
          const comboMatch = rep.combo && rep.combo.some((n) => String(n) === q);
          const verdictMatch = rep.verdict && rep.verdict.toLowerCase().includes(q);
          return dateMatch || comboMatch || verdictMatch;
        });
      }

      // Sorting
      list.sort((a, b) => {
        if (sortBy === "date_desc") {
          const dateA = new Date(a.date || a.timestamp || 0).getTime();
          const dateB = new Date(b.date || b.timestamp || 0).getTime();
          return dateB - dateA;
        }
        if (sortBy === "date_asc") {
          const dateA = new Date(a.date || a.timestamp || 0).getTime();
          const dateB = new Date(b.date || b.timestamp || 0).getTime();
          return dateA - dateB;
        }
        if (sortBy === "hits_desc") {
          return getReportHits(b) - getReportHits(a);
        }
        if (sortBy === "hits_asc") {
          return getReportHits(a) - getReportHits(b);
        }
        if (sortBy === "drift_desc") {
          const driftA = a.divergenceMetric ?? 0;
          const driftB = b.divergenceMetric ?? 0;
          return driftB - driftA;
        }
        return 0;
      });

      return list;
    }, [reports, statusFilter, searchQuery, sortBy]);

    // Reset pagination on filter/sort change
    useEffect(() => {
      setCurrentPage(1);
    }, [statusFilter, searchQuery, sortBy]);

    const totalPages = Math.max(1, Math.ceil(filteredReports.length / REPORTS_PER_PAGE));
    const paginatedReports = useMemo(() => {
      const start = (currentPage - 1) * REPORTS_PER_PAGE;
      return filteredReports.slice(start, start + REPORTS_PER_PAGE);
    }, [filteredReports, currentPage]);

    const handleSelectAll = () => {
      audioEngine.play("click");
      const ids = new Set(filteredReports.map((r) => r.id));
      onSelectAllFiltered(ids);
      setIsSelectionMode(true);
    };

    return (
      <div className="space-y-6">
        {/* Search, Status Filter Badges & Management Tools */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/80">
          {/* Filter pills & Search input */}
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <div className="relative min-w-[180px] max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher date ou numéro..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 text-white placeholder-slate-500 rounded-xl border border-slate-800 text-xs focus:outline-none focus:border-indigo-500 font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: "all", label: "Tous" },
                { id: "perfect", label: "Parfait (5/5)" },
                { id: "elite", label: "Élite (≥3/5)" },
                { id: "partial", label: "Partiel (1-2/5)" },
                { id: "drift", label: "Dérive (0/5)" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    audioEngine.play("click");
                    setStatusFilter(f.id as StatusFilterOption);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    statusFilter === f.id
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-900/60 text-slate-400 hover:bg-slate-800 border border-slate-800"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sorting & Action Tools: Selection Mode & Direct Purge */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Sorting Select */}
            <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800">
              <ArrowUpDown size={12} className="text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-transparent text-slate-300 text-[10px] font-bold uppercase focus:outline-none cursor-pointer"
              >
                <option value="date_desc" className="bg-slate-900">Plus récent</option>
                <option value="date_asc" className="bg-slate-900">Plus ancien</option>
                <option value="hits_desc" className="bg-slate-900">Hits Max</option>
                <option value="hits_asc" className="bg-slate-900">Hits Min</option>
                <option value="drift_desc" className="bg-slate-900">Dérive Max</option>
              </select>
            </div>

            {/* Purge drift button if drifts exist */}
            {driftCount > 0 && (
              <button
                onClick={onDeleteDriftReports}
                disabled={isDeletingBatch}
                className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                title="Supprimer définitivement tous les rapports sans aucun numéro gagnant (0/5)"
              >
                <Trash2 size={12} />
                <span>Purger Dérives ({driftCount})</span>
              </button>
            )}

            {/* Toggle selection mode */}
            <button
              onClick={() => {
                audioEngine.play("click");
                setIsSelectionMode((prev) => !prev);
                if (isSelectionMode) {
                  onDeselectAll();
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all border cursor-pointer ${
                isSelectionMode || selectedReportIds.size > 0
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
              }`}
            >
              <CheckSquare size={12} />
              <span>{isSelectionMode ? "Quitter Sélection" : "Sélectionner"}</span>
            </button>

            <span className="text-xs text-slate-400 font-mono pl-2 border-l border-slate-800">
              {filteredReports.length} / {reports.length}
            </span>
          </div>
        </div>

        {/* BATCH ACTION BANNER (When at least 1 report is selected) */}
        {(selectedReportIds.size > 0 || isSelectionMode) && (
          <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl flex items-center justify-between flex-wrap gap-3 animate-fade-in shadow-xl shadow-indigo-950/20">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-500/20 text-indigo-300 rounded-lg">
                <CheckSquare size={16} />
              </span>
              <span className="text-xs font-black text-white uppercase tracking-wider">
                {selectedReportIds.size} rapport{selectedReportIds.size > 1 ? "s" : ""} sélectionné{selectedReportIds.size > 1 ? "s" : ""}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {selectedReportIds.size < filteredReports.length ? (
                <button
                  onClick={handleSelectAll}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-slate-700 cursor-pointer"
                >
                  Tout sélectionner ({filteredReports.length})
                </button>
              ) : (
                <button
                  onClick={onDeselectAll}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-slate-700 cursor-pointer"
                >
                  Désélectionner tout
                </button>
              )}

              <button
                onClick={onDeleteSelected}
                disabled={selectedReportIds.size === 0 || isDeletingBatch}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-rose-600/30 transition-all cursor-pointer disabled:opacity-40"
              >
                <Trash2 size={12} />
                <span>Supprimer la sélection ({selectedReportIds.size})</span>
              </button>
            </div>
          </div>
        )}

        {/* Grid of Report Cards */}
        {filteredReports.length === 0 ? (
          <div className="p-12 bg-slate-900/40 rounded-3xl border border-dashed border-slate-800 text-center space-y-3">
            <FileText size={32} className="mx-auto text-slate-600" />
            <p className="text-xs text-slate-400">
              Aucun rapport d'autopsie correspondant aux filtres. Lancez une "Autopsie Flash" pour confronter la prédiction au dernier résultat réel.
            </p>
            <button
              onClick={onFlashAutopsy}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              Exécuter une Autopsie Immédiate
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedReports.map((rep) => {
                const isSelected = selectedReportIds.has(rep.id);
                const hits = getReportHits(rep);

                let badgeStyle = "bg-slate-800 text-slate-400 border-slate-700";
                let badgeLabel = "DÉRIVE";
                let BadgeIcon = Target;

                if (hits === 5) {
                  badgeStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                  badgeLabel = "PARFAIT (5/5)";
                  BadgeIcon = CheckCircle2;
                } else if (hits >= 3) {
                  badgeStyle = "bg-teal-500/10 text-teal-400 border-teal-500/20";
                  badgeLabel = `ÉLITE (${hits}/5)`;
                  BadgeIcon = CheckCircle2;
                } else if (hits > 0) {
                  badgeStyle = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
                  badgeLabel = `PARTIEL (${hits}/5)`;
                  BadgeIcon = Activity;
                }

                return (
                  <div
                    key={rep.id}
                    onClick={() => {
                      if (isSelectionMode) {
                        onToggleSelectReport(rep.id);
                      } else {
                        onOpenReport(rep);
                      }
                    }}
                    className={`cursor-pointer group flex flex-col p-5 bg-slate-900/60 border rounded-3xl transition-all gap-4 justify-between relative ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-950/30 ring-1 ring-indigo-500/50"
                        : "border-slate-800 hover:border-indigo-500/50 hover:shadow-xl"
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        {/* Selection Checkbox & Date */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => onToggleSelectReport(rep.id, e)}
                            className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                                : "border-slate-700 bg-slate-800/80 text-transparent hover:border-slate-500"
                            }`}
                            title={isSelected ? "Désélectionner" : "Sélectionner pour suppression"}
                          >
                            <Check size={12} className={isSelected ? "opacity-100" : "opacity-0"} />
                          </button>
                          <span className="text-[10px] font-bold text-slate-400 font-mono">
                            {formatDateSafely(rep.date)}
                          </span>
                        </div>

                        <div className={`px-2.5 py-1 rounded-xl border text-[9px] font-black flex items-center gap-1 ${badgeStyle}`}>
                          <BadgeIcon size={11} />
                          <span>{badgeLabel}</span>
                        </div>
                      </div>

                      {/* Combo Balls */}
                      <div className="flex gap-1.5 flex-wrap mt-3">
                        {rep.combo?.map((n) => {
                          const isHit =
                            Array.isArray(rep.matches) &&
                            rep.matches.some((m) => m.predicted === n && m.errorType === "Hit");
                          return (
                            <div
                              key={n}
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shadow-sm transition-transform group-hover:scale-105 font-mono ${
                                isHit
                                  ? "bg-emerald-500 text-white shadow-emerald-500/30"
                                  : "bg-slate-800 border border-slate-700 text-slate-300"
                              }`}
                            >
                              {n}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Metric Bar & Delete button */}
                    <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                      <div className="flex items-center gap-3 text-[10px]">
                        <div>
                          <span className="block text-slate-500 uppercase tracking-wider text-[9px]">Stabilité</span>
                          <span className="font-bold text-slate-200 font-mono">
                            {getDisplayStability(rep)}%
                          </span>
                        </div>
                        <div>
                          <span className="block text-slate-500 uppercase tracking-wider text-[9px]">RMSE</span>
                          <span className="font-bold text-slate-200 font-mono">
                            {rep.rmse?.toFixed(1) ?? "N/A"}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => onDeleteReport(rep.id, rep.predictionId, e)}
                        className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-900/20 rounded-xl transition-all cursor-pointer"
                        title="Supprimer définitivement ce rapport d'autopsie"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* PAGINATION */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700 cursor-pointer disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (currentPage <= 4) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 3) {
                      pageNum = totalPages - 6 + i;
                    } else {
                      pageNum = currentPage - 3 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          currentPage === pageNum
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700 cursor-pointer disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
                <span className="text-[10px] text-slate-500 font-mono ml-2">
                  Page {currentPage}/{totalPages}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    );
  }
);

ForensicAutopsyTable.displayName = "ForensicAutopsyTable";
