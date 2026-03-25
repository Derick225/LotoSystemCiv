
import React, { useMemo } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { NumberBall } from '../NumberBall';
import { Zap, Battery, BatteryCharging, BatteryWarning, Info, Sparkles } from 'lucide-react';

export const SpectralTab: React.FC<{ drawName: string }> = ({ drawName }) => {
  const spectral = useNexusStore(state => state.spectral);
  const loading = useNexusStore(state => state.loading);

  const highEnergy = useMemo(() => {
      return [...spectral]
        .sort((a, b) => b.energy - a.energy)
        .slice(0, 15);
  }, [spectral]);

  if (loading || spectral.length === 0) return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
          <Zap className="text-indigo-500 animate-bounce" size={48} />
          <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Scan des potentiels énergétiques...</p>
      </div>
  );

  return (
    <div className="space-y-8 animate-fade-in pb-16 w-full">
        {/* Header Hero */}
        <div className="bg-slate-950 p-8 md:p-12 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden border border-slate-800">
            <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] -mr-20 -mt-20"></div>
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="flex-1">
                    <h3 className="text-3xl md:text-4xl font-black tracking-tighter mb-4 flex items-center gap-3">
                        <Zap className="text-amber-400" fill="currentColor" /> État de Charge des Numéros
                    </h3>
                    <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-xl">
                        Plus la jauge est pleine, plus le numéro a accumulé une tension cyclique. Ces numéros sont statistiquement "dus" et cherchent à décharger leur énergie en sortant au tirage.
                    </p>
                </div>
                <div className="bg-white/5 p-6 rounded-3xl border border-white/10 text-center min-w-[200px]">
                    <div className="text-amber-400 font-black text-4xl mb-1">{highEnergy[0]?.energy || 0}%</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Potentiel de Charge Max</div>
                </div>
            </div>
        </div>

        {/* Energy Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {highEnergy.map((m) => (
                <div key={m.number} className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col gap-6 group hover:border-indigo-400 transition-all">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <NumberBall number={m.number} size="md" glow={m.energy > 80} />
                            <div>
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Vecteur {m.number}</div>
                                <div className={`text-sm font-black ${m.energy > 80 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {m.energy > 80 ? 'Saturé' : 'Chargement'}
                                </div>
                            </div>
                        </div>
                        <div className={`${m.energy > 80 ? 'text-rose-500' : 'text-emerald-500'} animate-pulse`}>
                            {m.energy > 80 ? <BatteryWarning size={20} /> : <BatteryCharging size={20} />}
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Potentiel de Résonance</span>
                            <span className="text-lg font-black text-slate-800 dark:text-white">{Math.round(m.energy)}%</span>
                        </div>
                        
                        <div className="h-6 w-full bg-slate-100 dark:bg-slate-900 rounded-xl overflow-hidden p-1 border border-slate-200 dark:border-slate-700 shadow-inner">
                            <div 
                                className={`h-full rounded-lg transition-all duration-1000 ${m.energy > 80 ? 'bg-gradient-to-r from-rose-600 to-rose-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'} relative overflow-hidden`} 
                                style={{ width: `${m.energy}%` }}
                            >
                                <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 italic">
                        <Sparkles size={12} className="text-amber-500" />
                        {m.energy > 80 ? "Sortie imminente détectée." : "Accumulation de signal stable."}
                    </div>
                </div>
            ))}
        </div>
    </div>
  );
};
