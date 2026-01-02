
import React, { useEffect, useState } from 'react';
import { useNexus } from './NexusProvider';
import { getNumberDetailedMetrics } from '../services/mathService';
import type { DetailedNumberMetrics } from '../types';
import { NumberBall } from './NumberBall';
import { Activity, X, TrendingUp, Radio, Network, BarChart2, Thermometer } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell } from 'recharts';

export const QuantumInspector: React.FC = () => {
    const { inspectingNumber, setInspectingNumber, history, spectral, fractal } = useNexus();
    const [metrics, setMetrics] = useState<DetailedNumberMetrics | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (inspectingNumber !== null && history.length > 0) {
            setLoading(true);
            getNumberDetailedMetrics(inspectingNumber, history, spectral, fractal)
                .then(setMetrics)
                .finally(() => setLoading(false));
        } else {
            setMetrics(null);
        }
    }, [inspectingNumber, history, spectral, fractal]);

    if (inspectingNumber === null) return null;

    const handleClose = () => setInspectingNumber(null);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in" onClick={handleClose}>
            <div 
                className="bg-slate-900 w-full max-w-lg rounded-[3rem] shadow-2xl border border-indigo-500/30 overflow-hidden relative" 
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="relative h-32 bg-gradient-to-br from-indigo-900 to-slate-900 p-6 flex justify-between items-start">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px] -mr-16 -mt-16"></div>
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="scale-125">
                            <NumberBall number={inspectingNumber} size="xl" isAttractor={true} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Vecteur {inspectingNumber}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${metrics && metrics.temperature > 60 ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>
                                    {metrics && metrics.temperature > 60 ? 'Haute Énergie' : 'Stable'}
                                </span>
                                <span className="text-[10px] text-indigo-300 font-mono">H={metrics?.hurst.toFixed(2) || '--'}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={handleClose} className="relative z-10 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {loading ? (
                    <div className="p-12 flex flex-col items-center justify-center gap-4">
                        <Activity className="animate-spin text-indigo-500" size={32} />
                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Décodage quantique...</span>
                    </div>
                ) : metrics ? (
                    <div className="p-6 space-y-6">
                        {/* Key Metrics Grid */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 text-center">
                                <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Écart Actuel</div>
                                <div className="text-2xl font-black text-white">{metrics.lastGap}</div>
                                <div className="text-[8px] text-slate-500">Moyenne: {metrics.avgGap}</div>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 text-center">
                                <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Probabilité</div>
                                <div className={`text-2xl font-black ${metrics.nextProb > 75 ? 'text-emerald-400' : 'text-indigo-400'}`}>
                                    {metrics.nextProb}%
                                </div>
                                <div className="text-[8px] text-slate-500">Poisson Model</div>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 text-center">
                                <div className="text-[9px] font-black text-slate-400 uppercase mb-1">FFT Power</div>
                                <div className="text-2xl font-black text-white">{metrics.spectralEnergy}</div>
                                <div className="text-[8px] text-slate-500">Résonance</div>
                            </div>
                        </div>

                        {/* History Sparkline */}
                        <div className="bg-slate-800/30 p-4 rounded-3xl border border-slate-700">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Activity size={12} className="text-indigo-500"/> Séquence Binaire (20t)
                                </h4>
                            </div>
                            <div className="h-16 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={metrics.historyGraph.map((v, i) => ({ val: v, idx: i }))}>
                                        <Bar dataKey="val" radius={[2, 2, 0, 0]}>
                                            {metrics.historyGraph.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry === 1 ? '#6366f1' : '#1e293b'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Affinities & Nemesis */}
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <Network size={12}/> Synergies
                                </h4>
                                <div className="flex gap-2">
                                    {metrics.affinity.map(n => (
                                        <div key={n} className="w-8 h-8 rounded-lg bg-emerald-900/30 border border-emerald-500/30 flex items-center justify-center text-[10px] font-black text-emerald-400">
                                            {n}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <Radio size={12}/> Oppositions
                                </h4>
                                <div className="flex gap-2">
                                    {metrics.nemesis.map(n => (
                                        <div key={n} className="w-8 h-8 rounded-lg bg-rose-900/30 border border-rose-500/30 flex items-center justify-center text-[10px] font-black text-rose-400">
                                            {n}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Analysis Footer */}
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-[10px] text-slate-400 font-medium italic leading-relaxed">
                            "L'unité {inspectingNumber} montre un écart-type de {metrics.stdDev}. Sa signature spectrale indique une {metrics.spectralEnergy > 50 ? 'forte' : 'faible'} cyclicité. À surveiller avec les numéros {metrics.affinity.join(', ')}."
                        </div>
                    </div>
                ) : (
                    <div className="p-8 text-center text-slate-500 text-xs">Données indisponibles.</div>
                )}
            </div>
        </div>
    );
};
