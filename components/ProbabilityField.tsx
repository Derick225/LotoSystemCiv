
import React, { useMemo } from 'react';
import { NumberBall } from './NumberBall';
import { Target, Globe, Activity, Layers, TrendingUp, ArrowUpRight, ArrowDownRight, ThermometerHole } from 'lucide-react';

interface ProbabilityFieldProps {
    scores: Record<number, number>;
}

export const ProbabilityField: React.FC<ProbabilityFieldProps> = ({ scores }) => {
    const grid = useMemo(() => {
        return Array.from({ length: 90 }, (_, i) => ({
            num: i + 1,
            score: scores[i + 1] || 0
        }));
    }, [scores]);

    const getStatus = (score: number) => {
        if (score > 85) return { label: "SURCHAUFFE", color: "text-rose-500", bg: "bg-rose-500/20", border: "border-rose-500/40" };
        if (score > 65) return { label: "ATTRACTEUR", color: "text-indigo-400", bg: "bg-indigo-500/20", border: "border-indigo-500/40" };
        if (score < 25) return { label: "ZONE MORTE", color: "text-slate-500", bg: "bg-slate-800/40", border: "border-slate-700" };
        return { label: "STABLE", color: "text-slate-400", bg: "bg-slate-800/20", border: "border-slate-800" };
    };

    return (
        <div className="space-y-8 animate-fade-in w-full overflow-hidden">
            {/* Légende d'interprétation */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { type: 'SURCHAUFFE', desc: 'Prêt à sortir (Tension max)', color: 'bg-rose-500' },
                    { type: 'ATTRACTEUR', desc: 'Forte probabilité cyclique', color: 'bg-indigo-500' },
                    { type: 'STABLE', desc: 'Rythme nominal', color: 'bg-slate-600' },
                    { type: 'ZONE MORTE', desc: 'Signal faible ou absent', color: 'bg-slate-800' }
                ].map(item => (
                    <div key={item.type} className="p-3 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${item.color} shadow-lg`}></div>
                        <div>
                            <div className="text-[9px] font-black text-white">{item.type}</div>
                            <div className="text-[8px] text-slate-500 uppercase">{item.desc}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Matrice de Pression 1-90 */}
            <div className="bg-slate-950 p-4 md:p-8 rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <ThermometerHole className="text-indigo-400" size={20} />
                        <h4 className="text-white font-black text-sm uppercase tracking-widest">Matrice de Pression Thermique</h4>
                    </div>
                </div>

                <div className="grid grid-cols-10 gap-1.5 md:gap-3">
                    {grid.map(cell => {
                        const status = getStatus(cell.score);
                        const isHot = cell.score > 85;
                        return (
                            <div 
                                key={cell.num}
                                className={`
                                    aspect-square rounded-lg md:rounded-xl flex items-center justify-center text-[9px] md:text-xs font-black transition-all duration-500 cursor-help border
                                    ${status.bg} ${status.border} ${status.color}
                                    ${isHot ? 'animate-pulse shadow-[0_0_15px_rgba(225,29,72,0.3)] scale-110 z-10' : 'hover:scale-110'}
                                `}
                                title={`${status.label} : Probabilité ${cell.score}%`}
                            >
                                {cell.num}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
