import React, { useState, useEffect, useMemo, useCallback } from "react";
import { DrawResult, AlgoWeights } from "../../types";
import { NumberBall } from "../NumberBall";
import { useNexusStore } from "../../store/useNexusStore";
import {
  Dna,
  Search,
  Activity,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Zap,
  TrendingUp,
  Cpu,
  RefreshCw,
  Eye,
  Sliders,
  ShieldAlert,
  ArrowRight,
  Fingerprint,
  Layers,
  ChevronRight,
  Info,
} from "lucide-react";
import {
  getOrReconstructWinningNumbersDna,
  getPredictionDnaLogs,
  type NumberDnaAttribution,
  type PredictionDnaAuditLog,
} from "../../services/prediction/dnaAuditLogService";
import { formatDate } from "../../services/lotteryService";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { audioEngine } from "../../utils/audioEngine";
import { useToast } from "../ui/Toast";

interface DrawDnaHistoryViewerProps {
  drawName: string;
  history: DrawResult[];
  initialDrawId?: string;
  onClose?: () => void;
}

export const DrawDnaHistoryViewer: React.FC<DrawDnaHistoryViewerProps> = ({
  drawName,
  history,
  initialDrawId,
  onClose,
}) => {
  const { showToast } = useToast();
  const globalWeights = useNexusStore((state) => state.globalWeights);

  const cleanHistory = useMemo(() => {
    return purifyHistoryForDraw(drawName, history);
  }, [drawName, history]);

  const [selectedDrawIndex, setSelectedDrawIndex] = useState<number>(0);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [attributions, setAttributions] = useState<Record<number, NumberDnaAttribution>>({});
  const [dnaLogs, setDnaLogs] = useState<PredictionDnaAuditLog[]>([]);
  const [filterText, setFilterText] = useState("");

  // Initialize selected draw
  useEffect(() => {
    if (initialDrawId && cleanHistory.length > 0) {
      const idx = cleanHistory.findIndex((d) => d.id === initialDrawId);
      if (idx >= 0) {
        setSelectedDrawIndex(idx);
      }
    }
  }, [initialDrawId, cleanHistory]);

  const selectedDraw = cleanHistory[selectedDrawIndex] || cleanHistory[0];

  // Fetch DNA logs and compute attribution for current selected draw
  const fetchAttribution = useCallback(async () => {
    if (!selectedDraw) return;
    setLoading(true);
    try {
      const logs = await getPredictionDnaLogs(drawName);
      setDnaLogs(logs);

      const attr = await getOrReconstructWinningNumbersDna(
        drawName,
        selectedDraw,
        cleanHistory,
        globalWeights
      );
      setAttributions(attr);

      // Par défaut, sélectionner le 1er numéro gagnant
      if (selectedDraw.gagnants && selectedDraw.gagnants.length > 0) {
        setSelectedNumber((prev) =>
          prev && selectedDraw.gagnants.includes(prev) ? prev : selectedDraw.gagnants[0]
        );
      }
    } catch (err) {
      console.error("[DrawDnaHistoryViewer] Erreur:", err);
      showToast("Erreur de chargement de l'ADN prédictif", "error");
    } finally {
      setLoading(false);
    }
  }, [drawName, selectedDraw, cleanHistory, globalWeights, showToast]);

  useEffect(() => {
    fetchAttribution();
  }, [fetchAttribution]);

  // Associated audit log if found
  const matchedAuditLog = useMemo(() => {
    if (!selectedDraw || dnaLogs.length === 0) return null;
    return (
      dnaLogs.find(
        (l) =>
          l.drawResultId === selectedDraw.id ||
          (l.actualWinningNumbers &&
            l.actualWinningNumbers.length === selectedDraw.gagnants.length &&
            l.actualWinningNumbers.every((n, i) => n === selectedDraw.gagnants[i]))
      ) || dnaLogs[0]
    );
  }, [selectedDraw, dnaLogs]);

  // Filtered draw history list for navigation sidebar
  const filteredDraws = useMemo(() => {
    if (!filterText.trim()) return cleanHistory.slice(0, 30);
    const q = filterText.toLowerCase();
    return cleanHistory
      .filter((d) => d.date.includes(q) || d.gagnants.some((g) => g.toString() === q))
      .slice(0, 30);
  }, [cleanHistory, filterText]);

  const activeAttr = selectedNumber ? attributions[selectedNumber] : null;

  const getCategoryBadge = (cat: NumberDnaAttribution["causalCategory"]) => {
    switch (cat) {
      case "DIRECT_HIT":
        return {
          label: "Impact Direct (Hit Prédit)",
          color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
          icon: CheckCircle2,
        };
      case "RESONANT_HARMONIC":
        return {
          label: "Résonance Harmonique (FFT)",
          color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
          icon: Zap,
        };
      case "GAP_RECOVERY":
        return {
          label: "Comblement de Cycle (Gaps)",
          color: "bg-sky-500/20 text-sky-400 border-sky-500/30",
          icon: TrendingUp,
        };
      case "MARKOV_TRANSITION":
        return {
          label: "Transition Markovienne",
          color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
          icon: Cpu,
        };
      case "NOISE_ATTRIBUTED":
      default:
        return {
          label: "Stochastique Composite",
          color: "bg-slate-700/50 text-slate-300 border-slate-600/40",
          icon: Activity,
        };
    }
  };

  return (
    <div className="bg-slate-950/95 border border-slate-800 rounded-3xl p-5 md:p-8 shadow-2xl space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-6 border-b border-slate-800/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-purple-600/20 text-purple-400 border border-purple-500/30 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5">
              <Dna size={12} className="animate-spin-slow" />
              Observatoire ADN Post-Tirage
            </span>
            <span className="text-[10px] font-mono text-slate-500 uppercase">
              Tirage Isolé : {drawName}
            </span>
          </div>
          <h3 className="text-xl md:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            Visualiseur d'Historique ADN Prédictif
          </h3>
          <p className="text-xs text-slate-400 max-w-2xl">
            Rétro-ingénierie continue : identification de l'ADN génomique et de l'algorithme
            dominant ayant activé chaque numéro gagnant lors du tirage.
          </p>
        </div>

        {/* Action button if needed */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              audioEngine.play("click");
              fetchAttribution();
            }}
            className="flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Réactualiser l'ADN</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-2 bg-slate-900 hover:bg-rose-950/50 border border-slate-800 hover:border-rose-700/50 text-slate-400 hover:text-rose-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Fermer
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Selector Left + Deep Inspector Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Colonne Gauche: Sélecteur de Tirages Passés (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers size={13} /> Tirages Archivés
              </span>
              <span className="text-[10px] font-mono text-indigo-400">
                {cleanHistory.length} tirages
              </span>
            </div>

            {/* Barre de Recherche */}
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                placeholder="Rechercher date ou numéro..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Liste des Tirages Scrollable */}
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
              {filteredDraws.map((draw, idx) => {
                const realIndex = cleanHistory.findIndex((d) => d.id === draw.id);
                const isSelected = realIndex === selectedDrawIndex;
                const seq = cleanHistory.length - realIndex;

                return (
                  <button
                    key={draw.id || `${draw.date}-${idx}`}
                    onClick={() => {
                      audioEngine.play("click");
                      setSelectedDrawIndex(realIndex >= 0 ? realIndex : 0);
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600/20 border-indigo-500/50 shadow-md ring-1 ring-indigo-500/30"
                        : "bg-slate-950/60 border-slate-850 hover:bg-slate-900 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-mono font-black text-indigo-400 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-900/50">
                        #T-{seq}
                      </span>
                      <span className="text-xs font-bold text-slate-300">
                        {formatDate(draw.date)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {draw.gagnants.map((n, i) => (
                        <span
                          key={`${n}-${i}`}
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-black ${
                            isSelected
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Colonne Droite: Inspecteur ADN Détaillé du Tirage Sélectionné (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {selectedDraw ? (
            <>
              {/* Carte Sommaire du Tirage & Empreinte ADN */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-black text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded-lg border border-indigo-800/40">
                        SÉQUENCE #{cleanHistory.length - selectedDrawIndex}
                      </span>
                      <span className="text-sm font-bold text-white">
                        Tirage du {formatDate(selectedDraw.date)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                      <Fingerprint size={12} className="text-purple-400" />
                      <span>Empreinte ADN Inactive/Active :</span>
                      <span className="font-mono text-purple-300">
                        {matchedAuditLog?.dnaFingerprint || "DNA_CANONICAL_SYNCHRONIZED"}
                      </span>
                    </div>
                  </div>

                  {matchedAuditLog?.driftScore !== undefined && (
                    <div className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-right">
                      <div className="text-[9px] font-black uppercase text-slate-500">
                        Indice de Dérive
                      </div>
                      <div
                        className={`text-sm font-mono font-black ${
                          matchedAuditLog.driftScore < 20
                            ? "text-emerald-400"
                            : matchedAuditLog.driftScore < 45
                            ? "text-amber-400"
                            : "text-rose-400"
                        }`}
                      >
                        {matchedAuditLog.driftScore}%
                      </div>
                    </div>
                  )}
                </div>

                {/* Sélection des Numéros Gagnants du Tirage */}
                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Numéros Gagnants Sortis (Cliquez pour inspecter l'ADN sous-jacent) :
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {selectedDraw.gagnants.map((num) => {
                      const isSel = selectedNumber === num;
                      const attr = attributions[num];
                      const isHit = attr?.isHit;

                      return (
                        <button
                          key={num}
                          onClick={() => {
                            audioEngine.play("click");
                            setSelectedNumber(num);
                          }}
                          className={`relative p-1.5 rounded-2xl transition-all duration-300 flex items-center gap-2.5 cursor-pointer border ${
                            isSel
                              ? "bg-indigo-600/30 border-indigo-400 ring-2 ring-indigo-500/50 scale-105"
                              : "bg-slate-950 border-slate-800 hover:border-slate-700 hover:bg-slate-900"
                          }`}
                        >
                          <NumberBall number={num} size="md" />
                          <div className="text-left pr-2">
                            <div className="text-[10px] font-bold text-white flex items-center gap-1">
                              <span>N° {num}</span>
                              {isHit && (
                                <CheckCircle2 size={12} className="text-emerald-400" />
                              )}
                            </div>
                            <div className="text-[9px] font-mono text-indigo-300 max-w-[90px] truncate">
                              {attr?.dominantAlgoLabel || "Calcul..."}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Fiche d'Analyse Micro-ADN du Numéro Sélectionné */}
              {activeAttr && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
                  {/* Titre & Catégorisation */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <NumberBall number={activeAttr.number} size="lg" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-lg font-black text-white">
                            Profil ADN du Numéro {activeAttr.number}
                          </h4>
                          {(() => {
                            const badge = getCategoryBadge(activeAttr.causalCategory);
                            const Icon = badge.icon;
                            return (
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 ${badge.color}`}
                              >
                                <Icon size={11} />
                                {badge.label}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {activeAttr.explanation}
                        </p>
                      </div>
                    </div>

                    <div className="text-right sm:border-l sm:border-slate-800 sm:pl-4">
                      <div className="text-[9px] font-black uppercase text-slate-500">
                        Puissance Spectrale
                      </div>
                      <div className="text-base font-mono font-black text-purple-400">
                        {activeAttr.spectralPower.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Décomposition Micro-ADN par Algorithme */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-400">
                      <span>Vecteur de Contribution Algorithmique (Micro-ADN)</span>
                      <span className="font-mono text-indigo-400">
                        Algorithme Dominant : {activeAttr.dominantAlgoLabel} (
                        {activeAttr.dominantWeight.toFixed(1)}%)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.entries(activeAttr.microDna).map(([algo, weight]) => {
                        const isDominant = algo === activeAttr.dominantAlgo;
                        return (
                          <div
                            key={algo}
                            className={`p-3 rounded-xl border transition-all ${
                              isDominant
                                ? "bg-indigo-950/40 border-indigo-500/40 shadow-sm"
                                : "bg-slate-950/60 border-slate-850"
                            }`}
                          >
                            <div className="flex justify-between items-center mb-1.5 text-xs">
                              <span
                                className={`font-bold truncate ${
                                  isDominant ? "text-indigo-300" : "text-slate-300"
                                }`}
                              >
                                {algo}
                              </span>
                              <span
                                className={`font-mono font-black ${
                                  isDominant ? "text-indigo-400" : "text-slate-400"
                                }`}
                              >
                                {weight.toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  isDominant
                                    ? "bg-gradient-to-r from-indigo-500 to-purple-500"
                                    : "bg-slate-600"
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, weight))}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Note de Synthèse Méthodologique */}
                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 flex items-start gap-3">
                    <Info size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-400 leading-relaxed">
                      <strong className="text-slate-200">Traçabilité & Déterminisme :</strong>{" "}
                      L'empreinte ADN de chaque numéro est extraite à partir de l'état antécédent
                      du modèle avant la date du tirage ({formatDate(selectedDraw.date)}). Aucun
                      hasard ni nombre magique n'est utilisé dans la décomposition.
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400">
              Aucun tirage disponible pour ce jeu.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default DrawDnaHistoryViewer;
