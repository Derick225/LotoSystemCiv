
import React from 'react';
import { useNexus } from '../NexusProvider';
import { Activity, X } from 'lucide-react';
import { getNumberColor } from '../../constants';

export const GlobalNumberHUD: React.FC = () => {
    const { hoveredNumber, setHoveredNumber, stats, gaps, spectral } = useNexus();

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

    const handleClose = () => setHoveredNumber(null);

    return (
        <div 
            className="fixed inset-0 z-[150] flex items-center justify-center px-6 animate-scale-in bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
        >
            <div 
                className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-6 shadow-2xl flex flex-col items-center gap-6 min-w-[280px] max-w-sm w-full relative overflow-hidden pointer-events-auto"
                onClick={(e) => e.stopPropagation()} // Empêche la fermeture au clic sur la carte
            >
                {/* Close Button */}
                <button 
                    onClick={handleClose}
                    className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors z-20"
                >
                    <X size={18} />
                </button>

                {/* Background FX */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

                {/* Boule Visuelle */}
                <div className={`w-24 h-24 rounded-full flex items-center justify-center font-black text-5xl text-white shadow-2xl ring-4 ring-white/5 ${getNumberColor(hoveredNumber)}`}>
                    {hoveredNumber}
                </div>

                <div className="w-full space-y-4">
                    <div className="flex justify-between items-center border-b border-white/10 pb-2">
                        <span className={`text-xs font-black uppercase tracking-widest ${statusColor} flex items-center gap-2`}>
                            <Activity size={14} /> {status}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">Scan ID: #{hoveredNumber}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="flex flex-col items-center p-2 bg-white/5 rounded-2xl">
                            <span className="text-[8px] font-bold text-slate-400 uppercase mb-1">Sorties</span>
                            <span className="text-xl font-black text-white flex items-center gap-1">
                                {freq}
                            </span>
                        </div>
                        <div className="flex flex-col items-center p-2 bg-white/5 rounded-2xl">
                            <span className="text-[8px] font-bold text-slate-400 uppercase mb-1">Écart</span>
                            <span className="text-xl font-black text-white flex items-center gap-1">
                                {gap}
                            </span>
                        </div>
                        <div className="flex flex-col items-center p-2 bg-white/5 rounded-2xl">
                            <span className="text-[8px] font-bold text-slate-400 uppercase mb-1">Énergie</span>
                            <span className="text-xl font-black text-white flex items-center gap-1">
                                {Math.round(energy)}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
