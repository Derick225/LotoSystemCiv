import React, { useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell, ReferenceLine, ReferenceArea } from 'recharts';
import { NumberBall } from '../NumberBall';
import { Brain, TrendingUp, Anchor, Shuffle, Activity, HelpCircle } from 'lucide-react';

export const FractalTab: React.FC<{ drawName: string }> = () => {
  const { fractal, regime, loading } = useNexus();

  // Segmentation des données pour les "Buckets" novices
  const buckets = useMemo(() => {
      return {
          persistant: fractal.filter(f => f.hurst > 0.6).sort((a,b) => b.hurst - a.hurst).slice(0, 5),
          anti: fractal.filter(f => f.hurst < 0.4).sort((a,b) => a.hurst - b.hurst).slice(0, 5),
          random: fractal.filter(f => f.hurst >= 0.45 && f.hurst <= 0.55).slice(0, 5)
      };
  }, [fractal]);

  if (loading || fractal.length === 0) return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
          <Brain className="text-indigo-500 animate-bounce" size={48} />
          <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Calcul de la Mémoire du Marché...</p>
      </div>
  );

  // Préparation données graphique
  const chartData = fractal.map(f => ({
      x: f.number,
      y: f.hurst,
      z: f.regime === 'PERSISTANT' ? 200 : f.regime === 'ANTI-PERSISTANT' ? 150 : 50,
      regime: f.regime
  }));

  // Score global pour la jauge (0 = Chaos, 1 = Ordre)
  // On considère que Hurst loin de 0.5 est "Ordonné" (que ce soit persistant ou anti)
  const orderScore = Math.abs((regime?.hurst || 0.5) - 0.5) * 2 * 100;

  return (
    <div className="space-y-10 animate-fade-in pb-16">
        
        {/* HERO: MÉTÉO DU MARCHÉ (JAUGE SIMPLE) */}
        <div className="bg-slate-950 p-8 rounded-[3rem] text-white shadow-2xl border border-slate-800 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-[100px] -mr-10 -mt-10"></div>
            
            <div className="relative z-10 grid lg:grid-cols-2 gap-10 items-center">
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
                            <Brain size={20} className="text-indigo-400" />
                        </div>
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-indigo-300">Mémoire du Marché</h3>
                    </div>
                    <h2 className="text-3xl font-black text-white tracking-tighter mb-4">
                        Indice de <span className="text-indigo-500">Prédictibilité</span>
                    </h2>
                    <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-md">
                        Cet indice mesure si le jeu suit une logique (Tendances/Cycles) ou s'il est purement chaotique. Plus le score est élevé, plus les stratégies fonctionnent.
                    </p>
                </div>

                <div className="bg-white/5 p-6 rounded-3xl border border-white/10 shadow-inner">
                    <div className="flex justify-between items-end mb-4">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">État Actuel</span>
                        <span className={`text-2xl font-black ${orderScore > 30 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {orderScore > 30 ? 'STRUCTUREL' : 'CHAOTIQUE'}
                        </span>
                    </div>
                    
                    {/* Visual Gauge */}
                    <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-rose-500 via-slate-500 to-emerald-500 opacity-30"></div>
                        {/* Cursor */}
                        <div 
                            className="absolute top-0 bottom-0 w-2 bg-white shadow-[0_0_10px_white] transition-all duration-1000"
                            style={{ left: `${Math.min(100, Math.max(0, (regime?.hurst || 0.5) * 100))}%` }}
                        ></div>
                    </div>
                    <div className="flex justify-between text-[8px] font-bold text-slate-500 uppercase mt-2">
                        <span>Rebond (Anti)</span>
                        <span>Aléatoire (Chaos)</span>
                        <span>Tendance (Suivi)</span>
                    </div>
                </div>
            </div>
        </div>

        {/* LES 3 FAMILLES (NOVICE FRIENDLY) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* CARTE 1: LOCOMOTIVES */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-lg border-t-4 border-indigo-500 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><TrendingUp size={80}/></div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400"><TrendingUp size={18}/></div>
                        <h4 className="font-black text-slate-800 dark:text-white uppercase text-sm">Locomotives</h4>
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium mb-6 min-h-[45px]">
                        Ces numéros sont "chauds" et continuent de sortir. <br/>
                        <span className="text-indigo-500 font-bold">Stratégie : À JOUER (Suivre la tendance).</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {buckets.persistant.map(f => (
                            <div key={f.number} className="flex flex-col items-center">
                                <NumberBall number={f.number} size="sm" />
                                <span className="text-[8px] font-bold text-indigo-400 mt-1">{(f.hurst * 100).toFixed(0)}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* CARTE 2: ÉLASTIQUES */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-lg border-t-4 border-emerald-500 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><Anchor size={80}/></div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl text-emerald-600 dark:text-emerald-400"><Anchor size={18}/></div>
                        <h4 className="font-black text-slate-800 dark:text-white uppercase text-sm">Élastiques</h4>
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium mb-6 min-h-[45px]">
                        Ils forcent le retour à l'équilibre. S'ils sont sortis, ils s'arrêtent. S'ils dorment, ils se réveillent.
                        <span className="text-emerald-500 font-bold block">Stratégie : INVERSER (Jouer le contraire).</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {buckets.anti.map(f => (
                            <div key={f.number} className="flex flex-col items-center">
                                <NumberBall number={f.number} size="sm" />
                                <span className="text-[8px] font-bold text-emerald-400 mt-1">{(f.hurst * 100).toFixed(0)}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* CARTE 3: FANTÔMES */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-lg border-t-4 border-slate-300 dark:border-slate-600 relative overflow-hidden group opacity-80 hover:opacity-100 transition-opacity">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><Shuffle size={80}/></div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-xl text-slate-500"><Shuffle size={18}/></div>
                        <h4 className="font-black text-slate-800 dark:text-white uppercase text-sm">Fantômes</h4>
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium mb-6 min-h-[45px]">
                        Aucune logique détectée. Imprévisibles. <br/>
                        <span className="text-slate-400 font-bold">Stratégie : ÉVITER (Ou utiliser pour le hasard).</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {buckets.random.map(f => (
                            <div key={f.number} className="flex flex-col items-center opacity-60">
                                <NumberBall number={f.number} size="sm" />
                                <span className="text-[8px] font-bold text-slate-400 mt-1">~50%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        {/* DEEP DIVE CHART (POUR EXPERTS) */}
        <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 relative">
            <div className="flex justify-between items-center mb-6">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Activity size={14}/> Vue Spectrale (1-90)
                </h4>
                <div className="flex gap-4 text-[9px] font-bold uppercase text-slate-400">
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Zone Élastique</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-300"></div> Zone Neutre</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Zone Locomotive</span>
                </div>
            </div>

            <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                        <XAxis type="number" dataKey="x" name="Numéro" domain={[1, 90]} tick={{fontSize: 10, fontWeight:'bold'}} tickLine={false} axisLine={false} />
                        <YAxis type="number" dataKey="y" name="Hurst" domain={[0, 1]} hide />
                        <ZAxis type="number" dataKey="z" range={[50, 200]} />
                        <Tooltip 
                            cursor={{ strokeDasharray: '3 3' }} 
                            contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '11px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)' }} 
                            formatter={(value: any, name: any) => [name === 'y' ? parseFloat(value).toFixed(2) : value, name === 'y' ? 'Score Hurst' : name]}
                            labelFormatter={(label) => `Vecteur N°${label}`}
                        />
                        
                        {/* Zones Colorées */}
                        <ReferenceArea y1={0.6} y2={1} fill="#6366f1" fillOpacity={0.05} />
                        <ReferenceArea y1={0} y2={0.4} fill="#10b981" fillOpacity={0.05} />
                        <ReferenceLine y={0.5} stroke="#94a3b8" strokeDasharray="3 3" opacity={0.3} />

                        <Scatter name="Fractals" data={chartData}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.y > 0.6 ? '#6366f1' : entry.y < 0.4 ? '#10b981' : '#cbd5e1'} />
                            ))}
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* ASTUCE DU JOUR */}
        <div className="bg-amber-50 dark:bg-amber-900/10 p-6 rounded-[2.5rem] border border-amber-100 dark:border-amber-800/30 flex items-start gap-4">
            <HelpCircle size={24} className="text-amber-500 shrink-0 mt-1" />
            <div>
                <h5 className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase mb-1">Comment lire ce module ?</h5>
                <p className="text-[11px] text-amber-800/70 dark:text-amber-200/70 leading-relaxed font-medium">
                    Ne vous souciez pas des maths. Regardez simplement la jauge en haut : si elle est verte (Structurel), suivez les <strong>Locomotives</strong>. Si elle est rouge (Chaotique), jouez prudemment ou misez sur les <strong>Élastiques</strong> (qui ont de fortes chances de rebondir).
                </p>
            </div>
        </div>
    </div>
  );
};