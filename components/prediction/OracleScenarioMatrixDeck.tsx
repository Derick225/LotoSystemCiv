import React, { useState, useMemo } from "react";
import { Prediction } from "../../types";
import { NumberBall } from "../NumberBall";
import { audioEngine } from "../../utils/audioEngine";
import { useToast } from "../ui/Toast";
import {
  interpolatePredictionScenarios,
  SimulationScenarioItem,
} from "../../services/prediction/predictionScenarios";
import {
  Sparkles,
  ShieldCheck,
  Zap,
  Clock,
  Layers,
  CheckCircle2,
  Sliders,
  ChevronRight,
  TrendingUp,
  Cpu,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface OracleScenarioMatrixDeckProps {
  prediction: Prediction;
  drawName: string;
  onAdoptTicket?: (numbers: number[], scenarioName: string) => void;
}

export const OracleScenarioMatrixDeck: React.FC<OracleScenarioMatrixDeckProps> = React.memo(
  ({ prediction, drawName, onAdoptTicket }) => {
    const { showToast } = useToast();

    const rawScenarios: SimulationScenarioItem[] = useMemo(() => {
      if (prediction.simulationScenarios && prediction.simulationScenarios.length > 0) {
        return prediction.simulationScenarios as SimulationScenarioItem[];
      }
      return [
        {
          scenarioId: "sim_default_1",
          scenarioName: "Consensus Symbiotique (Tamis ADN)",
          ticket: prediction.suggestedNumbers,
          probabilityScore: prediction.confidence,
          riskProfile: "BALANCED",
          description: "Profil d'équilibre optimisé par le Tamis ADN et l'alignement de réalité.",
          color: "#6366f1",
          genomicFocus: "Tamis ADN & Consensus",
          energyPct: 90,
        },
      ];
    }, [prediction]);

    const [activeScenarioId, setActiveScenarioId] = useState<string>(
      rawScenarios[0]?.scenarioId || "default"
    );

    const [isMorphingOpen, setIsMorphingOpen] = useState(false);
    const [morphTargetId, setMorphTargetId] = useState<string>(
      rawScenarios[1]?.scenarioId || rawScenarios[0]?.scenarioId || "default"
    );
    const [morphAlpha, setMorphAlpha] = useState<number>(0.5);

    const activeScenario = useMemo(() => {
      return rawScenarios.find((s) => s.scenarioId === activeScenarioId) || rawScenarios[0];
    }, [rawScenarios, activeScenarioId]);

    const targetScenario = useMemo(() => {
      return (
        rawScenarios.find((s) => s.scenarioId === morphTargetId) ||
        rawScenarios[1] ||
        rawScenarios[0]
      );
    }, [rawScenarios, morphTargetId]);

    // Calcul de l'interpolation continue
    const morphedResult = useMemo(() => {
      if (!activeScenario || !targetScenario) return null;
      return interpolatePredictionScenarios(activeScenario, targetScenario, morphAlpha);
    }, [activeScenario, targetScenario, morphAlpha]);

    const getRiskBadge = (profile: string) => {
      switch (profile) {
        case "DEFENSIVE":
          return {
            label: "Défensif (Basse Variance)",
            bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
            icon: <ShieldCheck size={12} />,
          };
        case "AGGRESSIVE":
          return {
            label: "Agressif (Lyapunov)",
            bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
            icon: <Zap size={12} />,
          };
        case "RECURRENT":
          return {
            label: "Temporel (Hawkes)",
            bg: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
            icon: <Clock size={12} />,
          };
        case "ADVERSARIAL":
          return {
            label: "Anti-Leurres (Adversarial)",
            bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
            icon: <Layers size={12} />,
          };
        case "BALANCED":
        default:
          return {
            label: "Équilibré (Tamis ADN)",
            bg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
            icon: <Sparkles size={12} />,
          };
      }
    };

    const handleApplyTicket = (ticketToApply: number[], name: string) => {
      audioEngine.play("success");
      onAdoptTicket?.(ticketToApply, name);
      showToast(`Vecteur "${name}" appliqué comme combinaison principale.`, "success");
    };

    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20">
              <Layers size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                  Matrice des Scénarios Probabilistes
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase border border-indigo-500/20">
                  {rawScenarios.length} Profils Déterministes
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Exploration multi-régimes générée par le moteur stochastique Oracle Base.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              audioEngine.play("click");
              setIsMorphingOpen(!isMorphingOpen);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
              isMorphingOpen
                ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
            }`}
          >
            <Sliders size={14} />
            <span>{isMorphingOpen ? "Fermer le Morphing" : "Morphing Continu (α)"}</span>
          </button>
        </div>

        {/* Scenario Selection Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {rawScenarios.map((sc) => {
            const isSelected = sc.scenarioId === activeScenarioId;
            const badge = getRiskBadge(sc.riskProfile);

            return (
              <div
                key={sc.scenarioId}
                onClick={() => {
                  audioEngine.play("click");
                  setActiveScenarioId(sc.scenarioId);
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 text-left relative overflow-hidden ${
                  isSelected
                    ? "bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/20 shadow-md"
                    : "bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${badge.bg}`}
                    >
                      {badge.icon}
                      {badge.label}
                    </span>
                    <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400">
                      {sc.probabilityScore}%
                    </span>
                  </div>

                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-white line-clamp-1">
                    {sc.scenarioName}
                  </h4>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">
                    {sc.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {sc.ticket.map((num) => (
                      <span
                        key={num}
                        className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[10px] font-black flex items-center justify-center font-mono"
                      >
                        {num}
                      </span>
                    ))}
                  </div>

                  {isSelected && (
                    <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Actif
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Active Scenario Detail & Action Panel */}
        {activeScenario && !isMorphingOpen && (
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 w-full md:w-auto text-left">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Scénario Sélectionné
                </span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase border border-indigo-500/20">
                  {activeScenario.scenarioName}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {activeScenario.ticket.map((num) => (
                  <NumberBall key={num} number={num} size="md" isAttractor={true} />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <button
                onClick={() => handleApplyTicket(activeScenario.ticket, activeScenario.scenarioName)}
                className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                <CheckCircle2 size={15} />
                <span>Adopter ce Scénario</span>
              </button>
            </div>
          </div>
        )}

        {/* Scenario Morphing Deck (Continuous Interpolation α ∈ [0, 1]) */}
        <AnimatePresence>
          {isMorphingOpen && activeScenario && targetScenario && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/30 via-slate-900/60 to-slate-900 border border-indigo-500/30 space-y-5"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-indigo-500/20">
                <div className="flex items-center gap-2">
                  <Sliders size={16} className="text-indigo-400" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">
                    Morphing Continu d'Inférence (Gradient Paramétrique)
                  </h4>
                </div>
                <div className="text-[11px] font-mono text-indigo-300">
                  α = {(morphAlpha * 100).toFixed(0)}% • {morphedResult?.dominantScenario}
                </div>
              </div>

              {/* Selectors for Scenario A and Scenario B */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 block">
                    Pôle Initial (A : α = 0.0)
                  </label>
                  <select
                    value={activeScenarioId}
                    onChange={(e) => setActiveScenarioId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-indigo-500"
                  >
                    {rawScenarios.map((s) => (
                      <option key={s.scenarioId} value={s.scenarioId}>
                        {s.scenarioName} ({s.probabilityScore}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 block">
                    Pôle Cible (B : α = 1.0)
                  </label>
                  <select
                    value={morphTargetId}
                    onChange={(e) => setMorphTargetId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-indigo-500"
                  >
                    {rawScenarios.map((s) => (
                      <option key={s.scenarioId} value={s.scenarioId}>
                        {s.scenarioName} ({s.probabilityScore}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Slider Continuous α */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400">
                  <span>100% {activeScenario.scenarioName}</span>
                  <span className="text-indigo-400 font-mono">
                    Interpolation Convexe : {(morphAlpha * 100).toFixed(0)}%
                  </span>
                  <span>100% {targetScenario.scenarioName}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={morphAlpha}
                  onChange={(e) => setMorphAlpha(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer h-2 bg-slate-800 rounded-lg appearance-none"
                />
              </div>

              {/* Morphed Ticket Preview */}
              {morphedResult && (
                <div className="p-4 rounded-xl bg-slate-900/90 border border-indigo-500/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-2 text-left w-full sm:w-auto">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase text-indigo-400">
                        Vecteur Interpolé
                      </span>
                      <span className="text-xs font-bold text-white font-mono">
                        (Confiance: {morphedResult.interpolatedProbability}%)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {morphedResult.ticket.map((num) => (
                        <NumberBall key={num} number={num} size="sm" isAttractor={true} />
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      handleApplyTicket(
                        morphedResult.ticket,
                        `Morphing ${morphedResult.dominantScenario}`
                      )
                    }
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 size={14} />
                    <span>Adopter ce Vecteur Morphed</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);
