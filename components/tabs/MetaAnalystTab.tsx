import React, { useState, useEffect, useRef } from 'react';
import { generatePlatinumPrediction, savePlatinumHistory, calculateOptimalUserBias } from '../../services/metaAnalystService';
import { getFusionConfig, saveFusionConfig } from '../../services/userPreferencesService';
import { useNexus } from '../NexusProvider';
import type { PlatinumResult, StrategyBias } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { TicketXRay } from '../TicketXRay';
import { 
    Brain, ShieldCheck, Activity, Target, 
    Layers, Zap, Sparkles, RefreshCw,
    Sliders, Waves, Gauge, ChevronDown, Dna, Wand2, Binary, Network, AlertCircle
} from 'lucide-react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip, BarChart, Bar, Cell, XAxis } from 'recharts';

interface MetaAnalystTabProps {
    drawName: string;
}

export const MetaAnalystTab: React.FC<MetaAnalystTabProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { history, loading: nexusLoading, spectral, fractal, wavelet, correlationMatrix } = useNexus();
    
    const [result, setResult] = useState<PlatinumResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
    
    const [bias, setBias] = useState<StrategyBias>(() => {
        const saved = getFusionConfig() as any;
        return {
            stability: saved?.stability ?? 0.5,
            chaos: saved?.chaos ?? 0.3,
            harmony: saved?.harmony ?? 0.5,
            wavelet: saved?.wavelet ?? 0.4,
            orchestration: saved?.orchestration ?? 0.4
        };
    });
    
    const isMounted = useRef(true);

    // Déclenchement automatique au chargement ou changement de tirage
    useEffect(() => {
        isMounted.current = true;
        if (history.length >= 25 && !result && !loading && !nexusLoading) {
            runMetaAnalysis();
        }
        return () => { isMounted.current = false; };
    }, [drawName, history.length, nexusLoading, result, loading]); // Added missing deps

    const handleAutoTune = () => {
        if (history.length < 20) {
            showToast("Dataset insuffisant pour l'auto-tuning.", "error");
            return;
        }
        const optimal = calculateOptimalUserBias(drawName, history);
        setBias(optimal);
        saveFusionConfig(optimal as any);
        showToast("Biais synchronisés avec le flux actuel.", "success");
    };

    const runMetaAnalysis = async () => {
        if (history.length < 20) {
             showToast("Données insuffisantes (Min 20 tirages).", "error");
             return;
        }
        setLoading(true);
        try {
            const data = await generatePlatinumPrediction(
                drawName, 
                history, 
                { spectral, fractal, wavelet, correlationMatrix },
                bias
            );
            
            if (isMounted.current) {
                setResult(data);
                savePlatinumHistory(data);
                showToast("Synthèse Platinum v7.1 stabilisée.", "success");
            }
        } catch (e: any) {
            console.error("Fusion Platinum Error:", e);
            if (isMounted.current) showToast(e.message || "Erreur de fusion", "error");
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    const applyPreset = (preset: 'balanced' | 'chaos' | 'stable' | 'harmonic' | 'quantum') => {
        let newBias: StrategyBias;
        switch(preset) {
            case 'balanced': newBias = { stability: 0.5, chaos: 0.5, harmony: 0.5, wavelet: 0.5, orchestration: 0.5 }; break;
            case 'chaos': newBias = { stability: 0.2, chaos: 0.9, harmony: 0.4, wavelet: 0.8, orchestration: 0.3 }; break;
            case 'stable': newBias = { stability: 0.9, chaos: 0.1, harmony: 0.6, wavelet: 0.2, orchestration: 0.8 }; break;
            case 'harmonic': newBias = { stability: 0.6, chaos: 0.3, harmony: 0.95, wavelet: 0.4, orchestration: 0.6 }; break;
            case 'quantum': newBias = { stability: 0.4, chaos: 0.6, harmony: 0.3, wavelet: 1.0, orchestration: 0.5 }; break;
            default: newBias = { stability: 0.5, chaos: 0.5, harmony: 0.5, wavelet: 0.5, orchestration: 0.5 };
        }
        setBias(newBias);
        saveFusionConfig(newBias as any);
        showToast(`Profil ${preset.toUpperCase()} appliqué.`, "info");
    };

    if (nexusLoading || (loading && !result)) return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-8 bg-slate-900/50 rounded-[3rem] p-10 animate-pulse border border-dashed border-indigo-500/20">
            <div className="relative">
                <div className="w-20 h-20 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                <Brain className="absolute inset-0 m-auto text-indigo-400 w-8 h-8 animate-pulse" />
            </div>
            <div className="text-center">
                <p className="text-indigo-400 font-black uppercase tracking-[0.3em] text-xs">Fusion des vecteurs quantiques...</p>
                <p className="text-slate-500 text-[10px] font-bold mt-2 uppercase">Assemblage des matrices de probabilité</p>
            </div>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-20 w-full overflow-hidden">
            {/* Contrôles de Fusion */}
            <div className="bg-slate-900 text-white p-8 md:p-12 rounded-[3.5rem] shadow-2xl border border-white/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px] -mr-20 -mt-20"></div>
                
                <div className="relative z-10 grid lg:grid-cols-2 gap-12 items-center">
                    <div className="space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg">PLATINUM v7.1</div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><ShieldCheck size={12} className="text-emerald-500"/> Inférence Temps Réel</span>
                        </div>
                        <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-none">Quantum <span className="text-indigo-500">Synthesizer</span></h2>
                        
                        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                            {['balanced', 'stable', 'chaos', 'harmonic', 'quantum'].map(p => (
                                <button key={p} onClick={() => applyPreset(p as any)} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all">{p}</button>
                            ))}
                        </div>

                        <div className="space-y-4 bg-black/30 p-6 rounded-3xl border border-white/5">
                            {Object.entries(bias).map(([key, val]) => (
                                <div key={key} className="space-y-1">
                                    <div className="flex justify-between text-[9px] font-black uppercase text-slate-500">
                                        <span>{key}</span>
                                        <span className="text-indigo-400">{Math.round(val * 100)}%</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="1" step="0.1" value={val} 
                                        onChange={(e) => {
                                            const newBias = { ...bias, [key]: parseFloat(e.target.value) };
                                            setBias(newBias);
                                            saveFusionConfig(newBias as any);
                                        }}
                                        className="w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-500" 
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-8">
                        <div className="h-64 w-64 bg-black/40 rounded-full border border-white/10 p-4 relative group">
                            <div className="absolute inset-0 bg-indigo-500/5 rounded-full animate-pulse-slow"></div>
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
                                    /* Fix: Explicitly casting bias properties to number to avoid arithmetic operation errors */
                                    { subject: 'Stabilité', A: (bias.stability as number) * 100 },
                                    { subject: 'Chaos', A: (bias.chaos as number) * 100 },
                                    { subject: 'Harmony', A: (bias.harmony as number) * 100 },
                                    { subject: 'Wavelet', A: (bias.wavelet as number) * 100 },
                                    { subject: 'Structure', A: (bias.orchestration as number) * 100 },
                                ]}>
                                    <PolarGrid stroke="#334155" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} />
                                    <Radar name="Biais" dataKey="A" stroke="#6366f1" fill="#6366f1" fillOpacity={0.5} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex gap-4 w-full">
                            <button onClick={handleAutoTune} className="flex-1 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95"><Wand2 size={16}/> Auto-Tune</button>
                            <button onClick={runMetaAnalysis} disabled={loading} className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl shadow-xl shadow-indigo-600/20 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50">
                                {loading ? <RefreshCw size={16} className="animate-spin"/> : <Zap size={16}/>} Lancer Synthèse
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Affichage des Résultats */}
            {result ? (
                <div className="grid lg:grid-cols-1 gap-6 animate-slide-up">
                    <div className="flex items-center justify-between px-4 mb-2">
                        <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                            <Layers size={20} className="text-indigo-600" /> Top Convergence Fusionnée
                        </h3>
                    </div>

                    {result.combinations.map((combo, idx) => (
                        <div 
                            key={idx} 
                            onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                            className={`bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border shadow-sm transition-all cursor-pointer relative overflow-hidden group ${expandedIdx === idx ? 'border-indigo-500 ring-1 ring-indigo-500/50 shadow-xl' : 'border-slate-100 dark:border-slate-700 hover:border-indigo-300'}`}
                        >
                            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                                <div className="flex items-center gap-6">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg text-white shadow-lg ${idx === 0 ? 'bg-amber-500' : 'bg-slate-700'}`}>#{idx + 1}</div>
                                    <div className="flex gap-2">
                                        {combo.numbers.map(n => <NumberBall key={n} number={n} size="sm" />)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-8">
                                    <div className="text-right">
                                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Score Nexus</div>
                                        <div className="text-2xl font-black text-indigo-600">{combo.score}</div>
                                    </div>
                                    <div className={`p-2 rounded-full transition-all ${expandedIdx === idx ? 'bg-indigo-100 text-indigo-600 rotate-180' : 'bg-slate-100 text-slate-400'}`}>
                                        <ChevronDown size={20} />
                                    </div>
                                </div>
                            </div>

                            {expandedIdx === idx && (
                                <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-700 grid md:grid-cols-2 gap-10 animate-fade-in">
                                    <TicketXRay numbers={combo.numbers} score={combo.score} showTitle={false} />
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-2 text-indigo-500"><Dna size={16}/><h5 className="text-[10px] font-black uppercase tracking-widest">ADN de cette grille</h5></div>
                                        <div className="grid grid-cols-2 gap-4">
                                            {Object.entries(combo.breakdown).map(([k, v]) => (
                                                <div key={k} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                                    <div className="text-[8px] font-black text-slate-400 uppercase">{k}</div>
                                                    <div className="text-sm font-black text-slate-700 dark:text-slate-200">{Number(v)}%</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="p-12 text-center bg-white dark:bg-slate-800 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-6">
                    <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-full"><AlertCircle size={40} className="text-slate-300"/></div>
                    <div>
                        <h4 className="text-lg font-black text-slate-400 uppercase tracking-tighter">Synthèse non initialisée</h4>
                        <p className="text-xs text-slate-500 mt-2 max-w-xs mx-auto font-medium">Cliquez sur le bouton "Lancer Synthèse" pour générer les vecteurs Platinum basés sur vos réglages.</p>
                    </div>
                </div>
            )}
        </div>
    );
};
