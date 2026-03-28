
import React, { useMemo } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { StatsSkeleton } from '../skeletons/StatsSkeleton';
import { ProbabilityField } from '../ProbabilityField';
import { CoOccurrenceGraph } from '../CoOccurrenceGraph';
import { Trophy, Clock, Flame, BarChart3, TrendingUp } from 'lucide-react';
import { NumberBall } from '../NumberBall';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

export const StatsTab: React.FC<{ drawName: string }> = () => {
  const stats = useNexusStore(state => state.stats);
  const gaps = useNexusStore(state => state.gaps);
  const history = useNexusStore(state => state.history);
  const loading = useNexusStore(state => state.loading);

  if (loading || stats.length === 0) return <StatsSkeleton />;

  const topNumbers = useMemo(() => stats.slice(0, 5), [stats]);
  const topGaps = useMemo(() => [...gaps].sort((a, b) => b.gap - a.gap).slice(0, 5), [gaps]);

  const probabilityScores = useMemo(() => {
      const scores: Record<number, number> = {};
      const maxFreq = stats[0]?.count || 1;
      const maxGap = Math.max(...gaps.map(g => g.gap)) || 1;
      stats.forEach(s => {
          const g = gaps.find(x => x.number === s.number)?.gap || 0;
          const score = ((s.count / maxFreq) * 60) + ((g / maxGap) * 40);
          scores[s.number] = Math.round(score);
      });
      return scores;
  }, [stats, gaps]);

  const chartData = useMemo(() => {
      return stats.slice(0, 15).map(s => ({
          name: s.number.toString(),
          count: s.count,
          gap: gaps.find(g => g.number === s.number)?.gap || 0
      }));
  }, [stats, gaps]);

  const gapChartData = useMemo(() => {
      return [...gaps].sort((a, b) => b.gap - a.gap).slice(0, 15).map(g => ({
          name: g.number.toString(),
          gap: g.gap,
          count: stats.find(s => s.number === g.number)?.count || 0
      }));
  }, [stats, gaps]);

  const decileData = useMemo(() => {
      const deciles = Array.from({ length: 9 }, (_, i) => ({
          subject: `${i * 10 + 1}-${(i + 1) * 10}`,
          count: 0,
          fullMark: 100
      }));
      
      stats.forEach(s => {
          const decileIndex = Math.floor((s.number - 1) / 10);
          if (decileIndex >= 0 && decileIndex < 9) {
              deciles[decileIndex].count += s.count;
          }
      });
      
      return deciles;
  }, [stats]);

  const CustomTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
          return (
              <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-xl">
                  <p className="text-white font-black mb-2">Numéro {label}</p>
                  {payload.map((entry: any, index: number) => (
                      <p key={index} className="text-xs font-bold" style={{ color: entry.color }}>
                          {entry.name === 'count' ? 'Sorties' : 'Écart'}: {entry.value}
                      </p>
                  ))}
              </div>
          );
      }
      return null;
  };

  return (
    <div className="space-y-8 md:space-y-10 animate-fade-in pb-12 w-full overflow-hidden">
        
        {/* GRAPHIQUES RECHARTS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
            <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[2.2rem] md:rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700">
                <h4 className="text-xs md:text-sm font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2 uppercase tracking-widest">
                    <BarChart3 className="text-emerald-500" size={18}/> Top 15 Fréquences
                </h4>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} vertical={false} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#334155', opacity: 0.1 }} />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index < 3 ? '#f59e0b' : '#10b981'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[2.2rem] md:rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700">
                <h4 className="text-xs md:text-sm font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2 uppercase tracking-widest">
                    <TrendingUp className="text-indigo-500" size={18}/> Top 15 Écarts (Dormants)
                </h4>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={gapChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} vertical={false} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Line type="monotone" dataKey="gap" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#1e293b' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            
            {/* LES PLUS SORTIS */}
            <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[2.2rem] md:rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5"><Flame size={60} className="md:w-20 md:h-20" /></div>
                <h4 className="text-xs md:text-sm font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2 uppercase tracking-widest">
                    <Trophy className="text-amber-500" size={18}/> Champions
                </h4>
                <div className="space-y-3">
                    {topNumbers.map((entry, index) => (
                        <div key={entry.number} className="flex items-center justify-between p-2.5 rounded-xl md:rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 hover:border-amber-500/30 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px] ${index === 0 ? 'bg-amber-400 text-white shadow-lg shadow-amber-500/30' : index === 1 ? 'bg-slate-300 text-slate-600' : 'bg-orange-300 text-white'}`}>
                                    {index + 1}
                                </div>
                                <NumberBall number={entry.number} size="sm" />
                            </div>
                            <div className="text-right">
                                <span className="block text-sm md:text-lg font-black text-slate-800 dark:text-white leading-none">{entry.count}</span>
                                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">Sorties</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* LES PLUS RETARDATAIRES */}
            <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[2.2rem] md:rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5"><Clock size={60} className="md:w-20 md:h-20" /></div>
                <h4 className="text-xs md:text-sm font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2 uppercase tracking-widest">
                    <Clock className="text-indigo-500" size={18}/> Absents
                </h4>
                <div className="space-y-3">
                    {topGaps.map((entry, index) => (
                        <div key={entry.number} className="flex items-center justify-between p-2.5 rounded-xl md:rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 hover:border-indigo-500/30 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-black text-[10px] text-slate-500">
                                    {index + 1}
                                </div>
                                <NumberBall number={entry.number} size="sm" />
                            </div>
                            <div className="text-right">
                                <span className="block text-sm md:text-lg font-black text-indigo-500 leading-none">{entry.gap}</span>
                                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">Écart</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* DISTRIBUTION PAR DÉCILE */}
            <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[2.2rem] md:rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden flex flex-col">
                <h4 className="text-xs md:text-sm font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2 uppercase tracking-widest">
                    <BarChart3 className="text-purple-500" size={18}/> Distribution par Décile
                </h4>
                <p className="text-[10px] text-slate-400 mb-4 uppercase tracking-widest font-bold">Répartition globale des sorties</p>
                <div className="flex-1 min-h-[250px] w-full relative z-10">
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={decileData}>
                            <PolarGrid stroke="#334155" strokeDasharray="3 3" opacity={0.3} />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} />
                            <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} axisLine={false} />
                            <Radar
                                name="Sorties"
                                dataKey="count"
                                stroke="#a855f7"
                                strokeWidth={2}
                                fill="#a855f7"
                                fillOpacity={0.3}
                            />
                            <Tooltip content={<CustomTooltip />} />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        {/* GRAPHE DE CO-OCCURRENCE */}
        <div className="w-full">
            <CoOccurrenceGraph history={history} />
        </div>

        {/* Probability Heatmap */}
        <section className="w-full bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[2.2rem] md:rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="flex justify-between items-center mb-6 px-4">
                <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-white tracking-tighter uppercase flex items-center gap-2">
                    <Flame className="text-rose-500" size={20}/> Chaleur Thermique
                </h3>
                <span className="text-[9px] font-black bg-slate-100 dark:bg-slate-900 px-3 py-1 rounded-full text-slate-500 uppercase border border-slate-200 dark:border-slate-700">Vecteur 1-90</span>
            </div>
            <ProbabilityField scores={probabilityScores} />
        </section>
    </div>
  );
};

