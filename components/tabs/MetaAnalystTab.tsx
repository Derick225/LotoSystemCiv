import React, { useState, useEffect, useMemo } from "react";
import {
  generatePlatinumPrediction,
  savePlatinumHistory,
  getPlatinumHistory,
} from "../../services/metaAnalystService";
import { savePredictionToHistory } from "../../services/predictionHistoryService";

import { useNexusStore } from "../../store/useNexusStore";
import type { PlatinumResult, PlatinumScenario, Prediction } from "../../types";
import { NumberBall } from "../NumberBall";
import { useToast } from "../ui/Toast";
import { TicketXRay } from "../TicketXRay";
import { PredictionComputationOverlay } from "../prediction/PredictionComputationOverlay";
import {
  Activity,
  Layers,
  Zap,
  BarChart3,
  RefreshCw,
  Radio,
  Fingerprint,
  MousePointer2,
  AlertCircle,
  Save,
  Share2,
  Sliders,
  Settings,
  Play,
  CheckCircle2,
  History,
  Cpu,
  Volume2,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { audioEngine } from "../../utils/audioEngine";

interface MetaAnalystTabProps {
  drawName: string;
}

const ScenarioCard = React.memo<{
  scenario: PlatinumScenario;
  isSelected: boolean;
  onClick: () => void;
  onSave: () => void;
}>(({ scenario, isSelected, onClick, onSave }) => {
  return (
    <motion.div
      layout
      onClick={() => {
        onClick();
      }}
      whileHover={{ y: -4 }}
      className={`
                relative p-5 rounded-2xl border cursor-pointer overflow-hidden flex flex-col justify-between h-full transition-all duration-300
                ${
                  isSelected
                    ? "bg-slate-800 border-white/20 shadow-2xl ring-1 ring-white/10"
                    : "bg-slate-900/50 border-white/5 hover:bg-slate-800/50 hover:border-white/10"
                }
            `}
    >
      {isSelected && (
        <div
          className="absolute top-0 left-0 w-full h-1"
          style={{ backgroundColor: scenario.color }}
        />
      )}

      <div>
        <div className="flex justify-between items-start mb-3">
          <span
            className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md"
            style={{
              color: scenario.color,
              backgroundColor: `${scenario.color}15`,
            }}
          >
            {scenario.risk} RISK
          </span>
          <span className="text-xs font-bold text-white">
            {scenario.probability}%
          </span>
        </div>

        <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">
          {scenario.name}
        </h3>
        <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
          {scenario.description}
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <div className="flex justify-between gap-1">
          {scenario.numbers.map((n) => (
            <NumberBall key={n} number={n} size="sm" />
          ))}
        </div>

        {isSelected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSave();
            }}
            className="w-full py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{ backgroundColor: scenario.color }}
          >
            <Save size={12} /> Sauvegarder
          </button>
        )}
      </div>
    </motion.div>
  );
});

export const MetaAnalystTab: React.FC<MetaAnalystTabProps> = ({ drawName }) => {
  const { showToast } = useToast();

  // Optimisation des sélecteurs pour éviter les re-renders inutiles
  const rawHistory = useNexusStore((state) => state.history);
  const history = React.useDeferredValue(rawHistory);
  const nexusLoading = useNexusStore((state) => state.loading);
  const spectral = useNexusStore((state) => state.spectral);
  const fractal = useNexusStore((state) => state.fractal);
  const volatility = useNexusStore((state) => state.volatility);
  const regularity = useNexusStore((state) => state.regularity);
  const symbioticContext = useNexusStore((state) => state.symbioticContext);

  const [result, setResult] = useState<PlatinumResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null,
  );
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Advanced Operational Calibration Parameters
  const [regimePivot, setRegimePivot] = useState<number>(0.8);
  const [forensicGain, setForensicGain] = useState<number>(1.0);
  const [phaseFrequency, setPhaseFrequency] = useState<number>(1.0);
  const [shannonEntropyFilter, setShannonEntropyFilter] =
    useState<boolean>(false);
  const [showCalibration, setShowCalibration] = useState<boolean>(false);
  const [showExpertTools, setShowExpertTools] = useState<boolean>(false);

  // Backtesting Simulator state
  const [isBacktesting, setIsBacktesting] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [backtestResults, setBacktestResults] = useState<{
    trials: number;
    scenariosStats: Record<
      string,
      { name: string; meanHits: number; successRate: number; totalHits: number }
    >;
    details: {
      drawDate: string;
      actualWinners: number[];
      scenarioHits: Record<string, number>;
    }[];
    bestScenario: string;
  } | null>(null);

  // Mémoisation des handlers
  const handleScenarioClick = React.useCallback((id: string) => {
    audioEngine.play("click");
    setSelectedScenarioId(id);
  }, []);

  // PERSISTENCE EFFECT: Load last result on mount or when drawName changes
  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      const hist = await getPlatinumHistory(drawName);
      if (isMounted) {
        if (hist.length > 0) {
          setResult(hist[0]);
          setSelectedScenarioId("alpha");
        } else {
          setResult(null);
          setSelectedScenarioId(null);
        }
      }
    };
    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, [drawName]);

  const runAnalysis = async () => {
    audioEngine.play("click");
    if (history.length < 15) {
      audioEngine.play("error");
      showToast("Dataset insuffisant pour la convergence.", "error");
      return;
    }
    setLoadingProgress(0);
    setLoadingStep("Calibrage du réseau de neurones artificiels...");
    setLoading(true);
    audioEngine.play("loading");

    try {
      // Simulation de temps de calcul (UX)
      await new Promise((r) => setTimeout(r, 150));

      const data = await generatePlatinumPrediction(
        drawName,
        history,
        { spectral, fractal, volatility: volatility ?? undefined }, // Inject pre-computed metrics
        { regimePivot, forensicGain, phaseFrequency, shannonEntropyFilter }, // Custom calibrated options!
        symbioticContext,
        undefined,
        (progress, message) => {
          setLoadingProgress(progress);
          setLoadingStep(message);
        },
      );

      setResult(data);
      setSelectedScenarioId("alpha"); // Select Conservative by default
      savePlatinumHistory(data);
      audioEngine.play("success");
      showToast("Convergence Tensorielle atteinte.", "success");
    } catch (e: unknown) {
      audioEngine.play("error");
      showToast(
        "Erreur Hyper-Convergence : " +
          (e instanceof Error ? e.message : String(e)),
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const runBacktest = async () => {
    audioEngine.play("click");
    if (history.length < 18) {
      showToast(
        "Dataset insuffisant pour un backtest rétroactif (min. 18 tirages requis).",
        "error",
      );
      return;
    }
    setIsBacktesting(true);
    setLoadingProgress(0);
    setLoadingStep("Initialisation du rétro-audit temporel...");
    audioEngine.play("loading");

    try {
      await new Promise((r) => setTimeout(r, 150));
      // Backtest sur les 8 derniers tirages disponibles
      const trialsCount = Math.min(8, history.length - 10);
      const detailsList: any[] = [];
      const scenarioAccumulator: Record<
        string,
        { name: string; totalHits: number; wins: number }
      > = {
        alpha: { name: "Alpha Core", totalHits: 0, wins: 0 },
        beta: { name: "Beta Flow", totalHits: 0, wins: 0 },
        gamma: { name: "Gamma Burst", totalHits: 0, wins: 0 },
        delta: { name: "Delta Convergence", totalHits: 0, wins: 0 },
        epsilon: { name: "Epsilon Forensic", totalHits: 0, wins: 0 },
        zeta: { name: "Zeta Adversarial", totalHits: 0, wins: 0 },
      };

      for (let j = trialsCount; j >= 1; j--) {
        const targetDraw = history[j - 1]; // Le tirage réel ciblé
        const historicalWindow = history.slice(j); // L'historique coupé avant ce tirage réel

        // Calculer la prédiction à cet instant rétroactif
        const pred = await generatePlatinumPrediction(
          drawName,
          historicalWindow,
          { spectral, fractal, volatility: volatility ?? undefined },
          { regimePivot, forensicGain, phaseFrequency, shannonEntropyFilter },
          symbioticContext,
          undefined,
          (progress, message) => {
            const trialIndex = trialsCount - j; // 0 to trialsCount - 1
            const totalProgress = Math.round(
              ((trialIndex + progress / 100) / trialsCount) * 100,
            );
            setLoadingProgress(totalProgress);
            setLoadingStep(
              `Backtest rétroactif ${trialIndex + 1}/${trialsCount} : ${message}`,
            );
          },
        );

        const winners = new Set(targetDraw.gagnants);
        const stepHits: Record<string, number> = {};

        pred.scenarios.forEach((s) => {
          const hits = s.numbers.filter((num) => winners.has(num)).length;
          stepHits[s.id] = hits;

          if (scenarioAccumulator[s.id]) {
            scenarioAccumulator[s.id].name = s.name;
            scenarioAccumulator[s.id].totalHits += hits;
            if (hits >= 2) {
              scenarioAccumulator[s.id].wins += 1; // Au moins 2 matches considérés comme un hit significatif
            }
          }
        });

        detailsList.push({
          drawDate: targetDraw.date || `Tirage rétroactif -${j}`,
          actualWinners: targetDraw.gagnants,
          scenarioHits: stepHits,
        });
      }

      const stats: Record<string, any> = {};
      let maxTotalHits = -1;
      let bestScen = "Alpha Core";

      Object.keys(scenarioAccumulator).forEach((id) => {
        const item = scenarioAccumulator[id];
        const meanHits = item.totalHits / trialsCount;
        const successRate = (item.wins / trialsCount) * 100;

        if (item.totalHits > maxTotalHits) {
          maxTotalHits = item.totalHits;
          bestScen = item.name;
        }

        stats[id] = {
          name: item.name,
          meanHits: Number(meanHits.toFixed(2)),
          successRate: Number(successRate.toFixed(1)),
          totalHits: item.totalHits,
        };
      });

      setBacktestResults({
        trials: trialsCount,
        scenariosStats: stats,
        details: detailsList,
        bestScenario: bestScen,
      });

      showToast(
        `Rétro-audit complété sur ${trialsCount} cycles de test stochastique.`,
        "success",
      );
      audioEngine.play("success");
    } catch (err: any) {
      showToast("L'audit rétroactif a échoué : " + err.message, "error");
      audioEngine.play("error");
    } finally {
      setIsBacktesting(false);
    }
  };

  const handleSave = async (scenario: PlatinumScenario) => {
    audioEngine.play("click");

    if (result) {
      const breakdown: Record<number, Record<string, number>> = {};
      scenario.numbers.forEach((num) => {
        breakdown[num] = {
          orchestration: scenario.probability,
          fractal: 0,
          spectral: 0,
          momentum: 0,
          consensus: result.consensusVector[num] || 0,
        };
      });

      const predictionObj: Prediction = {
        suggestedNumbers: scenario.numbers,
        candidates: scenario.numbers,
        confidence: scenario.probability,
        analysis: scenario.description,
        breakdown: breakdown,
        timestamp: Date.now(),
      };
      await savePredictionToHistory(drawName, predictionObj, undefined, {
        spectral,
        fractal,
        volatility: volatility ?? undefined,
        regularity,
      });
    }

    audioEngine.play("success");
    showToast("Vecteur sécurisé et autopsié.", "success");
  };

  const handleExportScenario = async (scenario: PlatinumScenario) => {
    audioEngine.play("click");
    const ticketElement = document.getElementById(
      `scenario-xray-${scenario.id}`,
    );
    if (!ticketElement) return;

    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(ticketElement, {
        backgroundColor: "#0f172a", // slate-900
        scale: 2,
        logging: false,
      });

      const image = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image;
      link.download = `NexusPro_Platinum_${scenario.name}_${drawName}_${new Date().toISOString().split("T")[0]}.png`;
      link.click();

      showToast("Analyse exportée avec succès !", "success");
      audioEngine.play("success");
    } catch (e) {
      console.error("Export error:", e);
      showToast("Erreur lors de l'export.", "error");
      audioEngine.play("error");
    }
  };

  // Data for the Spectrum Chart
  const spectrumData = useMemo(() => {
    if (!result) return [];
    // Convert [0, ..., val, ...] to [{n: 1, v: val}, ...] skipping index 0
    return Array.from({ length: 90 }, (_, i) => ({
      n: i + 1,
      v: Math.round(result.consensusVector[i + 1]),
    }));
  }, [result]);

  const selectedScenario = result?.scenarios.find(
    (s) => s.id === selectedScenarioId,
  );

  const optimalScenario = useMemo(() => {
    if (!result || !result.scenarios || result.scenarios.length === 0) return null;
    return result.scenarios.reduce((best, current) => 
      current.probability > best.probability ? current : best
    , result.scenarios[0]);
  }, [result]);

  return (
    <div className="space-y-6 animate-fade-in pb-20 w-full overflow-hidden">
      <PredictionComputationOverlay
        isComputing={nexusLoading || loading || isBacktesting}
        computingStep={
          loadingStep ||
          (isBacktesting
            ? "Rétro-audit temporel..."
            : "Fusion des tenseurs probabilistes...")
        }
        historyLength={history.length}
        progress={loadingProgress}
      />

      {!result && !(nexusLoading || loading || isBacktesting) && (
        <div className="flex flex-col items-center justify-center min-h-[500px] p-8 text-center bg-slate-900/50 rounded-3xl border border-white/5">
          <div className="p-6 bg-slate-900 rounded-full shadow-2xl mb-8 border border-white/5">
            <Layers size={64} className="text-slate-500" />
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter mb-4">
            Nexus <span className="text-indigo-500">Platinum</span>
          </h2>
          <p className="text-slate-400 max-w-md text-sm font-medium leading-relaxed mb-10">
            Activez le moteur de fusion tensorielle pour générer un spectre de
            probabilité unifié à partir de tous les modèles disponibles.
          </p>
          <button
            onClick={runAnalysis}
            className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 transition-all active:scale-95 flex items-center gap-3 group"
          >
            <Zap
              size={18}
              className="group-hover:text-yellow-300 transition-colors"
            />{" "}
            Initialiser le Système
          </button>
        </div>
      )}

      {result && (
        <>
          {/* 1. MISSION CONTROL HEADER */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 p-4 rounded-3xl border border-white/5 flex flex-col justify-between">
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                Cohérence
              </span>
              <div className="text-2xl font-black text-white flex items-center gap-2">
                {result.coherence}%
                <Activity
                  size={16}
                  className={
                    result.coherence > 80 ? "text-emerald-500" : "text-amber-500"
                  }
                />
              </div>
            </div>
            <div className="bg-slate-900 p-4 rounded-3xl border border-white/5 flex flex-col justify-between">
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                Entropie
              </span>
              <div className="text-2xl font-black text-white flex items-center gap-2">
                {result.entropy.toFixed(2)}
                <Radio size={16} className="text-indigo-500" />
              </div>
            </div>
            <div className="bg-slate-900 p-4 rounded-3xl border border-white/5 flex flex-col justify-between">
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                Régime
              </span>
              <div
                className={`text-xl font-black uppercase ${result.regime === "STABLE" ? "text-emerald-400" : result.regime === "CHAOTIC" ? "text-rose-400" : "text-amber-400"}`}
              >
                {result.regime}
              </div>
            </div>
            <button
              onClick={runAnalysis}
              className="bg-indigo-600 hover:bg-indigo-500 rounded-3xl flex flex-col items-center justify-center text-white transition-colors group"
            >
              <RefreshCw
                size={20}
                className="mb-1 group-hover:rotate-180 transition-transform duration-300"
              />
              <span className="text-xs font-black uppercase tracking-widest">
                Re-Scan
              </span>
            </button>
          </div>

          {/* 2. LA FEUILLE DE ROUTE QUOTIDIENNE DÉCISIVE */}
          <div className="bg-slate-900/40 backdrop-blur-xl p-8 md:p-10 rounded-[2rem] border border-white/5 shadow-2xl relative overflow-hidden flex flex-col xl:flex-row items-stretch justify-between gap-8">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-[60px] pointer-events-none" />
            
            {/* Left Section: Le Choix du Directeur */}
            <div className="flex-1 space-y-6 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <span className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em] bg-amber-500/10 px-3 py-1 rounded-md border border-amber-500/20 flex items-center gap-1.5">
                    👑 Le Choix du Directeur
                  </span>
                  
                  {/* Alertes de Stabilité : Jetons de confiance ⭐ */}
                  <div className="flex items-center gap-1 bg-white/5 px-2.5 py-1 rounded-md border border-white/5">
                    <span className="text-[9px] font-black uppercase text-slate-400 mr-1.5">Stabilité :</span>
                    {(() => {
                      let starCount = 1;
                      let colorClass = "text-rose-400";
                      let label = "Prudence";
                      if (result.coherence >= 80) {
                        starCount = 3;
                        colorClass = "text-amber-400";
                        label = "Optimale (Exceptionnelle)";
                      } else if (result.coherence >= 60) {
                        starCount = 2;
                        colorClass = "text-yellow-400";
                        label = "Sécurisée";
                      } else {
                        starCount = 1;
                        colorClass = "text-rose-400";
                        label = "Instable";
                      }
                      return (
                        <div className="flex items-center gap-1">
                          <span className="text-sm tracking-wider font-serif text-amber-400">{"⭐".repeat(starCount)}</span>
                          <span className={`text-[9px] font-black uppercase ${colorClass}`}>({label})</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tighter">
                  La Feuille de Route Décisive
                </h3>
                <p className="text-xs text-slate-400 max-w-lg leading-relaxed mt-1 font-sans">
                  La combinaison optimale absolue calculée aujourd'hui par l'algorithme. C'est le ticket principal recommandé à valider les yeux fermés.
                </p>
              </div>

              {/* Giant NumberBall Display - Zero technical detail */}
              {optimalScenario && (
                <div className="flex flex-wrap items-center gap-5 py-4 justify-center md:justify-start">
                  {optimalScenario.numbers.map((num, idx) => (
                    <motion.div
                      key={`director-ball-${num}`}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        delay: idx * 0.1,
                        type: "spring",
                        stiffness: 140,
                      }}
                      className="flex flex-col items-center gap-1"
                    >
                      <div className="scale-110 md:scale-125">
                        <NumberBall
                          number={num}
                          size="lg"
                          glow={true}
                        />
                      </div>
                      <span className="text-[9px] font-black text-amber-500/80 uppercase font-mono tracking-wider mt-1">
                        Rang {idx + 1}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Giant Action Button - Pre-fills the portfolio with maximum resonance combinations */}
              {optimalScenario && (
                <button
                  onClick={async () => {
                    audioEngine.play("click");
                    
                    // Generate the primary ticket
                    
                    audioEngine.play("success");
                    showToast("Le Ticket d'Élite a été généré avec succès !", "success");
                  }}
                  className="w-full max-w-md py-4.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-amber-500/20 transition-all active:scale-95 flex items-center justify-center gap-3 cursor-pointer group font-sans animate-pulse"
                >
                  <Zap size={16} />
                  <span>Générer le Ticket d'Élite</span>
                </button>
              )}
            </div>

            {/* Right Section: Speech Accompaniement */}
            <div className="w-full xl:w-80 bg-slate-950/60 p-6 rounded-2xl border border-white/5 flex flex-col justify-between relative z-10 space-y-4">
              <div className="space-y-1.5">
                <span className="text-[8px] font-black uppercase text-indigo-400 tracking-wider block">
                  Accompagnement Vocal
                </span>
                <h4 className="text-xs font-black text-slate-300 uppercase">
                  Assistance Audio Épurée
                </h4>
                <p className="text-[11px] text-slate-500 leading-normal font-sans">
                  Parfait pour écouter les numéros dictés à haute voix sans avoir à lire d'analyses complexes ou de chiffres compliqués.
                </p>
              </div>

              {/* Speech Trigger Button */}
              <button
                onClick={() => {
                  audioEngine.play("click");
                  
                  const textToSpeak = `Bonjour. Voici la feuille de route recommandée aujourd'hui par la suite Platinum Élite. Les cinq numéros clés du Choix du Directeur sont : ${optimalScenario?.numbers.join(", ")}. L'indice de stabilité générale est de ${result.coherence >= 80 ? "trois étoiles" : result.coherence >= 60 ? "deux étoiles" : "une étoile"}, ce qui indique une configuration ${result.coherence >= 80 ? "exceptionnelle et idéale" : "favorable"}. Faites confiance à votre instinct et validez votre Ticket d'Élite !`;
                  
                  if ('speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                    const utterance = new SpeechSynthesisUtterance(textToSpeak);
                    utterance.lang = "fr-FR";
                    utterance.rate = 0.95;
                    utterance.pitch = 1.0;
                    window.speechSynthesis.speak(utterance);
                    showToast("Lecture vocale de la synthèse en cours...", "success");
                  } else {
                    showToast("Synthèse vocale non supportée par votre navigateur.", "info");
                  }
                }}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/10 cursor-pointer active:scale-95 font-sans"
              >
                <Volume2 size={14} className="animate-pulse" />
                <span>Écouter la Synthèse</span>
              </button>

              {/* Descriptive text block in French simple */}
              <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-[10px] text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                  <span>Diagnostic Épuré (Français Simple) :</span>
                </div>
                <p className="leading-relaxed text-slate-300 italic font-sans">
                  « L'IA recommande aujourd'hui les numéros <strong className="text-white">{optimalScenario?.numbers.join(" • ")}</strong>. Le climat global est très favorable, l'algorithme vous conseille de valider ce ticket directement. »
                </p>
              </div>
            </div>
          </div>

          {/* 3. EXPERT MODE TOGGLE BUTTON */}
          <div className="flex justify-center pt-4">
            <button
              onClick={() => {
                audioEngine.play("click");
                setShowExpertTools(!showExpertTools);
              }}
              className="px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-800/80 hover:bg-slate-750/80 border border-white/5 text-slate-400 hover:text-white transition-all flex items-center gap-2"
            >
              <Settings size={12} className={showExpertTools ? "rotate-90 transition-transform" : "transition-transform"} />
              {showExpertTools ? "Masquer les outils d'expert" : "Afficher les réglages & analyses d'expert (Forensics)"}
            </button>
          </div>

          <AnimatePresence>
            {showExpertTools && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden space-y-6 w-full"
              >
                {/* 3. ADVANCED OPERATIONS & CALIBRATION */}
                <div
                  id="platinum-calibration-panel"
                  className="bg-slate-900/60 backdrop-blur-md rounded-3xl p-6 border border-white/5 space-y-6"
                >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
              <Sliders size={16} className="text-amber-500" />
              Tableau de Calibration de Précision
            </h3>
            <p className="text-[10px] text-slate-400 mt-1">
              Ajustez l'algorithme hyper-convergé et lancez un rétro-audit
              temporel pour calibrer vos tickets.
            </p>
          </div>
          <button
            onClick={() => {
              audioEngine.play("click");
              setShowCalibration(!showCalibration);
            }}
            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 bg-slate-850 hover:bg-slate-750 text-slate-300"
          >
            <Settings
              size={12}
              className={
                showCalibration
                  ? "rotate-90 transition-transform"
                  : "transition-transform"
              }
            />
            {showCalibration ? "Masquer Réglages" : "Configurer Moteur"}
          </button>
        </div>

        <AnimatePresence>
          {showCalibration && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden pt-4 border-t border-white/5 space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Sliders */}
                <div className="space-y-4">
                  {/* Regime Pivot Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Cpu size={12} className="text-indigo-400" /> Seuil
                        Pivot de Régime
                      </span>
                      <span className="text-indigo-400 font-mono">
                        {regimePivot.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.60"
                      max="0.95"
                      step="0.01"
                      value={regimePivot}
                      onChange={(e) => setRegimePivot(Number(e.target.value))}
                      className="w-full accent-indigo-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                    />
                    <p className="text-[9px] text-slate-500 leading-normal">
                      Seuil d'inflexion stochastique. Détermine la limite de
                      sensibilité entre les régimes ordonnés et chaotiques.
                    </p>
                  </div>

                  {/* Forensic Gain Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <History size={12} className="text-violet-400" /> Gain
                        Rétroactif Forensic
                      </span>
                      <span className="text-violet-400 font-mono">
                        {forensicGain.toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="3.0"
                      step="0.1"
                      value={forensicGain}
                      onChange={(e) => setForensicGain(Number(e.target.value))}
                      className="w-full accent-violet-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                    />
                    <p className="text-[9px] text-slate-500 leading-normal">
                      Intensité de correction d'erreurs. Multiplie la
                      rétroaction des dérives et manques historiques.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Phase Frequency Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Activity size={12} className="text-rose-400" /> Phase
                        Trigonométrique
                      </span>
                      <span className="text-rose-400 font-mono">
                        {phaseFrequency.toFixed(1)} rad
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="2.0"
                      step="0.1"
                      value={phaseFrequency}
                      onChange={(e) =>
                        setPhaseFrequency(Number(e.target.value))
                      }
                      className="w-full accent-rose-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                    />
                    <p className="text-[9px] text-slate-500 leading-normal">
                      Dispersion orbitale des scénarios. Modifie le décalage
                      fréquentiel angulaire pour éviter les chevauchements.
                    </p>
                  </div>

                  {/* Shannon Entropy Filter Toggle */}
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-2xl border border-white/5">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-300 block">
                        Filtre de Shannon (Réduction de Bruit)
                      </span>
                      <span className="text-[9px] text-slate-500 mt-0.5 block leading-normal max-w-xs">
                        Élimine de façon différentielle les bruits blancs sous
                        le spectre d'énergie moyenne.
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        audioEngine.play("click");
                        setShannonEntropyFilter(!shannonEntropyFilter);
                      }}
                      className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-300 relative ${shannonEntropyFilter ? "bg-indigo-600" : "bg-slate-700"}`}
                    >
                      <motion.div
                        layout
                        className="w-5 h-5 rounded-full bg-white shadow-md"
                        animate={{ x: shannonEntropyFilter ? 24 : 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 30,
                        }}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions bar inside configurations */}
              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-white/5 justify-end">
                <button
                  onClick={runBacktest}
                  disabled={isBacktesting}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isBacktesting ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" /> Audit
                      rétrograde...
                    </>
                  ) : (
                    <>
                      <History size={12} className="text-violet-400" />{" "}
                      Rétro-Audit Temporel
                    </>
                  )}
                </button>
                <button
                  onClick={runAnalysis}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-95 flex items-center gap-2"
                >
                  <Zap size={12} /> Appliquer & Synchroniser
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Backtesting Results Dashboard */}
        <AnimatePresence>
          {backtestResults && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="bg-slate-950/80 rounded-2xl p-5 border border-violet-500/10 space-y-5 pt-4"
            >
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <div>
                  <h4 className="text-[10px] font-black text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
                    <CheckCircle2 size={12} /> Diagnostic de l'Audit Temporel
                    (Time Machine)
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Rapport d'autopsie stochastique simulé sur les{" "}
                    <strong>{backtestResults.trials}</strong> derniers tirages
                    réels.
                  </p>
                </div>
                <button
                  onClick={() => {
                    audioEngine.play("click");
                    setBacktestResults(null);
                  }}
                  className="text-slate-500 hover:text-slate-300 text-[10px] font-bold uppercase tracking-wider font-mono p-1"
                >
                  Effacer
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(backtestResults.scenariosStats).map(
                  ([id, stats]: any) => (
                    <div
                      key={id}
                      className="p-4 bg-slate-900 rounded-xl border border-white/5 space-y-2"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-[11px] font-black text-white uppercase truncate max-w-[130px]">
                          {stats.name}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          Succès:{" "}
                          <strong className="text-emerald-400">
                            {stats.successRate}%
                          </strong>
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] font-mono text-slate-400">
                          <span>Ratio Hits moyen</span>
                          <span className="text-slate-300">
                            {stats.meanHits} / 5
                          </span>
                        </div>
                        {/* Progress Hits Bar */}
                        <div className="w-full bg-slate-850 h-1 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500"
                            style={{ width: `${(stats.meanHits / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-[9px] font-mono text-slate-500 block">
                        Nombre total de hits :{" "}
                        <strong className="text-indigo-400">
                          {stats.totalHits}
                        </strong>
                      </span>
                    </div>
                  ),
                )}
              </div>

              <div className="p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/15 flex items-center justify-between text-[10px]">
                <span className="text-slate-400">
                  Scénario de résonance optimal identifié :
                </span>
                <span className="font-black text-emerald-400 uppercase tracking-wider">
                  {backtestResults.bestScenario}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 4. SCENARIO SELECTOR */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {result.scenarios.map((scenario) => (
          <ScenarioCard
            key={scenario.id}
            scenario={scenario}
            isSelected={selectedScenarioId === scenario.id}
            onClick={() => handleScenarioClick(scenario.id)}
            onSave={() => handleSave(scenario)}
          />
        ))}
      </div>

      {/* 4. DEEP INSPECTION (Conditional) */}
      <AnimatePresence>
        {selectedScenario && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              id={`scenario-xray-${selectedScenario.id}`}
              className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 md:p-10 border border-slate-200/60 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none relative"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Fingerprint className="text-slate-400" size={20} />
                  <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">
                    Rayon-X : {selectedScenario.name}
                  </h4>
                </div>
                <button
                  onClick={() => handleExportScenario(selectedScenario)}
                  data-html2canvas-ignore
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-colors"
                >
                  <Share2 size={14} /> Exporter
                </button>
              </div>

              <TicketXRay
                numbers={selectedScenario.numbers}
                score={selectedScenario.probability} // Use prob as a proxy for score visual
                showTitle={false}
              />

              <div className="mt-6 flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
                <AlertCircle
                  size={16}
                  className="text-indigo-500 shrink-0 mt-0.5"
                />
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                  Ce scénario est optimisé pour un régime{" "}
                  <strong>{result.regime}</strong>. La cohérence globale est de{" "}
                  {result.coherence}%.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
      </>)}
    </div>
  );
};
