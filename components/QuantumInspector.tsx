
import React, { useEffect, useState, useMemo } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { getNumberDetailedMetrics } from '../services/mathService';
import type { DetailedNumberMetrics } from '../types';
import { NumberBall } from './NumberBall';
import { SpectralWaveform } from './SpectralWaveform';
import { 
    Activity, X, TrendingUp, Radio, Network, 
    Thermometer, Zap, Waves, ScanBarcode, Atom, 
    Crosshair, ShieldAlert, GitMerge 
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { audioEngine } from '../utils/audioEngine';

export const QuantumInspector: React.FC = () => {
    const { inspectingNumber, setInspectingNumber, history, spectral, fractal } = useNexusStore();
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

    const chartData = useMemo(() => {
        if (!metrics) return [];
        return metrics.historyGraph.map((val, idx) => ({
            idx,
            value: val, // 1 ou 0
            // On peut lisser pour l'affichage si besoin, ou garder binaire
        }));
    }, [metrics]);

    if (inspectingNumber === null) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-2xl animate-fade-in" onClick={() => { audioEngine.play('click'); setInspectingNumber(null); }}>
            <div 
                className="bg-slate-900 w-full max-w-4xl rounded-[3rem] shadow-2xl border border-slate-700 overflow-hidden relative flex flex-col max-h-[90vh]" 
                onClick={e => e.stopPropagation()}
            >
                {/* --- HEADER --- */}
                <div className="p-8 bg-slate-950 border-b border-slate-800 flex justify-between items-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none"><Atom size={180} /></div>
                    
                    <div className="flex items-center gap-8 relative z-10">
                        <div className="relative group">
                            <div className="absolute -inset-4 bg-indigo-500/20 rounded-full blur-xl group-hover:bg-indigo-500/30 transition-all"></div>
                            <NumberBall number={inspectingNumber} size="xl" glow />
                            <div className="absolute -bottom-3 -right-3 bg-indigo-600 text-white text-[9px] font-black px-3 py-1 rounded-full border border-indigo-400 shadow-lg tracking-widest">
                                TARGET
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <ScanBarcode size={14} className="text-emerald-400 animate-pulse"/>
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em]">Signature Vectorielle</span>
                            </div>
                            <h3 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-none">Vecteur {inspectingNumber}</h3>
                            <p className="text-xs text-slate-500 font-mono mt-2">UUID: {crypto.randomUUID().split('-')[0]}</p>
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => { audioEngine.play('click'); setInspectingNumber(null); }} 
                        className="p-4 bg-white/5 hover:bg-white/10 rounded-full transition-colors relative z-10 border border-white/5 group"
                    >
                        <X size={24} className="text-slate-400 group-hover:text-white" />
                    </button>
                </div>

                {/* --- BODY --- */}
                <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar bg-gradient-to-b from-slate-900 to-slate-950">
                    {loading ? (
                        <div className="h-96 flex flex-col items-center justify-center gap-6 animate-pulse">
                            <div className="relative">
                                <div className="w-24 h-24 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
                                <Zap className="absolute inset-0 m-auto text-indigo-500" size={32} />
                            </div>
                            <span className="text-xs font-black text-slate-500 uppercase tracking-[0.4em]">Décodage ADN...</span>
                        </div>
                    ) : metrics && (
                        <>
                            {/* KPI HUD */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[
                                    { label: "Température", val: `${metrics.temperature}°`, icon: <Thermometer size={18} className="text-rose-500"/>, sub: "Chaleur relative" },
                                    { label: "Hurst Index", val: metrics.hurst.toFixed(2), icon: <Activity size={18} className="text-emerald-500"/>, sub: "Persistance" },
                                    { label: "Écart Actuel", val: `${metrics.lastGap}t`, icon: <Radio size={18} className="text-amber-500"/>, sub: "Depuis sortie" },
                                    { label: "Proba Sortie", val: `${metrics.nextProb}%`, icon: <Crosshair size={18} className="text-indigo-500"/>, sub: "Est. Poisson" }
                                ].map((kpi, i) => (
                                    <div key={i} className="p-6 bg-slate-800/50 rounded-[2rem] border border-slate-700/50 hover:bg-slate-800 transition-colors group">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="p-2 bg-slate-900 rounded-xl border border-slate-700 group-hover:border-slate-600 transition-colors">
                                                {kpi.icon}
                                            </div>
                                        </div>
                                        <div className="text-3xl font-black text-white tracking-tight">{kpi.val}</div>
                                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">{kpi.label}</div>
                                        <div className="text-[8px] text-slate-600 font-medium">{kpi.sub}</div>
                                    </div>
                                ))}
                            </div>

                            {/* WAVEFORM & GRAPH */}
                            <div className="grid lg:grid-cols-2 gap-6">
                                <div className="bg-slate-950 rounded-[2.5rem] border border-slate-800 p-6 relative overflow-hidden shadow-inner">
                                    <div className="flex justify-between items-center mb-6 relative z-10">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                                            <Waves size={14} className="text-indigo-400"/> Résonance Spectrale
                                        </h4>
                                        <span className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase border ${metrics.hurst > 0.5 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}>
                                            {metrics.hurst > 0.5 ? 'Signal Cohérent' : 'Signal Bruit'}
                                        </span>
                                    </div>
                                    <div className="h-40 w-full rounded-2xl overflow-hidden bg-black/20 border border-white/5">
                                        <SpectralWaveform energy={metrics.temperature} hurst={metrics.hurst} />
                                    </div>
                                </div>

                                <div className="bg-slate-950 rounded-[2.5rem] border border-slate-800 p-6 relative overflow-hidden shadow-inner">
                                    <div className="flex justify-between items-center mb-6 relative z-10">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                                            <TrendingUp size={14} className="text-emerald-400"/> Densité Temporelle
                                        </h4>
                                        <span className="text-[9px] text-slate-500 font-mono">20 derniers tirages</span>
                                    </div>
                                    <div className="h-40 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={chartData}>
                                                <defs>
                                                    <linearGradient id="colorGraph" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                                    </linearGradient>
                                                </defs>
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '10px' }}
                                                />
                                                <Area 
                                                    type="step" 
                                                    dataKey="value" 
                                                    stroke="#10b981" 
                                                    strokeWidth={2} 
                                                    fill="url(#colorGraph)" 
                                                    animationDuration={1000}
                                                />
                                                <XAxis hide />
                                                <YAxis hide domain={[0, 1.2]} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* SYNERGIES & ANTAGONISMES */}
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="bg-emerald-900/10 p-8 rounded-[2.5rem] border border-emerald-500/20 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-6 opacity-10"><GitMerge size={80} className="text-emerald-500"/></div>
                                    <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-2 relative z-10">
                                        <Network size={14}/> Synergies (Affinités)
                                    </h4>
                                    <div className="flex gap-3 flex-wrap relative z-10">
                                        {metrics.affinity.length > 0 ? metrics.affinity.map(n => (
                                            <NumberBall key={n} number={n} size="md" />
                                        )) : <span className="text-slate-500 text-xs italic">Aucune affinité forte détectée.</span>}
                                    </div>
                                </div>

                                <div className="bg-rose-900/10 p-8 rounded-[2.5rem] border border-rose-500/20 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-6 opacity-10"><ShieldAlert size={80} className="text-rose-500"/></div>
                                    <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-2 relative z-10">
                                        <X size={14}/> Némésis (Antagonismes)
                                    </h4>
                                    <div className="flex gap-3 flex-wrap relative z-10">
                                        {metrics.nemesis.length > 0 ? metrics.nemesis.map(n => (
                                            <NumberBall key={n} number={n} size="md" />
                                        )) : <span className="text-slate-500 text-xs italic">Aucun blocage détecté.</span>}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* --- FOOTER --- */}
                <div className="p-6 border-t border-slate-800 bg-slate-900 flex justify-center">
                    <p className="text-[10px] text-slate-500 font-mono text-center max-w-lg">
                        ANALYSE GÉNÉRÉE PAR NEXUS KERNEL V11.5. LES PROBABILITÉS SONT DES ESTIMATIONS STOCHASTIQUES ET NE GARANTISSENT PAS LE RÉSULTAT FUTUR.
                    </p>
                </div>
            </div>
        </div>
    );
};
