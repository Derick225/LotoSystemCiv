import React, { useState, useEffect, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  getPredictionHistoryAsync,
  clearPredictionHistory,
  linkPredictionToResult,
  deletePrediction,
  findMatchingResultForPrediction,
} from "../services/predictionHistoryService";
import {
  performForensicAnalysis,
  saveForensicReport,
  getForensicReportByPredictionId,
  syncForensicReportsWithCloud,
} from "../services/postPredictionAnalysisService";
import type {
  PredictionHistoryItem,
  DrawResult,
  ForensicReport,
} from "../types";
import { NumberBall } from "./NumberBall";
import {
  Trash2,
  History,
  CheckCircle2,
  Microscope,
  Link as LinkIcon,
  AlertCircle,
  Binary,
  ChevronDown,
  Activity,
  Clock,
} from "lucide-react";
import { useToast } from "./ui/Toast";
import { PredictionForensics } from "./PredictionForensics";
import { useNexusHistory, useNexusLoading } from "../store/useNexusStore";
import { TicketXRay } from "./TicketXRay";
import { audioEngine } from "../utils/audioEngine";
import { logError, AppError } from "../utils/AppError";

interface PredictionHistoryProps {
  drawName: string;
}

export const PredictionHistory: React.FC<PredictionHistoryProps> = ({
  drawName,
}) => {
  const { showToast } = useToast();
  const results = useNexusHistory();
  const nexusLoading = useNexusLoading();
  const [history, setHistory] = useState<PredictionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [forensicReport, setForensicReport] = useState<ForensicReport | null>(
    null,
  );
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const attemptedLinksRef = useRef<Set<string>>(new Set());
  const isLinkingRef = useRef(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const hist = await getPredictionHistoryAsync(drawName);
      setHistory(hist);
    } catch (e) {
      logError(
        new AppError(
          "Echec chargement historique",
          "FETCH_HISTORY_ERROR",
          "low",
          { error: e },
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [drawName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    audioEngine.play("click");
    if (confirm("Supprimer cette prédiction en attente ?")) {
      await deletePrediction(id);
      setHistory((prev) => prev.filter((h) => h.id !== id));
      audioEngine.play("success");
      showToast("Prédiction supprimée.", "info");
    }
  };

  // O(1) Lookups for performance
  const resultsById = React.useMemo(() => {
    const map = new Map<string, DrawResult>();
    results.forEach((r) => map.set(r.id, r));
    return map;
  }, [results]);

  const resultsByDate = React.useMemo(() => {
    const map = new Map<string, DrawResult>();
    results.forEach((r) => map.set(r.date, r));
    return map;
  }, [results]);

  const getResultById = useCallback(
    (id: string) => resultsById.get(id),
    [resultsById],
  );
  const getResultByDate = useCallback(
    (date: string) => resultsByDate.get(date),
    [resultsByDate],
  );

  // Operational Auto-Linker & Forensic Automator
  useEffect(() => {
    const linkOrphansAndAutomateForensics = async () => {
      if (isLinkingRef.current) return;
      if (history.length > 0 && results.length > 0) {
        isLinkingRef.current = true;
        let changed = false;
        let forensicGenerated = false;
        try {
          for (const item of history) {
            if (attemptedLinksRef.current.has(item.id)) {
              continue;
            }

            let match = item.drawResultId
              ? getResultById(item.drawResultId)
              : null;

            if (!item.drawResultId) {
              match = findMatchingResultForPrediction(item, results);

              if (match) {
                attemptedLinksRef.current.add(item.id);
                await linkPredictionToResult(item.id, match.id);
                changed = true;
              }
            }

            // Automate Forensic Analysis if linked and no report exists
            if (match) {
              const existingReport = await getForensicReportByPredictionId(
                item.id,
              );
              if (!existingReport) {
                attemptedLinksRef.current.add(item.id);
                try {
                  const report = await performForensicAnalysis(
                    drawName,
                    match.date,
                    item.prediction.suggestedNumbers,
                    match.gagnants,
                    item.prediction.breakdown,
                    item.id,
                    match.id,
                    true, // skipLLM for automated background analysis
                    results,
                  );
                  saveForensicReport(report);
                  forensicGenerated = true;
                } catch (error) {
                  console.warn(
                    "Failed to automate forensic analysis for prediction",
                    item.id,
                    error,
                  );
                }
              }
            }
          }
          if (forensicGenerated) {
            syncForensicReportsWithCloud().catch((e) =>
              logError(
                new AppError(
                  "Auto-sync forensic failed",
                  "AUTO_SYNC_FAILED",
                  "low",
                  { error: e },
                ),
              ),
            );
          }
          if (changed) loadData();
        } finally {
          isLinkingRef.current = false;
        }
      }
    };
    linkOrphansAndAutomateForensics();
  }, [history, results, getResultByDate, getResultById, loadData, drawName]);

  const handleOpenAudit = async (
    e: React.MouseEvent,
    result: DrawResult,
    predictionItem: PredictionHistoryItem,
  ) => {
    e.stopPropagation();
    audioEngine.play("click");

    const existingReport = await getForensicReportByPredictionId(
      predictionItem.id,
    );

    if (existingReport) {
      setForensicReport(existingReport);
      return;
    }

    const report = await performForensicAnalysis(
      drawName,
      result.date,
      predictionItem.prediction.suggestedNumbers,
      result.gagnants,
      predictionItem.prediction.breakdown,
      predictionItem.id,
      result.id,
      true, // skip LLM by default, ForensicAutopsyView will load it when "Autopsy" tab is clicked
      results,
    );
    saveForensicReport(report);
    setForensicReport(report);
    // Automate sync in background
    syncForensicReportsWithCloud().catch((e) =>
      logError(
        new AppError("Auto-sync forensic failed", "AUTO_SYNC_FAILED", "low", {
          error: e,
        }),
      ),
    );
  };

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: history.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180,
  });

  if (loading || nexusLoading)
    return (
      <div className="p-8 space-y-4">
        <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse"></div>
        <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse"></div>
      </div>
    );

  return (
    <div className="space-y-6 animate-fade-in flex flex-col h-[700px]">
      <div className="flex justify-between items-center px-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
            <History size={20} />
          </div>
          <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-tighter">
            Historique Inférence
          </h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Hit
            <div className="w-2 h-2 rounded-full bg-amber-500 ml-2"></div> Near
            Miss (+/- 1)
          </div>
          <button
            onClick={() => {
              audioEngine.play("click");
              if (confirm("Vider l'historique ?")) {
                clearPredictionHistory(drawName);
                setHistory([]);
                audioEngine.play("success");
              }
            }}
            className="text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-widest flex items-center gap-2 transition-colors"
          >
            <Trash2 size={14} /> Reset Journal
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 h-[200px]">
            <History
              size={48}
              className="text-slate-300 dark:text-slate-700 mb-4"
            />
            <h4 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">
              Aucune Prédiction
            </h4>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2 text-center max-w-sm">
              Générez une prédiction via l'Oracle pour la voir apparaître ici et
              suivre son évolution.
            </p>
          </div>
        ) : (
          <div
            ref={parentRef}
            className="h-full overflow-auto rounded-2xl custom-scrollbar"
            style={{ contain: "strict" }}
          >
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const item = history[virtualItem.index];
                const res = item.drawResultId
                  ? getResultById(item.drawResultId)
                  : findMatchingResultForPrediction(item, results);
                const hits = res
                  ? item.prediction.suggestedNumbers.filter((n) =>
                      res.gagnants.includes(n),
                    )
                  : [];
                const isExpanded = expandedItem === item.id;
                const dateObj = new Date(item.timestamp);

                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    className="pb-4"
                  >
                    <div
                      onClick={() => {
                        audioEngine.play("click");
                        setExpandedItem(isExpanded ? null : item.id);
                      }}
                      className={`bg-white dark:bg-slate-900 rounded-2xl border shadow-sm overflow-hidden group transition-all cursor-pointer ${isExpanded ? "border-indigo-500 ring-1 ring-indigo-500/50" : "border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600"}`}
                    >
                      <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-50 dark:divide-slate-700">
                        <div className="p-6 md:w-3/5">
                          <div className="flex justify-between items-start mb-6">
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="text-base font-black text-slate-800 dark:text-white">
                                  {dateObj.toLocaleDateString("fr-FR")}
                                </div>
                                <div className="flex items-center gap-1 text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-full">
                                  <Clock size={10} />
                                  {dateObj.toLocaleTimeString("fr-FR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                                  Confiance {item.prediction.confidence}%
                                </span>
                                {item.drawResultId && (
                                  <span className="flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-500/20 uppercase">
                                    <LinkIcon size={8} /> ID-LINKED
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {res && (
                                <button
                                  onClick={(e) => handleOpenAudit(e, res, item)}
                                  className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"
                                >
                                  <Microscope size={18} />
                                </button>
                              )}
                              <div
                                className={`p-2 rounded-full transition-transform ${isExpanded ? "rotate-180 bg-slate-100 text-indigo-600" : "text-slate-400"}`}
                              >
                                <ChevronDown size={16} />
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2.5">
                            {item.prediction.suggestedNumbers.map((n) => {
                              const isHit = hits.includes(n);
                              const isNearMiss =
                                !isHit &&
                                res &&
                                res.gagnants.some(
                                  (gn) => Math.abs(gn - n) === 1,
                                );
                              return (
                                <div key={n} className="relative">
                                  {isHit && (
                                    <div className="absolute -inset-1 bg-emerald-500/40 rounded-full blur animate-pulse"></div>
                                  )}
                                  {isNearMiss && (
                                    <div className="absolute -inset-1 bg-amber-500/40 rounded-full blur animate-pulse"></div>
                                  )}
                                  <NumberBall
                                    number={n}
                                    size="sm"
                                    selected={isHit}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div
                          className={`p-6 md:w-2/5 flex flex-col justify-center ${res ? "bg-slate-50 dark:bg-slate-800/20" : "bg-slate-50/50 dark:bg-slate-900/10"}`}
                        >
                          {res ? (
                            <div className="space-y-4">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                  Résultat Officiel
                                </span>
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded ${hits.length >= 2 ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}
                                >
                                  {hits.length} HITS
                                </span>
                              </div>
                              <div className="flex gap-1.5 flex-wrap">
                                {res.gagnants.map((n) => {
                                  const isHit =
                                    item.prediction.suggestedNumbers.includes(
                                      n,
                                    );
                                  return (
                                    <div
                                      key={n}
                                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black border transition-all ${isHit ? "bg-emerald-600 border-emerald-400 text-white scale-110 shadow-md" : "bg-white dark:bg-slate-800 border-slate-200 text-slate-300"}`}
                                    >
                                      {n}
                                    </div>
                                  );
                                })}
                              </div>

                              {res.machine && res.machine.length > 0 && (
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter flex items-center gap-1">
                                    <Binary size={8} /> Machine
                                  </span>
                                  <div className="flex gap-1">
                                    {res.machine.map((n) => (
                                      <div
                                        key={n}
                                        className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-900/50 text-[10px] font-black text-slate-500 border border-slate-200 dark:border-slate-700 flex items-center justify-center"
                                      >
                                        {n}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {hits.length >= 3 && (
                                <div className="flex items-center gap-2 text-xs font-black text-emerald-600 bg-emerald-50 p-1.5 rounded-lg animate-bounce-subtle">
                                  <CheckCircle2 size={12} /> PRÉCISION ÉLITE
                                  DÉTECTÉE
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center p-6 bg-slate-50/50 dark:bg-slate-900/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center gap-3 relative group">
                              <div className="flex flex-col items-center justify-center gap-1 text-slate-400">
                                <AlertCircle
                                  size={20}
                                  className="text-indigo-400 animate-pulse"
                                />
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  En attente de tirage
                                </span>
                              </div>
                              <div
                                className="w-full max-w-[200px]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <select
                                  onChange={async (e) => {
                                    const targetResultId = e.target.value;
                                    if (targetResultId) {
                                      audioEngine.play("click");
                                      await linkPredictionToResult(
                                        item.id,
                                        targetResultId,
                                      );
                                      showToast(
                                        "Prédiction liée avec succès !",
                                        "success",
                                      );
                                      audioEngine.play("success");
                                      loadData();
                                    }
                                  }}
                                  className="w-full text-[10px] font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl px-2 py-1.5 border border-slate-200 dark:border-slate-700 outline-none cursor-pointer shadow-sm transition-all"
                                >
                                  <option value="">
                                    Associer manuellement...
                                  </option>
                                  {results.slice(0, 15).map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {new Date(r.date).toLocaleDateString(
                                        "fr-FR",
                                      )}{" "}
                                      - {r.gagnants.join(", ")}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <button
                                onClick={(e) => handleDelete(e, item.id)}
                                className="text-[9px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-600 flex items-center gap-1 transition-colors mt-1"
                              >
                                <Trash2 size={10} /> Supprimer
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div
                          className="border-t border-slate-100 dark:border-slate-800 p-4 cursor-default bg-slate-50/30 dark:bg-slate-950/20"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-1 pb-4 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                              <Activity size={14} className="text-indigo-500" />
                              <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                                Analyse Structurelle Prédiction
                              </span>
                            </div>
                            {item.prediction.diversityMetrics && (
                              <div className="text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                Orthogonalité ADN :{" "}
                                {(
                                  item.prediction.diversityMetrics
                                    .diversityScore * 100
                                ).toFixed(0)}
                                %
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                            <div>
                              <TicketXRay
                                numbers={item.prediction.suggestedNumbers}
                                score={item.prediction.confidence}
                                showTitle={false}
                              />
                            </div>
                            {res ? (
                              <div className="p-4 md:p-6 bg-slate-900 rounded-2xl md:rounded-[2rem] border border-indigo-500/30">
                                <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
                                  <h5 className="text-[10px] md:text-xs font-black text-indigo-400 uppercase tracking-widest">
                                    Distribution Spatiale
                                  </h5>
                                  <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                                    {hits.length} HITS / 5
                                  </span>
                                </div>
                                <div className="grid grid-cols-10 gap-1">
                                  {Array.from({ length: 90 }, (_, index) => {
                                    const num = index + 1;
                                    const isPred =
                                      item.prediction.suggestedNumbers.includes(
                                        num,
                                      );
                                    const isAct = res.gagnants.includes(num);
                                    const isHit = isPred && isAct;
                                    const isNearMiss =
                                      !isHit &&
                                      isPred &&
                                      res.gagnants.some(
                                        (gn) => Math.abs(gn - num) === 1,
                                      );

                                    let bg =
                                      "bg-slate-800/40 text-[7px] text-slate-600 border border-transparent";
                                    if (isHit) {
                                      bg =
                                        "bg-emerald-500 text-white font-black scale-105 z-10 border border-emerald-300";
                                    } else if (isPred) {
                                      bg =
                                        "bg-indigo-500 text-white font-semibold border border-indigo-400";
                                    } else if (isAct) {
                                      bg =
                                        "bg-rose-500/20 text-rose-300 border border-rose-500/30";
                                    } else if (isNearMiss) {
                                      bg =
                                        "bg-amber-500/25 text-amber-300 border border-amber-500/30 animate-pulse";
                                    }

                                    return (
                                      <div
                                        key={num}
                                        title={`Numéro ${num}${isHit ? " - HIT!" : isPred ? " - Prédit" : isAct ? " - Gagnant" : isNearMiss ? " - Proche" : ""}`}
                                        className={`aspect-square rounded flex items-center justify-center text-[7px] md:text-[8px] transition-all duration-300 ${bg}`}
                                      >
                                        {num}
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-4 justify-center text-[8px] font-bold text-slate-400 uppercase">
                                  <div className="flex items-center gap-1">
                                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></div>{" "}
                                    Hit
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <div className="w-2.5 h-2.5 bg-indigo-500 rounded-sm"></div>{" "}
                                    Prédit
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <div className="w-2.5 h-2.5 bg-rose-500/20 border border-rose-500/30 rounded-sm"></div>{" "}
                                    Gagnant
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <div className="w-2.5 h-2.5 bg-amber-500/20 border border-amber-500/30 rounded-sm"></div>{" "}
                                    Near Miss
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="p-6 bg-slate-900 rounded-2xl md:rounded-[2rem] border border-dashed border-indigo-500/20 flex flex-col items-center justify-center text-center text-slate-500 min-h-[180px]">
                                <Clock
                                  size={32}
                                  className="text-indigo-500/40 mb-3 animate-pulse"
                                />
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                  Tirage en attente d'association
                                </span>
                                <p className="text-[9px] text-slate-500 max-w-[200px] mt-1">
                                  Dès que ce tirage aura lieu ou sera associé
                                  manuellement, sa cartographie spatiale
                                  s'affichera ici.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {forensicReport && (
        <PredictionForensics
          report={forensicReport}
          onClose={() => {
            audioEngine.play("click");
            setForensicReport(null);
          }}
        />
      )}
    </div>
  );
};
