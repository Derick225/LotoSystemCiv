
import React, { useMemo, useState, useEffect } from 'react';
import { useNexus } from './NexusProvider';
import { calculateShannonEntropy, calculateACValue } from '../services/mathService';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { NumberBall } from './NumberBall';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Globe, Zap, Activity, Binary, Waves, ShieldCheck, Cpu, Network, ArrowRight, GitBranch, RotateCcw } from 'lucide-react';
import { ChaosAttractor3D } from './ChaosAttractor3D';

interface BounceCandidate {
    number: number;
    lift: number;
    localFreq: number;
    globalFreq: number;
    resonance: number;
}

export const QuantumLab: React.FC = () => {
    const { history, loading, drawName, stats, fractal, spectral, rlState } = useNexus();
    const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
    const [bounceCandidates, setBounceCandidates] = useState<BounceCandidate[]>([]);
    
    // Analyse des corrélations de rebond asynchrone
    useEffect(() => {
        if (!selectedNumber || history.length < 20) {
            setBounceCandidates([]);
            return;
        }

        const trigger = selectedNumber;
        const followingCounts: Record<number, number> = {};
        let triggerCount = 0;

        // On cherche les sorties immédiatement APRÈS le trigger dans l'histoire
        for (let i = 1; i < history.length; i++) {
            if (history[i].gagnants.includes(trigger)) {
                triggerCount++;
                const nextDraw = history[i-1]; // Tirage suivant chronologiquement
                if (nextDraw) {
                    nextDraw.gagnants.forEach(n => {
                        followingCounts[n] = (followingCounts[n] || 0) + 1;
                    });
                }
            }
        }

        if (triggerCount < 2) {
             setBounceCandidates([]);
             return;
        }

        const candidates: BounceCandidate[] = [];
        const totalDraws = history.length;

        for (let num = 1; num <= 90; num++) {
            if (num === trigger) continue;
            const localCount = followingCounts[num] || 0;
            const globalStat = stats.find(s => s.number === num);
            const globalCount = globalStat ? globalStat.count : 0;
            const specEnergy = spectral.find(s => s.number === num)?.energy || 0;
            
            const localProb = localCount / triggerCount;
            const globalProb = (globalCount || 1) / totalDraws;
            const lift = localProb / globalProb; 
            
            // Un lift > 1 signifie que le numéro sort PLUS souvent après le trigger qu'en temps normal
            if (lift > 1.4 && localCount >= 1) {
                candidates.push({ 
                    number: num, 
                    lift: parseFloat(lift.toFixed(2)), 
                    localFreq: localCount,
                    globalFreq: globalCount,
                    resonance: specEnergy
                });
            }
        }
        // Tri par lift (force du lien) pondéré par l'énergie spectrale (forme actuelle)
        setBounceCandidates(candidates.sort((a, b) => (b.lift * b.resonance) - (a.lift * a.resonance)).slice(0, 10));
    }, [selectedNumber, history, stats, spectral]);

    const labMetrics = useMemo(() => {
        if (history.length < 10) return { entropy: 0, stability: 0 };
        const ent = calculateShannonEntropy(history.slice(0, 50));
        return {
            entropy: Math.round(ent.normalized * 100),
            stability: rlState ? Math.round(rlState.streak * 10) : 50
        };
    }, [history, rlState]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-pulse">
            <Globe className="text-indigo-500 animate-spin" size={64} />
            <p className="text-xs font-black uppercase tracking-[0.4em] text-slate-400">Accès au Laboratoire Quantum...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-24">
            {/* Header Telemetry */}
            <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                    <ChaosAttractor3D history={history} spectralData={spectral || []} />
                </div>

                <div className="bg-slate-900 p-8 rounded-[3rem] border border-slate-800 flex flex-col justify-between shadow-xl">
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase mb-2">
                                <span>Cohérence IA</span>
                                <span className="text-indigo-400">{labMetrics.stability}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 shadow-[0_0_10px_#6366f1]" style={{ width: `${labMetrics.stability}%` }}></div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase mb-2">
                                <span>Entropie Locale</span>
                                <span className="text-emerald-400">{labMetrics.entropy}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 shadow-[0_0_10px_#10b981]" style={{ width: `${labMetrics.entropy}%` }}></div>
                            </div>
                        </div>
                    </div>
                    <div className="pt-6 border-t border-white/5 flex items-center gap-3">
                        <Cpu size={16} className="text-slate-500" />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Calculateur Sigma v13.2</span>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Grille Interactive */}
                <div className="lg:col-span-7 bg-white dark:bg-slate-900/40 p-6 rounded-[3rem] shadow-xl border border-slate-200 dark:border-slate-800">
                    <div className="flex justify-between items-center mb-6 px-2">
                        <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                            <Database size={14} className="text-indigo-600"/> Matrice Quantum-Shift
                        </h4>
                        <button onClick={() => setSelectedNumber(null)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400 hover:text-rose-500 transition shadow-sm"><RotateCcw size={14}/></button>
                    </div>

                    <div className="grid grid-cols-10 gap-2 sm:gap-3">
                        {Array.from({ length: 90 }, (_, i) => i + 1).map(n => {
                            const isSelected = selectedNumber === n;
                            const bounce = bounceCandidates.find(b => b.number === n);
                            
                            return (
                                <button
                                    key={n}
                                    onClick={() => setSelectedNumber(isSelected ? null : n)}
                                    className={`
                                        aspect-square rounded-xl flex items-center justify-center text-[10px] sm:text-xs font-black transition-all duration-300 relative group border
                                        ${isSelected 
                                            ? 'bg-indigo-600 text-white border-indigo-700 shadow-xl scale-110 z-20 ring-4 ring-indigo-50 dark:ring-indigo-900/50' 
                                            : bounce 
                                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 shadow-md z-10 hover:scale-105'
                                                : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                                        }
                                    `}
                                >
                                    {n}
                                    {bounce && <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span></span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-slate-900 p-8 rounded-[3rem] border border-slate-800 h-full flex flex-col shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl"></div>
                        <div className="flex items-center gap-3 mb-8 relative z-10">
                            <div className="p-3 bg-amber-500/20 rounded-2xl text-amber-500"><GitBranch size={20} /></div>
                            <div>
                                <h4 className="font-black text-white uppercase tracking-tight">Résonances de Rebond</h4>
                                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">{selectedNumber ? `Satellites du vecteur ${selectedNumber}` : 'En attente de signal'}</p>
                            </div>
                        </div>

                        {selectedNumber && bounceCandidates.length > 0 ? (
                            <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2 max-h-[500px] relative z-10">
                                {bounceCandidates.map((cand, i) => (
                                    <motion.div key={cand.number} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="bg-white/5 p-4 rounded-3xl border border-white/5 shadow-sm flex items-center justify-between group hover:border-amber-400 transition-all">
                                        <div className="flex items-center gap-4">
                                            <span className="text-[10px] font-black text-slate-600 w-4">#{i+1}</span>
                                            <NumberBall number={cand.number} size="md" />
                                            <div>
                                                <div className="text-xs font-black text-white">Lift {cand.lift}x</div>
                                                <div className="text-[9px] text-slate-500 font-bold uppercase">Corrélation Active</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-black text-amber-500">{Math.round(cand.resonance)}%</div>
                                            <div className="text-[8px] font-bold text-slate-600 uppercase">Énergie</div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 p-8 border-2 border-dashed border-slate-700 rounded-[2rem]">
                                <Network size={48} className="text-slate-600 mb-4" />
                                <p className="text-xs font-bold text-slate-500 uppercase leading-relaxed max-w-[200px]">{selectedNumber ? "Aucun rebond stochastique isolé." : "Cliquez sur un vecteur dans la matrice pour voir ses dépendances."}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
