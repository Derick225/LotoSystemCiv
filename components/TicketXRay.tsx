
import React, { useMemo } from 'react';
import { calculateACValue } from '../services/mathService';
import { ShieldCheck, ShieldAlert, Check, X } from 'lucide-react';

interface TicketXRayProps {
    numbers: number[];
    score?: number;
    showTitle?: boolean;
}

export const TicketXRay: React.FC<TicketXRayProps> = ({ numbers, score = 0, showTitle = true }) => {
    const sum = useMemo(() => numbers.reduce((a, b) => a + b, 0), [numbers]);
    const ac = useMemo(() => calculateACValue(numbers), [numbers]);
    const oddCount = useMemo(() => numbers.filter(n => n % 2 !== 0).length, [numbers]);
    
    if (numbers.length === 0) return null;

    // Simplification du diagnostic
    const isSumGood = sum > 150 && sum < 300;
    const isMixGood = oddCount >= 2 && oddCount <= 3;
    const isAcGood = ac >= 7;

    const checks = [
        { label: "Mélange (Pair/Impair)", valid: isMixGood, text: isMixGood ? "Bien mélangé" : "Trop déséquilibré" },
        { label: "Poids Total", valid: isSumGood, text: isSumGood ? "Équilibré" : "Trop lourd/léger" },
        { label: "Complexité", valid: isAcGood, text: isAcGood ? "Difficile à deviner" : "Trop simple" }
    ];

    const integrityScore = Math.round((Math.min(100, (ac/8)*100) + (score || 50)) / 2);
    const isOptimal = integrityScore > 60;

    return (
        <div className="mt-3 p-4 md:p-6 bg-slate-900 rounded-2xl md:rounded-[2rem] border border-indigo-500/30 animate-slide-up relative overflow-hidden">
            {showTitle && (
                <div className="flex justify-between items-center mb-4 md:mb-6 border-b border-white/10 pb-3 md:pb-4">
                    <h5 className="text-[10px] md:text-xs font-black text-indigo-400 uppercase tracking-widest">
                        Contrôle Qualité
                    </h5>
                    <div className={`px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[8px] md:text-[10px] font-black uppercase flex items-center gap-1.5 md:gap-2 border ${isOptimal ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}>
                        {isOptimal ? <ShieldCheck size={10}/> : <ShieldAlert size={10}/>}
                        {isOptimal ? 'Bon' : 'Fragile'}
                    </div>
                </div>
            )}

            <div className="space-y-2 md:space-y-4">
                {checks.map((check, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-white/5 p-2.5 md:p-3 rounded-xl">
                        <div className="flex items-center gap-2.5 md:gap-3">
                            <div className={`p-1 md:p-1.5 rounded-full ${check.valid ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                                {check.valid ? <Check size={8} className="text-white md:w-[10px] md:h-[10px]"/> : <X size={8} className="text-white md:w-[10px] md:h-[10px]"/>}
                            </div>
                            <div>
                                <div className="text-[8px] md:text-[10px] text-slate-400 uppercase font-bold">{check.label}</div>
                                <div className="text-[10px] md:text-xs text-white font-medium">{check.text}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="mt-4 md:mt-6 pt-3 md:pt-4 border-t border-white/10 text-center">
                <span className="text-[8px] md:text-[10px] text-slate-500 uppercase tracking-widest font-bold">Note Finale</span>
                <div className="text-2xl md:text-4xl font-black text-white mt-0.5 md:mt-1">{integrityScore}/100</div>
            </div>
        </div>
    );
};
