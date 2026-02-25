
import React, { useState, Suspense, lazy, useEffect } from 'react';
import { Grid, GitBranch, Calculator, RefreshCw, Users, Terminal, Network } from 'lucide-react';
import { LocalErrorBoundary } from '../ui/LocalErrorBoundary';

const SpatialTab = lazy(() => import('./SpatialTab').then(m => ({ default: m.SpatialTab })));
const SynergyTab = lazy(() => import('./SynergyTab').then(m => ({ default: m.SynergyTab })));
const DecisionTreeTab = lazy(() => import('./DecisionTreeTab').then(m => ({ default: m.DecisionTreeTab })));
const CombinationsTab = lazy(() => import('./CombinationsTab').then(m => ({ default: m.CombinationsTab })));
const PythonAnalystTab = lazy(() => import('./PythonAnalystTab').then(m => ({ default: m.PythonAnalystTab })));
const NeuralArchitectureTab = lazy(() => import('./NeuralArchitectureTab').then(m => ({ default: m.NeuralArchitectureTab })));

interface TopologyHubProps { drawName: string; }

const TabLoader = () => (
    <div className="flex flex-col items-center justify-center py-24 gap-4 animate-pulse">
        <RefreshCw className="animate-spin text-indigo-500" />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Analyse Structurelle...</p>
    </div>
);

export const TopologyHub: React.FC<TopologyHubProps> = ({ drawName }) => {
    const [subTab, setSubTab] = useState<'spatial' | 'synergy' | 'decision' | 'combinations' | 'python' | 'neural'>('spatial');

    // SYMBIOSE : Écouteur d'événements
    useEffect(() => {
        const handleNavigation = (e: CustomEvent) => {
            if (e.detail?.mainTab === 'Topologie' && e.detail?.subTab) {
                setSubTab(e.detail.subTab);
                const contentElement = document.getElementById('topology-content');
                if (contentElement) contentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };
        window.addEventListener('NAVIGATE_TO_MODULE' as any, handleNavigation);
        return () => window.removeEventListener('NAVIGATE_TO_MODULE' as any, handleNavigation);
    }, []);

    const renderTab = () => {
        switch (subTab) {
            case 'spatial': return <SpatialTab drawName={drawName} />;
            case 'synergy': return <SynergyTab drawName={drawName} />;
            case 'decision': return <DecisionTreeTab drawName={drawName} />;
            case 'combinations': return <CombinationsTab drawName={drawName} />;
            case 'python': return <PythonAnalystTab drawName={drawName} />;
            case 'neural': return <NeuralArchitectureTab />;
            default: return null;
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Navigation sur Mobile */}
            <div className="relative z-20 bg-nexus-950 py-2 -mx-4 px-4 md:mx-0 md:px-0 md:bg-transparent">
                <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-[2.2rem] w-fit border border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-hide max-w-full shadow-inner">
                    <button 
                        onClick={() => setSubTab('spatial')} 
                        className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 whitespace-nowrap ${subTab === 'spatial' ? 'bg-white dark:bg-slate-700 shadow-md text-indigo-600 dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Grid size={16}/> Géométrie
                    </button>
                    <button 
                        onClick={() => setSubTab('neural')} 
                        className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 whitespace-nowrap ${subTab === 'neural' ? 'bg-white dark:bg-slate-700 shadow-md text-indigo-600 dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Network size={16}/> Architecture
                    </button>
                    <button 
                        onClick={() => setSubTab('synergy')} 
                        className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 whitespace-nowrap ${subTab === 'synergy' ? 'bg-white dark:bg-slate-700 shadow-md text-blue-600 dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Users size={16}/> Synergie
                    </button>
                    <button 
                        onClick={() => setSubTab('decision')} 
                        className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 whitespace-nowrap ${subTab === 'decision' ? 'bg-white dark:bg-slate-700 shadow-md text-emerald-600 dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <GitBranch size={16}/> Décision
                    </button>
                    <button 
                        onClick={() => setSubTab('combinations')} 
                        className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 whitespace-nowrap ${subTab === 'combinations' ? 'bg-white dark:bg-slate-700 shadow-md text-rose-600 dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Calculator size={16}/> Architecte
                    </button>
                    <button 
                        onClick={() => setSubTab('python')} 
                        className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 whitespace-nowrap ${subTab === 'python' ? 'bg-emerald-600 text-white shadow-xl scale-105' : 'text-emerald-500 hover:text-emerald-400'}`}
                    >
                        <Terminal size={16}/> Deep Kernel
                    </button>
                </div>
            </div>
            
            <div id="topology-content" className="animate-slide-up transition-all duration-500 scroll-mt-[240px] md:scroll-mt-[280px]">
                <LocalErrorBoundary key={subTab}>
                    <Suspense fallback={<TabLoader />}>
                        {renderTab()}
                    </Suspense>
                </LocalErrorBoundary>
            </div>
        </div>
    );
};
