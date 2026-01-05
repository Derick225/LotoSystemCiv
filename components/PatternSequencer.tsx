import React, { useState, useEffect, useMemo } from 'react';
import { NumberBall } from './NumberBall';
import { useNexus } from './NexusProvider';
import { analyzeTicketStrength } from '../services/predictionEngine';
import { saveTicket } from '../services/userPreferencesService';
import { useToast } from './ui/Toast';
import type { TicketAnalysisResult } from '../types';
import { Activity, Save, RefreshCw, Layers, Wand2, ThermometerSun } from 'lucide-react';
import { TicketXRay } from './TicketXRay';

export const PatternSequencer: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { showToast } = useToast();
    const { spectral, correlationMatrix } = useNexus();
    
    const [selection, setSelection] = useState<number[]>([]);
    const [metrics, setMetrics] = useState<TicketAnalysisResult | null>(null);
    const [spectralScore, setSpectralScore] = useState(0);

    // Calcul des affinités prédictives (Heatmap temps réel)
    const heatMap = useMemo(() => {
        const map: Record<number, number> = {};
        if (selection.length === 0) return map;

        // On parcourt tous les numéros de 1 à 90
        for (let target = 1; target <= 90; target++) {
            if (selection.includes(target)) {
                map[target] = 100; // Le numéro sélectionné est "chaud"
                continue;
            }

            let affinitySum = 0;
            let count = 0;

            // On somme les corrélations avec chaque numéro déjà sélectionné
            selection.forEach(source => {
                // correlationMatrix[source].affinities[target] est entre -1 et 1
                // On vérifie que la matrice est bien chargée pour éviter les crashs
                const affinity = Number(correlationMatrix[source]?.affinities?.[target] || 0);
                if (affinity > 0) { // On ne garde que les corrélations positives pour la suggestion
                    affinitySum += affinity;
                    count++;
                }
            });

            // Score moyen normalisé (boosté pour la visibilité visuelle)
            map[target] = count > 0 ? (affinitySum / selection.length) * 200 : 0;
        }
        return map;
    }, [selection, correlationMatrix]);

    // Calcul temps réel des métriques du ticket
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

    const handleMagicFill = () => {
        if (selection.length >= 5) return;
        
        // Trouver les meilleurs candidats basés sur la heatmap
        const candidates = Object.entries(heatMap)
            .map(([n, score]) => ({ n: parseInt(n), score: Number(score) }))
            .filter(item => !selection.includes(item.n))
            .sort((a, b) => b.score - a.score);

        const needed = 5 - selection.length;
        const toAdd = candidates.slice(0, needed).map(c => c.n);
        
        if (toAdd.length > 0) {
            setSelection(prev => [...prev, ...toAdd].sort((a, b) => a - b));
            showToast(`${toAdd.length} vecteurs convergents ajoutés.`, "success");
        } else {
            // Fallback aléatoire intelligent si pas de corrélation (premier numéro ou pas de données)
            const remaining = 5 - selection.length;
            const smartRandom: number[] = [];
            while(smartRandom.length < remaining) {
                // On privilégie les numéros à haute énergie spectrale
                const candidate = spectral.length > 0 
                    ? spectral[Math.floor(Math.random() * Math.min(20, spectral.length))].number
                    : Math.floor(Math.random() * 90) + 1;
                
                if (!selection.includes(candidate) && !smartRandom.includes(candidate)) {
                    smartRandom.push(candidate);
                }
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
        if (selection.includes(n)) return 'bg-indigo-600 text-white ring-2 ring-white scale-110 z-10 shadow-lg font-black border-indigo-500';
        
        const affinity = heatMap[n] || 0;
        
        // Heatmap dynamique basée sur la sélection actuelle
        if (selection.length > 0) {
            if (affinity > 60) return 'bg-emerald-500 text-white shadow-[0_0_10px_#10b981] scale-105 font-bold border-emerald-400';
            if (affinity > 30) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
            if (affinity > 10) return 'bg-emerald-500/10 text-emerald-500/70 border-emerald-500/10';
            // Les numéros "froids" par rapport à la sélection (pas de corrélation)
            return 'bg-slate-900 text-slate-700 border-slate-800 opacity-40';
        }

        // État par défaut (Energie spectrale) si aucune sélection
        const spec = spectral.find(s => s.number === n);
        const energy = spec?.energy || 0;
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
                                <p className="text-[10px] text-slate-400 font-bold flex items-center gap-2">
                                    {selection.length > 0 ? (
                                        <span className="text-emerald-400 flex items-center gap-1"><ThermometerSun size={10}/> Heatmap Active</span>
                                    ) : (
                                        "Mode Énergie Spectrale"
                                    )}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={handleMagicFill}
                                disabled={selection.length >= 5}
                                className="p-2 bg-emerald-600 rounded-full text-white hover:bg-emerald-500 transition disabled:opacity-50 shadow-lg"
                                title="Compléter intelligemment"
                            >
                                <Wand2 size={16}/>
                            </button>
                            <button onClick={() => setSelection([])} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white transition shadow-lg"><RefreshCw size={14}/></button>
                        </div>
                    </div>

                    <div className="grid grid-cols-10 gap-2 relative z-10">
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
                    
                    {/* Background Decor */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none"></div>
                </div>

                {/* Panneau de Contrôle & Métriques */}
                <div className="lg:w-80 flex flex-col gap-6">
                    {/* Ticket Preview */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-xl min-h-[200px] flex flex-col justify-between">
                        <div>
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Activity size={14} className="text-emerald-500"/> Analyse Temps Réel
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