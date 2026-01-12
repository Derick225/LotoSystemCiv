
import React, { useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { StatsSkeleton } from '../skeletons/StatsSkeleton';
import { ProbabilityField } from '../ProbabilityField';
import { Trophy, Clock, Flame } from 'lucide-react';
import { NumberBall } from '../NumberBall';

export const StatsTab: React.FC<{ drawName: string }> = () => {
  const { stats, gaps, loading } = useNexus();

  if (loading || stats.length === 0) return <StatsSkeleton />;

  const topNumbers = useMemo(() => stats.slice(0, 5), [stats]);
  const topGaps = useMemo(() => [...gaps].sort((a, b) => b.gap - a.gap).slice(0, 5), [gaps]);

  // Calcul simplifié pour la matrice
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
    <div className="space-y-10 animate-fade-in pb-12">
        <div className="grid md:grid-cols-2 gap-8">
            
            {/* LES PLUS SORTIS (PODIUM) */}
            <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-5"><Flame size={80}/></div>
                <h4 className="text-sm font-black text-slate-800 dark:text-white mb-8 flex items-center gap-2 uppercase tracking-widest">
                    <Trophy className="text-amber-500" size={18}/> Les Champions (Forment)
                </h4>
                <div className="space-y-4">
                    {topNumbers.map((entry, index) => (
                        <div key={entry.number} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-4">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${index === 0 ? 'bg-amber-400 text-white' : index === 1 ? 'bg-slate-300 text-slate-600' : 'bg-orange-300 text-white'}`}>
                                    {index + 1}
                                </div>
                                <NumberBall number={entry.number} size="sm" />
                            </div>
                            <div className="text-right">
                                <span className="block text-lg font-black text-slate-800 dark:text-white">{entry.count}</span>
                                <span className="text-[9px] text-slate-400 font-bold uppercase">Sorties</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* LES PLUS RETARDATAIRES (MONTRE) */}
            <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-5"><Clock size={80}/></div>
                <h4 className="text-sm font-black text-slate-800 dark:text-white mb-8 flex items-center gap-2 uppercase tracking-widest">
                    <Clock className="text-indigo-500" size={18}/> Les Absents (Retard)
                </h4>
                <div className="space-y-4">
                    {topGaps.map((entry, index) => (
                        <div key={entry.number} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-black text-xs text-slate-500">
                                    {index + 1}
                                </div>
                                <NumberBall number={entry.number} size="sm" />
                            </div>
                            <div className="text-right">
                                <span className="block text-lg font-black text-indigo-500">{entry.gap}</span>
                                <span className="text-[9px] text-slate-400 font-bold uppercase">Tirages sans voir</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* Probability Heatmap */}
        <section>
            <div className="flex justify-between items-center mb-6 px-2">
                <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tighter uppercase">Carte de Chaleur</h3>
                <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-slate-500 uppercase">1 à 90</span>
            </div>
            <ProbabilityField scores={probabilityScores} />
        </section>
    </div>
  );
};
