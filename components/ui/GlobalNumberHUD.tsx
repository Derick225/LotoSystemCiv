
import React from 'react';
import { useNexus } from '../NexusProvider';
import { Activity, ThermometerSun, History, Zap } from 'lucide-react';
import { getNumberColor } from '../../constants';

export const GlobalNumberHUD: React.FC = () => {
    const { hoveredNumber, stats, gaps, spectral } = useNexus();

    if (!hoveredNumber) return null;

    // Récupération instantanée des données depuis le contexte
    const numStat = stats.find(s => s.number === hoveredNumber);
    const numGap = gaps.find(g => g.number === hoveredNumber);
    const numSpec = spectral.find(s => s.number === hoveredNumber);

    const freq = numStat ? numStat.count : 0;
    const gap = numGap ? numGap.gap : 0;
    const energy = numSpec ? numSpec.energy : 0;

    // Détermination de l'état
    let status = 'Neutre';
    let statusColor = 'text-slate-400';
    
    if (energy > 80 && gap < 10) { status = 'BOUILLANT'; statusColor = 'text-rose-500'; }
    else if (gap > 25) { status = 'DORMEUR'; statusColor = 'text-indigo-400'; }
    else if (freq > 10) { status = 'FRÉQUENT'; statusColor = 'text-emerald-400'; }

    return (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-scale-in pointer-events-none">
            <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-[2rem] p-4 shadow-2xl flex items-center gap-6 min-w-[320px]">
                {/* Boule Visuelle */}
                <div className={`w-16 h-16 rounded-full flex items-center justify-center font-black text-3xl text-white shadow-lg ${getNumberColor(hoveredNumber)}`}>
                    {hoveredNumber}
                </div>

                <div className="flex-1 space-y-2">
                    <div className="flex justify-between items-center border-b border-white/10 pb-1">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${statusColor} flex items-center gap-1`}>
                            <Activity size={10} /> {status}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">Scan ID: #{hoveredNumber}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                        <div className="flex flex-col items-center">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Sorties</span>
                            <span className="text-lg font-black text-white flex items-center gap-1">
                                <History size={12} className="text-emerald-500"/> {freq}
                            </span>
                        </div>
                        <div className="w-px h-8 bg-white/10"></div>
                        <div className="flex flex-col items-center">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Écart</span>
                            <span className="text-lg font-black text-white flex items-center gap-1">
                                <ClockIcon size={12} className={gap > 20 ? "text-rose-500" : "text-slate-500"}/> {gap}
                            </span>
                        </div>
                        <div className="w-px h-8 bg-white/10"></div>
                        <div className="flex flex-col items-center">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Énergie</span>
                            <span className="text-lg font-black text-white flex items-center gap-1">
                                <Zap size={12} className="text-amber-500"/> {Math.round(energy)}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Petite icône horloge locale pour éviter les imports circulaires ou lourds
const ClockIcon = ({size, className}:any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
);
