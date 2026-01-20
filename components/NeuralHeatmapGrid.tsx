
import React, { useMemo } from 'react';
import type { ScoreBreakdown } from '../types';
import { motion } from 'framer-motion';

interface NeuralHeatmapGridProps {
    breakdown?: Record<number, ScoreBreakdown>;
    suggestedNumbers: number[];
}

export const NeuralHeatmapGrid: React.FC<NeuralHeatmapGridProps> = ({ breakdown, suggestedNumbers }) => {
    const grid = useMemo(() => {
        return Array.from({ length: 90 }, (_, i) => {
            const num = i + 1;
            const scores = breakdown?.[num];
            if (!scores) return { num, intensity: 0 };

            // Moyenne pondérée des scores principaux
            const avg = (
                (scores.frequency || 0) + 
                (scores.spectral || 0) + 
                (scores.markov || 0) + 
                (scores.momentum || 0)
            ) / 4;

            return { num, intensity: avg };
        });
    }, [breakdown]);

    return (
        <div className="bg-white p-8 rounded-[3.5rem] border border-slate-200 shadow-2xl relative overflow-hidden">
            {/* Background enhancement */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl opacity-50 -mr-20 -mt-20"></div>

            <div className="grid grid-cols-10 gap-2 md:gap-3 relative z-10">
                {grid.map((cell) => {
                    const isSuggested = suggestedNumbers.includes(cell.num);
                    // On ajuste l'opacité pour qu'elle soit plus visible sur blanc
                    const displayIntensity = Math.min(1, (cell.intensity / 100) + 0.05);
                    
                    return (
                        <div 
                            key={cell.num}
                            className={`
                                aspect-square rounded-xl flex items-center justify-center text-[10px] md:text-xs font-black transition-all duration-500 relative group border
                                ${isSuggested 
                                    ? 'bg-indigo-600 text-white border-indigo-700 scale-110 z-10 shadow-lg ring-2 ring-white' 
                                    : 'text-slate-500 bg-slate-50 border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/30'
                                }
                            `}
                            style={{ 
                                backgroundColor: isSuggested ? undefined : `rgba(79, 70, 229, ${cell.intensity / 180})`,
                                borderColor: isSuggested ? undefined : `rgba(99, 102, 241, ${cell.intensity / 250})`
                            }}
                        >
                            {cell.num}
                            
                            {/* Hover Details */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                                <div className="bg-slate-900 text-white p-3 rounded-xl shadow-2xl min-w-[120px] border border-indigo-500">
                                    <div className="text-[10px] font-black uppercase text-indigo-400 mb-1">Vecteur {cell.num}</div>
                                    <div className="text-lg font-black">{Math.round(cell.intensity)}% <span className="text-[8px] font-bold text-slate-400">PROBA</span></div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            <div className="mt-10 flex justify-center gap-8 border-t border-slate-100 pt-8 relative z-10">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-indigo-600"></div>
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">IA Top Choice</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-indigo-200"></div>
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Zone de Tension</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-slate-50 border border-slate-200"></div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bruit Blanc</span>
                </div>
            </div>
        </div>
    );
};
