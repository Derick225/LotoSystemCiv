import React, { ReactNode, useState, useEffect, lazy, Suspense } from "react";
import {
  Home,
  Settings,
  Wallet,
  Activity,
  LogOut,
  WifiOff,
  Maximize,
  Minimize,
} from "lucide-react";
import { MarqueeTicker } from "../ui/MarqueeTicker";
import { useNexusStore } from "../../store/useNexusStore";
import { motion, AnimatePresence } from "framer-motion";
import { audioEngine } from "../../utils/audioEngine";
import { InstallButton } from "../ui/InstallButton";

const CommandPalette = lazy(() =>
  import("../ui/CommandPalette").then((m) => ({ default: m.CommandPalette })),
);
const QuantumInspector = lazy(() =>
  import("../QuantumInspector").then((m) => ({ default: m.QuantumInspector })),
);

export type ViewMode = "home" | "admin";

interface AppShellProps {
  children: ReactNode;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  theme: string;
  setTheme: (theme: "light" | "dark") => void;
  onReset: () => void;
  showWallet: boolean;
  setShowWallet: (show: boolean) => void;
  isDrawSelected: boolean;
  isAdmin: boolean;
  onLogout: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  viewMode,
  setViewMode,
  theme,
  setTheme,
  onReset,
  showWallet,
  setShowWallet,
  isDrawSelected,
  isAdmin,
  onLogout,
}) => {
  const [showPalette, setShowPalette] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const isFocusMode = useNexusStore((state) => state.isFocusMode);
  const setFocusMode = useNexusStore((state) => state.setFocusMode);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const navItems = [
    { id: "home", icon: Home, label: "Station" },
    ...(isAdmin ? [{ id: "admin", icon: Settings, label: "Admin" }] : []),
  ];

  return (
    <div
      className={`min-h-screen text-slate-200 selection:bg-indigo-500/30 transition-colors duration-500 font-sans flex flex-col relative overflow-x-hidden w-full ${isFocusMode ? "bg-black" : ""}`}
    >
      {/* Sleek Floating Sidebar for Desktop (STATION, ADMIN, WALLET) */}
      <div
        className={`fixed left-4 top-4 bottom-4 w-16 bg-nexus-950/60 backdrop-blur-2xl border border-white/10 rounded-3xl py-6 hidden md:flex flex-col justify-between items-center z-[100] transition-all duration-700 shadow-2xl ${
          isFocusMode ? "-translate-x-full opacity-0 pointer-events-none" : "translate-x-0 opacity-100"
        }`}
      >
        {/* Top brand icon */}
        <div 
          onClick={onReset}
          className="cursor-pointer hover:scale-105 transition-transform"
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center border border-indigo-400/20 shadow-md">
            <span className="text-white text-xs font-black font-mono tracking-tighter">LP</span>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="flex flex-col gap-4">
          {/* Station Button */}
          <button
            onClick={() => {
              setViewMode("home");
              setShowWallet(false);
              audioEngine.play("click");
            }}
            className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 group ${
              viewMode === "home" && !showWallet ? "text-white" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            {viewMode === "home" && !showWallet && (
              <motion.div
                layoutId="sidebar-active-pill"
                className="absolute inset-0 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/30 border border-indigo-500/30 -z-10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Home size={20} className={viewMode === "home" && !showWallet ? "scale-110" : "group-hover:scale-105 transition-transform"} />
            <span className="absolute left-16 bg-slate-950 border border-white/10 text-white text-[10px] uppercase font-black tracking-widest px-2.5 py-1.5 rounded-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0 shadow-2xl whitespace-nowrap z-50">
              Station
            </span>
          </button>

          {/* Admin Button */}
          {isAdmin && (
            <button
              onClick={() => {
                setViewMode("admin");
                setShowWallet(false);
                audioEngine.play("click");
              }}
              className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 group ${
                viewMode === "admin" && !showWallet ? "text-white" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              {viewMode === "admin" && !showWallet && (
                <motion.div
                  layoutId="sidebar-active-pill"
                  className="absolute inset-0 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/30 border border-indigo-500/30 -z-10"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <Settings size={20} className={viewMode === "admin" && !showWallet ? "scale-110" : "group-hover:scale-105 transition-transform"} />
              <span className="absolute left-16 bg-slate-950 border border-white/10 text-white text-[10px] uppercase font-black tracking-widest px-2.5 py-1.5 rounded-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0 shadow-2xl whitespace-nowrap z-50">
                Admin
              </span>
            </button>
          )}

          {/* Wallet Button */}
          <button
            onClick={() => {
              setShowWallet(!showWallet);
              audioEngine.play("click");
            }}
            className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 group ${
              showWallet ? "text-white" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            {showWallet && (
              <motion.div
                layoutId="sidebar-active-pill"
                className="absolute inset-0 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/30 border border-indigo-500/30 -z-10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Wallet size={20} className={showWallet ? "scale-110" : "group-hover:scale-105 transition-transform"} />
            <span className="absolute left-16 bg-slate-950 border border-white/10 text-white text-[10px] uppercase font-black tracking-widest px-2.5 py-1.5 rounded-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0 shadow-2xl whitespace-nowrap z-50">
              Wallet
            </span>
          </button>
        </div>

        {/* Bottom Actions Section */}
        <div className="flex flex-col gap-3">
          {/* Theme Toggle */}
          <button
            onClick={() => {
              audioEngine.play("click");
              setTheme(theme === "dark" ? "light" : "dark");
            }}
            className="relative w-12 h-12 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-300 group"
          >
            {theme === "dark" ? "☀️" : "🌙"}
            <span className="absolute left-16 bg-slate-950 border border-white/10 text-white text-[10px] uppercase font-black tracking-widest px-2.5 py-1.5 rounded-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0 shadow-2xl whitespace-nowrap z-50">
              Thème {theme === "dark" ? "Clair" : "Sombre"}
            </span>
          </button>

          {/* Focus Mode Button */}
          <button
            onClick={() => {
              audioEngine.play("click");
              setFocusMode(true);
            }}
            className="relative w-12 h-12 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-300 group"
          >
            <Maximize size={18} />
            <span className="absolute left-16 bg-slate-950 border border-white/10 text-white text-[10px] uppercase font-black tracking-widest px-2.5 py-1.5 rounded-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0 shadow-2xl whitespace-nowrap z-50">
              Mode Focus
            </span>
          </button>

          {/* Reset Infra Button */}
          <button
            onClick={() => {
              if (
                confirm(
                  "Réinitialiser l'Infrastructure ? Cela videra le cache local et rechargera Nexus.",
                )
              ) {
                useNexusStore.getState().resetInfrastructure();
              }
            }}
            className="relative w-12 h-12 rounded-2xl flex items-center justify-center text-amber-400 bg-amber-500/5 border border-amber-500/20 hover:bg-amber-500/10 transition-all duration-300 group"
          >
            <Activity size={16} />
            <span className="absolute left-16 bg-slate-950 border border-white/10 text-white text-[10px] uppercase font-black tracking-widest px-2.5 py-1.5 rounded-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0 shadow-2xl whitespace-nowrap z-50">
              Reset Infra
            </span>
          </button>

          {/* Logout Button */}
          <button
            onClick={() => {
              audioEngine.play("click");
              onLogout();
            }}
            className="relative w-12 h-12 rounded-2xl flex items-center justify-center text-rose-400 bg-rose-500/5 border border-rose-500/20 hover:bg-rose-500/10 transition-all duration-300 group"
          >
            <LogOut size={16} />
            <span className="absolute left-16 bg-slate-950 border border-white/10 text-white text-[10px] uppercase font-black tracking-widest px-2.5 py-1.5 rounded-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0 shadow-2xl whitespace-nowrap z-50">
              Déconnexion
            </span>
          </button>
        </div>
      </div>

      <header
        className={`fixed top-0 left-0 right-0 z-50 w-full overflow-hidden transition-all duration-700 md:pl-24 ${isFocusMode ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100"}`}
      >
        <MarqueeTicker />
        <div
          className={`mx-2 md:mx-4 mt-2 transition-all duration-500 ${scrolled ? "scale-[0.98]" : "scale-100"}`}
        >
          <div
            className={`container mx-auto px-4 md:px-6 min-h-[4rem] md:min-h-[5rem] py-2 md:py-0 rounded-3xl md:rounded-2xl border shadow-2xl transition-all duration-500 flex justify-between items-center safe-top
                ${scrolled ? "bg-nexus-950/90 backdrop-blur-2xl border-white/10" : "bg-nexus-900/40 backdrop-blur-xl border-white/5"}
            `}
          >
            <div
              onClick={onReset}
              className="flex items-center gap-1.5 md:gap-4 cursor-pointer group select-none shrink-0"
            >
              <img
                src="/logo-full.svg"
                alt="LotoPro Platinum Elite"
                className="h-6 xs:h-8 md:h-11 w-auto drop-shadow-xl group-hover:drop-shadow-2xl transition-all"
              />
              {isOffline && (
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 border border-rose-500/30 rounded-full text-rose-400 ml-2 animate-pulse">
                  <WifiOff size={12} />
                  <span className="text-[10px] font-black tracking-widest">
                    HORS LIGNE
                  </span>
                </div>
              )}
            </div>

            {/* Desktop and Mobile aligned right panel elements */}
            <div className="flex items-center gap-2">
              <InstallButton />
              
              {/* Mobile-only menu items */}
              <div className="flex items-center gap-1.5 md:hidden">
                <button
                  onClick={() => {
                    audioEngine.play("click");
                    setTheme(theme === "dark" ? "light" : "dark");
                  }}
                  className="p-2 bg-white/5 border border-white/10 text-slate-400 rounded-xl flex items-center justify-center h-10 w-10"
                >
                  {theme === "dark" ? "☀️" : "🌙"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Focus Mode Exit Button */}
      <AnimatePresence>
        {isFocusMode && (
          <motion.button
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            onClick={() => {
              audioEngine.play("click");
              setFocusMode(false);
            }}
            className="fixed top-4 right-4 z-[100] p-3 md:p-4 bg-slate-900/80 backdrop-blur-md rounded-full border border-white/20 text-white shadow-2xl hover:bg-white/10 transition-all"
            title="Quitter le Mode Focus"
          >
            <Minimize size={20} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Main Content Area - Padding left on desktop to prevent overlap with floating sidebar */}
      <main
        className={`container mx-auto px-3 md:px-4 md:pl-28 max-w-7xl flex-1 relative z-0 w-full overflow-x-hidden transition-all duration-700 ${isFocusMode ? "pt-8 pb-8" : "pt-32 md:pt-44 pb-32 md:pb-40"}`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode + isDrawSelected + showWallet}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Navigation - PLATINUM BAR (Harmonized) */}
      <div
        className={`fixed left-6 right-6 z-[90] md:hidden transition-all duration-700 ${isFocusMode ? "translate-y-[150%] opacity-0" : "translate-y-0 opacity-100"}`}
        style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        <div className="bg-slate-900/90 backdrop-blur-3xl border border-white/10 rounded-3xl p-2 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] flex items-center relative overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-hide hide-scrollbar w-full">
          {/* Inner Glow */}
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-transparent to-indigo-500/10 pointer-events-none"></div>

          <div className="flex gap-2 w-max px-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setViewMode(item.id as ViewMode);
                  setShowWallet(false);
                  audioEngine.play("click");
                }}
                className={`snap-center flex flex-col items-center gap-1 p-3 px-5 rounded-2xl transition-all relative shrink-0
                            ${viewMode === item.id && !showWallet ? "text-white" : "text-slate-500 hover:text-slate-300"}
                        `}
              >
                {viewMode === item.id && !showWallet && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/30 -z-10"
                  />
                )}
                <item.icon
                  size={22}
                  className={
                    viewMode === item.id && !showWallet ? "scale-110" : ""
                  }
                />
                <span className="text-xs font-black uppercase tracking-widest">
                  {item.label}
                </span>
              </button>
            ))}
            <button
              onClick={() => {
                setShowWallet(!showWallet);
                audioEngine.play("click");
              }}
              className={`snap-center flex flex-col items-center gap-1 p-3 px-5 rounded-2xl transition-all relative shrink-0
                        ${showWallet ? "text-white" : "text-slate-500 hover:text-slate-300"}
                    `}
            >
              {showWallet && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-600/30 -z-10"
                />
              )}
              <Wallet size={22} className={showWallet ? "scale-110" : ""} />
              <span className="text-xs font-black uppercase tracking-widest">
                Wallet
              </span>
            </button>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <QuantumInspector />
        <CommandPalette
          isOpen={showPalette}
          onClose={() => setShowPalette(false)}
          onNavigate={(v) => setViewMode(v as ViewMode)}
          onAction={(a) => a === "wallet" && setShowWallet(true)}
        />
      </Suspense>
    </div>
  );
};
