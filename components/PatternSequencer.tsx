
import React, { useState, useEffect, useMemo } from 'react';
import { NumberBall } from './NumberBall';
import { useNexus } from './NexusProvider';
import { analyzeTicketStrength } from '../services/predictionEngine';
import { saveTicket } from '../services/userPreferencesService';
import { useToast } from './ui/Toast';
import type { TicketAnalysisResult } from '../types';
import { Activity, Save, RefreshCw, Layers, Gauge, Cpu } from 'lucide-react';
import { TicketXRay } from './TicketXRay';

export const PatternSequencer: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { showToast } = useToast();
    const { spectral } = useNexus();
    
    const [selection, setSelection] = useState<number[]>([]);
    const [metrics, setMetrics] = useState<TicketAnalysisResult | null>(null);
    const [spectralScore, setSpectralScore] = useState(0);

    // Calcul temps réel
    useEffect(() => {
        if (selection.length > 0) {
            analyzeTicketStrength(selection, drawName).then(setMetrics);
            
            // Calcul score spectral moyen de la sélection
            const score = selection.reduce((acc, n) => {
                const s = spectral.find(x => x.number === n);
                return acc + (s?.energy || 0);
            }, 0);
            setSpectralScore(selection.length > 0 ? Math.round(score / selection.length) : 0);
        } else {
            setMetrics(null);
            setSpectralScore(0);
        }
    }, [selection, drawName, spectral]);

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

    const handleSave = async () => {
        if (selection.length < 3) {
            showToast("Sélectionnez au moins 3 numéros.", "error");
            return;
        }
        await saveTicket({
            numbers: selection,
            drawName,
            strategy: `Séquenceur Manuel (S:${metrics?.score || 0})`
        });
        showToast("Séquence enregistrée dans le Portefeuille.", "success");
    };

    const getHeatColor = (n: number) => {
        const spec = spectral.find(s => s.number === n);
        const energy = spec?.energy || 0;
        if (selection.includes(n)) return 'bg-indigo-600 text-white ring-2 ring-white scale-110 z-10 shadow-lg';
        if (energy > 80) return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
        if (energy > 50) return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
        return 'bg-slate-800 text-slate-500 border-slate-700';
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col lg:flex-row gap-8">
                {/* Grille Interactive */}
                <div className="flex-1 bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden">
                    <div className="flex justify-between items-center mb-6 relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-600 rounded-xl"><Layers size={18} className="text-white"/></div>
                            <div>
                                <h3 className="text-white font-black uppercase tracking-widest text-sm">Matrice Tactile</h3>
                                <p className="text-[10px] text-slate-400 font-bold">{selection.length}/5 Vecteurs</p>
                            </div>
                        </div>
                        <button onClick={() => setSelection([])} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white transition"><RefreshCw size={14}/></button>
                    </div>

                    <div className="grid grid-cols-10 gap-2 relative z-10">
                        {Array.from({ length: 90 }, (_, i) => i + 1).map(n => (
                            <button
                                key={n}
                                onClick={() => toggleNumber(n)}
                                className={`aspect-square rounded-lg flex items-center justify-center text-[10px] font-black transition-all duration-200 border ${getHeatColor(n)}`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                    
                    {/* Background Decor */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none"></div>
                </div>

                {/* Panneau de Contrôle & Métriques */}
                <div className="lg:w-80 flex flex-col gap-6">
                    {/* Ticket Preview */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-xl min-h-[200px] flex flex-col justify-between">
                        <div>
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Cpu size={14} className="text-emerald-500"/> Analyse Temps Réel
                            </h4>
                            <div className="flex flex-wrap gap-2 justify-center min-h-[50px]">
                                {selection.length > 0 ? selection.map(n => <NumberBall key={n} number={n} size="sm" />) : <span className="text-xs text-slate-400 italic mt-2">En attente de signal...</span>}
                            </div>
                        </div>

                        {metrics && (
                            <div className="space-y-4 mt-6 animate-slide-up">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                                        <span>Force Structurelle</span>
                                        <span className={metrics.score > 75 ? 'text-emerald-500' : 'text-amber-500'}>{metrics.score}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className={`h-full transition-all duration-500 ${metrics.score > 75 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{width: `${metrics.score}%`}}></div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                                        <span>Résonance Spectrale</span>
                                        <span className="text-indigo-500">{spectralScore}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 transition-all duration-500" style={{width: `${spectralScore}%`}}></div>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded text-slate-500">
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
                            <Save size={16}/> Valider Séquence
                        </button>
                    </div>

                    {/* Mini X-Ray */}
                    {selection.length > 0 && (
                        <div className="bg-slate-950 p-4 rounded-[2rem] border border-slate-800">
                            <TicketXRay numbers={selection} score={metrics?.score || 0} showTitle={false} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
