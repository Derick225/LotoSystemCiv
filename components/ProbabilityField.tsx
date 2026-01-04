
import React, { useMemo } from 'react';
import { NumberBall } from './NumberBall';
import { Target, Globe, Activity, Layers, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface ProbabilityFieldProps {
    scores: Record<number, number>;
}

/**
 * ProbabilityField v5.1 - Industrial Multi-Layer Visualization
 * Fix: TS1382 parser ambiguity handled by isolating logic
 */
export const ProbabilityField: React.FC<ProbabilityFieldProps> = ({ scores }) => {
    const topNumbers = useMemo(() => {
        return (Object.entries(scores) as [string, number][])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([n, s]) => ({ num: parseInt(n), score: s }));
    }, [scores]);

    const grid = useMemo(() => {
        return Array.from({ length: 90 }, (_, i) => ({
            num: i + 1,
            score: scores[i + 1] || 0
        }));
    }, [scores]);

    const getCellClass = (score: number) => {
        let base = "aspect-square rounded-lg flex items-center justify-center text-[9px] md:text-xs font-black transition-all duration-500 relative cursor-help ";
        if (score > 90) return base + "bg-rose-600 text-white shadow-[0_0_15px_rgba(225,29,72,0.4)] scale-110 z-10";
        if (score > 70) return base + "bg-indigo-600 text-white";
        if (score > 40) return base + "bg-slate-800 text-slate-400";
        return base + "bg-slate-800/40 text-slate-700 opacity-40";
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Matrice de Chaleur 1-90 */}
            <div className="bg-slate-900 p-8 rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#1e1b4b_0%,transparent_100%)] opacity-40"></div>
                <div className="relative z-10">
                    <div className="flex justify-between items-center mb-8">
                        <div className="flex items-center gap-3">
                            <Layers className="text-indigo-400" size={20} />
                            <h4 className="text-white font-black text-sm uppercase tracking-widest">Matrice de Pression Probabiliste</h4>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
                                <span className="text-[8px] font-black text-slate-500 uppercase">Surchauffe (&gt;90%)</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-10 gap-1 sm:gap-1.5 md:gap-2.5">
                        {grid.map(cell => (
                            <div 
                                key={cell.num}
                                className={getCellClass(cell.score)}
                                title={`Numéro ${cell.num}: Probabilité ${cell.score}%`}
                            >
                                {cell.num}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Top Vectors & Analytics */}
            <div className="grid lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-slate-950 p-8 md:p-10 rounded-[3rem] border border-slate-800 shadow-2xl relative min-h-[400px] overflow-hidden group">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#1e1b4b_0%,#020617_100%)]"></div>
                    
                    <div className="relative z-10">
                        <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-indigo-600 rounded-2xl shadow-[0_0_15px_rgba(79,70,229,0.4)]">
                                    <Globe size={24} className="text-white animate-pulse-slow" />
                                </div>
                                <div>
                                    <h4 className="text-indigo-400 font-black text-xs uppercase tracking-[0.4em] mb-1">Inférence Gaussienne</h4>
                                    <h3 className="text-white text-2xl font-black tracking-tighter">Vecteurs à <span className="text-indigo-500">Haute Résonance</span></h3>
                                </div>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                            {topNumbers.map((item, idx) => {
                                const isExtreme = item.score > 90;
                                return (
                                    <div 
                                        key={item.num}
                                        className={`
                                            glass-card p-5 rounded-[2.5rem] transition-all duration-500 hover:scale-105 hover:z-20 relative overflow-hidden group/card
                                            ${isExtreme ? 'border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.15)]' : 'border-white/5'}
                                        `}
                                    >
                                        <div className="flex flex-col items-center gap-4 relative z-10">
                                            <div className="flex justify-between w-full items-center mb-1">
                                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">#{idx + 1}</span>
                                                {item.score > 50 ? <ArrowUpRight size={10} className="text-emerald-500" /> : <ArrowDownRight size={10} className="text-rose-500" />}
                                            </div>
                                            
                                            <NumberBall number={item.num} size="md" confidence={item.score} />

                                            <div className="text-center w-full mt-2">
                                                <div className={`text-2xl font-black font-mono transition-colors duration-500 ${isExtreme ? 'text-rose-400 text-glow-red' : 'text-white text-glow-indigo'}`}>
                                                    {item.score}%
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Tactical Legend & Insights */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] shadow-xl border border-gray-100 dark:border-gray-700 h-full flex flex-col">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl text-indigo-600">
                                <Target size={20} />
                            </div>
                            <h4 className="font-black text-gray-800 dark:text-white uppercase tracking-tight">Lecture Stratégique</h4>
                        </div>
                        
                        <div className="space-y-6 flex-1">
                            <div className="flex items-start gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                                <div className="w-10 h-10 rounded-full bg-rose-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-lg shadow-rose-500/20">!</div>
                                <div className="space-y-1">
                                    <div className="text-[10px] font-black uppercase text-rose-500">Zone de Surcharge</div>
                                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">Les probabilités &gt; 90% indiquent un écart-type critique. Ces numéros "doivent" sortir pour restaurer l'équilibre de la courbe de Gauss.</p>
                                </div>
                            </div>
                            
                            <div className="flex items-start gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                                <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-lg shadow-indigo-500/20">A</div>
                                <div className="space-y-1">
                                    <div className="text-[10px] font-black uppercase text-indigo-500">Flux d'Attraction</div>
                                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">Les zones entre 60% et 80% représentent le canal principal de résonance stochastique.</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 p-5 bg-indigo-600 rounded-[2rem] text-white flex items-center justify-between group overflow-hidden relative">
                             <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform duration-700"><TrendingUp size={40} /></div>
                             <div className="relative z-10">
                                <div className="text-[9px] font-black uppercase tracking-widest opacity-60">Verdict du jour</div>
                                <div className="text-sm font-black">Concentration Alpha</div>
                             </div>
                             <div className="relative z-10 bg-white/20 p-2 rounded-xl border border-white/20">
                                <Activity size={18} />
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
