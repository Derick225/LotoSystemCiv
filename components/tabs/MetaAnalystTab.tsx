
import React, { useState, useEffect, useRef } from 'react';
import { generatePlatinumPrediction, savePlatinumHistory, calculateOptimalUserBias } from '../../services/metaAnalystService';
import { getFusionConfig, saveFusionConfig } from '../../services/userPreferencesService';
import { useNexus } from '../NexusProvider';
import type { PlatinumResult, StrategyBias } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { TicketXRay } from '../TicketXRay';
// Added ChevronDown to the imported icons
import { 
    Brain, ShieldCheck, Target, 
    Layers, Zap, RefreshCw,
    Wand2, Dna, Crown, Star, AlertCircle, Info, Gauge,
    ChevronDown
} from 'lucide-react';

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

    useEffect(() => {
        isMounted.current = true;
        if (history.length >= 25 && !result && !loading && !nexusLoading) {
            runMetaAnalysis();
        }
        return () => { isMounted.current = false; };
    }, [drawName, history.length, nexusLoading]);

    const runMetaAnalysis = async () => {
        if (history.length < 20) return;
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
                showToast("Synthèse Platinum stabilisée.", "success");
            }
        } catch (e: any) {
            if (isMounted.current) showToast("Erreur de fusion", "error");
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    const handleAutoTune = () => {
        const optimal = calculateOptimalUserBias(drawName, history);
        setBias(optimal);
        saveFusionConfig(optimal as any);
        showToast("Optimisation automatique appliquée.", "success");
    };

    const BIAS_LABELS: Record<string, { label: string, desc: string, icon: any }> = {
        stability: { label: "Inertie", desc: "Favorise les numéros qui sortent souvent.", icon: <ShieldCheck size={14}/> },
        chaos: { label: "Rupture", desc: "Favorise les numéros en grand retard.", icon: <Zap size={14}/> },
        harmony: { label: "Vibration", desc: "Favorise les cycles réguliers.", icon: <Star size={14}/> },
        wavelet: { label: "Impulsion", desc: "Favorise les tendances court-terme.", icon: <Layers size={14}/> },
        orchestration: { label: "Symétrie", desc: "Favorise les suites logiques.", icon: <Dna size={14}/> }
    };

    if (nexusLoading || (loading && !result)) return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-8 bg-slate-900/50 rounded-[3rem] p-10 animate-pulse border border-dashed border-indigo-500/20">
            <Brain className="text-indigo-400 w-12 h-12 animate-pulse" />
            <p className="text-indigo-400 font-black uppercase tracking-[0.3em] text-xs">Fusion des cerveaux tactiques...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-20 w-full overflow-hidden">
            {/* Panneau de Contrôle Intelligible */}
            <div className="bg-slate-900 text-white p-8 md:p-12 rounded-[3.5rem] shadow-2xl border border-white/5 relative overflow-hidden group">
                <div className="relative z-10 grid lg:grid-cols-12 gap-12 items-start">
                    <div className="lg:col-span-7 space-y-8">
                        <div>
                            <div className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full w-fit mb-4">PLATINUM v7.1</div>
                            <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-none">Synthesizer <span className="text-indigo-500">ML</span></h2>
                            <p className="text-slate-400 mt-4 text-sm font-medium leading-relaxed">
                                Ajustez les curseurs pour définir votre stratégie. L'IA fusionnera les moteurs mathématiques selon vos préférences de risque.
                            </p>
                        </div>

                        <div className="space-y-6">
                            {Object.entries(bias).map(([key, val]) => (
                                <div key={key} className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="text-indigo-400">{BIAS_LABELS[key].icon}</div>
                                            <div>
                                                <div className="text-xs font-black uppercase text-white">{BIAS_LABELS[key].label}</div>
                                                <div className="text-[10px] text-slate-500 font-medium">{BIAS_LABELS[key].desc}</div>
                                            </div>
                                        </div>
                                        <div className="text-lg font-black text-indigo-400 font-mono">{Math.round(Number(val) * 100)}%</div>
                                    </div>
                                    <input 
                                        type="range" min="0" max="1" step="0.1" value={val} 
                                        onChange={(e) => {
                                            const newBias = { ...bias, [key]: parseFloat(e.target.value) };
                                            setBias(newBias);
                                            saveFusionConfig(newBias as any);
                                        }}
                                        className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-500" 
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="lg:col-span-5 space-y-6 sticky top-0">
                        <div className="bg-black/40 p-8 rounded-[3rem] border border-white/10 text-center">
                            <Gauge size={48} className="mx-auto text-indigo-500 mb-4" />
                            <h4 className="text-white font-black uppercase text-sm tracking-widest mb-2">Prêt pour Inférence</h4>
                            <p className="text-xs text-slate-500 mb-8">Cliquez pour générer les 5 meilleures combinaisons basées sur vos réglages.</p>
                            
                            <div className="flex flex-col gap-3">
                                <button onClick={handleAutoTune} className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all">
                                    <Wand2 size={16}/> Auto-Optimisation
                                </button>
                                <button onClick={runMetaAnalysis} disabled={loading} className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl shadow-xl shadow-indigo-600/20 font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50">
                                    {loading ? <RefreshCw className="animate-spin" size={20}/> : <Zap size={20}/>} Lancer Synthèse
                                </button>
                            </div>
                        </div>

                        <div className="p-5 bg-indigo-500/10 rounded-[2rem] border border-indigo-500/20 flex gap-4">
                            <Info size={18} className="text-indigo-400 shrink-0" />
                            <p className="text-[10px] text-indigo-300 font-medium leading-relaxed italic">
                                "Le mode Inertie est idéal pour les jeux stables, tandis que le mode Chaos excelle lors des changements de cycles imprévus."
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Résultats Intelligibles */}
            {result && (
                <div className="space-y-6 animate-slide-up">
                    <div className="bg-indigo-600 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden text-white">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Crown size={120} /></div>
                        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                            <div>
                                <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tighter flex items-center gap-3">
                                    <Star fill="currentColor" size={24}/> Vecteurs Maîtres
                                </h3>
                                <p className="text-indigo-100 text-xs font-bold uppercase mt-1">Les numéros les plus recommandés par tous les modèles</p>
                            </div>
                            <div className="flex gap-4">
                                {result.kingNumbers.slice(0, 4).map(king => (
                                    <div key={king.number} className="flex flex-col items-center gap-2 bg-white/20 p-4 rounded-3xl backdrop-blur-md border border-white/20">
                                        <NumberBall number={king.number} size="md" isAttractor />
                                        <span className="text-[10px] font-black">{king.count} Appuis</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4">
                        {result.combinations.map((combo, idx) => (
                            <div 
                                key={idx} 
                                onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                                className={`bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border shadow-sm transition-all cursor-pointer relative overflow-hidden group ${expandedIdx === idx ? 'border-indigo-500 ring-1 ring-indigo-500/50 shadow-xl' : 'border-slate-100 dark:border-slate-700 hover:border-indigo-300'}`}
                            >
                                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                                    <div className="flex items-center gap-6">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg text-white shadow-lg ${idx === 0 ? 'bg-amber-500' : 'bg-slate-700'}`}>#{idx + 1}</div>
                                        <div className="flex gap-2">
                                            {combo.numbers.map(n => <NumberBall key={n} number={n} size="sm" />)}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-8">
                                        <div className="text-right">
                                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Score de Confiance</div>
                                            <div className="text-2xl font-black text-indigo-600">{combo.score}%</div>
                                        </div>
                                        <ChevronDown size={20} className={`transition-transform ${expandedIdx === idx ? 'rotate-180' : ''}`} />
                                    </div>
                                </div>

                                {expandedIdx === idx && (
                                    <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-700 animate-fade-in">
                                        <TicketXRay numbers={combo.numbers} score={combo.score} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
