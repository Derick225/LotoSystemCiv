import React, { useState } from "react";
import {
  Home,
  Brain,
  GitBranch,
  Microscope,
  Settings,
  Zap,
  Sliders,
  ChevronUp,
  RotateCcw,
  RefreshCw,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNexusStore } from "../../store/useNexusStore";
import { audioEngine } from "../../utils/audioEngine";
import { ALL_DRAWS } from "../../constants";
import { getNextScheduledDraw } from "../../services/lotteryService";
import type { ViewMode } from "./AppShell";

interface MobileBottomNavProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  isDrawSelected: boolean;
  isAdmin: boolean;
  onReset: () => void;
  onOpenPalette?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  viewMode,
  setViewMode,
  isDrawSelected,
  isAdmin,
  onReset,
  onOpenPalette,
}) => {
  const isFocusMode = useNexusStore((state) => state.isFocusMode);
  const activeMainTab = useNexusStore((state) => state.activeMainTab);
  const activeSubTab = useNexusStore((state) => state.activeSubTab);
  const drawName = useNexusStore((state) => state.drawName);
  const refreshData = useNexusStore((state) => state.refreshData);
  const loading = useNexusStore((state) => state.loading);

  const [showQuickSheet, setShowQuickSheet] = useState(false);

  // Détermination de l'item actif
  const getActiveKey = () => {
    if (viewMode === "admin") return "admin";
    if (!isDrawSelected) return "home";
    if (activeMainTab === "Oracle") return "oracle";
    if (activeMainTab === "Topologie" && activeSubTab === "decision_forest") return "forest";
    if (activeMainTab === "Forensic") return "forensic";
    return "session";
  };

  const activeKey = getActiveKey();

  const handleNavigateToHub = (hub: "home" | "oracle" | "forest" | "forensic" | "admin") => {
    audioEngine.play("click");

    if (hub === "home") {
      onReset();
      setViewMode("home");
      return;
    }

    if (hub === "admin") {
      setViewMode("admin");
      return;
    }

    // Navigation vers les modules scientifiques
    let targetDraw = drawName;
    if (!targetDraw || targetDraw === "ALL") {
      const next = getNextScheduledDraw();
      targetDraw = next?.name || ALL_DRAWS[0]?.name || "Fortune";
    }

    let mainTab = "Oracle";
    let subTab: string | undefined = undefined;

    if (hub === "oracle") {
      mainTab = "Oracle";
      subTab = "stacking";
    } else if (hub === "forest") {
      mainTab = "Topologie";
      subTab = "decision_forest";
    } else if (hub === "forensic") {
      mainTab = "Forensic";
      subTab = "autopsy";
    }

    window.dispatchEvent(
      new CustomEvent("CROSS_MODULE_NAVIGATE", {
        detail: {
          view: "home",
          drawName: targetDraw,
          mainTab,
          subTab,
        },
      }),
    );
  };

  if (isFocusMode) return null;

  return (
    <>
      {/* TIROIR RAPIDE D'ACTION MOBILE (Bottom Sheet) */}
      <AnimatePresence>
        {showQuickSheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-sm flex flex-col justify-end md:hidden"
            onClick={() => setShowQuickSheet(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 280 }}
              className="bg-slate-900 border-t border-white/10 rounded-t-3xl p-5 pb-8 shadow-2xl flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders size={16} className="text-indigo-400" />
                  <span className="text-xs font-black uppercase tracking-widest text-white">
                    Actions Rapides Mobile
                  </span>
                </div>
                <button
                  onClick={() => setShowQuickSheet(false)}
                  className="p-1 rounded-full bg-white/5 text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Raccourcis de tirage */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Tirage Actif ({drawName || "Non sélectionné"})
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_DRAWS.slice(0, 4).map((d) => (
                    <button
                      key={d.name}
                      onClick={() => {
                        audioEngine.play("click");
                        setShowQuickSheet(false);
                        window.dispatchEvent(
                          new CustomEvent("CROSS_MODULE_NAVIGATE", {
                            detail: { view: "home", drawName: d.name },
                          }),
                        );
                      }}
                      className={`p-2.5 rounded-xl text-[11px] font-bold text-left transition-all border ${
                        drawName === d.name
                          ? "bg-indigo-600/20 border-indigo-500 text-white"
                          : "bg-white/5 border-white/5 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Raccourcis Utilitaires */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                <button
                  onClick={() => {
                    audioEngine.play("click");
                    if (drawName) refreshData(drawName, true);
                    setShowQuickSheet(false);
                  }}
                  disabled={loading}
                  className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-black uppercase tracking-wider text-slate-300 flex items-center justify-center gap-2"
                >
                  <RefreshCw size={14} className={loading ? "animate-spin text-indigo-400" : "text-indigo-400"} />
                  <span>Sync Cloud</span>
                </button>

                <button
                  onClick={() => {
                    audioEngine.play("click");
                    setShowQuickSheet(false);
                    onOpenPalette?.();
                  }}
                  className="p-3 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-xl text-xs font-black uppercase tracking-wider text-indigo-300 flex items-center justify-center gap-2"
                >
                  <Zap size={14} className="text-indigo-400" />
                  <span>Commande ⌘K</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BARRE PRINCIPALE FLOTTANTE ANDROID (Bottom Navigation Bar) */}
      <nav
        aria-label="Navigation mobile"
        className="fixed left-3 right-3 z-[90] md:hidden transition-transform duration-300 touch-manipulation"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="bg-slate-950/90 backdrop-blur-2xl border border-white/15 rounded-[1.75rem] px-2 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex items-center justify-around relative select-none">
          {/* Lueur d'ambiance continue */}
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 rounded-[1.75rem] pointer-events-none" />

          {/* Onglet 1 : Station / Accueil */}
          <button
            type="button"
            onClick={() => handleNavigateToHub("home")}
            className={`relative flex flex-col items-center justify-center py-1.5 px-3 min-w-[56px] min-h-[48px] rounded-2xl transition-all duration-200 active:scale-90 ${
              activeKey === "home" ? "text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {activeKey === "home" && (
              <motion.div
                layoutId="mobile-nav-pill"
                className="absolute inset-0 bg-indigo-600/30 border border-indigo-500/40 rounded-2xl -z-10 shadow-sm"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <Home size={18} className={activeKey === "home" ? "text-indigo-400 scale-110" : ""} />
            <span className="text-[10px] font-black uppercase tracking-wider mt-0.5 leading-none">
              Station
            </span>
          </button>

          {/* Onglet 2 : Oracle / Inférence */}
          <button
            type="button"
            onClick={() => handleNavigateToHub("oracle")}
            className={`relative flex flex-col items-center justify-center py-1.5 px-3 min-w-[56px] min-h-[48px] rounded-2xl transition-all duration-200 active:scale-90 ${
              activeKey === "oracle" ? "text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {activeKey === "oracle" && (
              <motion.div
                layoutId="mobile-nav-pill"
                className="absolute inset-0 bg-indigo-600/30 border border-indigo-500/40 rounded-2xl -z-10 shadow-sm"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <Brain size={18} className={activeKey === "oracle" ? "text-purple-400 scale-110" : ""} />
            <span className="text-[10px] font-black uppercase tracking-wider mt-0.5 leading-none">
              Oracle
            </span>
          </button>

          {/* Onglet 3 : Forêt de Décision */}
          <button
            type="button"
            onClick={() => handleNavigateToHub("forest")}
            className={`relative flex flex-col items-center justify-center py-1.5 px-3 min-w-[56px] min-h-[48px] rounded-2xl transition-all duration-200 active:scale-90 ${
              activeKey === "forest" ? "text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {activeKey === "forest" && (
              <motion.div
                layoutId="mobile-nav-pill"
                className="absolute inset-0 bg-indigo-600/30 border border-indigo-500/40 rounded-2xl -z-10 shadow-sm"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <GitBranch size={18} className={activeKey === "forest" ? "text-emerald-400 scale-110" : ""} />
            <span className="text-[10px] font-black uppercase tracking-wider mt-0.5 leading-none">
              Forêt
            </span>
          </button>

          {/* Onglet 4 : Forensic / Autopsie */}
          <button
            type="button"
            onClick={() => handleNavigateToHub("forensic")}
            className={`relative flex flex-col items-center justify-center py-1.5 px-3 min-w-[56px] min-h-[48px] rounded-2xl transition-all duration-200 active:scale-90 ${
              activeKey === "forensic" ? "text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {activeKey === "forensic" && (
              <motion.div
                layoutId="mobile-nav-pill"
                className="absolute inset-0 bg-indigo-600/30 border border-indigo-500/40 rounded-2xl -z-10 shadow-sm"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <Microscope size={18} className={activeKey === "forensic" ? "text-rose-400 scale-110" : ""} />
            <span className="text-[10px] font-black uppercase tracking-wider mt-0.5 leading-none">
              Forensic
            </span>
          </button>

          {/* Onglet 5 : Action Rapide / Menu */}
          <button
            type="button"
            onClick={() => {
              audioEngine.play("click");
              setShowQuickSheet((prev) => !prev);
            }}
            className={`relative flex flex-col items-center justify-center py-1.5 px-3 min-w-[56px] min-h-[48px] rounded-2xl transition-all duration-200 active:scale-90 ${
              showQuickSheet ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ChevronUp
              size={18}
              className={`transition-transform duration-200 ${showQuickSheet ? "rotate-180 text-indigo-400" : ""}`}
            />
            <span className="text-[10px] font-black uppercase tracking-wider mt-0.5 leading-none">
              Menu
            </span>
          </button>
        </div>
      </nav>
    </>
  );
};
