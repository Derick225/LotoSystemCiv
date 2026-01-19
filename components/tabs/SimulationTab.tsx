import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
import { useNexus } from '../NexusProvider';
import { runSurvivalSimulation, BettingStrategy, BacktestReport } from '../../services/backtestingEngine';
import { Play, RefreshCw, Trophy, PiggyBank, ThumbsUp, ThumbsDown, Layers, ChevronRight } from 'lucide-react';
import { ParallelSimulationTab } from './ParallelSimulationTab';

export const SimulationTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history, globalWeights, loading: nexusLoading } = useNexus();
    const [mode, setMode] = useState<'single' | 'comparative'>('single');
    const [simulating, setSimulating] = useState(false);
    const [report, setReport] = useState<BacktestReport | null>(null);
    
    const isMounted = useRef(true);
    useEffect(() => { return () => { isMounted.current = false; }; }, []);

    const handleRun = async () => {
        if (history.length < 50) return;
        setSimulating(true);
        try {
            const result = await runSurvivalSimulation(drawName, history, globalWeights, 50, 'FLAT');
            if (isMounted.current) {
                setReport(result);
                setSimulating(false);
            }
        } catch (e) {
            if(isMounted.current) setSimulating(false);
        }
    };

    if (nexusLoading) return <div className="p-20 text-center animate-pulse font-black text-indigo-500 uppercase tracking-widest">Synchronisation Temporelle...</div>;

    return (
        <div className="space-y-8 animate-fade-in pb-16">
            <div className="flex bg-slate-100 dark:bg-slate-800/50 p-1 rounded-2xl w-fit border border-slate-200 dark:border-slate-700 mx-auto mb-4">
                <button onClick={() => setMode('single')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${mode === 'single' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-white' : 'text-slate-400'}`}>Backtest Simple</button>
                <button onClick={() => setMode('comparative')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${mode === 'comparative' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-white' : 'text-slate-400'}`}>Comparatif Futur</button>
            </div>

            {mode === 'single' ? (
                <div className="space-y-8">
                    <div className="bg-slate-900 p-8 rounded-[3rem] border border-slate-800 shadow-2xl text-center relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-12 transition-transform duration-1000"><PiggyBank size={140} /></div>
                        <div className="relative z-10">
                            <div className="inline-block p-6 bg-indigo-600 rounded-full shadow-lg shadow-indigo-600/30 mb-6">
                                <PiggyBank size={48} className="text-white" />
                            </div>
                            <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-4">
                                Testeur de Stratégie
                            </h3>
                            <p className="text-slate-400 text-sm font-medium max-w-md mx-auto mb-8">
                                Si vous aviez joué les prédictions de l'IA sur les 50 derniers tirages, auriez-vous gagné ? (Base: 100 F / ticket)
                            </p>
                            
                            <button 
                                onClick={handleRun} 
                                disabled={simulating}
                                className="px-10 py-4 bg-white text-indigo-900 hover:bg-indigo-50 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center gap-3 mx-auto transition-all active:scale-95 disabled:opacity-50"
                            >
                                {simulating ? <RefreshCw className="animate-spin" size={18}/> : <Play size={18}/>} 
                                {simulating ? 'Calcul des probabilités...' : 'Lancer le Diagnostic'}
                            </button>
                        </div>
                    </div>

                    {report && (
                        <div className="animate-slide-up">
                            <div className={`p-10 rounded-[3.5rem] border-4 text-center shadow-2xl relative overflow-hidden ${report.netProfit >= 0 ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800' : 'bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800'}`}>
                                <div className="flex justify-center mb-6">
                                    {report.netProfit >= 0 
                                        ? <ThumbsUp size={80} className="text-emerald-500 animate-bounce" />
                                        : <ThumbsDown size={80} className="text-rose-500" />
                                    }
                                </div>
                                
                                <h4 className="text-sm font-black uppercase text-slate-500 mb-2 tracking-widest">Profit Net Estimé</h4>
                                <div className={`text-6xl md:text-8xl font-black ${report.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {report.netProfit > 0 ? '+' : ''}{report.netProfit.toLocaleString()} F
                                </div>
                                
                                <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {[
                                        { label: 'ROI %', val: report.roi.toFixed(1) + '%', color: 'text-indigo-500' },
                                        { label: 'Précision', val: report.winRate.toFixed(0) + '%', color: 'text-amber-500' },
                                        { label: 'Drawdown', val: report.maxDrawdown.toFixed(1) + '%', color: 'text-rose-500' },
                                        { label: 'Status', val: report.netProfit > 0 ? 'Bénéfique' : 'Critique', color: 'text-white' }
                                    ].map(stat => (
                                        <div key={stat.label} className="bg-white/5 dark:bg-black/20 p-4 rounded-2xl border border-white/5">
                                            <div className="text-[10px] font-black text-slate-500 uppercase">{stat.label}</div>
                                            <div className={`text-lg font-black ${stat.color}`}>{stat.val}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <ParallelSimulationTab />
            )}
        </div>
    );
};