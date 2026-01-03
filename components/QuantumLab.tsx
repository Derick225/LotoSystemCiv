import React, { useMemo, useState, useEffect } from 'react';
import { useNexus } from './NexusProvider';
import { calculateShannonEntropy, calculateFractalIndex } from '../services/mathService';
import { fetchAssociatedNumbers } from '../services/lotteryService';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Radar, RadarChart, PolarGrid, PolarAngleAxis } from 'recharts';
import { NumberBall } from './NumberBall';
import { Database, Globe, Zap, Activity, Binary, Waves, ShieldCheck, Cpu, Network, ArrowRight, GitBranch } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const QuantumLab: React.FC = () => {
    const { history: localHistory, loading, drawName } = useNexus();
    const [pulse, setPulse] = useState(0);
    
    // États pour l'analyse des associations
    const [selectedVector, setSelectedVector] = useState<number | null>(null);
    const [linkedVectors, setLinkedVectors] = useState<{ number: number; count: number }[]>([]);
    const [isLoadingLinks, setIsLoadingLinks] = useState(false);

    // Animation du "Neural Pulse"
    useEffect(() => {
        const interval = setInterval(() => setPulse(p => (p + 1) % 100), 100);
        return () => clearInterval(interval);
    }, []);

    // Gestion du clic sur un numéro pour voir ses associations
    const handleVectorSelect = async (num: number) => {
        setSelectedVector(num);
        setIsLoadingLinks(true);
        try {
            // Utilisation du service existant pour récupérer les associations historiques (T -> T+1)
            const data = await fetchAssociatedNumbers(num, drawName, localHistory);
            setLinkedVectors(data.following);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingLinks(false);
        }
    };

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

        // Max frequency for normalization
        const maxFreq = Math.max(...Object.values(matrix));

        return {
            matrix,
            maxFreq,
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

            {/* NOUVELLE SECTION : MATRICE D'INTRICATION QUANTIQUE */}
            <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3.5rem] shadow-2xl overflow-hidden relative">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 relative z-10">
                    <div>
                        <h3 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-4">
                            <Network size={32} className="text-indigo-500" /> Matrice d'Intrication
                        </h3>
                        <p className="text-slate-400 text-sm mt-2 font-medium">
                            Sélectionnez un vecteur source pour révéler sa résonance historique (Probabilité T+1).
                        </p>
                    </div>
                    <div className="flex items-center gap-3 bg-black/40 px-5 py-2 rounded-2xl border border-white/5">
                        <Binary size={16} className="text-emerald-400" />
                        <span className="text-[10px] font-black uppercase text-slate-300 tracking-widest">
                            {selectedVector ? `Cible: N°${selectedVector}` : 'En attente de sélection'}
                        </span>
                    </div>
                </div>

                <div className="grid lg:grid-cols-2 gap-12 relative z-10">
                    {/* Grille de sélection */}
                    <div className="bg-black/20 p-6 rounded-[2.5rem] border border-white/5">
                        <div className="grid grid-cols-10 gap-2">
                            {Array.from({length: 90}, (_, i) => i + 1).map(n => {
                                const freq = analysis?.matrix[n] || 0;
                                const intensity = analysis?.maxFreq ? freq / analysis.maxFreq : 0;
                                const isSelected = selectedVector === n;
                                
                                return (
                                    <button
                                        key={n}
                                        onClick={() => handleVectorSelect(n)}
                                        className={`
                                            aspect-square rounded-lg flex items-center justify-center text-[10px] font-black transition-all duration-300 relative
                                            ${isSelected 
                                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/50 scale-110 z-10 ring-2 ring-white' 
                                                : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-white hover:scale-105'
                                            }
                                        `}
                                        style={{
                                            backgroundColor: !isSelected ? `rgba(99, 102, 241, ${0.1 + intensity * 0.4})` : undefined
                                        }}
                                    >
                                        {n}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Panneau de résultats */}
                    <div className="flex flex-col justify-center">
                        <AnimatePresence mode="wait">
                            {selectedVector ? (
                                <motion.div 
                                    key={selectedVector}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="bg-indigo-900/10 border border-indigo-500/20 p-8 rounded-[3rem] h-full flex flex-col relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-8 opacity-10">
                                        <GitBranch size={120} className="text-indigo-400" />
                                    </div>

                                    <div className="flex items-center gap-6 mb-8 relative z-10">
                                        <NumberBall number={selectedVector} size="lg" isAttractor={true} />
                                        <ArrowRight size={24} className="text-slate-500" />
                                        <div>
                                            <h4 className="text-xl font-black text-white">Vecteurs Associés</h4>
                                            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                                                Top 10 sortis après le {selectedVector}
                                            </p>
                                        </div>
                                    </div>

                                    {isLoadingLinks ? (
                                        <div className="flex-1 flex items-center justify-center">
                                            <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3 relative z-10">
                                            {linkedVectors.length > 0 ? linkedVectors.slice(0, 10).map((link, idx) => (
                                                <div key={link.number} className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/50 border border-white/5 hover:border-indigo-500/30 transition-colors group">
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-[10px] font-black text-slate-500 w-4">#{idx+1}</span>
                                                        <NumberBall number={link.number} size="sm" />
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-1.5 w-24 bg-slate-800 rounded-full overflow-hidden">
                                                            <div 
                                                                className="h-full bg-emerald-500 group-hover:bg-emerald-400 transition-colors" 
                                                                style={{ width: `${Math.min(100, (link.count / linkedVectors[0].count) * 100)}%` }}
                                                            ></div>
                                                        </div>
                                                        <span className="text-xs font-black text-white w-8 text-right">{link.count}x</span>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="text-center text-slate-500 italic py-10">Aucune donnée de suite disponible.</div>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-40 p-10 border-2 border-dashed border-slate-800 rounded-[3rem]">
                                    <Zap size={64} className="text-slate-500 mb-6" />
                                    <h4 className="text-xl font-black text-white uppercase">En attente de signal</h4>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2 max-w-xs">
                                        Cliquez sur un numéro dans la matrice pour révéler ses intrications quantiques.
                                    </p>
                                </div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
};