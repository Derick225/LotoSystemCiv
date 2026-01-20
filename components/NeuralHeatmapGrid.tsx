
import React, { useMemo } from 'react';
import type { ScoreBreakdown } from '../types';
import { motion } from 'framer-motion';
import { Activity, Zap, Shield } from 'lucide-react';

interface NeuralHeatmapGridProps {
    breakdown?: Record<number, ScoreBreakdown>;
    suggestedNumbers: number[];
}

export const NeuralHeatmapGrid: React.FC<NeuralHeatmapGridProps> = ({ breakdown, suggestedNumbers }) => {
    const grid = useMemo(() => {
        return Array.from({ length: 90 }, (_, i) => {
            const num = i + 1;
            const scores = breakdown?.[num];
            if (!scores) return { num, intensity: 0, topAlgo: 'N/A' };

            // Moyenne pondérée des scores principaux
            const avg = (
                (scores.frequency || 0) + 
                (scores.spectral || 0) + 
                (scores.markov || 0) + 
                (scores.momentum || 0)
            ) / 4;

            // Identification de l'algo dominant
            let maxScore = -1;
            let topAlgo = 'Consensus';
            Object.entries(scores).forEach(([key, val]) => {
                if (typeof val === 'number' && val > maxScore) {
                    maxScore = val;
                    topAlgo = key;
                }
            });

            return { num, intensity: avg, topAlgo: topAlgo.charAt(0).toUpperCase() + topAlgo.slice(1) };
        });
    }, [breakdown]);

    return (
        <div className="bg-white p-8 md:p-12 rounded-[3.5rem] border border-slate-200 shadow-2xl relative overflow-hidden">
            {/* Effet Scanline spécifique à la grille */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-20" style={{ backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))', backgroundSize: '100% 2px, 3px 100%' }}></div>
            
            <div className="flex justify-between items-end mb-8 relative z-10 px-2">
                <div>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-3">
                        <Activity className="text-indigo-600" size={18} /> Matrice Tensorielle 1-90
                    </h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Séquençage des points chauds par fusion d'algorithmes</p>
                </div>
            </div>

            <div className="grid grid-cols-10 gap-2 md:gap-3 relative z-10">
                {grid.map((cell) => {
                    const isSuggested = suggestedNumbers.includes(cell.num);
                    const colorIntensity = Math.min(1, (cell.intensity / 100));
                    
                    return (
                        <div 
                            key={cell.num}
                            className={`
                                aspect-square rounded-xl flex items-center justify-center text-[10px] md:text-xs font-black transition-all duration-500 relative group border
                                ${isSuggested 
                                    ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white border-indigo-700 scale-110 z-10 shadow-xl ring-2 ring-indigo-50' 
                                    : 'text-slate-500 bg-slate-50 border-slate-100 hover:border-indigo-400 hover:shadow-md hover:z-10'
                                }
                            `}
                            style={{ 
                                backgroundColor: isSuggested ? undefined : `rgba(79, 70, 229, ${colorIntensity * 0.15})`,
                                borderColor: isSuggested ? undefined : `rgba(99, 102, 241, ${colorIntensity * 0.3})`
                            }}
                        >
                            {cell.num}
                            
                            {/* HUD de survol enrichi */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover:block z-50 pointer-events-none animate-scale-in">
                                <div className="bg-slate-900/95 backdrop-blur-xl text-white p-4 rounded-2xl shadow-2xl min-w-[160px] border border-indigo-500/50">
                                    <div className="flex justify-between items-center mb-3">
                                        <div className="text-[10px] font-black uppercase text-indigo-400">Vecteur #{cell.num}</div>
                                        <div className="p-1 bg-white/10 rounded-lg"><Zap size={10} className="text-amber-400" /></div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[8px] font-bold text-slate-500 uppercase">Probabilité</span>
                                            <span className="text-sm font-black text-white">{Math.round(cell.intensity)}%</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[8px] font-bold text-slate-500 uppercase">Dominance</span>
                                            <span className="text-[9px] font-bold text-indigo-300">{cell.topAlgo}</span>
                                        </div>
                                    </div>
                                    <div className="mt-3 pt-2 border-t border-white/5 flex items-center gap-2">
                                        <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div>
                                        <span className="text-[7px] font-black text-slate-500 uppercase">Signal Isolé</span>
                                    </div>
                                </div>
                                {/* Arrow */}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-8 border-transparent border-t-slate-900"></div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {/* Légende Interactive */}
            <div className="mt-12 flex flex-wrap justify-center gap-8 border-t border-slate-100 pt-10 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-md bg-indigo-600 shadow-md shadow-indigo-600/20 ring-1 ring-white/20"></div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest leading-none">Top Inférence</span>
                        <span className="text-[8px] text-slate-400 font-bold mt-1">Cible IA Prioritaire</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-md bg-indigo-100 ring-1 ring-indigo-200"></div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest leading-none">Activité Haute</span>
                        <span className="text-[8px] text-slate-400 font-bold mt-1">Pression Stochastique</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-md bg-slate-50 border border-slate-200"></div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Stable / Froid</span>
                        <span className="text-[8px] text-slate-400 font-bold mt-1">Bruit de fond</span>
                    </div>
                </div>
            </div>

            {/* Décoration d'angle technologique */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-[100px] opacity-40 -mr-24 -mt-24 pointer-events-none"></div>
        </div>
    );
};
