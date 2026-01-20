
import React, { ReactNode, useState, useEffect } from 'react';
import { Home, Settings, FlaskConical, Wallet, Activity, Terminal, LogOut, Mic, MicOff, Share2, RefreshCw, LayoutGrid } from 'lucide-react';
import { useIsFetching } from '@tanstack/react-query';
import { MarqueeTicker } from '../ui/MarqueeTicker';
import { CommandPalette } from '../ui/CommandPalette';
import { SonarPing } from '../ui/SonarPing';
import { motion, AnimatePresence } from 'framer-motion';
import { audioEngine } from '../../utils/audioEngine';
import { useVoiceControl } from '../../hooks/useVoiceControl';
import { useNexus } from '../NexusProvider';
import { QuantumInspector } from '../QuantumInspector';

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
  
  const { isListening, transcript, toggleListening } = useVoiceControl(setViewMode, setShowWallet);
  
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { id: 'home', icon: Home, label: 'Station' },
    { id: 'lab', icon: FlaskConical, label: 'Lab' },
    ...(isAdmin ? [{ id: 'admin', icon: Settings, label: 'Admin' }] : []),
  ];

  return (
    <div className="min-h-screen text-slate-200 selection:bg-indigo-500/30 transition-colors duration-500 font-sans flex flex-col relative overflow-x-hidden w-full">
      <header className="fixed top-0 left-0 right-0 z-50 w-full overflow-hidden">
        <MarqueeTicker />
        <div className={`mx-2 md:mx-4 mt-2 transition-all duration-500 ${scrolled ? 'scale-[0.98]' : 'scale-100'}`}>
            <div className={`container mx-auto px-4 md:px-6 h-16 md:h-20 rounded-3xl md:rounded-[2.5rem] border shadow-2xl transition-all duration-500 flex justify-between items-center safe-top
                ${scrolled ? 'bg-nexus-950/90 backdrop-blur-2xl border-white/10' : 'bg-nexus-900/40 backdrop-blur-xl border-white/5'}
            `}>
                <div onClick={onReset} className="flex items-center gap-2 md:gap-4 cursor-pointer group select-none">
                    <div className="w-9 h-9 md:w-11 md:h-11 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl md:rounded-2xl flex items-center justify-center shadow-2xl group-hover:rotate-12 transition-all">
                        <span className="text-white font-black text-base md:text-xl italic">N</span>
                    </div>
                    <div className="hidden sm:block">
                        <h1 className="text-base md:text-xl font-black tracking-tighter leading-none text-white">NEXUS<span className="text-indigo-500">PRO</span></h1>
                        <p className="text-[6px] md:text-[7px] font-black text-slate-500 uppercase tracking-[0.4em] mt-0.5 md:mt-1">PLATINUM v11.5</p>
                    </div>
                </div>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex bg-white/5 p-1 rounded-2xl border border-white/5 shadow-inner">
                    {navItems.map(btn => (
                        <button 
                            key={btn.id}
                            onClick={() => { setViewMode(btn.id as ViewMode); setShowWallet(false); audioEngine.play('click'); }}
                            className={`flex items-center gap-3 px-6 py-2.5 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest ${viewMode === btn.id && !showWallet ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:text-slate-300'}`}
                        >
                            <btn.icon size={18}/> <span>{btn.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="flex items-center gap-1.5 md:gap-3">
                    <button onClick={toggleListening} className={`p-2.5 md:p-3.5 rounded-xl md:rounded-2xl transition-all border ${isListening ? 'bg-rose-600 text-white border-rose-500 shadow-rose-900/50' : 'bg-white/5 text-slate-400 hover:text-white border-white/10'}`}>
                        {isListening ? <Mic size={16} className="animate-pulse" /> : <MicOff size={16} />}
                    </button>
                    <button onClick={() => { audioEngine.play('click'); setShowWallet(!showWallet); }} className={`hidden md:flex p-2.5 md:p-3.5 rounded-xl md:rounded-2xl transition-all border ${showWallet ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/5 text-slate-400 border-white/10'}`}>
                        <Wallet size={16} />
                    </button>
                    <button onClick={onLogout} className="p-2.5 md:p-3.5 bg-rose-500/10 rounded-xl md:rounded-2xl text-rose-400 border border-rose-500/20 active:scale-90 transition-all"><LogOut size={16} /></button>
                </div>
            </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="container mx-auto px-2 md:px-4 pt-28 md:pt-44 pb-40 max-w-7xl flex-1 relative z-0 w-full overflow-x-hidden">
        <AnimatePresence mode="wait">
            <motion.div key={viewMode + isDrawSelected + showWallet} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                {children}
            </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Navigation - PLATINUM BAR */}
      <div className="fixed bottom-4 left-4 right-4 z-[90] md:hidden">
        <div className="bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-2 shadow-2xl flex justify-around items-center">
            {navItems.map(item => (
                <button
                    key={item.id}
                    onClick={() => { setViewMode(item.id as ViewMode); setShowWallet(false); audioEngine.play('click'); }}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-[1.8rem] transition-all min-w-[70px]
                        ${viewMode === item.id && !showWallet ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500'}
                    `}
                >
                    <item.icon size={20} className={viewMode === item.id && !showWallet ? 'scale-110' : ''} />
                    <span className="text-[8px] font-black uppercase tracking-widest">{item.label}</span>
                </button>
            ))}
            <button
                onClick={() => { setShowWallet(!showWallet); audioEngine.play('click'); }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-[1.8rem] transition-all min-w-[70px]
                    ${showWallet ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500'}
                `}
            >
                <Wallet size={20} className={showWallet ? 'scale-110' : ''} />
                <span className="text-[8px] font-black uppercase tracking-widest">Wallet</span>
            </button>
        </div>
      </div>

      <QuantumInspector />
      <CommandPalette isOpen={showPalette} onClose={() => setShowPalette(false)} onNavigate={setViewMode} onAction={(a) => a === 'wallet' && setShowWallet(true)} />
    </div>
  );
};
