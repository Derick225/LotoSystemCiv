import React, { useState, Suspense, lazy, useEffect } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { SmartInsights } from "../SmartInsights";
import {
  BarChart2,
  Waves,
  Activity,
  Layers,
  Clock,
  BookOpen,
  Box,
  Compass,
  Cpu,
  Workflow,
} from "lucide-react";
import { LocalErrorBoundary } from "../ui/LocalErrorBoundary";
import { ChaosAttractor } from "../ChaosAttractor";
import { calculateGapEfficiency } from "../../services/mathService";
import { GapEfficiencyMeter } from "../GapEfficiencyMeter";
import type { GapEfficiency } from "../../types";
import { audioEngine } from "../../utils/audioEngine";

const StatsTab = lazy(() =>
  import("./StatsTab").then((m) => ({ default: m.StatsTab })),
);
const PatternDiscoveryTab = lazy(() =>
  import("./PatternDiscoveryTab").then((m) => ({ default: m.PatternDiscoveryTab })),
);
const GapPatternTab = lazy(() =>
  import("./GapPatternTab").then((m) => ({ default: m.GapPatternTab })),
);
const SpectralTab = lazy(() =>
  import("./SpectralTab").then((m) => ({ default: m.SpectralTab })),
);
const FractalTab = lazy(() =>
  import("./FractalTab").then((m) => ({ default: m.FractalTab })),
);
const MathTab = lazy(() =>
  import("./MathTab").then((m) => ({ default: m.MathTab })),
);
const TemporalTab = lazy(() =>
  import("./TemporalTab").then((m) => ({ default: m.TemporalTab })),
);
const ClusteringTab = lazy(() =>
  import("./ClusteringTab").then((m) => ({ default: m.ClusteringTab })),
);
const MachineTransferTab = lazy(() =>
  import("./MachineTransferTab").then((m) => ({ default: m.MachineTransferTab })),
);
const BoulonnierCrossCorrelationTab = lazy(() =>
  import("./BoulonnierCrossCorrelationTab").then((m) => ({ default: m.BoulonnierCrossCorrelationTab })),
);
const AcademyTab = lazy(() =>
  import("./AcademyTab").then((m) => ({ default: m.AcademyTab })),
);

type SignalPillar = "stats_patterns" | "signals_spectral" | "dynamics_clustering" | "academy";

export const SignalHub: React.FC = () => {
  const history = useNexusStore((state) => state.history);
  const drawName = useNexusStore((state) => state.drawName);
  const currentDrawName = useNexusStore((state) => state.currentDrawName);
  const activeSubTab = useNexusStore((state) => state.activeSubTab);
  const activeDraw = drawName || currentDrawName;

  const [pillar, setPillar] = useState<SignalPillar>("stats_patterns");
  const [statsSubView, setStatsSubView] = useState<"stats" | "patterns" | "gaps">("stats");
  const [spectralSubView, setSpectralSubView] = useState<"spectral" | "fractal" | "math">("spectral");
  const [dynamicsSubView, setDynamicsSubView] = useState<"temporal" | "cluster" | "machine" | "boulonnier">("temporal");
  const [geiData, setGeiData] = useState<GapEfficiency[]>([]);

  useEffect(() => {
    if (history.length > 20) {
      calculateGapEfficiency(history).then(setGeiData);
    }
  }, [history]);

  const mapSubTabToState = (subRaw: string) => {
    const sub = (subRaw || "").toLowerCase();
    if (sub === "stats" || sub === "patterns" || sub === "gaps") {
      setPillar("stats_patterns");
      setStatsSubView(sub as "stats" | "patterns" | "gaps");
    } else if (sub === "spectral" || sub === "fractal" || sub === "math" || sub === "hurst" || sub === "volatility") {
      setPillar("signals_spectral");
      if (sub === "hurst" || sub === "volatility") {
        setSpectralSubView("math");
      } else {
        setSpectralSubView(sub as "spectral" | "fractal" | "math");
      }
    } else if (sub === "temporal" || sub === "cluster" || sub === "machine" || sub === "cycles" || sub === "boulonnier" || sub === "boulonniers" || sub === "correlation") {
      setPillar("dynamics_clustering");
      if (sub === "cycles") setDynamicsSubView("temporal");
      else if (sub === "boulonnier" || sub === "boulonniers" || sub === "correlation") setDynamicsSubView("boulonnier");
      else setDynamicsSubView(sub as "temporal" | "cluster" | "machine" | "boulonnier");
    } else if (sub === "academy" || sub === "formation") {
      setPillar("academy");
    }
  };

  // Écouteur d'événements pour navigation croisée avec rétro-compatibilité totale
  useEffect(() => {
    const handleNavigation = (e: Event) => {
      const customEvent = e as CustomEvent;
      const sub = customEvent.detail?.subTab;
      if (!sub) return;
      mapSubTabToState(sub);

      const contentElement = document.getElementById("signal-content");
      if (contentElement) {
        contentElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };

    window.addEventListener("NAVIGATE_SUB_SIGNAUX", handleNavigation);
    return () => window.removeEventListener("NAVIGATE_SUB_SIGNAUX", handleNavigation);
  }, []);

  useEffect(() => {
    if (activeSubTab) {
      mapSubTabToState(activeSubTab);
    }
  }, [activeSubTab]);

  const pillars = [
    {
      id: "stats_patterns" as SignalPillar,
      label: "Stats & Motifs",
      desc: "Fréquences & Écarts",
      icon: BarChart2,
      color: "text-indigo-400",
    },
    {
      id: "signals_spectral" as SignalPillar,
      label: "Ondes & Spectres",
      desc: "Harmoniques & Fractales",
      icon: Waves,
      color: "text-purple-400",
    },
    {
      id: "dynamics_clustering" as SignalPillar,
      label: "Dynamique & Markov",
      desc: "Temps, Clusters & Transfert",
      icon: Activity,
      color: "text-cyan-400",
    },
    {
      id: "academy" as SignalPillar,
      label: "Académie",
      desc: "Documentation & Théorie",
      icon: BookOpen,
      color: "text-fuchsia-400",
    },
  ];

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in w-full px-1 md:px-0">
      <SmartInsights drawName={activeDraw} />

      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6 min-w-0">
          {/* Barre de navigation consolidée à 4 Piliers */}
          <div className="relative z-20 bg-nexus-950 py-2 -mx-4 px-4 md:mx-0 md:px-0 md:bg-transparent">
            <div className="overflow-x-auto scrollbar-hide pb-2 mask-fade-right">
              <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl w-max border border-slate-200 dark:border-slate-700 shadow-inner gap-1">
                {pillars.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = pillar === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        audioEngine.play("click");
                        setPillar(tab.id);
                      }}
                      className={`
                        px-4 md:px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2 whitespace-nowrap flex-shrink-0 cursor-pointer
                        ${
                          isActive
                            ? "bg-white dark:bg-slate-700 shadow-lg text-slate-800 dark:text-white ring-1 ring-black/5 dark:ring-white/10"
                            : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        }
                      `}
                    >
                      <Icon size={15} className={isActive ? tab.color : ""} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div
            id="signal-content"
            className="transition-all duration-300 scroll-mt-[250px] md:scroll-mt-[200px]"
          >
            <LocalErrorBoundary name="SignalSubTab">
              <Suspense
                fallback={
                  <div className="h-96 flex items-center justify-center bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div className="flex flex-col items-center gap-4 text-slate-400">
                      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs font-bold uppercase tracking-wider">
                        Extraction du signal...
                      </span>
                    </div>
                  </div>
                }
              >
                {/* PILIER 1: STATS & MOTIFS */}
                {pillar === "stats_patterns" && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 w-max max-w-full overflow-x-auto">
                      <button
                        onClick={() => {
                          audioEngine.play("click");
                          setStatsSubView("stats");
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          statsSubView === "stats"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <BarChart2 size={13} />
                        Fréquences & Stats
                      </button>
                      <button
                        onClick={() => {
                          audioEngine.play("click");
                          setStatsSubView("patterns");
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          statsSubView === "patterns"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Workflow size={13} />
                        Motifs Répétitifs
                      </button>
                      <button
                        onClick={() => {
                          audioEngine.play("click");
                          setStatsSubView("gaps");
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          statsSubView === "gaps"
                            ? "bg-rose-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Compass size={13} />
                        Écarts & Retards
                      </button>
                    </div>

                    {statsSubView === "stats" && <StatsTab drawName={activeDraw} />}
                    {statsSubView === "patterns" && <PatternDiscoveryTab drawName={activeDraw} />}
                    {statsSubView === "gaps" && <GapPatternTab drawName={activeDraw} />}
                  </div>
                )}

                {/* PILIER 2: ONDES & SPECTRES */}
                {pillar === "signals_spectral" && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 w-max max-w-full overflow-x-auto">
                      <button
                        onClick={() => {
                          audioEngine.play("click");
                          setSpectralSubView("spectral");
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          spectralSubView === "spectral"
                            ? "bg-purple-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Waves size={13} />
                        Analyse Spectrale FFT
                      </button>
                      <button
                        onClick={() => {
                          audioEngine.play("click");
                          setSpectralSubView("fractal");
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          spectralSubView === "fractal"
                            ? "bg-teal-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Layers size={13} />
                        Météo Fractale & Chaos
                      </button>
                      <button
                        onClick={() => {
                          audioEngine.play("click");
                          setSpectralSubView("math");
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          spectralSubView === "math"
                            ? "bg-rose-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Activity size={13} />
                        Indicateurs Mathématiques
                      </button>
                    </div>

                    {spectralSubView === "spectral" && <SpectralTab drawName={activeDraw} />}
                    {spectralSubView === "fractal" && <FractalTab drawName={activeDraw} />}
                    {spectralSubView === "math" && <MathTab drawName={activeDraw} />}
                  </div>
                )}

                {/* PILIER 3: DYNAMIQUE & MARKOV */}
                {pillar === "dynamics_clustering" && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 w-max max-w-full overflow-x-auto">
                      <button
                        onClick={() => {
                          audioEngine.play("click");
                          setDynamicsSubView("temporal");
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          dynamicsSubView === "temporal"
                            ? "bg-amber-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Clock size={13} />
                        Dynamique Temporelle
                      </button>
                      <button
                        onClick={() => {
                          audioEngine.play("click");
                          setDynamicsSubView("cluster");
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          dynamicsSubView === "cluster"
                            ? "bg-cyan-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Box size={13} />
                        Markov & Réseaux de Clusters
                      </button>
                      <button
                        onClick={() => {
                          audioEngine.play("click");
                          setDynamicsSubView("machine");
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          dynamicsSubView === "machine"
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Cpu size={13} />
                        Transfert Machine & Entropie
                      </button>
                      <button
                        onClick={() => {
                          audioEngine.play("click");
                          setDynamicsSubView("boulonnier");
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          dynamicsSubView === "boulonnier"
                            ? "bg-amber-600 text-white shadow-sm font-black"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Workflow size={13} />
                        Corrélation Boulonniers (10H/16H/19H55)
                      </button>
                    </div>

                    {dynamicsSubView === "temporal" && <TemporalTab drawName={activeDraw} />}
                    {dynamicsSubView === "cluster" && <ClusteringTab drawName={activeDraw} />}
                    {dynamicsSubView === "machine" && <MachineTransferTab drawName={activeDraw} />}
                    {dynamicsSubView === "boulonnier" && <BoulonnierCrossCorrelationTab drawName={activeDraw} />}
                  </div>
                )}

                {/* PILIER 4: ACADÉMIE */}
                {pillar === "academy" && <AcademyTab />}
              </Suspense>
            </LocalErrorBoundary>
          </div>
        </div>

        {/* Sidebar Widget : Attracteur & GEI */}
        <div className="lg:col-span-4 space-y-6">
          <ChaosAttractor history={history} />
          <GapEfficiencyMeter data={geiData} />

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-xl">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Box size={12} className="text-indigo-500" /> Analyse Contextuelle
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
              Les graphiques isolent les singularités mathématiques. Une forte
              "Maturité" (GEI) couplée à une résonance spectrale indique une
              sortie imminente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
