
import React, { useState, useEffect, useMemo } from 'react';
import { AlgoRadar } from '../AlgoRadar';
import { getAdaptiveRules, saveAdaptiveRules, getDefaultRules } from '../../services/predictionEngine';
import { LearningService } from '../../services/learningService'; 
import type { AlgoWeights, AdaptiveRules } from '../../types';
import { useToast } from '../ui/Toast';
import { useNexus } from '../NexusProvider';
import { Sliders, Save, Scale, Activity, Gauge, RefreshCw, Wand2, BrainCircuit, CheckCircle2 } from 'lucide-react';

interface ExpertTuningPanelProps {
    selectedDrawName: string;
}

export const ExpertTuningPanel: React.FC<ExpertTuningPanelProps> = ({ selectedDrawName }) => {
    const { showToast } = useToast();
    // Connexion au Cerveau Global pour accéder aux poids en temps réel
    const { globalWeights, updateGlobalWeights, refreshData, history } = useNexus();
    
    // État local pour l'édition manuelle
    const [localWeights, setLocalWeights] = useState<AlgoWeights>(globalWeights);
    const [rules, setRules] = useState<AdaptiveRules>(getDefaultRules());
    const [isDirty, setIsDirty] = useState(false);
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [lastLearnStatus, setLastLearnStatus] = useState<string | null>(null);
    
    // Synchronisation initiale quand le draw change ou quand le global change
    useEffect(() => {
        setLocalWeights(globalWeights);
        const loadedRules = getAdaptiveRules(selectedDrawName);
        setRules(loadedRules);
        setIsDirty(false);
        
        const lastDate = localStorage.getItem(`nexus_last_learn_${selectedDrawName}`);
        if(lastDate) setLastLearnStatus(`Dernière adaptation : ${lastDate}`);

    }, [selectedDrawName, globalWeights]);

    const totalWeight = useMemo((): number => {
        const vals = Object.values(localWeights);
        return vals.reduce((a: number, b: unknown) => a + (Number(b) || 0), 0);
    }, [localWeights]);

    const handleWeightChange = (key: keyof AlgoWeights, value: string) => {
        const numValue = parseFloat(value);
        setLocalWeights(prev => ({ ...prev, [key]: numValue }));
        setIsDirty(true);
    };

    const handleAutoNormalize = () => {
        if (totalWeight === 0) return;
        const normalized = { ...localWeights };
        const keys = Object.keys(normalized) as Array<keyof AlgoWeights>;
        keys.forEach(k => {
            const currentVal = normalized[k];
            if (currentVal !== undefined) {
                normalized[k] = parseFloat(((currentVal as number) / totalWeight).toFixed(4));
            }
        });
        setLocalWeights(normalized);
        setIsDirty(true);
        showToast("Poids normalisés à 1.0", "info");
    };

    // --- AUTO-APPRENTISSAGE RÉEL ---
    const handleDeepLearning = async () => {
        if (history.length < 20) {
            showToast("Données insuffisantes pour le Deep Learning (Min 20).", "error");
            return;
        }

        setIsCalibrating(true);
        showToast("🧬 Démarrage du cycle génétique...", "info");

        try {
            // Lancement de l'optimisation serveur
            const result = await LearningService.triggerAutoLearning(selectedDrawName);
            
            if (result.improvement) {
                // Rafraîchir les données pour récupérer les nouveaux poids depuis le contexte/DB
                // Note: LearningService a déjà mis à jour le LocalStorage via saveAlgoWeights
                // Mais pour mettre à jour l'UI React via NexusProvider, on force un refreshData qui rechargera les poids
                await refreshData(selectedDrawName, true);
                
                showToast("✅ Mutation réussie ! L'ADN a évolué.", "success");
                setLastLearnStatus("Adaptation : À l'instant");
            } else {
                showToast(result.message, "info");
            }
        } catch (e) {
            showToast("Échec du processus d'apprentissage.", "error");
        } finally {
            setIsCalibrating(false);
        }
    };

    const handleSave = () => {
        if (Math.abs(totalWeight - 1.0) > 0.05) {
            if (!window.confirm("La masse totale s'écarte de 1.0. Voulez-vous normaliser avant de sauvegarder ?")) {
                performSave(localWeights);
            } else {
                handleAutoNormalize();
                // On utilise une version normalisée immédiate
                const normalized = { ...localWeights };
                const t = Object.values(normalized).reduce((a: number, b: unknown) => a + (Number(b) || 0), 0);
                (Object.keys(normalized) as Array<keyof AlgoWeights>).forEach(k => {
                    normalized[k] = parseFloat(((normalized[k] || 0) / t).toFixed(4));
                });
                performSave(normalized);
            }
        } else {
            performSave(localWeights);
        }
    };

    const performSave = (weightsToSave: AlgoWeights) => {
        updateGlobalWeights(weightsToSave);
        saveAdaptiveRules(selectedDrawName, rules);
        // Force refresh pour propager partout
        refreshData(selectedDrawName, true);
        setIsDirty(false);
        showToast(`Profil ${selectedDrawName} sauvegardé manuellement.`, "success");
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* Visualizer and Actions */}
                <div className="xl:col-span-5 space-y-6">
                    <div className="bg-slate-900 text-white p-6 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] shadow-2xl relative overflow-hidden border border-slate-800 group">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-[80px] group-hover:bg-indigo-500/20 transition-all duration-700"></div>
                        
                        <div className="flex justify-between items-start relative z-10 mb-10">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 flex items-center gap-2">
                                <Gauge size={14}/> ADN Algorithmique
                            </h4>
                            {lastLearnStatus && (
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                    <CheckCircle2 size={10} className="text-emerald-500"/>
                                    <span className="text-[8px] font-bold text-emerald-400 uppercase">{lastLearnStatus}</span>
                                </div>
                            )}
                        </div>
                        
                        <div className="h-64 md:h-80 mb-10 relative z-10 flex items-center justify-center">
                            <AlgoRadar weights={localWeights} previousWeights={globalWeights} height={300} />
                        </div>
                        
                        <div className="space-y-4 relative z-10">
                            <div className="flex justify-between items-end">
                                <div>
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Masse Totale</span>
                                    <div className={`text-3xl font-black ${Math.abs(totalWeight - 1.0) < 0.01 ? 'text-emerald-400' : 'text-orange-400'}`}>
                                        {totalWeight.toFixed(3)}
                                    </div>
                                </div>
                                {Math.abs(totalWeight - 1.0) >= 0.01 && (
                                    <div className="text-[8px] font-black text-orange-500 bg-orange-500/10 px-2 py-1 rounded-lg animate-pulse border border-orange-500/20 uppercase">Déséquilibre Sigma</div>
                                )}
                            </div>
                            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden shadow-inner">
                                <div className={`h-full transition-all duration-700 shadow-[0_0_10px_rgba(255,255,255,0.1)] ${Math.abs(totalWeight - 1.0) < 0.01 ? 'bg-emerald-500' : 'bg-orange-500'}`} style={{ width: `${Math.min(100, totalWeight * 100)}%` }}></div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-xl flex flex-col gap-4">
                        <button 
                            onClick={handleDeepLearning} 
                            disabled={isCalibrating}
                            className="w-full py-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 transition shadow-xl shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-50 relative overflow-hidden group"
                        >
                            <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 skew-x-12"></div>
                            {isCalibrating ? <RefreshCw className="animate-spin" size={18}/> : <BrainCircuit size={18}/>}
                            {isCalibrating ? "Mutation en cours..." : "Lancer Auto-Apprentissage (Deep RL)"}
                        </button>
                        
                        <div className="flex gap-4">
                            <button onClick={handleAutoNormalize} className="flex-1 py-4 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-black rounded-2xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 transition hover:bg-slate-100 dark:hover:bg-slate-950 border border-slate-200 dark:border-slate-700 active:scale-[0.98]">
                                <Scale size={16}/> Normaliser
                            </button>
                            <button onClick={handleSave} disabled={!isDirty} className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-2xl shadow-xl shadow-emerald-500/30 text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-[0.98]">
                                <Save size={18}/> Sauvegarder
                            </button>
                        </div>
                    </div>
                </div>

                {/* Sliders Grid */}
                <div className="xl:col-span-7 bg-white dark:bg-slate-800 p-6 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] border border-slate-100 dark:border-slate-700 shadow-xl overflow-hidden relative">
                    <div className="absolute -left-10 -top-10 w-40 h-40 bg-indigo-500/5 rounded-full blur-[60px]"></div>
                    <div className="flex justify-between items-center mb-10">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2"><Sliders size={14}/> Paramètres Tactiles</h4>
                        <div className="px-3 py-1 bg-slate-100 dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-700">
                            <span className="text-[9px] font-bold text-slate-500 uppercase">{selectedDrawName}</span>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 max-h-[600px] overflow-y-auto pr-4 custom-scrollbar">
                        {(Object.keys(localWeights) as Array<keyof AlgoWeights>).map(key => (
                            <div key={String(key)} className="group space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-[9px] md:text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest group-hover:text-indigo-500 transition-colors">
                                        {String(key).replace('_', ' ')}
                                    </label>
                                    <span className={`text-[10px] md:text-xs font-mono font-black px-2.5 py-1 rounded-xl border shadow-sm min-w-[50px] text-center ${localWeights[key] !== globalWeights[key] ? 'bg-amber-100 text-amber-600 border-amber-200' : 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800/60'}`}>
                                        {(((localWeights[key] as number) ?? 0) * 100).toFixed(1)}%
                                    </span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <input 
                                        type="range" min="0" max="1" step="0.001" 
                                        value={(localWeights[key] as number) ?? 0}
                                        onChange={(e) => handleWeightChange(key, e.target.value)}
                                        className="flex-1 h-2 bg-slate-100 dark:bg-slate-900 rounded-full appearance-none cursor-pointer accent-indigo-600 focus:outline-none"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="mt-10 p-5 bg-slate-50 dark:bg-slate-950 rounded-[1.8rem] border border-slate-100 dark:border-slate-900 flex items-start gap-4">
                        <Activity className="text-indigo-500 shrink-0 mt-0.5" size={18} />
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed italic">
                            "Le mode <strong>Deep RL</strong> simule des milliers de parties sur l'historique récent pour trouver la combinaison de poids qui aurait maximisé les gains. Il ajuste automatiquement les curseurs pour vous."
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
