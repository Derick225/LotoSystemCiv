
import React, { useState, useEffect } from 'react';
import { findHistoricalMatches } from '../services/mathService';
import type { DrawResult } from '../types';
import { NumberBall } from './NumberBall';
import { SearchCode, RefreshCw, GitCompare, ArrowRight, Binary } from 'lucide-react';

interface SimilarityFinderProps {
    currentDraw: DrawResult;
    history: DrawResult[];
}

export const SimilarityFinder: React.FC<SimilarityFinderProps> = ({ currentDraw, history }) => {
    const [matches, setMatches] = useState<{ match: DrawResult, nextDraw: DrawResult | null, similarity: number }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        // Petit délai pour ne pas bloquer l'UI immédiate lors du montage
        setTimeout(() => {
            const found = findHistoricalMatches(currentDraw, history, 4);
            setMatches(found);
            setLoading(false);
        }, 100);
    }, [currentDraw, history]);

    if (loading) return <div className="p-6 text-center animate-pulse text-[10px] uppercase font-black text-slate-400">Scan des Doppelgängers...</div>;

    if (matches.length === 0) return (
        <div className="p-6 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
            <SearchCode className="mx-auto text-slate-300 mb-2" size={24}/>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Aucun précédent historique similaire (&gt;60%)</p>
        </div>
    );

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-700 mt-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                    <GitCompare size={18} />
                </div>
                <div>
                    <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tighter">Déjà-Vu Stochastique</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Récurrences structurelles</p>
                </div>
            </div>

            <div className="space-y-4">
                {matches.map((m, idx) => (
                    <div key={m.match.id} className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 relative overflow-hidden group">
                        {/* Similarity Bar */}
                        <div className="absolute top-0 left-0 h-1 bg-indigo-500" style={{ width: `${m.similarity}%` }}></div>
                        
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-[10px] font-black text-slate-500 uppercase">{m.match.date}</span>
                            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800">
                                {Math.round(m.similarity)}% Similaire
                            </span>
                        </div>

                        <div className="flex flex-col gap-3">
                            {/* Le match */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 opacity-60 grayscale group-hover:grayscale-0 transition-all">
                                    <span className="text-[8px] font-black text-slate-400 w-8">WIN</span>
                                    <div className="flex gap-1">
                                        {m.match.gagnants.map(n => (
                                            <div key={n} className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">{n}</div>
                                        ))}
                                    </div>
                                </div>
                                {m.match.machine && m.match.machine.length > 0 && (
                                    <div className="flex items-center gap-2 opacity-50 grayscale group-hover:grayscale-0 transition-all">
                                        <span className="text-[8px] font-black text-slate-400 w-8 flex gap-0.5"><Binary size={8}/> MAC</span>
                                        <div className="flex gap-1">
                                            {m.match.machine.map(n => (
                                                <div key={n} className="w-4 h-4 rounded flex items-center justify-center text-[7px] font-black bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500">{n}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Ce qui a suivi */}
                            {m.nextDraw && (
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[8px] font-black text-emerald-500 w-8 flex items-center gap-1"><ArrowRight size={8}/> J+1</span>
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
