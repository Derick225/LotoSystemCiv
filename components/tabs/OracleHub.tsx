import React, { useState, Suspense, lazy, useEffect } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import {
  Sparkles,
  Medal,
  BrainCircuit,
  Network,
  AlertTriangle,
  ShieldCheck,
  Hexagon,
  Gauge,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

const PredictionTab = lazy(() =>
  import("./PredictionTab").then((m) => ({ default: m.PredictionTab })),
);
const MetaAnalystTab = lazy(() =>
  import("./MetaAnalystTab").then((m) => ({ default: m.MetaAnalystTab })),
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

interface OracleHubProps {
  drawName: string;
}

type MainPillar = "inference" | "strategic" | "orchestration";
type InferenceMode = "platinum" | "oracle" | "ai_cloud";
type OrchestrationMode = "models" | "inertia";

export const OracleHub: React.FC<OracleHubProps> = ({ drawName }) => {
  const globalRegime = useNexusStore((state) => state.regime);
  const nexusLoading = useNexusStore((state) => state.loading);
  const activeSubTab = useNexusStore((state) => state.activeSubTab);

  const [pillar, setPillar] = useState<MainPillar>("strategic");
  const [inferenceMode, setInferenceMode] = useState<InferenceMode>("platinum");
  const [orchestrationMode, setOrchestrationMode] = useState<OrchestrationMode>("models");

  // Rétrocompatibilité et navigation croisée
  useEffect(() => {
    const handleNavigation = (e: Event) => {
      const customEvent = e as CustomEvent;
      const sub = customEvent.detail?.subTab;
      if (!sub) return;
      mapSubTabToState(sub);
      const contentElement = document.getElementById("oracle-content");
      if (contentElement) {
        contentElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };

    window.addEventListener("NAVIGATE_SUB_ORACLE", handleNavigation);
    return () => window.removeEventListener("NAVIGATE_SUB_ORACLE", handleNavigation);
  }, []);

  const mapSubTabToState = (subRaw: string) => {
    const sub = (subRaw || "").toLowerCase();
    if (sub === "strategic" || sub === "synthesis" || sub === "portfolio") {
      setPillar("strategic");
    } else if (sub === "platinum" || sub === "meta" || sub === "meta_analyst") {
      setPillar("inference");
      setInferenceMode("platinum");
    } else if (
      sub === "oracle" ||
      sub === "oracle_base" ||
      sub === "base" ||
      sub === "prediction" ||
      sub === "predictions" ||
      sub === "inference"
    ) {
      setPillar("inference");
      setInferenceMode("oracle");
    } else if (sub === "ai_prediction" || sub === "ai_cloud" || sub === "ai" || sub === "cloud") {
      setPillar("inference");
      setInferenceMode("ai_cloud");
    } else if (sub === "orch" || sub === "models" || sub === "ensemble" || sub === "orchestration") {
      setPillar("orchestration");
      setOrchestrationMode("models");
    } else if (sub === "inertia_optimizer" || sub === "inertia") {
      setPillar("orchestration");
      setOrchestrationMode("inertia");
    }
  };

  useEffect(() => {
    if (activeSubTab) {
      mapSubTabToState(activeSubTab);
    }
  }, [activeSubTab]);

  const pillars = [
    {
      id: "strategic" as MainPillar,
      label: "Synthèse Stratégique",
      desc: "Régimes & Portefeuille",
      icon: <Hexagon size={16} />,
      color: "text-indigo-400",
    },
    {
      id: "inference" as MainPillar,
      label: "Génération & Méta-Analyste",
      desc: "Platinum & Inférence",
      icon: <Medal size={16} />,
      color: "text-amber-400",
    },
    {
      id: "orchestration" as MainPillar,
      label: "Orchestration & Inertie",
      desc: "Contributions & Vitesse",
      icon: <Network size={16} />,
      color: "text-cyan-400",
    },
  ];

  if (nexusLoading) {
    return (
      <div className="p-20 text-center animate-pulse text-indigo-500">
        Connexion Oracle...
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in relative">
      {/* Barre de navigation principale Oracle à 3 piliers consolidés */}
      <div className="flex flex-col lg:flex-row justify-between items-center gap-4 relative z-20 bg-nexus-950 py-2 -mx-4 px-4 md:mx-0 md:px-0 md:bg-transparent">
        <div className="w-full lg:w-auto">
          <div className="overflow-x-auto scrollbar-hide pb-1">
            <div className="flex bg-slate-100 dark:bg-slate-900/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner gap-1">
              {pillars.map((tab) => {
                const isActive = pillar === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      audioEngine.play("click");
                      setPillar(tab.id);
                    }}
                    className={`
                      px-4 md:px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2.5 whitespace-nowrap cursor-pointer
                      ${
                        isActive
                          ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-lg border border-slate-200/50 dark:border-slate-700/50"
                          : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      }
                    `}
                  >
                    <span className={isActive ? tab.color : ""}>{tab.icon}</span>
                    <span className="font-extrabold">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Indicateurs Métriques HPC Régime */}
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
            className={`flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border ${
              globalRegime?.regime === "CHAOS"
                ? "bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse"
                : "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
            }`}
          >
            {globalRegime?.regime === "CHAOS" ? (
              <AlertTriangle size={15} />
            ) : (
              <ShieldCheck size={15} />
            )}
            <span className="text-[10px] font-black uppercase tracking-wider">
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
              Bascule détectée vers un régime <strong>CHAOTIQUE</strong> (Exposant de Hurst{" "}
              <code className="text-rose-300 font-mono">
                H = {(globalRegime?.hurst || 0.38).toFixed(3)}
              </code>
              ). Effondrement de l'autocorrélation harmonique. L'Oracle a calibré
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

      {/* Zone de Contenu du Pilier Actif */}
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
          {/* PILIER 1: SYNTHÈSE STRATÉGIQUE */}
          {pillar === "strategic" && (
            <StrategicSynthesisTab drawName={drawName} />
          )}

          {/* PILIER 2: GÉNÉRATION & MÉTA-ANALYSTE (UNIFIÉ) */}
          {pillar === "inference" && (
            <div className="space-y-6">
              {/* Sélecteur de Moteur de Prédiction Compact */}
              <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
                <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800">
                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setInferenceMode("platinum");
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      inferenceMode === "platinum"
                        ? "bg-amber-600 text-white shadow-md shadow-amber-600/20"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Medal size={13} />
                    Platinum Multi-Scénarios
                  </button>

                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setInferenceMode("oracle");
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      inferenceMode === "oracle"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Sparkles size={13} />
                    Oracle Base (Déterministe & XAP)
                  </button>

                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setInferenceMode("ai_cloud");
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      inferenceMode === "ai_cloud"
                        ? "bg-fuchsia-600 text-white shadow-md shadow-fuchsia-600/20"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <BrainCircuit size={13} />
                    Prédiction Cloud IA
                  </button>
                </div>
              </div>

              {inferenceMode === "platinum" && <MetaAnalystTab drawName={drawName} />}
              {inferenceMode === "oracle" && <PredictionTab drawName={drawName} />}
              {inferenceMode === "ai_cloud" && <IAPredictionTab drawName={drawName} />}
            </div>
          )}

          {/* PILIER 3: ORCHESTRATION & INERTIE (UNIFIÉ) */}
          {pillar === "orchestration" && (
            <div className="space-y-6">
              {/* Sélecteur Orchestration vs Inertie */}
              <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
                <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800">
                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setOrchestrationMode("models");
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      orchestrationMode === "models"
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Network size={13} />
                    Orchestration Multi-Modèles
                  </button>

                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setOrchestrationMode("inertia");
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      orchestrationMode === "inertia"
                        ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/20"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Gauge size={13} />
                    Calibrage d'Inertie & Hyperparamètres
                  </button>
                </div>
              </div>

              {orchestrationMode === "models" && <OrchestrationTab drawName={drawName} />}
              {orchestrationMode === "inertia" && <InertiaOptimizerTab drawName={drawName} />}
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
};
