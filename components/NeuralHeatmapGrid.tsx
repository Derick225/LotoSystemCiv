import React, { useMemo, useState, useEffect } from 'react';
import type { ScoreBreakdown } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Binary, Activity, Zap, Cpu } from 'lucide-react';

interface NeuralHeatmapGridProps {
    breakdown?: Record<number, ScoreBreakdown>;
    suggestedNumbers: number[];
}

export const NeuralHeatmapGrid: React.FC<NeuralHeatmapGridProps> = ({ breakdown, suggestedNumbers }) => {
    const [scanLineY, setScanLineY] = useState(0);

    // Animation du balayage radar
    useEffect(() => {
        const interval = setInterval(() => {
            setScanLineY(prev => (prev >= 100 ? 0 : prev + 0.5));
        }, 30);
        return () => clearInterval(interval);
    }, []);

    const grid = useMemo(() => {
        return Array.from({ length: 90 }, (_, i) => {
            const num = i + 1;
            const scores = breakdown?.[num];
            
            if (!scores) return { num, intensity: 0, dominant: 'Bruit' };

            const values = Object.values(scores).filter((v): v is number => typeof v === 'number');
            const avg = values.length > 0 ? values.reduce<number>((a, b) => a + b, 0) / values.length : 0;
            
            const entries = Object.entries(scores)
                .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
                .sort((a, b) => b[1] - a[1]);
            
            return {
                num,
                intensity: avg,
                dominant: entries.length > 0 ? entries[0][0].replace('_', ' ') : 'Neutre'
            };
        });
    }, [breakdown]);

    const getCellStyles = (cell: typeof grid[0]) => {
        const isSuggested = suggestedNumbers.includes(cell.num);
        const hot = cell.intensity > 75;
        
        if (isSuggested) return "bg-indigo-600 text-white ring-2 ring-white ring-offset-2 ring-offset-slate-900 z-20 scale-110 shadow-[0_0_20px_rgba(99,102,241,0.6)]";
        if (hot) return "bg-rose-500/80 text-white shadow-[0_0_15px_rgba(244,63,94,0.3)] border-rose-400/50";
        if (cell.intensity > 40) return "bg-slate-800 text-slate-200 border-indigo-500/20";
        return "bg-slate-900/40 text-slate-600 border-white/5 opacity-40";
    };

    return (
        <div className="bg-slate-950 p-6 md:p-10 rounded-[3.5rem] border border-white/10 shadow-2xl relative overflow-hidden group">
            {/* Overlay de Scan Hertzien */}
            <div 
                className="absolute left-0 right-0 h-1 bg-indigo-500/20 blur-sm pointer-events-none z-10 transition-all duration-300"
                style={{ top: `${scanLineY}%` }}
            />
            <div 
                className="absolute left-0 right-0 h-[2px] bg-indigo-400/40 pointer-events-none z-10"
                style={{ top: `${scanLineY}%` }}
            />

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 relative z-20">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-indigo-600/20 rounded-lg border border-indigo-500/30">
                            <Binary size={14} className="text-indigo-400" />
                        </div>
                        <h4 className="text-white font-black text-lg uppercase tracking-tighter">Matrice de Tension Consensuelle</h4>
                    </div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em]">Décodage du spectre tensoriel 1-90</p>
                </div>
                <div className="mt-4 sm:mt-0 flex gap-4">
                    <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></div>
                        <span className="text-[8px] font-black text-slate-400 uppercase">Surcharge</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                        <span className="text-[8px] font-black text-slate-400 uppercase">Résonance</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-10 gap-1.5 md:gap-3 relative z-20">
                {grid.map((cell) => (
                    <div 
                        key={cell.num}
                        className={`
                            aspect-square rounded-xl flex items-center justify-center text-[10px] md:text-xs font-black transition-all duration-500 relative group cursor-crosshair border
                            ${getCellStyles(cell)}
                            hover:scale-125 hover:z-30 hover:border-white/40
                        `}
                    >
                        {cell.num}
                        
                        {/* Tooltip HUD Style */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover:block z-50 pointer-events-none animate-scale-in">
                            <div className="bg-slate-900/95 backdrop-blur-xl border border-indigo-500/30 p-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] min-w-[140px]">
                                <div className="flex justify-between items-center mb-3 border-b border-white/10 pb-2">
                                    <span className="text-xs font-black text-white">UNIT_{cell.num}</span>
                                    <div className="p-1 bg-indigo-500/20 rounded">
                                        <Cpu size={10} className="text-indigo-400" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[8px] font-black text-slate-500 uppercase">Tension</span>
                                        <span className="text-xs font-mono font-black text-indigo-400">{Math.round(cell.intensity)}%</span>
                                    </div>
                                    <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500" style={{ width: `${cell.intensity}%` }} />
                                    </div>
                                    <div className="pt-1">
                                        <span className="text-[7px] font-black text-slate-500 uppercase block mb-0.5">Vecteur Dominant</span>
                                        <span className="text-[9px] font-bold text-white uppercase truncate block">{cell.dominant}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="w-3 h-3 bg-slate-900 border-r border-b border-indigo-500/30 rotate-45 mx-auto -mt-1.5 shadow-xl"></div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-10 flex flex-wrap justify-center gap-8 pt-8 border-t border-white/5 relative z-20">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-1.5 bg-slate-800 rounded-full"></div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Inertie</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-6 h-1.5 bg-indigo-600 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div>
                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Flux Actif</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-6 h-1.5 bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.8)]"></div>
                    <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Convergence</span>
                </div>
            </div>

            {/* Décoration de fond */}
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-indigo-600/5 rounded-full blur-[100px] pointer-events-none"></div>
        </div>
    );
};