import React, { useEffect, Suspense, useCallback } from "react";
import { useNexusStore } from "../store/useNexusStore";
import {
  Database,
  Activity,
  Target,
  Share2,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  CloudOff,
  FlaskConical,
  Microscope,
  Clock,
  Navigation,
  Brain,
} from "lucide-react";
import { useToast } from "./ui/Toast";
import { LocalErrorBoundary } from "./ui/LocalErrorBoundary";
import { audioEngine } from "../utils/audioEngine";
import { useSyncStatus } from "../hooks/useSyncStatus";
import { lazyWithRetry } from "../utils/lazyWithRetry";

// Lazy loading sécurisé des modules lourds avec retentatives automatiques
const FluxHub = lazyWithRetry(() => import("./tabs/FluxHub"), "FluxHub");
const SignalHub = lazyWithRetry(() => import("./tabs/SignalHub"), "SignalHub");
const TopologyHub = lazyWithRetry(
  () => import("./tabs/TopologyHub"),
  "TopologyHub",
);
const OracleHub = lazyWithRetry(() => import("./tabs/OracleHub"), "OracleHub");
const SimulationTab = lazyWithRetry(
  () => import("./tabs/SimulationTab"),
  "SimulationTab",
);
const ForensicHub = lazyWithRetry(
  () => import("./tabs/ForensicHub"),
  "ForensicHub",
);

// Preloaders pour chargement prédictif au survol
const tabPreloaders: Record<MainTab, () => Promise<unknown>> = {
  Flux: () => import("./tabs/FluxHub"),
  Signaux: () => import("./tabs/SignalHub"),
  Topologie: () => import("./tabs/TopologyHub"),
  Oracle: () => import("./tabs/OracleHub"),
  Simulation: () => import("./tabs/SimulationTab"),
  Forensic: () => import("./tabs/ForensicHub"),
};

type MainTab =
  | "Flux"
  | "Signaux"
  | "Topologie"
  | "Oracle"
  | "Simulation"
  | "Forensic";

export const DrawDetails: React.FC = () => {
  const drawName = useNexusStore((state) => state.drawName);
  const history = useNexusStore((state) => state.history);
  const loading = useNexusStore((state) => state.loading);
  const refreshData = useNexusStore((state) => state.refreshData);
  const activeMainTab = useNexusStore(
    (state) => state.activeMainTab,
  ) as MainTab;
  const activeSubTab = useNexusStore((state) => state.activeSubTab);
  const navigateToModule = useNexusStore((state) => state.navigateToModule);
  const isForensicOptimized = useNexusStore(
    (state) => state.isForensicOptimized,
  );
  const setForensicOptimized = useNexusStore(
    (state) => state.setForensicOptimized,
  );
  const { showToast } = useToast();

  // Custom Sync Status Hook Usage
  const { isOnline, dbConnection } = useSyncStatus();

  // Système de Navigation Réactif (Sub-Tab Propagation)
  useEffect(() => {
    if (activeMainTab && activeSubTab) {
      // On laisse un tick au React pour monter le composant avant de propager le subTab
      setTimeout(() => {
        // On re-dispatch un événement local que le sous-composant (ex: SignalHub) écoutera
        window.dispatchEvent(
          new CustomEvent(`NAVIGATE_SUB_${activeMainTab.toUpperCase()}`, {
            detail: { subTab: activeSubTab },
          }),
        );
      }, 100);
    }

    // 3. Scroll automatique vers le contenu
    setTimeout(() => {
      const el = document.getElementById("module-container");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, [activeMainTab, activeSubTab]);

  const handleTabChange = useCallback(
    (tabId: MainTab) => {
      audioEngine.play("click");
      navigateToModule(tabId);
    },
    [navigateToModule],
  );

  if (loading && history.length === 0) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-6 animate-pulse">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          <Database
            className="absolute inset-0 m-auto text-indigo-500 animate-pulse"
            size={32}
          />
        </div>
        <p className="text-xs font-black uppercase tracking-[0.4em] text-indigo-400">
          Synchronisation du Registre {drawName}...
        </p>
      </div>
    );
  }

  const allTabs = [
    { id: "Flux", icon: Database, label: "Flux", desc: "Historique & Data" },
    {
      id: "Signaux",
      icon: Activity,
      label: "Signaux",
      desc: "Maths & Fréquences",
    },
    {
      id: "Topologie",
      icon: Share2,
      label: "Topologie",
      desc: "Géométrie & Réseaux",
    },
    { id: "Oracle", icon: Target, label: "Oracle", desc: "Inférence IA" },
    {
      id: "Simulation",
      icon: FlaskConical,
      label: "Backtest",
      desc: "Simulation Historique",
    },
    {
      id: "Forensic",
      icon: Microscope,
      label: "Forensic",
      desc: "Audit Post-Tirage",
    },
  ];

  // Si on est en mode "ALL" (Archives globales), on restreint certaines vues trop spécifiques
  const tabs =
    drawName === "ALL" ? allTabs.filter((t) => t.id === "Flux") : allTabs;

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in pb-20 w-full overflow-x-hidden font-sans">
      {/* Header Contextuel HPC */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 md:gap-6 bg-slate-900/60 p-5 md:p-8 rounded-3xl md:rounded-3xl border border-white/5 backdrop-blur-xl w-full shadow-2xl relative overflow-hidden">
        {/* Background Grid FX */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>

        <div className="space-y-2 md:space-y-3 w-full md:w-auto relative z-10">
          <div className="flex items-center gap-2 md:gap-3">
            <span className="px-2.5 py-0.5 md:px-3 md:py-1 bg-indigo-600 text-white text-[10px] md:text-xs font-black uppercase tracking-widest rounded-full shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 md:gap-2">
              <Navigation size={10} /> Session Active
            </span>
            <span className="text-[10px] md:text-xs font-mono text-slate-500 uppercase">
              {history.length} Séquences
            </span>
          </div>
          <h2 className="text-2xl md:text-6xl font-black text-white uppercase tracking-tighter leading-none truncate max-w-full">
            {drawName === "ALL" ? "ARCHIVES" : drawName}{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 text-lg md:text-3xl">
              v12.0
            </span>
          </h2>
          <div className="flex items-center gap-2 text-[10px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">
            <Clock size={10} className="text-indigo-500" />{" "}
            {new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 md:gap-3 relative z-10 w-full md:w-auto justify-end items-center">
          {/* Bouton de bascule de l'Optimisation Forensic avec indicateur visuel et animation */}
          <button
            onClick={() => {
              setForensicOptimized(!isForensicOptimized);
              try {
                audioEngine.play("success");
              } catch (e) {}
              showToast(
                `Optimisation Forensic ${!isForensicOptimized ? "activée" : "désactivée"} avec succès.`,
                !isForensicOptimized ? "success" : "info",
              );
            }}
            className={`flex items-center gap-2 px-3 md:px-4 py-2 md:py-3.5 border rounded-xl md:rounded-2xl transition-all duration-300 hover:scale-[1.03] active:scale-95 shadow-md relative overflow-hidden group cursor-pointer ${
              isForensicOptimized
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15 shadow-emerald-500/5"
                : "bg-slate-800/80 border-white/5 text-slate-400 hover:text-slate-200 hover:bg-slate-750"
            }`}
            title="Cliquer pour activer/désactiver l'intégration d'autopsies et ajustements passés"
          >
            <Brain
              size={16}
              className={`transition-all duration-500 ${
                isForensicOptimized
                  ? "animate-pulse text-emerald-400 rotate-[360deg] scale-110"
                  : "text-slate-400 group-hover:text-slate-200 group-hover:scale-105"
              }`}
            />

            <div className="text-left leading-none">
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-400 transition-colors">
                Forensic
              </div>
              <div
                className={`text-[11px] font-black uppercase mt-0.5 transition-colors duration-300 ${
                  isForensicOptimized ? "text-emerald-400" : "text-slate-400"
                }`}
              >
                {isForensicOptimized ? "Optimisé" : "Désactivé"}
              </div>
            </div>

            {/* Switcher Indicator avec transition CSS fluide */}
            <div
              className={`w-8 h-4.5 rounded-full transition-colors duration-300 relative flex items-center p-0.5 ml-1 md:ml-2 ${
                isForensicOptimized ? "bg-emerald-500" : "bg-slate-600"
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transform transition-transform duration-300 ease-out ${
                  isForensicOptimized ? "translate-x-3.5" : "translate-x-0"
                }`}
              />
            </div>
          </button>

          <button
            onClick={() => {
              audioEngine.play("click");
              refreshData(drawName, true);
            }}
            className="p-2.5 md:p-4 bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white rounded-xl md:rounded-2xl transition-all active:scale-90 border border-white/5 shadow-lg group"
            title="Forcer la synchronisation"
          >
            <RefreshCw
              size={16}
              className={`group-hover:rotate-180 transition-transform duration-300 ${loading ? "animate-spin" : ""}`}
            />
          </button>
          <div
            className={`border px-3 md:px-6 py-2.5 md:py-4 rounded-xl md:rounded-2xl flex items-center gap-2 md:gap-3 backdrop-blur-md ${
              !isOnline
                ? "bg-red-500/10 border-red-500/20"
                : dbConnection === "connected"
                  ? "bg-emerald-500/10 border-emerald-500/20"
                  : dbConnection === "checking"
                    ? "bg-amber-500/10 border-amber-500/20"
                    : "bg-rose-500/10 border-rose-500/20"
            }`}
          >
            {!isOnline ? (
              <CloudOff size={16} className="text-red-500" />
            ) : dbConnection === "connected" ? (
              <ShieldCheck size={16} className="text-emerald-500" />
            ) : dbConnection === "checking" ? (
              <RefreshCw size={16} className="text-amber-500 animate-spin" />
            ) : (
              <AlertTriangle size={16} className="text-rose-500" />
            )}
            <div className="text-left">
              <div
                className={`text-[10px] md:text-xs font-black uppercase tracking-widest leading-none ${
                  !isOnline
                    ? "text-red-500"
                    : dbConnection === "connected"
                      ? "text-emerald-500"
                      : dbConnection === "checking"
                        ? "text-amber-500"
                        : "text-rose-500"
                }`}
              >
                Status
              </div>
              <div
                className={`text-xs md:text-xs font-black uppercase mt-0.5 ${
                  !isOnline
                    ? "text-red-400"
                    : dbConnection === "connected"
                      ? "text-emerald-400"
                      : dbConnection === "checking"
                        ? "text-amber-400"
                        : "text-rose-400"
                }`}
              >
                {!isOnline
                  ? "Hors Ligne"
                  : dbConnection === "connected"
                    ? "Opérationnel"
                    : dbConnection === "checking"
                      ? "Connexion..."
                      : "Désynchronisé"}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Modulaire - Sticky & Scrollable */}
      <div className="sticky top-[104px] md:top-[120px] z-40 bg-nexus-950/80 backdrop-blur-xl py-2 -mx-3 px-3 md:mx-0 md:px-0">
        <nav className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-[2rem] md:rounded-2xl border border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-hide shadow-inner w-full md:w-fit max-w-full">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id as MainTab)}
              onMouseEnter={() => tabPreloaders[t.id as MainTab]?.()}
              onTouchStart={() => tabPreloaders[t.id as MainTab]?.()}
              className={`
                flex items-center gap-2 md:gap-3 px-4 md:px-6 py-2.5 md:py-3.5 rounded-[1.8rem] md:rounded-[2rem] transition-all whitespace-nowrap flex-shrink-0 relative overflow-hidden
                ${
                  activeMainTab === t.id
                    ? "bg-white dark:bg-slate-700 shadow-lg text-indigo-600 dark:text-white scale-105 z-10 font-bold"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-medium"
                }
              `}
            >
              <t.icon
                size={14}
                className={`relative z-10 ${activeMainTab === t.id ? "animate-bounce-subtle" : ""}`}
              />
              <span className="text-xs md:text-xs uppercase tracking-widest leading-none relative z-10">
                {t.label}
              </span>
              {activeMainTab === t.id && (
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 pointer-events-none"></div>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Zone de Contenu Dynamique avec Error Boundary Isolé */}
      <div
        id="module-container"
        className="min-h-[600px] relative w-full overflow-x-hidden pt-4 scroll-mt-[180px] md:scroll-mt-[200px]"
      >
        <LocalErrorBoundary key={activeMainTab}>
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center py-32 gap-6 animate-pulse bg-slate-900/20 rounded-3xl border border-dashed border-slate-800">
                <RefreshCw className="animate-spin text-indigo-500" size={32} />
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">
                  Initialisation du module {activeMainTab}...
                </p>
              </div>
            }
          >
            {activeMainTab === "Flux" && <FluxHub history={history} />}
            {activeMainTab === "Signaux" && <SignalHub />}
            {activeMainTab === "Topologie" && (
              <TopologyHub drawName={drawName} />
            )}
            {activeMainTab === "Oracle" && <OracleHub drawName={drawName} />}
            {activeMainTab === "Simulation" && (
              <SimulationTab drawName={drawName} />
            )}
            {activeMainTab === "Forensic" && (
              <ForensicHub drawName={drawName} />
            )}
          </Suspense>
        </LocalErrorBoundary>
      </div>
    </div>
  );
};
