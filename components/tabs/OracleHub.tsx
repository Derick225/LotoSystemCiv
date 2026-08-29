import React, { useState, Suspense, lazy } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import {
  Sparkles,
  Medal,
  BrainCircuit,
  Network,
  AlertTriangle,
  ShieldCheck,
  Hexagon,
  Layers,
  Gauge,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

const PredictionTab = lazy(() =>
  import("./PredictionTab").then((m) => ({ default: m.PredictionTab })),
);
const MetaAnalystTab = lazy(() =>
  import("./MetaAnalystTab").then((m) => ({ default: m.MetaAnalystTab })),
);
const IntelligenceTab = lazy(() =>
  import("./IntelligenceTab").then((m) => ({ default: m.IntelligenceTab })),
);
const OrchestrationTab = lazy(() =>
  import("./OrchestrationTab").then((m) => ({ default: m.OrchestrationTab })),
);
const StrategicSynthesisTab = lazy(() =>
  import("./StrategicSynthesisTab").then((m) => ({
    default: m.StrategicSynthesisTab,
  })),
);
const IAPredictionTab = lazy(() =>
  import("./IAPredictionTab").then((m) => ({ default: m.IAPredictionTab })),
);
const InertiaOptimizerTab = lazy(() =>
  import("./InertiaOptimizerTab").then((m) => ({
    default: m.InertiaOptimizerTab,
  })),
);

const subTabPreloaders: Record<string, () => Promise<unknown>> = {
  strategic: () => import("./StrategicSynthesisTab"),
  ai_prediction: () => import("./IAPredictionTab"),
  inertia_optimizer: () => import("./InertiaOptimizerTab"),
  platinum: () => import("./MetaAnalystTab"),
  oracle: () => import("./PredictionTab"),
  orch: () => import("./OrchestrationTab"),
};

interface OracleHubProps {
  drawName: string;
}

export const OracleHub: React.FC<OracleHubProps> = ({ drawName }) => {
  const globalRegime = useNexusStore((state) => state.regime);
  const nexusLoading = useNexusStore((state) => state.loading);

  // Platinum est maintenant le moteur principal, mais on expose la Synthèse en premier plan
  const [subTab, setSubTab] = useState<
    | "oracle"
    | "platinum"
    | "orch"
    | "strategic"
    | "ai_prediction"
    | "inertia_optimizer"
  >("strategic");

  // SYMBIOSE : Écouteur d'événements
  React.useEffect(() => {
    const handleNavigation = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.subTab) {
        setSubTab(customEvent.detail.subTab as never);
        const contentElement = document.getElementById("oracle-content");
        if (contentElement)
          contentElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener("NAVIGATE_SUB_ORACLE", handleNavigation);
    return () =>
      window.removeEventListener("NAVIGATE_SUB_ORACLE", handleNavigation);
  }, []);

  const subTabs = [
    {
      id: "strategic",
      label: "Stratégie IA",
      icon: <Hexagon size={16} />,
      color: "text-indigo-500",
      bg: "hover:bg-indigo-50",
    },
    {
      id: "ai_prediction",
      label: "Prédiction IA",
      tag: "Cloud",
      icon: <BrainCircuit size={16} />,
      color: "text-fuchsia-500",
      bg: "hover:bg-fuchsia-50",
    },
    {
      id: "inertia_optimizer",
      label: "Inertie Système",
      icon: <Gauge size={16} />,
      color: "text-cyan-500",
      bg: "hover:bg-cyan-50",
    },
    {
      id: "platinum",
      label: "Platinum Elite",
      icon: <Medal size={16} />,
      color: "text-amber-500",
      bg: "hover:bg-amber-50",
    },
    {
      id: "oracle",
      label: "Oracle Base",
      tag: "Local",
      icon: <Sparkles size={16} />,
      color: "text-violet-500",
      bg: "hover:bg-violet-50",
    },
    {
      id: "orch",
      label: "Orchestra",
      icon: <Network size={16} />,
      color: "text-blue-500",
      bg: "hover:bg-blue-50",
    },
  ];

  if (nexusLoading)
    return (
      <div className="p-20 text-center animate-pulse text-indigo-500">
        Connexion Oracle...
      </div>
    );

  return (
    <div className="space-y-8 animate-fade-in relative">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-20 bg-nexus-950 py-2 -mx-4 px-4 md:mx-0 md:px-0 md:bg-transparent">
        <div className="w-full md:w-auto">
          <div className="overflow-x-auto scrollbar-hide pb-2 mask-fade-right">
            <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl md:rounded-2xl w-max border border-slate-200 dark:border-slate-700 shadow-inner">
              {subTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    audioEngine.play("click");
                    setSubTab(
                      tab.id as
                        | "oracle"
                        | "platinum"
                        | "orch"
                        | "strategic"
                        | "ai_prediction"
                        | "inertia_optimizer",
                    );
                  }}
                  onMouseEnter={() => subTabPreloaders[tab.id]?.()}
                  onTouchStart={() => subTabPreloaders[tab.id]?.()}
                  className={`
                                        px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 whitespace-nowrap flex-shrink-0
                                        ${
                                          subTab === tab.id
                                            ? "bg-white dark:bg-slate-700 shadow-lg scale-105 z-10 text-slate-800 dark:text-white ring-1 ring-black/5 dark:ring-white/10"
                                            : `text-slate-400 hover:text-slate-600 dark:hover:text-slate-300`
                                        }
                                    `}
                >
                  <span className={subTab === tab.id ? tab.color : ""}>
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                  {tab.tag && (
                    <span
                      className={`px-1.5 py-0.2 rounded-md text-[8px] font-black tracking-normal ${
                        tab.tag === "Local"
                          ? subTab === tab.id
                            ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30"
                            : "bg-slate-200 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400"
                          : subTab === tab.id
                            ? "bg-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-300 border border-fuchsia-500/30"
                            : "bg-slate-200 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {tab.tag}
                    </span>
                  )}
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-mono text-xs">
            <span className="text-[10px] font-bold text-slate-400">
              B_score:
            </span>
            <span className="font-extrabold text-emerald-400">
              {Math.round(
                100 *
                  (0.4 * (1 - 0.18) +
                    0.35 *
                      (1 -
                        (useNexusStore.getState().volatility?.score || 0.2)) +
                    0.25 * (1 - 0.82)),
              )}
              %
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-400 font-mono text-xs">
            <span className="text-[10px] font-bold text-slate-400">
              Hurst H:
            </span>
            <span className="font-extrabold text-amber-400">
              {(globalRegime?.hurst || 0.5).toFixed(3)}
            </span>
          </div>
          <div
            className={`flex items-center gap-3 px-4 py-2 rounded-2xl border ${globalRegime?.regime === "CHAOS" ? "bg-rose-50 border-rose-200 text-rose-600 animate-pulse dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-400" : "bg-indigo-50 border-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300"}`}
          >
            {globalRegime?.regime === "CHAOS" ? (
              <AlertTriangle size={16} />
            ) : (
              <ShieldCheck size={16} />
            )}
            <span className="text-[10px] font-black uppercase">
              Régime {globalRegime?.regime || "Analyse..."}
            </span>
          </div>
        </div>
      </div>

      {/* Proactive Drift Alert Banner en cas de rupture de régime */}
      {(globalRegime?.regime === "CHAOS" ||
        (globalRegime?.hurst && globalRegime.hurst < 0.42)) && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/80 via-red-900/40 to-slate-900 border border-rose-500/40 text-rose-200 shadow-xl flex items-start gap-4 animate-pulse">
          <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 shrink-0 mt-0.5">
            <AlertTriangle size={22} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-rose-400">
                Alerte Rupture de Régime (Concept Drift)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold">
                CRITIQUE
              </span>
            </div>
            <p className="text-xs text-rose-100/90 leading-relaxed font-sans">
              Bascule détectée vers un régime <strong>CHAOTIQUE</strong>{" "}
              (Exposant de Hurst{" "}
              <code className="text-rose-300 font-mono">
                H = {(globalRegime?.hurst || 0.38).toFixed(3)}
              </code>
              ). Effondrement de l'autocorrélation harmonique. L'Oracle a ajusté
              automatiquement la température de génération à{" "}
              <code className="text-rose-300 font-mono">
                T ={" "}
                {(
                  0.1 +
                  0.85 /
                    (1.0 +
                      Math.exp(12.0 * ((globalRegime?.hurst || 0.38) - 0.5)))
                ).toFixed(2)}
              </code>{" "}
              pour modéliser les stochastiques chaotiques sans biais.
            </p>
          </div>
        </div>
      )}

      <div
        id="oracle-content"
        className="animate-slide-up transition-all duration-500 min-h-[600px] scroll-mt-[300px] md:scroll-mt-[280px]"
      >
        <Suspense
          fallback={
            <div className="p-20 text-center animate-pulse text-indigo-500">
              Chargement du Module...
            </div>
          }
        >
          {subTab === "strategic" && (
            <StrategicSynthesisTab drawName={drawName} />
          )}
          {subTab === "ai_prediction" && (
            <IAPredictionTab drawName={drawName} />
          )}
          {subTab === "inertia_optimizer" && (
            <InertiaOptimizerTab drawName={drawName} />
          )}
          {subTab === "oracle" && <PredictionTab drawName={drawName} />}
          {subTab === "platinum" && <MetaAnalystTab drawName={drawName} />}
          {subTab === "orch" && <OrchestrationTab drawName={drawName} />}
        </Suspense>
      </div>
    </div>
  );
};
