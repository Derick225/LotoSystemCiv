import React, { useState } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { deleteForensicReportLocal } from "../../services/postPredictionAnalysisService";
import { deleteForensicReportCloud } from "../../services/syncService";
import { PredictionForensics } from "../PredictionForensics";
import {
  Target,
  Trash2,
  RefreshCw,
  Cloud,
  BookOpen,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { ForensicReport } from "../../types";
import { useForensicData } from "../../hooks/useForensicData";
import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import { formatDateSafely } from "../../utils/dateUtils";

export const ForensicHub: React.FC<{ drawName: string }> = React.memo(
  ({ drawName }) => {
    const { showToast } = useToast();

    const { reports, pendingPredictions, syncReports, refreshLocal } =
      useForensicData(drawName);

    const [syncing, setSyncing] = useState(false);
    const [selectedReport, setSelectedReport] = useState<ForensicReport | null>(
      null,
    );

    const handleSync = async () => {
      try {
        audioEngine.play("click");
        setSyncing(true);
        await syncReports();
        showToast("Synchronisation cloud terminée", "success");
      } catch (e) {
        showToast("Échec de synchronisation", "error");
      } finally {
        setSyncing(false);
      }
    };

    const handleRefresh = async () => {
      try {
        audioEngine.play("click");
        await refreshLocal();
      } catch (e) {
        console.error(e);
      }
    };

    const handleDeleteReport = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm("Supprimer ce rapport d'audit ?")) return;
      try {
        audioEngine.play("success");
        await deleteForensicReportLocal(id);
        await deleteForensicReportCloud(id);
        showToast("Rapport supprimé", "success");
        refreshLocal();
      } catch (error) {
        showToast("Erreur de suppression", "error");
      }
    };

    return (
      <div className="w-full h-full flex flex-col p-4 md:p-8 animate-fade-in custom-scrollbar overflow-y-auto">
        <div className="max-w-7xl mx-auto w-full space-y-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-3">
                <span className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-2xl">
                  <Target size={24} />
                </span>
                Laboratoire Forensique
              </h1>
              <p className="text-xs text-slate-500 mt-2 font-medium max-w-xl">
                Autopsie post-tirage et ajustements du moteur.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-500 rounded-xl transition-colors"
                title="Synchroniser avec le Cloud"
              >
                <Cloud size={18} className={syncing ? "animate-bounce" : ""} />
              </button>
              <button
                onClick={handleRefresh}
                className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-emerald-500 rounded-xl transition-colors"
                title="Rafraîchir"
              >
                <RefreshCw size={18} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {pendingPredictions.length > 0 && (
              <div className="lg:col-span-12 space-y-4 mb-4">
                <div className="flex items-center gap-2 pb-2 border-b border-rose-500/30">
                  <Activity size={16} className="text-rose-500 animate-pulse" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-rose-500">
                    Prédictions en Attente d'Audit ({pendingPredictions.length})
                  </h4>
                </div>
                <div className="p-5 bg-rose-500/5 border border-rose-500/20 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div>
                    <p className="text-[11px] text-slate-400">
                      Certaines prédictions passées n'ont pas encore été confrontées aux résultats réels.
                    </p>
                    <p className="text-[10px] text-rose-400 font-bold mt-1 uppercase tracking-widest">
                      L'autopsie automatique s'exécute en arrière-plan.
                    </p>
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="px-5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-black text-xs uppercase tracking-widest rounded-xl transition-colors border border-rose-500/30 whitespace-nowrap"
                  >
                    Forcer l'Audit
                  </button>
                </div>
              </div>
            )}

            <div className="lg:col-span-12 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <BookOpen size={16} className="text-emerald-500" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Rapports d'Audit ({reports.length})
                </h4>
              </div>
              {reports.length === 0 ? (
                <div className="p-6 bg-slate-50/50 dark:bg-slate-900/10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                    Aucun rapport d'audit disponible.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reports.map((rep) => {
                    let hits = 0;
                    if (typeof rep.matches === "number") hits = rep.matches;
                    else if (Array.isArray(rep.matches)) {
                      hits = rep.matches.filter(
                        (m) => m.errorType === "Hit",
                      ).length;
                    }

                    let badgeStyle =
                      "bg-slate-500/10 text-slate-500 border-slate-300/20";
                    let badgeLabel = "DÉRIVE";
                    let BadgeIcon = Target;

                    if (hits === 5) {
                      badgeStyle =
                        "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20";
                      badgeLabel = "PARFAIT";
                      BadgeIcon = CheckCircle2;
                    } else if (hits >= 3) {
                      badgeStyle =
                        "bg-teal-500/10 text-teal-600 dark:text-teal-300 border-teal-500/20";
                      badgeLabel = "ÉLITE";
                      BadgeIcon = CheckCircle2;
                    } else if (hits > 0) {
                      badgeStyle =
                        "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/20";
                      badgeLabel = "PARTIEL";
                      BadgeIcon = Activity;
                    }

                    return (
                      <div
                        key={rep.id}
                        onClick={() => {
                          try {
                            audioEngine.play("click");
                          } catch (e) {}
                          setSelectedReport(rep);
                        }}
                        className="cursor-pointer group flex flex-col p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-emerald-500/50 hover:shadow-md transition-all gap-4"
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] font-bold text-slate-400">
                            {formatDateSafely(rep.date)}
                          </span>
                          <div
                            className={`px-2 py-1 rounded-lg border text-[9px] font-black flex items-center gap-1 ${badgeStyle}`}
                          >
                            <BadgeIcon size={10} />
                            <span>{badgeLabel}</span>
                          </div>
                        </div>

                        <div className="flex gap-1.5 flex-wrap">
                          {rep.combo?.map((n) => {
                            const isHit =
                              Array.isArray(rep.matches) &&
                              rep.matches.some(
                                (m) =>
                                  m.predicted === n && m.errorType === "Hit",
                              );
                            return (
                              <div
                                key={n}
                                className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shadow-sm transition-transform group-hover:scale-105 ${
                                  isHit
                                    ? "bg-emerald-500 text-white border-transparent"
                                    : "bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                                }`}
                              >
                                {n}
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3 mt-1">
                          <div className="text-left">
                            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                              Précision
                            </span>
                            <span className="font-black text-sm text-emerald-500">
                              {hits} / 5
                            </span>
                          </div>
                          <button
                            onClick={(e) => handleDeleteReport(rep.id, e)}
                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all"
                            title="Supprimer ce rapport"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {selectedReport && (
            <PredictionForensics
              report={selectedReport}
              onClose={() => setSelectedReport(null)}
            />
          )}
        </div>
      </div>
    );
  },
);
