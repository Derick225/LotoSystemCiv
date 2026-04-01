
import React, { useState, useEffect, useRef } from 'react';
import { getCyclicCandidates, type CyclicCandidate } from '../../services/temporalAnalysisService';
import { fetchAssociatedNumbers } from '../../services/lotteryService';
import { NumberBall } from '../NumberBall';
import { useNexusStore } from '../../store/useNexusStore';
import { Clock, Calendar, Sparkles, RotateCw, Link, ArrowRight, Activity, Hourglass } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, Cell, YAxis } from 'recharts';
import { motion } from 'framer-motion';
import { audioEngine } from '../../utils/audioEngine';

interface DependencyFlow {
    source: number;
    targets: { number: number; count: number }[];
}

export const TemporalTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const history = useNexusStore(state => state.history);
    const regularity = useNexusStore(state => state.regularity);
    const nexusLoading = useNexusStore(state => state.loading);
    const [cyclicData, setCyclicData] = useState<CyclicCandidate[]>([]);
    const [dependencies, setDependencies] = useState<DependencyFlow[]>([]);
    const [loadingDeps, setLoadingDeps] = useState(false);
    
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        const load = async () => {
            if (history.length > 10) {
                // 1. Cycles
                const cycles = await getCyclicCandidates(drawName, history);
                if (isMounted.current) setCyclicData(cycles.slice(0, 6));

                // 2. Dépendances (T-1 -> T)
                setLoadingDeps(true);
                const lastWinners = history[0].gagnants;
                const deps: DependencyFlow[] = [];
                
                await Promise.all(lastWinners.map(async (sourceNum) => {
                    const assoc = await fetchAssociatedNumbers(sourceNum, drawName, history);
                    if (assoc.following.length > 0) {
                        deps.push({
                            source: sourceNum,
                            targets: assoc.following.slice(0, 3)
                        });
                    }
                }));
                
                if (isMounted.current) {
                    setDependencies(deps.sort((a, b) => a.source - b.source));
                    setLoadingDeps(false);
                }
            }
        };
        load();
        return () => { isMounted.current = false; };
    }, [drawName, history, regularity]);

    if (nexusLoading) return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
            <Hourglass className="text-amber-500 animate-spin" size={48} />
            <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Synchronisation Temporelle...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-20 w-full overflow-hidden">
            
            {/* HERO SECTION: HORLOGES CYCLIQUES */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-8 rounded-[3rem] shadow-2xl border border-slate-800 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:rotate-12 transition-transform duration-1000"><RotateCw size={180} /></div>
                
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-3 bg-amber-500/20 rounded-2xl text-amber-500 border border-amber-500/30">
                            <Hourglass size={24} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Horloges Cycliques</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Détection de périodicité (Auto-Corrélation)</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {cyclicData.map((c, idx) => (
                            <motion.div 
                                key={c.number}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className={`p-6 rounded-[2rem] border relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300 ${c.nextDateEstimate === 'CRITIQUE' ? 'bg-amber-950/30 border-amber-500/30' : 'bg-white/5 border-white/5'}`}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <NumberBall number={c.number} size="md" glow={c.nextDateEstimate === 'CRITIQUE'} />
                                    <div className="text-right">
                                        <div className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border ${c.nextDateEstimate === 'CRITIQUE' ? 'text-amber-500 border-amber-500/30 bg-amber-500/10 animate-pulse' : 'text-slate-500 border-slate-700'}`}>
                                            {c.nextDateEstimate}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Écart Actuel</span>
                                        <span className="text-white font-mono font-black">{c.gap} <span className="text-slate-600">/ {Math.round(c.avg)} moy</span></span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-1000 ${c.nextDateEstimate === 'CRITIQUE' ? 'bg-amber-500' : 'bg-indigo-500'}`}
                                            style={{ width: `${Math.min(100, (c.gap / c.avg) * 100)}%` }}
                                        ></div>
                                    </div>
                                    <div className="text-[9px] text-slate-500 font-mono text-right">
                                        Précision cycle: {Math.round(c.score)}% (σ ±{c.stdDev.toFixed(1)})
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>

            {/* FLUX DE CAUSALITÉ */}
            <div className="grid lg:grid-cols-12 gap-8">
                
                {/* CAUSAL FLOW */}
                <div className="lg:col-span-12 bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-8 relative z-10">
                        <div>
                            <h4 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-3">
                                <Link className="text-indigo-600" size={20} /> Flux de Causalité
                            </h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">Impact vectoriel T-1 ➔ T</p>
                        </div>
                    </div>

                    <div className="space-y-4 relative z-10">
                        {loadingDeps ? (
                            <div className="py-20 text-center animate-pulse text-slate-400 font-bold text-[10px] uppercase tracking-widest">Calcul des vecteurs...</div>
                        ) : dependencies.map((dep, i) => (
                            <motion.div 
                                key={dep.source}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex items-center gap-4 p-4 rounded-[2rem] bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group"
                            >
                                {/* Source */}
                                <div className="flex flex-col items-center gap-1 min-w-[50px]">
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Source</span>
                                    <NumberBall number={dep.source} size="md" />
                                </div>

                                {/* Arrow */}
                                <div className="flex-1 flex items-center justify-center text-slate-300 relative">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent group-hover:via-indigo-500 transition-all"></div>
                                    </div>
                                    <ArrowRight size={16} className="bg-white dark:bg-slate-800 rounded-full relative z-10 text-indigo-500" />
                                </div>

                                {/* Targets */}
                                <div className="flex gap-2">
                                    {dep.targets.map((tgt, j) => (
                                        <div key={tgt.number} className="flex flex-col items-center gap-1 group/target">
                                            <span className="text-[7px] font-bold text-indigo-400 opacity-0 group-hover/target:opacity-100 transition-opacity">x{tgt.count}</span>
                                            <NumberBall number={tgt.number} size="sm" />
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                    
                    {/* Background decoration */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 dark:bg-indigo-900/10 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none"></div>
                </div>
            </div>
        </div>
    );
};
