import React, { useState, useMemo } from "react";
import { useNexusStore } from "../store/useNexusStore";
import {
  Dna,
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
  Download,
  Upload,
  Cpu,
  Layers,
  Compass,
} from "lucide-react";
import { evolveNeuralDNACore } from "../services/trainingService";
import { purifyHistoryForDraw } from "../utils/arrayUtils";
import { audioEngine } from "../utils/audioEngine";
import { useToast } from "./ui/Toast";
import { AlgoWeights, TrainingReport, AlgoKey } from "../types";
import { LABELS_MAP } from "../hooks/useAlgorithmSync";
import { ExportService } from "../services/exportService";

interface TelemetryPoint {
  gen: number;
  bestFitness: number;
  avgFitness: number;
  diversity: number;
}

export const NeuralDarwinismLab: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const setGlobalWeights = useNexusStore((state) => state.setGlobalWeights);

  const [optimizerType, setOptimizerType] = useState<
    "genetic" | "pso" | "bayesian" | "meta" | "gradient"
  >("gradient");
  const [generations, setGenerations] = useState<number>(20);
  const [sampleSize, setSampleSize] = useState<number>(30);

  const [isEvolving, setIsEvolving] = useState<boolean>(false);
  const [telemetryLogs, setTelemetryLogs] = useState<string[]>([]);
  const [telemetryCurve, setTelemetryCurve] = useState<TelemetryPoint[]>([]);
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
        "Historique insuffisant pour l'évolution d'ADN (minimum 10 tirages requis).",
        "error",
      );
      return;
    }

    setIsEvolving(true);
    setTelemetryLogs([]);
    setTelemetryCurve([]);
    setEvolutionResult(null);
    audioEngine.play("scan");

    try {
      const result = await evolveNeuralDNACore(
        drawName,
        cleanHistory,
        globalWeights,
        { generations, sampleSize, optimizerType },
        (logData) => {
          if (logData?.gen !== undefined) {
            setTelemetryCurve((prev) => [
              ...prev,
              {
                gen: logData.gen,
                bestFitness: logData.bestFitness || 0,
                avgFitness: logData.avgFitness || 0,
                diversity: logData.diversity || 0,
              },
            ]);
            const logMsg = `Gen ${logData.gen} | Fitness max: ${logData.bestFitness?.toFixed(3)} | Div: ${((logData.diversity || 0) * 100).toFixed(1)}%`;
            setTelemetryLogs((prev) => [...prev.slice(-10), logMsg]);
          } else if (logData?.message) {
            setTelemetryLogs((prev) => [...prev.slice(-10), logData.message]);
          }
        },
      );

      setEvolutionResult(result);
      audioEngine.play("success");
      showToast(
        `Évolution terminée avec succès : Gain d'efficacité ${(result.improvement * 100) >= 0 ? "+" : ""}${(result.improvement * 100).toFixed(1)}%`,
        "success",
      );
    } catch (err: any) {
      console.error(err);
      audioEngine.play("error");
      showToast(
        `Échec de l'évolution ADN : ${err.message || String(err)}`,
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
    showToast(`ADN optimisé appliqué avec succès pour ${drawName} !`, "success");
  };

  const exportCurrentDNA = () => {
    const weightsToExport = evolutionResult?.bestWeights || globalWeights;
    ExportService.exportDNA(weightsToExport, drawName);
    showToast("Profil ADN exporté en JSON", "success");
  };

  const handleImportDNA = async () => {
    try {
      const importedWeights = await ExportService.importDNA();
      setGlobalWeights(importedWeights);
      showToast("Profil ADN importé et injecté avec succès", "success");
      audioEngine.play("success");
    } catch (e: any) {
      showToast(e.message || "Erreur d'import", "error");
    }
  };

  // Groupement des gènes par familles fonctionnelles (Zéro nombre magique)
  const geneClusters = useMemo(() => {
    const weights = evolutionResult?.bestWeights || globalWeights;
    const clusters: Record<string, { label: string; score: number; count: number }> = {
      spatial: { label: "Physique & Topologie", score: 0, count: 0 },
      sequential: { label: "Séquentiel & Markov", score: 0, count: 0 },
      stochastic: { label: "Fréquence & Dynamique", score: 0, count: 0 },
      bayesian: { label: "Apprentissage & Méta", score: 0, count: 0 },
    };

    Object.entries(weights).forEach(([key, val]) => {
      const numVal = (val as number) || 0;
      if (["spatial", "fractal", "spectral", "quantum", "harmonic"].includes(key)) {
        clusters.spatial.score += numVal;
        clusters.spatial.count++;
      } else if (["markov", "temporal", "pattern", "affinity", "fibonacci"].includes(key)) {
        clusters.sequential.score += numVal;
        clusters.sequential.count++;
      } else if (["bayes", "neural", "meta", "rl"].includes(key)) {
        clusters.bayesian.score += numVal;
        clusters.bayesian.count++;
      } else {
        clusters.stochastic.score += numVal;
        clusters.stochastic.count++;
      }
    });

    return clusters;
  }, [evolutionResult, globalWeights]);

  // Extraction du Top 8 des gènes
  const topGenes = useMemo(() => {
    const weights = evolutionResult?.bestWeights || globalWeights;
    return Object.entries(weights)
      .map(([key, value]) => ({
        key,
        label: LABELS_MAP[key as keyof typeof LABELS_MAP] || key,
        val: (value as number) || 0,
      }))
      .sort((a, b) => b.val - a.val)
      .slice(0, 8);
  }, [evolutionResult, globalWeights]);

  // Points min/max pour le tracé SVG de la courbe de fitness
  const fitnessSvgPoints = useMemo(() => {
    if (telemetryCurve.length < 2) return "";
    const minFit = Math.min(...telemetryCurve.map((p) => p.bestFitness));
    const maxFit = Math.max(...telemetryCurve.map((p) => p.bestFitness));
    const range = maxFit - minFit || 1;

    return telemetryCurve
      .map((p, i) => {
        const x = (i / (telemetryCurve.length - 1)) * 300;
        const y = 80 - ((p.bestFitness - minFit) / range) * 60;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [telemetryCurve]);

  return (
    <div className="w-full space-y-8 pb-12 animate-fade-in">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] rounded-lg uppercase tracking-wider mb-2">
            <Dna size={12} /> Laboratoire d'Évolution ADN & Darwinisme
          </div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
            Optimisation Bio-Inspirée du Génome ({drawName})
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-medium max-w-xl">
            Convergence déterministe des hyperparamètres par algorithmes génétiques, essaims particulaires (PSO) et GPR bayésien.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={exportCurrentDNA}
            className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Exporter l'ADN actuel en JSON"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Exporter</span>
          </button>
          <button
            onClick={handleImportDNA}
            className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Importer un fichier ADN"
          >
            <Upload size={14} />
            <span className="hidden sm:inline">Importer</span>
          </button>
          <button
            onClick={runEvolution}
            disabled={isEvolving}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer whitespace-nowrap"
          >
            <Zap size={15} className={isEvolving ? "animate-pulse" : ""} />
            <span>{isEvolving ? "Évolution en cours..." : "Lancer l'Évolution ADN"}</span>
          </button>
        </div>
      </div>

      {/* PARAMETERS CONFIG */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2.5">
            Moteur d'Optimisation
          </label>
          <select
            value={optimizerType}
            onChange={(e: any) => setOptimizerType(e.target.value)}
            disabled={isEvolving}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none uppercase tracking-wider"
          >
            <option value="gradient">Descente de Gradient Continue (SGD)</option>
            <option value="meta">Omni-Méta Hybride (Ensemble 4-Moteurs)</option>
            <option value="genetic">Darwin (Algorithme Génétique)</option>
            <option value="pso">PSO (Essaim Particulaire)</option>
            <option value="bayesian">Bayes (Processus Gaussien GPR)</option>
          </select>
        </div>

        <div>
          <div className="flex justify-between items-end mb-2.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Générations</span>
            <span className="text-sm font-black text-slate-800 dark:text-slate-100 font-mono">{generations}</span>
          </div>
          <input
            type="range"
            min={5}
            max={50}
            step={5}
            value={generations}
            onChange={(e) => setGenerations(Number(e.target.value))}
            disabled={isEvolving}
            className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-emerald-500"
          />
        </div>

        <div>
          <div className="flex justify-between items-end mb-2.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Échantillon (Tirages)</span>
            <span className="text-sm font-black text-slate-800 dark:text-slate-100 font-mono">{sampleSize}</span>
          </div>
          <input
            type="range"
            min={10}
            max={60}
            step={5}
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
            disabled={isEvolving}
            className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-emerald-500"
          />
        </div>
      </div>

      {/* CLUSTERS OVERVIEW & GENETIC PROFILE */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(geneClusters).map(([key, cluster]) => (
          <div
            key={key}
            className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-2"
          >
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
              {cluster.label}
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-black font-mono text-slate-800 dark:text-white">
                {(cluster.score * 100).toFixed(1)}%
              </span>
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {cluster.count} algos
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, cluster.score * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* TELEMETRY STREAM LOGS & LIVE SVG CURVE */}
      {(telemetryLogs.length > 0 || isEvolving) && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-950 p-6 rounded-3xl border border-slate-900 text-slate-300">
          <div className="md:col-span-7 space-y-3 font-mono text-[10px]">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-900 pb-2">
              <span className="flex items-center gap-1.5">
                <Activity size={12} className="text-emerald-400" />
                Journal de Télémétrie Génétique
              </span>
              <span className="text-emerald-400">{isEvolving ? "Calcul en direct" : "Terminé"}</span>
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-2">
              {telemetryLogs.map((log, i) => (
                <div key={i} className="text-emerald-400/90 flex items-start gap-1.5">
                  <span className="text-emerald-600">›</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SVG Progression Curve */}
          <div className="md:col-span-5 flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-900 pt-4 md:pt-0 md:pl-6">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Courbe d'Adaptation (Fitness Max)
            </span>
            <div className="h-24 w-full flex items-center justify-center my-2">
              {telemetryCurve.length >= 2 ? (
                <svg viewBox="0 0 300 80" className="w-full h-full overflow-visible">
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={fitnessSvgPoints}
                  />
                </svg>
              ) : (
                <span className="text-[10px] text-slate-600 italic">
                  Génération des points de convergence...
                </span>
              )}
            </div>
            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
              <span>Génération 1</span>
              <span>Génération {generations}</span>
            </div>
          </div>
        </div>
      )}

      {/* EVOLUTION RESULTS & TOP GENES */}
      {evolutionResult && (
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-8 animate-fade-in">
          <div className="flex flex-wrap justify-between items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-500" />
                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                  Génome Optimisé & Validé OOS
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Évaluation Holdout :{" "}
                <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">
                  {evolutionResult.isGeneralizable === true
                    ? "Généralisable (Zéro Sur-ajustement)"
                    : evolutionResult.isGeneralizable === false
                    ? "Régularisé par Blending"
                    : "Échantillon Restreint"}
                </span>
              </p>
            </div>

            <button
              onClick={applyEvolvedDNA}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <Sparkles size={14} />
              <span>Appliquer au Modèle Actif</span>
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Gain d'Efficacité
              </span>
              <span className="text-2xl font-black text-emerald-500 mt-1 block font-mono">
                {(evolutionResult.improvement * 100) >= 0 ? "+" : ""}
                {(evolutionResult.improvement * 100).toFixed(1)}%
              </span>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Moyenne Hits / Tirage
              </span>
              <span className="text-2xl font-black text-indigo-500 mt-1 block font-mono">
                {evolutionResult.report.averageHits.toFixed(2)} / 5
              </span>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Score Fitness Global
              </span>
              <span className="text-2xl font-black text-slate-800 dark:text-white mt-1 block font-mono">
                {evolutionResult.report.score.toFixed(1)}
              </span>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Ratio Surapprentissage
              </span>
              <span
                className={`text-2xl font-black mt-1 block font-mono ${
                  evolutionResult.overfittingRatio && evolutionResult.overfittingRatio > 1.25
                    ? "text-amber-500"
                    : "text-emerald-500"
                }`}
              >
                {evolutionResult.overfittingRatio
                  ? evolutionResult.overfittingRatio.toFixed(2)
                  : "1.00"}
              </span>
            </div>
          </div>

          {/* TOP CHROMOSOMES MAP */}
          <div className="space-y-4">
            <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white block">
              Gènes Dominants du Nouveau Profil ADN (Top 8)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {topGenes.map((gene) => (
                <div
                  key={gene.key}
                  className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/80 space-y-2"
                >
                  <div className="flex justify-between items-baseline text-xs">
                    <span className="font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider truncate mr-2">
                      {gene.label}
                    </span>
                    <span className="font-mono font-black text-emerald-500">
                      {(gene.val * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, gene.val * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
