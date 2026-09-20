import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  INTER_DRAW_FAMILIES,
  InterDrawFamilyConfig,
  InterDrawFamilyId,
  InterDrawSequenceItem,
  getInterDrawFamiliesForDraw,
  getPrimaryInterDrawFamily,
  normalizeDrawName
} from "../../constants";
import {
  generateInterDrawReport,
  simulateInterDrawTransmission,
  InterDrawReport,
  getMirrorNumber,
  getComplement90,
  InterDrawCandidateScore,
  InterDrawPairCombination
} from "../../services/interDrawService";
import { NumberBall } from "../NumberBall";
import { audioEngine } from "../../utils/audioEngine";
import { formatDateSafely, isDrawToday } from "../../utils/dateUtils";
import { useNexusStore } from "../../store/useNexusStore";
import { useToast } from "../ui/Toast";
import { InterDrawCooccurrenceView } from "../interdraw/InterDrawCooccurrenceView";
import { InterDrawPatternView } from "../interdraw/InterDrawPatternView";
import {
  GitBranch,
  ArrowRight,
  TrendingUp,
  RotateCcw,
  Sparkles,
  Zap,
  ShieldCheck,
  Layers,
  ArrowUpRight,
  Sliders,
  Play,
  CheckCircle2,
  Calendar,
  Clock,
  Info,
  Network,
  Activity,
  BarChart3,
  Repeat,
  Gauge
} from "lucide-react";

interface InterDrawRelationsTabProps {
  drawName: string;
  onSelectDraw?: (drawName: string) => void;
}

export const InterDrawRelationsTab: React.FC<InterDrawRelationsTabProps> = ({
  drawName,
  onSelectDraw
}) => {
  // Détection de la famille du tirage actif
  const availableFamilies = useMemo(() => getInterDrawFamiliesForDraw(drawName), [drawName]);
  const primaryFamily = useMemo(() => getPrimaryInterDrawFamily(drawName), [drawName]);

  // Store Nexus pour synchronisation réactive et rafraîchissement global
  const storeHistory = useNexusStore((state) => state.history);
  const storeDrawName = useNexusStore((state) => state.drawName);
  const refreshData = useNexusStore((state) => state.refreshData);
  const { showToast } = useToast();

  // État de la famille sélectionnée (par défaut la famille du tirage, ou 10H/16H/Dim19H55)
  const [selectedFamilyId, setSelectedFamilyId] = useState<InterDrawFamilyId>(() => {
    if (availableFamilies.length > 0) return availableFamilies[0].id;
    return 'FAMILY_10H_16H_SUN19H55';
  });

  // Si le tirage change et a une famille différente, mettre à jour la sélection
  useEffect(() => {
    if (availableFamilies.length > 0 && !availableFamilies.some(f => f.id === selectedFamilyId)) {
      setSelectedFamilyId(availableFamilies[0].id);
    }
  }, [drawName, availableFamilies, selectedFamilyId]);

  const activeFamily = INTER_DRAW_FAMILIES[selectedFamilyId];

  // Tirage actuellement ciblé dans la famille (si le tirage actif n'est pas dans la famille, prendre le 1er)
  const effectiveTargetDraw = useMemo(() => {
    if (!activeFamily?.sequence || activeFamily.sequence.length === 0) {
      return drawName || '';
    }
    const norm = normalizeDrawName(drawName);
    const inFamily = activeFamily.sequence.some(s => s && normalizeDrawName(s.name) === norm);
    return inFamily ? drawName : (activeFamily.sequence[0]?.name || drawName);
  }, [drawName, activeFamily]);

  const [targetDraw, setTargetDraw] = useState<string>(effectiveTargetDraw);

  useEffect(() => {
    setTargetDraw(effectiveTargetDraw);
  }, [effectiveTargetDraw]);

  // Chargement du rapport
  const [report, setReport] = useState<InterDrawReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [subView, setSubView] = useState<'OVERVIEW' | 'COOCCURRENCES' | 'PATTERNS' | 'SIMULATOR'>('OVERVIEW');

  const loadReport = useCallback(async (forcedTarget: string, famId: InterDrawFamilyId, forceRefresh: boolean = false) => {
    setLoading(true);
    try {
      const data = await generateInterDrawReport(forcedTarget, famId, forceRefresh);
      setReport(data);
    } catch (e) {
      console.error("[InterDrawRelations] Erreur lors du chargement du rapport:", e);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReport(targetDraw, selectedFamilyId, false);
  }, [targetDraw, selectedFamilyId, loadReport]);

  // Empreinte réactive des données du store
  const storeSignature = useMemo(() => {
    if (!storeHistory || storeHistory.length === 0) return "";
    const first = storeHistory[0];
    return `${storeDrawName}:${storeHistory.length}:${first.id || ''}:${first.date || ''}:${(first.gagnants || []).join('-')}`;
  }, [storeHistory, storeDrawName]);

  // Synchronisation réactive : Recharger automatiquement le flux inter-tirages
  // dès qu'un nouveau tirage de la famille est enregistré dans le store.
  useEffect(() => {
    if (!storeSignature) return;
    const storeNorm = normalizeDrawName(storeDrawName);
    const isFamilyDraw = activeFamily?.sequence?.some(
      (s) => s && normalizeDrawName(s.name) === storeNorm
    );
    if (isFamilyDraw) {
      loadReport(targetDraw, selectedFamilyId, true);
    }
  }, [storeSignature, activeFamily, storeDrawName, targetDraw, selectedFamilyId, loadReport]);

  // Rafraîchissement réseau forcé (Bypass cache)
  const handleRefresh = async () => {
    audioEngine.play("scan");
    setIsRefreshing(true);
    try {
      await Promise.all([
        loadReport(targetDraw, selectedFamilyId, true),
        refreshData(targetDraw, true)
      ]);
      showToast("Actualisation forcée effectuée : Historique distant et flux inter-tirages synchronisés.", "success");
    } catch (e) {
      console.error("Erreur lors de l'actualisation forcée:", e);
      showToast("Erreur lors du rafraîchissement réseau.", "error");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Simulateur interactif
  const [selectedSourceNum, setSelectedSourceNum] = useState<number | null>(null);
  const [simInput, setSimInput] = useState<string>("");
  const [simResult, setSimResult] = useState<{
    candidates: InterDrawCandidateScore[];
    recommendedPairs: InterDrawPairCombination[];
    harmonicResonances: { from: number; to: number; type: 'MIROIR' | 'COMPLEMENT' }[];
    cooccurrenceMetrics?: any;
    patternMetrics?: any;
  } | null>(null);
  const [simulating, setSimulating] = useState<boolean>(false);

  // Initialisation du simulateur avec les derniers numéros réels du prédécesseur
  useEffect(() => {
    if (report?.predecessorResult?.gagnants) {
      setSimInput(report.predecessorResult.gagnants.join(", "));
    }
  }, [report]);

  const runSimulation = async () => {
    if (!simInput) return;
    audioEngine.play("click");
    setSimulating(true);

    const parsed = simInput
      .split(/[\s,;-]+/)
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n >= 1 && n <= 90);

    const unique = Array.from(new Set(parsed)).slice(0, 5);
    if (unique.length === 0) {
      setSimulating(false);
      return;
    }

    try {
      const res = await simulateInterDrawTransmission(targetDraw, unique, selectedFamilyId);
      setSimResult(res);
    } catch (e) {
      console.error("Simulation error:", e);
    } finally {
      setSimulating(false);
    }
  };

  const handleLoadRealPredecessor = () => {
    if (report?.predecessorResult?.gagnants) {
      audioEngine.play("click");
      setSimInput(report.predecessorResult.gagnants.join(", "));
      runSimulation();
    }
  };

  return (
    <div className="w-full space-y-6 pb-12 animate-fade-in font-sans text-slate-800 dark:text-slate-100">
      {/* 1. SÉLECTEUR DES 3 FAMILLES ÉTANCHES */}
      <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 dark:text-indigo-400 font-black text-[10px] rounded-lg uppercase tracking-wider">
              <GitBranch size={13} className="animate-pulse" />
              Topologie Stochastique Inter-Tirages
            </div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-white mt-1">
              Cadre des Relations Inter-Tirages
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Modélisation des transmissions markoviennes, reports directs (carry-over) et résonances harmoniques par famille fermée.
            </p>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-2 border border-slate-200 dark:border-white/5 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw size={14} className={isRefreshing ? "animate-spin text-indigo-500" : ""} />
            <span>Actualiser</span>
          </button>
        </div>

        {/* ONGLETS DES 3 FAMILLES */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {Object.values(INTER_DRAW_FAMILIES).map((fam) => {
            const isSelected = selectedFamilyId === fam.id;
            const isDrawInFam = fam.drawNames.some(d => normalizeDrawName(d) === normalizeDrawName(drawName));

            return (
              <button
                key={fam.id}
                onClick={() => {
                  audioEngine.play("click");
                  setSelectedFamilyId(fam.id);
                  // Si le tirage actif est dans cette famille, le cibler, sinon le premier
                  if (isDrawInFam) {
                    setTargetDraw(drawName);
                  } else {
                    setTargetDraw(fam.sequence[0]?.name || drawName);
                  }
                }}
                className={`
                  p-4 rounded-2xl border text-left transition-all duration-300 relative cursor-pointer flex flex-col justify-between
                  ${isSelected
                    ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 dark:border-indigo-400 shadow-md ring-1 ring-indigo-500/20"
                    : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20"
                  }
                `}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{fam.icon}</span>
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider block text-slate-900 dark:text-white">
                        {fam.label}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                        {fam.slotsSummary}
                      </span>
                    </div>
                  </div>
                  {isDrawInFam && (
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[9px] font-black rounded uppercase">
                      Tirage Actif
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-3 line-clamp-2 leading-relaxed">
                  {fam.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. RUBAN DU CYCLE CHRONOLOGIQUE DANS LA FAMILLE */}
      <div className="bg-white/80 dark:bg-slate-900/80 p-5 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-indigo-500" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Cycle Chronologique ({activeFamily.sequence.length} tirages interconnectés)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Cliquez sur un tirage pour examiner ses flux directs
          </span>
        </div>

        <div className="overflow-x-auto scrollbar-hide py-2">
          <div className="flex items-center gap-2 min-w-max">
            {activeFamily?.sequence?.map((item, idx) => {
              const isTarget = normalizeDrawName(item.name) === normalizeDrawName(targetDraw);
              const isPred = !!report?.predecessor?.name && normalizeDrawName(item.name) === normalizeDrawName(report.predecessor.name);
              const isSucc = !!report?.successor?.name && normalizeDrawName(item.name) === normalizeDrawName(report.successor.name);

              return (
                <React.Fragment key={`${item.day}-${item.time}-${item.name}`}>
                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setTargetDraw(item.name);
                      if (onSelectDraw) {
                        onSelectDraw(item.name);
                      }
                    }}
                    className={`
                      px-3.5 py-2.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col items-start
                      ${isTarget
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/30 scale-105 ring-2 ring-indigo-400"
                        : isPred
                        ? "bg-amber-500/10 dark:bg-amber-950/40 border-amber-500/40 text-amber-900 dark:text-amber-200"
                        : isSucc
                        ? "bg-sky-500/10 dark:bg-sky-950/40 border-sky-500/40 text-sky-900 dark:text-sky-200"
                        : "bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20 text-slate-700 dark:text-slate-300"
                      }
                    `}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] opacity-80 font-bold uppercase">
                      <span>{item.day.slice(0, 3)}</span>
                      <span>•</span>
                      <span>{item.time}</span>
                    </div>
                    <span className="text-xs font-black tracking-tight mt-0.5 whitespace-nowrap">
                      {item.name}
                    </span>
                    {isPred && (
                      <span className="text-[8px] font-black uppercase text-amber-600 dark:text-amber-400 mt-1">
                        ← Prédécesseur
                      </span>
                    )}
                    {isSucc && (
                      <span className="text-[8px] font-black uppercase text-sky-600 dark:text-sky-400 mt-1">
                        Successeur →
                      </span>
                    )}
                    {isTarget && (
                      <span className="text-[8px] font-black uppercase text-white/90 mt-1">
                        ★ Cible Active
                      </span>
                    )}
                  </button>

                  {idx < activeFamily.sequence.length - 1 && (
                    <ArrowRight size={12} className="text-slate-400 flex-shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. SUB-NAVIGATION : VUE GLOBALE / COOCCURRENCES / PATTERNS / SIMULATEUR */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => {
            audioEngine.play("click");
            setSubView('OVERVIEW');
          }}
          className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            subView === 'OVERVIEW'
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-102"
              : "bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:border-slate-300"
          }`}
        >
          <Sparkles size={14} className={subView === 'OVERVIEW' ? 'animate-pulse' : 'text-amber-500'} />
          <span>Vue d'Ensemble & Inférence</span>
        </button>

        <button
          onClick={() => {
            audioEngine.play("click");
            setSubView('COOCCURRENCES');
          }}
          className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            subView === 'COOCCURRENCES'
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-102"
              : "bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:border-slate-300"
          }`}
        >
          <Zap size={14} className={subView === 'COOCCURRENCES' ? 'animate-pulse' : 'text-amber-500'} />
          <span>Détecteur de Cooccurrences</span>
          {report?.cooccurrenceMetrics && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[9px] font-mono font-bold">
              {report.cooccurrenceMetrics.topConditionedPairs.length} paires
            </span>
          )}
        </button>

        <button
          onClick={() => {
            audioEngine.play("click");
            setSubView('PATTERNS');
          }}
          className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            subView === 'PATTERNS'
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-102"
              : "bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:border-slate-300"
          }`}
        >
          <Network size={14} className={subView === 'PATTERNS' ? 'animate-pulse' : 'text-purple-500'} />
          <span>Détecteur de Patterns Structurels</span>
          <span className="px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[9px] font-mono font-bold">
            5 Modules
          </span>
        </button>

        <button
          onClick={() => {
            audioEngine.play("click");
            setSubView('SIMULATOR');
          }}
          className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            subView === 'SIMULATOR'
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-102"
              : "bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:border-slate-300"
          }`}
        >
          <Sliders size={14} className={subView === 'SIMULATOR' ? 'animate-pulse' : 'text-indigo-400'} />
          <span>Simulateur Stochastique</span>
        </button>
      </div>

      {loading && !report ? (
        <div className="p-12 text-center bg-white/50 dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-white/5">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Calcul de la matrice de transition stochastique...
          </p>
        </div>
      ) : report ? (
        <>
          {/* 3. FLUX TRIPTYQUE : PRÉDÉCESSEUR -> CIBLE -> SUCCESSEUR */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* CARTE PRÉDÉCESSEUR */}
            <div className="p-5 bg-white/80 dark:bg-slate-900/80 rounded-3xl border border-amber-500/30 dark:border-amber-500/20 shadow-lg relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    Source de Transmission (Prédécesseur)
                  </span>
                  <Clock size={13} className="text-amber-500" />
                </div>
                <h4 className="text-lg font-black text-slate-900 dark:text-white mt-2">
                  {report.predecessor?.name || 'Prédécesseur'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {report.predecessor?.day || ''} {report.predecessor?.time ? `à ${report.predecessor.time}` : ''}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-white/5 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider">
                      Derniers Numéros Gagnants Sortis
                    </span>
                    {report.predecessorResult?.date && (
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        <Calendar size={12} className="text-amber-500" />
                        <span>{formatDateSafely(report.predecessorResult.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </div>
                    )}
                  </div>

                  {/* Badge de statut du résultat affiché */}
                  {report.predecessorResult ? (
                    <div className="flex items-center">
                      {isDrawToday(report.predecessorResult.date) ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-xs">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          Résultat du jour
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shadow-xs">
                          <Clock size={12} className="text-amber-500 animate-pulse" />
                          Dernier résultat archivé - En attente de synchronisation
                        </span>
                      )}
                    </div>
                  ) : null}

                  {report.predecessorResult?.gagnants && report.predecessorResult.gagnants.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-0.5">
                      {report.predecessorResult.gagnants.map(num => (
                        <NumberBall key={`pred-${num}`} number={num} size="sm" />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Aucun résultat récent enregistré</p>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-white/5 text-[11px] text-slate-500 flex items-center justify-between">
                <span>Répétitions directes vers la cible :</span>
                <span className="font-mono font-bold text-amber-500">
                  {report.carryOverRate.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* CARTE TIRAGE CIBLE */}
            <div className="p-5 bg-gradient-to-b from-indigo-50/50 to-white dark:from-indigo-950/30 dark:to-slate-900/90 rounded-3xl border-2 border-indigo-500 dark:border-indigo-400 shadow-xl relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500 text-white">
                    Tirage Récepteur Analysé
                  </span>
                  <Sparkles size={14} className="text-indigo-500" />
                </div>
                <h4 className="text-xl font-black text-slate-900 dark:text-white mt-2">
                  {report.targetDraw}
                </h4>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold">
                  Position {report.currentIndex + 1} / {report.totalInFamily} dans la famille
                </p>

                {report.targetLatestResult && (
                  <div className="mt-3 pt-2.5 border-t border-indigo-200 dark:border-indigo-900/50 space-y-1.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                      <span className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <Calendar size={11} className="text-indigo-500" />
                        {formatDateSafely(report.targetLatestResult.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      {isDrawToday(report.targetLatestResult.date) ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 size={10} className="text-emerald-500" />
                          Résultat du jour
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                          <Clock size={10} className="text-amber-500" />
                          Dernier résultat archivé - En attente de synchronisation
                        </span>
                      )}
                    </div>
                    {report.targetLatestResult.gagnants && report.targetLatestResult.gagnants.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {report.targetLatestResult.gagnants.map(num => (
                          <NumberBall key={`target-last-${num}`} number={num} size="xs" />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 p-3 bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-white/5 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Lift de Report Direct (Carry-Over) :</span>
                    <span className={`font-black font-mono ${report.carryOverLift >= 1 ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {report.carryOverLift.toFixed(2)}x
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Paires analysées chronologiquement :</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">
                      {report.totalDrawsAnalyzed} cycles
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-white/5 flex items-center justify-between text-xs font-bold text-indigo-600 dark:text-indigo-400">
                <span>Flux de transition actif</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* CARTE SUCCESSEUR */}
            <div className="p-5 bg-white/80 dark:bg-slate-900/80 rounded-3xl border border-sky-500/30 dark:border-sky-500/20 shadow-lg relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                    Prochaine Étape (Successeur)
                  </span>
                  <Clock size={13} className="text-sky-500" />
                </div>
                <h4 className="text-lg font-black text-slate-900 dark:text-white mt-2">
                  {report.successor?.name || 'Successeur'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {report.successor?.day || ''} {report.successor?.time ? `à ${report.successor.time}` : ''}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-white/5">
                  <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block mb-2">
                    Rôle dans la boucle
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Les numéros tirés dans <strong className="text-slate-800 dark:text-slate-200">{report.targetDraw}</strong> transmettront immédiatement leur dynamique markovienne à <strong className="text-slate-800 dark:text-slate-200">{report.successor?.name || 'Successeur'}</strong>.
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-white/5 text-[11px] text-slate-500 flex items-center justify-between">
                <span>Continuité du cycle :</span>
                <span className="font-mono font-bold text-sky-500">100% Hermétique</span>
              </div>
            </div>
          </div>

          {/* 3.5. NOYAU DE HAWKES CROISÉ VECTORISÉ (PROCESSUS PONCTUEL AUTO & MUTUELLEMENT EXCITATEUR) */}
          {report.hawkesMetrics && (
            <div className="bg-white/80 dark:bg-slate-900/80 p-5 rounded-3xl border border-rose-500/30 dark:border-rose-500/20 backdrop-blur-xl shadow-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-rose-500" />
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    Noyau de Hawkes Croisé Vectorisé Multi-Lags
                  </h4>
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    SIMD WASM
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  Décroissance : β = {report.hawkesMetrics.betaDecay.toFixed(4)} (t½ = 1.5 tirages)
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-rose-50/50 dark:bg-rose-950/20 rounded-2xl border border-rose-500/20">
                  <span className="text-[9px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 block">
                    Énergie Totale d'Excitation
                  </span>
                  <span className="text-base font-black font-mono text-slate-900 dark:text-white mt-0.5 block">
                    {report.hawkesMetrics.totalEnergy.toFixed(3)}
                  </span>
                </div>

                {report.hawkesMetrics.lagExcitations.slice(0, 3).map((exc, lIdx) => (
                  <div key={`lag-exc-${lIdx}`} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-white/5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
                      Lag {lIdx === 0 ? 't-1 (Direct)' : `t-${lIdx + 1}`}
                    </span>
                    <div className="flex items-baseline justify-between mt-0.5">
                      <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                        {exc.toFixed(3)}
                      </span>
                      <span className="text-[9px] font-mono text-rose-500 font-bold">
                        {report.hawkesMetrics!.totalEnergy > 0 ? `${Math.round((exc / report.hawkesMetrics!.totalEnergy) * 100)}%` : '0%'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SPOTLIGHTS VUE GLOBALE : COOCCURRENCES & PATTERNS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* SPOTLIGHT COOCCURRENCES */}
            <div className="p-5 bg-gradient-to-br from-amber-500/5 via-white/80 to-transparent dark:from-amber-500/10 dark:via-slate-900/80 dark:to-transparent rounded-3xl border border-amber-500/20 shadow-lg flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    Synergies d'Ordre 2
                  </span>
                  <Zap size={15} className="text-amber-500" />
                </div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white mt-2">
                  Top Cooccurrences Activées
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Paires dans {report.targetDraw} hautement catalysées par les numéros du prédécesseur.
                </p>

                {report.cooccurrenceMetrics && report.cooccurrenceMetrics.topConditionedPairs.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {report.cooccurrenceMetrics.topConditionedPairs.slice(0, 3).map((cp) => (
                      <div
                        key={`spot-cp-${cp.label}`}
                        className="px-2.5 py-1.5 bg-white/90 dark:bg-slate-800/90 rounded-xl border border-amber-500/20 flex items-center gap-1.5 text-xs shadow-xs"
                      >
                        <NumberBall number={cp.pair[0]} size="xs" />
                        <span className="text-slate-400 font-bold">+</span>
                        <NumberBall number={cp.pair[1]} size="xs" />
                        <span className="font-mono font-black text-amber-600 dark:text-amber-400 ml-1">
                          {cp.lift}x
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  audioEngine.play("click");
                  setSubView('COOCCURRENCES');
                }}
                className="w-full py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer border border-amber-500/20"
              >
                <span>Explorer le Détecteur de Cooccurrences</span>
                <ArrowRight size={13} />
              </button>
            </div>

            {/* SPOTLIGHT PATTERNS */}
            <div className="p-5 bg-gradient-to-br from-purple-500/5 via-white/80 to-transparent dark:from-purple-500/10 dark:via-slate-900/80 dark:to-transparent rounded-3xl border border-purple-500/20 shadow-lg flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                    Morphologie Combinatoire
                  </span>
                  <Network size={15} className="text-purple-500" />
                </div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white mt-2">
                  Patterns & Invariances Structurelles
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Dynamique de parité, flux de dizaines, cascades ±1 et régression barycentrique.
                </p>

                {report.patternMetrics && (
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                    <div className="p-1.5 bg-white/90 dark:bg-slate-800/90 rounded-xl border border-purple-500/20">
                      <span className="text-[8px] uppercase text-slate-400 font-bold block">Tendance Parité</span>
                      <span className="text-xs font-black text-purple-700 dark:text-purple-300 truncate block">
                        {report.patternMetrics.parity.tendencyLabel}
                      </span>
                    </div>
                    <div className="p-1.5 bg-white/90 dark:bg-slate-800/90 rounded-xl border border-purple-500/20">
                      <span className="text-[8px] uppercase text-slate-400 font-bold block">Cascade ±1</span>
                      <span className="text-xs font-black text-purple-700 dark:text-purple-300 block">
                        {report.patternMetrics.cascade.overallCascadeLift}x
                      </span>
                    </div>
                    <div className="p-1.5 bg-white/90 dark:bg-slate-800/90 rounded-xl border border-purple-500/20">
                      <span className="text-[8px] uppercase text-slate-400 font-bold block">Somme Cible</span>
                      <span className="text-xs font-black text-purple-700 dark:text-purple-300 block">
                        {report.patternMetrics.centroid.projectedSumRange.optimal}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  audioEngine.play("click");
                  setSubView('PATTERNS');
                }}
                className="w-full py-2 px-3 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer border border-purple-500/20"
              >
                <span>Explorer le Détecteur de Patterns</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>

          {/* 4. TOP NUMÉROS RECOMMANDÉS PAR FLUX INTER-TIRAGES */}
          <div className="bg-white/80 dark:bg-slate-900/80 p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
              <div>
                <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-500" />
                  Top Numéros Portés par la Dynamique Inter-Tirages
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Synthèse continue combinant les probabilités de transition Markov, les reports directs et les résonances harmoniques.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {report.topCandidates.map((c, index) => (
                <div
                  key={`candidate-${c.number}`}
                  className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-white/5 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-black text-slate-400 w-4">
                      #{index + 1}
                    </span>
                    <NumberBall number={c.number} size="md" />
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-sm text-slate-900 dark:text-white">
                          Numéro {c.number < 10 ? `0${c.number}` : c.number}
                        </span>
                        {c.flags.map(f => (
                          <span
                            key={f}
                            className={`
                              text-[8px] font-black uppercase px-1.5 py-0.5 rounded
                              ${f === 'REPORT_DIRECT'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                : f === 'MIROIR_DECIMAL'
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                                : f === 'COMPLEMENT_90'
                                ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                                : f === 'HAWKES_EXCITATION'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                : f === 'HAWKES_REMANENCE'
                                ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              }
                            `}
                          >
                            {f.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2.5 mt-1 text-[10px] text-slate-500 font-medium flex-wrap">
                        <span>Trans: {c.transitionScore}%</span>
                        <span>•</span>
                        <span>Report: {c.repeatScore}%</span>
                        <span>•</span>
                        <span>Harm: {c.harmonicScore}%</span>
                        {c.hawkesScore !== undefined && (
                          <>
                            <span>•</span>
                            <span className="text-rose-600 dark:text-rose-400 font-bold">
                              Hawkes: {c.hawkesScore}%
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">
                      Score Global
                    </span>
                    <span className="text-lg font-black font-mono text-indigo-600 dark:text-indigo-400">
                      {c.compositeScore}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4.5. FLUX STOCHASTIQUES & PROBABILITÉS CONDITIONNELLES (W_{t-1} -> W_t) */}
          {report.sourceTransitions && report.sourceTransitions.length > 0 && (
            <div className="bg-white/80 dark:bg-slate-900/80 p-5 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                    <Network size={16} className="text-indigo-500" />
                    Probabilités Conditionnelles & Flux de Transition (W(t-1) → W(t))
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Décomposition unitaire des attracteurs stochastiques : chaque numéro sorti au tirage prédécesseur ({report.predecessor?.name || 'Prédécesseur'}) polarise les probabilités d'apparition du tirage cible ({report.targetDraw}).
                  </p>
                </div>

                {/* Filtre interactif par boule source */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setSelectedSourceNum(null);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                      selectedSourceNum === null
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                    }`}
                  >
                    Tous les flux
                  </button>
                  {report.sourceTransitions.map(st => {
                    const isSelected = selectedSourceNum === st.sourceNumber;
                    return (
                      <button
                        key={`src-btn-${st.sourceNumber}`}
                        onClick={() => {
                          audioEngine.play("click");
                          setSelectedSourceNum(isSelected ? null : st.sourceNumber);
                        }}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-indigo-600 text-white shadow-md ring-2 ring-indigo-400"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
                        <span>{st.sourceNumber < 10 ? `0${st.sourceNumber}` : st.sourceNumber}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Vue Détaillée : Flux Filtré par Boule Source */}
              {selectedSourceNum !== null ? (
                (() => {
                  const activeSource = report.sourceTransitions.find(st => st.sourceNumber === selectedSourceNum);
                  if (!activeSource) return null;
                  return (
                    <div className="space-y-3">
                      <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200 dark:border-indigo-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <NumberBall number={activeSource.sourceNumber} size="md" />
                          <div>
                            <span className="text-xs font-black uppercase text-indigo-950 dark:text-indigo-200 block">
                              Numéro Source : {activeSource.sourceNumber} ({report.predecessor?.name || 'Prédécesseur'})
                            </span>
                            <span className="text-[11px] text-indigo-600 dark:text-indigo-400">
                              Top cibles historiques projetées dans {report.targetDraw} (ordonnées par Lift conditionnel)
                            </span>
                          </div>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block">Transitions Enregistrées</span>
                          <span className="text-xs font-black font-mono text-indigo-600 dark:text-indigo-400">
                            {activeSource.transitions.length} cibles identifiées
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                        {activeSource.transitions.map((item, idx) => {
                          const isHighLift = item.lift >= 1.5;
                          const isPositiveLift = item.lift >= 1.0;
                          const isRepeat = item.targetNumber === activeSource.sourceNumber;
                          const isMirror = item.targetNumber === getMirrorNumber(activeSource.sourceNumber) && !isRepeat;
                          const isComp = item.targetNumber === getComplement90(activeSource.sourceNumber) && !isRepeat;

                          return (
                            <div
                              key={`trans-${activeSource.sourceNumber}-${item.targetNumber}`}
                              className={`p-3 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                                isHighLift
                                  ? "bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-500/30 shadow-sm"
                                  : isPositiveLift
                                  ? "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-white/5"
                                  : "bg-slate-50/50 dark:bg-slate-800/30 border-slate-200/50 dark:border-white/5 opacity-80"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-mono text-slate-400 font-bold">
                                  #{idx + 1}
                                </span>
                                <div className="flex gap-1">
                                  {isRepeat && (
                                    <span className="px-1 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[8px] font-black rounded uppercase">
                                      Report
                                    </span>
                                  )}
                                  {isMirror && (
                                    <span className="px-1 py-0.5 bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[8px] font-black rounded uppercase">
                                      Miroir
                                    </span>
                                  )}
                                  {isComp && (
                                    <span className="px-1 py-0.5 bg-sky-500/20 text-sky-600 dark:text-sky-400 text-[8px] font-black rounded uppercase">
                                      Comp 90
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2.5 my-2">
                                <NumberBall number={item.targetNumber} size="sm" />
                                <div>
                                  <div className="flex items-baseline gap-1">
                                    <span className="text-xs font-black font-mono text-slate-900 dark:text-white">
                                      {item.probability}%
                                    </span>
                                    <span className="text-[9px] text-slate-400 font-medium">prob</span>
                                  </div>
                                  <span
                                    className={`text-[10px] font-mono font-black ${
                                      isHighLift
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : isPositiveLift
                                        ? "text-indigo-600 dark:text-indigo-400"
                                        : "text-slate-400"
                                    }`}
                                  >
                                    Lift: {item.lift}x
                                  </span>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 text-[9px] text-slate-400 flex justify-between">
                                <span>Fréquence :</span>
                                <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
                                  {item.occurrences} fois
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* Vue Synthétique de Tous les Flux */
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  {report.sourceTransitions.map(st => (
                    <div
                      key={`col-src-${st.sourceNumber}`}
                      className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-white/5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-white/5">
                        <div className="flex items-center gap-2">
                          <NumberBall number={st.sourceNumber} size="xs" />
                          <span className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-300">
                            Source {st.sourceNumber}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            audioEngine.play("click");
                            setSelectedSourceNum(st.sourceNumber);
                          }}
                          className="text-[10px] text-indigo-500 hover:text-indigo-600 font-bold cursor-pointer"
                        >
                          Détails →
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {st.transitions.slice(0, 4).map((tr, tidx) => (
                          <div
                            key={`tr-mini-${st.sourceNumber}-${tr.targetNumber}`}
                            className="flex items-center justify-between p-1.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-white/5 text-xs"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-mono text-slate-400">#{tidx + 1}</span>
                              <NumberBall number={tr.targetNumber} size="xs" />
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] font-black font-mono text-slate-800 dark:text-slate-200 block">
                                {tr.probability}%
                              </span>
                              <span
                                className={`text-[8px] font-mono font-bold ${
                                  tr.lift >= 1.5
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-indigo-500"
                                }`}
                              >
                                L: {tr.lift}x
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 5. COUPLAGES 2-SUR-2 ET RÉSONANCES HARMONIQUES */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PAIRES RECOMMANDÉES */}
            <div className="bg-white/80 dark:bg-slate-900/80 p-5 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                    <Zap size={15} className="text-amber-500" />
                    Couplages 2-sur-2 Recommandés
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Paires à plus haute affinité stochastique conjointe pour le tirage suivant.
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {report.recommendedPairs.map((pair, i) => (
                  <div
                    key={`pair-${i}`}
                    className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-white/5 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <NumberBall number={pair.numbers[0]} size="sm" />
                      <span className="text-slate-400 font-black">+</span>
                      <NumberBall number={pair.numbers[1]} size="sm" />
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-[9px] text-slate-400 font-bold uppercase block">
                          Affinité Conjointe
                        </span>
                        <span className="text-xs font-black font-mono text-emerald-600 dark:text-emerald-400">
                          {pair.affinity}%
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-400 font-bold uppercase block">
                          Confiance
                        </span>
                        <span className="text-xs font-black font-mono text-indigo-500">
                          {Math.round(pair.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* HARMONIQUES & MIROIRS ISSUS DU PRÉDÉCESSEUR AVEC TAUX D'ATTRACTION EMPIRIQUE */}
            <div className="bg-white/80 dark:bg-slate-900/80 p-5 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                    <Layers size={15} className="text-purple-500" />
                    Résonances Harmoniques & Attraction Empirique
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Transformations miroirs et compléments à 90 avec taux d'attraction observés dans le cycle.
                  </p>
                </div>
              </div>

              {/* Badges de synthèse du taux d'attraction empirique de la famille */}
              {report.harmonicMetrics && (
                <div className="grid grid-cols-2 gap-2 p-3 bg-purple-50/50 dark:bg-purple-950/20 rounded-2xl border border-purple-500/20">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 block">
                      Attraction Miroir Réelle
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-sm font-black font-mono text-purple-700 dark:text-purple-300">
                        {report.harmonicMetrics.mirrorObservedRate}%
                      </span>
                      <span className="text-[10px] font-mono text-purple-500 font-bold">
                        (Lift: {report.harmonicMetrics.mirrorLift}x)
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-400 block">
                      Attraction Complément 90
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-sm font-black font-mono text-sky-700 dark:text-sky-300">
                        {report.harmonicMetrics.complementObservedRate}%
                      </span>
                      <span className="text-[10px] font-mono text-sky-500 font-bold">
                        (Lift: {report.harmonicMetrics.complementLift}x)
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                {report.predecessorResult?.gagnants ? (
                  report.predecessorResult.gagnants.map(n => {
                    const mirror = getMirrorNumber(n);
                    const comp = getComplement90(n);
                    const mirPair = report.harmonicMetrics?.harmonicPairs.find(p => p.from === n && p.type === 'MIROIR');
                    const compPair = report.harmonicMetrics?.harmonicPairs.find(p => p.from === n && p.type === 'COMPLEMENT');

                    return (
                      <div
                        key={`harm-${n}`}
                        className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <NumberBall number={n} size="sm" />
                          <ArrowRight size={12} className="text-slate-400" />
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-purple-500 font-bold uppercase">Miroir:</span>
                            <span className="font-mono font-black text-slate-900 dark:text-white bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                              {mirror < 10 ? `0${mirror}` : mirror}
                            </span>
                            {mirPair && (
                              <span className="text-[9px] font-mono text-purple-600 dark:text-purple-400 font-bold">
                                {mirPair.empiricalRate}% (L:{mirPair.lift}x)
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-sky-500 font-bold uppercase">Comp 90:</span>
                            <span className="font-mono font-black text-slate-900 dark:text-white bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                              {comp < 10 ? `0${comp}` : comp}
                            </span>
                            {compPair && (
                              <span className="text-[9px] font-mono text-sky-600 dark:text-sky-400 font-bold">
                                {compPair.empiricalRate}% (L:{compPair.lift}x)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-400 italic">Données prédécesseurs non disponibles</p>
                )}
              </div>
            </div>
          </div>

          {/* 6. SIMULATEUR DE TRANSMISSION INTERACTIF */}
          <div className="bg-white/80 dark:bg-slate-900/80 p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div>
                <h3 className="text-base font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders size={18} className="text-indigo-500" />
                  Simulateur de Réverbération Stochastique Inter-Tirages
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Modifiez les 5 numéros sortis au tirage précédent ({report.predecessor?.name || 'Prédécesseur'}) pour projeter instantanément leur impact sur {report.targetDraw}.
                </p>
              </div>

              <button
                onClick={handleLoadRealPredecessor}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl border border-slate-200 dark:border-white/5 transition flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={12} />
                <span>Restaurer les 5 réels</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={simInput}
                onChange={(e) => setSimInput(e.target.value)}
                placeholder="Ex: 12, 34, 56, 78, 90"
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={runSimulation}
                disabled={simulating}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Play size={13} />
                <span>Calculer Transmission</span>
              </button>
            </div>

            {simResult && (
              <div className="pt-4 border-t border-slate-200 dark:border-white/5 space-y-3">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500 block">
                  Top Numéros Projetés par Réverbération :
                </span>
                <div className="flex flex-wrap gap-3">
                  {simResult.candidates.slice(0, 5).map((c) => (
                    <div
                      key={`sim-cand-${c.number}`}
                      className="p-3 bg-slate-100 dark:bg-slate-800/90 rounded-2xl border border-indigo-500/30 flex items-center gap-3"
                    >
                      <NumberBall number={c.number} size="sm" />
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase">Score</span>
                        <span className="text-sm font-black font-mono text-indigo-600 dark:text-indigo-400">
                          {c.compositeScore}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}

      {/* VUES DÉDIÉES COOCCURRENCES ET PATTERNS */}
      {report && subView === 'COOCCURRENCES' && (
        <InterDrawCooccurrenceView
          cooccurrences={report.cooccurrenceMetrics}
          targetDraw={report.targetDraw}
          predecessorName={report.predecessor?.name || 'Prédécesseur'}
          predecessorNumbers={report.predecessorResult?.gagnants || []}
        />
      )}

      {report && subView === 'PATTERNS' && (
        <InterDrawPatternView
          patterns={report.patternMetrics}
          targetDraw={report.targetDraw}
          predecessorName={report.predecessor?.name || 'Prédécesseur'}
          predecessorNumbers={report.predecessorResult?.gagnants || []}
        />
      )}

      {report && subView === 'SIMULATOR' && (
        <div className="bg-white/80 dark:bg-slate-900/80 p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-black text-[10px] rounded-lg uppercase tracking-wider">
                <Sliders size={13} className="animate-pulse" />
                Atelier Interactif
              </div>
              <h3 className="text-lg md:text-xl font-black text-slate-900 dark:text-white mt-1">
                Simulateur de Réverbération Stochastique Inter-Tirages
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Modifiez les 5 numéros sortis au tirage précédent ({report.predecessor?.name || 'Prédécesseur'}) pour projeter instantanément leur impact sur {report.targetDraw}.
              </p>
            </div>

            <button
              onClick={handleLoadRealPredecessor}
              className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl border border-slate-200 dark:border-white/5 transition flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Restaurer les 5 réels</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={simInput}
              onChange={(e) => setSimInput(e.target.value)}
              placeholder="Ex: 12, 34, 56, 78, 90"
              className="flex-1 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={runSimulation}
              disabled={simulating}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Play size={14} />
              <span>Calculer Transmission</span>
            </button>
          </div>

          {simResult && (
            <div className="pt-4 border-t border-slate-200 dark:border-white/5 space-y-6">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-3">
                  Top Numéros Projetés par Réverbération :
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {simResult.candidates.slice(0, 10).map((c, idx) => (
                    <div
                      key={`sim-cand-full-${c.number}`}
                      className="p-3 bg-slate-100 dark:bg-slate-800/90 rounded-2xl border border-indigo-500/30 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
                        <NumberBall number={c.number} size="sm" />
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-400 font-bold block uppercase">Score</span>
                        <span className="text-sm font-black font-mono text-indigo-600 dark:text-indigo-400">
                          {c.compositeScore}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {simResult.recommendedPairs && simResult.recommendedPairs.length > 0 && (
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-3">
                    Paires Conjointes Simulées (Couplages 2-sur-2) :
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {simResult.recommendedPairs.slice(0, 6).map((pair, pidx) => (
                      <div
                        key={`sim-pair-${pidx}`}
                        className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-white/5 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <NumberBall number={pair.numbers[0]} size="xs" />
                          <span className="text-slate-400 font-black text-xs">+</span>
                          <NumberBall number={pair.numbers[1]} size="xs" />
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] text-slate-400 font-bold uppercase block">Affinité</span>
                          <span className="text-xs font-black font-mono text-emerald-600 dark:text-emerald-400">
                            {pair.affinity}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
