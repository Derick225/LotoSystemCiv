
import React, { useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { StatsSkeleton } from '../skeletons/StatsSkeleton';
import { ProbabilityField } from '../ProbabilityField';
import { Waves, Activity, BarChart2 } from 'lucide-react';

export const StatsTab: React.FC<{ drawName: string }> = () => {
  const { stats, gaps, volatility, loading } = useNexus();

  // Si pas de données, loading ou skeleton
  if (loading || stats.length === 0) return <StatsSkeleton />;

  // Préparation des données réelles pour les graphiques
  const topNumbers = useMemo(() => stats.slice(0, 15), [stats]);
  const topGaps = useMemo(() => [...gaps].sort((a, b) => b.gap - a.gap).slice(0, 15), [gaps]);

  // Calcul pour la heatmap de probabilité (Score simple basé sur freq + gap)
  const probabilityScores = useMemo(() => {
      const scores: Record<number, number> = {};
      const maxFreq = stats[0]?.count || 1;
      const maxGap = Math.max(...gaps.map(g => g.gap)) || 1;

      stats.forEach(s => {
          const g = gaps.find(x => x.number === s.number)?.gap || 0;
          // Formule simple : 60% Fréquence + 40% Retard (Gap)
          const score = ((s.count / maxFreq) * 60) + ((g / maxGap) * 40);
          scores[s.number] = Math.round(score);
      });
      return scores;
  }, [stats, gaps]);

  return (
    <div className="space-y-10 animate-fade-in pb-12">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-125 transition-transform"><Activity className="w-12 h-12" /></div>
                <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Volatilité (Sigma)</div>
                <div className="text-3xl font-black">{volatility?.score ?? 0}%</div>
                <div className={`text-[8px] font-bold uppercase mt-2 px-2 py-1 rounded w-fit ${volatility?.status === 'Chaos' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {volatility?.status}
                </div>
            </div>
            {/* Autres KPIs simulés pour l'exemple mais basés sur la structure réelle */}
            <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-2xl">
                <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Entropie Shannon</div>
                <div className="text-3xl font-black">0.92</div>
                <div className="h-1 w-full bg-slate-800 rounded-full mt-3 overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: '92%' }}></div>
                </div>
            </div>
            <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-2xl">
                <div className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">Ecart Moyen</div>
                <div className="text-3xl font-black">{Math.round(gaps.reduce((a,b)=>a+b.gap,0)/90)}</div>
                <div className="text-[8px] text-slate-500 font-bold uppercase mt-2">Tirages sans sortie</div>
            </div>
            <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-2xl">
                <div className="text-[9px] font-black text-cyan-400 uppercase tracking-widest mb-1">Points Chauds</div>
                <div className="text-3xl font-black">{topNumbers.length}</div>
                <div className="text-[8px] text-slate-500 font-bold uppercase mt-2">Vecteurs actifs</div>
            </div>
        </div>

        {/* Charts Grid */}
        <div className="grid lg:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700">
                <h4 className="text-sm font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2 uppercase tracking-widest">
                    <BarChart2 className="text-indigo-500" size={16}/> Fréquence (Hot Vectors)
                </h4>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topNumbers}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                            <XAxis dataKey="number" tick={{fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                            <Tooltip 
                                cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                                contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '11px' }} 
                            />
                            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                {topNumbers.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index < 3 ? '#ef4444' : '#6366f1'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700">
                <h4 className="text-sm font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2 uppercase tracking-widest">
                    <Waves className="text-rose-500" size={16}/> Retard Critique (Cold Gaps)
                </h4>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topGaps}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                            <XAxis dataKey="number" tick={{fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                            <Tooltip 
                                cursor={{ fill: 'rgba(244, 63, 94, 0.05)' }}
                                contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '11px' }} 
                            />
                            <Bar dataKey="gap" radius={[6, 6, 0, 0]}>
                                {topGaps.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.gap > 25 ? '#f43f5e' : '#cbd5e1'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        {/* Probability Heatmap */}
        <section>
            <div className="flex justify-between items-center mb-6 px-2">
                <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tighter uppercase">Matrice de Probabilité</h3>
                <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-slate-500 uppercase">Grille 90</span>
            </div>
            <ProbabilityField scores={probabilityScores} />
        </section>
    </div>
  );
};
