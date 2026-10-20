import React, { useState, Suspense, lazy, useEffect } from "react";
import {
  Grid,
  GitBranch,
  Calculator,
  RefreshCw,
  Users,
  Terminal,
  Network,
  Share2,
} from "lucide-react";
import { LocalErrorBoundary } from "../ui/LocalErrorBoundary";
import { audioEngine } from "../../utils/audioEngine";
import { useNexusStore } from "../../store/useNexusStore";

const SpatialTab = lazy(() =>
  import("./SpatialTab").then((m) => ({ default: m.SpatialTab })),
);
const SynergyTab = lazy(() =>
  import("./SynergyTab").then((m) => ({ default: m.SynergyTab })),
);
const DecisionTreeTab = lazy(() =>
  import("./DecisionTreeTab").then((m) => ({ default: m.DecisionTreeTab })),
);
const CombinationsTab = lazy(() =>
  import("./CombinationsTab").then((m) => ({ default: m.CombinationsTab })),
);
const PythonAnalystTab = lazy(() =>
  import("./PythonAnalystTab").then((m) => ({ default: m.PythonAnalystTab })),
);
const NeuralArchitectureTab = lazy(() =>
  import("./NeuralArchitectureTab").then((m) => ({
    default: m.NeuralArchitectureTab,
  })),
);
const InterDrawRelationsTab = lazy(() =>
  import("./InterDrawRelationsTab").then((m) => ({
    default: m.InterDrawRelationsTab,
  })),
);

interface TopologyHubProps {
  drawName: string;
}

type TopologyPillar = "geometry_networks" | "synergy_decisions" | "inter_draw_relations" | "combinations_kernel";

const TabLoader = () => (
  <div className="flex flex-col items-center justify-center py-24 gap-4 animate-pulse">
    <RefreshCw className="animate-spin text-indigo-500" />
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
      Analyse Structurelle...
    </p>
  </div>
);

export const TopologyHub: React.FC<TopologyHubProps> = ({ drawName }) => {
  const activeSubTab = useNexusStore((state) => state.activeSubTab);
  const [pillar, setPillar] = useState<TopologyPillar>("geometry_networks");
  const [geomSubView, setGeomSubView] = useState<"spatial" | "neural">("spatial");
  const [synergySubView, setSynergySubView] = useState<"synergy" | "decision">("synergy");
  const [combSubView, setCombSubView] = useState<"combinations" | "python">("combinations");

  const mapSubTabToState = (subRaw: string) => {
    const sub = (subRaw || "").toLowerCase();
    if (sub === "spatial" || sub === "neural" || sub === "geometry" || sub === "network") {
      setPillar("geometry_networks");
      setGeomSubView(sub === "neural" ? "neural" : "spatial");
    } else if (sub === "synergy" || sub === "decision" || sub === "tree" || sub === "affinities") {
      setPillar("synergy_decisions");
      setSynergySubView(sub === "decision" || sub === "tree" ? "decision" : "synergy");
    } else if (sub === "interdraw" || sub === "inter_draw" || sub === "relations" || sub === "crossdraw" || sub === "familles") {
      setPillar("inter_draw_relations");
    } else if (sub === "combinations" || sub === "python" || sub === "kernel") {
      setPillar("combinations_kernel");
      setCombSubView(sub === "python" ? "python" : "combinations");
    }
  };

  // Rétro-compatibilité et écouteur d'événements
  useEffect(() => {
    const handleNavigation = (e: Event) => {
      const customEvent = e as CustomEvent;
      const sub = customEvent.detail?.subTab;
      if (!sub) return;
      mapSubTabToState(sub);

      const contentElement = document.getElementById("topology-content");
      if (contentElement) {
        contentElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };

    window.addEventListener("NAVIGATE_SUB_TOPOLOGIE", handleNavigation);
    return () => window.removeEventListener("NAVIGATE_SUB_TOPOLOGIE", handleNavigation);
  }, []);

  useEffect(() => {
    if (activeSubTab) {
      mapSubTabToState(activeSubTab);
    }
  }, [activeSubTab]);

  const pillars = [
    {
      id: "geometry_networks" as TopologyPillar,
      label: "Géométrie & Réseaux",
      desc: "Espace & Graphes",
      icon: Grid,
      color: "text-indigo-400",
    },
    {
      id: "synergy_decisions" as TopologyPillar,
      label: "Synergie & Décisions",
      desc: "Affinités & Arbres",
      icon: Share2,
      color: "text-emerald-400",
    },
    {
      id: "inter_draw_relations" as TopologyPillar,
      label: "Flux Inter-Tirages",
      desc: "10H/16H, 13H & 19H55",
      icon: GitBranch,
      color: "text-amber-400",
    },
    {
      id: "combinations_kernel" as TopologyPillar,
      label: "Architecte & Deep Kernel",
      desc: "Combinaisons & Python",
      icon: Calculator,
      color: "text-rose-400",
    },
  ];

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in w-full px-1 md:px-0">
      {/* Barre de navigation consolidée à 3 Piliers */}
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
        id="topology-content"
        className="transition-all duration-300 scroll-mt-[250px] md:scroll-mt-[200px]"
      >
        <LocalErrorBoundary name="TopologySubTab">
          <Suspense fallback={<TabLoader />}>
            {/* PILIER 1: GÉOMÉTRIE & RÉSEAUX */}
            {pillar === "geometry_networks" && (
              <div className="space-y-6">
                <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 w-max max-w-full overflow-x-auto">
                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setGeomSubView("spatial");
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      geomSubView === "spatial"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Grid size={13} />
                    Grille Spatiale & Barycentres
                  </button>
                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setGeomSubView("neural");
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      geomSubView === "neural"
                        ? "bg-purple-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Network size={13} />
                    Architecture Neurale Graph
                  </button>
                </div>

                {geomSubView === "spatial" && <SpatialTab drawName={drawName} />}
                {geomSubView === "neural" && <NeuralArchitectureTab />}
              </div>
            )}

            {/* PILIER 2: SYNERGIE & DÉCISIONS */}
            {pillar === "synergy_decisions" && (
              <div className="space-y-6">
                <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 w-max max-w-full overflow-x-auto">
                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setSynergySubView("synergy");
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      synergySubView === "synergy"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Users size={13} />
                    Synergies & Co-Occurrences
                  </button>
                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setSynergySubView("decision");
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      synergySubView === "decision"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <GitBranch size={13} />
                    Arbres de Décision & Forêts
                  </button>
                </div>

                {synergySubView === "synergy" && <SynergyTab drawName={drawName} />}
                {synergySubView === "decision" && <DecisionTreeTab drawName={drawName} />}
              </div>
            )}

            {/* PILIER 3: RELATIONS INTER-TIRAGES (FAMILLES ÉTANCHES) */}
            {pillar === "inter_draw_relations" && (
              <div className="space-y-6">
                <InterDrawRelationsTab
                  drawName={drawName}
                  onSelectDraw={(d) => {
                    useNexusStore.getState().setDrawName(d);
                  }}
                />
              </div>
            )}

            {/* PILIER 4: COMBINAISONS & DEEP KERNEL */}
            {pillar === "combinations_kernel" && (
              <div className="space-y-6">
                <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 w-max max-w-full overflow-x-auto">
                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setCombSubView("combinations");
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      combSubView === "combinations"
                        ? "bg-rose-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Calculator size={13} />
                    Architecte de Combinaisons
                  </button>
                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setCombSubView("python");
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      combSubView === "python"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Terminal size={13} />
                    Deep Kernel Python
                  </button>
                </div>

                {combSubView === "combinations" && <CombinationsTab drawName={drawName} />}
                {combSubView === "python" && <PythonAnalystTab drawName={drawName} />}
              </div>
            )}
          </Suspense>
        </LocalErrorBoundary>
      </div>
    </div>
  );
};
