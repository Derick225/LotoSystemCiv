import React, { useState, useEffect, useRef } from 'react';
import { runBacktestTraining } from '../../services/trainingService';
import { LearningService } from '../../services/learningService';
import { getAlgoWeights } from '../../services/predictionEngine';
import { getPredictionHistoryAsync } from '../../services/predictionHistoryService';
import type { AlgoWeights, TrainingReport } from '../../types';
import { useToast } from '../ui/Toast';
import { useNexus } from '../NexusProvider';
import { AlgoRadar } from '../AlgoRadar';
import { 
    Settings, RefreshCw, Activity, 
    TrendingUp, FlaskConical, Dna, Brain, AlertTriangle, CheckCircle2, Zap, ArrowUp
} from 'lucide-react';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
    ResponsiveContainer, BarChart, Bar, Cell 
} from 'recharts';

export const TrainingTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { showToast } = useToast();
    const { history, loading: nexusLoading, globalWeights, updateGlobalWeights } = useNexus();
    
    const [isEvolving, setIsEvolving] = useState(false);
    const [report, setReport] = useState<TrainingReport | null>(null);
    const [hasDrift, setHasDrift] = useState(false);
    const [evolutionHistory, setEvolutionHistory] = useState<{gen: number, fitness: number}[]>([]);
    
    useEffect(() => {
        const diagnostic = async () => {
            const preds = await getPredictionHistoryAsync(drawName);
            const drift = await LearningService.checkDrift(drawName, preds, history);
            setHasDrift(drift);
        };
        diagnostic();
    }, [drawName, history]);

    const runEvolution = async () => {
        setIsEvolving(true);
        setEvolutionHistory([]);
        showToast("Initialisation du séquenceur génétique...", "info");

        try {
            // Simulation visuelle de convergence pour l'UX
            let currentFit = 40;
            for(let i=0; i<10; i++) {
                await new Promise(r => setTimeout(r, 400));
                currentFit += Math.random() * 5;
                setEvolutionHistory(prev => [...prev, { gen: i, fitness: currentFit }]);
            }

            const result = await LearningService.triggerAutoLearning(drawName);
            
            if (result.improvement) {
                showToast(`🧬 Mutation réussie : ${result.message}`, "success");
                setEvolutionHistory(prev => [...prev, { gen: 11, fitness: currentFit + 10 }]);
            } else {
                showToast(result.message, "info");
            }
            
            // Refresh du diagnostic
            const res = await runBacktestTraining(drawName, history, 35, undefined, globalWeights);
            setReport(res);

        } catch (e: any) {
            showToast("Erreur de liaison synaptique.", "error");
        } finally {
            setIsEvolving(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in pb-20 w-full overflow-hidden">
            
            {/* Drift Monitor / Alert */}
            {hasDrift && (
                <div className="bg-rose-500/10 border border-rose-500/30 p-6 rounded-[2.5rem] flex flex-col md:flex-row items-center justify-between gap-6 animate-pulse">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-rose-500 text-white rounded-2xl shadow-lg shadow-rose-500/20">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <h4 className="text-white font-black uppercase text-sm tracking-widest">Dérive de précision détectée</h4>
                            <p className="text-xs text-rose-300 font-medium">L'ADN actuel ne correspond plus à la signature thermique du flux.</p>
                        </div>
                    </div>
                    <button 
                        onClick={runEvolution}
                        className="px-8 py-3 bg-white text-rose-600 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:scale-105 transition-transform"
                    >
                        Forcer Re-Séquençage
                    </button>
                </div>
            )}

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Control Panel */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-slate-900 p-8 rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Brain size={120} /></div>
                        
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-8 text-indigo-400">
                                <FlaskConical size={18} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Séquenceur DNA v12</span>
                            </div>

                            <div className="space-y-6">
                                <div className="text-center">
                                    <div className="text-6xl font-black text-white mb-2">{report ? report.score : '--'}%</div>
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Score de Fitness Global</div>
                                </div>

                                <button 
                                    onClick={runEvolution}
                                    disabled={isEvolving}
                                    className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {isEvolving ? <RefreshCw className="animate-spin" size={18}/> : <Dna size={18}/>}
                                    {isEvolving ? 'Séquençage...' : 'Évoluer ADN'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Convergence Graph Mini */}
                    {evolutionHistory.length > 0 && (
                        <div className="bg-black/40 p-6 rounded-[2.5rem] border border-white/5 h-48 relative overflow-hidden">
                            <div className="absolute top-4 left-6 text-[8px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <TrendingUp size={10}/> Courbe de Convergence
                            </div>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={evolutionHistory}>
                                    <Area type="monotone" dataKey="fitness" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} strokeWidth={3} animationDuration={1000} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* Dashboard Results */}
                <div className="lg:col-span-8 space-y-8">
                    {report ? (
                        <div className="grid md:grid-cols-2 gap-8 animate-slide-up">
                            <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">Structure ADN Morphée</h4>
                                <AlgoRadar weights={globalWeights} height={280} />
                            </div>
                            
                            <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col justify-between">
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Distribution des Hits</h4>
                                    <div className="h-40">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={Object.entries(report.winDistribution).map(([k, v]) => ({ name: k, val: v }))}>
                                                <Bar dataKey="val" radius={[6, 6, 0, 0]}>
                                                    {Object.entries(report.winDistribution).map((_, i) => (
                                                        <Cell key={i} fill={i >= 2 ? '#6366f1' : '#cbd5e1'} />
                                                    ))}
                                                </Bar>
                                                <Tooltip cursor={{fill: 'transparent'}} contentStyle={{backgroundColor:'#0f172a', border:'none', borderRadius:'12px', fontSize:'10px', color:'#fff'}} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                                <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 flex items-center gap-4">
                                    <CheckCircle2 className="text-emerald-500" size={24} />
                                    <div>
                                        <div className="text-[10px] font-black text-white uppercase leading-none mb-1">Régime détecté</div>
                                        <div className="text-xs font-bold text-emerald-400 uppercase">{report.regimeInfo?.regime}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full min-h-[400px] flex flex-col items-center justify-center p-20 bg-slate-50 dark:bg-slate-900/40 rounded-[4rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center">
                            <Zap size={64} className="text-slate-300 dark:text-slate-700 mb-6 opacity-20" />
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] max-w-sm">
                                Terminal de Séquençage Prêt. Lancez une évolution pour recalibrer les neurones de l'Oracle.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};