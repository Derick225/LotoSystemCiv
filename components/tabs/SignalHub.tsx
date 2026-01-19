
import React, { useState, Suspense, lazy, useEffect } from 'react';
import { useNexus } from '../NexusProvider';
import { SmartInsights } from '../SmartInsights';
import { BarChart2, Waves, Activity, Layers, Clock, RefreshCw, BookOpen, Box } from 'lucide-react';
import { DrawResult } from '../../types';
import { LocalErrorBoundary } from '../ui/LocalErrorBoundary';
import { ChaosAttractor } from '../ChaosAttractor';

const StatsTab = lazy(() => import('./StatsTab').then(m => ({ default: m.StatsTab })));
const SpectralTab = lazy(() => import('./SpectralTab').then(m => ({ default: m.SpectralTab })));
const FractalTab = lazy(() => import('./FractalTab').then(m => ({ default: m.FractalTab })));
const MathTab = lazy(() => import('./MathTab').then(m => ({ default: m.MathTab })));
const TemporalTab = lazy(() => import('./TemporalTab').then(m => ({ default: m.TemporalTab })));
const ClusteringTab = lazy(() => import('./ClusteringTab').then(m => ({ default: m.ClusteringTab })));
const AcademyTab = lazy(() => import('./AcademyTab').then(m => ({ default: m.AcademyTab })));

export const SignalHub: React.FC = () => {
    const { history, drawName, currentDrawName } = useNexus();
    const activeDraw = drawName || currentDrawName;
    
    const [activeSubTab, setActiveSubTab] = useState('stats');

    const tabs = [
        { id: 'stats', label: 'Statistiques', icon: BarChart2, color: 'text-indigo-500' },
        { id: 'spectral', label: 'Spectral FFT', icon: Waves, color: 'text-purple-500' },
        { id: 'fractal', label: 'Fractal Hurst', icon: Layers, color: 'text-emerald-500' },
        { id: 'math', label: 'Arithmétique', icon: Activity, color: 'text-rose-500' },
        { id: 'temporal', label: 'Temporel', icon: Clock, color: 'text-amber-500' },
        { id: 'academy', label: 'Academy', icon: BookOpen, color: 'text-white' }
    ];

    return (
        <div className="space-y-8 animate-fade-in w-full">
            <SmartInsights drawName={activeDraw} />

            <div className="grid lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8">
                    <div className="overflow-x-auto scrollbar-hide pb-2 mb-8">
                        <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-[2.5rem] w-fit border border-slate-200 dark:border-slate-700 shadow-inner">
                            {tabs.map((tab) => (
                                <button 
                                    key={tab.id}
                                    onClick={() => setActiveSubTab(tab.id)}
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
                            <Suspense fallback={<div className="py-32 text-center animate-pulse text-slate-400 font-bold uppercase text-[10px]">Chargement du moteur...</div>}>
                                {activeSubTab === 'stats' && <StatsTab drawName={activeDraw} />}
                                {activeSubTab === 'spectral' && <SpectralTab drawName={activeDraw} />}
                                {activeSubTab === 'fractal' && <FractalTab drawName={activeDraw} />}
                                {activeSubTab === 'math' && <MathTab drawName={activeDraw} />}
                                {activeSubTab === 'temporal' && <TemporalTab drawName={activeDraw} />}
                                {activeSubTab === 'academy' && <AcademyTab />}
                                {activeSubTab === 'cluster' && <ClusteringTab drawName={activeDraw} />}
                            </Suspense>
                        </LocalErrorBoundary>
                    </div>
                </div>

                {/* Chaos Attractor Sidebar Widget */}
                <div className="lg:col-span-4 space-y-6">
                    <ChaosAttractor history={history} />
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-xl">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Box size={12}/> Lecture de l'Espace</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                            L'attracteur ci-dessus montre la trajectoire stochastique du jeu. Une spirale régulière indique un jeu cyclique prévisible. Un nuage diffus indique un régime de bruit blanc pur.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
