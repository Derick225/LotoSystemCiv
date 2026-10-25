import React, { useState, useRef, useEffect } from 'react';
import { Database, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, Cpu, X, Zap } from 'lucide-react';
import { useWasmSharedStoreSync, SharedStoreSyncState } from '../../hooks/useWasmSharedStoreSync';
import { audioEngine } from '../../utils/audioEngine';
import { useToast } from './Toast';
import { motion, AnimatePresence } from 'framer-motion';

export const SharedStateBadge: React.FC = () => {
  const {
    syncState,
    drawName,
    drawCount,
    isWasmNative,
    mode,
    estimatedMemoryBytes,
    frequencyCheckSum,
    lastSyncTime,
    syncLatencyMs,
    syncNow,
  } = useWasmSharedStoreSync();

  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { showToast } = useToast();

  // Fermeture automatique au clic en dehors ou Échap
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        isOpen &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const toggleOpen = () => {
    audioEngine.play('click');
    setIsOpen((prev) => !prev);
  };

  const handleManualSync = () => {
    audioEngine.play('click');
    syncNow();
    showToast('Synchronisation zéro-copie forcée avec la mémoire Rust/WASM.', 'success');
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  // Styles visuels selon l'état de synchronisation
  const getBadgeConfig = (state: SharedStoreSyncState) => {
    switch (state) {
      case 'synced':
        return {
          icon: isWasmNative ? CheckCircle2 : Database,
          label: isWasmNative ? 'WASM SYNC' : 'MEM SYNC',
          shortLabel: isWasmNative ? 'WASM' : 'MEM',
          containerClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.15)]',
          dotClass: 'bg-emerald-400',
        };
      case 'syncing':
        return {
          icon: RefreshCw,
          label: 'SYNC...',
          shortLabel: 'SYNC',
          containerClass: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.15)]',
          dotClass: 'bg-cyan-400 animate-spin',
        };
      case 'fallback':
        return {
          icon: Cpu,
          label: 'SIMD SYNC',
          shortLabel: 'SIMD',
          containerClass: 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.15)]',
          dotClass: 'bg-amber-400',
        };
      case 'error':
      default:
        return {
          icon: AlertTriangle,
          label: 'ERR SYNC',
          shortLabel: 'ERR',
          containerClass: 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.15)]',
          dotClass: 'bg-rose-400 animate-pulse',
        };
    }
  };

  const badge = getBadgeConfig(syncState);
  const BadgeIcon = badge.icon;

  return (
    <div className="relative inline-block select-none">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        title="État partagé Zustand ↔ Mémoire native Rust/WASM (Cliquer pour détails)"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border transition-all duration-300 cursor-pointer active:scale-95 ${badge.containerClass}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
        <BadgeIcon size={12} className={syncState === 'syncing' ? 'animate-spin' : ''} />
        <span className="text-[9px] sm:text-[10px] font-black tracking-widest uppercase font-mono">
          <span className="inline sm:hidden">{badge.shortLabel}</span>
          <span className="hidden sm:inline">{badge.label}</span>
        </span>
      </button>

      {/* Popover de diagnostic télémétrique */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={popoverRef}
            role="dialog"
            aria-label="Diagnostic État Partagé Rust WASM"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 sm:left-0 sm:right-auto mt-2 w-72 sm:w-80 bg-slate-950/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl z-50 text-left font-sans text-xs"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <ShieldCheck size={14} />
                </div>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wider text-white">
                    État Partagé (Shared State)
                  </div>
                  <div className="text-[9px] font-mono text-slate-400">
                    Mémoire Linéaire Zéro-Copie
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white rounded-md transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Metrics List */}
            <div className="py-3 space-y-2 font-mono text-[11px]">
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Moteur Actif :</span>
                <span className={`font-bold ${isWasmNative ? 'text-cyan-300' : 'text-amber-300'}`}>
                  {mode === 'RUST_WASM' ? 'Rust WebAssembly (Natif)' : 'SIMD Fallback (C^∞)'}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Tirage Actif :</span>
                <span className="text-white font-bold">{drawName}</span>
              </div>

              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Tirages Indexés :</span>
                <span className="text-emerald-400 font-bold">{drawCount} tirages</span>
              </div>

              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Empreinte Mémoire :</span>
                <span className="text-slate-200">{formatBytes(estimatedMemoryBytes)}</span>
              </div>

              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Latence Injection :</span>
                <span className="text-cyan-300">{syncLatencyMs.toFixed(2)} ms</span>
              </div>

              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Somme Invariance :</span>
                <span className="text-slate-400 font-mono text-[10px]">{frequencyCheckSum} hits</span>
              </div>

              {lastSyncTime && (
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-white/5">
                  <span>Dernier sync :</span>
                  <span>{lastSyncTime.toLocaleTimeString()}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                <Zap size={10} className="text-amber-400" /> 0 Allocation GC
              </span>
              <button
                type="button"
                onClick={handleManualSync}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white font-mono text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all"
              >
                <RefreshCw size={11} className={syncState === 'syncing' ? 'animate-spin' : ''} />
                Resync
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
