
import React, { useMemo, useState, useEffect } from 'react';
import { useNexus } from './NexusProvider';
import { calculateShannonEntropy, calculateFractalIndex } from '../services/mathService';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Radar, RadarChart, PolarGrid, PolarAngleAxis, BarChart, Bar, Cell } from 'recharts';
import { NumberBall } from './NumberBall';
import { Database, Globe, Zap, Activity, Binary, Waves, ShieldCheck, Cpu, Network, ArrowRight, GitBranch, RotateCcw, atom } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface BounceCandidate {
    number: number;
    lift: number;
    localFreq: number;
    globalFreq: number;
}

export const QuantumLab: React.FC = () => {
    const { history, loading, drawName, stats, fractal } = useNexus();
    
    // État de sélection
    const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
    const [bounceCandidates, setBounceCandidates] = useState<BounceCandidate[]>([]);
    
    // Calcul des Rebonds Fractals
    useEffect(() => {
        if (!selectedNumber || history.length < 20) {
            setBounceCandidates([]);
            return;
        }

        const trigger = selectedNumber;
        const followingCounts: Record<number, number> = {};
        let triggerCount = 0;

        // Analyse de la causalité temporelle (T+1 après chaque apparition de T)
        // history est trié du plus récent au plus ancien (index 0 = dernier tirage)
        // Si history[i] contient le trigger, alors history[i-1] est le tirage SUIVANT (futur immédiat)
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
            
            // Probabilités
            const localProb = localCount / triggerCount;
            const globalProb = (globalCount || 1) / totalDraws;
            
            // Lift = Ratio de probabilité conditionnelle
            // Un Lift > 1.0 indique une attraction positive
            const lift = localProb / globalProb; 
            
            // Filtre "Rebond" : On cherche des numéros qui "surgissent" spécifiquement après le trigger
            // On privilégie un Lift élevé (> 1.5) et on s'assure d'une fréquence locale minimale
            if (lift > 1.8 && localCount >= 1) {
                candidates.push({ 
                    number: num, 
                    lift: parseFloat(lift.toFixed(2)), 
                    localFreq: localCount,
                    globalFreq: globalCount
                });
            }
        }

        // Tri par Lift décroissant (Force du rebond)
        setBounceCandidates(candidates.sort((a, b) => b.lift - a.lift).slice(0, 10));

    }, [selectedNumber, history, stats]);

    // Métriques du numéro sélectionné
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
            
            {/* Header Lab */}
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
                            Sélectionnez un numéro dans la grille pour révéler ses connexions cachées. 
                            Le "Rebond Fractal" identifie les numéros qui réagissent positivement à la sortie du vecteur sélectionné.
                        </p>
                    </div>
                    
                    {selectedNumber ? (
                        <div className="bg-black/40 backdrop-blur-md p-6 rounded-3xl border border-white/10 min-w-[200px] text-center animate-slide-up">
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Vecteur Source</div>
                            <div className="flex justify-center mb-2">
                                <NumberBall number={selectedNumber} size="lg" selected />
                            </div>
                            <div className="text-[9px] font-mono text-slate-300">
                                Hurst: <span className="text-white font-bold">{selectedMetrics?.hurst.toFixed(2)}</span>
                            </div>
                            <div className="text-[8px] font-bold text-indigo-400 uppercase mt-1">
                                {selectedMetrics?.regime}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-6 opacity-50">
                            <Binary size={48} className="text-slate-600 mb-2" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase">En attente de sélection</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                
                {/* Grille Interactive */}
                <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-6 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center mb-6 px-2">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Database size={14}/> Matrice de Sélection
                        </h4>
                        <button 
                            onClick={() => setSelectedNumber(null)} 
                            className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400 hover:text-rose-500 transition"
                            title="Reset"
                        >
                            <RotateCcw size={14}/>
                        </button>
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
                                        aspect-square rounded-xl flex items-center justify-center text-[10px] sm:text-xs font-black transition-all duration-300 relative group
                                        ${isSelected 
                                            ? 'bg-indigo-600 text-white shadow-lg scale-110 z-20 ring-4 ring-indigo-200 dark:ring-indigo-900' 
                                            : bounce 
                                                ? 'bg-amber-500/10 text-amber-500 border-2 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)] z-10 hover:scale-105'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200'
                                        }
                                    `}
                                >
                                    {n}
                                    {bounce && (
                                        <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Panneau Latéral : Analyse des Rebonds */}
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-8 rounded-[3rem] border border-slate-200 dark:border-slate-800 h-full flex flex-col">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-2xl text-amber-600 dark:text-amber-400">
                                <GitBranch size={20} />
                            </div>
                            <div>
                                <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">Opportunités de Rebond</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                                    {selectedNumber ? `Basé sur les sorties de ${selectedNumber}` : 'Sélectionnez un numéro'}
                                </p>
                            </div>
                        </div>

                        {selectedNumber && bounceCandidates.length > 0 ? (
                            <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2 max-h-[500px]">
                                {bounceCandidates.map((cand, i) => (
                                    <motion.div 
                                        key={cand.number}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className="bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-between group hover:border-amber-400 transition-all"
                                    >
                                        <div className="flex items-center gap-4">
                                            <span className="text-[10px] font-black text-slate-400 w-4">#{i+1}</span>
                                            <NumberBall number={cand.number} size="md" />
                                            <div>
                                                <div className="text-xs font-black text-slate-700 dark:text-slate-200">Rebond {cand.lift}x</div>
                                                <div className="text-[9px] text-slate-400 font-medium">Freq. Globale: {cand.globalFreq}</div>
                                            </div>
                                        </div>
                                        
                                        <div className="text-right">
                                            <div className="text-lg font-black text-amber-500">{Math.round(cand.lift * 10)} pts</div>
                                            <div className="h-1 w-12 bg-slate-200 dark:bg-slate-700 rounded-full ml-auto mt-1 overflow-hidden">
                                                <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, cand.lift * 20)}%` }}></div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-[2rem]">
                                <Network size={48} className="text-slate-400 mb-4" />
                                <p className="text-xs font-bold text-slate-500 uppercase leading-relaxed max-w-[200px]">
                                    {selectedNumber 
                                        ? "Aucun rebond significatif détecté pour ce vecteur." 
                                        : "L'analyse fractal nécessite un point d'ancrage."}
                                </p>
                            </div>
                        )}

                        {selectedNumber && bounceCandidates.length > 0 && (
                            <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-200 dark:border-amber-800/30 flex gap-3">
                                <Zap size={16} className="text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-amber-800 dark:text-amber-200 font-medium leading-relaxed italic">
                                    "Ces numéros apparaissent {bounceCandidates[0].lift} fois plus souvent après le {selectedNumber} que la normale. C'est une signature de causalité forte."
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
