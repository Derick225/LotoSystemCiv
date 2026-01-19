
import React, { useEffect, useState } from 'react';
import { useNexus } from './NexusProvider';
import { getNumberDetailedMetrics } from '../services/mathService';
import type { DetailedNumberMetrics } from '../types';
import { NumberBall } from './NumberBall';
import { Activity, X, TrendingUp, Radio, Network, Thermometer, Zap } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip } from 'recharts';

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
        }
    }, [inspectingNumber, history, spectral, fractal]);

    if (inspectingNumber === null) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl animate-fade-in" onClick={() => setInspectingNumber(null)}>
            <div className="bg-slate-900 w-full max-w-2xl rounded-[3.5rem] shadow-2xl border border-white/10 overflow-hidden relative flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header Section */}
                <div className="p-8 bg-gradient-to-br from-indigo-900/40 to-slate-900 flex justify-between items-center border-b border-white/5">
                    <div className="flex items-center gap-6">
                        <NumberBall number={inspectingNumber} size="xl" glow />
                        <div>
                            <h3 className="text-3xl font-black text-white tracking-tighter uppercase">Vecteur {inspectingNumber}</h3>
                            <p className="text-xs font-mono text-indigo-400 mt-1 uppercase tracking-widest">Status: {metrics?.temperature && metrics.temperature > 70 ? 'CRITIQUE' : 'NOMINAL'}</p>
                        </div>
                    </div>
                    <button onClick={() => setInspectingNumber(null)} className="p-4 bg-white/5 hover:bg-white/10 rounded-full transition-colors"><X size={24} className="text-slate-400" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center gap-4 animate-pulse">
                            <Zap className="text-indigo-500 animate-spin" size={40} />
                            <span className="text-[10px] font-black text-slate-500 uppercase">Synchronisation...</span>
                        </div>
                    ) : metrics && (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[
                                    { label: 'Température', val: metrics.temperature + '°', icon: <Thermometer size={14}/> },
                                    { label: 'Hurst Index', val: metrics.hurst.toFixed(2), icon: <Activity size={14}/> },
                                    { label: 'Écart Actuel', val: metrics.lastGap + 't', icon: <Radio size={14}/> },
                                    { label: 'Fiabilité', val: metrics.nextProb + '%', icon: <TrendingUp size={14}/> }
                                ].map((stat, i) => (
                                    <div key={i} className="p-4 bg-white/5 rounded-2xl border border-white/5 text-center">
                                        <div className="flex justify-center mb-2 text-indigo-400">{stat.icon}</div>
                                        <div className="text-xl font-black text-white">{stat.val}</div>
                                        <div className="text-[8px] font-black text-slate-500 uppercase mt-1">{stat.label}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2"><Activity size={12}/> Séquence Temporelle (20t)</h4>
                                <div className="h-32 w-full bg-black/20 rounded-3xl p-4 border border-white/5">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={metrics.historyGraph.map((v, i) => ({ v, i }))}>
                                            <Area type="stepAfter" dataKey="v" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} strokeWidth={2} />
                                            <YAxis hide domain={[0, 1]} />
                                            <XAxis hide />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-8">
                                <div>
                                    <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-4 flex items-center gap-2"><Network size={12}/> Synergies Fortes</h4>
                                    <div className="flex gap-2">
                                        {metrics.affinity.map(n => <NumberBall key={n} number={n} size="sm" />)}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.3em] mb-4 flex items-center gap-2"><X size={12}/> Oppositions</h4>
                                    <div className="flex gap-2">
                                        {metrics.nemesis.map(n => <NumberBall key={n} number={n} size="sm" />)}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="p-8 border-t border-white/5 bg-black/20">
                    <p className="text-[10px] text-slate-500 font-medium leading-relaxed italic text-center">
                        "L'analyse quantique suggère que ce vecteur est actuellement en phase de {metrics?.hurst && metrics.hurst > 0.6 ? 'persistance forte' : 'bruit stochastique'}. Surveillez les zones de synergie."
                    </p>
                </div>
            </div>
        </div>
    );
};
