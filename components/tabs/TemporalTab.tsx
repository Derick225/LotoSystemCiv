
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
                // 1. Calcul Cycles
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

                // 2. Calcul Dépendances (Causalité)
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

    if (nexusLoading) return <div className="p-20 text-center animate-pulse text-indigo-500 uppercase tracking-[0.4em]">Décodage de la Lignée Temporelle...</div>;

    return (
        <div className="space-y-10 animate-fade-in pb-20">
            {/* Dependency Matrix */}
            <div className="bg-white dark:bg-slate-800 p-8 rounded-[3.5rem] shadow-xl border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl text-indigo-600">
                        <Link size={20} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Flux de Causalité (T-1 ➜ T)</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Numéros qui "appellent" les gagnants actuels</p>
                    </div>
                </div>

                <div className="space-y-6">
                    {loadingDeps ? (
                        <div className="py-12 text-center animate-pulse text-slate-400 font-bold text-xs uppercase tracking-widest">Analyse des corrélations...</div>
                    ) : dependencies.map(dep => (
                        <div key={dep.source} className="flex items-center gap-6 p-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 rounded-3xl transition-all group">
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[8px] font-black text-slate-400 uppercase">Source</span>
                                <NumberBall number={dep.source} size="md" />
                            </div>
                            <ArrowRight className="text-slate-300 group-hover:text-indigo-400 transition-colors" size={24} />
                            <div className="flex gap-4">
                                {dep.targets.map(tgt => (
                                    <div key={tgt.number} className="flex flex-col items-center gap-1">
                                        <div className="relative">
                                            <NumberBall number={tgt.number} size="sm" />
                                            <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[7px] font-bold px-1 rounded-full">{tgt.count}</span>
                                        </div>
                                        <span className="text-[8px] font-bold text-slate-500 uppercase">Suiveur</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Cycles & Precision */}
            <div className="bg-slate-900 text-white p-8 rounded-[3.5rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-12 transition-transform duration-1000"><RotateCw size={120} /></div>
                <h4 className="text-lg font-black uppercase tracking-widest mb-10 flex items-center gap-3">
                    <Hourglass className="text-indigo-400" /> Horloges de Précision
                </h4>
                <div className="grid md:grid-cols-2 gap-6">
                    {cyclicData.map(c => (
                        <div key={c.number} className="p-6 bg-white/5 rounded-3xl border border-white/5 flex items-center justify-between group hover:bg-white/10 transition-all">
                            <div className="flex items-center gap-6">
                                <NumberBall number={c.number} size="md" />
                                <div>
                                    <div className="text-xl font-black">{c.gap}t <span className="text-[10px] text-slate-500">/ {c.avg.toFixed(1)}t</span></div>
                                    <div className={`text-[9px] font-black uppercase mt-1 ${c.nextDateEstimate === 'IMMINENT' ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`}>{c.nextDateEstimate}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[8px] font-black text-slate-400 uppercase mb-1">Stabilité</div>
                                <div className="text-lg font-mono text-indigo-400 font-bold">±{c.stdDev.toFixed(2)}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
