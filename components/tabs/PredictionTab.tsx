
import React, { useState, useEffect, useCallback } from 'react';
import { useNexus } from '../NexusProvider';
import { generateMasterPrediction, getStrategyName } from '../../services/predictionEngine';
import { savePredictionToHistory } from '../../services/predictionHistoryService';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { NeuralHeatmapGrid } from '../NeuralHeatmapGrid';
import { ReliabilityMeter } from '../ReliabilityMeter';
import { Zap, Cpu, Activity, Info, ShieldCheck, Layers, Binary, Target, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

export const PredictionTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { showToast } = useToast();
    const { 
        history, lastPrediction, setLastPrediction, loading: nexusLoading,
        globalWeights, spectral, wavelet, correlationMatrix, regularity, calibration
    } = useNexus();

    const [isComputing, setIsComputing] = useState(false);

    const runInference = useCallback(async () => {
        if (history.length < 20) {
            showToast("Dataset insuffisant (Min 20).", "error");
            return;
        }
        setIsComputing(true);
        showToast("Initialisation du Noyau v12.5...", "info");

        try {
            const res = await generateMasterPrediction(drawName, history, globalWeights, {
                spectral, wavelet, correlationMatrix, regularity
            });
            setLastPrediction(res);
            await savePredictionToHistory(drawName, res);
            showToast("Vecteurs stabilisés.", "success");
        } catch (e) {
            showToast("Collision synaptique détectée.", "error");
        } finally {
            setIsComputing(false);
        }
    }, [drawName, history, globalWeights, spectral, wavelet, correlationMatrix, regularity, setLastPrediction, showToast]);

    if (nexusLoading) return <div className="p-20 text-center animate-pulse text-indigo-500">Synchronisation des neurones...</div>;

    if (!lastPrediction) return (
        <div className="flex flex-col items-center justify-center min-h-[400px] bg-slate-900/50 rounded-[4rem] border border-white/5 animate-fade-in">
            <Cpu size={64} className="text-indigo-500 mb-8 animate-pulse" />
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-4">Système Prêt</h3>
            <button 
                onClick={runInference}
                className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-3xl font-black uppercase tracking-widest shadow-2xl flex items-center gap-4 transition-all active:scale-95"
            >
                <Zap fill="currentColor" /> Lancer Inférence
            </button>
        </div>
    );

    return (
        <div className="space-y-10 animate-fade-in pb-20">
            {/* HUD PRINCIPAL */}
            <div className="grid lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8">
                    <div className="bg-slate-950 p-10 rounded-[3.5rem] border border-indigo-500/20 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Target size={180} /></div>
                        
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-12">
                                <div>
                                    <div className="flex items-center gap-3 text-indigo-400 mb-2">
                                        <ShieldCheck size={18} />
                                        <span className="text-[10px] font-black uppercase tracking-[0.4em]">Vecteurs de Tendance Élite</span>
                                    </div>
                                    <h2 className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-none">
                                        Confiance <span className="text-indigo-500">{lastPrediction.confidence}%</span>
                                    </h2>
                                </div>
                                <div className="text-right">
                                    <div className="px-3 py-1 bg-white/10 rounded-full border border-white/10 text-[9px] font-black text-slate-400 uppercase mb-2">Build 12.5.4</div>
                                    <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest">{getStrategyName(lastPrediction.usedWeights!)}</div>
                                </div>
                            </div>

                            <div className="flex gap-4 md:gap-8 justify-center lg:justify-start mb-12 flex-wrap">
                                {lastPrediction.suggestedNumbers.map((n, i) => (
                                    <motion.div 
                                        key={n} 
                                        initial={{ scale: 0, rotate: -20 }} 
                                        animate={{ scale: 1, rotate: 0 }} 
                                        transition={{ delay: i * 0.1, type: 'spring' }}
                                    >
                                        <NumberBall number={n} size="lg" isAttractor={i < 2} />
                                    </motion.div>
                                ))}
                            </div>

                            <div className="bg-white/5 p-6 rounded-3xl border border-white/5 backdrop-blur-md">
                                <p className="text-slate-300 text-sm italic font-medium leading-relaxed">
                                    "{lastPrediction.analysis}"
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                    <ReliabilityMeter calibration={calibration!} />
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Binary size={14} /> Autres Candidats</h4>
                        <div className="flex flex-wrap gap-3">
                            {lastPrediction.candidates.slice(0, 8).map(n => <NumberBall key={n} number={n} size="sm" />)}
                        </div>
                    </div>
                </div>
            </div>

            {/* HEATMAP TENSORIELLE */}
            <section className="space-y-6">
                <div className="flex items-center gap-3 px-4">
                    <Layers className="text-indigo-500" />
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">Analyse Tensoriale du Spectre</h3>
                </div>
                <NeuralHeatmapGrid breakdown={lastPrediction.breakdown} suggestedNumbers={lastPrediction.suggestedNumbers} />
            </section>
        </div>
    );
};
