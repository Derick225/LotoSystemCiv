
import React, { useState, useRef, useEffect } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { runSurvivalSimulation, BacktestReport } from '../../services/backtestingEngine';
import { Play, RefreshCw, Trophy, PiggyBank, ThumbsUp, ThumbsDown, Activity, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { ParallelSimulationTab } from './ParallelSimulationTab';
import { ResponsiveContainer, AreaChart, Area, Tooltip, CartesianGrid, XAxis, YAxis } from 'recharts';
import { audioEngine } from '../../utils/audioEngine';

export const SimulationTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const history = useNexusStore(state => state.history);
    const globalWeights = useNexusStore(state => state.globalWeights);
    const nexusLoading = useNexusStore(state => state.loading);
    const [mode, setMode] = useState<'single' | 'comparative'>('single');
    const [simulating, setSimulating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [report, setReport] = useState<BacktestReport | null>(null);
    
    const isMounted = useRef(true);
    useEffect(() => { return () => { isMounted.current = false; }; }, []);

    const handleRun = async () => {
        if (history.length < 50) return;
        audioEngine.play('click');
        setSimulating(true);
        setReport(null);
        setProgress(0);
        
        try {
            // Callback de progression simulé via le worker
            const result = await runSurvivalSimulation(
                drawName, 
                history, 
                globalWeights, 
                50, 
                'FLAT', 
                (p) => { if(isMounted.current) setProgress(p); }
            );
            
            if (isMounted.current) {
                audioEngine.play('success');
                setReport(result);
                setSimulating(false);
                setProgress(100);
            }
        } catch (e) {
            console.error(e);
            audioEngine.play('error');
            if(isMounted.current) setSimulating(false);
        }
    };

    if (nexusLoading) return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
            <Activity className="text-indigo-500 animate-spin" size={48} />
            <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Synchronisation Temporelle...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-16 w-full">
            {/* Mode Switcher */}
            <div className="flex justify-center mb-4">
                <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 shadow-inner">
                    <button 
                        onClick={() => { audioEngine.play('click'); setMode('single'); }} 
                        className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${mode === 'single' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-500 hover:text-white'}`}
                    >
                        <Activity size={14}/> Backtest Standard
                    </button>
                    <button 
                        onClick={() => { audioEngine.play('click'); setMode('comparative'); }} 
                        className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${mode === 'comparative' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                    >
                        <TrendingUp size={14}/> Comparateur Stratégique
                    </button>
                </div>
            </div>

            {mode === 'single' ? (
                <div className="space-y-8 animate-slide-up">
                    {/* Control Card */}
                    <div className="bg-slate-900 p-8 md:p-12 rounded-[3rem] border border-slate-800 shadow-2xl text-center relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-12 transition-transform duration-1000"><PiggyBank size={180} /></div>
                        <div className="relative z-10">
                            <div className="inline-block p-5 bg-indigo-600/20 rounded-3xl border border-indigo-500/30 mb-6 shadow-lg shadow-indigo-600/10">
                                <PiggyBank size={40} className="text-indigo-400" />
                            </div>
                            <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">
                                Crash Test Financier
                            </h3>
                            <p className="text-slate-400 text-sm font-medium max-w-lg mx-auto mb-10 leading-relaxed">
                                Le système va rejouer les 50 derniers tirages en appliquant strictement l'ADN actuel. 
                                <br/><span className="text-indigo-400 font-bold">Mise fixe : 200 F / ticket.</span>
                            </p>
                            
                            <div className="max-w-md mx-auto relative">
                                <button 
                                    onClick={handleRun} 
                                    disabled={simulating}
                                    className="w-full py-5 bg-white hover:bg-indigo-50 text-slate-900 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-2xl flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group/btn"
                                >
                                    {simulating ? <RefreshCw className="animate-spin text-indigo-600" size={18}/> : <Play size={18} className="fill-current group-hover/btn:scale-110 transition-transform"/>} 
                                    {simulating ? `Calcul en cours ${progress}%` : 'Lancer la Simulation'}
                                </button>
                                {simulating && (
                                    <div className="absolute -bottom-2 left-2 right-2 h-1 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {report && (
                        <div className="animate-scale-in space-y-6">
                            {/* Main KPI Card */}
                            <div className={`p-10 md:p-12 rounded-[3.5rem] border relative overflow-hidden shadow-2xl ${report.netProfit >= 0 ? 'bg-gradient-to-br from-emerald-900/50 to-slate-900 border-emerald-500/30' : 'bg-gradient-to-br from-rose-900/50 to-slate-900 border-rose-500/30'}`}>
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                                
                                <div className="flex flex-col items-center text-center relative z-10">
                                    <div className={`mb-6 p-4 rounded-full ${report.netProfit >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                        {report.netProfit >= 0 ? <ThumbsUp size={32} /> : <ThumbsDown size={32} />}
                                    </div>
                                    
                                    <h4 className="text-xs font-black uppercase text-slate-400 mb-2 tracking-[0.3em]">Résultat Net</h4>
                                    <div className={`text-6xl md:text-8xl font-black tracking-tighter ${report.netProfit >= 0 ? 'text-emerald-400 drop-shadow-[0_0_30px_rgba(52,211,153,0.3)]' : 'text-rose-400 drop-shadow-[0_0_30px_rgba(251,113,133,0.3)]'}`}>
                                        {report.netProfit > 0 ? '+' : ''}{report.netProfit.toLocaleString()} F
                                    </div>
                                    
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12 w-full max-w-4xl">
                                        <div className="bg-black/30 p-5 rounded-3xl border border-white/5">
                                            <div className="text-[9px] text-slate-500 uppercase font-black mb-1">ROI Global</div>
                                            <div className={`text-xl font-black ${report.roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{report.roi.toFixed(1)}%</div>
                                        </div>
                                        <div className="bg-black/30 p-5 rounded-3xl border border-white/5">
                                            <div className="text-[9px] text-slate-500 uppercase font-black mb-1">Précision</div>
                                            <div className="text-xl font-black text-amber-400">{report.winRate.toFixed(1)}%</div>
                                        </div>
                                        <div className="bg-black/30 p-5 rounded-3xl border border-white/5">
                                            <div className="text-[9px] text-slate-500 uppercase font-black mb-1">Drawdown Max</div>
                                            <div className="text-xl font-black text-rose-400">-{report.maxDrawdown}%</div>
                                        </div>
                                        <div className="bg-black/30 p-5 rounded-3xl border border-white/5">
                                            <div className="text-[9px] text-slate-500 uppercase font-black mb-1">Sharpe Ratio</div>
                                            <div className="text-xl font-black text-indigo-400">{report.sharpeRatio}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Chart Area */}
                            <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-[3rem] shadow-xl border border-slate-200 dark:border-slate-800 h-80 relative overflow-hidden">
                                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2 absolute top-8 left-8 z-10">
                                    <Activity size={14}/> Courbe de Capital
                                </h4>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={report.history} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                            </linearGradient>
                                            <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                        <Tooltip 
                                            contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }} 
                                            formatter={(value: number) => [`${value.toLocaleString()} F`, 'Capital']}
                                        />
                                        <XAxis dataKey="date" hide />
                                        <YAxis hide domain={['auto', 'auto']} />
                                        <Area 
                                            type="monotone" 
                                            dataKey="balance" 
                                            stroke={report.netProfit >= 0 ? "#10b981" : "#f43f5e"} 
                                            strokeWidth={3}
                                            fill={`url(#${report.netProfit >= 0 ? 'colorProfit' : 'colorLoss'})`} 
                                            animationDuration={1500}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
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
