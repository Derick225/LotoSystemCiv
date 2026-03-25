
import React, { useState } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { runMassiveCalibration, TuningResult } from '../services/autoTunerService';
import { motion } from 'framer-motion';
import { Cpu, Save, RefreshCw, CheckCircle } from 'lucide-react';

export const AutoTuner: React.FC = () => {
    const history = useNexusStore(state => state.history);
    const drawName = useNexusStore(state => state.drawName);
    const updateGlobalWeights = useNexusStore(state => state.updateGlobalWeights);
    
    const [isTuning, setIsTuning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentRoi, setCurrentRoi] = useState(0);
    const [result, setResult] = useState<TuningResult | null>(null);

    const handleStartTuning = async () => {
        if (history.length < 50) return;
        
        setIsTuning(true);
        setProgress(0);
        setResult(null);

        try {
            const res = await runMassiveCalibration(drawName, history, (p, roi) => {
                setProgress(p);
                setCurrentRoi(roi);
            });
            setResult(res);
        } catch (e) {
            console.error("Tuning failed", e);
        } finally {
            setIsTuning(false);
        }
    };

    const handleApplyWeights = () => {
        if (result) {
            updateGlobalWeights(result.optimizedWeights);
        }
    };

    return (
        <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/10 backdrop-blur-md">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                        <Cpu size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Auto-Tuner Massif</h3>
                        <p className="text-xs text-slate-400">Optimisation Génétique des Poids</p>
                    </div>
                </div>
                {!isTuning && !result && (
                    <button 
                        onClick={handleStartTuning}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                    >
                        <RefreshCw size={16} />
                        Lancer Calibration
                    </button>
                )}
            </div>

            {isTuning && (
                <div className="space-y-4">
                    <div className="flex justify-between text-xs text-slate-400 uppercase font-bold">
                        <span>Progression</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <motion.div 
                            className="h-full bg-indigo-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="text-center text-xs font-mono text-emerald-400">
                        ROI Actuel: +{currentRoi.toFixed(2)}%
                    </div>
                </div>
            )}

            {result && (
                <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5">
                            <div className="text-[10px] text-slate-500 uppercase font-bold">Amélioration</div>
                            <div className="text-xl font-black text-emerald-400">+{result.improvement.toFixed(1)}%</div>
                        </div>
                        <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5">
                            <div className="text-[10px] text-slate-500 uppercase font-bold">Itérations</div>
                            <div className="text-xl font-black text-white">{result.iterations}</div>
                        </div>
                    </div>

                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                        <h4 className="text-sm font-bold text-emerald-400 mb-2 flex items-center gap-2">
                            <CheckCircle size={14} />
                            Configuration Optimale Trouvée
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 font-mono">
                            {Object.entries(result.optimizedWeights)
                                .sort(([,a], [,b]) => (b as number) - (a as number))
                                .slice(0, 6)
                                .map(([k, v]) => (
                                    <div key={k} className="flex justify-between">
                                        <span className="capitalize">{k}:</span>
                                        <span className="text-white">{Math.round((v as number) * 100)}%</span>
                                    </div>
                                ))
                            }
                        </div>
                    </div>

                    <button 
                        onClick={handleApplyWeights}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
                    >
                        <Save size={18} />
                        Appliquer cette Configuration
                    </button>
                </div>
            )}
        </div>
    );
};
