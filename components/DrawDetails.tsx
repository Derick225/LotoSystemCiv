
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useNexus } from './NexusProvider';
import { 
  Database, Activity, Target, Share2, 
  ShieldCheck, RefreshCw, 
  FlaskConical, Microscope, Clock
} from 'lucide-react';
import { LocalErrorBoundary } from './ui/LocalErrorBoundary';

// Lazy loading sécurisé
// OracleHub est à la racine de components/ d'après la structure fournie
const FluxHub = lazy(() => import('./tabs/FluxHub').then(m => ({ default: m.FluxHub })));
const SignalHub = lazy(() => import('./tabs/SignalHub').then(m => ({ default: m.SignalHub })));
const TopologyHub = lazy(() => import('./tabs/TopologyHub').then(m => ({ default: m.TopologyHub })));
const OracleHub = lazy(() => import('./OracleHub').then(m => ({ default: m.OracleHub })));
const SimulationTab = lazy(() => import('./tabs/SimulationTab').then(m => ({ default: m.SimulationTab })));
const ForensicHub = lazy(() => import('./tabs/ForensicHub').then(m => ({ default: m.ForensicHub })));

type MainTab = 'Flux' | 'Signaux' | 'Topologie' | 'Oracle' | 'Simulation' | 'Forensic';

export const DrawDetails: React.FC = () => {
  const { drawName, history, loading, refreshData } = useNexus();
  const [activeTab, setActiveTab] = useState<MainTab>('Flux');

  // Écouteur pour la navigation forcée depuis des insights
  useEffect(() => {
      const handleNav = (e: any) => {
          if (e.detail?.mainTab) setActiveTab(e.detail.mainTab);
      };
      window.addEventListener('NAVIGATE_TO_MODULE', handleNav);
      return () => window.removeEventListener('NAVIGATE_TO_MODULE', handleNav);
  }, []);

  if (loading && history.length === 0) {
      return (
          <div className="h-[60vh] flex flex-col items-center justify-center gap-6">
              <div className="relative">
                  <div className="w-20 h-20 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                  <Database className="absolute inset-0 m-auto text-indigo-500 animate-pulse" size={24} />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.4em] text-indigo-400">Accès au registre {drawName}...</p>
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

  // En mode "ALL" (Archives Globales), seul l'historique brut (Flux) est pertinent.
  const tabs = drawName === 'ALL' 
    ? allTabs.filter(t => t.id === 'Flux') 
    : allTabs;

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      {/* Header Contextuel */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 bg-slate-900/40 p-8 rounded-[3.5rem] border border-white/5 backdrop-blur-md">
        <div className="space-y-2">
            <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-indigo-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-indigo-500/20">Active Session</span>
                <span className="text-[9px] font-mono text-slate-500 uppercase">{history.length} Séquences indexées</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter leading-none">
              {drawName === 'ALL' ? 'ARCHIVES GLOBALES' : drawName} <span className="text-indigo-500 text-2xl">v11.0</span>
            </h2>
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <Clock size={12}/> Temps Réel : {new Date().toLocaleTimeString()}
            </div>
        </div>

        <div className="flex flex-wrap gap-2">
            <button onClick={() => refreshData(drawName, true)} className="p-4 bg-white/5 hover:bg-indigo-600 text-slate-400 hover:text-white rounded-2xl transition-all active:scale-90 border border-white/5">
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
            <div className="bg-emerald-500/10 border border-emerald-500/20 px-6 py-4 rounded-2xl flex items-center gap-3">
                <ShieldCheck size={20} className="text-emerald-500" />
                <div className="text-left">
                    <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest leading-none">Status</div>
                    <div className="text-xs font-black text-emerald-400 uppercase mt-0.5">Noyau Sain</div>
                </div>
            </div>
        </div>
      </header>

      {/* Navigation Interne */}
      <nav className="flex bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-hide shadow-inner sticky top-24 z-40 backdrop-blur-xl">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as MainTab)}
            className={`
              flex items-center gap-3 px-6 py-3.5 rounded-[2rem] transition-all whitespace-nowrap
              ${activeTab === t.id 
                ? 'bg-white dark:bg-slate-700 shadow-xl text-indigo-600 dark:text-white scale-105 z-10' 
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}
            `}
          >
            <t.icon size={18} className={activeTab === t.id ? 'animate-pulse' : ''} />
            <div className="text-left">
                <div className="text-[10px] font-black uppercase tracking-widest leading-none">{t.label}</div>
            </div>
          </button>
        ))}
      </nav>

      {/* Zone de Contenu Dynamique */}
      <div className="min-h-[600px] relative">
        <LocalErrorBoundary key={activeTab}> {/* La clé force le reset de l'erreur au changement d'onglet */}
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center py-32 gap-6 animate-pulse">
                <RefreshCw className="animate-spin text-indigo-500" size={32} />
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Initialisation du module {activeTab}...</p>
            </div>
          }>
            {activeTab === 'Flux' && <FluxHub history={history} />}
            {activeTab === 'Signaux' && <SignalHub history={history} />}
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
