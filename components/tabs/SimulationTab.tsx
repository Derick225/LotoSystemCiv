
import React, { useState, useRef, useEffect } from 'react';
import { useNexus } from '../NexusProvider';
import { runSurvivalSimulation, BettingStrategy, BacktestReport } from '../../services/backtestingEngine';
import { Play, RefreshCw, Trophy, PiggyBank, ThumbsUp, ThumbsDown } from 'lucide-react';

export const SimulationTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history, globalWeights, loading: nexusLoading } = useNexus();
    const [simulating, setSimulating] = useState(false);
    const [report, setReport] = useState<BacktestReport | null>(null);
    
    const isMounted = useRef(true);
    useEffect(() => { return () => { isMounted.current = false; }; }, []);

    const handleRun = async () => {
        if (history.length < 50) return;
        setSimulating(true);
        try {
            // On force une stratégie simple pour l'utilisateur novice
            const result = await runSurvivalSimulation(drawName, history, globalWeights, 50, 'FLAT');
            if (isMounted.current) {
                setReport(result);
                setSimulating(false);
            }
        } catch (e) {
            if(isMounted.current) setSimulating(false);
        }
    };

    if (nexusLoading) return <div className="p-20 text-center animate-pulse font-black text-indigo-500 uppercase tracking-widest">Chargement...</div>;

    return (
        <div className="space-y-8 animate-fade-in pb-16">
            <div className="bg-slate-900 p-8 rounded-[3rem] border border-slate-800 shadow-2xl text-center">
                <div className="inline-block p-6 bg-indigo-600 rounded-full shadow-lg shadow-indigo-600/30 mb-6">
                    <PiggyBank size={48} className="text-white" />
                </div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-4">
                    Testeur de Stratégie
                </h3>
                <p className="text-slate-400 text-sm font-medium max-w-md mx-auto mb-8">
                    Si vous aviez joué les prédictions de l'IA sur les 50 derniers tirages, auriez-vous gagné ?
                </p>
                
                <button 
                    onClick={handleRun} 
                    disabled={simulating}
                    className="px-10 py-4 bg-white text-indigo-900 hover:bg-indigo-50 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center gap-3 mx-auto transition-all active:scale-95 disabled:opacity-50"
                >
                    {simulating ? <RefreshCw className="animate-spin" size={18}/> : <Play size={18}/>} 
                    {simulating ? 'Calcul...' : 'Lancer le Test'}
                </button>
            </div>

            {report && (
                <div className="animate-slide-up">
                    <div className={`p-8 rounded-[3rem] border-4 text-center ${report.netProfit >= 0 ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : 'bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:border-rose-800'}`}>
                        <div className="flex justify-center mb-4">
                            {report.netProfit >= 0 
                                ? <ThumbsUp size={64} className="text-emerald-500" />
                                : <ThumbsDown size={64} className="text-rose-500" />
                            }
                        </div>
                        
                        <h4 className="text-lg font-black uppercase text-slate-500 mb-2">Résultat Estimé</h4>
                        <div className={`text-5xl font-black ${report.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {report.netProfit > 0 ? '+' : ''}{report.netProfit.toLocaleString()} F
                        </div>
                        
                        <p className="text-sm font-bold text-slate-400 mt-4">
                            {report.netProfit >= 0 
                                ? "La stratégie actuelle est RENTABLE." 
                                : "Attention, risque de perte élevé avec cette configuration."}
                        </p>

                        <div className="mt-8 grid grid-cols-2 gap-4 max-w-sm mx-auto">
                            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl">
                                <div className="text-xs text-slate-400 uppercase font-bold">Précision</div>
                                <div className="text-xl font-black text-slate-800 dark:text-white">{report.winRate.toFixed(0)}%</div>
                            </div>
                            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl">
                                <div className="text-xs text-slate-400 uppercase font-bold">ROI</div>
                                <div className="text-xl font-black text-slate-800 dark:text-white">{report.roi.toFixed(0)}%</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
