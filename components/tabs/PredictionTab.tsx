import React, { useState, useEffect, useRef, useCallback, useTransition } from 'react';
// Added missing import for motion
import { motion } from 'framer-motion';
import { generateMasterPrediction, getStrategyName } from '../../services/predictionEngine';
import { savePredictionToHistory } from '../../services/predictionHistoryService';
import { ExportService } from '../../services/exportService';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { OraclePerformance } from '../OraclePerformance'; 
import { OracleAnalyticsDashboard } from '../OracleAnalyticsDashboard'; 
import { ReliabilityMeter } from '../ReliabilityMeter';
import { AlgoRadar } from '../AlgoRadar';
import { QuantumTensionField } from '../QuantumTensionField';
import { NeuralHeatmapGrid } from '../NeuralHeatmapGrid';
import { NeuralEvolutionDashboard } from '../NeuralEvolutionDashboard';
import { FileText, Cpu, Sparkles, Zap, Target, Binary, ThermometerSun, RefreshCw, Equal, TrendingUp, Shuffle, Dna, Info, AlertTriangle, ShieldCheck, Magnet, Fingerprint, Lock, Layers, Network } from 'lucide-react';
import { useNexus } from '../NexusProvider';

interface PredictionTabProps { drawName: string; }

export const PredictionTab: React.FC<PredictionTabProps> = ({ drawName }) => {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const { 
    history, lastPrediction, setLastPrediction, loading: nexusLoading, 
    spectral, fractal, velocity, cliques, calibration, volatility, regime,
    globalWeights, rlState
  } = useNexus();
  
  const [computingIA, setComputingIA] = useState(false);
  const [strategyMode, setStrategyMode] = useState<string>('Standard');
  
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    if (globalWeights) {
        setStrategyMode(getStrategyName(globalWeights));
    }
    return () => { isMounted.current = false; };
  }, [drawName, globalWeights]);

  const loadPrediction = useCallback(async () => {
    if (history.length < 25) { 
        showToast("Fenêtre de données insuffisante (Min 25 tirages).", "error"); 
        return; 
    }
    
    setComputingIA(true);
    showToast(`Convergence Nexus en cours...`, "info");

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
              showToast("Vecteurs de convergence stabilisés.", "success");
          }
        } catch (e: any) {
          console.error("Nexus Collision:", e);
          showToast("Échec Inférence.", "error");
        } finally {
          if (isMounted.current) setComputingIA(false);
        }
    });
  }, [drawName, history, spectral, fractal, velocity, cliques, setLastPrediction, showToast, globalWeights]);

  const getRiskLevel = (vol: number) => {
      if (vol < 30) return { label: 'Faible', color: 'text-emerald-500', bg: 'bg-emerald-500/10', icon: <ShieldCheck size={16}/> };
      if (vol < 60) return { label: 'Modéré', color: 'text-amber-500', bg: 'bg-amber-500/10', icon: <Info size={16}/> };
      return { label: 'Élevé', color: 'text-rose-500', bg: 'bg-rose-500/10', icon: <AlertTriangle size={16}/> };
  };

  if (nexusLoading || (computingIA && !lastPrediction)) return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-8 animate-fade-in bg-slate-900/10 rounded-[4rem] border border-dashed border-indigo-200">
          <div className="relative">
              <div className="w-24 h-24 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <Cpu className="absolute inset-0 m-auto text-indigo-600 w-10 h-10 animate-pulse" />
          </div>
          <div className="text-center px-6">
            <h3 className="text-xl font-black text-indigo-900 dark:text-indigo-400 uppercase tracking-widest">Inférence Multimodale</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">Fusion des moteurs Stochastique, ML et Fractal...</p>
          </div>
      </div>
  );
  
  if (!lastPrediction) return (
        <div className="flex flex-col items-center justify-center min-h-[400px] bg-white dark:bg-slate-900/50 rounded-[4rem] p-10 shadow-2xl border border-slate-100 dark:border-slate-800 animate-fade-in">
            <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 rounded-3xl flex items-center justify-center mb-8 shadow-inner">
                <Sparkles size={40} className="text-indigo-600" />
            </div>
            <h3 className="text-3xl font-black mb-4 tracking-tighter text-slate-800 dark:text-white">Nexus Prêt</h3>
            <div className="flex items-center gap-2 mb-10 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700">
                <Lock size={12} className="text-emerald-500"/>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Stratégie Active : {strategyMode}</span>
            </div>
            <button 
                onClick={loadPrediction} 
                className="group px-12 py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2.5rem] font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all transform active:scale-95 flex items-center gap-4 text-sm"
            >
                <Zap size={20} className="fill-current group-hover:animate-pulse" /> ÉXÉCUTER SCAN CONSENSUS
            </button>
        </div>
  );

  const risk = getRiskLevel(volatility?.score || 0);

  return (
    <div className={`space-y-8 animate-fade-in pb-16 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
        
        {/* Consensus Monitoring Area */}
        <div className="grid lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8">
                <div className="bg-slate-950 p-8 rounded-[3.5rem] border border-indigo-500/20 shadow-2xl h-full flex flex-col justify-between overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-6 transition-transform"><Target size={120} /></div>
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h4 className="text-indigo-400 font-black text-xs uppercase tracking-[0.4em] mb-1">Analyse Triple-Noyau</h4>
                                <h3 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Moniteur de Consensus</h3>
                            </div>
                            <div className="px-3 py-1 bg-white/10 rounded-full border border-white/10 text-[9px] font-black uppercase text-indigo-300">Vecteur v12.0</div>
                        </div>

                        <div className="space-y-8">
                            {(lastPrediction as any).consensus?.map((c: any) => (
                                <div key={c.engine} className="space-y-2">
                                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                        <span className="text-slate-500">{c.engine.replace('_', ' ')}</span>
                                        <span className="text-indigo-400">{c.score}% Match</span>
                                    </div>
                                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${c.score}%` }}
                                            transition={{ duration: 1.5, ease: "easeOut" }}
                                            className="h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]" 
                                        />
                                    </div>
                                    <div className="flex gap-1.5 mt-2">
                                        {c.topNumbers.slice(0, 5).map((n: number) => (
                                            <span key={n} className="text-[9px] font-mono font-bold text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">{n}</span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div className="mt-10 p-5 bg-white/5 rounded-[2rem] border border-white/5 flex items-center gap-4 relative z-10">
                        <Layers size={24} className="text-indigo-500" />
                        <p className="text-[10px] text-slate-400 font-medium leading-relaxed italic">
                            "Le consensus est calculé par l'agrégation pondérée des moteurs probabilistes. Un score > 80% indique une convergence synaptique de haute certitude."
                        </p>
                    </div>
                </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
                <NeuralEvolutionDashboard rlState={rlState} drawName={drawName} />
                <ReliabilityMeter calibration={calibration!} />
            </div>
        </div>

        {/* Global Result Hero */}
        <div className="bg-slate-950 rounded-[4rem] p-8 md:p-14 text-white shadow-2xl relative overflow-hidden group border border-white/5">
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[140px] -mr-48 -mt-48 pointer-events-none group-hover:bg-indigo-600/20 transition-all duration-1000"></div>
            <div className="relative z-10 flex flex-col xl:flex-row justify-between items-center gap-12 text-center xl:text-left">
                <div className="flex-1">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 rounded-full border border-white/10 mb-8">
                        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${(volatility?.score ?? 0) > 60 ? "bg-rose-500" : "bg-emerald-400"}`}></div>
                        <span className="text-[10px] font-black uppercase tracking-widest">ADN : {strategyMode.toUpperCase()}</span>
                    </div>
                    <h2 className="text-5xl md:text-8xl font-black tracking-tighter mb-8 leading-none">Confiance <span className="text-indigo-500">{lastPrediction.confidence}%</span></h2>
                    
                    <div className="bg-white/5 p-6 rounded-3xl border border-white/5 backdrop-blur-sm mb-8 text-left">
                        <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Info size={12}/> Inférence Nexus</h5>
                        <p className="text-slate-300 text-sm italic font-medium leading-relaxed">
                            "{lastPrediction.analysis}"
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-4 items-center justify-center xl:justify-start">
                        <button onClick={loadPrediction} disabled={computingIA} className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/40 transition-all flex items-center gap-4 active:scale-95">
                            {computingIA ? <RefreshCw className="animate-spin" size={20}/> : <Zap size={20} className="fill-current" />} 
                            RÉGÉNÉRER
                        </button>
                        <button onClick={() => ExportService.generatePredictionPDF(drawName, lastPrediction)} className="p-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[1.8rem] transition shadow-xl group/btn">
                            <FileText className="text-slate-500 group-hover/btn:text-white transition-colors" size={24} />
                        </button>
                    </div>
                </div>
                
                <div className="bg-black/40 backdrop-blur-3xl p-10 md:p-14 rounded-[4rem] border border-white/10 shadow-inner flex flex-col items-center min-w-[340px] transform hover:scale-[1.02] transition-all duration-500">
                    <span className="text-[11px] uppercase tracking-[0.4em] font-black text-indigo-400 mb-12 flex items-center gap-2">
                        <Magnet size={14}/> Attracteurs Alpha
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

        <div className="grid lg:grid-cols-2 gap-8">
            {lastPrediction.breakdown && <QuantumTensionField breakdown={lastPrediction.breakdown} suggestedNumbers={lastPrediction.suggestedNumbers} />}
            {lastPrediction.breakdown && <NeuralHeatmapGrid breakdown={lastPrediction.breakdown} suggestedNumbers={lastPrediction.suggestedNumbers} />}
        </div>
        
        <OracleAnalyticsDashboard breakdown={lastPrediction.breakdown} suggestedNumbers={lastPrediction.suggestedNumbers} />
    </div>
  );
};