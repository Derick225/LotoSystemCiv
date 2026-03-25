
import React, { useState, useEffect, useMemo } from 'react';
import { NumberBall } from './NumberBall';
import { useNexusStore } from '../store/useNexusStore';
import { analyzeTicketStrength } from '../services/predictionEngine';
import { saveTicket } from '../services/userPreferencesService';
import { useToast } from './ui/Toast';
import type { TicketAnalysisResult } from '../types';
import { Activity, Save, RefreshCw, Layers, Wand2, ThermometerSun, ScanLine, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const PatternSequencer: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { showToast } = useToast();
    const { spectral, correlationMatrix } = useNexusStore();
    
    const [selection, setSelection] = useState<number[]>([]);
    const [metrics, setMetrics] = useState<TicketAnalysisResult | null>(null);

    // --- MOTEUR DE HEATMAP PRÉDICTIVE ---
    const heatMap = useMemo(() => {
        const map: Record<number, number> = {};
        if (selection.length === 0) return map;

        for (let i = 1; i <= 90; i++) map[i] = 0;

        for (let target = 1; target <= 90; target++) {
            if (selection.includes(target)) {
                map[target] = 100; 
                continue;
            }

            let affinitySum = 0;
            let count = 0;

            selection.forEach(source => {
                const affinity = Number(correlationMatrix[source]?.affinities?.[target] || 0);
                if (affinity > 0) {
                    affinitySum += affinity;
                    count++;
                }
            });

            map[target] = count > 0 ? (affinitySum / selection.length) * 300 : 0;
        }
        return map;
    }, [selection, correlationMatrix]);

    // Analyse de structure en direct
    useEffect(() => {
        if (selection.length > 0) {
            analyzeTicketStrength(selection, drawName).then(setMetrics);
        } else {
            setMetrics(null);
        }
    }, [selection, drawName]);

    const toggleNumber = (n: number) => {
        if (selection.includes(n)) {
            setSelection(prev => prev.filter(x => x !== n).sort((a, b) => a - b));
        } else {
            if (selection.length >= 5) {
                showToast("Maximum 5 numéros atteints.", "info");
                return;
            }
            setSelection(prev => [...prev, n].sort((a, b) => a - b));
        }
    };

    const handleMagicFill = () => {
        if (selection.length >= 5) return;

        const candidates = Object.entries(heatMap)
            .map(([n, score]) => ({ n: parseInt(n), score: Number(score) }))
            .filter(item => !selection.includes(item.n))
            .sort((a, b) => b.score - a.score);

        const needed = 5 - selection.length;
        
        if (candidates.length > 0 && candidates[0].score > 10) {
            const toAdd = candidates.slice(0, needed).map(c => c.n);
            setSelection(prev => [...prev, ...toAdd].sort((a, b) => a - b));
            showToast(`${toAdd.length} vecteurs convergents ajoutés.`, "success");
        } else {
            const remaining = 5 - selection.length;
            const smartRandom: number[] = [];
            const topSpectral = [...spectral].sort((a,b) => b.energy - a.energy).slice(0, 20);

            while(smartRandom.length < remaining && topSpectral.length > 0) {
                const idx = Math.floor(Math.random() * topSpectral.length);
                const candidate = topSpectral[idx].number;
                
                if (!selection.includes(candidate) && !smartRandom.includes(candidate)) {
                    smartRandom.push(candidate);
                }
                topSpectral.splice(idx, 1);
            }
            
            setSelection(prev => [...prev, ...smartRandom].sort((a, b) => a - b));
            showToast("Complétion spectrale activée.", "info");
        }
    };

    const handleSave = async () => {
        if (selection.length < 3) {
            showToast("Sélectionnez au moins 3 numéros.", "error");
            return;
        }
        await saveTicket({
            numbers: selection,
            drawName,
            strategy: `Séquenceur Assisté (S:${metrics?.score || 0})`
        });
        showToast("Séquence enregistrée dans le Portefeuille.", "success");
        setSelection([]);
    };

    const getCellColor = (n: number) => {
        if (selection.includes(n)) return 'bg-indigo-600 text-white ring-4 ring-indigo-500/30 scale-110 z-20 shadow-xl font-black border-indigo-500';
        
        if (selection.length > 0) {
            const affinity = heatMap[n] || 0;
            if (affinity > 60) return 'bg-emerald-500 text-white shadow-lg scale-105 font-bold border-emerald-400 z-10';
            if (affinity > 30) return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
            if (affinity > 10) return 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
            return 'bg-white dark:bg-slate-900 text-slate-300 dark:text-slate-700 border-slate-100 dark:border-slate-800 opacity-60';
        }

        const spec = spectral.find(s => s.number === n);
        const energy = spec?.energy || 0;
        if (energy > 80) return 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800 font-bold';
        if (energy > 50) return 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
        return 'bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-600 border-slate-100 dark:border-slate-800';
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col lg:flex-row gap-8">
                {/* Grille Interactive - FOND BLANC PRO */}
                <div className="flex-1 bg-white dark:bg-slate-900 p-6 md:p-8 rounded-[2.5rem] md:rounded-[3rem] border border-slate-200 dark:border-slate-800 shadow-2xl relative overflow-hidden">
                    <div className="flex justify-between items-center mb-6 relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/20"><Layers size={18} className="text-white"/></div>
                            <div>
                                <h3 className="text-slate-800 dark:text-white font-black uppercase tracking-widest text-sm">Matrice Tactile</h3>
                                <p className="text-[10px] text-slate-500 font-bold flex items-center gap-2 mt-0.5">
                                    {selection.length > 0 ? (
                                        <span className="text-emerald-500 flex items-center gap-1 font-black"><ThermometerSun size={10}/> Heatmap Active</span>
                                    ) : (
                                        "Mode Calibration Spectrale"
                                    )}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={handleMagicFill}
                                disabled={selection.length >= 5}
                                className="p-3 bg-emerald-600 rounded-2xl text-white hover:bg-emerald-500 transition disabled:opacity-50 shadow-lg active:scale-95 group"
                                title="Compléter intelligemment"
                            >
                                <Wand2 size={18} className="group-hover:rotate-12 transition-transform"/>
                            </button>
                            <button onClick={() => setSelection([])} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-500 hover:text-rose-500 transition shadow-sm active:rotate-180 duration-500"><RefreshCw size={18}/></button>
                        </div>
                    </div>

                    <div className="grid grid-cols-10 gap-1.5 md:gap-2.5 relative z-10 bg-slate-50/50 dark:bg-black/20 p-2 md:p-4 rounded-[2rem] border border-slate-100 dark:border-slate-800/50">
                        {Array.from({ length: 90 }, (_, i) => i + 1).map(n => (
                            <button
                                key={n}
                                onClick={() => toggleNumber(n)}
                                className={`aspect-square rounded-xl md:rounded-2xl flex items-center justify-center text-[10px] md:text-xs font-medium transition-all duration-300 border ${getCellColor(n)}`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Panneau de Contrôle & Métriques */}
                <div className="lg:w-80 flex flex-col gap-6">
                    <div className="bg-slate-900 p-6 md:p-8 rounded-[2.5rem] border border-slate-800 shadow-xl min-h-[300px] flex flex-col justify-between relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5"><ScanLine size={100} className="text-indigo-500"/></div>
                        
                        <div className="relative z-10">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Activity size={14} className="text-indigo-500"/> Séquence En Cours
                            </h4>
                            
                            <div className="flex flex-wrap gap-2 justify-center min-h-[60px] bg-black/40 p-4 rounded-3xl border border-white/5 mb-6">
                                <AnimatePresence>
                                    {selection.length > 0 ? selection.map(n => (
                                        <motion.div
                                            key={n}
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            exit={{ scale: 0 }}
                                        >
                                            <NumberBall number={n} size="md" />
                                        </motion.div>
                                    )) : <span className="text-[10px] text-slate-600 font-black uppercase italic tracking-tighter my-auto">En attente...</span>}
                                </AnimatePresence>
                            </div>

                            {metrics && (
                                <div className="space-y-4 animate-slide-up bg-white/5 p-4 rounded-2xl border border-white/5">
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                                            <span>Intégrité</span>
                                            <span className={metrics.score > 75 ? 'text-emerald-400' : 'text-amber-400'}>{metrics.score}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                            <div className={`h-full transition-all duration-500 ${metrics.score > 75 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{width: `${metrics.score}%`}}></div>
                                        </div>
                                    </div>
                                    <div className="text-center pt-2">
                                        <span className={`text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-tighter border ${metrics.score > 75 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
                                            {metrics.verdict}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={handleSave} 
                            disabled={selection.length < 3}
                            className="w-full mt-6 py-4 bg-white text-slate-900 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95 group relative z-10"
                        >
                            <Save size={16} className="group-hover:text-indigo-600 transition-colors"/> Enregistrer
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
