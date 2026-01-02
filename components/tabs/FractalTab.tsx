
import React from 'react';
import { useNexus } from '../NexusProvider';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell, ReferenceLine } from 'recharts';
import { NumberBall } from '../NumberBall';
import { Brain, Shuffle, TrendingUp, Anchor } from 'lucide-react';

export const FractalTab: React.FC<{ drawName: string }> = () => {
  const { fractal, regime, loading } = useNexus();

  if (loading || fractal.length === 0) return <div className="p-20 text-center animate-pulse text-indigo-500">Calcul Hurst...</div>;

  const data = fractal.map(f => ({
      x: f.number,
      y: f.hurst,
      z: f.regime === 'PERSISTANT' ? 100 : f.regime === 'ANTI-PERSISTANT' ? 50 : 10
  }));

  return (
    <div className="space-y-8 animate-fade-in pb-16">
        <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl border border-slate-800">
            <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                <div>
                    <h3 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
                        <Brain className="text-purple-500" /> Géométrie Fractale
                    </h3>
                    <p className="text-slate-400 text-xs mt-2 font-medium">Analyse de la mémoire à long terme (Exposant de Hurst).</p>
                </div>
                <div className="flex gap-4">
                    <div className={`px-6 py-3 rounded-2xl border text-center ${regime?.hurst! > 0.5 ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-800 border-slate-700'}`}>
                        <div className="text-[9px] uppercase font-black tracking-widest mb-1">Hurst Global</div>
                        <div className="text-3xl font-black">{regime?.hurst.toFixed(3)}</div>
                    </div>
                </div>
            </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 h-[500px]">
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <XAxis type="number" dataKey="x" name="Numéro" unit="" domain={[1, 90]} tick={{fontSize: 10}} />
                    <YAxis type="number" dataKey="y" name="Hurst" domain={[0, 1]} tick={{fontSize: 10}} />
                    <ZAxis type="number" dataKey="z" range={[50, 200]} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '11px' }} />
                    <ReferenceLine y={0.5} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: "Aléatoire Pur (0.5)", position: 'insideTopRight', fill: '#94a3b8', fontSize: 10 }} />
                    <Scatter name="Fractals" data={data} fill="#8884d8">
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.y > 0.6 ? '#6366f1' : entry.y < 0.4 ? '#10b981' : '#cbd5e1'} />
                        ))}
                    </Scatter>
                </ScatterChart>
            </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-[2.5rem] border border-indigo-100 dark:border-indigo-800">
                <h4 className="text-sm font-black text-indigo-800 dark:text-indigo-300 mb-2 flex items-center gap-2"><TrendingUp size={16}/> Persistant (H &gt; 0.6)</h4>
                <p className="text-[10px] text-slate-600 dark:text-slate-400">Le numéro suit une tendance. S'il sort souvent, il continuera.</p>
            </div>
            <div className="p-6 bg-emerald-50 dark:bg-emerald-900/20 rounded-[2.5rem] border border-emerald-100 dark:border-emerald-800">
                <h4 className="text-sm font-black text-emerald-800 dark:text-emerald-300 mb-2 flex items-center gap-2"><Anchor size={16}/> Anti-Persistant (H &lt; 0.4)</h4>
                <p className="text-[10px] text-slate-600 dark:text-slate-400">Le numéro inverse sa tendance. Retour à la moyenne probable.</p>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800">
                <h4 className="text-sm font-black text-slate-800 dark:text-slate-300 mb-2 flex items-center gap-2"><Shuffle size={16}/> Aléatoire (H ~ 0.5)</h4>
                <p className="text-[10px] text-slate-600 dark:text-slate-400">Mouvement brownien standard. Imprévisible.</p>
            </div>
        </div>
    </div>
  );
};
