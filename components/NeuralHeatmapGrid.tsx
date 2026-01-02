
import React, { useMemo } from 'react';
import type { ScoreBreakdown } from '../types';

interface NeuralHeatmapGridProps {
    breakdown?: Record<number, ScoreBreakdown>;
    suggestedNumbers: number[];
}

export const NeuralHeatmapGrid: React.FC<NeuralHeatmapGridProps> = ({ breakdown, suggestedNumbers }) => {
    const grid = useMemo(() => {
        return Array.from({ length: 90 }, (_, i) => {
            const num = i + 1;
            const scores = breakdown?.[num];
            
            if (!scores) return { num, intensity: 0, dominant: 'N/A' };

            const values = Object.values(scores).filter((v): v is number => typeof v === 'number');
            if (values.length === 0) return { num, intensity: 0, dominant: 'N/A' };

            const avg = values.reduce<number>((a, b) => a + b, 0) / values.length;
            
            const entries = Object.entries(scores)
                .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
                .sort((a, b) => b[1] - a[1]);
            
            if (entries.length === 0) return { num, intensity: 0, dominant: 'N/A' };
            
            return {
                num,
                intensity: avg,
                dominant: entries[0][0].replace('_', ' ')
            };
        });
    }, [breakdown, suggestedNumbers]);

    return (
        <div className="bg-slate-900 p-6 md:p-10 rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h4 className="text-white font-black text-lg uppercase tracking-tighter">Matrice de Tension Consensuelle</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Inférence globale du spectre 1-90</p>
                </div>
                <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                        <span className="text-[9px] font-black text-slate-400 uppercase">Haute Résonance</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-10 gap-1.5 md:gap-2.5">
                {grid.map((cell) => {
                    const isSuggested = suggestedNumbers.includes(cell.num);
                    const opacity = 0.1 + (cell.intensity / 100) * 0.9;
                    
                    return (
                        <div 
                            key={cell.num}
                            className={`
                                aspect-square rounded-lg flex items-center justify-center text-[10px] md:text-xs font-black transition-all duration-500 relative group cursor-help
                                ${isSuggested ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900 z-10 scale-110' : 'hover:scale-125 hover:z-20'}
                                ${cell.intensity > 70 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500'}
                            `}
                            style={{ 
                                opacity: isSuggested ? 1 : opacity,
                                backgroundColor: isSuggested ? '#6366f1' : undefined
                            }}
                        >
                            {cell.num}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                                <div className="bg-slate-950 border border-slate-700 p-3 rounded-xl shadow-2xl whitespace-nowrap">
                                    <div className="text-[10px] text-indigo-400 font-black uppercase mb-1">N°{cell.num}</div>
                                    <div className="text-[9px] text-white font-bold">Consensus: {Math.round(cell.intensity)}%</div>
                                    <div className="text-[8px] text-slate-500 uppercase mt-1">Vecteur: {cell.dominant}</div>
                                </div>
                                <div className="w-2 h-2 bg-slate-950 border-r border-b border-slate-700 rotate-45 mx-auto -mt-1"></div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="mt-8 flex justify-center gap-6 pt-6 border-t border-slate-800/50">
                 <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><span className="w-3 h-1 bg-slate-800 rounded-full"></span> Bruit Stochastique</div>
                 <div className="text-[9px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2"><span className="w-3 h-1 bg-indigo-500 rounded-full"></span> Signal Oracle</div>
            </div>
        </div>
    );
};
