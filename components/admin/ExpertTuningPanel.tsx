
import React, { useState, useEffect, useMemo } from 'react';
import { AlgoRadar } from '../AlgoRadar';
import { getAdaptiveRules, saveAdaptiveRules, getDefaultRules } from '../../services/predictionEngine';
import type { AlgoWeights, AdaptiveRules } from '../../types';
import { useToast } from '../ui/Toast';
import { useNexus } from '../NexusProvider';
import { Sliders, Save, Scale, Activity, Gauge, AlertCircle, RefreshCw } from 'lucide-react';

interface ExpertTuningPanelProps {
    selectedDrawName: string;
}

export const ExpertTuningPanel: React.FC<ExpertTuningPanelProps> = ({ selectedDrawName }) => {
    const { showToast } = useToast();
    // Connexion au Cerveau Global
    const { globalWeights, updateGlobalWeights, refreshData } = useNexus();
    
    // État local pour l'édition (pour ne pas commit à chaque micro-mouvement de slider)
    const [localWeights, setLocalWeights] = useState<AlgoWeights>(globalWeights);
    const [rules, setRules] = useState<AdaptiveRules>(getDefaultRules());
    const [isDirty, setIsDirty] = useState(false);
    
    // Synchronisation initiale quand le draw change ou quand le global change (ex: après un training)
    useEffect(() => {
        setLocalWeights(globalWeights);
        const loadedRules = getAdaptiveRules(selectedDrawName);
        setRules(loadedRules);
        setIsDirty(false);
    }, [selectedDrawName, globalWeights]);

    const totalWeight = useMemo(() => {
        const vals = Object.values(localWeights) as number[];
        return vals.reduce((a, b) => a + (b || 0), 0);
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
                normalized[k] = parseFloat(((currentVal as number) / (totalWeight as number)).toFixed(4));
            }
        });
        setLocalWeights(normalized);
        setIsDirty(true);
        showToast("Poids normalisés à 1.0", "info");
    };

    const handleSave = () => {
        if (Math.abs(totalWeight - 1.0) > 0.05) {
            if (!window.confirm("La masse totale s'écarte de 1.0. Voulez-vous normaliser avant de sauvegarder ?")) {
                performSave(localWeights);
            } else {
                handleAutoNormalize();
                // On attend que le state se mette à jour ou on normalise à la volée
                const normalized = { ...localWeights };
                const keys = Object.keys(normalized) as Array<keyof AlgoWeights>;
                
                const currentTotal = Object.values(normalized).reduce((acc: number, val) => {
                    const numVal = typeof val === 'number' ? val : 0;
                    return acc + numVal;
                }, 0);
                
                keys.forEach(k => {
                    const v = normalized[k];
                    if (v !== undefined) normalized[k] = parseFloat(((v as number) / (currentTotal as number)).toFixed(4));
                });
                performSave(normalized);
            }
        } else {
            performSave(localWeights);
        }
    };

    const performSave = (weightsToSave: AlgoWeights) => {
        // 1. Sauvegarde Persistante (Local Storage / DB via le service interne de updateGlobalWeights)
        updateGlobalWeights(weightsToSave);
        saveAdaptiveRules(selectedDrawName, rules);
        
        // 2. Refresh du contexte Nexus pour forcer le recalcul des prédictions
        refreshData(selectedDrawName, true);
        
        setIsDirty(false);
        showToast(`Profil ${selectedDrawName} muté et activé.`, "success");
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* Visualizer and Actions */}
                <div className="xl:col-span-5 space-y-6">
                    <div className="bg-slate-900 text-white p-6 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] shadow-2xl relative overflow-hidden border border-slate-800 group">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-[80px] group-hover:bg-indigo-500/20 transition-all duration-700"></div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-10 flex items-center gap-2 relative z-10"><Gauge size={14}/> ADN Algorithmique</h4>
                        
                        <div className="h-64 md:h-80 mb-10 relative z-10 flex items-center justify-center">
                            {/* On compare les poids locaux (édition) avec les poids globaux actuels (référence) */}
                            <AlgoRadar weights={localWeights} previousWeights={globalWeights} height={300} />
                        </div>
                        
                        <div className="space-y-4 relative z-10">
                            <div className="flex justify-between items-end">
                                <div>
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Somme des poids</span>
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
                        <button onClick={handleAutoNormalize} className="w-full py-4 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-black rounded-2xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 transition hover:bg-slate-100 dark:hover:bg-slate-950 border border-slate-200 dark:border-slate-700 active:scale-[0.98]">
                            <Scale size={16}/> Normaliser
                        </button>
                        <button onClick={handleSave} disabled={!isDirty} className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/30 text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-[0.98]">
                            <Save size={18}/> Injecter dans le Noyau
                        </button>
                    </div>
                </div>

                {/* Sliders Grid */}
                <div className="xl:col-span-7 bg-white dark:bg-slate-800 p-6 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] border border-slate-100 dark:border-slate-700 shadow-xl overflow-hidden relative">
                    <div className="absolute -left-10 -top-10 w-40 h-40 bg-indigo-500/5 rounded-full blur-[60px]"></div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-10 flex items-center gap-2"><Sliders size={14}/> Paramètres Tactiles</h4>
                    
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
                        <AlertCircle className="text-indigo-500 shrink-0 mt-0.5" size={18} />
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed italic">
                            "Ajustez les curseurs pour orienter le moteur Nexus. Toute modification ici sera immédiatement répercutée sur les prédictions après sauvegarde."
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
