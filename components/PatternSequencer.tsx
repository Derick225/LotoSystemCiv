
import React, { useState, useEffect, useMemo } from 'react';
import { NumberBall } from './NumberBall';
import { useNexus } from './NexusProvider';
import { analyzeTicketStrength } from '../services/predictionEngine';
import { saveTicket } from '../services/userPreferencesService';
import { useToast } from './ui/Toast';
import type { TicketAnalysisResult } from '../types';
import { Activity, Save, RefreshCw, Layers, Wand2, ThermometerSun } from 'lucide-react';

export const PatternSequencer: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { showToast } = useToast();
    const { spectral, correlationMatrix } = useNexus();
    
    const [selection, setSelection] = useState<number[]>([]);
    const [metrics, setMetrics] = useState<TicketAnalysisResult | null>(null);

    // --- MOTEUR DE HEATMAP PRÉDICTIVE ---
    // Calcule en temps réel les numéros qui ont la plus forte affinité avec ceux déjà sélectionnés
    const heatMap = useMemo(() => {
        const map: Record<number, number> = {};
        if (selection.length === 0) return map;

        // On initialise à 0
        for (let i = 1; i <= 90; i++) map[i] = 0;

        for (let target = 1; target <= 90; target++) {
            if (selection.includes(target)) {
                map[target] = 100; // Déjà sélectionné
                continue;
            }

            let affinitySum = 0;
            let count = 0;

            selection.forEach(source => {
                // On récupère le score de corrélation pré-calculé par le worker Math
                const affinity = Number(correlationMatrix[source]?.affinities?.[target] || 0);
                if (affinity > 0) {
                    affinitySum += affinity;
                    count++;
                }
            });

            // Normalisation arbitraire pour l'affichage visuel
            // Si tous les numéros sélectionnés "aiment" le target, le score explose
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

    // --- ALGORITHME DE COMPLÉTION INTELLIGENTE ---
    const handleMagicFill = () => {
        if (selection.length >= 5) return;

        // 1. Chercher d'abord dans les corrélations fortes (Heatmap)
        const candidates = Object.entries(heatMap)
            .map(([n, score]) => ({ n: parseInt(n), score: Number(score) }))
            .filter(item => !selection.includes(item.n))
            .sort((a, b) => b.score - a.score);

        const needed = 5 - selection.length;
        
        // Si on a des candidats forts via corrélation
        if (candidates.length > 0 && candidates[0].score > 10) {
            const toAdd = candidates.slice(0, needed).map(c => c.n);
            setSelection(prev => [...prev, ...toAdd].sort((a, b) => a - b));
            showToast(`${toAdd.length} vecteurs convergents ajoutés.`, "success");
        } else {
            // 2. Sinon, Fallback sur l'énergie spectrale (les numéros "chauds" du moment)
            const remaining = 5 - selection.length;
            const smartRandom: number[] = [];
            
            // On prend dans le top 20 spectral
            const topSpectral = [...spectral].sort((a,b) => b.energy - a.energy).slice(0, 20);

            while(smartRandom.length < remaining && topSpectral.length > 0) {
                const idx = Math.floor(Math.random() * topSpectral.length);
                const candidate = topSpectral[idx].number;
                
                if (!selection.includes(candidate) && !smartRandom.includes(candidate)) {
                    smartRandom.push(candidate);
                }
                // Retirer pour éviter doublon dans la boucle
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
    };

    const getCellColor = (n: number) => {
        // Numéro sélectionné
        if (selection.includes(n)) return 'bg-indigo-600 text-white ring-4 ring-indigo-100 scale-110 z-10 shadow-xl font-black border-indigo-700';
        
        // Mode Heatmap (quand au moins 1 numéro sélectionné)
        if (selection.length > 0) {
            const affinity = heatMap[n] || 0;
            if (affinity > 60) return 'bg-emerald-500 text-white shadow-lg scale-105 font-bold border-emerald-600';
            if (affinity > 30) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            if (affinity > 10) return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            return 'bg-slate-50 text-slate-300 border-slate-100 opacity-40';
        }

        // Mode Calibration (Vue Spectrale par défaut)
        const spec = spectral.find(s => s.number === n);
        const energy = spec?.energy || 0;
        if (energy > 80) return 'bg-rose-100 text-rose-800 border-rose-200';
        if (energy > 50) return 'bg-indigo-50 text-indigo-800 border-indigo-200';
        return 'bg-white text-slate-400 border-slate-200';
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col lg:flex-row gap-8">
                {/* Grille Interactive - FOND BLANC PRO */}
                <div className="flex-1 bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-2xl relative overflow-hidden">
                    <div className="flex justify-between items-center mb-6 relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg"><Layers size={18} className="text-white"/></div>
                            <div>
                                <h3 className="text-slate-800 font-black uppercase tracking-widest text-sm">Matrice Tactile Platinum</h3>
                                <p className="text-[10px] text-slate-500 font-bold flex items-center gap-2">
                                    {selection.length > 0 ? (
                                        <span className="text-emerald-600 flex items-center gap-1 font-black"><ThermometerSun size={10}/> Heatmap Dynamique Active</span>
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
                                className="p-2.5 bg-emerald-600 rounded-full text-white hover:bg-emerald-500 transition disabled:opacity-50 shadow-lg active:scale-95"
                                title="Compléter intelligemment"
                            >
                                <Wand2 size={18}/>
                            </button>
                            <button onClick={() => setSelection([])} className="p-2.5 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition shadow-sm active:rotate-180 duration-500"><RefreshCw size={16}/></button>
                        </div>
                    </div>

                    <div className="grid grid-cols-10 gap-2 relative z-10 p-2 bg-slate-50/50 rounded-3xl border border-slate-100">
                        {Array.from({ length: 90 }, (_, i) => i + 1).map(n => (
                            <button
                                key={n}
                                onClick={() => toggleNumber(n)}
                                className={`aspect-square rounded-lg flex items-center justify-center text-[10px] font-medium transition-all duration-300 border ${getCellColor(n)}`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Panneau de Contrôle & Métriques */}
                <div className="lg:w-80 flex flex-col gap-6">
                    <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-xl min-h-[200px] flex flex-col justify-between">
                        <div>
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Activity size={14} className="text-emerald-500"/> Diagnostic Instantané
                            </h4>
                            <div className="flex flex-wrap gap-2 justify-center min-h-[50px] bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                {selection.length > 0 ? selection.map(n => <NumberBall key={n} number={n} size="sm" />) : <span className="text-[10px] text-slate-400 font-black uppercase italic tracking-tighter">En attente de signal...</span>}
                            </div>
                        </div>

                        {metrics && (
                            <div className="space-y-4 mt-6 animate-slide-up">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                                        <span>Cohérence Structurelle</span>
                                        <span className={metrics.score > 75 ? 'text-emerald-600' : 'text-amber-600'}>{metrics.score}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full transition-all duration-500 ${metrics.score > 75 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{width: `${metrics.score}%`}}></div>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter ${metrics.score > 75 ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                                        {metrics.verdict}
                                    </span>
                                </div>
                            </div>
                        )}

                        <button 
                            onClick={handleSave} 
                            disabled={selection.length < 3}
                            className="w-full mt-6 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                            <Save size={16}/> Enregistrer Séquence
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
