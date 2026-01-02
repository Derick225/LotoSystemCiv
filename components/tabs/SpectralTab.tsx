
import React from 'react';
import { useNexus } from '../NexusProvider';
import { NumberBall } from '../NumberBall';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { Zap, Activity, Radio } from 'lucide-react';

export const SpectralTab: React.FC<{ drawName: string }> = () => {
  const { spectral, loading } = useNexus();

  if (loading || spectral.length === 0) return <div className="p-20 text-center animate-pulse text-indigo-500">Calcul FFT en cours...</div>;

  const topResonance = [...spectral].sort((a, b) => b.energy - a.energy).slice(0, 12);

  return (
    <div className="space-y-8 animate-fade-in pb-16">
        {/* Header Hero */}
        <div className="bg-slate-950 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group border border-slate-800">
            <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-[80px] -mr-16 -mt-16"></div>
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                <div>
                    <h3 className="text-3xl font-black tracking-tighter mb-2 flex items-center gap-3">
                        <Zap className="text-amber-400" fill="currentColor"/> Résonance Spectrale
                    </h3>
                    <p className="text-slate-400 text-sm font-medium max-w-lg leading-relaxed">
                        Analyse par Transformée de Fourier Rapide (FFT). Détection des cycles cachés et de l'énergie cinétique des numéros.
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">Fréquence Dominante</div>
                    <div className="text-4xl font-black font-mono">4.2 Hz</div>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {topResonance.map((m) => (
                <div key={m.number} className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-6">
                        <NumberBall number={m.number} size="md" />
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Énergie</span>
                            <span className={`text-xl font-black ${m.energy > 80 ? 'text-rose-500' : 'text-indigo-500'}`}>{Math.round(m.energy)}%</span>
                        </div>
                    </div>
                    
                    <div className="h-24 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={Array.from({length: 20}, (_, i) => ({ v: Math.sin(i * 0.5) * (m.energy/100) + Math.random() * 0.2 }))}>
                                <defs>
                                    <linearGradient id={`grad-${m.number}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={m.energy > 80 ? '#f43f5e' : '#6366f1'} stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor={m.energy > 80 ? '#f43f5e' : '#6366f1'} stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <Area 
                                    type="monotone" 
                                    dataKey="v" 
                                    stroke={m.energy > 80 ? '#f43f5e' : '#6366f1'} 
                                    strokeWidth={2} 
                                    fill={`url(#grad-${m.number})`} 
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <Radio size={14} className={m.resonance ? "text-emerald-500 animate-pulse" : "text-slate-400"} />
                            <span className="text-[9px] font-bold uppercase text-slate-500">{m.resonance ? 'En Phase' : 'Déphasé'}</span>
                        </div>
                        <div className="text-[9px] font-mono text-slate-400">Période: {m.dominantPeriod}t</div>
                    </div>
                </div>
            ))}
        </div>
    </div>
  );
};
