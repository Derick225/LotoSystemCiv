
import React, { useMemo, useState, useEffect } from 'react';
import { useNexus } from './NexusProvider';
import { calculateShannonEntropy, calculateFractalIndex } from '../services/mathService';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Radar, RadarChart, PolarGrid, PolarAngleAxis, BarChart, Bar, Cell } from 'recharts';
import { NumberBall } from './NumberBall';
import { Database, Globe, Zap, Activity, Binary, Waves, ShieldCheck, Cpu, Network, ArrowRight, GitBranch, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface BounceCandidate {
    number: number;
    lift: number;
    localFreq: number;
    globalFreq: number;
}

export const QuantumLab: React.FC = () => {
    const { history, loading, drawName, stats, fractal } = useNexus();
    const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
    const [bounceCandidates, setBounceCandidates] = useState<BounceCandidate[]>([]);
    
    useEffect(() => {
        if (!selectedNumber || history.length < 20) {
            setBounceCandidates([]);
            return;
        }

        const trigger = selectedNumber;
        const followingCounts: Record<number, number> = {};
        let triggerCount = 0;

        for (let i = 1; i < history.length; i++) {
            if (history[i].gagnants.includes(trigger)) {
                triggerCount++;
                const nextDraw = history[i-1];
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
            if (localCount === 0) continue;
            const globalStat = stats.find(s => s.number === num);
            const globalCount = globalStat ? globalStat.count : 0;
            const localProb = localCount / triggerCount;
            const globalProb = (globalCount || 1) / totalDraws;
            const lift = localProb / globalProb; 
            
            if (lift > 1.8 && localCount >= 1) {
                candidates.push({ 
                    number: num, 
                    lift: parseFloat(lift.toFixed(2)), 
                    localFreq: localCount,
                    globalFreq: globalCount
                });
            }
        }
        setBounceCandidates(candidates.sort((a, b) => b.lift - a.lift).slice(0, 10));
    }, [selectedNumber, history, stats]);

    const selectedMetrics = useMemo(() => {
        if (!selectedNumber) return null;
        const stat = stats.find(s => s.number === selectedNumber);
        const frac = fractal.find(f => f.number === selectedNumber);
        return {
            freq: stat ? stat.count : 0,
            hurst: frac ? frac.hurst : 0.5,
            regime: frac ? frac.regime : 'Inconnu'
        };
    }, [selectedNumber, stats, fractal]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-pulse">
            <Globe className="text-indigo-500 animate-spin" size={64} />
            <p className="text-xs font-black uppercase tracking-[0.4em] text-slate-400">Initialisation Quantum Lab...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-24">
            <div className="bg-slate-950 p-8 rounded-[3rem] border border-indigo-500/20 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] -mr-32 -mt-32"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
                                <Activity size={20} className="text-indigo-400" />
                            </div>
                            <h3 className="text-sm font-mono font-bold tracking-[0.2em] text-indigo-300 uppercase">Analyse Causale</h3>
                        </div>
                        <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-none">
                            Vecteurs de <span className="text-amber-500">Rebond</span>
                        </h2>
                        <p className="text-slate-400 text-xs md:text-sm font-medium mt-4 max-w-xl leading-relaxed border-l-2 border-amber-500/30 pl-4">
                            L'analyse fractal identifie les numéros qui réagissent positivement à la sortie du vecteur sélectionné.
                        </p>
                    </div>
                    
                    {selectedNumber ? (
                        <div className="bg-black/40 backdrop-blur-md p-6 rounded-3xl border border-white/10 min-w-[200px] text-center animate-slide-up">
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Vecteur Source</div>
                            <div className="flex justify-center mb-2"><NumberBall number={selectedNumber} size="lg" selected /></div>
                            <div className="text-[9px] font-mono text-slate-300">Hurst: <span className="text-white font-bold">{selectedMetrics?.hurst.toFixed(2)}</span></div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-6 opacity-50">
                            <Binary size={48} className="text-slate-600 mb-2" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase text-center">Sélectionnez une base</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Grille Interactive - FOND BLANC ÉLITE */}
                <div className="lg:col-span-7 bg-white p-6 rounded-[3rem] shadow-xl border border-slate-200">
                    <div className="flex justify-between items-center mb-6 px-2">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            <Database size={14} className="text-indigo-600"/> Matrice Quantum-Shift
                        </h4>
                        <button onClick={() => setSelectedNumber(null)} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-rose-500 transition shadow-sm"><RotateCcw size={14}/></button>
                    </div>

                    <div className="grid grid-cols-10 gap-2 sm:gap-3 bg-slate-50/50 p-4 rounded-[2rem] border border-slate-100">
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
                                            ? 'bg-indigo-600 text-white border-indigo-700 shadow-xl scale-110 z-20 ring-4 ring-indigo-50' 
                                            : bounce 
                                                ? 'bg-amber-100 text-amber-700 border-amber-300 shadow-md z-10 hover:scale-105'
                                                : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-slate-600'
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
                                <h4 className="font-black text-white uppercase tracking-tight">Potentiels de Rebond</h4>
                                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">{selectedNumber ? `Inférence après N°${selectedNumber}` : 'En attente de signal source'}</p>
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
                                                <div className="text-xs font-black text-white">Ratio {cand.lift}x</div>
                                                <div className="text-[9px] text-slate-500 font-bold uppercase">Signal Fort</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-black text-amber-500">{Math.round(cand.lift * 10)}</div>
                                            <div className="text-[8px] font-bold text-slate-600 uppercase">Score L-1</div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 p-8 border-2 border-dashed border-slate-700 rounded-[2rem]">
                                <Network size={48} className="text-slate-600 mb-4" />
                                <p className="text-xs font-bold text-slate-500 uppercase leading-relaxed max-w-[200px]">{selectedNumber ? "Aucun rebond statistique isolé." : "Choisissez un point d'ancrage dans la matrice blanche."}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
