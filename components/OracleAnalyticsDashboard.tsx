import React from 'react';
import type { ScoreBreakdown } from '../types';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { Binary, Activity } from 'lucide-react';

interface OracleAnalyticsDashboardProps {
    breakdown?: Record<number, ScoreBreakdown>;
    suggestedNumbers: number[];
}

export const OracleAnalyticsDashboard: React.FC<OracleAnalyticsDashboardProps> = ({ breakdown, suggestedNumbers }) => {
    if (!breakdown || suggestedNumbers.length === 0) return null;

    const topNumber = suggestedNumbers[0];
    const data = breakdown[topNumber];

    if (!data) return null;

    // Ajout explicite du vecteur Wavelet
    const chartData = [
        { name: 'Haar Wavelet', score: Math.round(data.wavelet || 0), color: '#fcd34d', desc: 'Détection d\'impulsion locale (Ondelettes)' },
        { name: 'FFT Spectral', score: Math.round(data.spectral || 0), color: '#8b5cf6', desc: 'Résonance harmonique globale' },
        { name: 'Gap Momentum', score: Math.round(data.momentum || 0), color: '#f59e0b', desc: 'Force de tendance court-terme' },
        { name: 'Markov Switch', score: Math.round(data.markov || 0), color: '#3b82f6', desc: 'Probabilité de transition séquentielle' },
        { name: 'Gauss Equilibrium', score: Math.round(data.equilibrium || 0), color: '#10b981', desc: 'Retour à la moyenne théorique' },
        { name: 'Bayes Logic', score: Math.round(data.bayes || 0), color: '#6366f1', desc: 'Inférence conditionnelle cloud' },
        { name: 'Gap Velocity', score: Math.round(data.gap_velocity || 0), color: '#06b6d4', desc: 'Accélération des écarts temporels' },
        { name: 'Pattern Orch.', score: Math.round(data.orchestration || 0), color: '#ec4899', desc: 'Patterns de succession complexes' },
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
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6 relative z-10">
                <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 rounded-full border border-indigo-100 dark:border-indigo-800 mb-4">
                        <Activity size={14} className="text-indigo-600" />
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Diagnostic Wavelet-Sync v12.1</span>
                    </div>
                    <h4 className="font-black text-slate-800 dark:text-white text-2xl md:text-3xl tracking-tighter">
                        Autopsie du Signal <span className="text-indigo-600">N°{topNumber}</span>
                    </h4>
                    <p className="text-slate-400 text-sm mt-2 font-medium">Décomposition tensorielle des vecteurs de probabilité.</p>
                </div>
                <div className="bg-slate-900 px-8 py-5 rounded-[2rem] text-center shadow-xl border border-slate-700">
                    <div className="text-4xl font-black text-white font-mono">{Math.round(chartData.reduce((acc, v) => acc + v.score, 0) / chartData.length)}%</div>
                    <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mt-1">Cohérence Harmonique Σ</div>
                </div>
            </div>
            
            <div className="h-[450px] w-full relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.05} />
                        <XAxis type="number" hide domain={[0, 100]} />
                        <YAxis 
                            dataKey="name" 
                            type="category" 
                            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} 
                            width={100}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }} />
                        <Bar dataKey="score" radius={[0, 8, 8, 0]} barSize={24}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-8 flex items-start gap-4 p-5 bg-indigo-50 dark:bg-indigo-950/30 rounded-3xl border border-indigo-100 dark:border-indigo-900/50 relative z-10">
                <div className="p-2 bg-indigo-600 rounded-xl text-white">
                    <Binary size={16} />
                </div>
                <p className="text-[11px] text-indigo-800 dark:text-indigo-200 leading-relaxed font-medium">
                    L'analyse par ondelettes (**Wavelet**) isole les fluctuations locales de haute fréquence, capturant des changements de régime que l'analyse spectrale globale (FFT) a tendance à lisser. Un score élevé sur ce vecteur indique une "singularité temporelle" imminente.
                </p>
            </div>
        </div>
    );
};