
import React, { useState, Suspense, lazy, useEffect } from 'react';
import { useNexus } from '../NexusProvider';
import { SmartInsights } from '../SmartInsights';
import { BarChart2, Waves, Activity, Layers, Clock, RefreshCw, BookOpen, Box, TrendingUp } from 'lucide-react';
import { LocalErrorBoundary } from '../ui/LocalErrorBoundary';
import { ChaosAttractor } from '../ChaosAttractor';
import { calculateGapEfficiency } from '../../services/mathService';
import { GapEfficiencyMeter } from '../GapEfficiencyMeter';
import type { GapEfficiency } from '../../types';

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
    const [geiData, setGeiData] = useState<GapEfficiency[]>([]);

    useEffect(() => {
        if (history.length > 20) {
            calculateGapEfficiency(history).then(setGeiData);
        }
    }, [history]);

    // SYMBIOSE : Écouteur d'événements pour navigation croisée
    useEffect(() => {
        const handleNavigation = (e: CustomEvent) => {
            if (e.detail?.subTab) {
                setActiveSubTab(e.detail.subTab);
                const contentElement = document.getElementById('signal-content');
                if (contentElement) contentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };
        // On écoute l'événement spécifique dispatché par DrawDetails
        window.addEventListener('NAVIGATE_SUB_SIGNAUX' as any, handleNavigation);
        return () => window.removeEventListener('NAVIGATE_SUB_SIGNAUX' as any, handleNavigation);
    }, []);

    const tabs = [
        { id: 'stats', label: 'Stats', icon: BarChart2, color: 'text-indigo-500' },
        { id: 'spectral', label: 'Spectral', icon: Waves, color: 'text-purple-500' },
        { id: 'fractal', label: 'Météo', icon: Layers, color: 'text-emerald-500' },
        { id: 'math', label: 'Maths', icon: Activity, color: 'text-rose-500' },
        { id: 'temporal', label: 'Temps', icon: Clock, color: 'text-amber-500' },
        { id: 'academy', label: 'Academy', icon: BookOpen, color: 'text-white' }
    ];

    return (
        <div className="space-y-6 md:space-y-8 animate-fade-in w-full px-1 md:px-0">
            <SmartInsights drawName={activeDraw} />

            <div className="flex flex-col lg:grid lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 space-y-6 min-w-0">
                    {/* Navigation Onglets Mobile Optimized avec Fading Edge */}
                    <div className="relative sticky top-[70px] z-20 bg-nexus-950/80 backdrop-blur-md py-2 -mx-4 px-4 md:mx-0 md:px-0 md:bg-transparent">
                        <div className="overflow-x-auto scrollbar-hide pb-2 mask-fade-right">
                            <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl md:rounded-[2.5rem] w-max border border-slate-200 dark:border-slate-700 shadow-inner">
                                {tabs.map((tab) => (
                                    <button 
                                        key={tab.id}
                                        onClick={() => setActiveSubTab(tab.id)}
                                        className={`
                                            px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 whitespace-nowrap flex-shrink-0
                                            ${activeSubTab === tab.id 
                                                ? 'bg-white dark:bg-slate-700 shadow-lg scale-105 z-10 text-slate-800 dark:text-white ring-1 ring-black/5 dark:ring-white/10' 
                                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                            }
                                        `}
                                    >
                                        <tab.icon size={14} className={activeSubTab === tab.id ? tab.color : ''} />
                                        <span>{tab.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <style dangerouslySetInnerHTML={{ __html: `
                            .mask-fade-right {
                                -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%);
                                mask-image: linear-gradient(to right, black 85%, transparent 100%);
                            }
                            @media (min-width: 1024px) {
                                .mask-fade-right { -webkit-mask-image: none; mask-image: none; }
                            }
                        `}} />
                    </div>

                    <div id="signal-content" className="min-h-[400px] transition-all duration-500">
                        <LocalErrorBoundary key={activeSubTab}>
                            <Suspense fallback={
                                <div className="py-20 flex flex-col items-center justify-center gap-4">
                                    <RefreshCw className="animate-spin text-indigo-500" size={32} />
                                    <p className="text-slate-500 font-bold uppercase text-[9px] tracking-widest">Calcul du module...</p>
                                </div>
                            }>
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

                {/* Sidebar Widget : Attracteur & GEI */}
                <div className="lg:col-span-4 space-y-6">
                    <ChaosAttractor history={history} />
                    <GapEfficiencyMeter data={geiData} />
                    
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-xl">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Box size={12} className="text-indigo-500"/> Analyse Contextuelle
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                            Les graphiques isolent les singularités mathématiques. Une forte "Maturité" (GEI) couplée à une résonance spectrale indique une sortie imminente.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
