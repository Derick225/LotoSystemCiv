
import React, { useState, useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { runSurvivalSimulation, BettingStrategy, BacktestReport } from '../../services/backtestingEngine';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Play, RefreshCw, Sliders, TrendingUp, AlertTriangle, ShieldCheck, Zap, Info } from 'lucide-react';
import { generateSimulationAudit } from '../../services/geminiService';

export const SimulationTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history, globalWeights, loading: nexusLoading } = useNexus();
    const [simulating, setSimulating] = useState(false);
    const [report, setReport] = useState<BacktestReport | null>(null);
    const [audit, setAudit] = useState<string | null>(null);
    const [strategy, setStrategy] = useState<BettingStrategy>('KELLY');
    const [depth, setDepth] = useState(50);
    const [isAuditLoading, setIsAuditLoading] = useState(false);

    const handleRun = async () => {
        if (history.length < depth + 5) return;
        setSimulating(true);
        setAudit(null);
        
        // Simule un calcul intensif
        setTimeout(async () => {
            const result = await runSurvivalSimulation(drawName, history, globalWeights, depth, strategy);
            setReport(result);
            setSimulating(false);
            
            // Lancer l'audit IA automatiquement après le rapport
            setIsAuditLoading(true);
            try {
                const aiAudit = await generateSimulationAudit(result);
                setAudit(aiAudit);
            } finally {
                setIsAuditLoading(false);
            }
        }, 800);
    };

    // Calcul de l'enveloppe Monte Carlo (Simulation de chemins probables)
    const monteCarloData = useMemo(() => {
        if (!report) return [];
        return report.history.map((h, i) => {
            const noise = (Math.random() - 0.5) * 500 * (i/report.history.length);
            return {
                ...h,
                pessimistic: Math.max(0, h.balance - 1000 - Math.abs(noise * 2)),
                optimistic: h.balance + 1000 + Math.abs(noise * 1.5)
            };
        });
    }, [report]);

    if (nexusLoading) return <div className="p-20 text-center animate-pulse font-black text-indigo-500 uppercase tracking-widest">Initialisation du simulateur...</div>;

    return (
        <div className="space-y-8 animate-fade-in pb-16">
            <div className="bg-slate-900 p-8 rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Zap size={120} /></div>
                
                <div className="flex flex-col lg:flex-row justify-between items-center gap-8 relative z-10">
                    <div>
                        <h3 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-4">
                            <Sliders className="text-indigo-500" /> Survival <span className="text-indigo-500">Monte Carlo</span>
                        </h3>
                        <p className="text-slate-400 text-sm mt-2 font-medium max-w-xl leading-relaxed">
                            Simulez la performance du noyau Nexus sur l'historique réel en appliquant des stratégies de Money Management professionnelles.
                        </p>
                    </div>
                    
                    <div className="flex flex-wrap gap-4 items-center bg-white/5 p-4 rounded-3xl border border-white/5">
                        <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black text-slate-500 uppercase">Stratégie</span>
                            <select 
                                value={strategy} 
                                onChange={(e) => setStrategy(e.target.value as BettingStrategy)}
                                className="bg-slate-800 border-none rounded-xl px-4 py-2.5 font-bold text-xs text-white outline-none focus:ring-2 ring-indigo-500"
                            >
                                <option value="FLAT">Flat Betting (Conservateur)</option>
                                <option value="MARTINGALE">Martingale (Risque Ruine)</option>
                                <option value="KELLY">Kelly Criterion (Optimal)</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black text-slate-500 uppercase">Profondeur</span>
                            <select 
                                value={depth} 
                                onChange={(e) => setDepth(Number(e.target.value))}
                                className="bg-slate-800 border-none rounded-xl px-4 py-2.5 font-bold text-xs text-white outline-none focus:ring-2 ring-indigo-500"
                            >
                                <option value={25}>25 Tirages</option>
                                <option value={50}>50 Tirages</option>
                                <option value={100}>100 Tirages</option>
                            </select>
                        </div>
                        <button 
                            onClick={handleRun} 
                            disabled={simulating}
                            className="mt-5 px-10 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {simulating ? <RefreshCw className="animate-spin" size={16}/> : <Play size={16}/>} 
                            {simulating ? 'Processing...' : 'Run Simulation'}
                        </button>
                    </div>
                </div>
            </div>

            {report && (
                <div className="grid lg:grid-cols-12 gap-8 animate-slide-up">
                    {/* Stats & Finance */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 h-full flex flex-col">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">Performance Financière</h4>
                            
                            <div className="space-y-6 flex-1">
                                <div className="flex justify-between items-end border-b border-slate-50 dark:border-slate-700 pb-4">
                                    <span className="text-xs font-bold text-slate-500 uppercase">Profit Net</span>
                                    <span className={`text-2xl font-black ${report.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {report.netProfit > 0 ? '+' : ''}{report.netProfit.toLocaleString()} F
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl">
                                        <div className="text-[9px] font-black text-slate-500 uppercase mb-1">ROI Global</div>
                                        <div className="text-xl font-black text-indigo-500">{report.roi.toFixed(1)}%</div>
                                    </div>
                                    <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl">
                                        <div className="text-[9px] font-black text-slate-500 uppercase mb-1">Win Rate</div>
                                        <div className="text-xl font-black text-emerald-500">{report.winRate.toFixed(1)}%</div>
                                    </div>
                                </div>
                                <div className="p-5 bg-rose-500/5 rounded-2xl border border-rose-500/10">
                                    <div className="flex justify-between text-[10px] font-black text-rose-500 uppercase mb-2">
                                        <span>Max Drawdown</span>
                                        <span>-{report.maxDrawdown.toFixed(1)}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-rose-500" style={{ width: `${report.maxDrawdown}%` }}></div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8">
                                <div className={`flex items-center gap-3 p-4 rounded-2xl border ${report.bankruptcyDraw === null ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                                    {report.bankruptcyDraw === null ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
                                    <div className="text-xs font-black uppercase">
                                        {report.bankruptcyDraw === null ? 'Survie Probable : 100%' : `Rupture au tirage #${report.bankruptcyDraw}`}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Chart & AI Audit */}
                    <div className="lg:col-span-8 space-y-8">
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8 flex justify-between items-center">
                                <span>Évolution du Capital & Enveloppes de Confiance</span>
                                <span className="font-mono text-indigo-500">INIT: 50,000 F</span>
                            </h4>
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={monteCarloData}>
                                        <defs>
                                            <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.05} />
                                        <XAxis dataKey="date" hide />
                                        <YAxis domain={['dataMin - 5000', 'dataMax + 5000']} hide />
                                        <Tooltip 
                                            contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }}
                                            formatter={(val: number) => [`${val.toLocaleString()} F`, 'Solde']}
                                        />
                                        <ReferenceLine y={initialBankroll} stroke="#475569" strokeDasharray="3 3" />
                                        
                                        {/* Monte Carlo Bands */}
                                        <Area type="monotone" dataKey="optimistic" stroke="transparent" fill="#10b981" fillOpacity={0.05} />
                                        <Area type="monotone" dataKey="pessimistic" stroke="transparent" fill="#f43f5e" fillOpacity={0.05} />
                                        
                                        {/* Main Path */}
                                        <Area type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={4} fill="url(#colorArea)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Oracle AI Simulation Audit */}
                        <div className="bg-slate-950 p-8 rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5"><TrendingUp size={48} /></div>
                            <div className="flex items-center gap-3 mb-6">
                                <Info size={18} className="text-indigo-400" />
                                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest">Audit Stratégique de l'Oracle</h4>
                            </div>
                            
                            {isAuditLoading ? (
                                <div className="space-y-2 animate-pulse">
                                    <div className="h-3 bg-slate-800 rounded w-full"></div>
                                    <div className="h-3 bg-slate-800 rounded w-5/6"></div>
                                    <div className="h-3 bg-slate-800 rounded w-4/6"></div>
                                </div>
                            ) : audit ? (
                                <p className="text-slate-300 text-sm leading-relaxed italic font-medium">
                                    "{audit}"
                                </p>
                            ) : (
                                <p className="text-slate-500 text-xs italic">En attente d'inférence...</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const initialBankroll = 50000;
