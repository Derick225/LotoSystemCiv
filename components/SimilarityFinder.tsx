
import React, { useState, useEffect } from 'react';
import { findHistoricalMatches } from '../services/mathService'; 
import type { DrawResult } from '../types';
import { NumberBall } from './NumberBall';
import { SearchCode, GitCompare, ArrowRight, ScanEye } from 'lucide-react';

interface SimilarityFinderProps {
    currentDraw: DrawResult;
    history: DrawResult[];
}

export const SimilarityFinder: React.FC<SimilarityFinderProps> = ({ currentDraw, history }) => {
    const [matches, setMatches] = useState<{ match: DrawResult, nextDraw: DrawResult | null, similarity: number }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        setTimeout(() => {
            const found = findHistoricalMatches(currentDraw, history, 4);
            setMatches(found);
            setLoading(false);
        }, 100);
    }, [currentDraw, history]);

    if (loading) return (
        <div className="p-8 text-center animate-pulse flex flex-col items-center gap-3">
            <ScanEye className="text-indigo-400 animate-spin-slow" size={24}/>
            <span className="text-[10px] uppercase font-black text-slate-400">Scan des Doppelgängers Vectoriels...</span>
        </div>
    );

    if (matches.length === 0) return (
        <div className="p-6 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/50">
            <SearchCode className="mx-auto text-slate-300 mb-2" size={24}/>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Aucune signature historique similaire (&gt;40%)</p>
        </div>
    );

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 mt-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                    <GitCompare size={18} />
                </div>
                <div>
                    <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tighter">Déjà-Vu Stochastique</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Récurrences structurelles (Jaccard Index)</p>
                </div>
            </div>

            <div className="space-y-4">
                {matches.map((m, _idx) => (
                    <div key={m.match.id} className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 relative overflow-hidden group hover:border-indigo-300 transition-colors">
                        {/* Similarity Bar */}
                        <div className="absolute top-0 left-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: `${m.similarity}%` }}></div>
                        
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-[10px] font-black text-slate-500 uppercase">{m.match.date}</span>
                            <span className={`text-xs font-black px-2 py-0.5 rounded-full border ${m.similarity > 75 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                                {Math.round(m.similarity)}% Match
                            </span>
                        </div>

                        <div className="flex flex-col gap-3">
                            {/* Le match */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 opacity-70 group-hover:opacity-100 transition-all">
                                    <span className="text-[10px] font-black text-slate-400 w-8">TIRAGE</span>
                                    <div className="flex gap-1">
                                        {m.match.gagnants.map(n => {
                                            const isShared = currentDraw.gagnants.includes(n);
                                            return (
                                                <div key={n} className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-black border ${isShared ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                                                    {n}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Ce qui a suivi */}
                            {m.nextDraw && (
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                                    <span className="text-[10px] font-black text-emerald-500 w-8 flex items-center gap-1"><ArrowRight size={8}/> J+1</span>
                                    <div className="flex gap-1.5">
                                        {m.nextDraw.gagnants.map(n => (
                                            <NumberBall key={n} number={n} size="sm" />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
