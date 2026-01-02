import React from 'react';
import type { ScoreBreakdown } from '../types';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { Binary, Info, Activity } from 'lucide-react';

interface OracleAnalyticsDashboardProps {
    breakdown?: Record<number, ScoreBreakdown>;
    suggestedNumbers: number[];
}

export const OracleAnalyticsDashboard: React.FC<OracleAnalyticsDashboardProps> = ({ breakdown, suggestedNumbers }) => {
    if (!breakdown || suggestedNumbers.length === 0) return null;

    const topNumber = suggestedNumbers[0];
    const data = breakdown[topNumber];

    if (!data) return null;

    const chartData = [
        { name: 'Momentum', score: data.momentum, color: '#f59e0b', desc: 'Force de tendance courte' },
        { name: 'Orchestr.', score: data.orchestration, color: '#ec4899', desc: 'Patterns de succession' },
        { name: 'Spectral', score: data.spectral, color: '#8b5cf6', desc: 'Résonance FFT' },
        { name: 'Équilibre', score: data.equilibrium, color: '#10b981', desc: 'Retour à la moyenne' },
        { name: 'Markov', score: data.markov, color: '#3b82f6', desc: 'Probabilité de transition' },
        { name: 'Bayes', score: data.bayes, color: '#6366f1', desc: 'Inférence conditionnelle' },
        { name: 'Racine', score: data.digital_root, color: '#84cc16', desc: 'Harmonie numérique' },
        { name: 'Vélocité', score: data.gap_velocity, color: '#06b6d4', desc: 'Accélération des écarts' },
        { name: 'Succession', score: data.leader_succession, color: '#ef4444', desc: 'Corrélation J-1' },
    ].sort((a, b) => b.score - a.score);

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const item = chartData.find(d => d.name === payload[0].payload.name);
            return (
                <div className="bg-slate-950 border border-slate-700 p-4 rounded-2xl shadow-2xl backdrop-blur-xl">
                    <p className="text-white font-black text-xs uppercase mb-1">{item?.name}</p>
                    <div className="flex items-center gap-2">
                         <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item?.color }}></div>
                         <p className="text-indigo-400 font-mono text-xl font-black">{payload[0].value}%</p>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2 italic font-medium">"{item?.desc}"</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-8 md:p-12 rounded-[3.5rem] shadow-2xl border border-gray-100 dark:border-gray-700 mt-12 animate-slide-up relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:rotate-12 transition-transform duration-1000"><Binary size={140} /></div>
            <div className="absolute -left-10 -bottom-10 w-64 h-64 bg-indigo-500/5 rounded-full blur-[100px]"></div>
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6 relative z-10">
                <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 rounded-full border border-indigo-100 dark:border-indigo-800 mb-4">
                        <Activity size={14} className="text-indigo-600" />
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Diagnostic v7.0</span>
                    </div>
                    <h4 className="font-black text-slate-800 dark:text-white text-2xl md:text-3xl tracking-tighter">
                        Autopsie du Signal <span className="text-indigo-600">N°{topNumber}</span>
                    </h4>
                    <p className="text-sm text-slate-400 font-medium mt-1">Vecteurs de divergence et convergence probabiliste</p>
                </div>
                <div className="bg-slate-900 px-8 py-5 rounded-[2rem] text-center shadow-xl border border-slate-700">
                    <div className="text-4xl font-black text-white font-mono">{Math.round(chartData.reduce((acc, v) => acc + v.score, 0) / 9)}%</div>
                    <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mt-1">Score Harmonique Σ</div>
                </div>
            </div>
            
            <div className="h-[450px] w-full relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 30, right: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#374151" opacity={0.08} />
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis 
                            dataKey="name" 
                            type="category" 
                            width={110} 
                            tick={{ fontSize: 11, fill: '#94a3af', fontWeight: 'black', textAnchor: 'end' }} 
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.05)', radius: 12 }} />
                        <Bar dataKey="score" radius={[0, 15, 15, 0]} barSize={28} animationDuration={2000}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.9} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            
            <div className="mt-12 p-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-[2.5rem] border border-indigo-100 dark:border-indigo-800/50 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden shadow-inner">
                <Info className="text-indigo-600 shrink-0" size={32} />
                <p className="text-xs md:text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed font-bold italic">
                    "L'analyse révèle que l'unité {topNumber} est principalement portée par le vecteur <span className="text-indigo-600 uppercase">{chartData[0].name}</span>. Ce profil présente un risque de volatilité {chartData[0].score > 80 ? 'élevé' : 'maîtrisé'}. La recommandation Kelly doit être suivie avec rigueur."
                </p>
            </div>
        </div>
    );
};