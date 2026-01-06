
import React, { ReactNode, useState, useEffect } from 'react';
import { Home, Settings, FlaskConical, Wallet, Activity, Terminal, LogOut, Mic, MicOff } from 'lucide-react';
import { useIsFetching } from '@tanstack/react-query';
import { MarqueeTicker } from '../ui/MarqueeTicker';
import { CommandPalette } from '../ui/CommandPalette';
import { SonarPing } from '../ui/SonarPing';
import { motion, AnimatePresence } from 'framer-motion';
import { audioEngine } from '../../utils/audioEngine';
import { useVoiceControl } from '../../hooks/useVoiceControl';

export type ViewMode = 'home' | 'admin' | 'lab';

interface AppShellProps {
  children: ReactNode;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  theme: string;
  setTheme: (theme: 'light' | 'dark') => void;
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
  onLogout
}) => {
  const isFetching = useIsFetching();
  const [showPalette, setShowPalette] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  // Intégration V.O.I.C.E
  const { isListening, transcript, toggleListening } = useVoiceControl(
      setViewMode,
      setShowWallet,
      () => { /* Placeholder pour triggerGeneration global si besoin */ }
  );
  
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems: { id: ViewMode; icon: React.ReactNode; label: string }[] = [
      { id: 'home', icon: <Home size={18}/>, label: 'Station' },
      { id: 'lab', icon: <FlaskConical size={18}/>, label: 'Quantum Lab' },
  ];

  if (isAdmin) {
      navItems.push({ id: 'admin', icon: <Settings size={18}/>, label: 'Système' });
  }

  const handleNav = (mode: ViewMode) => {
      audioEngine.play('click');
      setViewMode(mode);
  };

  return (
    <div className="min-h-screen text-slate-200 selection:bg-indigo-500/30 transition-colors duration-500 font-sans flex flex-col relative overflow-x-hidden">
      {/* BACKGROUND FX GLOBAL */}
      <div className="fixed inset-0 pointer-events-none z-[-1] opacity-50">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[160px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[160px]" />
      </div>

      <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-500">
        <MarqueeTicker />
        
        <div className={`mx-2 md:mx-4 mt-2 transition-all duration-500 ${scrolled ? 'scale-[0.98]' : 'scale-100'}`}>
            <div className={`container mx-auto px-4 md:px-6 h-16 md:h-20 rounded-[2rem] md:rounded-[2.5rem] border shadow-2xl transition-all duration-500 flex justify-between items-center safe-top
                ${scrolled 
                  ? 'bg-nexus-950/90 backdrop-blur-2xl border-white/10' 
                  : 'bg-nexus-900/40 backdrop-blur-xl border-white/5'}
            `}>
                {/* Logo Section */}
                <div onClick={onReset} className="flex items-center gap-3 md:gap-4 cursor-pointer group select-none">
                    <div className="w-9 h-9 md:w-11 md:h-11 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl md:rounded-2xl flex items-center justify-center shadow-2xl group-hover:rotate-12 transition-all group-active:scale-90">
                        <span className="text-white font-black text-lg md:text-xl italic">N</span>
                    </div>
                    <div className="hidden lg:block">
                        <h1 className="text-xl font-black tracking-tighter leading-none text-white">NEXUS<span className="text-indigo-500">PRO</span></h1>
                        <div className="flex items-center gap-1.5 mt-1">
                            <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></div>
                            <p className="text-[7px] font-black text-slate-500 uppercase tracking-[0.4em]">PLATINUM ELITE v11.5</p>
                        </div>
                    </div>
                </div>

                {/* V.O.I.C.E FEEDBACK CENTER (Mobile/Desktop) */}
                <AnimatePresence>
                    {isListening && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.3)] pointer-events-none"
                        >
                            <div className="flex gap-1">
                                {[1,2,3].map(i => (
                                    <motion.div 
                                        key={i}
                                        animate={{ height: [8, 16, 8] }}
                                        transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.1 }}
                                        className="w-1 bg-indigo-400 rounded-full"
                                    />
                                ))}
                            </div>
                            <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest min-w-[80px] text-center">
                                {transcript || "Écoute..."}
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex bg-white/5 p-1 rounded-2xl border border-white/5 shadow-inner">
                    {navItems.map(btn => (
                        <button 
                            key={btn.id}
                            onClick={() => handleNav(btn.id)}
                            className={`
                            flex items-center gap-3 px-6 py-2.5 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest
                            ${viewMode === btn.id && !showWallet && !isDrawSelected
                                ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/40 scale-105' 
                                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                            }
                            `}
                        >
                            {btn.icon} <span>{btn.label}</span>
                        </button>
                    ))}
                </nav>

                {/* Actions Group */}
                <div className="flex items-center gap-2 md:gap-3">
                    {/* BOUTON MICRO (V.O.I.C.E) */}
                    <button 
                        onClick={toggleListening}
                        className={`p-3 md:p-3.5 rounded-2xl transition-all border group relative overflow-hidden ${isListening ? 'bg-rose-600 text-white border-rose-500 shadow-rose-900/50' : 'bg-white/5 text-slate-400 hover:text-white border-white/10 hover:bg-white/10'}`}
                    >
                        {isListening ? <Mic size={18} className="animate-pulse" /> : <MicOff size={18} />}
                    </button>

                    <div className="hidden sm:flex flex-col items-end mr-3 px-3 py-1 bg-black/20 rounded-xl border border-white/5 cursor-pointer hover:border-indigo-500/50 transition-all" onClick={() => setShowPalette(true)}>
                        <div className="flex items-center gap-2">
                            <SonarPing />
                            <span className="text-[8px] font-mono text-slate-400 uppercase tracking-tighter">Flux: {isFetching > 0 ? 'Busy' : 'Live'}</span>
                        </div>
                    </div>

                    <button 
                      onClick={() => { audioEngine.play('click'); setShowWallet(!showWallet); }}
                      className={`p-3 md:p-3.5 rounded-2xl transition-all border group relative overflow-hidden
                        ${showWallet 
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-600/30' 
                          : 'bg-white/5 text-slate-400 hover:text-white border-white/10 hover:bg-white/10'}
                      `}
                    >
                        <Wallet size={18} className="relative z-10 md:w-5 md:h-5" />
                        <AnimatePresence>
                          {showWallet && (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute inset-0 bg-white/20 blur-xl rounded-full" />
                          )}
                        </AnimatePresence>
                    </button>
                    
                    <button 
                      onClick={() => { audioEngine.play('click'); setTheme(theme === 'dark' ? 'light' : 'dark'); }} 
                      className="p-3 md:p-3.5 bg-white/5 rounded-2xl text-slate-400 hover:text-white border border-white/10 active:scale-90 transition-all hidden sm:block"
                    >
                        {theme === 'dark' ? <Terminal size={20} /> : <Activity size={20} />}
                    </button>

                    <button 
                      onClick={onLogout}
                      className="p-3 md:p-3.5 bg-rose-500/10 rounded-2xl text-rose-400 hover:bg-rose-500 hover:text-white border border-rose-500/20 active:scale-90 transition-all"
                      title="Déconnexion"
                    >
                        <LogOut size={18} className="md:w-5 md:h-5" />
                    </button>
                </div>
            </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 pt-32 md:pt-44 pb-36 max-w-7xl flex-1 relative z-0">
        <AnimatePresence mode="wait">
            <motion.div
                key={viewMode + (isDrawSelected ? 'draw' : 'list') + (showWallet ? 'wallet' : 'main')}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
            >
                {children}
            </motion.div>
        </AnimatePresence>
      </main>

      {/* MOBILE BOTTOM NAVIGATION - PREMIUM */}
      <nav className="md:hidden fixed bottom-6 left-6 right-6 z-50">
        <div className="glass-morphism bg-nexus-950/90 backdrop-blur-2xl p-2 rounded-[2.5rem] shadow-2xl border border-white/10 flex justify-between items-center">
            {navItems.map(btn => (
                <button 
                    key={btn.id}
                    onClick={() => handleNav(btn.id)}
                    className={`
                      flex-1 flex flex-col items-center justify-center py-3.5 rounded-3xl transition-all relative
                      ${viewMode === btn.id && !showWallet && !isDrawSelected
                          ? 'text-indigo-400' 
                          : 'text-slate-600'
                      }
                    `}
                >
                    {btn.icon}
                    {viewMode === btn.id && !showWallet && !isDrawSelected && (
                      <motion.div layoutId="activeNav" className="absolute inset-x-4 bottom-1.5 h-1 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                    )}
                </button>
            ))}
            <div className="w-px h-8 bg-white/10 mx-2" />
            <button 
                onClick={() => { audioEngine.play('click'); setShowWallet(true); }}
                className={`
                  flex-1 flex flex-col items-center justify-center py-3.5 rounded-3xl transition-all relative
                  ${showWallet ? 'text-indigo-400' : 'text-slate-600'}
                `}
            >
                <Wallet size={18}/>
                {showWallet && (
                  <motion.div layoutId="activeNav" className="absolute inset-x-4 bottom-1.5 h-1 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                )}
            </button>
        </div>
      </nav>

      <CommandPalette 
        isOpen={showPalette} 
        onClose={() => setShowPalette(false)} 
        onNavigate={handleNav}
        onAction={(action) => {
            if (action === 'wallet') { audioEngine.play('click'); setShowWallet(true); }
        }}
      />
    </div>
  );
};
