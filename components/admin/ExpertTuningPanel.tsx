
import React, { useState, useEffect, useMemo } from 'react';
import { AlgoRadar } from '../AlgoRadar';
import { getAdaptiveRules, saveAdaptiveRules, getDefaultRules, normalizeWeights, saveAlgoWeights, getAlgoWeights, getStrategyName } from '../../services/predictionEngine';
import { LearningService } from '../../services/learningService'; 
import type { AlgoWeights, AdaptiveRules } from '../../types';
import { useToast } from '../ui/Toast';
import { useNexus } from '../NexusProvider';
import { Sliders, Save, Scale, Activity, Gauge, RefreshCw, Wand2, BrainCircuit, CheckCircle2, AlertTriangle, Fingerprint, Dna, ArrowRight } from 'lucide-react';

interface ExpertTuningPanelProps {
    selectedDrawName: string;
}

export const ExpertTuningPanel: React.FC<ExpertTuningPanelProps> = ({ selectedDrawName }) => {
    const { showToast } = useToast();
    const { updateGlobalWeights, refreshData, history, drawName: activeDrawName } = useNexus();
    
    const [localWeights, setLocalWeights] = useState<AlgoWeights>({} as AlgoWeights);
    const [rules, setRules] = useState<AdaptiveRules>(getDefaultRules());
    const [isDirty, setIsDirty] = useState(false);
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [lastLearnStatus, setLastLearnStatus] = useState<string | null>(null);
    const [dnaName, setDnaName] = useState<string>("Chargement...");
    
    useEffect(() => {
        let isMounted = true;
        const loadSpecificDNA = async () => {
            try {
                const specificWeights = await getAlgoWeights(selectedDrawName);
                const specificRules = getAdaptiveRules(selectedDrawName);
                const lastDate = localStorage.getItem(`nexus_last_learn_${selectedDrawName}`);
                
                if (isMounted) {
                    setLocalWeights(specificWeights);
                    setRules(specificRules);
                    setDnaName(getStrategyName(specificWeights));
                    if(lastDate) setLastLearnStatus(lastDate);
                    else setLastLearnStatus(null);
                    setIsDirty(false);
                }
            } catch (e) {
                console.error("Erreur chargement ADN", e);
            }
        };
        
        loadSpecificDNA();
        return () => { isMounted = false; };
    }, [selectedDrawName]);

    const totalWeight = useMemo((): number => {
        const vals = Object.values(localWeights) as number[];
        return vals.reduce((a, b) => a + (Number(b) || 0), 0);
    }, [localWeights]);

    const handleWeightChange = (key: keyof AlgoWeights, value: string) => {
        const numValue = parseFloat(value);
        setLocalWeights(prev => {
            const next = { ...prev, [key]: numValue };
            setDnaName(getStrategyName(next));
            return next;
        });
        setIsDirty(true);
    };

    const handleAutoNormalize = () => {
        if (totalWeight === 0) return;
        const normalized = normalizeWeights(localWeights);
        setLocalWeights(normalized);
        setDnaName(getStrategyName(normalized));
        setIsDirty(true);
        showToast("Tensor Flow équilibré (Σ = 1.0).", "info");
    };

    const handleDeepLearning = async () => {
        if (history.length < 20) {
            showToast("Données insuffisantes pour le Deep Learning (Min 20).", "error");
            return;
        }

        setIsCalibrating(true);
        showToast(`🧬 Mutation génétique pour ${selectedDrawName}...`, "info");

        try {
            const result = await LearningService.triggerAutoLearning(selectedDrawName);
            
            if (result.improvement && result.weights) {
                const safeWeights = normalizeWeights(result.weights);
                setLocalWeights(safeWeights);
                setDnaName(getStrategyName(safeWeights));
                await saveAlgoWeights(selectedDrawName, safeWeights);
                
                if (selectedDrawName === activeDrawName) {
                    updateGlobalWeights(safeWeights);
                    await refreshData(selectedDrawName, true);
                }
                
                showToast(`✅ ADN optimisé avec succès.`, "success");
                const nowStr = new Date().toLocaleTimeString();
                setLastLearnStatus(nowStr);
                localStorage.setItem(`nexus_last_learn_${selectedDrawName}`, nowStr);
                setIsDirty(false);
            } else {
                showToast(result.message || "Aucune amélioration significative.", "info");
            }
        } catch (e) {
            showToast("Rupture du lien d'apprentissage.", "error");
        } finally {
            setIsCalibrating(false);
        }
    };

    const handleSave = async () => {
        let weightsToSave = { ...localWeights };
        if (Math.abs(totalWeight - 1.0) > 0.01) {
            weightsToSave = normalizeWeights(localWeights);
            showToast("Auto-Correction: Normalisation appliquée.", "info");
            setLocalWeights(weightsToSave);
        }

        await saveAlgoWeights(selectedDrawName, weightsToSave);
        saveAdaptiveRules(selectedDrawName, rules);
        
        if (selectedDrawName === activeDrawName) {
            updateGlobalWeights(weightsToSave);
            await refreshData(selectedDrawName, true);
        }

        setIsDirty(false);
        showToast(`Configuration ADN cristallisée.`, "success");
    };

    const isBalanced = Math.abs(totalWeight - 1.0) < 0.02;

    return (
        <div className="animate-fade-in w-full">
            {/* CONSOLE DE MIXAGE UNIFIÉE */}
            <div className="bg-slate-950 border border-slate-800 rounded-[3rem] shadow-2xl overflow-hidden relative group">
                {/* Background FX */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none group-hover:bg-indigo-600/10 transition-colors duration-1000"></div>
                
                {/* Header Global */}
                <div className="bg-slate-900/80 backdrop-blur-md p-6 md:p-8 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-6 w-full md:w-auto">
                        <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
                            <Dna size={32} className="text-white"/>
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Console Neurale</h2>
                                <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-black uppercase text-slate-400 border border-white/5">
                                    {selectedDrawName}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">{dnaName}</span>
                                {lastLearnStatus && <span className="text-[10px] text-emerald-500 font-medium ml-2 flex items-center gap-1"><CheckCircle2 size={10}/> Synchro {lastLearnStatus}</span>}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 w-full md:w-auto">
                        <button 
                            onClick={handleDeepLearning} 
                            disabled={isCalibrating}
                            className="flex-1 md:flex-none px-6 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group/btn"
                        >
                            {isCalibrating ? <RefreshCw className="animate-spin" size={16}/> : <BrainCircuit size={16}/>}
                            <span>{isCalibrating ? 'Mutation...' : 'Auto-Learn'}</span>
                        </button>
                    </div>
                </div>

                {/* Corps de la Console : Split View Symbiotique */}
                <div className="flex flex-col xl:flex-row min-h-[600px]">
                    
                    {/* GAUCHE : Visualisation & Feedback */}
                    <div className="xl:w-1/3 bg-slate-900/30 p-8 flex flex-col justify-between border-b xl:border-b-0 xl:border-r border-white/5 relative">
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
                                    <Gauge size={14}/> Radar Harmonique
                                </h4>
                                {!isBalanced && (
                                    <span className="text-[9px] font-black text-rose-500 bg-rose-500/10 px-2 py-1 rounded animate-pulse flex items-center gap-1">
                                        <AlertTriangle size={10}/> Instable
                                    </span>
                                )}
                            </div>
                            <div className="h-64 flex items-center justify-center relative">
                                <div className="absolute inset-0 bg-indigo-500/5 rounded-full blur-3xl transform scale-75"></div>
                                <AlgoRadar weights={localWeights} height={250} />
                            </div>
                        </div>

                        {/* Jauge de Masse Totale */}
                        <div className="mt-8 bg-black/40 p-6 rounded-3xl border border-white/5 relative overflow-hidden">
                            <div className="flex justify-between items-end mb-2 relative z-10">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Masse Tensorielle</span>
                                <span className={`text-3xl font-black ${isBalanced ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {totalWeight.toFixed(3)}
                                </span>
                            </div>
                            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-1">
                                <div 
                                    className={`h-full transition-all duration-300 ease-out ${isBalanced ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-rose-500 shadow-[0_0_10px_#f43f5e]'}`}
                                    style={{ width: `${Math.min(100, totalWeight * 100)}%` }}
                                ></div>
                            </div>
                            <p className="text-[9px] text-slate-600 text-right font-mono">Cible: 1.000</p>
                        </div>
                    </div>

                    {/* DROITE : Égaliseur (Sliders) */}
                    <div className="xl:w-2/3 bg-white dark:bg-slate-900 p-8 flex flex-col">
                        <div className="flex justify-between items-center mb-8">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                                <Sliders size={14}/> Égaliseur Paramétrique
                            </h4>
                            <div className="flex gap-2">
                                <button 
                                    onClick={handleAutoNormalize}
                                    className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-500 transition-colors"
                                    title="Normaliser les poids"
                                >
                                    <Scale size={16}/>
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 flex-1 overflow-y-auto custom-scrollbar pr-2 max-h-[500px]">
                            {(Object.keys(localWeights) as Array<keyof AlgoWeights>).map(key => {
                                const val = (localWeights[key] as number) ?? 0;
                                const percent = (val * 100).toFixed(1);
                                const isActive = val > 0.05;

                                return (
                                    <div key={String(key)} className="group">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-400'}`}>
                                                {String(key).replace(/_/g, ' ')}
                                            </label>
                                            <span className={`text-[10px] font-mono font-bold ${isActive ? 'text-slate-800 dark:text-white' : 'text-slate-400'}`}>
                                                {percent}%
                                            </span>
                                        </div>
                                        <div className="relative h-10 flex items-center">
                                            {/* Track */}
                                            <div className="absolute w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full transition-all duration-100 ${isActive ? 'bg-gradient-to-r from-indigo-500 to-purple-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                                                    style={{ width: `${Math.min(100, val * 100)}%` }}
                                                ></div>
                                            </div>
                                            {/* Input invisible pour l'interaction */}
                                            <input 
                                                type="range" min="0" max="0.5" step="0.005" 
                                                value={val}
                                                onChange={(e) => handleWeightChange(key, e.target.value)}
                                                className="absolute w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            {/* Thumb visuel (facultatif si la barre suffit, mais ajoute du style) */}
                                            <div 
                                                className={`absolute h-4 w-4 rounded-full border-2 border-white shadow-md transition-all duration-100 pointer-events-none ${isActive ? 'bg-indigo-600 scale-110' : 'bg-slate-400'}`}
                                                style={{ left: `calc(${Math.min(100, val * 200)}% - 8px)` }} // *200 car max 0.5
                                            ></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer Actions */}
                        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                            <button 
                                onClick={handleSave}
                                disabled={!isDirty}
                                className="px-10 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center gap-3 transition-all active:scale-95"
                            >
                                <Save size={16}/> Enregistrer Configuration
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
