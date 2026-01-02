import React, { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import { generateMasterPrediction, getStrategyName } from '../../services/predictionEngine';
import { savePredictionToHistory } from '../../services/predictionHistoryService';
import { ExportService } from '../../services/reportService';
import type { Prediction, ScoreBreakdown, ForensicReport } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { OraclePerformance } from '../OraclePerformance'; 
import { OracleAnalyticsDashboard } from '../OracleAnalyticsDashboard'; 
import { PredictionForensics } from '../PredictionForensics';
import { ReliabilityMeter } from '../ReliabilityMeter';
import { AlgoRadar } from '../AlgoRadar';
import { QuantumTensionField } from '../QuantumTensionField';
import { NeuralHeatmapGrid } from '../NeuralHeatmapGrid';
import { FileText, Cpu, Sparkles, Zap, Target, Network, Binary, ThermometerSun, RefreshCw, Equal, TrendingUp, Shuffle, Dna } from 'lucide-react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip } from 'recharts';
import { useNexus } from '../NexusProvider';

interface PredictionTabProps { drawName: string; }

const NeuralConsensus: React.FC<{ breakdown?: Record<number, ScoreBreakdown>, suggested: number[] }> = ({ breakdown, suggested }) => {
    if (!breakdown || !suggested || suggested.length === 0) return null;
    const topNum = suggested[0];
    const scores = breakdown[topNum];
    if (!scores) return null;

    const data = [
        { subject: 'Temporel', A: Math.round(scores.temporal || 0), fullMark: 100 },
        { subject: 'Spectral', A: Math.round(scores.spectral || 0), fullMark: 100 },
        { subject: 'Momentum', A: Math.round(scores.momentum || 0), fullMark: 100 },
        { subject: 'Orchestr.', A: Math.round(scores.orchestration || 0), fullMark: 100 },
        { subject: 'Markov', A: Math.round(scores.markov || 0), fullMark: 100 },
        { subject: 'Transformer', A: Math.round(scores.transformer || 0), fullMark: 100 },
    ];
    return (
        <div className="bg-slate-900 border border-indigo-500/30 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group h-full">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-12 transition-transform duration-1000"><Network size={80} /></div>
            <h4 className="text-white font-black text-lg flex items-center gap-3 mb-8 relative z-10">
                <span className="p-2 bg-indigo-600 rounded-xl"><Cpu size={18}/></span>Tension Convergence
            </h4>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
                        <PolarGrid stroke="#334155" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'black' }} />
                        <Radar name="Intensité" dataKey="A" stroke="#6366f1" strokeWidth={3} fill="#6366f1" fillOpacity={0.6} />
                        <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff' }} />
                    </RadarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export const PredictionTab: React.FC<PredictionTabProps> = ({ drawName }) => {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const { 
    history, lastPrediction, setLastPrediction, loading: nexusLoading, 
    spectral, fractal, velocity, cliques, calibration, volatility, regime,
    globalWeights
  } = useNexus();
  
  const [computingIA, setComputingIA] = useState(false);
  const [strategyMode, setStrategyMode] = useState<string>('Standard');
  const [lastAuditReport, setLastAuditReport] = useState<ForensicReport | null>(null);
  
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    setStrategyMode(getStrategyName(globalWeights));
    return () => { isMounted.current = false; };
  }, [drawName, globalWeights]);

  const loadPrediction = useCallback(async () => {
    if (history.length < 25) { 
        showToast("Fenêtre de données insuffisante (Min 25 tirages).", "error"); 
        return; 
    }
    
    setComputingIA(true);
    showToast("Activation des neurones adaptatifs...", "info");

    startTransition(async () => {
        try {
          const res = await generateMasterPrediction(
              drawName, 
              history, 
              globalWeights, 
              { spectral, fractal, velocity, cliques }
          );

          if (isMounted.current) {
              setLastPrediction(res);
              await savePredictionToHistory(drawName, res);
              setStrategyMode(getStrategyName(globalWeights));
              showToast("Consensus établi (Mode Adaptatif).", "success");
          }
        } catch (e: any) {
          console.error("IA Collision:", e);
          showToast("Échec Inférence.", "error");
        } finally {
          if (isMounted.current) setComputingIA(false);
        }
    });
  }, [drawName, history, spectral, fractal, velocity, cliques, setLastPrediction, showToast, globalWeights]);

  const getRegimeIcon = () => {
      if (!regime) return <Binary size={18} />;
      if (regime.hurst > 0.6) return <TrendingUp size={18} />;
      if (regime.hurst < 0.4) return <Equal size={18} />;
      return <Shuffle size={18} />;
  };

  const getRegimeLabel = () => {
      if (!regime) return "Standard";
      if (regime.hurst > 0.6) return "Persistant (Suivi de Tendance)";
      if (regime.hurst < 0.4) return "Anti-Persistant (Retour Moyenne)";
      return "Chaotique (Défense Probabiliste)";
  };

  if (nexusLoading || (computingIA && !lastPrediction)) return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-8 animate-fade-in bg-slate-900/10 rounded-[4rem] border border-dashed border-indigo-200">
          <div className="relative">
              <div className="w-24 h-24 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <Cpu className="absolute inset-0 m-auto text-indigo-600 w-10 h-10 animate-pulse" />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-black text-indigo-900 dark:text-indigo-400 uppercase tracking-widest">Calcul Neural Adaptatif</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">Utilisation de l'ADN Global v13...</p>
          </div>
      </div>
  );
  
  if (!lastPrediction) return (
        <div className="flex flex-col items-center justify-center min-h-[400px] bg-white dark:bg-slate-900/50 rounded-[4rem] p-10 shadow-2xl border border-slate-100 dark:border-slate-800 animate-fade-in">
            <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 rounded-3xl flex items-center justify-center mb-8 shadow-inner">
                <Sparkles size={40} className="text-indigo-600" />
            </div>
            <h3 className="text-3xl font-black mb-4 tracking-tighter text-slate-800 dark:text-white">Système Prêt</h3>
            <p className="text-slate-500 text-center max-w-sm mb-10 font-medium">L'infrastructure est stable. Prêt à extraire les vecteurs pour <strong>{drawName}</strong>.</p>
            <button 
                onClick={loadPrediction} 
                className="group px-12 py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2.5rem] font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all transform active:scale-95 flex items-center gap-4 text-sm"
            >
                <Zap size={20} className="fill-current group-hover:animate-pulse" /> ÉXÉCUTER INFÉRENCE
            </button>
        </div>
  );

  return (
    <div className={`space-y-8 animate-fade-in pb-16 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-center relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-125 transition-transform"><Target size={48}/></div>
                <div className="flex items-center gap-4 relative z-10">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-600 text-white shadow-lg">
                        {getRegimeIcon()}
                    </div>
                    <div>
                        <h3 className="font-black text-slate-400 text-[9px] uppercase tracking-widest">Stratégie Adaptative</h3>
                        <span className="text-xs font-black dark:text-white leading-tight block max-w-[120px]">{getRegimeLabel()}</span>
                    </div>
                </div>
            </div>
            <div className="lg:col-span-1 bg-white dark:bg-gray-800 p-4 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col items-center">
                <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-[8px] font-black text-slate-400 uppercase">Signature ADN</h4>
                    <span className="text-[7px] font-black bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded flex items-center gap-1"><Dna size={8}/> ACTIF</span>
                </div>
                <AlgoRadar weights={globalWeights} height={160} />
            </div>
            <div className="lg:col-span-2">
                {calibration && <ReliabilityMeter calibration={calibration} />}
            </div>
        </div>

        {/* Zone Principale de l'Oracle */}
        <div className="bg-slate-950 rounded-[4rem] p-8 md:p-14 text-white shadow-2xl relative overflow-hidden group border border-white/5">
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[140px] -mr-48 -mt-48 pointer-events-none group-hover:bg-indigo-600/20 transition-all duration-1000"></div>
            <div className="relative z-10 flex flex-col xl:flex-row justify-between items-center gap-12 text-center xl:text-left">
                <div className="flex-1">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 rounded-full border border-white/10 mb-8">
                        <ThermometerSun size={14} className={(volatility?.score ?? 0) > 60 ? "text-orange-500" : "text-emerald-400"} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Inférence Dynamique (V={volatility?.score ?? 0}%)</span>
                    </div>
                    <h2 className="text-5xl md:text-8xl font-black tracking-tighter mb-8 leading-none">Confiance <span className="text-indigo-500">{lastPrediction.confidence}%</span></h2>
                    <p className="text-slate-400 text-xl italic font-medium leading-relaxed max-w-2xl mx-auto xl:mx-0 border-l-4 border-indigo-600/30 pl-8">
                        "{lastPrediction.analysis}"
                    </p>
                    <div className="mt-12 flex flex-wrap gap-4 items-center justify-center xl:justify-start">
                        <button onClick={loadPrediction} disabled={computingIA} className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/40 transition-all flex items-center gap-4 active:scale-95">
                            {computingIA ? <RefreshCw className="animate-spin" size={20}/> : <Zap size={20} className="fill-current" />} 
                            RECALCULER VECTEURS
                        </button>
                        <button onClick={() => ExportService.generatePredictionPDF(drawName, lastPrediction)} className="p-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[1.8rem] transition shadow-xl group/btn">
                            <FileText className="text-slate-500 group-hover/btn:text-white transition-colors" size={24} />
                        </button>
                    </div>
                </div>
                
                <div className="bg-black/40 backdrop-blur-3xl p-10 md:p-14 rounded-[4rem] border border-white/10 shadow-inner flex flex-col items-center min-w-[340px] transform hover:scale-[1.02] transition-all duration-500">
                    <span className="text-[11px] uppercase tracking-[0.4em] font-black text-indigo-400 mb-12 flex items-center gap-2">
                        <Sparkles size={14}/> Attracteurs Alpha
                    </span>
                    <div className="flex gap-5">
                        {lastPrediction.suggestedNumbers.slice(0, 5).map((n: number) => (
                            <NumberBall 
                                key={n} 
                                number={n} 
                                size="lg" 
                                confidence={lastPrediction.confidence} 
                                isAttractor={true} 
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8"><OraclePerformance drawName={drawName} /></div>
            <div className="lg:col-span-4"><NeuralConsensus breakdown={lastPrediction.breakdown} suggested={lastPrediction.suggestedNumbers} /></div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
            {lastPrediction.breakdown && <QuantumTensionField breakdown={lastPrediction.breakdown} suggestedNumbers={lastPrediction.suggestedNumbers} />}
            {lastPrediction.breakdown && <NeuralHeatmapGrid breakdown={lastPrediction.breakdown} suggestedNumbers={lastPrediction.suggestedNumbers} />}
        </div>
        
        <OracleAnalyticsDashboard breakdown={lastPrediction.breakdown} suggestedNumbers={lastPrediction.suggestedNumbers} />
        
        {lastAuditReport && <PredictionForensics report={lastAuditReport} onClose={() => setLastAuditReport(null)} />}
    </div>
  );
};