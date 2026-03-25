
import React, { useMemo } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { StatsSkeleton } from '../skeletons/StatsSkeleton';
import { ProbabilityField } from '../ProbabilityField';
import { Trophy, Clock, Flame } from 'lucide-react';
import { NumberBall } from '../NumberBall';

export const StatsTab: React.FC<{ drawName: string }> = () => {
  const stats = useNexusStore(state => state.stats);
  const gaps = useNexusStore(state => state.gaps);
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

  return (
    <div className="space-y-8 md:space-y-10 animate-fade-in pb-12 w-full overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            
            {/* LES PLUS SORTIS */}
            <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[2.2rem] md:rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5"><Flame size={60} className="md:w-20 md:h-20" /></div>
                <h4 className="text-xs md:text-sm font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2 uppercase tracking-widest">
                    <Trophy className="text-amber-500" size={18}/> Champions
                </h4>
                <div className="space-y-3">
                    {topNumbers.map((entry, index) => (
                        <div key={entry.number} className="flex items-center justify-between p-2.5 rounded-xl md:rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px] ${index === 0 ? 'bg-amber-400 text-white' : index === 1 ? 'bg-slate-300 text-slate-600' : 'bg-orange-300 text-white'}`}>
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
                        <div key={entry.number} className="flex items-center justify-between p-2.5 rounded-xl md:rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
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
        </div>

        {/* Probability Heatmap */}
        <section className="w-full">
            <div className="flex justify-between items-center mb-6 px-4">
                <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-white tracking-tighter uppercase">Chaleur</h3>
                <span className="text-[9px] font-black bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-slate-500 uppercase">Vecteur 1-90</span>
            </div>
            <ProbabilityField scores={probabilityScores} />
        </section>
    </div>
  );
};
