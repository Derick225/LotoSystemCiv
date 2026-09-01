import React, { useState, useMemo } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import {
  runNeuralSelfOptimization,
  NeuralOptimizationResult,
  NeuralHyperparameters,
  DEFAULT_NEURAL_HYPERPARAMS,
} from "../../services/prediction/neuralSelfOptimizationService";
import { audioEngine } from "../../utils/audioEngine";
import { logger } from "../../utils/logger";
import { useToast } from "../ui/Toast";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  BrainCircuit,
  Zap,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Lock,
  Layers,
  Cpu,
  CheckCircle2,
  Sliders,
  Play,
  ArrowRight,
} from "lucide-react";

interface NeuralSelfOptimizationPanelProps {
  drawName: string;
  onWeightsApplied?: () => void;
}

export const NeuralSelfOptimizationPanel: React.FC<NeuralSelfOptimizationPanelProps> = ({
  drawName,
  onWeightsApplied,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const setGlobalWeights = useNexusStore((state) => state.setGlobalWeights);
  const addAgentLog = useNexusStore((state) => state.addAgentLog);

  // Hyperparamètres éditables
  const [hyperparams, setHyperparams] = useState<NeuralHyperparameters>(
    DEFAULT_NEURAL_HYPERPARAMS
  );
  const [isTraining, setIsTraining] = useState(false);
  const [optimizationResult, setOptimizationResult] =
    useState<NeuralOptimizationResult | null>(null);

  // Lancement de la rétropropagation neurale
  const handleRunBackprop = () => {
    try {
      audioEngine.play("click");
    } catch (err) {
      logger.debug({ err }, "Audio error non-bloquant");
    }

    setIsTraining(true);

    // Timeout court pour laisser le thread UI afficher le spinner
    setTimeout(() => {
      try {
        const result = runNeuralSelfOptimization(
          drawName,
          history,
          globalWeights,
          hyperparams
        );
        setOptimizationResult(result);
        try {
          audioEngine.play("success");
        } catch (err) {
          logger.debug({ err }, "Audio error non-bloquant");
        }
        showToast(
          `Rétropropagation terminée : perte réduite de ${result.lossReductionPct}% (Gain précision : +${result.accuracyGain}%).`,
          "success"
        );
      } catch (err) {
        console.error("Neural Optimization Error:", err);
        showToast("Erreur lors de la rétropropagation neurale.", "error");
      } finally {
        setIsTraining(false);
      }
    }, 100);
  };

  // Application des poids optimisés au store
  const handleApplyOptimizedWeights = () => {
    if (!optimizationResult) return;
    try {
      audioEngine.play("success");
    } catch (err) {
      logger.debug({ err }, "Audio error non-bloquant");
    }

    setGlobalWeights(optimizationResult.optimizedWeights);

    addAgentLog({
      id: `neural_backprop_apply_${Date.now()}`,
      timestamp: new Date(),
      action: `Auto-optimisation neurale par rétropropagation exécutée sur ${drawName} (${optimizationResult.epochsCompleted} époques).`,
      type: "AUTOTUNE",
      impact: `Gain de précision estimé : +${optimizationResult.accuracyGain}% (Réduction de perte : ${optimizationResult.lossReductionPct}%).`,
    });

    showToast(
      "Poids optimisés par rétropropagation appliqués avec succès au profil actif !",
      "success"
    );

    if (onWeightsApplied) onWeightsApplied();
  };

  // Données pour le graphique de convergence Recharts
  const lossCurveData = useMemo(() => {
    if (!optimizationResult?.epochHistory) return [];
    return optimizationResult.epochHistory.map((ep) => ({
      epoch: `Ép ${ep.epoch}`,
      loss: ep.loss,
      accuracyDelta: ep.accuracyDelta,
      learningRate: ep.learningRate * 10,
    }));
  }, [optimizationResult]);

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* HEADER BANNER */}
      <div className="bg-slate-900/80 p-5 md:p-7 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-cyan-950/80 border border-cyan-500/30 rounded-2xl text-cyan-400">
                <BrainCircuit size={22} />
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
                  Auto-Optimisation Neurale par Rétropropagation
                  <span className="px-2.5 py-0.5 bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 rounded-full text-[10px] font-mono font-bold">
                    Backprop Multi-Époques
                  </span>
                </h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Exécute une passe différentiable de gradient descent sur les poids de prédiction contre les résultats historiques réels de {drawName}.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-run-neural-backprop"
              onClick={handleRunBackprop}
              disabled={isTraining}
              className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 shadow-lg ${
                isTraining
                  ? "bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed"
                  : "bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-cyan-600/30 border border-cyan-400/30 cursor-pointer"
              }`}
            >
              {isTraining ? (
                <>
                  <Cpu className="animate-spin text-cyan-300" size={15} />
                  <span>Calcul des Gradients...</span>
                </>
              ) : (
                <>
                  <Play size={14} />
                  <span>Lancer la Rétropropagation</span>
                </>
              )}
            </button>

            {optimizationResult && (
              <button
                id="btn-apply-neural-weights"
                onClick={handleApplyOptimizedWeights}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-600/30 border border-emerald-400/30 cursor-pointer"
              >
                <CheckCircle2 size={14} />
                <span>Appliquer les Poids</span>
              </button>
            )}
          </div>
        </div>

        {/* CONTRÔLE DES HYPERPARAMÈTRES NEURAUX */}
        <div className="mt-6 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5 space-y-1.5">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-bold uppercase">Époques de Gradient</span>
              <span className="font-mono font-bold text-cyan-300">{hyperparams.epochs} ép</span>
            </div>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={hyperparams.epochs}
              onChange={(e) =>
                setHyperparams((prev) => ({ ...prev, epochs: Number(e.target.value) }))
              }
              className="w-full accent-cyan-500 h-1.5 bg-slate-900 rounded-lg cursor-pointer"
            />
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5 space-y-1.5">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-bold uppercase">Taux d'Apprentissage (η)</span>
              <span className="font-mono font-bold text-indigo-300">{hyperparams.learningRate}</span>
            </div>
            <input
              type="range"
              min="0.01"
              max="0.20"
              step="0.01"
              value={hyperparams.learningRate}
              onChange={(e) =>
                setHyperparams((prev) => ({ ...prev, learningRate: parseFloat(e.target.value) }))
              }
              className="w-full accent-indigo-500 h-1.5 bg-slate-900 rounded-lg cursor-pointer"
            />
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5 space-y-1.5">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-bold uppercase">Profondeur Batch (Tirages)</span>
              <span className="font-mono font-bold text-emerald-300">{hyperparams.batchDepth} T</span>
            </div>
            <input
              type="range"
              min="10"
              max="60"
              step="5"
              value={hyperparams.batchDepth}
              onChange={(e) =>
                setHyperparams((prev) => ({ ...prev, batchDepth: Number(e.target.value) }))
              }
              className="w-full accent-emerald-500 h-1.5 bg-slate-900 rounded-lg cursor-pointer"
            />
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5 space-y-1.5">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-bold uppercase">Momentum Polyak (β)</span>
              <span className="font-mono font-bold text-purple-300">{hyperparams.momentum}</span>
            </div>
            <input
              type="range"
              min="0.80"
              max="0.98"
              step="0.02"
              value={hyperparams.momentum}
              onChange={(e) =>
                setHyperparams((prev) => ({ ...prev, momentum: parseFloat(e.target.value) }))
              }
              className="w-full accent-purple-500 h-1.5 bg-slate-900 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* RÉSULTATS & CONVERGENCE DE PERTE */}
      {optimizationResult && (
        <div className="space-y-6">
          {/* KPI CARDS COMPARATIFS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-slate-900/60 rounded-2xl border border-white/10 flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Réduction de Perte</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black font-mono text-emerald-400">
                  -{optimizationResult.lossReductionPct}%
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  ({optimizationResult.initialLoss.toFixed(3)} → {optimizationResult.finalLoss.toFixed(3)})
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-900/60 rounded-2xl border border-white/10 flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Gain de Précision</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black font-mono text-cyan-400">
                  +{optimizationResult.accuracyGain}%
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  ({optimizationResult.initialAccuracy}% → {optimizationResult.finalAccuracy}%)
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-900/60 rounded-2xl border border-white/10 flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Échantillons d'Entraînement</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black font-mono text-indigo-400">
                  {optimizationResult.batchSize}
                </span>
                <span className="text-[10px] font-mono text-slate-400">tirages passés</span>
              </div>
            </div>

            <div className="p-4 bg-slate-900/60 rounded-2xl border border-white/10 flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Temps d'Inférence Gradient</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black font-mono text-purple-400">
                  {optimizationResult.trainingDurationMs} ms
                </span>
              </div>
            </div>
          </div>

          {/* COURBE DE CONVERGENCE NEURALE */}
          <div className="bg-slate-900/60 p-5 md:p-6 rounded-3xl border border-white/10 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown size={16} className="text-cyan-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-white">
                  Courbe de Convergence de Perte Cross-Entropy
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Statut : {optimizationResult.convergenceStatus}
              </span>
            </div>

            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lossCurveData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="epoch" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "rgba(255,255,255,0.1)",
                      borderRadius: "1rem",
                      fontSize: "11px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "5px" }} />
                  <Line
                    type="monotone"
                    dataKey="loss"
                    name="Perte Cross-Entropy"
                    stroke="#06b6d4"
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="accuracyDelta"
                    name="Gain Précision (%)"
                    stroke="#10b981"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* TABLEAU DÉTAILLÉ DES GRADIENTS ET ACTIONS PAR SOUS-ALGORITHME */}
          <div className="bg-slate-900/60 p-5 md:p-6 rounded-3xl border border-white/10 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-indigo-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-white">
                  Décomposition des Gradients & Verrouillage par Preuve
                </h3>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase text-slate-400">
                    <th className="py-2.5 px-3">Sous-Algorithme</th>
                    <th className="py-2.5 px-3 text-center">Poids Initial</th>
                    <th className="py-2.5 px-3 text-center">Poids Optimisé</th>
                    <th className="py-2.5 px-3 text-center">Variation Δw</th>
                    <th className="py-2.5 px-3 text-center">Gradient ∇L</th>
                    <th className="py-2.5 px-3 text-center">Preuve Empirique</th>
                    <th className="py-2.5 px-3 text-center">Action Neurale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {optimizationResult.algoGradients.map((item) => {
                    const isBoost = item.weightDelta > 0.001;
                    const isDamp = item.weightDelta < -0.001;

                    return (
                      <tr key={item.algoKey} className="hover:bg-white/5 transition-colors">
                        <td className="py-2 px-3">
                          <span className="font-bold text-white block">{item.label}</span>
                          <span className="text-[9px] text-slate-400 uppercase">{item.category}</span>
                        </td>

                        <td className="py-2 px-3 text-center text-slate-300">
                          {item.initialWeight.toFixed(4)}
                        </td>

                        <td className="py-2 px-3 text-center font-bold text-white">
                          {item.optimizedWeight.toFixed(4)}
                        </td>

                        <td className="py-2 px-3 text-center">
                          <span
                            className={`font-bold flex items-center justify-center gap-1 ${
                              isBoost
                                ? "text-emerald-400"
                                : isDamp
                                  ? "text-rose-400"
                                  : "text-slate-400"
                            }`}
                          >
                            {isBoost ? `+${item.weightDelta.toFixed(4)}` : item.weightDelta.toFixed(4)}
                            {isBoost && <TrendingUp size={11} />}
                            {isDamp && <TrendingDown size={11} />}
                          </span>
                        </td>

                        <td className="py-2 px-3 text-center text-slate-400">
                          {item.gradient.toFixed(5)}
                        </td>

                        <td className="py-2 px-3 text-center">
                          {item.hasEmpiricalProof ? (
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold">
                              +{item.proofScore.toFixed(1)}σ
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg bg-slate-950 text-slate-400 border border-white/10 text-[9px] font-bold">
                              0 preuve
                            </span>
                          )}
                        </td>

                        <td className="py-2 px-3 text-center">
                          {item.gatingAction === "PROOF_LOCKED" && (
                            <span className="px-2 py-0.5 rounded-lg bg-amber-950/80 text-amber-300 border border-amber-500/40 text-[9px] font-bold flex items-center justify-center gap-1">
                              <Lock size={10} /> Verrouillé
                            </span>
                          )}
                          {item.gatingAction === "BOOSTED" && (
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold">
                              Amplifié
                            </span>
                          )}
                          {item.gatingAction === "DAMPENED" && (
                            <span className="px-2 py-0.5 rounded-lg bg-rose-950/80 text-rose-300 border border-rose-500/40 text-[9px] font-bold">
                              Amorti
                            </span>
                          )}
                          {item.gatingAction === "MAINTAINED" && (
                            <span className="px-2 py-0.5 rounded-lg bg-slate-950 text-slate-400 border border-white/10 text-[9px] font-bold">
                              Stable
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
