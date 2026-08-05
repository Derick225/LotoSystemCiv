import React, { useState, Suspense, lazy, useEffect, useTransition } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { SmartInsights } from "../SmartInsights";
import {
  BarChart2,
  Waves,
  Activity,
  Layers,
  Clock,
  RefreshCw,
  BookOpen,
  Box,
  Compass,
} from "lucide-react";
import { LocalErrorBoundary } from "../ui/LocalErrorBoundary";
import { calculateGapEfficiency } from "../../services/mathService";
import { GapEfficiencyMeter } from "../GapEfficiencyMeter";
import type { GapEfficiency } from "../../types";
import { audioEngine } from "../../utils/audioEngine";

// Three.js (~600 Ko+) ne doit pas alourdir le chunk de l'onglet Signaux au chargement :
// on le charge à la demande, uniquement quand le widget est effectivement affiché.
const ChaosAttractor = lazy(() =>
  import("../ChaosAttractor").then((m) => ({ default: m.ChaosAttractor })),
);

const StatsTab = lazy(() =>
  import("./StatsTab").then((m) => ({ default: m.StatsTab })),
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
const AcademyTab = lazy(() =>
  import("./AcademyTab").then((m) => ({ default: m.AcademyTab })),
);

const subTabPreloaders: Record<string, () => Promise<unknown>> = {
  stats: () => import("./StatsTab"),
  gaps: () => import("./GapPatternTab"),
  spectral: () => import("./SpectralTab"),
  fractal: () => import("./FractalTab"),
  math: () => import("./MathTab"),
  temporal: () => import("./TemporalTab"),
  cluster: () => import("./ClusteringTab"),
  academy: () => import("./AcademyTab"),
};

export const SignalHub: React.FC = () => {
  const history = useNexusStore((state) => state.history);
  const drawName = useNexusStore((state) => state.drawName);
  const currentDrawName = useNexusStore((state) => state.currentDrawName);
  const activeDraw = drawName || currentDrawName;

  const [isPending, startTransition] = useTransition();
  const [activeSubTab, setActiveSubTab] = useState("stats");
  const [geiData, setGeiData] = useState<GapEfficiency[]>([]);

  // Préchargement en arrière-plan des sous-onglets lors de l'inactivité du navigateur
  useEffect(() => {
    const idleCallback = (window as any).requestIdleCallback || ((cb: any) => setTimeout(cb, 1000));
    idleCallback(() => {
      Object.values(subTabPreloaders).forEach((preload) => {
        try {
          preload();
        } catch (e) {
          console.warn("[SignalHub] Échec du préchargement en tâche de fond :", e);
        }
      });
    });
  }, []);

  useEffect(() => {
    if (history.length > 20) {
      calculateGapEfficiency(history).then(setGeiData);
    }
  }, [history]);

  // SYMBIOSE : Écouteur d'événements pour navigation croisée
  useEffect(() => {
    const handleNavigation = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.subTab) {
        startTransition(() => {
          setActiveSubTab(customEvent.detail.subTab);
        });
        const contentElement = document.getElementById("signal-content");
        if (contentElement)
          contentElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    // On écoute l'événement spécifique dispatché par DrawDetails
    window.addEventListener("NAVIGATE_SUB_SIGNAUX", handleNavigation);
    return () =>
      window.removeEventListener("NAVIGATE_SUB_SIGNAUX", handleNavigation);
  }, []);

  const tabs = [
    { id: "stats", label: "Stats", icon: BarChart2, color: "text-indigo-500" },
    { id: "gaps", label: "Écarts", icon: Compass, color: "text-rose-500" },
    {
      id: "spectral",
      label: "Spectral",
      icon: Waves,
      color: "text-purple-500",
    },
    { id: "fractal", label: "Météo", icon: Layers, color: "text-emerald-500" },
    { id: "math", label: "Maths", icon: Activity, color: "text-rose-500" },
    { id: "temporal", label: "Temps", icon: Clock, color: "text-amber-500" },
    {
      id: "cluster",
      label: "Markov & Clusters",
      icon: Box,
      color: "text-cyan-500",
    },
    {
      id: "academy",
      label: "Académie",
      icon: BookOpen,
      color: "text-fuchsia-500",
    },
  ];

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in w-full px-1 md:px-0">
      <SmartInsights drawName={activeDraw} />

      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6 min-w-0">
          {/* Navigation Onglets Mobile Optimized */}
          <div className="relative z-20 bg-nexus-950 py-2 -mx-4 px-4 md:mx-0 md:px-0 md:bg-transparent">
            <div className="overflow-x-auto scrollbar-hide pb-2 mask-fade-right">
              <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl md:rounded-2xl w-max border border-slate-200 dark:border-slate-700 shadow-inner">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      audioEngine.play("click");
                      startTransition(() => {
                        setActiveSubTab(tab.id);
                      });
                    }}
                    onMouseEnter={() => subTabPreloaders[tab.id]?.()}
                    onTouchStart={() => subTabPreloaders[tab.id]?.()}
                    className={`
                                            px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 whitespace-nowrap flex-shrink-0 btn-reactive
                                            ${
                                              activeSubTab === tab.id
                                                ? "bg-white dark:bg-slate-700 shadow-lg scale-105 z-10 text-slate-800 dark:text-white ring-1 ring-black/5 dark:ring-white/10"
                                                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                            }
                                        `}
                  >
                    <tab.icon
                      size={14}
                      className={activeSubTab === tab.id ? tab.color : ""}
                    />
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <style
              dangerouslySetInnerHTML={{
                __html: `
                            .mask-fade-right {
                                -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%);
                                mask-image: linear-gradient(to right, black 85%, transparent 100%);
                            }
                            @media (min-width: 1024px) {
                                .mask-fade-right { -webkit-mask-image: none; mask-image: none; }
                            }
                        `,
              }}
            />
          </div>

          <div
            id="signal-content"
            className="min-h-[400px] transition-all duration-500 scroll-mt-[240px] md:scroll-mt-[280px]"
          >
            <LocalErrorBoundary key={activeSubTab}>
              <Suspense
                fallback={
                  <div className="py-20 flex flex-col items-center justify-center gap-4">
                    <RefreshCw
                      className="animate-spin text-indigo-500"
                      size={32}
                    />
                    <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">
                      Calcul du module...
                    </p>
                  </div>
                }
              >
                {activeSubTab === "stats" && <StatsTab drawName={activeDraw} />}
                {activeSubTab === "gaps" && (
                  <GapPatternTab drawName={activeDraw} />
                )}
                {activeSubTab === "spectral" && (
                  <SpectralTab drawName={activeDraw} />
                )}
                {activeSubTab === "fractal" && (
                  <FractalTab drawName={activeDraw} />
                )}
                {activeSubTab === "math" && <MathTab drawName={activeDraw} />}
                {activeSubTab === "temporal" && (
                  <TemporalTab drawName={activeDraw} />
                )}
                {activeSubTab === "cluster" && (
                  <ClusteringTab drawName={activeDraw} />
                )}
                {activeSubTab === "academy" && <AcademyTab />}
              </Suspense>
            </LocalErrorBoundary>
          </div>
        </div>

        {/* Sidebar Widget : Attracteur & GEI */}
        <div className="lg:col-span-4 space-y-6">
          <Suspense
            fallback={
              <div className="h-[420px] flex items-center justify-center bg-slate-950 rounded-2xl border border-slate-900/80 animate-pulse text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                Chargement du moteur 3D...
              </div>
            }
          >
            <ChaosAttractor history={history} />
          </Suspense>
          <GapEfficiencyMeter data={geiData} />

          <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] md:rounded-2xl border border-slate-100 dark:border-slate-700 shadow-xl">
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
