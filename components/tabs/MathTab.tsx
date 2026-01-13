
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
import { RotateCw, Activity, Layers, Target, Scale, TrendingUp, AlertOctagon, ThermometerSun, HelpCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
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
  
  // États simplifiés pour l'interface novice
  const [cusumStatus, setCusumStatus] = useState<{ state: 'STABLE' | 'WARNING', message: string }>({ state: 'STABLE', message: 'Analyse...' });
  const [tempStatus, setTempStatus] = useState<{ value: number, label: string, color: string }>({ value: 0, label: 'Neutre', color: 'text-slate-400' });

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
        
        // Interprétation "Météo" pour novice (basée sur le dernier momentum)
        const lastMomentum = osc[osc.length - 1]?.momentum || 0;
        if (lastMomentum > 20) setTempStatus({ value: lastMomentum, label: 'Surchauffe (Gros Numéros)', color: 'text-orange-500' });
        else if (lastMomentum < -20) setTempStatus({ value: lastMomentum, label: 'Glacial (Petits Numéros)', color: 'text-indigo-500' });
        else setTempStatus({ value: lastMomentum, label: 'Tempéré (Équilibré)', color: 'text-emerald-500' });

        // Calcul CUSUM
        const cusum = calculateCUSUM(history.slice(0, 50));
        const chartData = cusum.positive.map((p, i) => ({
            name: i.toString(),
            pos: p,
            neg: cusum.negative[i],
            alert: cusum.alerts.includes(i)
        })).reverse(); 
        setCusumData(chartData);

        // Interprétation CUSUM pour novice
        const isAlert = chartData.some(d => d.pos > 80 || d.neg > 80);
        if (isAlert) setCusumStatus({ state: 'WARNING', message: "Détection d'une anomalie statistique forte. Le tirage ne semble pas naturel." });
        else setCusumStatus({ state: 'STABLE', message: "Le flux est parfaitement aléatoire. Aucune manipulation détectée." });
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
                  <span>Trop Groupé</span>
                  <span className="text-slate-500">Parfait</span>
                  <span>Trop Dispersé</span>
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
                      {isRandom ? "Mélange OK" : "Mélange Suspect"}
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

        {/* CUSUM CONTROL CHART (SIMPLIFIÉ) */}
        {cusumData.length > 0 && (
            <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700">
                <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-6">
                    <div className="flex-1">
                        <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3 uppercase tracking-tighter">
                            <AlertOctagon className={cusumStatus.state === 'WARNING' ? "text-rose-500" : "text-emerald-500"} /> 
                            Détecteur de Biais (CUSUM)
                        </h3>
                        <div className={`mt-3 p-4 rounded-2xl border ${cusumStatus.state === 'WARNING' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'} flex items-start gap-3`}>
                            {cusumStatus.state === 'WARNING' ? <AlertOctagon size={18} className="shrink-0 mt-0.5"/> : <CheckCircle2 size={18} className="shrink-0 mt-0.5"/>}
                            <div>
                                <div className="text-xs font-black uppercase tracking-wide mb-1">État : {cusumStatus.state === 'WARNING' ? 'Anomalie' : 'Normal'}</div>
                                <p className="text-[11px] font-medium leading-relaxed opacity-90">{cusumStatus.message}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="w-full md:w-auto bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl max-w-xs">
                        <div className="flex items-center gap-2 mb-2 text-indigo-500 font-bold text-[10px] uppercase tracking-widest">
                            <HelpCircle size={12}/> Comprendre
                        </div>
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                            Si la courbe violette monte, le jeu sort trop de "gros" numéros. Si la courbe orange monte, il sort trop de "petits". Si tout est plat, le hasard est pur.
                        </p>
                    </div>
                </div>

                <div className="h-64 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={cusumData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                            <XAxis hide />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                            <ReferenceLine y={80} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: "ZONE ANORMALE", fill: "#f43f5e", fontSize: 9, position: 'insideBottomRight' }} />
                            
                            <Line type="monotone" dataKey="pos" stroke="#6366f1" strokeWidth={3} dot={false} name="Biais Gros Numéros" />
                            <Line type="monotone" dataKey="neg" stroke="#f59e0b" strokeWidth={3} dot={false} name="Biais Petits Numéros" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        )}

        {/* OSCILLATEUR DE TENDANCE (MÉTÉO) */}
        {trendData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] shadow-xl border border-indigo-100 dark:border-indigo-900/50 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-5"><ThermometerSun size={80} /></div>
                
                <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-6 relative z-10">
                    <div className="flex-1">
                        <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3 uppercase tracking-tighter">
                            <Activity className="text-indigo-600" /> Météo du Jeu
                        </h3>
                        <div className="mt-3 flex items-center gap-4">
                            <div className="text-3xl font-black font-mono text-slate-700 dark:text-slate-200">
                                {tempStatus.value > 0 ? `+${tempStatus.value.toFixed(1)}` : tempStatus.value.toFixed(1)}°
                            </div>
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border bg-slate-50 dark:bg-slate-900 ${tempStatus.color}`}>
                                {tempStatus.label}
                            </span>
                        </div>
                    </div>
                    
                    <div className="w-full md:w-auto bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl max-w-xs">
                        <div className="flex items-center gap-2 mb-2 text-indigo-500 font-bold text-[10px] uppercase tracking-widest">
                            <HelpCircle size={12}/> Lecture
                        </div>
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                            Quand la météo est "Chaude" (Barres Vertes), les sommes totales augmentent. Quand elle est "Froide" (Zone violette), les sommes diminuent. Jouez en conséquence (suivre ou contrer).
                        </p>
                    </div>
                </div>

                <div className="h-64 w-full relative z-10">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                            <XAxis dataKey="drawIndex" hide />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                            <ReferenceLine y={0} stroke="#94a3b8" opacity={0.3} strokeWidth={2} />
                            
                            <Bar dataKey="momentum" fill="#10b981" radius={[2, 2, 0, 0]} barSize={4} name="Chaleur (Momentum)" />
                            <Area type="monotone" dataKey="signal" stroke="#6366f1" strokeWidth={3} fill="url(#colorSignal)" fillOpacity={0.2} name="Tendance de Fond" />
                            
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

        {/* RUNS TEST (SIMPLIFIÉ) */}
        {report.runsTest && (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] shadow-xl border border-indigo-100 dark:border-indigo-900/50">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                            <RotateCw className="text-indigo-600" /> Qualité du Mélange
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-widest">Test d'Entropie (Wald-Wolfowitz)</p>
                    </div>
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black border tracking-widest uppercase ${report.runsTest.isRandom ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
                        {report.runsTest.isRandom ? "Brassage Naturel" : "Séquence Suspecte"}
                    </span>
                </div>
                
                <div className="grid md:grid-cols-2 gap-12">
                    <div className="space-y-6">
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-3xl space-y-4 border border-slate-100 dark:border-slate-800">
                            <div className="flex justify-between items-center cursor-help">
                                <span className="text-[10px] font-black text-slate-400 uppercase">Alternance (Cycles)</span>
                                <span className="text-sm font-black text-slate-800 dark:text-white">{report.runsTest.runs}</span>
                            </div>
                            
                            <div className="flex justify-between items-center cursor-help">
                                <span className="text-[10px] font-black text-slate-400 uppercase">Score Z (Normalité)</span>
                                <span className="text-sm font-black text-slate-800 dark:text-white">{report.runsTest.zScore.toFixed(2)}</span>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 italic leading-relaxed">
                            Un score Z proche de 0 indique un mélange parfait. S'il dépasse +/- 1.96, la suite de numéros est mathématiquement improbable (trop groupée ou trop alternée).
                        </p>
                    </div>

                    <div className="flex flex-col justify-center">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                             <Scale size={14}/> Jauge d'Aléatoire
                        </h4>
                        {renderZScoreGauge(report.runsTest.zScore)}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
