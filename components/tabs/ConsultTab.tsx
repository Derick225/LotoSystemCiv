import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    fetchNextDrawProjections, 
    fetchTopFollowersAnalysis, 
    fetchAssociatedNumbers 
} from '../../services/lotteryService';
import { getMomentumScores, getVelocityScores, calculateHurstForNumber } from '../../services/mathService';
import { analyzeForManipulation, generateShadowOracleVector, type ForensicAuditResult } from '../../services/forensicAuditService';
import { getSpatialScores } from '../../services/spatialService';
import { getUniqueSortedNumbers } from '../../utils/arrayUtils';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { CrossDrawPrediction } from '../CrossDrawPrediction';
import type { TopFollowerAnalysis, ProjectionItem, SpectralMetric } from '../../types';
import { 
    Zap, Atom, TrendingUp, 
    Share2, ShieldAlert, Ghost, RefreshCw,
    Fingerprint, Terminal, Scan, Shield, Search, Activity, Cpu, ArrowRight, Target, Microscope
} from 'lucide-react';
import { useNexus } from '../NexusProvider';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from 'recharts';

interface QuantumProfile {
    number: number;
    stats: { freq: number; currentGap: number; avgGap: number; regularity: string; stdDev: number; };
    physics: { spectralEnergy: number; spatialHeat: number; velocity: number; momentum: number; hurst: number };
    social: { affinities: { num: number; score: number }[]; nemesis: { num: number; score: number }[]; following: { num: number; count: number }[]; };
    prediction: { probability: number; verdict: string; color: string; };
    idealMatch: { gap: number; energy: number; velocity: number; hurst: number; };
}

interface ConsultTabProps { drawName: string; }

export const ConsultTab: React.FC<ConsultTabProps> = ({ drawName }) => {
  const { showToast } = useToast();
  const { history, gaps, spectral, regularity: regularityData, correlationMatrix, loading: nexusLoading } = useNexus(); 
  
  const [mode, setMode] = useState<'single' | 'projection' | 'leaders' | 'crossdraw' | 'anti-fraud'>('single');

  const [numberInput, setNumberInput] = useState<string>('');
  const [quantumProfile, setQuantumProfile] = useState<QuantumProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [projResult, setProjResult] = useState<ProjectionItem[] | null>(null);
  const [projLoading, setProjLoading] = useState(false);
  const [leadersData, setLeadersData] = useState<TopFollowerAnalysis[]>([]);
  const [leadersLoading, setLeadersLoading] = useState(false);
  
  const [fraudInputs, setFraudInputs] = useState<string[]>(['', '', '', '', '']);
  const [fraudAudit, setFraudAudit] = useState<ForensicAuditResult | null>(null);
  const [fraudLoading, setFraudLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  
  const isMounted = useRef(true);

  useEffect(() => {
      isMounted.current = true;
      return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
      if (mode === 'leaders' && leadersData.length === 0 && history.length > 0) loadLeadersAnalysis();
      if (mode === 'projection' && !projResult && history.length > 0) handleProjection();
  }, [mode, drawName, history]);

  const loadLeadersAnalysis = async () => {
      if (isMounted.current) setLeadersLoading(true);
      try {
          const data = await fetchTopFollowersAnalysis(drawName, history);
          if (isMounted.current) setLeadersData(data);
      } catch (e) { 
          if (isMounted.current) showToast("Erreur leaders", "error"); 
      } finally { 
          if (isMounted.current) setLeadersLoading(false); 
      }
  };

  const handleConsultSingle = async () => {
      const num = parseInt(numberInput);
      if (isNaN(num) || num < 1 || num > 90) { showToast("Vecteur invalide (1-90)", "error"); return; }
      if (isMounted.current) setLoading(true);
      
      try {
          const gapInfo = gaps.find(g => g.number === num);
          const regInfo = regularityData.find(r => r.number === num);
          const specInfo = spectral.find(s => s.number === num);
          const freq = history.filter(h => h.gagnants.includes(num)).length;
          
          const [velocityScores, momentumScores, associated] = await Promise.all([
              getVelocityScores(history),
              getMomentumScores(history),
              fetchAssociatedNumbers(num, drawName, history)
          ]);
          
          const spatialScores = getSpatialScores(history);
          const hurstInfo = calculateHurstForNumber(num, history);
          const affinitiesMap = correlationMatrix[num]?.affinities || {};
          
          const sortedAffinities = Object.entries(affinitiesMap)
            .map(([n, s]: [string, any]) => ({ num: Number(n), score: s as number }))
            .sort((a, b) => b.score - a.score)
            .filter(item => item.score > 0.15)
            .slice(0, 5);

          const nemesis = Object.entries(affinitiesMap)
            .map(([n, s]: [string, any]) => ({ num: Number(n), score: s as number }))
            .filter(item => item.score <= 0.05)
            .slice(0, 5);
          
          const spectralScore = Number(specInfo?.energy || 0);
          const regScore = regInfo ? (regInfo.stdDev < 1.5 ? 100 : Math.max(0, (8 - regInfo.stdDev) * 12.5)) : 50;
          const velocity = velocityScores[num] || 50;
          const spatial = spatialScores[num] || 0;
          
          const globalScore = Math.round((spectralScore * 0.4) + (Number(spatial) * 0.15) + (Number(regScore) * 0.2) + (Number(velocity) * 0.25));
          let verdict = "Neutre"; let color = "text-slate-500";
          if (globalScore >= 78) { verdict = "Elite Convergence"; color = "text-emerald-500"; }
          else if (globalScore >= 58) { verdict = "Vecteur Actif"; color = "text-indigo-500"; }
          else if (globalScore <= 35) { verdict = "Retrait Signal"; color = "text-rose-500"; }

          const idealMatch = {
              energy: 75,
              velocity: 60,
              hurst: 55
          };

          if (isMounted.current) {
              setQuantumProfile({ 
                number: num, 
                stats: { freq, currentGap: gapInfo?.gap || 0, avgGap: regInfo?.avgGap || 0, regularity: regInfo ? (regInfo.stdDev < 2 ? "Fidèle" : "Volatile") : "N/A", stdDev: regInfo?.stdDev || 0 }, 
                physics: { spectralEnergy: spectralScore, spatialHeat: Math.round(Number(spatial)), velocity: Math.round(Number(velocity)), momentum: Math.round((momentumScores[num] || 0) / 10), hurst: Math.round(hurstInfo.hurst * 100) }, 
                social: { affinities: sortedAffinities, nemesis, following: associated.following.map(f => ({ num: f.number, count: f.count })) }, 
                prediction: { probability: globalScore, verdict, color },
                idealMatch: { ...idealMatch, gap: 50 }
              });
          }
      } catch (e) { 
          console.error(e);
          if (isMounted.current) showToast("Échec profil Quantum", "error"); 
      } finally { 
          if (isMounted.current) setLoading(false); 
      }
  };

  const handleProjection = async () => {
      if (isMounted.current) setProjLoading(true);
      try {
          if (history.length === 0) throw new Error("Database offline.");
          const proj = await fetchNextDrawProjections(drawName, history[0].gagnants, history);
          if (isMounted.current) setProjResult(proj as ProjectionItem[]);
      } catch (e) { 
          if (isMounted.current) showToast("Erreur projection", "error"); 
      } finally { 
          if (isMounted.current) setProjLoading(false); 
      }
  };

  const handleAuditFraud = async () => {
      const unique = getUniqueSortedNumbers(fraudInputs);
      if (unique.length !== 5) { showToast("Séquence de 5 numéros requise.", "error"); return; }
      
      if (isMounted.current) {
          setFraudLoading(true);
          setIsScanning(true);
          setFraudAudit(null);
      }

      await new Promise(r => setTimeout(r, 2200));

      try {
          const audit = analyzeForManipulation(unique, history);
          if (isMounted.current) {
              setFraudAudit(audit);
              showToast("Audit Forensique v4.0 Finalisé.", "success");
          }
      } catch (e) { 
          if (isMounted.current) showToast("Audit Interrompu.", "error"); 
      } finally { 
          if (isMounted.current) {
              setFraudLoading(false); 
              setIsScanning(false);
          }
      }
  };

  const handleGenerateShadowOracle = async () => {
      if (isMounted.current) setFraudLoading(true);
      try {
          const spectralMap = spectral.reduce((acc: Record<number, number>, m: SpectralMetric) => {
              acc[m.number] = m.energy;
              return acc;
          }, {});
          
          const vector = generateShadowOracleVector(history, spectralMap);
          if (isMounted.current) {
              setFraudInputs(vector.map(String));
              setFraudAudit(null);
              showToast("Vecteur de Rupture Isolé (Shadow).", "info");
          }
      } catch (e) { 
          if (isMounted.current) showToast("Échec Oracle Shadow.", "error"); 
      } finally { 
          if (isMounted.current) setFraudLoading(false); 
      }
  };

  if (nexusLoading) return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-8 animate-pulse">
          <RefreshCw className="animate-spin text-indigo-500" size={56} />
          <p className="text-xs font-black text-slate-400 uppercase tracking-[0.4em]">Initialisation Nexus Consulting...</p>
      </div>
  );

  const renderContent = () => {
      switch(mode) {
          case 'projection':
              return (
                  <div className="animate-slide-up space-y-6">
                      <div className="bg-slate-900 p-6 md:p-8 rounded-[3rem] text-white flex flex-col md:flex-row justify-between items-center gap-6 border border-slate-800">
                          <div className="text-center md:text-left">
                              <h3 className="text-xl md:text-2xl font-black flex items-center justify-center md:justify-start gap-3"><Zap className="text-indigo-400"/> Inférence J+1</h3>
                              <p className="text-slate-400 text-xs md:text-sm mt-1">Modélisation markovienne des transitions immédiates.</p>
                          </div>
                          <button onClick={handleProjection} disabled={projLoading} className="w-full md:w-auto px-8 py-3 bg-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl active:scale-95">
                              {projLoading ? <RefreshCw className="animate-spin" size={16}/> : <Target size={16}/>} RELANCER
                          </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          {projResult?.map((p, i) => (
                              <div key={p.number} className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border border-slate-100 flex flex-col items-center gap-4 hover:border-indigo-400 transition-all shadow-sm">
                                  <span className="text-[10px] font-black text-slate-400 uppercase">Vecteur #{i+1}</span>
                                  <NumberBall number={p.number} size="md" confidence={p.probability} />
                                  <div className="text-2xl font-black text-indigo-600">{p.probability}%</div>
                              </div>
                          ))}
                      </div>
                  </div>
              );
          case 'anti-fraud':
              return (
                  <div className="animate-slide-up space-y-8">
                        <div className="bg-slate-950 p-6 md:p-8 rounded-[3rem] border border-rose-500/20 shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:rotate-12 transition-transform duration-1000"><ShieldAlert size={120} className="text-rose-500"/></div>
                            <h3 className="text-xl md:text-2xl font-black text-white flex items-center gap-4 mb-6"><Microscope className="text-rose-500" /> Moniteur Forensique</h3>
                            <div className="grid md:grid-cols-2 gap-10">
                                <div className="space-y-6">
                                    <div className="grid grid-cols-5 gap-2">
                                        {fraudInputs.map((val, idx) => (
                                            <input key={idx} type="number" value={val} onChange={(e) => { const n = [...fraudInputs]; n[idx] = e.target.value; setFraudInputs(n); }} className="w-full h-10 md:h-12 bg-white/5 border border-white/10 rounded-xl text-center text-white font-black text-base md:text-xl outline-none focus:border-rose-500" placeholder="?" />
                                        ))}
                                    </div>
                                    <div className="flex gap-4">
                                        <button onClick={handleAuditFraud} disabled={fraudLoading} className="flex-1 py-4 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 uppercase text-[10px] tracking-widest">
                                            {fraudLoading ? <RefreshCw className="animate-spin" size={16}/> : <Scan size={16}/>} ANALYSER
                                        </button>
                                        <button onClick={handleGenerateShadowOracle} disabled={fraudLoading} className="p-4 bg-slate-800 text-slate-400 rounded-2xl hover:text-white transition-colors" title="Oracle Shadow"><Ghost size={20}/></button>
                                    </div>
                                </div>
                                <div className="bg-white/5 p-6 rounded-[2.5rem] border border-white/5 flex flex-col justify-center items-center text-center">
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Suspicion Manipulation</div>
                                    <div className={`text-5xl md:text-6xl font-black ${fraudAudit ? (fraudAudit.suspicionScore > 60 ? 'text-rose-500' : 'text-emerald-400') : 'text-slate-800'}`}>
                                        {fraudAudit ? fraudAudit.suspicionScore + '%' : '--'}
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-4 italic max-w-xs">Analyse linéarité, écho T-1 et conformité Benford.</p>
                                </div>
                            </div>
                        </div>
                  </div>
              );
          case 'single':
              return (
                  <div className="animate-slide-up space-y-6">
                        <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-8">
                            <div className="relative">
                                <input type="number" value={numberInput} onChange={(e) => setNumberInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleConsultSingle()} className="w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-indigo-600 dark:bg-slate-900 text-center text-3xl md:text-4xl font-black outline-none focus:ring-4 ring-indigo-500/20" placeholder="?" />
                                <div className="absolute -bottom-2 -right-2 bg-indigo-600 text-white p-2 rounded-lg shadow-lg"><Search size={16}/></div>
                            </div>
                            <div className="flex-1 text-center md:text-left">
                                <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Diagnostic Quantum</h3>
                                <p className="text-slate-500 text-xs md:text-sm mt-1">Saisissez un vecteur pour extraire son empreinte stochastique.</p>
                            </div>
                            <button onClick={handleConsultSingle} disabled={loading} className="w-full md:w-auto px-8 py-4 bg-slate-900 text-white font-black rounded-2xl shadow-xl transition-all hover:bg-indigo-600 uppercase text-[10px] tracking-widest">
                                {loading ? 'ÉXÉCUTION...' : 'EXTRAIRE PROFIL'}
                            </button>
                        </div>
                        {quantumProfile && (
                            <div className="grid lg:grid-cols-3 gap-6 animate-scale-in">
                                <div className="bg-slate-900 p-8 rounded-[3rem] text-white flex flex-col items-center justify-between min-h-[300px]">
                                    <NumberBall number={quantumProfile.number} size="xl" />
                                    <div className={`text-xl md:text-2xl font-black mt-6 ${quantumProfile.prediction.color}`}>{quantumProfile.prediction.verdict}</div>
                                    <div className="text-5xl md:text-6xl font-black mt-4">{quantumProfile.prediction.probability}%</div>
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Confiance Oracle</div>
                                </div>
                                <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[3rem] shadow-sm border border-slate-100 space-y-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="font-black text-slate-400 uppercase text-[10px] tracking-[0.3em]">Profil Physique vs Idéal</h4>
                                        <span className="text-[9px] bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-500 font-bold uppercase">Radar Match</span>
                                    </div>
                                    
                                    <div className="grid md:grid-cols-2 gap-8">
                                        <div className="h-48 md:h-56 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                                                    { subject: 'Energy', A: quantumProfile.physics.spectralEnergy, B: quantumProfile.idealMatch.energy, fullMark: 100 },
                                                    { subject: 'Heat', A: quantumProfile.physics.spatialHeat, B: 50, fullMark: 100 },
                                                    { subject: 'Velocity', A: Math.min(100, Math.abs(quantumProfile.physics.velocity) * 10), B: quantumProfile.idealMatch.velocity, fullMark: 100 },
                                                    { subject: 'Hurst', A: quantumProfile.physics.hurst, B: quantumProfile.idealMatch.hurst, fullMark: 100 },
                                                    { subject: 'Momentum', A: quantumProfile.physics.momentum * 10, B: 60, fullMark: 100 },
                                                ]}>
                                                    <PolarGrid stroke="#e5e7eb" />
                                                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 8, fill: '#94a3b8', fontWeight: 'bold' }} />
                                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                                    <Radar name="Actuel" dataKey="A" stroke="#6366f1" strokeWidth={2} fill="#6366f1" fillOpacity={0.4} />
                                                    <Radar name="Idéal" dataKey="B" stroke="#10b981" strokeWidth={1} fill="#10b981" fillOpacity={0.1} strokeDasharray="4 4" />
                                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                                                </RadarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 md:gap-4 h-fit">
                                            {[
                                                { label: 'Énergie Spectrale', val: quantumProfile.physics.spectralEnergy + '%' },
                                                { label: 'Densité Spatiale', val: quantumProfile.physics.spatialHeat + '%' },
                                                { label: 'Vélocité Flux', val: quantumProfile.physics.velocity + 't' },
                                                { label: 'Hurst Index', val: (quantumProfile.physics.hurst / 100).toFixed(2) }
                                            ].map(stat => (
                                                <div key={stat.label} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                                    <div className="text-[11px] font-black text-slate-800 dark:text-white leading-none">{stat.val}</div>
                                                    <div className="text-[7px] md:text-[8px] font-bold text-slate-500 uppercase mt-1">{stat.label}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                  </div>
              );
          case 'crossdraw': return <CrossDrawPrediction currentDrawName={drawName} />;
          default: return null;
      }
  };

  return (
    <div className="space-y-6 md:space-y-10 animate-fade-in pb-20 w-full overflow-hidden px-1 md:px-0">
      <div className="relative">
        <div className="overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 mask-fade-right">
            <div className="flex gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-[1.8rem] md:rounded-[2.5rem] w-max border border-slate-200 dark:border-slate-700 shadow-inner">
                {[
                    { id: 'single', icon: <Atom size={16}/>, label: 'Quantum' },
                    { id: 'projection', icon: <Zap size={16}/>, label: 'J+1' },
                    { id: 'anti-fraud', icon: <ShieldAlert size={16}/>, label: 'Audit' },
                    { id: 'crossdraw', icon: <Share2 size={16}/>, label: 'Transloc' },
                    { id: 'leaders', icon: <TrendingUp size={16}/>, label: 'Leaders' },
                ].map(m => (
                    <button 
                        key={m.id} 
                        onClick={() => setMode(m.id as any)} 
                        className={`px-5 py-2.5 md:py-3.5 rounded-[1.5rem] md:rounded-[1.8rem] text-[9px] md:text-[10px] font-black transition-all whitespace-nowrap flex items-center gap-2.5 flex-shrink-0 ${mode === m.id ? 'bg-white dark:bg-slate-700 shadow-xl text-indigo-600 dark:text-white scale-105 z-10' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        {m.icon} <span>{m.label}</span>
                    </button>
                ))}
            </div>
        </div>
      </div>
      <div className="transition-all duration-500 min-h-[400px]">
        {renderContent()}
      </div>
    </div>
  );
};