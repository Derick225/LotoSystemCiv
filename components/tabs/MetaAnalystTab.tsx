
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { generatePlatinumPrediction, savePlatinumHistory, type StrategyBias, calculateOptimalUserBias } from '../../services/metaAnalystService';
import { getFusionConfig, saveFusionConfig } from '../../services/userPreferencesService';
import { useNexus } from '../NexusProvider';
import type { PlatinumResult } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { TicketXRay } from '../TicketXRay';
import { 
    Brain, ShieldCheck, Activity, Target, 
    Layers, Zap, Sparkles, RefreshCw,
    Sliders, Waves, Gauge, ChevronDown, Dna, Save, LayoutTemplate, Wand2
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, Cell, RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip } from 'recharts';

interface MetaAnalystTabProps {
    drawName: string;
}

export const MetaAnalystTab: React.FC<MetaAnalystTabProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { history, loading: nexusLoading, spectral, fractal, velocity, cliques } = useNexus();
    
    const [result, setResult] = useState<PlatinumResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
    
    // Initialise avec une config optimale calculée automatiquement si possible
    const [bias, setBias] = useState<StrategyBias>(() => {
        // Tente de récupérer la config sauvegardée, sinon auto-tune
        const saved = getFusionConfig();
        // Si c'est le défaut (0.5 partout), on force l'auto-tune au montage si historique dispo
        if (saved.stability === 0.5 && saved.chaos === 0.3 && saved.harmony === 0.7) {
             return saved; 
        }
        return saved;
    });
    
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        // Chargement initial du résultat si dispo
        if (history.length >= 30 && !result && !loading) {
            handleAutoTune(); // Auto-tune au premier chargement pour garantir la cohérence
            runMetaAnalysis();
        }
        return () => { isMounted.current = false; };
    }, [drawName, history, nexusLoading]);

    // Auto-save configuration on change
    useEffect(() => {
        saveFusionConfig(bias);
    }, [bias]);

    const handleAutoTune = () => {
        if (history.length < 20) return;
        const optimal = calculateOptimalUserBias(drawName, history);
        setBias(optimal);
        showToast(`Biais optimisé pour ${drawName} : S${(optimal.stability*10).toFixed(0)} C${(optimal.chaos*10).toFixed(0)} H${(optimal.harmony*10).toFixed(0)}`, "success");
    };

    const runMetaAnalysis = async () => {
        if (isMounted.current) setLoading(true);
        try {
            const data = await generatePlatinumPrediction(
                drawName, 
                history, 
                { spectral, fractal, velocity, cliques },
                bias
            );
            
            if (isMounted.current) {
                setResult(data);
                savePlatinumHistory(data);
                if (!loading) showToast("Fusion Platinum v5.0 stabilisée.", "success");
            }
        } catch (e: any) {
            if (isMounted.current) showToast(e.message || "Erreur de fusion Platinum", "error");
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    const applyPreset = (preset: 'balanced' | 'chaos' | 'stable' | 'harmonic') => {
        switch(preset) {
            case 'balanced': setBias({ stability: 0.5, chaos: 0.5, harmony: 0.5 }); break;
            case 'chaos': setBias({ stability: 0.2, chaos: 0.9, harmony: 0.4 }); break;
            case 'stable': setBias({ stability: 0.9, chaos: 0.1, harmony: 0.6 }); break;
            case 'harmonic': setBias({ stability: 0.6, chaos: 0.3, harmony: 0.95 }); break;
        }
        showToast(`Profil ${preset.toUpperCase()} chargé.`, "info");
    };

    if (nexusLoading) return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-8 bg-slate-900/50 rounded-[2.5rem] md:rounded-[4rem] border-2 border-dashed border-indigo-500/20 p-6 animate-pulse">
            <div className="relative">
                <div className="w-24 h-24 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                <Brain className="absolute inset-0 m-auto text-indigo-400 w-10 h-10 animate-pulse" />
            </div>
            <p className="text-indigo-400 font-black uppercase tracking-[0.3em] text-xs">Initialisation du Noyau...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-20 w-full overflow-hidden">
            {/* Header Platinum Premium */}
            <div className="bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-900 dark:to-slate-950 p-4 md:p-12 rounded-[2.5rem] md:rounded-[3rem] shadow-2xl border border-white/50 dark:border-slate-800 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] group-hover:bg-indigo-500/20 transition-all duration-1000"></div>
                
                <div className="relative z-10 grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
                    <div className="text-center lg:text-left w-full">
                        <div className="flex items-center justify-center lg:justify-start gap-3 mb-4">
                            <div className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-indigo-600/30">
                                Platinum Engine v5.0
                            </div>
                            <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-[9px] font-black uppercase">
                                <ShieldCheck size={12}/> Secure Core
                            </div>
                        </div>
                        <h2 className="text-3xl md:text-6xl font-black text-slate-800 dark:text-white tracking-tighter leading-none mb-6">
                            Quantum <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">Synthesizer</span>
                        </h2>
                        
                        {/* Mixer Panel */}
                        <div className="bg-white/60 dark:bg-black/30 backdrop-blur-md p-4 md:p-6 rounded-3xl border border-white/20 shadow-inner space-y-5 text-left w-full max-w-full">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
                                    <Sliders size={14}/> Paramètres de Fusion
                                </h4>
                                <div className="flex gap-2">
                                    <button onClick={handleAutoTune} className="p-2 bg-emerald-600 text-white rounded-xl shadow-lg hover:bg-emerald-500 transition-all" title="Auto-Calibration">
                                        <Wand2 size={16} />
                                    </button>
                                    <button onClick={runMetaAnalysis} disabled={loading} className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100" title="Relancer la Fusion">
                                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                                    </button>
                                </div>
                            </div>

                            {/* Presets - Scrollable avec contrainte de largeur mobile */}
                            <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-2 w-full max-w-[85vw] md:max-w-full touch-pan-x">
                                <button onClick={() => applyPreset('balanced')} className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg text-[9px] font-bold uppercase text-slate-600 dark:text-slate-400 hover:bg-indigo-100 hover:text-indigo-600 transition flex items-center gap-1 whitespace-nowrap flex-shrink-0"><LayoutTemplate size={10}/> Équilibré</button>
                                <button onClick={() => applyPreset('stable')} className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg text-[9px] font-bold uppercase text-slate-600 dark:text-slate-400 hover:bg-emerald-100 hover:text-emerald-600 transition flex items-center gap-1 whitespace-nowrap flex-shrink-0"><Gauge size={10}/> Stable</button>
                                <button onClick={() => applyPreset('chaos')} className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg text-[9px] font-bold uppercase text-slate-600 dark:text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition flex items-center gap-1 whitespace-nowrap flex-shrink-0"><Zap size={10}/> Chaos</button>
                                <button onClick={() => applyPreset('harmonic')} className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg text-[9px] font-bold uppercase text-slate-600 dark:text-slate-400 hover:bg-purple-100 hover:text-purple-600 transition flex items-center gap-1 whitespace-nowrap flex-shrink-0"><Waves size={10}/> Spectral</button>
                            </div>
                            
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase mb-1">
                                        <span className="flex items-center gap-1"><Waves size={10}/> Harmonie Spectrale</span>
                                        <span className="text-purple-600 dark:text-purple-400">{Math.round(bias.harmony * 100)}%</span>
                                    </div>
                                    <input type="range" min="0" max="1" step="0.1" value={bias.harmony} onChange={(e) => setBias(p => ({...p, harmony: parseFloat(e.target.value)}))} className="w-full h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-purple-500" />
                                </div>
                                <div>
                                    <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase mb-1">
                                        <span className="flex items-center gap-1"><Gauge size={10}/> Stabilité (Moyenne)</span>
                                        <span className="text-emerald-600 dark:text-emerald-400">{Math.round(bias.stability * 100)}%</span>
                                    </div>
                                    <input type="range" min="0" max="1" step="0.1" value={bias.stability} onChange={(e) => setBias(p => ({...p, stability: parseFloat(e.target.value)}))} className="w-full h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-emerald-500" />
                                </div>
                                <div>
                                    <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase mb-1">
                                        <span className="flex items-center gap-1"><Zap size={10}/> Entropie (Chaos)</span>
                                        <span className="text-rose-600 dark:text-rose-400">{Math.round(bias.chaos * 100)}%</span>
                                    </div>
                                    <input type="range" min="0" max="1" step="0.1" value={bias.chaos} onChange={(e) => setBias(p => ({...p, chaos: parseFloat(e.target.value)}))} className="w-full h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-rose-500" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="relative h-64 md:h-full min-h-[300px] bg-slate-900 rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl flex flex-col items-center justify-center text-center">
                        <Target size={60} className="text-indigo-500 mb-6 animate-pulse-slow" />
                        <h3 className="text-2xl font-black text-white mb-2">{result ? result.kingNumbers.length : 0} King Numbers</h3>
                        <p className="text-slate-400 text-xs font-medium max-w-xs leading-relaxed">
                            Les "King Numbers" sont les vecteurs qui survivent à toutes les stratégies simultanées.
                        </p>
                        <div className="flex gap-3 mt-6 justify-center flex-wrap">
                            {result?.kingNumbers.map((k, i) => (
                                <div key={k.number} className="relative group cursor-help">
                                    <div className="absolute -top-2 -right-2 bg-indigo-600 text-white text-[8px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-slate-900 z-10 shadow-lg">
                                        {k.count}
                                    </div>
                                    <NumberBall number={k.number} size="md" isAttractor={true} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Results Grid */}
            {result && (
                <div className="grid lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-8 space-y-4">
                        <div className="flex items-center justify-between px-2 mb-2">
                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                                <Layers size={20} className="text-indigo-600" /> Vecteurs Synthétisés
                            </h3>
                            <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-slate-500 uppercase">
                                Top 5 Fusion
                            </span>
                        </div>

                        {result.combinations.map((combo, idx) => (
                            <div 
                                key={idx} 
                                onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                                className={`
                                    bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border transition-all cursor-pointer relative overflow-hidden group
                                    ${expandedIdx === idx ? 'border-indigo-500 ring-1 ring-indigo-500/50 shadow-xl scale-[1.01]' : 'border-slate-100 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700'}
                                `}
                            >
                                <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-20">
                                    <div className="flex items-center gap-4 w-full md:w-auto">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner font-black text-lg text-white ${idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-slate-400' : idx === 2 ? 'bg-orange-700' : 'bg-slate-800'}`}>
                                            #{idx + 1}
                                        </div>
                                        <div className="flex gap-2">
                                            {combo.numbers.map(n => <NumberBall key={n} number={n} size="sm" />)}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                                        <div className="text-right">
                                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Score Fusion</div>
                                            <div className="text-2xl font-black text-indigo-600 font-mono">{combo.score}</div>
                                        </div>
                                        <div className={`p-2 rounded-full transition-transform duration-300 ${expandedIdx === idx ? 'bg-indigo-100 text-indigo-600 rotate-180' : 'bg-slate-100 text-slate-400'}`}>
                                            <ChevronDown size={18} />
                                        </div>
                                    </div>
                                </div>

                                {/* Tags */}
                                <div className="flex flex-wrap gap-2 mt-4 relative z-20">
                                    {combo.tags.map((tag, tIdx) => (
                                        <span key={tIdx} className="text-[8px] font-black uppercase px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 border border-slate-200 dark:border-slate-600">
                                            {tag}
                                        </span>
                                    ))}
                                </div>

                                {/* DNA & X-Ray View */}
                                {expandedIdx === idx && (
                                    <div className="mt-6 animate-slide-up grid md:grid-cols-2 gap-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                                        <div>
                                            <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                <Dna size={12}/> Génome de la Combinaison
                                            </h5>
                                            {combo.breakdown && (
                                                <div className="h-40 w-full">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                                                            { subject: 'Stabilité', A: combo.breakdown.stability, fullMark: 100 },
                                                            { subject: 'Chaos', A: combo.breakdown.chaos, fullMark: 100 },
                                                            { subject: 'Harmonie', A: combo.breakdown.harmony, fullMark: 100 },
                                                            { subject: 'Pattern', A: combo.breakdown.pattern, fullMark: 100 },
                                                        ]}>
                                                            <PolarGrid stroke="#e5e7eb" strokeOpacity={0.2} />
                                                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                                                            <Radar name="ADN" dataKey="A" stroke="#6366f1" strokeWidth={2} fill="#6366f1" fillOpacity={0.4} />
                                                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                                                        </RadarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </div>
                                        <div className="h-full flex flex-col justify-end">
                                            <TicketXRay numbers={combo.numbers} score={combo.score} showTitle={true} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Side Stats */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-white dark:bg-gray-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700">
                            <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Activity size={16} className="text-emerald-500"/> Zones Chaudes (Spectral)
                            </h4>
                            <div className="h-48 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={result.hotZonesSpectro.map((n, i) => ({ n, v: 10 - i }))}>
                                        <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                                            {result.hotZonesSpectro.map((_, index) => (
                                                <Cell key={index} fill={index < 3 ? '#10b981' : '#cbd5e1'} />
                                            ))}
                                        </Bar>
                                        <XAxis dataKey="n" tick={{fontSize: 9, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="text-[9px] text-slate-400 text-center font-bold mt-4">Top 10 des numéros par densité spectrale brute.</p>
                        </div>

                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-8 rounded-[3rem] border border-indigo-100 dark:border-indigo-800">
                            <h4 className="text-sm font-black text-indigo-800 dark:text-indigo-300 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Sparkles size={16}/> Note de l'Expert
                            </h4>
                            <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80 leading-relaxed font-bold italic">
                                "Le moteur Platinum v5.0 intègre désormais vos biais stratégiques en temps réel. La sauvegarde est automatique."
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
