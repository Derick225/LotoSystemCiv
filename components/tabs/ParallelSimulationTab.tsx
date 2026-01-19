
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

    const chartData = reports ? reports.FLAT.history.map((h, i) => ({
        date: h.date,
        'Prudent (Flat)': h.balance,
        'Risqué (Martingale)': reports.MARTINGALE.history[i].balance,
        'Expert (Kelly)': reports.KELLY.history[i].balance,
    })) : [];

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="bg-slate-900 p-10 rounded-[3.5rem] border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5"><TrendingUp size={140} /></div>
                <div className="relative z-10 text-center max-w-2xl mx-auto">
                    <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Simulateur de <span className="text-indigo-500">Mondes Parallèles</span></h3>
                    <p className="text-slate-400 text-sm font-medium mb-10 leading-relaxed">
                        Comparez 3 destins financiers. Nous simulons l'application de vos réglages actuels sur les 60 derniers tirages avec différentes gestions de capital.
                    </p>
                    <button 
                        onClick={handleRun} 
                        disabled={loading}
                        className="px-12 py-5 bg-white text-slate-900 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center gap-3 mx-auto transition-all active:scale-95 disabled:opacity-50"
                    >
                        {loading ? 'Calcul des futurs...' : 'Lancer le Vortex'}
                    </button>
                </div>
            </div>

            {reports && (
                <div className="grid lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-8 bg-white dark:bg-slate-900 p-8 rounded-[3.5rem] shadow-xl border border-slate-100 dark:border-slate-800">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2"><Scale size={14}/> Écarts de Fortune</h4>
                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                    <XAxis dataKey="date" hide />
                                    <YAxis hide domain={['auto', 'auto']} />
                                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '20px' }} />
                                    <Area type="monotone" dataKey="Prudent (Flat)" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} strokeWidth={3} />
                                    <Area type="monotone" dataKey="Risqué (Martingale)" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.1} strokeWidth={3} />
                                    <Area type="monotone" dataKey="Expert (Kelly)" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={3} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="lg:col-span-4 space-y-4">
                        {/* Fix: Explicitly cast entries to resolve 'unknown' member access errors */}
                        {(Object.entries(reports) as Array<[string, BacktestReport]>).map(([strat, rep]) => (
                            <div key={strat} className="p-6 bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] font-black text-slate-400 uppercase">{strat}</span>
                                    <span className={`text-sm font-black ${rep.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {rep.netProfit > 0 ? '+' : ''}{rep.netProfit.toLocaleString()} F
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="h-1.5 flex-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className={`h-full ${rep.netProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, Math.abs(rep.roi))}%` }}></div>
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-500">{rep.roi.toFixed(1)}% ROI</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
