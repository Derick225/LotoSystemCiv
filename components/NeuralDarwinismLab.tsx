import React, { useState } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { Dna, Play, Zap, RefreshCw, Activity, ShieldCheck, CheckCircle2, AlertCircle, Award, Sparkles, Sliders, BarChart3, ArrowUpRight } from 'lucide-react';
import { evolveNeuralDNACore } from '../services/trainingService';
import { purifyHistoryForDraw } from '../utils/arrayUtils';
import { audioEngine } from '../utils/audioEngine';
import { useToast } from './ui/Toast';
import { AlgoWeights, TrainingReport } from '../types';
import { LABELS_MAP } from '../hooks/useAlgorithmSync';

export const NeuralDarwinismLab: React.FC<{ drawName: string }> = ({ drawName }) => {
  const { showToast } = useToast();
  const history = useNexusStore(state => state.history);
  const globalWeights = useNexusStore(state => state.globalWeights);
  const setGlobalWeights = useNexusStore(state => state.setGlobalWeights);

  const [optimizerType, setOptimizerType] = useState<"genetic" | "pso" | "bayesian" | "meta">("genetic");
  const [generations, setGenerations] = useState<number>(15);
  const [sampleSize, setSampleSize] = useState<number>(30);

  const [isEvolving, setIsEvolving] = useState<boolean>(false);
  const [telemetryLogs, setTelemetryLogs] = useState<string[]>([]);
  const [evolutionResult, setEvolutionResult] = useState<{
    bestWeights: AlgoWeights;
    improvement: number;
    report: TrainingReport;
    isGeneralizable?: boolean | "unverifiable";
    overfittingRatio?: number;
  } | null>(null);

  const runEvolution = async () => {
    const cleanHistory = purifyHistoryForDraw(drawName, history);
    if (cleanHistory.length < 10) {
      showToast("Historique insuffisant pour l'évolution d'ADN (minimum 10 tirages).", "error");
      return;
    }

    setIsEvolving(true);
    setTelemetryLogs([]);
    setEvolutionResult(null);
    audioEngine.play("scan");

    try {
      const result = await evolveNeuralDNACore(
        drawName,
        cleanHistory,
        globalWeights,
        { generations, sampleSize, optimizerType },
        (logData) => {
          if (logData?.message) {
            setTelemetryLogs(prev => [...prev.slice(-12), logData.message]);
          }
        }
      );

      setEvolutionResult(result);
      audioEngine.play("success");
      showToast(`Évolution terminée : Gain d'efficacité +${(result.improvement * 100).toFixed(1)}%`, "success");
    } catch (err: any) {
      console.error(err);
      audioEngine.play("error");
      showToast(`Échec de l'évolution ADN: ${err.message || String(err)}`, "error");
    } finally {
      setIsEvolving(false);
    }
  };

  const applyEvolvedDNA = () => {
    if (!evolutionResult?.bestWeights) return;
    setGlobalWeights(evolutionResult.bestWeights);
    audioEngine.play("success");
    showToast("Nouvel ADN appliqué à l'ensemble du système !", "success");
  };

  // Extract top algorithm gene weights for visualization
  const topGenes = evolutionResult ? Object.entries(evolutionResult.bestWeights)
    .map(([key, value]) => ({ key, label: LABELS_MAP[key as keyof typeof LABELS_MAP] || key, val: value as number }))
    .sort((a, b) => b.val - a.val)
    .slice(0, 8) : [];

  return (
    <div className="bg-slate-950 p-6 md:p-8 rounded-[2rem] border border-slate-800 shadow-2xl space-y-8">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-6 border-b border-slate-800/80 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black text-[9px] rounded-full uppercase tracking-wider mb-3">
            <Dna size={12} /> Laboratoire Darwinien d'ADN Neural
          </div>
          <h3 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            Laboratoire d'Évolution ADN <span className="text-xs font-mono text-emerald-400">v12.0</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Optimise de façon stochastique déterministe les poids algorithmiques via opérateurs génétiques (mutation fermée de Dirichlet, sélection de Pareto, validation Holdout sans fuite).
          </p>
        </div>

        <button
          onClick={runEvolution}
          disabled={isEvolving}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg border border-emerald-400/40 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          <Zap size={16} className={isEvolving ? "animate-bounce" : ""} />
          {isEvolving ? "Évolution en cours..." : "Lancer l'Évolution ADN"}
        </button>
      </div>

      {/* PARAMETERS CONFIG */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800/80">
        <div>
          <label className="block text-[9px] font-black uppercase text-slate-400 mb-1.5">Algorithme d'Optimisation</label>
          <select
            value={optimizerType}
            onChange={(e: any) => setOptimizerType(e.target.value)}
            disabled={isEvolving}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none"
          >
            <option value="genetic">Darwinisme Neural (Génétique)</option>
            <option value="pso">Essaim Particulaire (PSO)</option>
            <option value="bayesian">Inférence Bayésienne (GPR)</option>
            <option value="meta">Méta-Apprentissage Adaptatif</option>
          </select>
        </div>

        <div>
          <label className="block text-[9px] font-black uppercase text-slate-400 mb-1.5">Générations ({generations})</label>
          <input
            type="range"
            min={5}
            max={50}
            step={5}
            value={generations}
            onChange={(e) => setGenerations(Number(e.target.value))}
            disabled={isEvolving}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 mt-2"
          />
        </div>

        <div>
          <label className="block text-[9px] font-black uppercase text-slate-400 mb-1.5">Échantillon Apprentissage ({sampleSize} tirages)</label>
          <input
            type="range"
            min={10}
            max={60}
            step={5}
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
            disabled={isEvolving}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 mt-2"
          />
        </div>
      </div>

      {/* TELEMETRY STREAM LOGS */}
      {telemetryLogs.length > 0 && (
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 font-mono text-[10px] space-y-1">
          <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Activity size={12} /> Télémétrie Génétique en Direct
          </div>
          {telemetryLogs.map((log, i) => (
            <div key={i} className="text-slate-400">
              <span className="text-emerald-500 mr-2">›</span>{log}
            </div>
          ))}
        </div>
      )}

      {/* EVOLUTION RESULTS & TOP GENES */}
      {evolutionResult && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 p-6 rounded-3xl border border-slate-800 space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h4 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <Award className="text-amber-400" size={18} /> Génome Optimisé Résultant
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Holdout Verifiable : {evolutionResult.isGeneralizable ? "Oui (Généralisation Confirmée)" : "Échantillon restreint"}
                </p>
              </div>

              <button
                onClick={applyEvolvedDNA}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase rounded-xl border border-emerald-300 shadow-lg shadow-emerald-500/10 transition-all flex items-center gap-2"
              >
                <Sparkles size={14} /> Injecter cet ADN dans les Poids Globaux
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                <span className="text-[9px] font-black uppercase text-slate-500">Gain d'Efficacité</span>
                <span className="text-2xl font-black text-emerald-400 mt-1 block font-mono">
                  +{(evolutionResult.improvement * 100).toFixed(1)}%
                </span>
              </div>
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                <span className="text-[9px] font-black uppercase text-slate-500">Moyenne Hits / Tirage</span>
                <span className="text-2xl font-black text-indigo-400 mt-1 block font-mono">
                  {evolutionResult.report.averageHits.toFixed(2)} / 5
                </span>
              </div>
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-900">
                <span className="text-[9px] font-black uppercase text-slate-500">Score de Fitness Global</span>
                <span className="text-2xl font-black text-amber-400 mt-1 block font-mono">
                  {evolutionResult.report.score.toFixed(1)}
                </span>
              </div>
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-900">
                <span className="text-[9px] font-black uppercase text-slate-500">Ratio Surapprentissage</span>
                <span className={`text-2xl font-black mt-1 block font-mono ${evolutionResult.overfittingRatio && evolutionResult.overfittingRatio > 1.25 ? "text-amber-400" : "text-emerald-400"}`}>
                  {evolutionResult.overfittingRatio ? evolutionResult.overfittingRatio.toFixed(2) : "1.00"}
                </span>
              </div>
            </div>

            {/* TOP CHROMOSOMES MAP */}
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-3">
                Distribution de Dominance des Gènes Algorithmiques (Top 8)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {topGenes.map((gene, i) => (
                  <div key={gene.key} className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80 space-y-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-slate-300 truncate">{gene.label}</span>
                      <span className="font-mono font-black text-emerald-400">{(gene.val * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, gene.val * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
