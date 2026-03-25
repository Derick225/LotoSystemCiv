
import React, { useState, useEffect } from 'react';
import { calculateShadowNumbers, calculateRunsTest, calculateTrendOscillator } from '../../services/mathService';
import type { MathAnalysisReport, ShadowNumbers, TrendOscillatorPoint } from '../../types';
import { 
    ResponsiveContainer, 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, BarChart, Bar, ComposedChart, Tooltip 
} from 'recharts';
import { StatsSkeleton } from '../skeletons/StatsSkeleton';
import { NumberBall } from '../NumberBall';
import { RotateCw, Activity, Layers, Target, AlertOctagon, ThermometerSun, HelpCircle, CheckCircle2, Waves, Wind } from 'lucide-react';
import { useNexusStore } from '../../store/useNexusStore';

interface MathTabProps {
  drawName: string;
}

export const MathTab: React.FC<MathTabProps> = ({ drawName }) => {
  const history = useNexusStore(state => state.history);
  const nexusLoading = useNexusStore(state => state.loading);
  const [report, setReport] = useState<MathAnalysisReport | null>(null);
  const [shadows, setShadows] = useState<ShadowNumbers | null>(null);
  const [trendData, setTrendData] = useState<TrendOscillatorPoint[]>([]);
  const [tempStatus, setTempStatus] = useState<{ value: number, label: string, color: string, icon: any, desc: string }>({ 
      value: 0, label: 'Neutre', color: 'text-slate-400', icon: <Waves />, desc: "Flux stabilisé." 
  });

  useEffect(() => {
    if (history.length > 0) {
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
        
        const osc = calculateTrendOscillator(history, 40);
        setTrendData(osc);
        
        const lastMomentum = osc[osc.length - 1]?.momentum || 0;
        if (lastMomentum > 20) setTempStatus({ value: lastMomentum, label: 'Surchauffe', color: 'text-orange-500', icon: <AlertOctagon />, desc: "Le système produit des anomalies fréquentes." });
        else if (lastMomentum < -20) setTempStatus({ value: lastMomentum, label: 'Bruit Blanc', color: 'text-indigo-500', icon: <Wind />, desc: "Déséquilibre vers le hasard pur." });
        else setTempStatus({ value: lastMomentum, label: 'Tempéré', color: 'text-emerald-500', icon: <CheckCircle2 />, desc: "Conditions optimales pour les patterns classiques." });
    }
  }, [history]);

  if (nexusLoading || !report) return <StatsSkeleton />;

  const renderZScoreGauge = (z: number) => {
      const clampedZ = Math.max(-4, Math.min(4, z));
      const percentage = ((clampedZ + 4) / 8) * 100;
      const isRandom = Math.abs(z) < 1.96;
      const color = isRandom ? 'bg-emerald-500' : 'bg-rose-500';
      
      return (
          <div className="space-y-3">
              <div className="flex justify-between text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                  <span>Rare</span>
                  <span>Normal</span>
                  <span>Rare</span>
              </div>
              <div className="h-3 md:h-4 w-full bg-slate-100 dark:bg-slate-900 rounded-full relative overflow-hidden border border-slate-200 dark:border-slate-800 shadow-inner">
                  <div className="absolute top-0 bottom-0 left-[37.5%] right-[37.5%] bg-emerald-500/10"></div>
                  <div 
                      className={`absolute top-0 bottom-0 w-2 rounded-full transition-all duration-1000 ${color} shadow-lg border-2 border-white dark:border-slate-900 z-10`}
                      style={{ left: `${percentage}%` }}
                  ></div>
              </div>
          </div>
      );
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in w-full overflow-hidden">
        {/* MÉTÉO DU FLUX - Stacked on Mobile */}
        <div className="bg-slate-900 text-white p-6 md:p-12 rounded-[2rem] md:rounded-[4rem] shadow-2xl border border-slate-800 relative overflow-hidden flex flex-col md:flex-row items-center gap-6 md:gap-10">
            <div className={`p-6 md:p-8 rounded-full ${tempStatus.color} bg-opacity-10 border-2 border-dashed border-current animate-pulse-slow shrink-0`}>
                {React.cloneElement(tempStatus.icon, { size: window.innerWidth < 640 ? 32 : 48 })}
            </div>
            
            <div className="flex-1 text-center md:text-left">
                <h3 className={`text-2xl md:text-4xl font-black uppercase tracking-tighter ${tempStatus.color}`}>
                    Flux {tempStatus.label}
                </h3>
                <p className="text-slate-400 mt-2 text-sm md:text-lg font-medium leading-relaxed">
                    {tempStatus.desc}
                </p>
                
                <div className="mt-6 md:mt-8 grid grid-cols-2 gap-4">
                    <div className="bg-white/5 p-3 md:p-4 rounded-xl md:rounded-2xl border border-white/5">
                        <div className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase mb-1">Score Z</div>
                        <div className="text-lg md:text-2xl font-black">{report.runsTest.zScore.toFixed(2)}</div>
                    </div>
                    <div className="bg-white/5 p-3 md:p-4 rounded-xl md:rounded-2xl border border-white/5">
                        <div className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase mb-1">Momentum</div>
                        <div className="text-lg md:text-2xl font-black text-indigo-400">{tempStatus.value.toFixed(1)}°</div>
                    </div>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
            {/* AUDIT DE BRASSAGE */}
            <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 space-y-6">
                <div className="flex items-center gap-3">
                    <RotateCw className="text-indigo-600" size={20} />
                    <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Audit de Brassage</h3>
                </div>
                <p className="text-xs md:text-sm text-slate-500 leading-relaxed font-medium">
                    Mesure la conformité du hasard sur les 100 derniers tirages.
                </p>
                {renderZScoreGauge(report.runsTest.zScore)}
                <div className={`p-3 md:p-4 rounded-xl md:rounded-2xl border text-center font-black text-[9px] md:text-xs uppercase tracking-widest ${report.runsTest.isRandom ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
                    Verdict : {report.runsTest.isRandom ? "Aléas Naturel" : "Anomalie Structurelle"}
                </div>
            </div>

            {/* GÉOMÉTRIE SHADOW */}
            {shadows && (
                <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-indigo-100 dark:border-indigo-900/50">
                    <div className="flex items-center gap-3 mb-6 md:mb-8">
                        <Layers className="text-indigo-600" size={20} />
                        <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Géométrie de l'Ombre</h3>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                        {[
                            { label: 'Sigma', val: shadows.sumModulo },
                            { label: 'Or', val: shadows.goldenNumber },
                            { label: 'Compl. 1', val: shadows.firstCompliment },
                            { label: 'Écart', val: shadows.gapLink }
                        ].map(item => (
                            <div key={item.label} className="bg-slate-50 dark:bg-slate-900 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 dark:border-slate-800 text-center transition-all">
                                <div className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 md:mb-2">{item.label}</div>
                                <div className="text-xl md:text-3xl font-black text-indigo-600 dark:text-indigo-400 font-mono">{item.val}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
