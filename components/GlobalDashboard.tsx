import { FALLBACK_CALIBRATION } from "../shared/prediction.types";
import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  getNextScheduledDraw,
  checkAndSyncRecentResults,
} from "../services/lotteryService";
import { analyzeIntraDraw } from "../services/intraDrawService";
import { LearningService } from "../services/learningService";
import { useNexusStore } from "../store/useNexusStore";
import {
  useDailySummary,
  lotteryKeys,
} from "../hooks/useLottery";
import { useQueryClient } from "@tanstack/react-query";
import { DRAW_SCHEDULE } from "../constants";
import type { Draw, DrawResult } from "../types";
import { NumberBall } from "./NumberBall";
import { InfoTooltip } from "./ui/InfoTooltip";
import { TicketXRay } from "./TicketXRay";
import {
  Flame,
  Calendar,
  Clock,
  Activity,
  RefreshCw,
  Binary,
  Signal,
  Microscope,
  ArrowUpRight,
  ShieldCheck,
  HeartPulse,
  Monitor,
  Layers,
  Database,
  BrainCircuit,
  Zap,
  Gauge,
  Cpu,
  FileText,
  Brain,
} from "lucide-react";
import { generateTacticalReport } from "../services/reportService";
import { useToast } from "./ui/Toast";
import { safeSetItem } from "../utils/safeStorage";
import { motion, AnimatePresence } from "framer-motion";
import { audioEngine } from "../utils/audioEngine";
import { SLOT_CONFIG } from "../constants";
import { useDriftCorrection } from "../hooks/useDriftCorrection";

import { GlobalMacroPredictionView } from "./GlobalMacroPredictionView";

interface SummaryItem {
  time: string;
  name: string;
  result: DrawResult | null;
}

interface GlobalDashboardProps {
  onSelectDraw: (draw: Draw) => void;
}

const MetaLearningIndicator = React.memo(() => {
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const calibration = useNexusStore((state) => state.calibration);
  const isForensicOptimized = useNexusStore((state) => state.isForensicOptimized);
  const setForensicOptimized = useNexusStore((state) => state.setForensicOptimized);
  const { showToast } = useToast();

  const strategyBalance = useMemo(() => {
    if (!globalWeights || Object.keys(globalWeights).length === 0) return 50;
    const freq = globalWeights.frequency || 0;
    const gap = globalWeights.gap || 0;
    const total = freq + gap;
    if (total === 0) return 50;
    return Math.round((freq / total) * 100);
  }, [globalWeights]);

  const confidence = useMemo(() => {
    const baseConfidence = calibration?.reliability || 75;
    if (!globalWeights) return baseConfidence;
    const values = Object.values(globalWeights).filter(
      (v) => typeof v === "number",
    ) as number[];
    if (values.length === 0) return baseConfidence;
    const maxWeight = Math.max(...values);
    // Continuous boost: bounded between 0 and 15 based on the max weight deviation
    const boost = 15.0 * Math.max(0, Math.min(1.0, (maxWeight - 0.2) / 0.5));
    return Math.min(99, baseConfidence + boost);
  }, [globalWeights, calibration]);

  // Using a continuous sigmoid-based activation concept instead of strict binary, 
  // but keeping boolean for UI styling flags.
  const shadowIntensity = Math.min(1.0, Math.max(0.0, (globalWeights?.fractal || 0) * 10.0));
  const isShadowActive = shadowIntensity > 0.3;

  return (
    <div className="bg-slate-900/80 backdrop-blur-md p-4 md:p-6 rounded-3xl md:rounded-[2rem] border border-indigo-500/20 shadow-2xl relative overflow-hidden mb-8 animate-fade-in">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] -mr-20 -mt-20"></div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6 relative z-10">
        <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
          <div className="p-2.5 md:p-3 bg-indigo-500/20 rounded-xl border border-indigo-500/30 shrink-0">
            <BrainCircuit className="w-5 h-5 md:w-6 md:h-6 text-indigo-400 animate-pulse-slow" />
          </div>
          <div>
            <h3 className="text-[10px] md:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
              Méta-Apprentissage{" "}
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[8px] md:text-[9px] rounded-full border border-emerald-500/20">
                ACTIF
              </span>
            </h3>
            <p className="text-[9px] md:text-[10px] text-slate-400 font-medium mt-0.5 md:mt-1">
              Optimisation dynamique en temps réel
            </p>
          </div>
        </div>

        <div className="flex-1 w-full flex flex-col gap-2">
          <div className="flex justify-between text-[8px] md:text-[9px] font-black uppercase tracking-widest text-slate-500">
            <span className={strategyBalance < 40 ? "text-indigo-400" : ""}>
              Écart
            </span>
            <span className={strategyBalance > 60 ? "text-indigo-400" : ""}>
              Fréquence
            </span>
          </div>
          <div className="h-1.5 md:h-2 bg-slate-800 rounded-full overflow-hidden relative">
            <motion.div
              initial={{ width: "50%" }}
              animate={{ width: `${strategyBalance}%` }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-indigo-500"
            />
            <motion.div
              initial={{ left: "50%" }}
              animate={{ left: `${strategyBalance}%` }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="absolute top-0 w-1 h-full bg-white shadow-[0_0_10px_white]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Bouton Toggle Optimisation Forensic interactif et animé */}
          <button
            onClick={() => {
              setForensicOptimized(!isForensicOptimized);
              try { audioEngine.play("success"); } catch(e) {}
              showToast(
                `Optimisation Forensic ${!isForensicOptimized ? "activée" : "désactivée"} avec succès.`,
                !isForensicOptimized ? "success" : "info"
              );
            }}
            className={`flex items-center gap-2 px-3 py-2 border rounded-2xl transition-all duration-300 hover:scale-105 active:scale-95 shadow-md relative overflow-hidden group cursor-pointer ${
              isForensicOptimized
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15"
                : "bg-black/30 border-white/5 text-slate-400 hover:text-slate-200"
            }`}
            title="Cliquer pour activer/désactiver l'intégration d'autopsies et ajustements passés"
          >
            <Brain
              size={14}
              className={`transition-transform duration-500 ${
                isForensicOptimized ? "animate-pulse text-emerald-400 rotate-[360deg] scale-110" : "text-slate-400 group-hover:scale-110"
              }`}
            />
            <div className="text-left leading-none">
              <span className="text-[7px] text-slate-500 font-black uppercase tracking-widest block">
                Forensic
              </span>
              <span className={`text-[10px] font-black uppercase mt-0.5 transition-colors duration-300 ${
                isForensicOptimized ? "text-emerald-400" : "text-slate-400"
              }`}>
                {isForensicOptimized ? "Optimisé" : "Désactivé"}
              </span>
            </div>
            {/* Indication visuelle de statut sous forme d'interrupteur mini */}
            <div className={`w-7 h-4 rounded-full transition-colors duration-300 relative flex items-center p-0.5 ml-1 ${
              isForensicOptimized ? "bg-emerald-500" : "bg-slate-600"
            }`}>
              <div className={`w-3 h-3 rounded-full bg-white shadow-sm transform transition-transform duration-300 ease-out ${
                isForensicOptimized ? "translate-x-3" : "translate-x-0"
              }`} />
            </div>
          </button>

          {isShadowActive && (
            <div className="flex items-center gap-2 bg-purple-500/10 px-3 py-2 rounded-xl border border-purple-500/20">
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="text-[8px] text-purple-300 font-black uppercase tracking-widest">
                Shadow
              </span>
            </div>
          )}

          <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-xl border border-white/5">
            <Zap className="w-4 h-4 text-yellow-400" />
            <div className="flex flex-col">
              <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">
                Confiance IA
              </span>
              <span className="text-lg font-black text-white font-mono">
                {confidence}%
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-indigo-900/20 px-4 py-2 rounded-xl border border-indigo-500/20">
            <Cpu className="w-4 h-4 text-indigo-400 animate-pulse" />
            <div className="flex flex-col">
              <span className="text-[8px] text-indigo-300 font-black uppercase tracking-widest">
                Neural Net
              </span>
              <span className="text-[10px] font-black text-white">
                IA HYBRIDE ACTIVE
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const LatestResultHero = React.memo(
  ({ result, onAnalyze }: { result: DrawResult; onAnalyze: () => void }) => {
    const storeCalibration = useNexusStore((state) => state.empiricalCalibration);
    const calibration = storeCalibration || FALLBACK_CALIBRATION;
    const metrics = useMemo(() => analyzeIntraDraw(result, calibration), [result, calibration]);
    const [showXRay, setShowXRay] = useState(false);

    return (
      <div className="relative overflow-hidden rounded-3xl md:rounded-[4rem] p-5 md:p-14 text-white shadow-2xl group border border-white/5 mb-8 md:mb-12 transition-all duration-700 bg-slate-950 mx-auto w-full">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/60 via-slate-900 to-black opacity-90"></div>

        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[140px] -mr-48 -mt-48 group-hover:bg-indigo-500/20 transition-all duration-1000"></div>

        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row gap-6 md:gap-12 items-center justify-between">
            <div className="flex-1 space-y-4 md:space-y-8 text-center lg:text-left w-full">
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 md:gap-4">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="inline-flex items-center gap-2 px-3 md:px-5 py-1.5 md:py-2 bg-indigo-500/10 rounded-full border border-indigo-500/30 text-[7px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-indigo-300"
                >
                  <Signal size={10} className="text-indigo-400 animate-pulse" />{" "}
                  Signal Entrant • {result.drawName}
                </motion.div>
                <div className="inline-flex items-center gap-2 px-3 md:px-5 py-1.5 md:py-2 bg-emerald-500/10 rounded-full border border-emerald-500/30 text-[7px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-emerald-400">
                  <ShieldCheck size={10} /> {result.date}
                </div>
              </div>

              <h2 className="text-3xl md:text-8xl font-black tracking-tighter leading-none text-white drop-shadow-2xl uppercase break-words">
                {result.drawName || "TERMINAL"}
              </h2>

              <div className="flex flex-wrap gap-2 md:gap-3 justify-center lg:justify-start">
                <InfoTooltip
                  title="Somme Sigma (Σ)"
                  content={`Masse numérique totale du tirage. Moyenne empirique: ${calibration.meanSum.toFixed(1)}.`}
                >
                  <div className="px-3 md:px-6 py-2 md:py-4 bg-black/40 rounded-xl md:rounded-3xl border border-white/5 backdrop-blur-xl flex flex-col items-center min-w-[80px] md:min-w-[120px] hover:border-indigo-500/50 transition-colors shadow-inner">
                    <span className="text-[7px] md:text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1 md:mb-1.5">
                      Somme Σ
                    </span>
                    <span
                      className={`text-base md:text-2xl font-mono font-black ${Math.abs(metrics.sum - calibration.meanSum) > calibration.stdSum ? "text-rose-400" : "text-emerald-400"}`}
                    >
                      {metrics.sum}
                    </span>
                  </div>
                </InfoTooltip>

                <InfoTooltip
                  title="Complexité Arithmétique"
                  content="Score d'imprévisibilité structurelle (0-10)."
                >
                  <div className="px-3 md:px-6 py-2 md:py-4 bg-black/40 rounded-xl md:rounded-3xl border border-white/5 backdrop-blur-xl flex flex-col items-center min-w-[80px] md:min-w-[120px] hover:border-indigo-500/50 transition-colors shadow-inner">
                    <span className="text-[7px] md:text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1 md:mb-1.5">
                      Complexité
                    </span>
                    <span className="text-base md:text-2xl font-mono font-black text-indigo-400">
                      {metrics.acValue}/10
                    </span>
                  </div>
                </InfoTooltip>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    audioEngine.play("click");
                    setShowXRay(!showXRay);
                  }}
                  className={`px-3 md:px-6 py-2 md:py-4 rounded-xl md:rounded-3xl border flex flex-col items-center min-w-[80px] md:min-w-[120px] transition-all transform active:scale-95 shadow-xl
                                  ${
                                    showXRay
                                      ? "bg-indigo-600 border-indigo-400 shadow-indigo-500/30"
                                      : "bg-white/5 border-white/10 hover:bg-white/10"
                                  }`}
                >
                  <span className="text-[7px] md:text-[9px] font-black uppercase tracking-widest mb-1 md:mb-1.5 opacity-60">
                    Diagnostic
                  </span>
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <Microscope size={12} />
                    <span className="text-[9px] md:text-xs font-black uppercase tracking-widest">
                      Rayon-X
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4 md:gap-10 bg-black/40 p-5 md:p-14 rounded-3xl md:rounded-[4.5rem] border border-white/10 backdrop-blur-3xl shadow-2xl relative overflow-hidden w-full lg:w-auto">
              <div className="absolute inset-0 bg-indigo-600/5 opacity-30" />
              <div className="flex gap-1.5 md:gap-5 relative z-10 justify-center flex-wrap">
                {result.gagnants.map((n, i) => (
                  <motion.div
                    key={n}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: i * 0.1, type: "spring" }}
                    className="transform hover:scale-110 transition-transform duration-500 cursor-pointer"
                    onClick={() =>
                      useNexusStore.getState().setInspectingNumber(n)
                    }
                  >
                    <NumberBall
                      number={n}
                      size="sm"
                      isAttractor={i === 0}
                      confidence={92}
                    />
                  </motion.div>
                ))}
              </div>

              <div className="flex items-center gap-3 md:gap-8 w-full px-1 md:px-4 relative z-10">
                <div className="h-px flex-1 bg-white/10"></div>
                <div className="flex items-center gap-2 md:gap-5">
                  <span className="text-[7px] md:text-[10px] font-black uppercase text-slate-500 tracking-[0.1em] md:tracking-[0.2em] flex items-center gap-1.5 md:gap-2 whitespace-nowrap">
                    <Binary size={10} /> Machine
                  </span>
                  <div className="flex gap-1.5 md:gap-3">
                    {result.machine?.map((n) => (
                      <span
                        key={n}
                        className="text-[10px] md:text-sm font-mono font-black text-slate-400 opacity-50 hover:opacity-100 transition-opacity"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="h-px flex-1 bg-white/10"></div>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {showXRay && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-8 md:mt-12 overflow-hidden border-t border-white/10 pt-6 md:pt-8"
              >
                <TicketXRay
                  numbers={result.gagnants}
                  score={Math.round((metrics.acValue / 10) * 100)}
                  showTitle={false}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  },
);

const NextDrawWidget = React.memo(
  ({
    isUrgent,
    timeLeft,
    day,
    time,
    name,
  }: {
    isUrgent: boolean;
    timeLeft: string;
    day: string;
    time: string;
    name: string;
  }) => {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`lg:col-span-12 rounded-3xl md:rounded-[4rem] p-6 md:p-14 text-white relative overflow-hidden group transition-all duration-700 ${isUrgent ? "bg-rose-950/80 backdrop-blur-3xl border border-rose-500/40 ring-4 ring-rose-500/10 shadow-[0_0_50px_rgba(244,63,94,0.3)]" : "glass-card neural-border shadow-2xl"}`}
      >
        <div
          className={`absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-[160px] -mr-48 -mt-48 transition-colors duration-1000 ${isUrgent ? "bg-rose-500/20" : "bg-indigo-600/10"}`}
        ></div>

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex justify-between items-start">
            <div className="inline-flex items-center gap-2 md:gap-3 px-3 md:px-5 py-1.5 md:py-2 bg-white/5 rounded-full border border-white/10 backdrop-blur-2xl">
              <Clock
                className={`w-3.5 h-3.5 md:w-5 md:h-5 ${isUrgent ? "text-rose-400 animate-spin" : "text-indigo-400"}`}
              />
              <span className="text-[8px] md:text-[11px] font-black uppercase tracking-widest text-slate-300">
                {day} {time}
              </span>
            </div>
            {isUrgent && (
              <span className="px-2.5 md:px-4 py-1 md:py-1.5 bg-rose-600 text-white text-[7px] md:text-[9px] font-black uppercase rounded-lg animate-pulse shadow-lg shadow-rose-600/40">
                Urgent
              </span>
            )}
          </div>

          <div className="mt-6 md:mt-14 mb-6 md:mb-10 text-center md:text-left">
            <h3 className="text-2xl md:text-7xl font-black tracking-tighter leading-tight truncate uppercase">
              {name}
            </h3>
            <p className="text-slate-500 font-bold uppercase text-[8px] md:text-xs tracking-widest mt-1 md:mt-4">
              Ouverture du flux dans :
            </p>
          </div>

          <div className="bg-black/50 backdrop-blur-3xl rounded-2xl md:rounded-[3rem] p-5 md:p-10 border border-white/10 flex flex-col items-center justify-center shadow-inner group-hover:border-white/20 transition-all">
            <div
              className={`text-4xl md:text-7xl font-mono font-black tracking-tighter transition-all duration-500 ${isUrgent ? "text-rose-400 scale-105" : "text-white"}`}
            >
              {timeLeft}
            </div>
          </div>
        </div>
      </motion.div>
    );
  },
);

const IsolatedNextDrawWidget = React.memo(() => {
  const [nextDraw, setNextDraw] = useState<{
    name: string;
    timeLeft: string;
    isUrgent: boolean;
    time: string;
    day: string;
  } | null>(null);

  useEffect(() => {
    // Initial call to avoid 1s delay
    const updateDraw = () => {
      const next = getNextScheduledDraw();
      if (next) {
        const now = new Date();
        const [h, m] = next.time.split(":").map(Number);
        const targetDate = new Date();
        targetDate.setHours(h, m, 0, 0);
        if (targetDate < now) targetDate.setDate(targetDate.getDate() + 1);

        const diffMs = targetDate.getTime() - now.getTime();

        const isUrgent = diffMs < 600000;
        const hh = Math.floor(diffMs / 3600000);
        const mm = Math.floor((diffMs % 3600000) / 60000);
        const ss = Math.floor((diffMs % 60000) / 1000);

        setNextDraw({
          name: next.name,
          timeLeft: `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`,
          isUrgent,
          time: next.time,
          day: next.day,
        });
      }
    };
    updateDraw();
    const timer = setInterval(updateDraw, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!nextDraw) return null;

  return (
    <NextDrawWidget
      isUrgent={nextDraw.isUrgent}
      timeLeft={nextDraw.timeLeft}
      day={nextDraw.day}
      time={nextDraw.time}
      name={nextDraw.name}
    />
  );
});

export const GlobalDashboard: React.FC<GlobalDashboardProps> = React.memo(
  ({ onSelectDraw }) => {
    const { showToast } = useToast();
    const regime = useNexusStore((state) => state.regime);
    const volatility = useNexusStore((state) => state.volatility);
    const refreshData = useNexusStore((state) => state.refreshData);
    const history = useNexusStore((state) => state.history);
    const lastPrediction = useNexusStore((state) => state.lastPrediction);
    const globalWeights = useNexusStore((state) => state.globalWeights);
    const drawName = useNexusStore((state) => state.drawName);
    const temporalDepth = useNexusStore((state) => state.temporalDepth);
    const navigateToModule = useNexusStore((state) => state.navigateToModule);
    const isAutonomousAgentActive = useNexusStore((state) => state.isAutonomousAgentActive);

    const queryClient = useQueryClient();

    const daysOrder = [
      "Dimanche",
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
    ];
    const [selectedDay, setSelectedDay] = useState<string>(
      daysOrder[new Date().getDay()],
    );
    const [dashboardTab, setDashboardTab] = useState<"schedule" | "macro">("schedule");
    const { data: summary = [], isLoading: loadingSummary } =
      useDailySummary(selectedDay);

    // const { data: globalHotData = [] } = useGlobalStats(drawName);

    const [fullSyncing, setFullSyncing] = useState(false);



    // Calculs Dynamiques pour le Dashboard (Reflétant les changements de poids/prédiction)
    const dynamicVolatility = useMemo(() => {
      const histVol = volatility?.score || 0;
      // Si une prédiction est active, la volatilité perçue est modérée par la confiance de l'IA
      // Une haute confiance réduit la volatilité perçue (système plus stable)
      if (lastPrediction?.confidence) {
        const stabilityFactor = lastPrediction.confidence / 100;
        // Réduction dérivée de l'entropie spectrale vs entropie temporelle
        const reductionBounds = Math.max(0.1, Math.min(0.5, (histVol / 100)));
        return Math.round(histVol * (1 - stabilityFactor * reductionBounds));
      }
      return histVol;
    }, [volatility, lastPrediction]);

    const dynamicRegime = useMemo(() => {
      let base = regime?.regime || "IDLE";
      // Enrichissement du régime affiché en fonction des poids actifs
      if (globalWeights?.fractal && globalWeights.fractal > Math.exp(-3.0)) {
        return `${base} :: SHADOW`;
      }
      if (globalWeights?.bayes && globalWeights.bayes > Math.exp(-1.6)) {
        return `${base} :: NEURAL`;
      }
      return base;
    }, [regime, globalWeights]);

    // Extraction de la logique de dérive via un hook dédié
    useDriftCorrection(drawName, history || []);

    // AUTO-LEARN TRIGGER (Nightly Build Simulation) - Deactivated by default on startup to prevent browser freezing.
    useEffect(() => {
      const triggerAutoLearn = async () => {
        if (!isAutonomousAgentActive) return;

        if (history && history.length > 60) {
          const drawName = history[0]?.drawName || "Global";
          const LAST_RUN_KEY = `nexus_autolearn_last_${drawName}`;
          const lastRun = localStorage.getItem(LAST_RUN_KEY);
          const now = Date.now();

          if (!lastRun || now - Number(lastRun) >= 86400000) {
            const result = await LearningService.triggerAutoLearning(drawName);
            if (result.lastRun) {
              safeSetItem(LAST_RUN_KEY, now.toString());
              showToast(
                result.message,
                result.improvement ? "success" : "info",
              );
              if (result.improvement) refreshData(drawName);
            }
          }
        }
      };

      // Delay to let UI settle
      const t = setTimeout(triggerAutoLearn, 15000);
      return () => clearTimeout(t);
    }, [history, isAutonomousAgentActive]);

    const handleAutoLearn = useCallback(async () => {
      if (!history || history.length < 60) {
        showToast("Historique insuffisant (>60 requis).", "error");
        return;
      }
      setFullSyncing(true);
      try {
        const drawName = history[0]?.drawName || "Global";
        // Force execution by clearing timestamp
        localStorage.removeItem(`nexus_autolearn_last_${drawName}`);

        const result = await LearningService.triggerAutoLearning(drawName, undefined, false, true);
        if (result.lastRun) {
          safeSetItem(
            `nexus_autolearn_last_${drawName}`,
            Date.now().toString(),
          );
          showToast(result.message, result.improvement ? "success" : "info");
          if (result.improvement) {
            if (result.weights) {
              await useNexusStore.getState().updateGlobalWeights(result.weights, drawName);
            }
            refreshData(drawName);
          }
        } else {
          showToast(result.message || "Erreur Auto-Learn.", "error");
        }
      } catch (e) {
        showToast("Erreur Auto-Learn.", "error");
      } finally {
        setFullSyncing(false);
      }
    }, [history, showToast, refreshData]);

    useEffect(() => {
      // Auto-sync exactly ~30 mins after any draw time
      const syncTimer = setInterval(async () => {
        const now = new Date();
        const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        const todaySchedule = DRAW_SCHEDULE[days[now.getDay()]];
        if (!todaySchedule) return;

        for (const time of Object.keys(todaySchedule)) {
          const [h, m] = time.split(':').map(Number);
          const drawDate = new Date();
          drawDate.setHours(h, m, 0, 0);
          const targetSyncTime = new Date(drawDate.getTime() + 30 * 60 * 1000);
          
          // Check if we are within a 1-minute window of the target sync time (+30m)
          const diffMs = Math.abs(now.getTime() - targetSyncTime.getTime());
          
          if (diffMs <= 60000) {
            const drawNameKey = todaySchedule[time];
            const dateStr = now.toISOString().split('T')[0];
            const storageKey = `nexus_autosync_${drawNameKey}_${dateStr}`;
            
            if (!localStorage.getItem(storageKey)) {
              localStorage.setItem(storageKey, 'true'); // Optimistic lock
              try {
                const count = await checkAndSyncRecentResults();
                if (count > 0) {
                  await queryClient.invalidateQueries({
                    queryKey: lotteryKeys.all,
                  });
                  showToast(
                    `${count} nouveaux résultats synchronisés automatiquement à +30min.`,
                    "success",
                  );
                  audioEngine.play("success");
                }
              } catch (e: any) {
                if (e?.code !== 'SYNC_REQUIRES_BACKEND') {
                  localStorage.removeItem(storageKey); // Release lock on failure to allow retry
                  console.error("Auto-sync failed", e);
                }
                // SYNC_REQUIRES_BACKEND (mode démo sans backend) : on garde le verrou pour ne pas
                // retenter inutilement chaque minute, puisque le résultat ne changera pas.
              }
            }
          }
        }
      }, 60 * 1000); // Verify conditions every minute

      return () => {
        clearInterval(syncTimer);
      };
    }, []);

    const handleManualSync = useCallback(async () => {
      audioEngine.play("scan");
      setFullSyncing(true);
      try {
        const count = await checkAndSyncRecentResults();
        // Invalidation globale pour tout rafraîchir
        await queryClient.invalidateQueries({ queryKey: lotteryKeys.all });
        showToast(
          count > 0 ? `${count} signaux synchronisés.` : "Noyau à jour.",
          "success",
        );
        if (count > 0) audioEngine.play("success");
      } catch (e: any) {
        if (e?.code === 'SYNC_REQUIRES_BACKEND') {
          showToast("Mode démo : aucun backend configuré, synchronisation indisponible.", "info");
        } else {
          showToast("Sync cloud interrompue.", "error");
        }
        audioEngine.play("error");
      } finally {
        setFullSyncing(false);
      }
    }, [queryClient, showToast]);

    const uiDays = [
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
      "Dimanche",
    ];
    const isEmptyState =
      history.length === 0 &&
      !loadingSummary &&
      summary.every((s: SummaryItem) => s.result === null);

    // Couleur de l'indicateur de pouls global
    const pulseColor =
      dynamicVolatility > 60 ? "text-rose-500" : "text-emerald-500";

    const handleExportReport = useCallback(async () => {
      try {
        const currentDrawName = history[0]?.drawName || "Global";
        const { generateMasterPrediction } =
          await import("../services/prediction/predictionFacade");
        const prediction = await generateMasterPrediction(
          currentDrawName,
          history,
          temporalDepth,
          globalWeights,
        );

        generateTacticalReport({
          drawName: currentDrawName,
          prediction: prediction,
          weights: globalWeights,
        });
        showToast("Rapport Tactique généré.", "success");
      } catch (e) {
        console.error(e);
        showToast("Erreur lors de la génération du rapport.", "error");
      }
    }, [history, globalWeights, showToast]);

    const nextDrawInfo = getNextScheduledDraw();

    return (
      <div className="space-y-8 md:space-y-12 animate-fade-in pb-24 w-full max-w-7xl mx-auto">
        {/* Core Status Monitoring Bar */}
        <div
          className={`p-6 md:p-8 rounded-[2.5rem] md:rounded-[3.5rem] border flex flex-col md:flex-row justify-between items-center gap-6 md:gap-10 mx-auto w-full relative overflow-hidden transition-all duration-1000 bg-slate-900/50 backdrop-blur-xl border-white/5`}
        >
          {/* Background pulse effect */}
          <div className="absolute left-0 bottom-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-600/20 to-transparent"></div>

          <div className="flex items-center gap-4 md:gap-6 relative z-10">
            <div className="p-4 md:p-5 bg-indigo-600 rounded-2xl md:rounded-[2rem] shadow-2xl shadow-indigo-600/30 text-white group hover:rotate-6 transition-all">
              <Monitor size={24} className="md:w-8 md:h-8" />
            </div>
            <div>
              <h2 className="text-xl md:text-3xl font-black text-white tracking-tighter uppercase leading-none">
                Console Maître
              </h2>
              <div className="flex flex-wrap items-center gap-3 md:gap-6 mt-2 md:mt-3">
                <div className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-full border border-white/5">
                  <HeartPulse
                    size={14}
                    className={`${pulseColor} animate-pulse`}
                  />
                  <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Nexus Pulse :{" "}
                    <span className="text-white">{dynamicVolatility}%</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-indigo-400" />
                  <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Régime : <span className="text-white">{dynamicRegime}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 w-full md:flex md:gap-4 md:w-auto relative z-10">
            <button
              onClick={handleExportReport}
              className="group flex-1 md:flex-none px-2 py-3 md:px-8 md:py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-[8px] sm:text-[10px] md:text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 flex flex-col sm:flex-row items-center justify-center gap-1.5 md:gap-3"
            >
              <FileText className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="text-center">Rapport PDF</span>
            </button>
            <button
              onClick={handleAutoLearn}
              disabled={fullSyncing}
              className="group flex-1 md:flex-none px-2 py-3 md:px-8 md:py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-[8px] sm:text-[10px] md:text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 flex flex-col sm:flex-row items-center justify-center gap-1.5 md:gap-3 disabled:opacity-50"
            >
              <BrainCircuit
                className={`w-3.5 h-3.5 md:w-4 md:h-4 ${fullSyncing ? "animate-pulse" : ""}`}
              />
              <span className="text-center">Auto-Learn</span>
            </button>
            <button
              onClick={handleManualSync}
              disabled={fullSyncing}
              className="group flex-1 md:flex-none px-2 py-3 md:px-10 md:py-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all shadow-xl flex flex-col sm:flex-row items-center justify-center gap-1.5 md:gap-4 active:scale-95 disabled:opacity-50 relative"
            >
              <div className="absolute top-1 right-2 flex items-center gap-0.5 sm:gap-1">
                <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-[5px] sm:text-[6px] text-emerald-500/70 font-black uppercase tracking-widest">
                  Auto
                </span>
              </div>
              <RefreshCw
                className={`w-3.5 h-3.5 md:w-4 md:h-4 ${fullSyncing ? "animate-spin" : "group-hover:rotate-180"} transition-transform duration-700 text-indigo-400`}
              />
              <span className="text-[8px] sm:text-[10px] md:text-xs font-black uppercase tracking-widest text-white text-center">
                Sync Cloud
              </span>
            </button>
          </div>
        </div>

        {isEmptyState ? (
          <div className="glass-card neural-border p-8 md:p-12 rounded-[2.5rem] md:rounded-[4rem] text-center shadow-2xl relative overflow-hidden mx-auto w-full">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] -mr-32 -mt-32"></div>
            <div className="relative z-10 flex flex-col items-center gap-6">
              <div className="p-6 bg-white/5 rounded-full mb-4 animate-bounce-subtle">
                <Database
                  size={40}
                  className="text-indigo-400 md:w-12 md:h-12"
                />
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter">
                Base Vierge
              </h2>
              <p className="text-slate-400 max-w-lg mx-auto text-xs md:text-sm font-medium">
                Le noyau Nexus ne détecte aucune donnée historique.
              </p>
              <button
                onClick={handleManualSync}
                disabled={fullSyncing}
                className="px-6 md:px-8 py-3 md:py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center gap-3"
              >
                {fullSyncing ? (
                  <RefreshCw className="animate-spin" size={16} />
                ) : (
                  <RefreshCw size={16} />
                )}
                Synchroniser les données
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6 w-full">
            <MetaLearningIndicator />
          </div>
        )}

        {!isEmptyState && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-10">
              {/* PROCHAIN TIRAGE WIDGET */}
              <IsolatedNextDrawWidget />
            </div>

            {/* TAB SELECTOR FOR THE HOME CONSOLE */}
            <div className="flex gap-6 border-b border-slate-200/40 dark:border-slate-800 pb-3 mt-12 px-2 md:px-4">
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setDashboardTab("schedule");
                }}
                className={`text-xs md:text-sm font-black uppercase tracking-widest pb-3 relative transition-colors ${
                  dashboardTab === "schedule"
                    ? "text-indigo-500"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                Séquences du Jour
                {dashboardTab === "schedule" && (
                  <motion.div
                    layoutId="dashboardTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"
                  />
                )}
              </button>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setDashboardTab("macro");
                }}
                className={`text-xs md:text-sm font-black uppercase tracking-widest pb-3 relative transition-colors ${
                  dashboardTab === "macro"
                    ? "text-indigo-500 animate-pulse"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                Convergence Globale (ALL)
                {dashboardTab === "macro" && (
                  <motion.div
                    layoutId="dashboardTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"
                  />
                )}
              </button>
            </div>

            {dashboardTab === "schedule" ? (
              <section className="mt-12 md:mt-16">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5 mb-8 md:mb-10 px-2 md:px-4">
                  <div className="text-center md:text-left w-full">
                    <h2 className="text-2xl md:text-3xl font-black text-white tracking-tighter uppercase leading-none">
                      Programme{" "}
                      <span className="text-indigo-500">{selectedDay}</span>
                    </h2>
                    <p className="text-[9px] md:text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1 md:mt-2">
                      Séquences temporelles disponibles
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      onSelectDraw({ name: "ALL", day: "Tous", time: "Archive" });
                    }}
                    className="mx-auto md:mx-0 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all flex items-center gap-2 group"
                  >
                    <Layers
                      size={14}
                      className="text-indigo-400 group-hover:text-white transition-colors"
                    />
                    Archives Globales
                  </button>
                </div>

                {/* Day Selector - Scrollable horizontal sur mobile */}
                <div className="flex gap-2 overflow-x-auto pb-4 mb-6 md:mb-8 scrollbar-hide px-2">
                  {uiDays.map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        audioEngine.play("click");
                        setSelectedDay(d);
                      }}
                      className={`
                                          px-5 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border flex-shrink-0
                                          ${
                                            selectedDay === d
                                              ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 border-indigo-500 scale-105"
                                              : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                                          }
                                      `}
                    >
                      {d}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 px-2 md:px-0">
                  {loadingSummary
                    ? [1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="h-64 bg-white/5 rounded-[2.5rem] md:rounded-[3rem] animate-pulse border border-white/5 mx-auto w-full"
                        ></div>
                      ))
                    : (summary as SummaryItem[]).map((item, idx) => {
                        const isCompleted = item.result !== null;
                        const isNext = nextDrawInfo?.name === item.name;
                        const config = SLOT_CONFIG[item.time] || {
                          color: "text-slate-400",
                          icon: "⏱️",
                          label: "",
                        };

                        return (
                          <motion.div
                            key={item.name}
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            onClick={() => {
                              audioEngine.play("click");
                              onSelectDraw({
                                day: selectedDay,
                                time: item.time,
                                name: item.name,
                              });
                            }}
                            className={`group p-6 md:p-8 rounded-[2.5rem] md:rounded-[3rem] border transition-all duration-500 cursor-pointer hover:scale-[1.03] flex flex-col h-full relative overflow-hidden mx-auto w-full ${isCompleted ? "bg-indigo-600/5 border-emerald-500/20 hover:border-emerald-500/50 shadow-2xl" : isNext ? "bg-indigo-600/10 border-indigo-500/40 hover:border-indigo-500 ring-1 ring-indigo-500/20" : "bg-black/40 border-white/5 opacity-60 hover:opacity-100"}`}
                          >
                            <div className="flex justify-between items-start mb-6 md:mb-8 relative z-10">
                              <div className="flex items-center gap-2">
                                <span className="text-lg md:text-xl">
                                  {config.icon}
                                </span>
                                <span
                                  className={`text-[9px] md:text-[11px] font-black uppercase tracking-widest ${isCompleted ? "text-emerald-500" : "text-slate-400"}`}
                                >
                                  {item.time}
                                </span>
                              </div>
                              {isCompleted ? (
                                <Signal
                                  size={12}
                                  className="text-emerald-500 animate-pulse"
                                />
                              ) : (
                                isNext && (
                                  <Clock
                                    size={12}
                                    className="text-indigo-400 animate-spin"
                                  />
                                )
                              )}
                            </div>

                            <h3 className="font-black text-xl md:text-2xl text-white mb-6 md:mb-8 group-hover:text-indigo-400 transition-colors uppercase truncate relative z-10">
                              {item.name}
                            </h3>

                            <div className="mt-auto relative z-10">
                              {item.result ? (
                                <div className="space-y-4 md:space-y-6">
                                  <div className="flex gap-2 flex-wrap justify-center sm:justify-start">
                                    {item.result.gagnants.map((n) => (
                                      <div
                                        key={n}
                                        className="w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center text-[9px] md:text-[10px] font-black"
                                      >
                                        {n}
                                      </div>
                                    ))}
                                  </div>
                                  <div 
                                    className="flex items-center justify-between pt-4 md:pt-6 border-t border-white/5 cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        audioEngine.play("click");
                                        onSelectDraw({
                                            day: selectedDay,
                                            time: item.time,
                                            name: item.name,
                                        });
                                        // We let the view transition, and trigger the navigation event after a short delay
                                        setTimeout(() => {
                                            navigateToModule('Forensic', 'prediction');
                                        }, 300);
                                    }}
                                  >
                                    <div className="flex items-center gap-2 text-[8px] md:text-[9px] font-black text-indigo-400 uppercase group-hover:text-indigo-300">
                                      <Microscope size={12} /> Analyser
                                    </div>
                                    <ArrowUpRight
                                      size={14}
                                      className="text-indigo-500/50 group-hover:text-indigo-400 transition-all"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="py-6 md:py-8 bg-black/20 rounded-[2rem] md:rounded-[2.5rem] border-2 border-dashed border-white/5 flex flex-col items-center justify-center gap-3 group-hover:bg-black/40 transition-colors">
                                  {isNext ? (
                                    <>
                                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping"></div>
                                      <span className="text-[8px] md:text-[9px] text-indigo-400 font-black uppercase tracking-widest">
                                        En cours...
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-[8px] md:text-[9px] text-slate-600 font-black uppercase tracking-widest">
                                      À venir
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                </div>
              </section>
            ) : (
              <div className="mt-12 md:mt-16">
                <GlobalMacroPredictionView />
              </div>
            )}

            {/* Removed patterns and meta learning sections */}
          </>
        )}
      </div>
    );
  },
);
