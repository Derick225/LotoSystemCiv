
import React, { useEffect, useState } from 'react';
import { useNexus } from './NexusProvider';
import { getNumberDetailedMetrics } from '../services/mathService';
import type { DetailedNumberMetrics } from '../types';
import { NumberBall } from './NumberBall';
import { SpectralWaveform } from './SpectralWaveform';
import { Activity, X, TrendingUp, Radio, Network, Thermometer, Zap, Waves, ScanBarcode, Atom } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis } from 'recharts';

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
            <div className="bg-slate-900 w-full max-w-2xl rounded-[3.5rem] shadow-2xl border border-white/10 overflow-hidden relative flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                
                {/* Header Section */}
                <div className="p-8 bg-gradient-to-br from-indigo-950 to-slate-900 flex justify-between items-center border-b border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none"><Atom size={120} /></div>
                    
                    <div className="flex items-center gap-8 relative z-10">
                        <div className="relative">
                            <NumberBall number={inspectingNumber} size="xl" glow />
                            <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded border border-emerald-400 shadow-lg">LIVE</div>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <ScanBarcode size={14} className="text-indigo-400"/>
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Signature Vectorielle</span>
                            </div>
                            <h3 className="text-4xl font-black text-white tracking-tighter leading-none">N°{inspectingNumber}</h3>
                        </div>
                    </div>
                    <button onClick={() => setInspectingNumber(null)} className="p-4 bg-white/5 hover:bg-white/10 rounded-full transition-colors relative z-10"><X size={24} className="text-slate-400" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center gap-4 animate-pulse">
                            <Zap className="text-indigo-500 animate-spin" size={48} />
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Décodage ADN...</span>
                        </div>
                    ) : metrics && (
                        <>
                            {/* KPI Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-5 bg-white/5 rounded-[2rem] border border-white/5 text-center group hover:bg-white/10 transition-colors">
                                    <Thermometer size={18} className="text-rose-400 mx-auto mb-2 group-hover:scale-110 transition-transform"/>
                                    <div className="text-2xl font-black text-white">{metrics.temperature}°</div>
                                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Température</div>
                                </div>
                                <div className="p-5 bg-white/5 rounded-[2rem] border border-white/5 text-center group hover:bg-white/10 transition-colors">
                                    <Activity size={18} className="text-emerald-400 mx-auto mb-2 group-hover:scale-110 transition-transform"/>
                                    <div className="text-2xl font-black text-white">{metrics.hurst.toFixed(2)}</div>
                                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Hurst Idx</div>
                                </div>
                                <div className="p-5 bg-white/5 rounded-[2rem] border border-white/5 text-center group hover:bg-white/10 transition-colors">
                                    <Radio size={18} className="text-amber-400 mx-auto mb-2 group-hover:scale-110 transition-transform"/>
                                    <div className="text-2xl font-black text-white">{metrics.lastGap}t</div>
                                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Dernier Écart</div>
                                </div>
                                <div className="p-5 bg-white/5 rounded-[2rem] border border-white/5 text-center group hover:bg-white/10 transition-colors">
                                    <TrendingUp size={18} className="text-indigo-400 mx-auto mb-2 group-hover:scale-110 transition-transform"/>
                                    <div className="text-2xl font-black text-white">{metrics.nextProb}%</div>
                                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Proba Sortie</div>
                                </div>
                            </div>

                            {/* WAVEFORM VISUALIZATION */}
                            <div className="bg-black/30 rounded-[2.5rem] border border-white/5 p-6 relative overflow-hidden">
                                <div className="flex justify-between items-center mb-6 relative z-10">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2"><Waves size={14} className="text-indigo-400"/> Résonance Spectrale</h4>
                                    <span className="px-2 py-1 bg-indigo-500/20 rounded text-[9px] font-bold text-indigo-300">Cycle {metrics.hurst > 0.5 ? 'Stable' : 'Chaotique'}</span>
                                </div>
                                <div className="h-32 w-full rounded-2xl overflow-hidden opacity-80">
                                    <SpectralWaveform energy={metrics.temperature} hurst={metrics.hurst} />
                                </div>
                            </div>

                            {/* HISTORY GRAPH */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2"><Activity size={12}/> Activité Récente (20t)</h4>
                                <div className="h-32 w-full bg-black/20 rounded-[2rem] p-1 border border-white/5 overflow-hidden">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={metrics.historyGraph.map((v, i) => ({ v, i }))}>
                                            <defs>
                                                <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <Area type="monotone" dataKey="v" stroke="#6366f1" strokeWidth={3} fill="url(#colorMetric)" fillOpacity={1} />
                                            <YAxis hide domain={[0, 1]} />
                                            <XAxis hide />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* RELATIONSHIPS */}
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="bg-white/5 p-6 rounded-[2.5rem] border border-white/5">
                                    <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-4 flex items-center gap-2"><Network size={12}/> Synergies</h4>
                                    <div className="flex gap-2 flex-wrap">
                                        {metrics.affinity.map(n => <NumberBall key={n} number={n} size="sm" />)}
                                    </div>
                                </div>
                                <div className="bg-white/5 p-6 rounded-[2.5rem] border border-white/5">
                                    <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.3em] mb-4 flex items-center gap-2"><X size={12}/> Antagonismes</h4>
                                    <div className="flex gap-2 flex-wrap">
                                        {metrics.nemesis.map(n => <NumberBall key={n} number={n} size="sm" />)}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="p-6 border-t border-white/5 bg-slate-900/50 backdrop-blur-md">
                    <p className="text-[10px] text-slate-400 font-medium leading-relaxed italic text-center">
                        "L'analyse Apex suggère une phase de {metrics?.hurst && metrics.hurst > 0.6 ? 'compression énergétique' : 'dispersion entropique'}. {metrics?.temperature && metrics.temperature > 80 ? 'Risque de surchauffe.' : 'Potentiel latent.'}"
                    </p>
                </div>
            </div>
        </div>
    );
};
