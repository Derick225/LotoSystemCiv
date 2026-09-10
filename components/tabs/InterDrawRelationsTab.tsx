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
  Info
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
    const norm = normalizeDrawName(drawName);
    const inFamily = activeFamily.sequence.some(s => normalizeDrawName(s.name) === norm);
    return inFamily ? drawName : activeFamily.sequence[0].name;
  }, [drawName, activeFamily]);

  const [targetDraw, setTargetDraw] = useState<string>(effectiveTargetDraw);

  useEffect(() => {
    setTargetDraw(effectiveTargetDraw);
  }, [effectiveTargetDraw]);

  // Chargement du rapport
  const [report, setReport] = useState<InterDrawReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

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

  const handleRefresh = () => {
    audioEngine.play("scan");
    setIsRefreshing(true);
    loadReport(targetDraw, selectedFamilyId, true);
  };

  // Simulateur interactif
  const [simInput, setSimInput] = useState<string>("");
  const [simResult, setSimResult] = useState<{
    candidates: InterDrawCandidateScore[];
    recommendedPairs: InterDrawPairCombination[];
    harmonicResonances: { from: number; to: number; type: 'MIROIR' | 'COMPLEMENT' }[];
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
                    setTargetDraw(fam.sequence[0].name);
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
            {activeFamily.sequence.map((item, idx) => {
              const isTarget = normalizeDrawName(item.name) === normalizeDrawName(targetDraw);
              const isPred = report && normalizeDrawName(item.name) === normalizeDrawName(report.predecessor.name);
              const isSucc = report && normalizeDrawName(item.name) === normalizeDrawName(report.successor.name);

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
                  {report.predecessor.name}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {report.predecessor.day} à {report.predecessor.time}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-white/5">
                  <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block mb-2">
                    Derniers Numéros Gagnants Sortis
                  </span>
                  {report.predecessorResult?.gagnants && report.predecessorResult.gagnants.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
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
                  {report.successor.name}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {report.successor.day} à {report.successor.time}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-white/5">
                  <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block mb-2">
                    Rôle dans la boucle
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Les numéros tirés dans <strong className="text-slate-800 dark:text-slate-200">{report.targetDraw}</strong> transmettront immédiatement leur dynamique markovienne à <strong className="text-slate-800 dark:text-slate-200">{report.successor.name}</strong>.
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-white/5 text-[11px] text-slate-500 flex items-center justify-between">
                <span>Continuité du cycle :</span>
                <span className="font-mono font-bold text-sky-500">100% Hermétique</span>
              </div>
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
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              }
                            `}
                          >
                            {f.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500 font-medium">
                        <span>Trans: {c.transitionScore}%</span>
                        <span>•</span>
                        <span>Report: {c.repeatScore}%</span>
                        <span>•</span>
                        <span>Harm: {c.harmonicScore}%</span>
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
                  Modifiez les 5 numéros sortis au tirage précédent ({report.predecessor.name}) pour projeter instantanément leur impact sur {report.targetDraw}.
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
    </div>
  );
};
