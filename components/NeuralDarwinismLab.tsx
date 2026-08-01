import React, { useState } from "react";
import { useNexusStore } from "../store/useNexusStore";
import {
  Dna,
  Play,
  Zap,
  RefreshCw,
  Activity,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Award,
  Sparkles,
  Sliders,
  BarChart3,
  ArrowUpRight,
} from "lucide-react";
import { evolveNeuralDNACore } from "../services/trainingService";
import { purifyHistoryForDraw } from "../utils/arrayUtils";
import { audioEngine } from "../utils/audioEngine";
import { useToast } from "./ui/Toast";
import { AlgoWeights, TrainingReport } from "../types";
import { LABELS_MAP } from "../hooks/useAlgorithmSync";

export const NeuralDarwinismLab: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const setGlobalWeights = useNexusStore((state) => state.setGlobalWeights);

  const [optimizerType, setOptimizerType] = useState<
    "genetic" | "pso" | "bayesian" | "meta"
  >("genetic");
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
      showToast(
        "Historique insuffisant pour l'évolution d'ADN (minimum 10 tirages).",
        "error",
      );
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
            setTelemetryLogs((prev) => [...prev.slice(-12), logData.message]);
          }
        },
      );

      setEvolutionResult(result);
      audioEngine.play("success");
      showToast(
        `Évolution terminée : Gain d'efficacité +${(result.improvement * 100).toFixed(1)}%`,
        "success",
      );
    } catch (err: any) {
      console.error(err);
      audioEngine.play("error");
      showToast(
        `Échec de l'évolution ADN: ${err.message || String(err)}`,
        "error",
      );
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
  const topGenes = evolutionResult
    ? Object.entries(evolutionResult.bestWeights)
        .map(([key, value]) => ({
          key,
          label: LABELS_MAP[key as keyof typeof LABELS_MAP] || key,
          val: value as number,
        }))
        .sort((a, b) => b.val - a.val)
        .slice(0, 8)
    : [];

  return (
    <div className="w-full space-y-10 pb-12">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-6 pb-6 border-b border-slate-800/50">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-900 text-emerald-500 font-black text-[9px] rounded-lg uppercase tracking-widest mb-3">
            <Dna size={12} /> Laboratoire Darwinien d'ADN Neural
          </div>
          <h3 className="text-xl font-bold text-white uppercase tracking-widest flex items-center gap-2">
            Laboratoire d'Évolution ADN
          </h3>
          <p className="text-xs text-slate-400 mt-2 max-w-xl">
            Optimise de façon stochastique déterministe les poids algorithmiques
            via opérateurs génétiques.
          </p>
        </div>

        <button
          onClick={runEvolution}
          disabled={isEvolving}
          className="px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[12px] uppercase tracking-widest rounded-xl transition-colors flex items-center gap-3 disabled:opacity-50 whitespace-nowrap"
        >
          <Zap size={16} className={isEvolving ? "animate-pulse" : ""} />
          {isEvolving ? "Évolution en cours..." : "Lancer l'Évolution ADN"}
        </button>
      </div>

      {/* PARAMETERS CONFIG */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 bg-slate-900/30 p-8 rounded-2xl">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-4">
            Moteur de Résolution
          </label>
          <select
            value={optimizerType}
            onChange={(e: any) => setOptimizerType(e.target.value)}
            disabled={isEvolving}
            className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-3 text-[12px] font-bold text-slate-300 focus:outline-none uppercase tracking-wider"
          >
            <option value="genetic">Darwin (Génétique)</option>
            <option value="pso">PSO (Particules)</option>
            <option value="bayesian">Bayes (GPR)</option>
            <option value="meta">Omni (Méta-Adaptatif)</option>
          </select>
        </div>

        <div>
          <label className="flex justify-between items-end mb-4">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Générations</span>
            <span className="text-lg font-black text-slate-200">{generations}</span>
          </label>
          <input
            type="range"
            min={5}
            max={50}
            step={5}
            value={generations}
            onChange={(e) => setGenerations(Number(e.target.value))}
            disabled={isEvolving}
            className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-emerald-500 mt-2"
          />
        </div>

        <div>
          <label className="flex justify-between items-end mb-4">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Échantillon (Tirages)</span>
            <span className="text-lg font-black text-slate-200">{sampleSize}</span>
          </label>
          <input
            type="range"
            min={10}
            max={60}
            step={5}
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
            disabled={isEvolving}
            className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-emerald-500 mt-2"
          />
        </div>
      </div>

      {/* TELEMETRY STREAM LOGS */}
      {telemetryLogs.length > 0 && (
        <div className="bg-slate-950 p-6 rounded-2xl font-mono text-[10px] space-y-2 border border-slate-900/50">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">
            Télémétrie Génétique
          </div>
          {telemetryLogs.map((log, i) => (
            <div key={i} className="text-emerald-500/80">
              <span className="text-emerald-600 mr-2">›</span>
              {log}
            </div>
          ))}
        </div>
      )}

      {/* EVOLUTION RESULTS & TOP GENES */}
      {evolutionResult && (
        <div className="space-y-10">
          <div className="bg-slate-900/20 p-8 rounded-2xl space-y-10">
            <div className="flex flex-wrap justify-between items-center gap-6">
              <div>
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                  Génome Optimisé
                </h4>
                <p className="text-[12px] font-black text-slate-300">
                  Holdout Verifiable :{" "}
                  {evolutionResult.isGeneralizable
                    ? "Oui"
                    : "Échantillon restreint"}
                </p>
              </div>

              <button
                onClick={applyEvolvedDNA}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] uppercase tracking-widest rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                Sauvegarder l'ADN
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-900/50">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Gain d'Efficacité
                </span>
                <span className="text-2xl font-black text-emerald-400 mt-3 block font-mono">
                  +{(evolutionResult.improvement * 100).toFixed(1)}%
                </span>
              </div>
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-900/50">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Moyenne Hits / Tirage
                </span>
                <span className="text-2xl font-black text-indigo-400 mt-3 block font-mono">
                  {evolutionResult.report.averageHits.toFixed(2)}
                </span>
              </div>
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-900/50">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Score de Fitness Global
                </span>
                <span className="text-2xl font-black text-slate-300 mt-3 block font-mono">
                  {evolutionResult.report.score.toFixed(1)}
                </span>
              </div>
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-900/50">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Ratio Surapprentissage
                </span>
                <span
                  className={`text-2xl font-black mt-3 block font-mono ${evolutionResult.overfittingRatio && evolutionResult.overfittingRatio > 1.25 ? "text-amber-400" : "text-emerald-400"}`}
                >
                  {evolutionResult.overfittingRatio
                    ? evolutionResult.overfittingRatio.toFixed(2)
                    : "1.00"}
                </span>
              </div>
            </div>

            {/* TOP CHROMOSOMES MAP */}
            <div className="pt-4">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 block mb-6">
                Distribution de Dominance (Top 8)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {topGenes.map((gene, i) => (
                  <div
                    key={gene.key}
                    className="bg-slate-950 p-4 rounded-xl border border-slate-900/50 space-y-3"
                  >
                    <div className="flex justify-between items-baseline text-[11px]">
                      <span className="font-bold text-slate-400 uppercase tracking-widest truncate mr-2">
                        {gene.label}
                      </span>
                      <span className="font-mono font-black text-emerald-500">
                        {(gene.val * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500/80 h-full rounded-full transition-all duration-500"
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
