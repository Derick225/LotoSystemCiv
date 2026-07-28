import React, { useState, useEffect, useCallback } from "react";
import {
  runDecisionForest,
  calculateFeatureImportance,
  FEATURES_LABELS,
} from "../../services/decisionTreeService";
import type { ForestVote } from "../../types";
import { NumberBall } from "../NumberBall";
import { useToast } from "../ui/Toast";
import { useNexusStore } from "../../store/useNexusStore";
import {
  Vote,
  Users,
  BrainCircuit,
  Ghost,
  EyeOff,
  ShieldCheck,
  Check,
  Sparkles,
  HelpCircle,
  Scale,
  GitBranch,
  Network,
  Layers,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

interface DecisionTreeTabProps {
  drawName: string;
}

type FilterMode = "consensus" | "average" | "shadow";

const DecisionPathNodeView: React.FC<{ node: any }> = ({ node }) => {
  if (!node) return null;
  if (node.type === "outcome") {
    return (
      <div className="flex items-center gap-2 bg-emerald-950/80 border border-emerald-500/30 px-3 py-1.5 rounded-xl font-mono text-xs text-emerald-300">
        <Sparkles size={13} className="text-emerald-400 shrink-0" />
        <span>{node.label}</span>
      </div>
    );
  }
  return (
    <div className="space-y-2 font-mono text-xs">
      <div className="flex items-center gap-2 bg-slate-900 border border-indigo-500/30 px-3 py-2 rounded-xl text-indigo-300">
        <GitBranch size={14} className="text-indigo-400 shrink-0" />
        <span>{node.label}</span>
      </div>
      {node.children &&
        node.children.map((child: any, i: number) => (
          <div key={i} className="pl-4 border-l-2 border-indigo-500/30">
            <DecisionPathNodeView node={child} />
          </div>
        ))}
    </div>
  );
};

export const DecisionTreeTab: React.FC<DecisionTreeTabProps> = ({
  drawName,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const nexusLoading = useNexusStore((state) => state.loading);

  const [candidates, setCandidates] = useState<ForestVote[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<ForestVote | null>(
    null,
  );
  const [localLoading, setLocalLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>("consensus");
  const [globalImportance, setGlobalImportance] = useState<
    Array<{ name: string; val: number }>
  >([]);
  const [selectedFeatures, setSelectedFeatures] =
    useState<string[]>(FEATURES_LABELS);

  const load = useCallback(async () => {
    if (history.length < 40) return;
    setLocalLoading(true);
    try {
      // Lancement du Worker Forest avec le mode sélectionné
      const { votes, dataset } = await runDecisionForest(
        history,
        filterMode,
        selectedFeatures,
        drawName,
      );
      setCandidates(votes);

      if (votes.length > 0) {
        // Par défaut, on sélectionne le meilleur candidat
        setSelectedCandidate(votes[0]);

        // Calcul de l'importance des features (post-training)
        const impMap = calculateFeatureImportance(dataset, selectedFeatures);
        const impArray = Object.entries(impMap)
          .map(([name, val]) => ({ name, val }))
          .sort((a, b) => b.val - a.val);
        setGlobalImportance(impArray);
      } else {
        setSelectedCandidate(null);
        setGlobalImportance([]);
      }
    } catch (e) {
      showToast("Calcul de bifurcation échoué", "error");
    } finally {
      setLocalLoading(false);
    }
  }, [history, filterMode, selectedFeatures, showToast, drawName]);

  useEffect(() => {
    if (history.length >= 40) {
      load();
    } else {
      setLocalLoading(false);
    }
  }, [drawName, history, load, filterMode]); // Reload on filterMode change

  const getTheme = () => {
    if (filterMode === "consensus")
      return {
        border: "border-emerald-500",
        bg: "bg-emerald-600",
        text: "text-emerald-500",
        gradient: "from-slate-900 to-emerald-950",
      };
    if (filterMode === "average")
      return {
        border: "border-blue-500",
        bg: "bg-blue-600",
        text: "text-blue-500",
        gradient: "from-slate-900 to-blue-950",
      };
    return {
      border: "border-rose-500",
      bg: "bg-rose-600",
      text: "text-rose-500",
      gradient: "from-slate-900 to-rose-950",
    };
  };

  const theme = getTheme();

  if (
    nexusLoading ||
    (localLoading && candidates.length === 0 && history.length >= 40)
  )
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-6 bg-slate-900/30 rounded-3xl border border-slate-800 border-dashed">
        <div className="relative">
          <div className="w-28 h-28 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin"></div>
          <Vote className="absolute inset-0 m-auto text-emerald-500 w-12 h-12 animate-pulse" />
        </div>
        <p className="font-black text-emerald-600 uppercase tracking-[0.3em] text-sm">
          Consultation des Sages...
        </p>
      </div>
    );

  if (history.length < 40) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-900/30 rounded-3xl border border-slate-800 border-dashed gap-4">
        <BrainCircuit className="text-amber-500 w-16 h-16 animate-pulse mb-2" />
        <h3 className="text-xl font-bold text-white">
          Historique insuffisant pour Decision Forest
        </h3>
        <p className="text-slate-400 text-sm max-w-md">
          L'algorithme Decision Forest (Random Forest) nécessite au moins{" "}
          <span className="text-amber-500 font-bold">
            40 tirages historiques
          </span>{" "}
          pour calibrer ses bifurcations et voter de façon fiable.
        </p>
        <div className="px-4 py-2 bg-slate-800/50 rounded-2xl border border-slate-700/50 text-xs text-slate-300 mt-2">
          Historique actuel pour{" "}
          <span className="text-indigo-400 font-bold">{drawName}</span> :{" "}
          {history.length} / 40 tirages.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      {/* Header Simplifié */}
      <div
        className={`p-8 md:p-8 rounded-3xl border shadow-2xl relative overflow-hidden transition-all duration-300 ${filterMode === "shadow" ? "bg-slate-950 border-rose-500/20" : "bg-slate-900 border-slate-800"}`}
      >
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <BrainCircuit size={180} />
        </div>

        <div className="relative z-10 flex flex-col xl:flex-row justify-between gap-8 items-center">
          <div className="flex-1 text-center xl:text-left">
            <div className="flex flex-wrap items-center justify-center xl:justify-start gap-3 mb-4">
              <div
                className={`p-3 rounded-2xl bg-white/5 border border-white/10 ${theme.text}`}
              >
                {filterMode === "shadow" ? (
                  <Ghost size={24} />
                ) : filterMode === "average" ? (
                  <Scale size={24} />
                ) : (
                  <Users size={24} />
                )}
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.4em] opacity-70">
                  {filterMode === "shadow"
                    ? "Mode Dissidents"
                    : filterMode === "average"
                      ? "Mode Équilibre"
                      : "Vote Consensus"}
                </h3>
                <span className="text-[9px] font-black tracking-widest text-indigo-400 uppercase bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full mt-1 inline-block">
                  Fuzzy Soft Forest v5.0
                </span>
              </div>
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-none mb-4">
              L'Avis des{" "}
              <span className={theme.text}>
                {filterMode === "shadow"
                  ? "Outsiders"
                  : filterMode === "average"
                    ? "Médians"
                    : "Experts"}
              </span>
            </h2>
            <p className="text-slate-400 text-sm font-medium max-w-xl mx-auto xl:mx-0">
              {filterMode === "shadow"
                ? "Cible les numéros ignorés mais mathématiquement mûrs (Contre-Intuitif)."
                : filterMode === "average"
                  ? "Cible la 'Zone Moyenne' (40-60%). Valeurs sûres, ni sur-jouées, ni oubliées."
                  : "Cible la majorité absolue. Les favoris logiques du système (Score > 60%)."}
            </p>
          </div>

          {/* SELECTEUR DE MODE */}
          <div className="flex bg-slate-950 p-1.5 rounded-[2rem] border border-slate-800 shadow-inner">
            <button
              onClick={() => {
                audioEngine.play("click");
                setFilterMode("consensus");
              }}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${filterMode === "consensus" ? "bg-emerald-600 text-white shadow-lg" : "text-slate-500 hover:text-white"}`}
            >
              <ShieldCheck size={14} /> Top
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setFilterMode("average");
              }}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${filterMode === "average" ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:text-white"}`}
            >
              <Scale size={14} /> Moyen
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setFilterMode("shadow");
              }}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${filterMode === "shadow" ? "bg-rose-600 text-white shadow-lg" : "text-slate-500 hover:text-white"}`}
            >
              <EyeOff size={14} /> Ombre
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Liste des Élus */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 h-fit max-h-[700px] overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-center mb-8">
            <h4
              className={`font-black text-[10px] uppercase tracking-widest flex items-center gap-2 ${theme.text}`}
            >
              <Vote size={14} />
              Résultats du Vote
            </h4>
            <div className="px-3 py-1 bg-slate-100 dark:bg-slate-900 rounded-full text-xs font-bold text-slate-500">
              {candidates.length} Candidats
            </div>
          </div>

          <div className="space-y-3">
            {candidates.slice(0, 10).map((c, idx) => (
              <button
                key={c.candidate}
                onClick={() => {
                  audioEngine.play("click");
                  setSelectedCandidate(c);
                }}
                className={`w-full flex items-center justify-between p-4 rounded-3xl border transition-all transform active:scale-95 ${selectedCandidate?.candidate === c.candidate ? `${theme.bg} ${theme.border} text-white shadow-lg scale-105` : "bg-slate-50 dark:bg-slate-900 border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
              >
                <div className="flex items-center gap-4">
                  <span
                    className={`text-[10px] font-black w-4 ${selectedCandidate?.candidate === c.candidate ? "text-white/70" : "text-slate-400"}`}
                  >
                    #{idx + 1}
                  </span>
                  <NumberBall
                    number={c.candidate}
                    size="sm"
                    selected={selectedCandidate?.candidate === c.candidate}
                  />
                  <div className="text-left">
                    <div className="font-black text-sm">
                      Numéro {c.candidate}
                    </div>
                    <div
                      className={`text-xs font-medium ${selectedCandidate?.candidate === c.candidate ? "text-white/80" : "text-slate-400"}`}
                    >
                      {c.score}% d'approbation
                    </div>
                  </div>
                </div>
                {selectedCandidate?.candidate === c.candidate && (
                  <Check size={16} className="text-white" />
                )}
              </button>
            ))}
            {candidates.length === 0 && (
              <div className="text-center py-10 text-slate-400 text-xs italic">
                Aucun candidat dans cette zone.
              </div>
            )}
          </div>
        </div>

        {/* Détail du Candidat */}
        <div className="lg:col-span-8 space-y-8">
          {selectedCandidate ? (
            <>
              <div
                className={`p-6 rounded-3xl shadow-2xl relative overflow-hidden transition-all duration-500 bg-gradient-to-br ${theme.gradient} border ${filterMode === "shadow" ? "border-rose-900" : filterMode === "average" ? "border-blue-900" : "border-emerald-900"}`}
              >
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
                  <div className="flex flex-col items-center">
                    <div
                      className={`text-[10px] font-black uppercase tracking-widest mb-4 px-4 py-1 rounded-full border bg-white/10 border-white/20 text-white`}
                    >
                      Élu par l'IA
                    </div>
                    <NumberBall
                      number={selectedCandidate.candidate}
                      size="xl"
                      isAttractor
                    />
                  </div>

                  <div className="flex-1 text-center md:text-left">
                    <div className="text-6xl font-black text-white mb-2">
                      {selectedCandidate.score}%
                    </div>
                    <h4 className="text-lg font-bold text-slate-300 mb-6">
                      De probabilité estimée par la forêt
                    </h4>

                    <div className="bg-black/30 p-6 rounded-3xl border border-white/10 backdrop-blur-md">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Sparkles size={12} /> Pourquoi ce choix ?
                      </h5>
                      <p className="text-sm text-white font-medium leading-relaxed">
                        {filterMode === "shadow"
                          ? "Ce numéro est statistiquement 'oublié'. Il a accumulé un retard critique (Gap) sans être surjoué par la foule. Candidat surprise."
                          : filterMode === "average"
                            ? "Ce numéro est dans le 'ventre mou' statistique. Il n'est pas sous les projecteurs, ce qui le rend moins sujet aux corrections brutales de probabilité."
                            : "Ce numéro coche toutes les cases logiques : fréquence élevée récemment, bon écart temporel et validation par les algorithmes de voisinage."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chemin de Décision & Arbre d'Inférence Trace */}
              {selectedCandidate.decisionPath && (
                <div className="bg-slate-900/80 p-6 rounded-3xl border border-indigo-500/30 backdrop-blur-md space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400 flex items-center gap-2">
                    <GitBranch size={15} /> Chemin de Décision &amp; Arbre
                    d'Inférence (N°{selectedCandidate.candidate})
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Trace exacte du parcours à travers les sous-arbres avec
                    bifurcations floues continues
                  </p>
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
                    <DecisionPathNodeView
                      node={selectedCandidate.decisionPath}
                    />
                  </div>
                </div>
              )}

              {/* Empreinte de Bifurcation */}
              <div className="bg-slate-900/40 p-6 rounded-3xl border border-slate-800 backdrop-blur-md">
                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
                  <BrainCircuit
                    size={14}
                    className="text-emerald-500 animate-pulse"
                  />{" "}
                  Empreinte de Bifurcation &amp; Signaux d'Inférence
                </h4>
                <div className="grid sm:grid-cols-2 gap-4">
                  {selectedFeatures.map((featName, idx) => {
                    const val = selectedCandidate.features.values?.[idx] ?? 0;
                    const percent = Math.round(val * 100);

                    // Descriptions contextuelles continues (ZÉRO NOMBRE MAGIQUE)
                    let description = "Densité spectrale intermédiaire.";
                    let badgeColor = "bg-slate-800 text-slate-400";
                    if (featName === "Critical Gap") {
                      description =
                        val > 0.7
                          ? "Écart critique saturé, propice à une sortie imminente."
                          : "Écart stable, sous tension équilibrée.";
                      badgeColor =
                        val > 0.7
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
                    } else if (featName === "Frequency") {
                      description =
                        val > 0.7
                          ? "Dynamique de sortie très élevée sur la fenêtre de Breiman."
                          : "Inertie de sortie basse, en phase de latence.";
                      badgeColor =
                        val > 0.7
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20";
                    } else if (featName === "Shadow") {
                      description =
                        val > 0.6
                          ? "Forte probabilité d'ombre (densité d'écart en phase active)."
                          : "Ombre résiduelle faible.";
                      badgeColor =
                        val > 0.6
                          ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                          : "bg-slate-800 text-slate-400 border border-slate-700/50";
                    } else if (featName === "Consensus Trap") {
                      description =
                        val > 0.5
                          ? "Attention : Surpoids de consensus détecté. Risque de faux positif."
                          : "Absence de piège de consensus majeur.";
                      badgeColor =
                        val > 0.5
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
                    } else if (featName === "Neighbor") {
                      description =
                        val > 0.6
                          ? "Proximité topologique immédiate avec les récents vainqueurs."
                          : "Isolement spatial temporaire.";
                      badgeColor =
                        val > 0.6
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          : "bg-slate-800 text-slate-400 border border-slate-700/50";
                    } else if (featName === "Machine Leak") {
                      description =
                        val > 0.6
                          ? "Forte congruence harmonique avec la signature machine."
                          : "Signature machine neutre.";
                      badgeColor =
                        val > 0.6
                          ? "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20"
                          : "bg-slate-800 text-slate-400 border border-slate-700/50";
                    } else if (featName === "Norm Gap") {
                      description =
                        val > 0.7
                          ? "Probabilité cumulative de retour à la moyenne élevée."
                          : "Index de retour stable.";
                      badgeColor =
                        val > 0.7
                          ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                          : "bg-slate-800 text-slate-400 border border-slate-700/50";
                    }

                    return (
                      <div
                        key={featName}
                        className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-black uppercase text-slate-300 tracking-wider">
                            {featName}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}
                          >
                            {percent}%
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${val > 0.75 ? "from-rose-500 to-amber-500" : "from-indigo-500 to-emerald-400"}`}
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-normal font-medium">
                            {description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-slate-400 p-6 text-center">
              <Vote size={48} className="mb-4 opacity-20" />
              <p className="text-xs font-bold uppercase tracking-widest">
                Sélectionnez un candidat pour voir son analyse
              </p>
            </div>
          )}

          {/* Explication Pédagogique et Importance des Facteurs */}
          <div className="grid md:grid-cols-2 gap-6">
            <div
              className={`p-6 rounded-2xl border flex flex-col gap-4 ${filterMode === "average" ? "bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/30" : "bg-indigo-50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-800/30"}`}
            >
              <div className="flex items-start gap-4">
                <HelpCircle
                  size={24}
                  className={`${theme.text} shrink-0 mt-1`}
                />
                <div>
                  <h5
                    className={`text-xs font-black uppercase mb-1 ${theme.text}`}
                  >
                    Comment ça marche ?
                  </h5>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                    Imaginez 80 experts qui regardent le passé du loto. Chacun a
                    sa spécialité (les écarts, les suites, les fréquences...).
                    Ils votent tous.
                    <br />
                    <br />
                    <strong>Top :</strong> Majorité absolue (&gt;60%).
                    <br />
                    <strong>Moyen :</strong> Avis partagé mais positif (40-60%).
                    Souvent plus fiable sur le long terme.
                    <br />
                    <strong>Ombre :</strong> Avis minoritaire mais pertinent
                    (Outsiders).
                  </p>
                </div>
              </div>
            </div>

            {globalImportance.length > 0 && selectedCandidate && (
              <div className="p-6 rounded-2xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 flex flex-col">
                <h5 className="text-[10px] font-black uppercase mb-4 text-slate-500 tracking-widest flex items-center gap-2">
                  <BrainCircuit size={14} className="text-purple-500" />
                  Poids Décisionnels Globaux
                </h5>
                <div className="space-y-3 flex-1 overflow-y-auto max-h-[150px] custom-scrollbar pr-2">
                  {globalImportance.slice(0, 5).map((imp, idx) => (
                    <div
                      key={(imp as any).name}
                      className="flex justify-between items-center group"
                    >
                      <span
                        className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate pr-2"
                        title={(imp as any).name}
                      >
                        {(imp as any).name}
                      </span>
                      <div className="flex items-center gap-2 w-1/3">
                        <div className="h-1.5 flex-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${idx === 0 ? "bg-purple-500" : "bg-slate-400 dark:bg-slate-500"}`}
                            style={{
                              width: `${Math.min(100, Math.max(0, imp.val * 100))}%`,
                            }}
                          ></div>
                        </div>
                        <span className="text-[10px] font-black text-slate-500 w-8 text-right">
                          {(imp.val * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
