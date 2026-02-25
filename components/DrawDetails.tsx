
import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import { useNexus } from './NexusProvider';
import { 
  Database, Activity, Target, Share2, 
  ShieldCheck, RefreshCw, 
  FlaskConical, Microscope, Clock, Navigation
} from 'lucide-react';
import { LocalErrorBoundary } from './ui/LocalErrorBoundary';
import { audioEngine } from '../utils/audioEngine';

// Lazy loading sécurisé des modules lourds
const FluxHub = lazy(() => import('./tabs/FluxHub').then(m => ({ default: m.FluxHub })));
const SignalHub = lazy(() => import('./tabs/SignalHub').then(m => ({ default: m.SignalHub })));
const TopologyHub = lazy(() => import('./tabs/TopologyHub').then(m => ({ default: m.TopologyHub })));
const OracleHub = lazy(() => import('./tabs/OracleHub').then(m => ({ default: m.OracleHub })));
const SimulationTab = lazy(() => import('./tabs/SimulationTab').then(m => ({ default: m.SimulationTab })));
const ForensicHub = lazy(() => import('./tabs/ForensicHub').then(m => ({ default: m.ForensicHub })));

type MainTab = 'Flux' | 'Signaux' | 'Topologie' | 'Oracle' | 'Simulation' | 'Forensic';

export const DrawDetails: React.FC = () => {
  const { drawName, history, loading, refreshData } = useNexus();
  const [activeTab, setActiveTab] = useState<MainTab>('Flux');

  // Système de Navigation par Bus d'Événements (Neural Event Bus)
  useEffect(() => {
      const handleNav = (e: CustomEvent) => {
          if (e.detail?.mainTab) {
              const targetTab = e.detail.mainTab as MainTab;
              
              // 1. Changement d'onglet principal
              setActiveTab(targetTab);
              audioEngine.play('click');

              // 2. Gestion du sous-onglet (Propagation)
              // On laisse un tick au React pour monter le composant avant de propager le subTab
              if (e.detail.subTab) {
                  setTimeout(() => {
                      // On re-dispatch un événement local que le sous-composant (ex: SignalHub) écoutera
                      // Le sous-composant doit être monté pour écouter
                      window.dispatchEvent(new CustomEvent(`NAVIGATE_SUB_${targetTab.toUpperCase()}`, { 
                          detail: { subTab: e.detail.subTab } 
                      }));
                  }, 100);
              }

              // 3. Scroll automatique vers le contenu
              setTimeout(() => {
                  const el = document.getElementById('module-container');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 50);
          }
      };

      window.addEventListener('NAVIGATE_TO_MODULE', handleNav as EventListener);
      return () => window.removeEventListener('NAVIGATE_TO_MODULE', handleNav as EventListener);
  }, []);

  const handleTabChange = useCallback((tabId: MainTab) => {
      audioEngine.play('click');
      setActiveTab(tabId);
  }, []);

  if (loading && history.length === 0) {
      return (
          <div className="h-[60vh] flex flex-col items-center justify-center gap-6 animate-pulse">
              <div className="relative">
                  <div className="w-24 h-24 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                  <Database className="absolute inset-0 m-auto text-indigo-500 animate-pulse" size={32} />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.4em] text-indigo-400">Synchronisation du Registre {drawName}...</p>
          </div>
      );
  }

  const allTabs = [
    { id: 'Flux', icon: Database, label: 'Flux', desc: 'Historique & Data' },
    { id: 'Signaux', icon: Activity, label: 'Signaux', desc: 'Maths & Fréquences' },
    { id: 'Topologie', icon: Share2, label: 'Topologie', desc: 'Géométrie & Réseaux' },
    { id: 'Oracle', icon: Target, label: 'Oracle', desc: 'Inférence IA' },
    { id: 'Simulation', icon: FlaskConical, label: 'Simulation', desc: 'Backtesting' },
    { id: 'Forensic', icon: Microscope, label: 'Forensic', desc: 'Audit Post-Tirage' },
  ];

  // Si on est en mode "ALL" (Archives globales), on restreint certaines vues trop spécifiques
  const tabs = drawName === 'ALL' 
    ? allTabs.filter(t => t.id === 'Flux') 
    : allTabs;

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in pb-20 w-full overflow-x-hidden font-sans">
      
      {/* Header Contextuel HPC */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 md:gap-6 bg-slate-900/60 p-5 md:p-8 rounded-3xl md:rounded-[3.5rem] border border-white/5 backdrop-blur-xl w-full shadow-2xl relative overflow-hidden">
        {/* Background Grid FX */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>

        <div className="space-y-2 md:space-y-3 w-full md:w-auto relative z-10">
            <div className="flex items-center gap-2 md:gap-3">
                <span className="px-2.5 py-0.5 md:px-3 md:py-1 bg-indigo-600 text-white text-[8px] md:text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 md:gap-2">
                    <Navigation size={10} /> Session Active
                </span>
                <span className="text-[8px] md:text-[9px] font-mono text-slate-500 uppercase">{history.length} Séquences</span>
            </div>
            <h2 className="text-2xl md:text-6xl font-black text-white uppercase tracking-tighter leading-none truncate max-w-full">
              {drawName === 'ALL' ? 'ARCHIVES' : drawName} <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 text-lg md:text-3xl">v12.0</span>
            </h2>
            <div className="flex items-center gap-2 text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <Clock size={10} className="text-indigo-500"/> {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </div>
        </div>

        <div className="flex gap-2 md:gap-3 relative z-10 w-full md:w-auto justify-end">
            <button 
                onClick={() => refreshData(drawName, true)} 
                className="p-2.5 md:p-4 bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white rounded-xl md:rounded-2xl transition-all active:scale-90 border border-white/5 shadow-lg group"
                title="Forcer la synchronisation"
            >
                <RefreshCw size={16} className={`group-hover:rotate-180 transition-transform duration-700 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 md:px-6 py-2.5 md:py-4 rounded-xl md:rounded-2xl flex items-center gap-2 md:gap-3 backdrop-blur-md">
                <ShieldCheck size={16} className="text-emerald-500" />
                <div className="text-left">
                    <div className="text-[7px] md:text-[9px] font-black text-emerald-500 uppercase tracking-widest leading-none">Status</div>
                    <div className="text-[9px] md:text-xs font-black text-emerald-400 uppercase mt-0.5">Opérationnel</div>
                </div>
            </div>
        </div>
      </header>

      {/* Navigation Modulaire - Sticky & Scrollable */}
      <div className="sticky top-[104px] md:top-[120px] z-40 bg-nexus-950/80 backdrop-blur-xl py-2 -mx-3 px-3 md:mx-0 md:px-0">
        <nav className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-[2rem] md:rounded-[2.5rem] border border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-hide shadow-inner w-full md:w-fit max-w-full">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id as MainTab)}
              className={`
                flex items-center gap-2 md:gap-3 px-4 md:px-6 py-2.5 md:py-3.5 rounded-[1.8rem] md:rounded-[2rem] transition-all whitespace-nowrap flex-shrink-0 relative overflow-hidden
                ${activeTab === t.id 
                  ? 'bg-white dark:bg-slate-700 shadow-lg text-indigo-600 dark:text-white scale-105 z-10 font-bold' 
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-medium'}
              `}
            >
              <t.icon size={14} className={`relative z-10 ${activeTab === t.id ? 'animate-bounce-subtle' : ''}`} />
              <span className="text-[9px] md:text-xs uppercase tracking-widest leading-none relative z-10">{t.label}</span>
              {activeTab === t.id && (
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 pointer-events-none"></div>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Zone de Contenu Dynamique avec Error Boundary Isolé */}
      <div id="module-container" className="min-h-[600px] relative w-full overflow-x-hidden pt-4 scroll-mt-[180px] md:scroll-mt-[200px]">
        <LocalErrorBoundary key={activeTab}>
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center py-32 gap-6 animate-pulse bg-slate-900/20 rounded-[3rem] border border-dashed border-slate-800">
                <RefreshCw className="animate-spin text-indigo-500" size={32} />
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Initialisation du module {activeTab}...</p>
            </div>
          }>
            {activeTab === 'Flux' && <FluxHub history={history} />}
            {activeTab === 'Signaux' && <SignalHub />}
            {activeTab === 'Topologie' && <TopologyHub drawName={drawName} />}
            {activeTab === 'Oracle' && <OracleHub drawName={drawName} />}
            {activeTab === 'Simulation' && <SimulationTab drawName={drawName} />}
            {activeTab === 'Forensic' && <ForensicHub drawName={drawName} />}
          </Suspense>
        </LocalErrorBoundary>
      </div>
    </div>
  );
};
