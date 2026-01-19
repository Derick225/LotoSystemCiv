import React, { useState, useEffect } from 'react';
import { useNexus } from '../NexusProvider';
import { runComparativeSimulation, BacktestReport, BettingStrategy } from '../../services/backtestingEngine';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Play, TrendingUp, ShieldCheck, Zap, AlertTriangle, Scale } from 'lucide-react';

export const ParallelSimulationTab: React.FC = () => {
    const { history, drawName, globalWeights } = useNexus();
    const [reports, setReports] = useState<Record<BettingStrategy, BacktestReport> | null>(null);
    const [loading, setLoading] = useState(false);

    const handleRun = async () => {
        setLoading(true);
        try {
            const results = await runComparativeSimulation(drawName, history, globalWeights, 60);
            setReports(results);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const chartData = reports ? (reports.FLAT.history || []).map((h, i) => ({
        date: h.date,
        'Prudent (Flat)': h.balance,
        'Risqué (Martingale)': reports.MARTINGALE?.history[i]?.balance || 0,
        'Expert (Kelly)': reports.KELLY?.history[i]?.balance || 0,
    })) : [];

    return (
        <div className="space-y-6 md:space-y-8 animate-fade-in px-1 md:px-0">
            <div className="bg-slate-900 p-6 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5"><TrendingUp size={100} className="md:w-[140px] md:h-[140px]" /></div>
                <div className="relative z-10 text-center max-w-2xl mx-auto">
                    <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter mb-4">Simulateur de <span className="text-indigo-500">Mondes Parallèles</span></h3>
                    <p className="text-slate-400 text-xs md:text-sm font-medium mb-8 md:mb-10 leading-relaxed">
                        Comparez 3 destins financiers sur les 60 derniers tirages avec différentes gestions de capital.
                    </p>
                    <button 
                        onClick={handleRun} 
                        disabled={loading}
                        className="w-full md:w-auto px-10 md:px-12 py-4 md:py-5 bg-white text-slate-900 rounded-2xl font-black uppercase text-[10px] md:text-xs tracking-widest shadow-xl flex items-center justify-center gap-3 mx-auto transition-all active:scale-95 disabled:opacity-50"
                    >
                        {loading ? 'Calcul des futurs...' : 'Lancer le Vortex'}
                    </button>
                </div>
            </div>

            {reports && (
                <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 md:gap-8">
                    <div className="lg:col-span-8 bg-white dark:bg-slate-900 p-5 md:p-8 rounded-[2.5rem] md:rounded-[3.5rem] shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 md:mb-8 flex items-center gap-2"><Scale size={14}/> Écarts de Fortune</h4>
                        <div className="h-64 md:h-80 w-full overflow-hidden">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                    <XAxis dataKey="date" hide />
                                    <YAxis hide domain={['auto', 'auto']} />
                                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 'bold', paddingTop: '10px' }} />
                                    <Area type="monotone" dataKey="Prudent (Flat)" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} strokeWidth={2} />
                                    <Area type="monotone" dataKey="Risqué (Martingale)" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.1} strokeWidth={2} />
                                    <Area type="monotone" dataKey="Expert (Kelly)" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="lg:col-span-4 space-y-4">
                        {(Object.entries(reports) as Array<[string, BacktestReport]>).map(([strat, rep]) => (
                            <div key={strat} className="p-5 md:p-6 bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm transition-all hover:border-indigo-500">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-[9px] font-black text-slate-400 uppercase">{strat === 'FLAT' ? 'Prudent' : strat === 'MARTINGALE' ? 'Martingale' : 'Kelly (Expert)'}</span>
                                    <span className={`text-sm md:text-base font-black ${rep.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {rep.netProfit > 0 ? '+' : ''}{rep.netProfit.toLocaleString()} F
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="h-1.5 flex-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className={`h-full ${rep.netProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, Math.abs(rep.roi))}%` }}></div>
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-500 whitespace-nowrap">{rep.roi.toFixed(1)}% ROI</span>
                                </div>
                                <div className="mt-3 flex justify-between text-[8px] font-bold text-slate-400 uppercase">
                                    <span>Tirages: {rep.totalDraws}</span>
                                    <span>Win Rate: {rep.winRate.toFixed(0)}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};