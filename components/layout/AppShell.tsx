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
      <header
        className={`fixed top-0 left-0 right-0 z-50 w-full overflow-hidden transition-all duration-700 ${isFocusMode ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100"}`}
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

            {/* Desktop Navigation */}
            <nav className="hidden md:flex bg-white/5 p-1 rounded-2xl border border-white/5 shadow-inner">
              {navItems.map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => {
                    setViewMode(btn.id as ViewMode);
                    setShowWallet(false);
                    audioEngine.play("click");
                  }}
                  className={`flex items-center gap-3 px-6 py-2.5 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest ${viewMode === btn.id && !showWallet ? "bg-indigo-600 text-white shadow-xl" : "text-slate-400 hover:text-slate-300"}`}
                >
                  <btn.icon size={18} /> <span>{btn.label}</span>
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-1 xs:gap-1.5 md:gap-3">
              <InstallButton />
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setFocusMode(true);
                }}
                className={`p-1.5 xs:p-2 md:p-3.5 rounded-lg md:rounded-2xl transition-all border bg-white/5 text-slate-400 hover:text-white border-white/10 flex items-center justify-center`}
                title="Mode Focus"
              >
                <Maximize size={16} />
              </button>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setTheme(theme === "dark" ? "light" : "dark");
                }}
                className={`p-1.5 xs:p-2 md:p-3.5 rounded-lg md:rounded-2xl transition-all border bg-white/5 text-slate-400 hover:text-white border-white/10 flex items-center justify-center`}
              >
                {theme === "dark" ? (
                  <span className="text-xs xs:text-sm">☀️</span>
                ) : (
                  <span className="text-xs xs:text-sm">🌙</span>
                )}
              </button>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setShowWallet(!showWallet);
                }}
                className={`hidden md:flex p-2.5 md:p-3.5 rounded-xl md:rounded-2xl transition-all border ${showWallet ? "bg-indigo-600 border-indigo-500 text-white" : "bg-white/5 text-slate-400 border-white/10"}`}
              >
                <Wallet size={16} />
              </button>
              <button
                onClick={() => {
                  audioEngine.play("click");
                  onLogout();
                }}
                className="p-1.5 xs:p-2 md:p-3.5 bg-rose-500/10 rounded-lg md:rounded-2xl text-rose-400 border border-rose-500/20 active:scale-90 transition-all flex items-center justify-center"
              >
                <LogOut size={14} />
              </button>
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
                className="p-1.5 xs:p-2 md:p-3.5 bg-amber-500/10 rounded-lg md:rounded-2xl text-amber-400 border border-amber-500/20 active:scale-90 transition-all flex items-center justify-center"
                title="Réinitialiser l'Infrastructure"
              >
                <Activity size={14} />
              </button>
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

      {/* Main Content Area - Padding bottom augmented to clear mobile nav */}
      <main
        className={`container mx-auto px-3 md:px-4 max-w-7xl flex-1 relative z-0 w-full overflow-x-hidden transition-all duration-700 ${isFocusMode ? "pt-8 pb-8" : "pt-32 md:pt-44 pb-32 md:pb-40"}`}
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
