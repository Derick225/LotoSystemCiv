import React, { useState, useMemo } from 'react';
import {
  BrainCircuit,
  Play,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  Zap,
  Sliders,
  RotateCcw,
  CheckCircle2,
  Lock,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  runNeuralSelfOptimization,
  NeuralOptimizationResult,
  DEFAULT_NEURAL_HYPERPARAMS,
  NeuralHyperparameters,
} from '../../services/prediction/neuralSelfOptimizationService';
import { AlgoKey, AlgoWeights } from '../../shared/prediction.types';
import { DrawResult } from '../../types';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { audioEngine } from '../../utils/audioEngine';
import { useNexusStore } from '../../store/useNexusStore';

interface NeuralAutoOptimizationPanelProps {
  drawName: string;
  history: DrawResult[];
  currentWeights: AlgoWeights;
  onApplyWeights?: (newWeights: AlgoWeights) => void;
}

export const NeuralAutoOptimizationPanel: React.FC<NeuralAutoOptimizationPanelProps> = ({
  drawName,
  history,
  currentWeights,
  onApplyWeights,
}) => {
  const updateGlobalWeights = useNexusStore((state) => state.updateGlobalWeights);
  const refreshData = useNexusStore((state) => state.refreshData);

  const [hyperparams, setHyperparams] = useState<NeuralHyperparameters>(DEFAULT_NEURAL_HYPERPARAMS);
  const [isTraining, setIsTraining] = useState(false);
  const [result, setResult] = useState<NeuralOptimizationResult | null>(null);
  const [applied, setApplied] = useState(false);

  const handleRunOptimization = () => {
    setIsTraining(true);
    setApplied(false);
    audioEngine.play('scan');

    // Execution synchrone optimisée et vectorisée avec délai UI pour fluidité
    setTimeout(() => {
      try {
        const optResult = runNeuralSelfOptimization(
          drawName,
          history,
          currentWeights,
          hyperparams
        );
        setResult(optResult);
        audioEngine.play('success');
      } catch (err) {
        console.error('Erreur lors de l\'auto-optimisation neurale :', err);
        audioEngine.play('error');
      } finally {
        setIsTraining(false);
      }
    }, 150);
  };

  const handleApply = async () => {
    if (!result) return;
    audioEngine.play('click');
    if (onApplyWeights) {
      onApplyWeights(result.optimizedWeights);
    } else {
      await updateGlobalWeights(result.optimizedWeights, drawName);
      await refreshData(drawName, true);
    }
    setApplied(true);
    audioEngine.play('success');
  };

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800/80 rounded-3xl p-6 sm:p-8 space-y-8 shadow-2xl backdrop-blur-xl">
      {/* Header & Principle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <BrainCircuit size={18} />
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-400">
              Rétropropagation Analytique & Softmax L2
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
            Auto-Optimisation Neurale des Poids
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Ajustement vectorisé par descente de gradient avec verrouillage strict par preuve empirique sur <strong className="text-emerald-400">{drawName}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRunOptimization}
            disabled={isTraining || history.length < 5}
            className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg ${
              isTraining
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-violet-600 hover:bg-violet-500 text-white shadow-violet-600/20 active:scale-95'
            }`}
          >
            {isTraining ? (
              <>
                <RotateCcw size={15} className="animate-spin" />
                Rétropropagation...
              </>
            ) : (
              <>
                <Play size={15} className="fill-current" />
                Lancer l'Optimisation
              </>
            )}
          </button>
        </div>
      </div>

      {/* Hyperparameters Configuration Bar */}
      <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Sliders size={14} className="text-violet-400" /> Hyperparamètres de Rétropropagation
          </span>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            Zéro Aléa • 100% Déterministe
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Époques</span>
              <span className="font-mono font-bold text-violet-300">{hyperparams.epochs}</span>
            </div>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={hyperparams.epochs}
              onChange={(e) => setHyperparams({ ...hyperparams, epochs: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-slate-800 rounded-full appearance-none accent-violet-500 cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Taux d'Apprentissage (LR)</span>
              <span className="font-mono font-bold text-violet-300">{hyperparams.learningRate}</span>
            </div>
            <input
              type="range"
              min="0.01"
              max="0.20"
              step="0.01"
              value={hyperparams.learningRate}
              onChange={(e) => setHyperparams({ ...hyperparams, learningRate: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-slate-800 rounded-full appearance-none accent-violet-500 cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Momentum Polyak</span>
              <span className="font-mono font-bold text-violet-300">{hyperparams.momentum}</span>
            </div>
            <input
              type="range"
              min="0.70"
              max="0.98"
              step="0.02"
              value={hyperparams.momentum}
              onChange={(e) => setHyperparams({ ...hyperparams, momentum: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-slate-800 rounded-full appearance-none accent-violet-500 cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Profondeur du Batch</span>
              <span className="font-mono font-bold text-violet-300">{hyperparams.batchDepth} tirages</span>
            </div>
            <input
              type="range"
              min="10"
              max={Math.max(15, history.length)}
              step="5"
              value={hyperparams.batchDepth}
              onChange={(e) => setHyperparams({ ...hyperparams, batchDepth: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-slate-800 rounded-full appearance-none accent-violet-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Training Results Section */}
      {result && (
        <div className="space-y-6 animate-fade-in">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400 block">Réduction de Perte</span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
                  -{result.lossReductionPct}%
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  {result.initialLoss.toFixed(3)} ➔ {result.finalLoss.toFixed(3)}
                </span>
              </div>
            </div>

            <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400 block">Précision Top-5</span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-black font-mono text-violet-400">
                  {result.finalAccuracy.toFixed(1)}%
                </span>
                <span className={`text-[10px] font-mono font-bold ${result.accuracyGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {result.accuracyGain >= 0 ? `+${result.accuracyGain}%` : `${result.accuracyGain}%`}
                </span>
              </div>
            </div>

            <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400 block">Échantillon Entraîné</span>
              <span className="text-xl sm:text-2xl font-black font-mono text-cyan-400">
                {result.batchSize} <span className="text-xs text-slate-400">tirages</span>
              </span>
            </div>

            <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400 block">Temps d'Inférence</span>
              <span className="text-xl sm:text-2xl font-black font-mono text-amber-400">
                {result.trainingDurationMs} <span className="text-xs text-slate-400">ms</span>
              </span>
            </div>
          </div>

          {/* Convergence Curves */}
          <div className="bg-slate-950/60 p-6 rounded-3xl border border-slate-800 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">
                Courbe de Rétropropagation Multi-Époques
              </h3>
              <span className="text-[10px] font-mono text-slate-400">
                Statut : <strong className="text-emerald-400">{result.convergenceStatus}</strong>
              </span>
            </div>

            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.epochHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" opacity={0.5} />
                  <XAxis dataKey="epoch" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis yAxisId="loss" tick={{ fill: '#f59e0b', fontSize: 10 }} domain={['auto', 'auto']} />
                  <YAxis yAxisId="delta" orientation="right" tick={{ fill: '#818cf8', fontSize: 10 }} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px', borderRadius: '12px' }}
                    itemStyle={{ color: '#c7d2fe' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Line
                    yAxisId="loss"
                    type="monotone"
                    name="Perte Cross-Entropy"
                    dataKey="loss"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="delta"
                    type="monotone"
                    name="Norme du Gradient"
                    dataKey="gradientNorm"
                    stroke="#818cf8"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gradients and Actions Table */}
          <div className="bg-slate-950/60 p-6 rounded-3xl border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">
                  Attribution des Gradients & Verrouillage par Preuve
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Règle absolue : Qu'aucun algorithme ne voie son poids augmenté s'il ne fait pas ses preuves.
                </p>
              </div>

              <button
                onClick={handleApply}
                disabled={applied}
                className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                  applied
                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 active:scale-95'
                }`}
              >
                {applied ? (
                  <>
                    <CheckCircle2 size={14} /> Poids Actifs Appliqués
                  </>
                ) : (
                  <>
                    <Sparkles size={14} /> Appliquer les Nouveaux Poids
                  </>
                )}
              </button>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="py-2.5 px-3">Algorithme</th>
                    <th className="py-2.5 px-3">Catégorie</th>
                    <th className="py-2.5 px-3 text-right">Poids Initial</th>
                    <th className="py-2.5 px-3 text-right">Poids Optimisé</th>
                    <th className="py-2.5 px-3 text-right">Variation (Δ)</th>
                    <th className="py-2.5 px-3 text-center">Preuve Statistique</th>
                    <th className="py-2.5 px-3 text-center">Action Neurale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {result.algoGradients.map((item) => {
                    const isPositive = item.weightDelta > 0;
                    const isNeutral = item.weightDelta === 0;

                    return (
                      <tr key={item.algoKey} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2.5 px-3 font-sans font-bold text-slate-200">
                          {item.label}
                        </td>
                        <td className="py-2.5 px-3 font-sans text-slate-400 text-[11px]">
                          {item.category}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-400">
                          {(item.initialWeight * 100).toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-white">
                          {(item.optimizedWeight * 100).toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`inline-flex items-center gap-0.5 font-bold ${
                            isPositive ? 'text-emerald-400' : isNeutral ? 'text-slate-400' : 'text-rose-400'
                          }`}>
                            {isPositive ? <ArrowUpRight size={12} /> : isNeutral ? <Minus size={12} /> : <ArrowDownRight size={12} />}
                            {isPositive ? `+${(item.weightDelta * 100).toFixed(2)}%` : `${(item.weightDelta * 100).toFixed(2)}%`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {item.hasEmpiricalProof ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <ShieldCheck size={11} /> Prouvé (+{item.proofScore})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-slate-800 text-slate-400 border border-slate-700">
                              Non Prouvé
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {item.gatingAction === 'PROOF_LOCKED' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              <Lock size={10} /> Hausse Bloquée (Sans Preuve)
                            </span>
                          )}
                          {item.gatingAction === 'BOOSTED' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <ArrowUpRight size={10} /> Amplifié
                            </span>
                          )}
                          {item.gatingAction === 'DAMPENED' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              <ArrowDownRight size={10} /> Amorti
                            </span>
                          )}
                          {item.gatingAction === 'MAINTAINED' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans text-slate-400 bg-slate-800/40">
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
