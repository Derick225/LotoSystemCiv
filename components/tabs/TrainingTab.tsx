import React, { useState, useEffect, useRef } from "react";
import {
  evolveNeuralDNA,
  runBacktestTrainingAsync,
  terminateActiveWorkers,
} from "../../services/trainingService";
import { runSurvivalSimulation } from "../../services/backtestingEngine";
import {
  normalizeWeights,
  getAlgoWeights,
} from "../../services/predictionEngine";
import { useNexusStore } from "../../store/useNexusStore";
import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import {
  BrainCircuit,
  Play,
  Square,
  Activity,
  Cpu,
  Download,
  Upload,
  RefreshCw,
  LineChart,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { NeuralDarwinismLab } from "../NeuralDarwinismLab";
import type { AlgoWeights, TrainingReport } from "../../types";
import { ExportService } from "../../services/exportService";
import { AlgoKey, DEFAULT_ALGO_WEIGHTS } from "../../shared/prediction.types";
import { LABELS_MAP } from "../../hooks/useAlgorithmSync";
import { runRollingValidation, RollingValidationReport } from "../../services/rollingValidationService";
import { notificationService, ScheduledDraw } from "../../services/notificationService";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart as ReLineChart,
  Line,
  Legend,
  CartesianGrid,
} from "recharts";

// Utility for formatting labels strictly to avoid wrapping
const formatLabel = (key: string) => LABELS_MAP[key as AlgoKey] || key;

export const TrainingTab: React.FC<{ drawName: string }> = ({ drawName }) => {
  const { showToast } = useToast();
  const updateGlobalWeights = useNexusStore((state) => state.updateGlobalWeights);
  const refreshData = useNexusStore((state) => state.refreshData);
  const history = useNexusStore((state) => state.history);

  // Core Config
  const [generations, setGenerations] = useState(50);
  const [sampleSize, setSampleSize] = useState(100);
  const [optimizerType, setOptimizerType] = useState<"pso" | "genetic" | "bayesian" | "meta">("meta");
  
  // State
  const [status, setStatus] = useState<"idle" | "running" | "completed">("idle");
  const [activeView, setActiveView] = useState<"training" | "darwinian">("training");
  const [logs, setLogs] = useState<string[]>([]);
  const [evolutionData, setEvolutionData] = useState<Array<{ gen: number; bestFitness: number; diversity: number; bestGenome: AlgoWeights }>>([]);
  
  const [originalWeights, setOriginalWeights] = useState<AlgoWeights>(DEFAULT_ALGO_WEIGHTS);
  const [liveWeights, setLiveWeights] = useState<AlgoWeights>(DEFAULT_ALGO_WEIGHTS);
  
  const [finalReport, setFinalReport] = useState<TrainingReport | null>(null);

  // Rolling Cross Validation State
  const [rollingWindowSize, setRollingWindowSize] = useState<number>(100);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationProgress, setValidationProgress] = useState<number>(0);
  const [validationReport, setValidationReport] = useState<RollingValidationReport | null>(null);
  
  // Ref for terminal auto-scroll
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const loadWeights = async () => {
      const weights = await getAlgoWeights(drawName);
      if (isMounted) {
        setOriginalWeights(weights);
        setLiveWeights(weights);
      }
    };
    loadWeights();
    return () => {
      isMounted = false;
    };
  }, [drawName]);

  useEffect(() => {
    if (history.length > 0) {
      setSampleSize((prev) => Math.max(15, Math.min(prev, history.length - 2)));
    }
  }, [history]);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Synchronisation des notifications déterministes
  const [isNotifSupported, setIsNotifSupported] = useState<boolean>(false);
  const [isNotifEnabled, setIsNotifEnabled] = useState<boolean>(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>("default");
  const [nextScheduledDraw, setNextScheduledDraw] = useState<ScheduledDraw | null>(null);

  useEffect(() => {
    setIsNotifSupported(notificationService.isSupported());
    setIsNotifEnabled(notificationService.isEnabled());
    setNotifPermission(notificationService.getPermissionState());

    const handleNextDrawUpdate = (nextDraw: ScheduledDraw) => {
      setNextScheduledDraw(nextDraw);
    };

    notificationService.addListener(handleNextDrawUpdate);
    return () => {
      notificationService.removeListener(handleNextDrawUpdate);
    };
  }, []);

  const handleToggleNotifications = async () => {
    if (!isNotifSupported) return;
    
    if (notifPermission !== "granted") {
      const granted = await notificationService.requestPermission();
      setNotifPermission(notificationService.getPermissionState());
      if (granted) {
        setIsNotifEnabled(true);
        showToast("Notifications Web Push activées avec succès !", "success");
      } else {
        showToast("Permission de notification refusée.", "error");
      }
    } else {
      const nextState = !isNotifEnabled;
      notificationService.setEnabledSetting(nextState);
      setIsNotifEnabled(nextState);
      showToast(
        nextState ? "Notifications activées." : "Notifications désactivées.",
        nextState ? "success" : "info"
      );
    }
  };

  const handleTestNotification = () => {
    if (!isNotifEnabled) {
      showToast("Veuillez d'abord activer les notifications.", "error");
      return;
    }
    notificationService.sendNotification(
      "Test de Stabilisation Thermique",
      "Ceci est un signal test. Le service de notifications push déterministes fonctionne de manière optimale."
    );
    showToast("Notification test envoyée.", "success");
  };

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const startTraining = async () => {
    if (history.length < 15) {
      showToast("Un minimum de 15 tirages réels est exigé.", "error");
      audioEngine.play("error");
      return;
    }

    setStatus("running");
    setEvolutionData([]);
    setLogs([]);
    addLog(`Démarrage de l'optimiseur : ${optimizerType.toUpperCase()}`);
    addLog(`Isolement du tirage : ${drawName}`);
    addLog(`Taille de l'échantillon historique : ${sampleSize}`);
    audioEngine.play("scan");

    try {
      const result = await evolveNeuralDNA(
        drawName,
        { generations, sampleSize, optimizerType },
        (data) => {
          setEvolutionData((prev) => [...prev, data]);
          setLiveWeights(normalizeWeights(data.bestGenome));
          
          if (data.gen % 5 === 0 || data.gen === 1) {
            addLog(`Génération ${data.gen} | Fitness : ${data.bestFitness.toFixed(2)} | Diversité : ${(data.diversity * 100).toFixed(1)}%`);
          }
        }
      );

      if (result.report) {
        setFinalReport(result.report);
        setLiveWeights(normalizeWeights(result.bestWeights));
        setStatus("completed");
        addLog(`Convergence atteinte. Mémorisation du meilleur génome.`);
        audioEngine.play("success");
      }
    } catch (e: any) {
      console.error(e);
      setStatus("idle");
      addLog(`Échec de l'optimisation : ${e.message}`);
      showToast("Échec de l'entraînement.", "error");
      audioEngine.play("error");
    }
  };

  const stopTraining = () => {
    terminateActiveWorkers(drawName);
    setStatus("idle");
    addLog("Processus interrompu par l'utilisateur.");
    audioEngine.play("click");
  };

  const applyWeights = async () => {
    if (status === "running") return;
    audioEngine.play("scan");
    addLog("Application du nouveau génome en base de données...");
    
    const safeWeights = normalizeWeights(liveWeights);
    await updateGlobalWeights(safeWeights, drawName);
    await refreshData(drawName, true);
    
    setOriginalWeights(safeWeights);
    addLog("ADN mis à jour avec succès.");
    showToast("ADN mis à jour avec succès.", "success");
    audioEngine.play("success");
  };

  const handleStartRollingValidation = async () => {
    if (isValidating) return;
    if (history.length < 15) {
      showToast("Historique insuffisant pour lancer le banc d'essai (minimum 15 tirages).", "error");
      audioEngine.play("error");
      return;
    }

    setIsValidating(true);
    setValidationProgress(0);
    setValidationReport(null);
    audioEngine.play("scan");
    addLog("Démarrage du banc d'essai de validation croisée en chaîne (OOS)...");

    try {
      const report = await runRollingValidation(
        drawName,
        history,
        liveWeights,
        rollingWindowSize,
        (progress) => {
          setValidationProgress(progress);
        }
      );
      setValidationReport(report);
      setIsValidating(false);
      addLog(`Validation croisée complétée. Qualité de convergence : ${report.convergenceQuality}`);
      showToast("Banc d'essai complété avec succès.", "success");
      audioEngine.play("success");
    } catch (err: any) {
      console.error(err);
      setIsValidating(false);
      addLog(`Échec de la validation croisée : ${err.message}`);
      showToast("Échec de la validation croisée.", "error");
      audioEngine.play("error");
    }
  };

  if (activeView === "darwinian") {
    return (
      <div className="w-full">
        <div className="flex items-center gap-6 mb-10 px-2">
          <button
            onClick={() => setActiveView("training")}
            className="text-[13px] font-bold text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-widest whitespace-nowrap"
          >
            Entraînement Standard
          </button>
          <button
            className="text-[13px] font-bold text-white border-b-2 border-indigo-500 pb-1 uppercase tracking-widest whitespace-nowrap"
          >
            Laboratoire Darwinien
          </button>
        </div>
        <NeuralDarwinismLab drawName={drawName} />
      </div>
    );
  }

  // Calculate current top weights to display
  const sortedLiveAlgos = Object.entries(liveWeights)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 10);

  return (
    <div className="w-full text-slate-300 font-sans pb-24 animate-fade-in">
      {/* Top Navigation / Flattened Tabs */}
      <div className="flex items-center gap-6 mb-12 px-2 border-b border-slate-800/50 pb-2">
        <button
          className="text-[13px] font-bold text-white border-b-2 border-indigo-500 pb-1 uppercase tracking-widest whitespace-nowrap"
        >
          Entraînement Standard
        </button>
        <button
          onClick={() => setActiveView("darwinian")}
          className="text-[13px] font-bold text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-widest whitespace-nowrap"
        >
          Laboratoire Darwinien
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* Left Column: Configuration & Controls (Flat, low contrast) */}
        <div className="lg:col-span-4 space-y-10">
          
          <div className="space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Paramètres d'Évolution</h3>
            
            <div className="space-y-8">
              {/* Slider Generations */}
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Générations</span>
                  <span className="text-lg font-black text-slate-200">{generations}</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={generations}
                  onChange={(e) => setGenerations(Number(e.target.value))}
                  disabled={status === "running"}
                  className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              {/* Slider Sample Size */}
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Échantillon (Tirages)</span>
                  <span className="text-lg font-black text-slate-200">{sampleSize}</span>
                </div>
                <input
                  type="range"
                  min="15"
                  max={Math.max(15, history.length)}
                  step="1"
                  value={sampleSize}
                  onChange={(e) => setSampleSize(Number(e.target.value))}
                  disabled={status === "running"}
                  className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              {/* Optimizer Selection */}
              <div className="space-y-3">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block">Moteur de Résolution</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "pso", label: "PSO" },
                    { id: "genetic", label: "Darwin" },
                    { id: "bayesian", label: "Bayes" },
                    { id: "meta", label: "Omni" }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        audioEngine.play("click");
                        setOptimizerType(opt.id as any);
                      }}
                      disabled={status === "running"}
                      className={`py-3 px-2 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-colors whitespace-nowrap ${
                        optimizerType === opt.id 
                        ? "bg-slate-800 text-white" 
                        : "bg-slate-900/50 text-slate-500 hover:bg-slate-800/80"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/50">
            {status === "idle" || status === "completed" ? (
              <button
                onClick={startTraining}
                className="w-full flex items-center justify-center gap-3 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[13px] font-black uppercase tracking-widest transition-colors cursor-pointer"
              >
                <Play size={16} /> Lancer l'Évolution
              </button>
            ) : (
              <button
                onClick={stopTraining}
                className="w-full flex items-center justify-center gap-3 py-4 bg-rose-600/20 hover:bg-rose-600/30 text-rose-500 rounded-xl text-[13px] font-black uppercase tracking-widest transition-colors cursor-pointer"
              >
                <Square size={16} /> Interrompre
              </button>
            )}
          </div>

        </div>

        {/* Right Column: Visualization & Logs */}
        <div className="lg:col-span-8 flex flex-col gap-10">
          
          {/* Evolution Chart */}
          <div className="h-64 bg-slate-900/30 rounded-2xl p-6 relative">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 absolute top-6 left-6 z-10">
              Trajectoire de Fitness
            </h3>
            {evolutionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={evolutionData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="gen" hide />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', fontSize: '11px', borderRadius: '8px' }}
                    itemStyle={{ color: '#c7d2fe' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="bestFitness" 
                    stroke="#818cf8" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#fitGrad)" 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-600 text-[11px] font-bold uppercase tracking-widest">
                En attente des données...
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Live Weights Top 10 */}
            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  Génome Actif (Top 10)
                </h3>
                {status === "completed" && (
                  <button
                    onClick={applyWeights}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Sauvegarder
                  </button>
                )}
              </div>
              <div className="space-y-4">
                {sortedLiveAlgos.map(([algo, weight]) => {
                  const label = formatLabel(algo);
                  const wNum = weight as number;
                  const isHigh = wNum > 0.1;
                  return (
                    <div key={algo} className="group">
                      <div className="flex justify-between items-baseline mb-1.5">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate mr-4">
                          {label}
                        </span>
                        <span className={`text-[12px] font-black ${isHigh ? 'text-indigo-400' : 'text-slate-500'}`}>
                          {(wNum * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-900 rounded-full h-1 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${isHigh ? 'bg-indigo-500' : 'bg-slate-700'}`}
                          style={{ width: `${Math.min(100, wNum * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Terminal */}
            <div className="flex flex-col h-full min-h-[300px]">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-6">
                Journal Cybernétique
              </h3>
              <div className="flex-1 bg-slate-950 rounded-xl border border-slate-900 p-4 font-mono text-[10px] overflow-y-auto space-y-2">
                {logs.map((log, idx) => (
                  <div key={idx} className="text-emerald-500/80 leading-relaxed break-words">
                    {log}
                  </div>
                ))}
                <div ref={terminalEndRef} />
              </div>
            </div>
          </div>
          
          {/* Banc d'Essai de Validation Croisée en Chaîne - Walk-Forward Validation (OOS) */}
          <div className="bg-slate-900/40 rounded-3xl p-8 border border-slate-800 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[80px] -mr-10 -mt-10"></div>
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 relative z-10">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 block mb-1">
                  Banc d'Essai Temporel OOS
                </span>
                <h3 className="text-xl font-black text-white tracking-tight">
                  Validation Croisée Glissante en Chaîne (Rolling-Window Validation)
                </h3>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Profondeur :</span>
                  <span className="text-sm font-black text-slate-300">{rollingWindowSize} tirages</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max={Math.min(100, Math.max(10, history.length - 12))}
                  step="5"
                  value={rollingWindowSize}
                  onChange={(e) => setRollingWindowSize(Number(e.target.value))}
                  disabled={isValidating}
                  className="w-32 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mb-6 max-w-3xl relative z-10">
              Ce module simule l'application séquentielle pas-à-pas des prédictions sur les 
              <strong> {rollingWindowSize} derniers tirages</strong> (ensembles OOS entièrement étanches, sans aucune fuite d'information). 
              Il permet de quantifier objectivement la dérive à long terme de chaque algorithme individuel et de verrouiller la convergence de l'ADN cybernétique.
            </p>

            <div className="mb-8 relative z-10">
              {isValidating ? (
                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-bold text-slate-400">
                    <span>Simulation chronologique en cours...</span>
                    <span>{validationProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                      style={{ width: `${validationProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleStartRollingValidation}
                  className="w-full sm:w-auto flex items-center justify-center gap-3 py-3.5 px-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-lg active:scale-95"
                >
                  <RefreshCw size={14} className="animate-spin-slow" /> Lancer la Validation Croisée
                </button>
              )}
            </div>

            {validationReport && (
              <div className="space-y-8 relative z-10 animate-fade-in">
                {/* Scorecards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-slate-950 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Qualité de Convergence</span>
                    <span className="text-sm font-black text-indigo-400">{validationReport.convergenceQuality}</span>
                  </div>
                  <div className="bg-slate-950 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Hits Moyens (Ensemble)</span>
                    <span className="text-xl font-black text-slate-200">{validationReport.ensemble.mean.toFixed(2)} / 5</span>
                  </div>
                  <div className="bg-slate-950 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Écart-Type (Stabilité)</span>
                    <span className="text-xl font-black text-slate-200">±{validationReport.ensemble.stdDev.toFixed(2)}</span>
                  </div>
                  <div className="bg-slate-950 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Dérive Temporelle</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xl font-black ${validationReport.ensemble.drift >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {validationReport.ensemble.drift >= 0 ? "+" : ""}{validationReport.ensemble.drift.toFixed(2)}
                      </span>
                      {validationReport.ensemble.drift >= 0 ? (
                        <TrendingUp size={16} className="text-emerald-400" />
                      ) : (
                        <AlertTriangle size={16} className="text-rose-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Recharts Cumulative Hits Chart */}
                <div className="bg-slate-950 p-6 rounded-2xl border border-slate-900">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6">
                    Évolution Chronologique des Hits Cumulés (OOS)
                  </h4>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <ReLineChart
                        data={validationReport.stepLabels.map((label, idx) => {
                          const item: any = { name: label, Ensemble: validationReport.ensemble.cumulative[idx] };
                          const sortedAlgos = Object.entries(validationReport.algorithms)
                            .sort((a, b) => b[1].mean - a[1].mean)
                            .slice(0, 3)
                            .map(([name]) => name);
                          
                          sortedAlgos.forEach((algoKey) => {
                            item[formatLabel(algoKey)] = validationReport.algorithms[algoKey].cumulative[idx];
                          });
                          return item;
                        })}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <XAxis dataKey="name" stroke="#475569" style={{ fontSize: "9px" }} />
                        <YAxis stroke="#475569" style={{ fontSize: "9px" }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#090d16",
                            borderColor: "#1e293b",
                            borderRadius: "12px",
                            fontSize: "11px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "12px" }} />
                        <Line type="monotone" dataKey="Ensemble" stroke="#6366f1" strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
                        {Object.entries(validationReport.algorithms)
                          .sort((a, b) => b[1].mean - a[1].mean)
                          .slice(0, 3)
                          .map(([algoKey], index) => {
                            const colors = ["#3b82f6", "#10b981", "#f59e0b"];
                            return (
                              <Line
                                key={algoKey}
                                type="monotone"
                                dataKey={formatLabel(algoKey)}
                                stroke={colors[index] || "#94a3b8"}
                                strokeWidth={1.5}
                                strokeDasharray="4 4"
                                dot={false}
                              />
                            );
                          })}
                      </ReLineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Detailed Algorithm Table */}
                <div className="bg-slate-950 rounded-2xl border border-slate-900 overflow-hidden">
                  <div className="p-6 border-b border-slate-900">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                      Analyse de la Dérive et Résilience par Algorithme (OOS)
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-900 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          <th className="py-4 px-6">Algorithme</th>
                          <th className="py-4 px-6 text-right">Hits Total</th>
                          <th className="py-4 px-6 text-right">Hits Moyen</th>
                          <th className="py-4 px-6 text-right">Stabilité (StdDev)</th>
                          <th className="py-4 px-6 text-right">Dérive Temporelle</th>
                          <th className="py-4 px-6 text-center">Diagnostic</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900 text-xs text-slate-300 font-medium">
                        {Object.entries(validationReport.algorithms)
                          .sort((a, b) => b[1].mean - a[1].mean)
                          .map(([algoKey, stats]) => {
                            const label = formatLabel(algoKey);
                            const isDriftingNegative = stats.drift < -0.1;
                            const isDriftingPositive = stats.drift > 0.1;
                            
                            return (
                              <tr key={algoKey} className="hover:bg-slate-900/40 transition-colors">
                                <td className="py-4 px-6 font-bold text-slate-200 uppercase tracking-wider">{label}</td>
                                <td className="py-4 px-6 text-right font-mono">{stats.total}</td>
                                <td className="py-4 px-6 text-right font-mono">{stats.mean.toFixed(2)}</td>
                                <td className="py-4 px-6 text-right font-mono">±{stats.stdDev.toFixed(2)}</td>
                                <td className="py-4 px-6 text-right font-mono">
                                  <span className={stats.drift >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                    {stats.drift >= 0 ? "+" : ""}{stats.drift.toFixed(2)}
                                  </span>
                                </td>
                                <td className="py-4 px-6 text-center">
                                  {isDriftingNegative ? (
                                    <span className="px-2.5 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full text-[9px] font-black uppercase tracking-wider">
                                      Surapprentissage
                                    </span>
                                  ) : isDriftingPositive ? (
                                    <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[9px] font-black uppercase tracking-wider">
                                      Apprentissage Actif
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-1 bg-slate-800 text-slate-400 rounded-full text-[9px] font-black uppercase tracking-wider">
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

          {/* Service de Notifications Déterministes Web Push */}
          <div className="bg-slate-900/40 rounded-3xl p-8 border border-slate-800 relative overflow-hidden mt-8">
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-[80px] -mr-10 -mt-10"></div>
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 relative z-10">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-purple-400 block mb-1">
                  Moteur d'Engagement Prédictif
                </span>
                <h3 className="text-xl font-black text-white tracking-tight">
                  Service de Notifications Déterministes Web Push
                </h3>
              </div>
              <div className="flex items-center gap-2 bg-purple-500/10 px-4 py-2 rounded-2xl border border-purple-500/20">
                <span className="text-[9px] font-black uppercase tracking-widest text-purple-400">
                  Statut :
                </span>
                <span className={`text-xs font-mono font-black uppercase ${
                  isNotifEnabled ? "text-emerald-400" : "text-amber-400"
                }`}>
                  {isNotifEnabled ? "Actif" : "Désactivé"}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mb-6 max-w-3xl relative z-10">
              Synchronisez un service d'alerte discret s'appuyant directement sur le calendrier officiel de 
              <strong> DRAW_SCHEDULE</strong>. Le système vous envoie une notification push exactement 
              <strong> 10 minutes avant chaque tirage</strong>, au moment précis où l'entropie thermique de l'algorithme se stabilise, pour garantir des prédictions à l'optimum cybernétique.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 relative z-10">
              {/* Prochain Tirage Alert Panel */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between space-y-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Prochaine Alerte Déterministe</span>
                {nextScheduledDraw ? (
                  <div>
                    <div className="text-lg font-black text-slate-200">{nextScheduledDraw.drawName}</div>
                    <div className="text-xs font-mono text-slate-400 mt-1">
                      Aujourd'hui à {nextScheduledDraw.timeString} (Alerte à {(() => {
                        const d = new Date(nextScheduledDraw.targetDate);
                        d.setMinutes(d.getMinutes() - 10);
                        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      })()})
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">Aucun tirage planifié.</span>
                )}
                {nextScheduledDraw && (
                  <div className="flex items-center gap-2 text-[10px] font-black text-purple-400 uppercase tracking-widest bg-purple-500/5 py-1 px-2.5 rounded-lg w-max">
                    <Activity size={10} className="animate-pulse" />
                    Temps restant : {Math.round(nextScheduledDraw.minutesUntil)} min
                  </div>
                )}
              </div>

              {/* État des Permissions */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between space-y-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Autorisation Système</span>
                <div>
                  <div className="text-lg font-black text-slate-200 capitalize">{notifPermission}</div>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">
                    {!isNotifSupported 
                      ? "Les notifications ne sont pas supportées par votre navigateur ou l'iframe sandbox actuelle." 
                      : notifPermission === "default" 
                      ? "En attente de votre accord pour déclencher les alertes d'entropie."
                      : notifPermission === "denied"
                      ? "Les notifications sont bloquées. Veuillez les autoriser dans les paramètres de votre navigateur."
                      : "Permission accordée au niveau système."}
                  </p>
                </div>
              </div>

              {/* Console d'activation */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between space-y-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Contrôle Réseau</span>
                <div className="space-y-2">
                  <button
                    onClick={handleToggleNotifications}
                    disabled={!isNotifSupported}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
                      isNotifEnabled
                        ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                        : "bg-purple-600 hover:bg-purple-500 text-white"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <ShieldCheck size={14} /> {isNotifEnabled ? "Désactiver les alertes" : "Activer les alertes"}
                  </button>
                  <button
                    onClick={handleTestNotification}
                    disabled={!isNotifEnabled}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800/80 rounded-xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Tester le signal push
                  </button>
                </div>
              </div>
            </div>

            {!isNotifSupported && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-3 items-start relative z-10">
                <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={16} />
                <p className="text-xs text-amber-300/80 leading-relaxed">
                  <strong>Contrainte Iframe Sandbox :</strong> Les environnements de prévisualisation intégrés bloquent parfois les notifications système. Pour une fiabilité à 100%, veuillez ouvrir l'application dans un nouvel onglet autonome de votre navigateur.
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
