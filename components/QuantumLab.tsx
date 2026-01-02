import React, { useMemo, useState, useEffect } from 'react';
import { useNexus } from './NexusProvider';
import { calculateShannonEntropy, calculateFractalIndex } from '../services/mathService';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Radar, RadarChart, PolarGrid, PolarAngleAxis } from 'recharts';
import { NumberBall } from './NumberBall';
import { Database, Globe, Zap, Activity, Binary, Waves, ShieldCheck, Cpu } from 'lucide-react';
import { motion } from 'framer-motion';

export const QuantumLab: React.FC = () => {
    const { history: localHistory, loading } = useNexus();
    const [pulse, setPulse] = useState(0);

    // Animation du "Neural Pulse"
    useEffect(() => {
        const interval = setInterval(() => setPulse(p => (p + 1) % 100), 100);
        return () => clearInterval(interval);
    }, []);

    const analysis = useMemo(() => {
        if (!localHistory.length) return null;
        const matrix: Record<number, number> = {};
        const sums: number[] = [];
        
        localHistory.slice(0, 100).forEach(draw => {
            draw.gagnants.forEach(n => matrix[n] = (matrix[n] || 0) + 1);
            sums.push(draw.gagnants.reduce((a, b) => a + b, 0));
        });

        const entropy = calculateShannonEntropy(localHistory);
        const hurst = calculateFractalIndex(localHistory);

        return {
            matrix,
            globalEntropy: Math.round(entropy.normalized * 100),
            fractality: hurst,
            avgSigma: Math.round(sums.reduce((a, b) => a + b, 0) / sums.length),
            trend: sums.map((s, i) => ({ i, s })).reverse()
        };
    }, [localHistory]);

    if (loading) return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6">
            <div className="w-24 h-24 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
            <p className="text-xs font-black uppercase tracking-[0.5em] text-indigo-500 animate-pulse">Initialisation Tensor Lab...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-24">
            <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3.5rem] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-600/5 rounded-full blur-[140px] -mr-48 -mt-48"></div>
                
                <div className="relative z-10 grid lg:grid-cols-2 gap-12 items-center">
                    <div>
                        <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-full border border-indigo-500/20 mb-8">
                            <Cpu className="w-4 h-4" /> Global Market Intelligence Node
                        </div>
                        <h2 className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-none mb-6">
                            Quantum <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Lab Global</span>
                        </h2>
                        <p className="text-slate-400 text-lg font-medium leading-relaxed max-w-xl">
                            Agrégation stochastique multi-marchés. Détection de la résonance inter-tirages et monitoring de l'entropie systémique en temps réel.
                        </p>
                    </div>

                    <div className="bg-black/40 backdrop-blur-3xl p-10 rounded-[4rem] border border-white/5 shadow-inner flex flex-col items-center">
                         <div className="relative w-40 h-40 flex items-center justify-center mb-6">
                            <motion.div 
                                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                                transition={{ repeat: Infinity, duration: 2 }}
                                className="absolute inset-0 bg-indigo-500/20 rounded-full blur-2xl"
                            />
                            <Globe size={80} className="text-indigo-400 relative z-10" />
                         </div>
                         <div className="text-center">
                            <div className="text-5xl font-black text-white font-mono">{analysis?.globalEntropy}%</div>
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mt-2">Désordre Systémique</div>
                         </div>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-xl relative overflow-hidden group">
                    <div className="flex justify-between items-center mb-10">
                        <h3 className="text-xl font-black text-white flex items-center gap-4">
                            <Waves className="text-indigo-500" /> Flux Tensoriel de Masse
                        </h3>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <ShieldCheck size={14} className="text-emerald-500" />
                                <span className="text-[9px] font-black text-slate-500 uppercase">Données Vérifiées</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={analysis?.trend}>
                                <defs>
                                    <linearGradient id="colorSigma" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="i" hide />
                                <YAxis hide domain={['dataMin - 20', 'dataMax + 20']} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }}
                                    formatter={(v: any) => [`Somme Σ: ${v}`, 'Intensité']}
                                />
                                <Area type="monotone" dataKey="s" stroke="#6366f1" strokeWidth={4} fill="url(#colorSigma)" animationDuration={2000} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                    
                    <div className="mt-8 grid grid-cols-3 gap-6 pt-8 border-t border-white/5">
                        <div>
                            <div className="text-[9px] font-black text-slate-500 uppercase mb-1">Moyenne Sigma</div>
                            <div className="text-2xl font-black text-white">{analysis?.avgSigma} F</div>
                        </div>
                        <div>
                            <div className="text-[9px] font-black text-slate-500 uppercase mb-1">Hurst Global</div>
                            <div className="text-2xl font-black text-emerald-400">{analysis?.fractality.toFixed(3)}</div>
                        </div>
                        <div>
                            <div className="text-[9px] font-black text-slate-500 uppercase mb-1">Sync Latency</div>
                            <div className="text-2xl font-black text-indigo-400">12ms</div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 h-full flex flex-col items-center justify-center">
                        <h4 className="text-sm font-black text-slate-800 dark:text-white mb-8 uppercase tracking-widest flex items-center gap-3">
                            <Activity size={18} className="text-rose-500" /> Signature de Risque
                        </h4>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
                                    { subject: 'Entropie', A: analysis?.globalEntropy, fullMark: 100 },
                                    { subject: 'Volatilité', A: 45, fullMark: 100 },
                                    { subject: 'Fractalité', A: (analysis?.fractality || 0.5) * 100, fullMark: 100 },
                                    { subject: 'Résonance', A: 78, fullMark: 100 },
                                    { subject: 'Sync', A: 92, fullMark: 100 },
                                ]}>
                                    <PolarGrid stroke="#e2e8f0" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} />
                                    <Radar name="Risque" dataKey="A" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.5} strokeWidth={2} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
