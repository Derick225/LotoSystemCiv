import React, { useState, Suspense, lazy, useEffect, useTransition } from "react";
import {
  Grid,
  GitBranch,
  Calculator,
  RefreshCw,
  Users,
  Terminal,
  Network,
} from "lucide-react";
import { LocalErrorBoundary } from "../ui/LocalErrorBoundary";
import { audioEngine } from "../../utils/audioEngine";

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

const subTabPreloaders: Record<string, () => Promise<unknown>> = {
  spatial: () => import("./SpatialTab"),
  neural: () => import("./NeuralArchitectureTab"),
  synergy: () => import("./SynergyTab"),
  decision: () => import("./DecisionTreeTab"),
  combinations: () => import("./CombinationsTab"),
  python: () => import("./PythonAnalystTab"),
};

interface TopologyHubProps {
  drawName: string;
}

const TabLoader = () => (
  <div className="flex flex-col items-center justify-center py-24 gap-4 animate-pulse">
    <RefreshCw className="animate-spin text-indigo-500" />
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
      Analyse Structurelle...
    </p>
  </div>
);

export const TopologyHub: React.FC<TopologyHubProps> = ({ drawName }) => {
  const [isPending, startTransition] = useTransition();
  const [subTab, setSubTab] = useState<
    "spatial" | "synergy" | "decision" | "combinations" | "python" | "neural"
  >("spatial");

  // SYMBIOSE : Écouteur d'événements
  useEffect(() => {
    const handleNavigation = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.subTab) {
        startTransition(() => {
          setSubTab(customEvent.detail.subTab);
        });
        const contentElement = document.getElementById("topology-content");
        if (contentElement)
          contentElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener("NAVIGATE_SUB_TOPOLOGIE", handleNavigation);
    return () =>
      window.removeEventListener("NAVIGATE_SUB_TOPOLOGIE", handleNavigation);
  }, []);

  const renderTab = () => {
    switch (subTab) {
      case "spatial":
        return <SpatialTab drawName={drawName} />;
      case "synergy":
        return <SynergyTab drawName={drawName} />;
      case "decision":
        return <DecisionTreeTab drawName={drawName} />;
      case "combinations":
        return <CombinationsTab drawName={drawName} />;
      case "python":
        return <PythonAnalystTab drawName={drawName} />;
      case "neural":
        return <NeuralArchitectureTab />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Navigation sur Mobile */}
      <div className="relative z-20 bg-nexus-950 py-2 -mx-4 px-4 md:mx-0 md:px-0 md:bg-transparent">
        <div className="overflow-x-auto scrollbar-hide pb-2 mask-fade-right">
          <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl md:rounded-2xl w-max border border-slate-200 dark:border-slate-700 shadow-inner">
            {[
              {
                id: "spatial",
                label: "Géométrie",
                icon: Grid,
                color: "text-indigo-500",
              },
              {
                id: "neural",
                label: "Architecture",
                icon: Network,
                color: "text-purple-500",
              },
              {
                id: "synergy",
                label: "Synergie",
                icon: Users,
                color: "text-blue-500",
              },
              {
                id: "decision",
                label: "Décision",
                icon: GitBranch,
                color: "text-emerald-500",
              },
              {
                id: "combinations",
                label: "Architecte",
                icon: Calculator,
                color: "text-rose-500",
              },
              {
                id: "python",
                label: "Deep Kernel",
                icon: Terminal,
                color: "text-emerald-400",
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  audioEngine.play("click");
                  startTransition(() => {
                    setSubTab(
                      tab.id as
                        | "spatial"
                        | "synergy"
                        | "decision"
                        | "combinations"
                        | "python"
                        | "neural",
                    );
                  });
                }}
                onMouseEnter={() => subTabPreloaders[tab.id]?.()}
                onTouchStart={() => subTabPreloaders[tab.id]?.()}
                className={`
                                    px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 whitespace-nowrap flex-shrink-0 btn-reactive
                                    ${
                                      subTab === tab.id
                                        ? tab.id === "python"
                                          ? "bg-emerald-600 text-white shadow-xl scale-105 z-10 ring-1 ring-black/5 dark:ring-white/10"
                                          : "bg-white dark:bg-slate-700 shadow-lg scale-105 z-10 text-slate-800 dark:text-white ring-1 ring-black/5 dark:ring-white/10"
                                        : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                    }
                                `}
              >
                <tab.icon
                  size={14}
                  className={
                    subTab === tab.id
                      ? tab.id === "python"
                        ? "text-white"
                        : tab.color
                      : ""
                  }
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
        id="topology-content"
        className="animate-slide-up transition-all duration-500 scroll-mt-[240px] md:scroll-mt-[280px]"
      >
        <LocalErrorBoundary key={subTab}>
          <Suspense fallback={<TabLoader />}>{renderTab()}</Suspense>
        </LocalErrorBoundary>
      </div>
    </div>
  );
};
