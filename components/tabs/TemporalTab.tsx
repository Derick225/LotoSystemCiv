
import React, { useState, useEffect, useRef } from 'react';
import { getSeasonalAffinity, getDayAffinity, type CyclicCandidate } from '../../services/temporalAnalysisService';
import { fetchAssociatedNumbers } from '../../services/lotteryService';
import { NumberBall } from '../NumberBall';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip } from 'recharts';
import { useNexus } from '../NexusProvider';
import { Clock, Calendar, Sparkles, TrendingUp, Activity, RotateCw, Binary, ArrowRight, Link, Hourglass } from 'lucide-react';
import type { NumberRegularity } from '../../types';

interface TemporalTabProps {
    drawName: string;
}

interface DependencyFlow {
    source: number;
    targets: { number: number; count: number }[];
}

export const TemporalTab: React.FC<TemporalTabProps> = ({ drawName }) => {
    const { history, regularity, loading: nexusLoading } = useNexus();
    const [seasonalData, setSeasonalData] = useState<{ monthIndex: number, topNumbers: any[] } | null>(null);
    const [cyclicData, setCyclicData] = useState<CyclicCandidate[]>([]);
    const [dayData, setDayData] = useState<any[]>([]);
    const [rhythms, setRhythms] = useState<Record<number, boolean[]>>({});
    const [dependencies, setDependencies] = useState<DependencyFlow[]>([]);
    const [loadingDeps, setLoadingDeps] = useState(false);
    const isMounted = useRef(true);

    const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    useEffect(() => {
        const load = async () => {
            if (history.length > 0) {
                try {
                    // 1. Saisonnalité
                    const seasonal = getSeasonalAffinity(history);
                    if (isMounted.current) setSeasonalData(seasonal);

                    // 2. Cycles & Horloges
                    const cycles: CyclicCandidate[] = [];
                    regularity.forEach((reg: NumberRegularity) => {
                        if (reg.stdDev < 5.0 && reg.lastGaps.length >= 2) {
                            const diff = Math.abs(reg.currentGap - reg.avgGap);
                            // On élargit légèrement la fenêtre pour capturer plus de cycles potentiels
                            if (diff <= 4.0 || (reg.currentGap > reg.avgGap && reg.currentGap < reg.avgGap * 1.8)) {
                                const precisionScore = (10 - Math.min(10, reg.stdDev)) * 8; 
                                const imminenceScore = (5 - Math.min(5, diff)) * 12;
                                const stabilityBonus = (1 / (Math.abs(reg.lastGaps[0] - (reg.lastGaps[1] || 0)) + 1)) * 20;
                                const pressure = Math.min(100, (reg.currentGap / (reg.avgGap || 1)) * 100);

                                cycles.push({
                                    number: reg.number,
                                    score: precisionScore + imminenceScore + stabilityBonus + (pressure * 0.2),
                                    gap: reg.currentGap,
                                    avg: reg.avgGap,
                                    stdDev: reg.stdDev,
                                    historyStr: reg.lastGaps.map((g: number) => g.toString()).join('-'),
                                    nextDateEstimate: pressure > 100 ? "CRITIQUE" : pressure > 80 ? "Imminent" : "Attente"
                                });
                            }
                        }
                    });
                    if (isMounted.current) {
                        setCyclicData(cycles.sort((a,b) => b.score - a.score).slice(0, 8));
                    }

                    // 3. Jour de la semaine
                    const dayStats = getDayAffinity(history, drawName);
                    if (isMounted.current) setDayData(dayStats.slice(0, 10));

                    // 4. Rythmes Binaires
                    const recentHistory = history.slice(0, 20); 
                    const rhythmMap: Record<number, boolean[]> = {};
                    cycles.slice(0, 6).forEach(c => {
                        rhythmMap[c.number] = recentHistory.map(draw => draw.gagnants.includes(c.number));
                    });
                    if (isMounted.current) setRhythms(rhythmMap);

                    // 5. Dépendances (T-1 -> T)
                    if (history.length > 1) {
                        setLoadingDeps(true);
                        const lastDraw = history[0].gagnants;
                        const deps: DependencyFlow[] = [];
                        
                        await Promise.all(lastDraw.map(async (sourceNum) => {
                            const assoc = await fetchAssociatedNumbers(sourceNum, drawName, history);
                            if (assoc.following.length > 0) {
                                deps.push({
                                    source: sourceNum,
                                    targets: assoc.following.slice(0, 3) // Top 3 suiveurs
                                });
                            }
                        }));
                        
                        if (isMounted.current) {
                            setDependencies(deps.sort((a, b) => a.source - b.source));
                            setLoadingDeps(false);
                        }
                    }

                } catch (e) {
                    console.error("Temporal Tab Error:", e);
                }
            }
        };
        load();
    }, [drawName, history, regularity]);

    if (nexusLoading || history.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-6 bg-slate-900/5 rounded-[3.5rem] border border-dashed border-indigo-200">
                <div className="relative">
                    <Clock className="animate-spin text-indigo-500" size={48} />
                    <div className="absolute inset-0 flex items-center justify-center"><div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div></div>
                </div>
                <p className="font-black text-indigo-500 text-xs font-mono uppercase tracking-[0.4em] animate-pulse">Synchronisation Temporelle...</p>
            </div>
        );
    }

    return (
        <div className="space-y-10 animate-fade-in pb-20 w-full overflow-hidden">
            
            {/* 1. Matrice de Dépendance (Nouveau) */}
            <div className="bg-white dark:bg-slate-800 p-8 rounded-[3.5rem] shadow-xl border border-indigo-100 dark:border-indigo-900/50">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl text-indigo-600 dark:text-indigo-400">
                        <Link size={20} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Matrice de Dépendance (T-1 ➜ T)</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Quels numéros appellent les autres ?</p>
                    </div>
                </div>

                {loadingDeps ? (
                    <div className="flex items-center justify-center py-10 gap-3 text-slate-400 font-black text-xs uppercase animate-pulse">
                        <Activity size={16}/> Calcul des corrélations...
                    </div>
                ) : (
                    <div className="space-y-6 overflow-x-auto pb-4 custom-scrollbar">
                        {dependencies.map((dep) => (
                            <div key={dep.source} className="flex items-center gap-4 min-w-max p-2 hover:bg-slate-50 dark:hover:bg-slate-900/50 rounded-2xl transition-colors">
                                <div className="flex flex-col items-center gap-1 min-w-[60px]">
                                    <span className="text-[8px] font-black text-slate-400 uppercase">Source</span>
                                    <NumberBall number={dep.source} size="md" />
                                </div>
                                
                                <ArrowRight className="text-slate-300 dark:text-slate-600" size={20} />
                                
                                <div className="flex gap-4">
                                    {dep.targets.map((tgt, idx) => (
                                        <div key={tgt.number} className="flex flex-col items-center gap-1 group cursor-pointer">
                                            <div className="relative">
                                                <NumberBall number={tgt.number} size="sm" />
                                                <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black text-white border-2 border-white dark:border-slate-800 ${idx === 0 ? 'bg-amber-500' : 'bg-slate-400'}`}>
                                                    {tgt.count}
                                                </div>
                                            </div>
                                            <span className={`text-[7px] font-bold uppercase ${idx === 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                                                {idx === 0 ? 'Top' : `#${idx+1}`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {dependencies.length === 0 && <div className="text-center text-slate-400 italic text-xs py-4">Aucune dépendance forte détectée pour ce tirage.</div>}
                    </div>
                )}
            </div>

            {/* 2. Cycles & Horloges (Amélioré) */}
            <div className="grid lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-slate-900 text-white p-8 rounded-[3.5rem] shadow-2xl border border-indigo-500/20 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px] group-hover:scale-125 transition-transform duration-1000"></div>
                    
                    <div className="relative z-10">
                        <div className="flex justify-between items-center mb-10">
                            <h4 className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
                                <RotateCw size={24} className="text-indigo-500" /> Cycles de Haute Précision
                            </h4>
                            <span className="text-[9px] font-black bg-white/10 px-3 py-1 rounded-full uppercase tracking-widest border border-white/10">StdDev &lt; 5.0</span>
                        </div>

                        <div className="space-y-6">
                            {cyclicData.map((c) => {
                                const progress = Math.min(100, (c.gap / c.avg) * 100);
                                const isOverdue = progress >= 100;
                                
                                return (
                                    <div key={c.number} className="bg-white/5 p-4 rounded-3xl border border-white/5 hover:bg-white/10 transition-all group/cycle relative overflow-hidden">
                                        <div className="flex items-center gap-6 relative z-10">
                                            <NumberBall number={c.number} size="md" />
                                            
                                            <div className="flex-1 space-y-2">
                                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                                                    <span className="text-slate-400">Progression Cycle</span>
                                                    <span className={isOverdue ? "text-rose-400" : "text-emerald-400"}>
                                                        {c.gap}t / {c.avg.toFixed(1)}t ({Math.round(progress)}%)
                                                    </span>
                                                </div>
                                                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                                    <div 
                                                        className={`h-full transition-all duration-1000 ${isOverdue ? 'bg-rose-500 shadow-[0_0_10px_#f43f5e]' : 'bg-emerald-500'}`} 
                                                        style={{ width: `${progress}%` }}
                                                    ></div>
                                                </div>
                                            </div>

                                            <div className="text-right min-w-[60px]">
                                                <div className={`text-xs font-black uppercase ${isOverdue ? 'text-rose-400 animate-pulse' : 'text-indigo-300'}`}>
                                                    {c.nextDateEstimate}
                                                </div>
                                                <div className="text-[8px] font-bold text-slate-500 uppercase mt-1">±{c.stdDev}t</div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* 3. Saisonnalité & Rythmes */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col items-center">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase tracking-widest rounded-full mb-6">
                            <Calendar size={12} /> Saisonnalité
                        </div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tighter text-center mb-6">
                            Affinité <span className="text-indigo-500">{seasonalData ? MONTHS[seasonalData.monthIndex] : '...'}</span>
                        </h3>
                        
                        <div className="flex gap-2 flex-wrap justify-center mb-8">
                            {seasonalData?.topNumbers.slice(0, 5).map((n, i) => (
                                <div key={n.number} className="flex flex-col items-center">
                                    <NumberBall number={n.number} size="sm" />
                                    <div className="h-8 w-1 bg-slate-100 dark:bg-slate-700 mt-2 rounded-full overflow-hidden">
                                        <div className="bg-indigo-500 w-full transition-all duration-1000" style={{ height: `${(5-i)*20}%` }}></div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="w-full h-px bg-slate-100 dark:bg-slate-700 mb-6"></div>

                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Sparkles size={12}/> Pulsation (20 derniers)
                        </h4>
                        <div className="w-full space-y-3">
                            {cyclicData.slice(0, 4).map(c => (
                                <div key={c.number} className="flex items-center gap-3">
                                    <span className="text-[9px] font-black text-slate-500 w-6">N°{c.number}</span>
                                    <div className="flex-1 flex gap-[2px]">
                                        {rhythms[c.number]?.map((hit, i) => (
                                            <div key={i} className={`flex-1 h-2 rounded-[1px] ${hit ? 'bg-indigo-500' : 'bg-slate-100 dark:bg-slate-700'}`}></div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
