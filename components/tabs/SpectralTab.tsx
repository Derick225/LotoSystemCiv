
import React, { useMemo, useState } from 'react';
import { useNexus } from '../NexusProvider';
import { NumberBall } from '../NumberBall';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { Zap, Activity, Radio, Waves, Maximize2, Grid3X3 } from 'lucide-react';

export const SpectralTab: React.FC<{ drawName: string }> = ({ drawName }) => {
  const { spectral, loading } = useNexus();
  const [viewMode, setViewMode] = useState<'wave' | 'matrix'>('wave');

  // Tri séquentiel strict (1 à 90) pour la cohérence graphique
  const fullSpectrum = useMemo(() => {
      return [...spectral].sort((a, b) => a.number - b.number);
  }, [spectral]);

  // Extraction des pics majeurs pour l'analyse rapide
  const peaks = useMemo(() => {
      return [...spectral]
        .sort((a, b) => b.energy - a.energy)
        .slice(0, 8); // Top 8 seulement
  }, [spectral]);

  if (loading || spectral.length === 0) return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
          <Waves className="text-indigo-500 animate-bounce" size={48} />
          <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Analyse FFT en cours...</p>
      </div>
  );

  return (
    <div className="space-y-8 animate-fade-in pb-16" key={drawName}>
        {/* Header Hero */}
        <div className="bg-slate-950 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group border border-slate-800">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] -mr-20 -mt-20"></div>
            <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
                <div>
                    <h3 className="text-3xl font-black tracking-tighter mb-2 flex items-center gap-3">
                        <Activity className="text-purple-400" fill="currentColor"/> Analyse Spectrale (FFT)
                    </h3>
                    <p className="text-slate-400 text-sm font-medium max-w-lg leading-relaxed">
                        Visualisation de l'énergie cinétique sur l'ensemble du spectre (1-90). Détecte les zones de résonance et les silences harmoniques.
                    </p>
                </div>
                
                <div className="flex bg-white/10 p-1 rounded-2xl backdrop-blur-md">
                    <button 
                        onClick={() => setViewMode('wave')}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all ${viewMode === 'wave' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-300 hover:bg-white/5'}`}
                    >
                        <Waves size={14}/> Onde
                    </button>
                    <button 
                        onClick={() => setViewMode('matrix')}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all ${viewMode === 'matrix' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-300 hover:bg-white/5'}`}
                    >
                        <Grid3X3 size={14}/> Matrice
                    </button>
                </div>
            </div>
        </div>

        {/* MAIN VISUALIZATION */}
        <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-[3.5rem] shadow-xl border border-slate-100 dark:border-slate-800 relative overflow-hidden">
            {viewMode === 'wave' ? (
                <div className="h-[400px] w-full relative animate-slide-up">
                    <div className="absolute top-4 left-4 z-10">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Maximize2 size={12}/> Spectre Complet (1-90)
                        </h4>
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={fullSpectrum} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="spectralGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.6}/>
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                            <XAxis 
                                dataKey="number" 
                                tick={{fontSize: 9, fontWeight: 'bold', fill: '#64748b'}} 
                                interval={9} // Affiche 1, 10, 20...
                                axisLine={false} 
                                tickLine={false} 
                            />
                            <YAxis hide domain={[0, 100]} />
                            <Tooltip 
                                contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '11px', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)' }}
                                itemStyle={{ color: '#a78bfa' }}
                                formatter={(value: number) => [`${Math.round(value)}%`, 'Énergie']}
                                labelFormatter={(label) => `Numéro ${label}`}
                            />
                            <ReferenceLine y={80} stroke="#f43f5e" strokeDasharray="3 3" opacity={0.5} label={{ value: "Seuil Critique", fill: "#f43f5e", fontSize: 9, position: 'insideTopRight' }} />
                            <Area 
                                type="monotone" 
                                dataKey="energy" 
                                stroke="#8b5cf6" 
                                strokeWidth={3} 
                                fill="url(#spectralGradient)" 
                                animationDuration={1500}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="animate-slide-up">
                    <div className="mb-6 flex justify-between items-center">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Densité Énergétique</h4>
                        <div className="flex gap-2 text-[8px] font-bold uppercase text-slate-400">
                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-slate-800 rounded-sm"></div> Faible</span>
                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-indigo-500 rounded-sm"></div> Moyenne</span>
                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-rose-500 rounded-sm"></div> Critique</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-10 gap-2">
                        {fullSpectrum.map((m) => {
                            let bgClass = 'bg-slate-100 dark:bg-slate-800 text-slate-400';
                            if (m.energy > 85) bgClass = 'bg-rose-500 text-white shadow-lg shadow-rose-500/40 scale-110 z-10';
                            else if (m.energy > 60) bgClass = 'bg-indigo-500 text-white';
                            else if (m.energy > 40) bgClass = 'bg-indigo-300 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-200';

                            return (
                                <div 
                                    key={m.number}
                                    className={`aspect-square rounded-xl flex items-center justify-center text-[10px] font-black transition-all hover:scale-125 cursor-help ${bgClass}`}
                                    title={`Numéro ${m.number}: Énergie ${m.energy}%`}
                                >
                                    {m.number}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>

        {/* HARMONIC PEAKS (High Resonance) */}
        <div>
            <h4 className="px-4 text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Radio size={14} className="text-rose-500 animate-pulse"/> Pics de Résonance (Top Harmoniques)
            </h4>
            
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                {peaks.map((m) => (
                    <div key={m.number} className="bg-white dark:bg-slate-800 p-4 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col items-center justify-between group hover:border-indigo-400 transition-all">
                        <div className="mb-3 relative">
                            <NumberBall number={m.number} size="md" />
                            {m.resonance && <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-800"></div>}
                        </div>
                        <div className="text-center w-full">
                            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
                                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: `${m.energy}%` }}></div>
                            </div>
                            <span className="text-[10px] font-black text-slate-600 dark:text-slate-300">{Math.round(m.energy)}%</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Insights Footer */}
        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-[2.5rem] border border-indigo-100 dark:border-indigo-800/50 flex items-start gap-4">
            <Zap className="text-indigo-500 shrink-0 mt-1" size={20} />
            <div>
                <h5 className="text-xs font-black text-indigo-800 dark:text-indigo-300 uppercase mb-1">Interprétation FFT</h5>
                <p className="text-[11px] text-indigo-700/70 dark:text-indigo-300/70 font-medium leading-relaxed">
                    Les pics élevés indiquent une cyclicité forte dans les tirages récents. Les creux (zones sombres sur la matrice) représentent des numéros "froids" ou "dormants". 
                    En mode Spectral, la contiguïté est clé : une zone entière (ex: 30-35) peut entrer en résonance simultanée.
                </p>
            </div>
        </div>
    </div>
  );
};
