import React from 'react';
import { TrendingUp, Sparkles, History } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { AlgoWeights } from '../../../types';

interface TrainingDNAChartProps {
    evolutionData: Array<{
        gen: number;
        bestFitness: number;
        avgFitness?: number;
        diversity: number;
        bestGenome: AlgoWeights;
        source?: string;
    }>;
}

export const TrainingDNAChart: React.FC<TrainingDNAChartProps> = ({ evolutionData }) => {
    return (
        <div className="bg-[#05091a]/80 p-4 md:p-6 rounded-2xl shadow-xl border border-slate-850 h-80 relative overflow-hidden min-w-0 w-full">
            <div className="flex justify-between items-center mb-4 px-2">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp size={14} className="text-emerald-400"/> Trajectoire de Convergence
                </h4>
                {evolutionData.length > 0 ? (
                    <div className="flex gap-3 text-[9px] font-bold text-slate-400">
                        <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div> Meilleure</span>
                        <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> Moyenne</span>
                        <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> Diversité</span>
                    </div>
                ) : (
                    <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                        <Sparkles size={11} /> Attente de données
                    </span>
                )}
            </div>
            
            {evolutionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={evolutionData}>
                        <defs>
                            <linearGradient id="colorFit" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorDiv" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15}/>
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.05} stroke="#fff" />
                        <XAxis dataKey="gen" tick={{fontSize: 9, fill: '#64748b'}} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" hide domain={['auto', 'auto']} />
                        <YAxis yAxisId="right" orientation="right" hide domain={[0, 1]} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #1e293b', backgroundColor: '#020617', color: '#fff', fontSize: '9px' }} />
                        <Area yAxisId="left" type="monotone" dataKey="bestFitness" stroke="#10b981" strokeWidth={2.5} fill="url(#colorFit)" isAnimationActive={false} name="Best Fitness" />
                        <Area yAxisId="left" type="monotone" dataKey="avgFitness" stroke="#6366f1" strokeWidth={1.5} fill="transparent" strokeDasharray="4 4" isAnimationActive={false} name="Avg Fitness" />
                        <Area yAxisId="right" type="monotone" dataKey="diversity" stroke="#f59e0b" strokeWidth={1} fill="url(#colorDiv)" isAnimationActive={false} name="Diversity (0-1)" />
                    </AreaChart>
                </ResponsiveContainer>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-[10px] uppercase font-bold tracking-[0.2em] opacity-40">
                    <History size={28} className="mb-2 animate-pulse text-indigo-400" />
                    <span>Démarrer l'évolution pour projeter la trajectoire d'apprentissage</span>
                </div>
            )}
        </div>
    );
};
