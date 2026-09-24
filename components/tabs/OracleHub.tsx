import React, { useState, useMemo, Suspense, lazy, useEffect } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import {
  Sparkles,
  Medal,
  BrainCircuit,
  Network,
  AlertTriangle,
  Hexagon,
  Gauge,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";
import {
  computeContinuousTemperature,
  measureDrawFrequencies,
} from "../../services/geminiService";

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
  const history = useNexusStore((state) => state.history);

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

  // Écarts de fréquence réellement mesurés sur l'historique complet (aucune valeur de repli inventée).
  const frequency = useMemo(() => measureDrawFrequencies(history), [history]);

  // Diagnostic de régime continu : z = (H - 0.5) / (1/√N), sévérité = CDF de Rayleigh du |z|.
  const regimeDiagnostic = useMemo(() => {
    const samples = history.length;
    const hurst = globalRegime?.hurst;
    const hasHurst = typeof hurst === "number" && Number.isFinite(hurst);
    const regimeLabel = globalRegime?.regime ?? "non mesuré";

    if (!hasHurst || samples < 2) {
      return {
        available: false as const,
        hue: 152,
        severity: 0,
        regimeLabel,
        hurstLabel: "n/d",
        deviationLabel: "n/d",
        uncertaintyLabel: "n/d",
        temperatureLabel: "n/d",
        entropyLabel:
          typeof globalRegime?.entropy === "number" &&
          Number.isFinite(globalRegime.entropy)
            ? globalRegime.entropy.toFixed(3)
            : "n/d",
      };
    }

    // Marge d'incertitude de l'estimateur de Hurst, identique à celle du moteur (1/√N).
    const sigma = 1 / Math.sqrt(samples);
    const z = (hurst - 0.5) / sigma;
    // Sévérité continue : aucun seuil binaire, la mesure elle-même pilote l'intensité visuelle.
    const severity = 1 - Math.exp(-(z * z) / 2);
    const temperature = computeContinuousTemperature(hurst, samples);
    const entropy = globalRegime?.entropy;

    return {
      available: true as const,
      hue: Math.round(152 * (1 - severity)),
      severity,
      regimeLabel,
      hurstLabel: hurst.toFixed(4),
      deviationLabel: `${z >= 0 ? "+" : ""}${z.toFixed(2)} σ`,
      uncertaintyLabel: `σ = ${sigma.toFixed(4)} (1/√${samples})`,
      temperatureLabel: temperature === null ? "n/d" : temperature.toFixed(4),
      entropyLabel:
        typeof entropy === "number" && Number.isFinite(entropy)
          ? entropy.toFixed(3)
          : "n/d",
    };
  }, [globalRegime?.hurst, globalRegime?.entropy, globalRegime?.regime, history.length]);

  const regimeColor = `hsl(${regimeDiagnostic.hue}, 84%, 62%)`;
  const regimeSurface = `hsla(${regimeDiagnostic.hue}, 84%, 55%, 0.12)`;
  const regimeBorder = `hsla(${regimeDiagnostic.hue}, 84%, 55%, 0.35)`;

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

  // Le squelette n'est affiché qu'au premier chargement : une revalidation en arrière-plan
  // (changement de tirage, refresh périodique) ne doit pas démonter les sous-onglets actifs,
  // ce qui détruirait leur état local et relancerait leurs calculs pour rien.
  if (nexusLoading && history.length === 0) {
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
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-slate-500/10 border-slate-500/30 font-mono text-xs"
            title={
              frequency
                ? `Écart normalisé maximal sur ${frequency.domainMax} numéros candidats, mesuré sur ${frequency.draws} tirages · p famille = ${frequency.familyWiseP.toFixed(4)}`
                : "Historique insuffisant pour mesurer un écart"
            }
          >
            <span className="text-[10px] font-bold text-slate-400">
              Écart max :
            </span>
            <span className="font-extrabold text-slate-200">
              {frequency ? `${frequency.maxAbsZ.toFixed(2)} σ` : "n/d"}
            </span>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-400 font-mono text-xs"
            title="Exposant de Hurst du régime actif (H = 0.5 pour une marche aléatoire)"
          >
            <span className="text-[10px] font-bold text-slate-400">
              Hurst H:
            </span>
            <span className="font-extrabold text-amber-400">
              {regimeDiagnostic.hurstLabel}
            </span>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-sky-500/10 border-sky-500/30 text-sky-300 font-mono text-xs"
            title="Entropie spectrale normalisée du régime actif"
          >
            <span className="text-[10px] font-bold text-slate-400">
              Entropie:
            </span>
            <span className="font-extrabold text-sky-300">
              {regimeDiagnostic.entropyLabel}
            </span>
          </div>
          <div
            className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border transition-colors duration-500"
            style={{
              backgroundColor: regimeSurface,
              borderColor: regimeBorder,
              color: regimeColor,
            }}
            title={
              regimeDiagnostic.available
                ? `Déviation de régime : ${regimeDiagnostic.deviationLabel} (${regimeDiagnostic.uncertaintyLabel})`
                : "Exposant de Hurst indisponible : aucun régime classé"
            }
          >
            <Gauge size={15} />
            <span className="text-[10px] font-black uppercase tracking-wider">
              Régime {regimeDiagnostic.regimeLabel}
            </span>
            <span className="text-[10px] font-mono font-bold opacity-80">
              {regimeDiagnostic.deviationLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Diagnostic de Régime Continu (Concept Drift) — intensité = mesure, aucun seuil binaire */}
      <div
        className="p-4 rounded-2xl border shadow-lg flex items-start gap-4 transition-colors duration-500"
        style={{
          backgroundColor: regimeSurface,
          borderColor: regimeBorder,
          backgroundImage: `linear-gradient(to right, hsla(${regimeDiagnostic.hue}, 84%, 30%, 0.55), transparent)`,
        }}
      >
        <div
          className="p-2.5 rounded-xl shrink-0 mt-0.5"
          style={{ backgroundColor: regimeSurface, color: regimeColor }}
        >
          {regimeDiagnostic.available ? (
            <Gauge size={22} />
          ) : (
            <AlertTriangle size={22} />
          )}
        </div>
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-xs font-black uppercase tracking-wider"
              style={{ color: regimeColor }}
            >
              Diagnostic de Régime (Concept Drift)
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-white text-[9px] font-bold font-mono"
              style={{ backgroundColor: regimeColor }}
            >
              {regimeDiagnostic.available
                ? `SÉVÉRITÉ ${Math.round(regimeDiagnostic.severity * 100)}%`
                : "INDISPONIBLE"}
            </span>
          </div>
          {regimeDiagnostic.available ? (
            <p className="text-xs text-slate-200/90 leading-relaxed font-sans">
              Régime classé{" "}
              <strong style={{ color: regimeColor }}>
                {regimeDiagnostic.regimeLabel}
              </strong>{" "}
              · exposant de Hurst{" "}
              <code className="font-mono">H = {regimeDiagnostic.hurstLabel}</code>{" "}
              pour une marge d'incertitude{" "}
              <code className="font-mono">
                {regimeDiagnostic.uncertaintyLabel}
              </code>
              , soit une déviation de{" "}
              <code className="font-mono">
                {regimeDiagnostic.deviationLabel}
              </code>{" "}
              par rapport à la marche aléatoire (H = 0.5000). Température de
              génération recalibrée à{" "}
              <code className="font-mono">
                T = {regimeDiagnostic.temperatureLabel}
              </code>{" "}
              par la même fonction logistique que le moteur d'inférence. Aucun
              seuil binaire n'est appliqué : l'intensité affichée est la mesure
              elle-même.
            </p>
          ) : (
            <p className="text-xs text-slate-200/90 leading-relaxed font-sans">
              Exposant de Hurst indisponible pour ce tirage : le moteur n'a pas
              encore produit de régime sur un historique suffisant. Aucune
              valeur de repli n'est affichée et aucune alerte n'est simulée —
              lancez une analyse pour alimenter la mesure.
            </p>
          )}
        </div>
      </div>

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
