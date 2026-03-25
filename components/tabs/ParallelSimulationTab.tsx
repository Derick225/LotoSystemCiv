
import React, { useState, useMemo } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { runComparativeSimulation, BacktestReport, BettingStrategy } from '../../services/backtestingEngine';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { TrendingUp, Scale, Zap, Trophy, RefreshCw } from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';

export const ParallelSimulationTab: React.FC = () => {
    const { history, drawName, globalWeights } = useNexusStore();
    const [reports, setReports] = useState<Record<BettingStrategy, BacktestReport> | null>(null);
    const [loading, setLoading] = useState(false);

    const handleRun = async () => {
        audioEngine.play('click');
        setLoading(true);
        try {
            const results = await runComparativeSimulation(drawName, history, globalWeights, 60);
            audioEngine.play('success');
            setReports(results);
        } catch (e) {
            console.error(e);
            audioEngine.play('error');
        } finally {
            setLoading(false);
        }
    };

    const bestStrategy = useMemo(() => {
        if (!reports) return null;
        const strategies = Object.entries(reports) as [BettingStrategy, BacktestReport][];
        return strategies.sort((a, b) => b[1].netProfit - a[1].netProfit)[0];
    }, [reports]);

    const chartData = reports ? (reports.FLAT.history || []).map((h, i) => ({
        date: h.date,
        'Prudent (Flat)': h.balance,
        'Risqué (Martingale)': reports.MARTINGALE?.history[i]?.balance || 0,
        'Expert (Kelly)': reports.KELLY?.history[i]?.balance || 0,
    })) : [];

    return (
        <div className="space-y-8 animate-fade-in px-1 md:px-0">
            <div className="bg-slate-900 p-8 md:p-10 rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5"><TrendingUp size={160} /></div>
                <div className="relative z-10 text-center max-w-2xl mx-auto">
                    <h3 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter mb-4">
                        Simulateur <span className="text-indigo-500">Parallèle</span>
                    </h3>
                    <p className="text-slate-400 text-sm font-medium mb-10 leading-relaxed">
                        Le système projette 3 réalités financières alternatives basées sur 60 tirages historiques. Quelle stratégie aurait survécu ?
                    </p>
                    <button 
                        onClick={handleRun} 
                        disabled={loading}
                        className="w-full md:w-auto px-12 py-5 bg-white hover:bg-indigo-50 text-slate-900 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center justify-center gap-3 mx-auto transition-all active:scale-95 disabled:opacity-50 group"
                    >
                        {loading ? <RefreshCw className="animate-spin text-indigo-600" size={18}/> : <Zap className="text-amber-500 group-hover:scale-110 transition-transform" size={18}/>}
                        {loading ? 'Calcul des futurs...' : 'Lancer le Vortex'}
                    </button>
                </div>
            </div>

            {reports && (
                <div className="flex flex-col lg:grid lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-8 bg-white dark:bg-slate-900 p-6 md:p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden relative">
                        <div className="flex justify-between items-center mb-8 px-2">
                             <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Scale size={14}/> Écarts de Fortune</h4>
                        </div>
                        <div className="h-80 w-full overflow-hidden">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorFlat" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient>
                                        <linearGradient id="colorMart" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/><stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/></linearGradient>
                                        <linearGradient id="colorKelly" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                    <XAxis dataKey="date" hide />
                                    <YAxis hide domain={['auto', 'auto']} />
                                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '11px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '20px' }} />
                                    <Area type="monotone" dataKey="Prudent (Flat)" stroke="#6366f1" fill="url(#colorFlat)" strokeWidth={3} fillOpacity={1} />
                                    <Area type="monotone" dataKey="Risqué (Martingale)" stroke="#f43f5e" fill="url(#colorMart)" strokeWidth={3} fillOpacity={1} />
                                    <Area type="monotone" dataKey="Expert (Kelly)" stroke="#10b981" fill="url(#colorKelly)" strokeWidth={3} fillOpacity={1} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="lg:col-span-4 space-y-4">
                        {(Object.entries(reports) as Array<[string, BacktestReport]>).map(([strat, rep]) => {
                            const isBest = bestStrategy && bestStrategy[0] === strat;
                            return (
                                <div key={strat} className={`p-6 rounded-[2.5rem] border transition-all relative overflow-hidden group ${isBest ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 scale-105 z-10 border-transparent' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-indigo-300'}`}>
                                    {isBest && <div className="absolute top-0 right-0 p-4 opacity-10"><Trophy size={60} /></div>}
                                    
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${isBest ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                {strat === 'FLAT' ? 'Prudent' : strat === 'MARTINGALE' ? 'Risqué' : 'Expert'}
                                            </span>
                                            <h5 className={`text-lg font-black uppercase ${isBest ? 'text-white' : 'text-slate-800 dark:text-white'}`}>{strat}</h5>
                                        </div>
                                        {isBest && <Trophy size={20} className="text-amber-400 animate-bounce" />}
                                    </div>
                                    
                                    <div className="flex items-baseline gap-2 mb-4">
                                        <span className={`text-2xl font-black ${isBest ? 'text-white' : (rep.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500')}`}>
                                            {rep.netProfit > 0 ? '+' : ''}{rep.netProfit.toLocaleString()} F
                                        </span>
                                        <span className={`text-[10px] font-bold ${isBest ? 'text-indigo-200' : 'text-slate-400'}`}>Net</span>
                                    </div>

                                    <div className={`h-1.5 w-full rounded-full overflow-hidden mb-4 ${isBest ? 'bg-indigo-800' : 'bg-slate-100 dark:bg-slate-700'}`}>
                                        <div className={`h-full ${rep.netProfit >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${Math.min(100, Math.abs(rep.roi))}%` }}></div>
                                    </div>

                                    <div className={`flex justify-between text-[9px] font-bold uppercase ${isBest ? 'text-indigo-200' : 'text-slate-400'}`}>
                                        <span>ROI: {rep.roi.toFixed(1)}%</span>
                                        <span>Win Rate: {rep.winRate.toFixed(0)}%</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
