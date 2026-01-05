
import React, { useState, Suspense, lazy } from 'react';
import { useNexus } from '../NexusProvider';
import { SmartInsights } from '../SmartInsights';
import { BarChart2, Waves, Activity, Layers, Clock, RefreshCw } from 'lucide-react';
import { DrawResult } from '../../types';
import { LocalErrorBoundary } from '../ui/LocalErrorBoundary';

// Lazy loading for performance
const StatsTab = lazy(() => import('./StatsTab').then(m => ({ default: m.StatsTab })));
const SpectralTab = lazy(() => import('./SpectralTab').then(m => ({ default: m.SpectralTab })));
const FractalTab = lazy(() => import('./FractalTab').then(m => ({ default: m.FractalTab })));
const MathTab = lazy(() => import('./MathTab').then(m => ({ default: m.MathTab })));
const TemporalTab = lazy(() => import('./TemporalTab').then(m => ({ default: m.TemporalTab })));
const ClusteringTab = lazy(() => import('./ClusteringTab').then(m => ({ default: m.ClusteringTab })));

interface SignalHubProps {
    history?: DrawResult[]; 
}

export const SignalHub: React.FC<SignalHubProps> = ({ history }) => {
    const { currentDrawName } = useNexus();
    const [activeSubTab, setActiveSubTab] = useState<'stats' | 'spectral' | 'fractal' | 'math' | 'temporal' | 'cluster'>('stats');

    if (!currentDrawName) return null;

    // External navigation handler (e.g. from SmartInsights)
    React.useEffect(() => {
        const handleNav = (e: CustomEvent) => {
            if (e.detail?.subTab) setActiveSubTab(e.detail.subTab);
        };
        window.addEventListener('NAVIGATE_TO_MODULE', handleNav as EventListener);
        return () => window.removeEventListener('NAVIGATE_TO_MODULE', handleNav as EventListener);
    }, []);

    const tabs = [
        { id: 'stats', label: 'Statistiques', icon: BarChart2, color: 'text-indigo-500' },
        { id: 'spectral', label: 'Spectral FFT', icon: Waves, color: 'text-purple-500' },
        { id: 'fractal', label: 'Fractal Hurst', icon: Layers, color: 'text-emerald-500' },
        { id: 'math', label: 'Arithmétique', icon: Activity, color: 'text-rose-500' },
        { id: 'temporal', label: 'Temporel', icon: Clock, color: 'text-amber-500' },
        { id: 'cluster', label: 'Clustering', icon: Activity, color: 'text-blue-500' }
    ];

    return (
        <div className="space-y-8 animate-fade-in">
            <SmartInsights drawName={currentDrawName} />

            <div className="overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 md:mx-0 md:px-0">
                <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-[2.5rem] w-fit border border-slate-200 dark:border-slate-700 shadow-inner">
                    {tabs.map((tab) => (
                        <button 
                            key={tab.id}
                            onClick={() => setActiveSubTab(tab.id as any)}
                            className={`
                                px-5 py-3 rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap
                                ${activeSubTab === tab.id 
                                    ? 'bg-white dark:bg-slate-700 shadow-lg scale-105 z-10 text-slate-800 dark:text-white' 
                                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                }
                            `}
                        >
                            <tab.icon size={14} className={activeSubTab === tab.id ? tab.color : ''} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="min-h-[500px] transition-all duration-500">
                <LocalErrorBoundary key={activeSubTab}>
                    <Suspense fallback={
                        <div className="flex flex-col items-center justify-center h-64 gap-4 animate-pulse">
                            <RefreshCw className="animate-spin text-indigo-500" />
                            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Chargement Module...</span>
                        </div>
                    }>
                        {activeSubTab === 'stats' && <StatsTab drawName={currentDrawName} />}
                        {activeSubTab === 'spectral' && <SpectralTab drawName={currentDrawName} />}
                        {activeSubTab === 'fractal' && <FractalTab drawName={currentDrawName} />}
                        {activeSubTab === 'math' && <MathTab drawName={currentDrawName} />}
                        {activeSubTab === 'temporal' && <TemporalTab drawName={currentDrawName} />}
                        {activeSubTab === 'cluster' && <ClusteringTab drawName={currentDrawName} />}
                    </Suspense>
                </LocalErrorBoundary>
            </div>
        </div>
    );
};
