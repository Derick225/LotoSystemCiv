import React, { useState, useEffect, useRef } from 'react';
import { getSeasonalAffinity, getDayAffinity, type CyclicCandidate } from '../../services/temporalAnalysisService';
import { fetchAssociatedNumbers } from '../../services/lotteryService';
import { NumberBall } from '../NumberBall';
import { useNexus } from '../NexusProvider';
import { Clock, Calendar, Sparkles, RotateCw, Link, ArrowRight, Activity, Hourglass } from 'lucide-react';
import type { NumberRegularity } from '../../types';

interface DependencyFlow {
    source: number;
    targets: { number: number; count: number }[];
}

export const TemporalTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history, regularity, loading: nexusLoading } = useNexus();
    const [cyclicData, setCyclicData] = useState<CyclicCandidate[]>([]);
    const [dependencies, setDependencies] = useState<DependencyFlow[]>([]);
    const [loadingDeps, setLoadingDeps] = useState(false);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        const load = async () => {
            if (history.length > 10) {
                const cycles: CyclicCandidate[] = regularity
                    .filter(reg => reg.stdDev < 4.0 && reg.lastGaps.length >= 2)
                    .map(reg => {
                        const progress = Math.min(100, (reg.currentGap / (reg.avgGap || 1)) * 100);
                        return {
                            number: reg.number,
                            score: 100 - (reg.stdDev * 10),
                            gap: reg.currentGap,
                            avg: reg.avgGap,
                            stdDev: reg.stdDev,
                            historyStr: reg.lastGaps.join('-'),
                            nextDateEstimate: progress > 90 ? 'IMMINENT' : 'EN ATTENTE'
                        };
                    })
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 6);
                
                if (isMounted.current) setCyclicData(cycles);

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

    if (nexusLoading) return <div className="p-10 text-center animate-pulse text-indigo-500 uppercase tracking-widest text-[9px]">Séquençage Temporel...</div>;

    return (
        <div className="space-y-6 md:space-y-10 animate-fade-in pb-16 w-full overflow-hidden px-1 md:px-0">
            {/* Dependency Matrix */}
            <div className="bg-white dark:bg-slate-800 p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-3 mb-6 md:mb-8">
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600">
                        <Link size={16} />
                    </div>
                    <div>
                        <h3 className="text-base md:text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter leading-none">Flux de Causalité</h3>
                        <p className="text-[8px] md:text-[9px] text-slate-400 font-bold uppercase mt-1">L'effet domino T-1 ➜ T</p>
                    </div>
                </div>

                <div className="space-y-3 md:space-y-4">
                    {loadingDeps ? (
                        <div className="py-12 text-center animate-pulse text-slate-400 font-bold text-[9px] uppercase tracking-widest">Calcul...</div>
                    ) : dependencies.map(dep => (
                        <div key={dep.source} className="flex flex-row items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 rounded-2xl transition-all border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/50">
                            <div className="flex flex-col items-center shrink-0">
                                <span className="text-[6px] md:text-[7px] font-black text-slate-400 uppercase mb-1">Source</span>
                                <NumberBall number={dep.source} size="sm" />
                            </div>
                            <ArrowRight className="text-slate-300 shrink-0" size={12} />
                            <div className="flex flex-wrap gap-2 flex-1">
                                {dep.targets.map(tgt => (
                                    <div key={tgt.number} className="flex items-center gap-1 bg-slate-100 dark:bg-black/30 p-1 rounded-xl border border-slate-200 dark:border-white/5">
                                        <NumberBall number={tgt.number} size="sm" />
                                        <div className="flex flex-col items-start pr-1">
                                            <span className="text-[6px] font-black text-indigo-500 uppercase">Proba</span>
                                            <span className="text-[7px] md:text-[8px] font-bold text-slate-500">x{tgt.count}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Cycles & Precision - Grid 1 col on mobile */}
            <div className="bg-slate-900 text-white p-5 md:p-8 rounded-[2rem] md:rounded-[3.5rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-12 transition-transform duration-1000"><RotateCw size={100} /></div>
                <h4 className="text-sm md:text-lg font-black uppercase tracking-widest mb-6 md:mb-8 flex items-center gap-3">
                    <Hourglass className="text-indigo-400 w-4 h-4 md:w-5 md:h-5" /> Horloges Cycliques
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                    {cyclicData.map(c => (
                        <div key={c.number} className="p-4 md:p-6 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between group hover:bg-white/10 transition-all">
                            <div className="flex items-center gap-4">
                                <NumberBall number={c.number} size="sm" />
                                <div>
                                    <div className="text-base md:text-lg font-black">{c.gap}t <span className="text-[9px] md:text-[10px] text-slate-500">/ {c.avg.toFixed(1)}</span></div>
                                    <div className={`text-[7px] md:text-[8px] font-black uppercase mt-0.5 ${c.nextDateEstimate === 'IMMINENT' ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`}>{c.nextDateEstimate}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[6px] md:text-[7px] font-black text-slate-500 uppercase mb-0.5">Variance</div>
                                <div className="text-xs md:text-sm font-mono text-indigo-400 font-bold">±{c.stdDev.toFixed(1)}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};