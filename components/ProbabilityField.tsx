import React, { useMemo, memo } from 'react';
import { Thermometer } from 'lucide-react';

interface ProbabilityFieldProps {
    scores: Record<number, number>;
}

// Composant Cellule mémoïsé pour la performance HPC
const GridCell = memo(({ num, score }: { num: number, score: number }) => {
    const getStatus = (s: number) => {
        if (s > 85) return { label: "SURCHAUFFE", color: "text-rose-500", bg: "bg-rose-500/20", border: "border-rose-500/40" };
        if (s > 65) return { label: "ATTRACTEUR", color: "text-indigo-400", bg: "bg-indigo-500/20", border: "border-indigo-500/40" };
        if (s < 25) return { label: "ZONE MORTE", color: "text-slate-500", bg: "bg-slate-800/40", border: "border-slate-700" };
        return { label: "STABLE", color: "text-slate-400", bg: "bg-slate-800/20", border: "border-slate-800" };
    };

    const status = getStatus(score);
    const isHot = score > 85;

    return (
        <div 
            className={`
                aspect-square rounded-md md:rounded-xl flex items-center justify-center text-[7px] sm:text-[9px] md:text-xs font-black transition-all duration-500 cursor-help border
                ${status.bg} ${status.border} ${status.color}
                ${isHot ? 'animate-pulse shadow-[0_0_10px_rgba(225,29,72,0.3)] z-10' : 'hover:scale-110'}
            `}
            title={`${status.label} : ${score}%`}
        >
            {num}
        </div>
    );
});

export const ProbabilityField: React.FC<ProbabilityFieldProps> = ({ scores }) => {
    const numbers = useMemo(() => Array.from({ length: 90 }, (_, i) => i + 1), []);

    return (
        <div className="space-y-4 md:space-y-8 animate-fade-in w-full overflow-hidden">
            {/* Légende */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
                {[
                    { type: 'CHAUD', desc: 'Tension max', color: 'bg-rose-500' },
                    { type: 'SIGNAL', desc: 'Forte proba', color: 'bg-indigo-500' },
                    { type: 'STABLE', desc: 'Rythme normal', color: 'bg-slate-600' },
                    { type: 'FROID', desc: 'Zone morte', color: 'bg-slate-800' }
                ].map(item => (
                    <div key={item.type} className="p-2 md:p-3 bg-white/5 rounded-xl md:rounded-2xl border border-white/5 flex items-center gap-2 md:gap-3">
                        <div className={`w-2 h-2 md:w-3 md:h-3 rounded-full ${item.color} shadow-lg shrink-0`}></div>
                        <div className="min-w-0 overflow-hidden">
                            <div className="text-[8px] md:text-[9px] font-black text-white uppercase truncate">{item.type}</div>
                            <div className="text-[7px] md:text-[8px] text-slate-500 uppercase truncate">{item.desc}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Matrice de Pression */}
            <div className="bg-slate-950 p-2 sm:p-4 md:p-8 rounded-2xl md:rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="flex justify-between items-center mb-4 md:mb-6">
                    <div className="flex items-center gap-2">
                        <Thermometer className="text-indigo-400" size={16} />
                        <h4 className="text-white font-black text-[10px] md:text-sm uppercase tracking-widest">Pression Thermique Matrix</h4>
                    </div>
                </div>

                <div className="grid grid-cols-10 gap-1 md:gap-3">
                    {numbers.map(n => (
                        <GridCell key={n} num={n} score={scores[n] || 0} />
                    ))}
                </div>
            </div>
        </div>
    );
};