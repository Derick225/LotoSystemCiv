
import React, { useState, Suspense, lazy } from 'react';
import { Grid, GitBranch, Calculator, RefreshCw, Share2, Terminal } from 'lucide-react';
import { LocalErrorBoundary } from '../ui/LocalErrorBoundary';

const SpatialTab = lazy(() => import('./SpatialTab').then(m => ({ default: m.SpatialTab })));
const DecisionTreeTab = lazy(() => import('./DecisionTreeTab').then(m => ({ default: m.DecisionTreeTab })));
const CombinationsTab = lazy(() => import('./CombinationsTab').then(m => ({ default: m.CombinationsTab })));
const NetworkTab = lazy(() => import('./NetworkTab').then(m => ({ default: m.NetworkTab })));
const PythonAnalystTab = lazy(() => import('./PythonAnalystTab').then(m => ({ default: m.PythonAnalystTab })));

interface TopologyHubProps { drawName: string; }

const TabLoader = () => (
    <div className="flex flex-col items-center justify-center py-24 gap-4 animate-pulse">
        <RefreshCw className="animate-spin text-indigo-500" />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calcul Topology...</p>
    </div>
);

export const TopologyHub: React.FC<TopologyHubProps> = ({ drawName }) => {
    const [subTab, setSubTab] = useState<'spatial' | 'network' | 'decision' | 'combinations' | 'python'>('spatial');

    const renderTab = () => {
        switch (subTab) {
            case 'spatial': return <SpatialTab drawName={drawName} />;
            case 'network': return <NetworkTab drawName={drawName} />;
            case 'decision': return <DecisionTreeTab drawName={drawName} />;
            case 'combinations': return <CombinationsTab drawName={drawName} />;
            case 'python': return <PythonAnalystTab drawName={drawName} />;
            default: return null;
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-[2.2rem] w-fit border border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-hide max-w-full shadow-inner">
                <button 
                    onClick={() => setSubTab('spatial')} 
                    className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 whitespace-nowrap ${subTab === 'spatial' ? 'bg-white dark:bg-slate-700 shadow-md text-indigo-600 dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    <Grid size={16}/> Géométrie
                </button>
                <button 
                    onClick={() => setSubTab('network')} 
                    className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 whitespace-nowrap ${subTab === 'network' ? 'bg-white dark:bg-slate-700 shadow-md text-blue-600 dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    <Share2 size={16}/> Réseau
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
            
            <div className="animate-slide-up transition-all duration-500">
                <LocalErrorBoundary key={subTab}>
                    <Suspense fallback={<TabLoader />}>
                        {renderTab()}
                    </Suspense>
                </LocalErrorBoundary>
            </div>
        </div>
    );
};
