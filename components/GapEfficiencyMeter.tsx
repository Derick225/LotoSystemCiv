
import React from 'react';
import type { GapEfficiency } from '../types';
import { NumberBall } from './NumberBall';
import { TrendingUp, AlertOctagon, Thermometer } from 'lucide-react';

interface GapEfficiencyMeterProps {
    data: GapEfficiency[];
}

export const GapEfficiencyMeter: React.FC<GapEfficiencyMeterProps> = ({ data }) => {
    // Filtrer pour n'afficher que les numéros intéressants (Warm+)
    const activeData = data.filter(d => d.maturityScore > 40).slice(0, 8);

    if (activeData.length === 0) return (
        <div className="p-8 text-center text-slate-400 bg-white/5 rounded-3xl border border-white/5 border-dashed">
            <Thermometer size={32} className="mx-auto mb-2 opacity-50"/>
            <p className="text-xs font-bold uppercase">Aucun numéro en zone de tension critique.</p>
        </div>
    );

    return (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2.5rem] shadow-xl relative overflow-hidden">
            <div className="flex items-center gap-3 mb-6 relative z-10">
                <div className="p-2 bg-rose-500/20 rounded-xl text-rose-500 border border-rose-500/30">
                    <AlertOctagon size={18} />
                </div>
                <div>
                    <h4 className="text-sm font-black text-white uppercase tracking-widest">Matrice de Maturité (GEI)</h4>
                    <p className="text-[9px] text-slate-400 font-bold">Probabilité conditionnelle selon l'écart actuel</p>
                </div>
            </div>

            <div className="space-y-4 relative z-10">
                {activeData.map((item) => (
                    <div key={item.number} className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group">
                        <NumberBall number={item.number} size="sm" />
                        
                        <div className="flex-1 space-y-1.5">
                            <div className="flex justify-between items-center">
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg ${
                                    item.zone === 'CRITICAL' ? 'bg-rose-500 text-white shadow-rose-500/50 shadow-lg animate-pulse' :
                                    item.zone === 'HOT' ? 'bg-orange-500 text-white' :
                                    'bg-amber-500/80 text-white'
                                }`}>
                                    {item.zone === 'CRITICAL' ? 'CRITIQUE' : item.zone}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                    Gap: <b className="text-white">{item.currentGap}</b> <span className="opacity-50">/ Max {item.maxGap}</span>
                                </span>
                            </div>
                            
                            <div className="relative h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                    className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ${
                                        item.maturityScore > 90 ? 'bg-gradient-to-r from-rose-500 to-red-600' : 'bg-gradient-to-r from-amber-400 to-orange-500'
                                    }`}
                                    style={{ width: `${item.maturityScore}%` }}
                                ></div>
                            </div>
                        </div>

                        <div className="text-center min-w-[50px]">
                            <div className="text-lg font-black text-white">{Math.round(item.probabilityAtCurrentGap)}%</div>
                            <div className="text-[7px] text-slate-500 uppercase font-black">Prob. Sortie</div>
                        </div>
                    </div>
                ))}
            </div>
            
            {/* Background Decor */}
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-rose-500/10 rounded-full blur-[60px] pointer-events-none"></div>
        </div>
    );
};
