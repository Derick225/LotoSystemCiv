
import React, { useState, useEffect } from 'react';
import { calculateShadowNumbers, calculateRunsTest, calculateTrendOscillator, calculateCUSUM } from '../../services/mathService';
import type { MathAnalysisReport, ShadowNumbers, TrendOscillatorPoint } from '../../types';
import { 
    ResponsiveContainer, 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, BarChart, Bar, ComposedChart, LineChart, Line, Tooltip 
} from 'recharts';
import { StatsSkeleton } from '../skeletons/StatsSkeleton';
import { NumberBall } from '../NumberBall';
import { InfoTooltip } from '../ui/InfoTooltip';
import { RotateCw, Activity, Layers, Target, Scale, TrendingUp, AlertOctagon } from 'lucide-react';
import { useNexus } from '../NexusProvider';

interface MathTabProps {
  drawName: string;
}

export const MathTab: React.FC<MathTabProps> = ({ drawName }) => {
  const { history, loading: nexusLoading } = useNexus();
  const [report, setReport] = useState<MathAnalysisReport | null>(null);
  const [shadows, setShadows] = useState<ShadowNumbers | null>(null);
  const [trendData, setTrendData] = useState<TrendOscillatorPoint[]>([]);
  const [cusumData, setCusumData] = useState<{name: string, pos: number, neg: number, alert: boolean}[]>([]);

  useEffect(() => {
    if (history.length > 0) {
        // Calcul Local à partir du cache Nexus
        const winners = history.flatMap(d => d.gagnants);
        const recentDraws = history.slice(0, 100);
        
        let drawsWithConsecutive = 0;
        recentDraws.forEach(d => {
            const sorted = [...d.gagnants].sort((a,b) => a-b);
            let hasConsecutive = false;
            for(let i=0; i<sorted.length-1; i++) if(sorted[i+1] === sorted[i] + 1) { hasConsecutive = true; break; }
            if(hasConsecutive) drawsWithConsecutive++;
        });

        const analysis: MathAnalysisReport = {
            parity: { odd: winners.filter(n => n % 2 !== 0).length, even: winners.filter(n => n % 2 === 0).length },
            lowHigh: { low: winners.filter(n => n <= 45).length, high: winners.filter(n => n > 45).length },
            sumHistory: history.slice(0, 50).map(d => ({ date: d.date, sum: d.gagnants.reduce((a: number, b: number)=>a+b, 0), avg: 227.5 })),
            finales: Array.from({length: 10}, (_, i) => ({ digit: i, count: winners.filter(n => n % 10 === i).length })),
            consecutiveStats: { count: drawsWithConsecutive, percentage: Math.round((drawsWithConsecutive / recentDraws.length) * 100) },
            runsTest: calculateRunsTest(winners.slice(0, 100))
        };

        setReport(analysis);
        setShadows(calculateShadowNumbers(history[0]));
        
        // Calcul Oscillateur
        const osc = calculateTrendOscillator(history, 40);
        setTrendData(osc);

        // Calcul CUSUM
        const cusum = calculateCUSUM(history.slice(0, 50));
        const chartData = cusum.positive.map((p, i) => ({
            name: i.toString(),
            pos: p,
            neg: cusum.negative[i],
            alert: cusum.alerts.includes(i)
        })).reverse(); // On inverse pour l'affichage chronologique
        setCusumData(chartData);
    }
  }, [history]);

  if (nexusLoading || !report) return <StatsSkeleton />;

  const renderZScoreGauge = (z: number) => {
      const clampedZ = Math.max(-4, Math.min(4, z));
      const percentage = ((clampedZ + 4) / 8) * 100;
      const isRandom = Math.abs(z) < 1.96;
      const color = isRandom ? 'bg-emerald-500' : 'bg-rose-500';
      
      return (
          <div className="mt-4">
              <div className="flex justify-between text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                  <span>Aggregation (-4)</span>
                  <span className="text-slate-500">Mélange Idéal (0)</span>
                  <span>Dispersion (+4)</span>
              </div>
              <div className="h-6 w-full bg-slate-100 dark:bg-slate-700/50 rounded-2xl relative overflow-hidden border border-slate-200 dark:border-slate-800">
                  <div className="absolute top-0 bottom-0 left-[37.5%] right-[37.5%] bg-emerald-100 dark:bg-emerald-900/20 border-x border-emerald-200 dark:border-emerald-800"></div>
                  <div 
                      className={`absolute top-0 bottom-0 w-2 -ml-1 rounded-full transition-all duration-1000 ${color} shadow-lg border-2 border-white dark:border-slate-900 z-10`}
                      style={{ left: `${percentage}%` }}
                  ></div>
              </div>
              <div className="text-center mt-3">
                  <span className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full border ${isRandom ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
                      Z-Score: {z.toFixed(2)}
                  </span>
              </div>
          </div>
      );
  };

  return (
    <div className="space-y-8 animate-fade-in">
        {/* OMBRES & COMPLÉMENTS */}
        {shadows && (
            <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl border border-slate-800 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-12 transition-transform duration-1000"><Target size={120} /></div>
                <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                    <Layers className="text-indigo-400" /> Géométrie des Compléments
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
                    <InfoTooltip title="Modulo Somme" content="Le reste de la division de la somme totale par 90. Un marqueur de symétrie modulaire.">
                        <div className="bg-white/5 p-5 rounded-3xl border border-white/5 group hover:bg-white/10 transition-colors cursor-help">
                            <div className="text-[9px] text-indigo-400 uppercase font-black tracking-widest mb-3">Modulo Somme</div>
                            <div className="text-3xl font-black">{shadows.sumModulo}</div>
                        </div>
                    </InfoTooltip>

                    <InfoTooltip title="Complément 1er" content="La distance du premier numéro par rapport au maximum du spectre (91)." example="Si le 1er numéro est 10, son complément est 81.">
                        <div className="bg-white/5 p-5 rounded-3xl border border-white/5 group hover:bg-white/10 transition-colors cursor-help">
                            <div className="text-[9px] text-indigo-400 uppercase font-black tracking-widest mb-3">Complément 1er</div>
                            <div className="flex justify-center"><NumberBall number={shadows.firstCompliment} size="sm" /></div>
                        </div>
                    </InfoTooltip>

                    <InfoTooltip title="Complément Dernier" content="La distance du dernier numéro par rapport au maximum du spectre (91).">
                        <div className="bg-white/5 p-5 rounded-3xl border border-white/5 group hover:bg-white/10 transition-colors cursor-help">
                            <div className="text-[9px] text-indigo-400 uppercase font-black tracking-widest mb-3">Complément Dernier</div>
                            <div className="flex justify-center"><NumberBall number={shadows.lastCompliment} size="sm" /></div>
                        </div>
                    </InfoTooltip>

                    <InfoTooltip title="Lien Écart" content="Différence absolue entre les deux premiers numéros. Mesure la tension de démarrage du tirage.">
                        <div className="bg-white/5 p-5 rounded-3xl border border-white/5 group hover:bg-white/10 transition-colors cursor-help">
                            <div className="text-[9px] text-indigo-400 uppercase font-black tracking-widest mb-3">Lien Écart</div>
                            <div className="text-3xl font-black text-rose-400">{shadows.gapLink}</div>
                        </div>
                    </InfoTooltip>

                    <InfoTooltip title="Nombre d'Or Modulo" content="Application du ratio de Fibonacci (0.618) sur la somme totale du tirage.">
                        <div className="bg-white/5 p-5 rounded-3xl border border-white/5 group hover:bg-white/10 transition-colors cursor-help">
                            <div className="text-[9px] text-indigo-400 uppercase font-black tracking-widest mb-3">Nombre d'Or</div>
                            <div className="text-3xl font-black text-amber-400">{shadows.goldenNumber}</div>
                        </div>
                    </InfoTooltip>
                </div>
            </div>
        )}

        {/* CUSUM CONTROL CHART */}
        {cusumData.length > 0 && (
            <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3 uppercase tracking-tighter">
                            <AlertOctagon className="text-rose-500" /> Contrôle Qualité (CUSUM)
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Détection de dérive moyenne (Biais Machine)</p>
                    </div>
                    <div className="flex gap-4 text-[9px] font-bold uppercase">
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> Dérive Positive</div>
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Dérive Négative</div>
                    </div>
                </div>

                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={cusumData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                            <XAxis hide />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                            <ReferenceLine y={80} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: "SEUIL ALARME", fill: "#f43f5e", fontSize: 9 }} />
                            
                            <Line type="monotone" dataKey="pos" stroke="#6366f1" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="neg" stroke="#f59e0b" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <p className="text-[9px] text-slate-400 text-center mt-2 italic">Une courbe dépassant le seuil rouge indique une anomalie statistique significative.</p>
            </div>
        )}

        {/* OSCILLATEUR DE TENDANCE */}
        {trendData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] shadow-xl border border-indigo-100 dark:border-indigo-900/50 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-5"><TrendingUp size={80} /></div>
                
                <div className="flex justify-between items-center mb-8 relative z-10">
                    <div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3 uppercase tracking-tighter">
                            <Activity className="text-indigo-600" /> Oscillateur de Température
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Convergence Momentum (Chaud vs Froid)</p>
                    </div>
                </div>

                <div className="h-64 w-full relative z-10">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                            <XAxis dataKey="drawIndex" hide />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                            <ReferenceLine y={0} stroke="#94a3b8" opacity={0.3} />
                            
                            <Bar dataKey="momentum" fill="#10b981" radius={[2, 2, 0, 0]} barSize={4} />
                            <Area type="monotone" dataKey="signal" stroke="#6366f1" strokeWidth={3} fill="url(#colorSignal)" fillOpacity={0.2} />
                            
                            <defs>
                                <linearGradient id="colorSignal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
        )}

        {/* RUNS TEST */}
        {report.runsTest && (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] shadow-xl border border-indigo-100 dark:border-indigo-900/50">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                            <RotateCw className="text-indigo-600" /> Cycles & Entropie (Wald-Wolfowitz)
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-widest">Test de randomisation séquentielle</p>
                    </div>
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black border tracking-widest uppercase ${report.runsTest.isRandom ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
                        {report.runsTest.isRandom ? "Aléatoire Nominal" : "Biais Séquentiel Détecté"}
                    </span>
                </div>
                
                <div className="grid md:grid-cols-2 gap-12">
                    <div className="space-y-6">
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-3xl space-y-4 border border-slate-100 dark:border-slate-800">
                            <InfoTooltip title="Nombre de Cycles (R)" content="Le nombre total de fois où la séquence a changé d'état (Passage au-dessus/en-dessous de la médiane).">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-[10px] font-black text-slate-400 uppercase">Cycles Observés (R)</span>
                                    <span className="text-sm font-black text-slate-800 dark:text-white">{report.runsTest.runs}</span>
                                </div>
                            </InfoTooltip>
                            
                            <InfoTooltip title="Z-Score de Wald" content="Indique de combien d'écarts-types le mélange actuel dévie de l'aléatoire parfait (0).">
                                <div className="flex justify-between items-center cursor-help">
                                    <span className="text-[10px] font-black text-slate-400 uppercase">Écart Normalisé (Z)</span>
                                    <span className="text-sm font-black text-slate-800 dark:text-white">{report.runsTest.zScore.toFixed(2)}</span>
                                </div>
                            </InfoTooltip>
                        </div>
                    </div>

                    <div className="flex flex-col justify-center">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                             <Scale size={14}/> Qualité du Brassage Stochastique
                        </h4>
                        {renderZScoreGauge(report.runsTest.zScore)}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
