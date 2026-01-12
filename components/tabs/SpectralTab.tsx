
import React, { useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { NumberBall } from '../NumberBall';
import { Zap, Battery, BatteryCharging, BatteryWarning } from 'lucide-react';

export const SpectralTab: React.FC<{ drawName: string }> = ({ drawName }) => {
  const { spectral, loading } = useNexus();

  // On ne montre que les numéros avec une énergie intéressante (> 50%)
  const highEnergy = useMemo(() => {
      return [...spectral]
        .filter(s => s.energy > 50)
        .sort((a, b) => b.energy - a.energy)
        .slice(0, 12);
  }, [spectral]);

  if (loading || spectral.length === 0) return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
          <Zap className="text-indigo-500 animate-bounce" size={48} />
          <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Scan des énergies...</p>
      </div>
  );

  return (
    <div className="space-y-8 animate-fade-in pb-16">
        {/* Header Hero */}
        <div className="bg-slate-950 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden border border-slate-800 text-center">
            <div className="relative z-10">
                <h3 className="text-3xl font-black tracking-tighter mb-4 flex items-center justify-center gap-3">
                    <Zap className="text-yellow-400 fill-current" /> Énergie des Numéros
                </h3>
                <p className="text-slate-400 text-sm font-medium max-w-lg mx-auto">
                    Voici les numéros qui sont "chargés à bloc" et prêts à sortir selon l'analyse vibratoire.
                </p>
            </div>
        </div>

        {/* Energy Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {highEnergy.map((m) => (
                <div key={m.number} className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-lg border border-slate-100 dark:border-slate-700 flex items-center gap-6">
                    <div className="transform scale-110">
                        <NumberBall number={m.number} size="lg" />
                    </div>
                    
                    <div className="flex-1">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-black text-slate-500 uppercase">Charge</span>
                            <span className="text-lg font-black text-indigo-500">{Math.round(m.energy)}%</span>
                        </div>
                        
                        {/* Battery Visual */}
                        <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden p-0.5">
                            <div 
                                className={`h-full rounded-full ${m.energy > 80 ? 'bg-rose-500' : 'bg-emerald-500'} transition-all duration-1000 relative overflow-hidden`} 
                                style={{ width: `${m.energy}%` }}
                            >
                                <div className="absolute inset-0 bg-white/30 animate-[shimmer_2s_infinite]"></div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="text-slate-300">
                        {m.energy > 80 ? <BatteryWarning size={24} className="text-rose-500"/> : <BatteryCharging size={24} className="text-emerald-500"/>}
                    </div>
                </div>
            ))}
        </div>

        {highEnergy.length === 0 && (
            <div className="p-12 text-center text-slate-400 font-bold bg-slate-100 dark:bg-slate-800 rounded-3xl">
                Aucun numéro avec une forte énergie détecté pour le moment.
            </div>
        )}
    </div>
  );
};
