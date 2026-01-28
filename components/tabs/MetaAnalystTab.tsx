
import React, { useState, useEffect, useRef } from 'react';
import { generatePlatinumPrediction, savePlatinumHistory, calculateOptimalUserBias } from '../../services/metaAnalystService';
import { getFusionConfig, saveFusionConfig } from '../../services/userPreferencesService';
import { useNexus } from '../NexusProvider';
import type { PlatinumResult, StrategyBias } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { TicketXRay } from '../TicketXRay';
import { 
    Brain, ShieldCheck, Zap, RefreshCw, 
    Wand2, Dna, Crown, Star, Filter, 
    Gauge, Activity, FileText, ChevronDown, Binary, Sparkles, Shuffle,
    Database, Flame, Snowflake, Leaf
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MetaAnalystTabProps {
    drawName: string;
}

export const MetaAnalystTab: React.FC<MetaAnalystTabProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { history, loading: nexusLoading, spectral, fractal, wavelet, correlationMatrix, regularity } = useNexus();
    
    const [result, setResult] = useState<PlatinumResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(0);
    const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
    
    const [bias, setBias] = useState<StrategyBias>(() => {
        const saved = getFusionConfig() as any;
        return {
            stability: saved?.stability ?? 0.35,
            chaos: saved?.chaos ?? 0.4,
            harmony: saved?.harmony ?? 0.45,
            wavelet: saved?.wavelet ?? 0.5,
            orchestration: saved?.orchestration ?? 0.55
        };
    });
    
    const isMounted = useRef(true);

    const runMetaAnalysis = async () => {
        if (history.length < 25) {
             showToast("Dataset insuffisant (Min 25 pour v16).", "error");
             return;
        }
        setLoading(true);
        setStep(1);
        
        try {
            // Simulation visuelle du Vortex
            setTimeout(() => setStep(2), 600);
            setTimeout(() => setStep(3), 1200);
            setTimeout(() => setStep(4), 1800);

            const data = await generatePlatinumPrediction(
                drawName, 
                history, 
                { spectral, fractal, wavelet, correlationMatrix, regularity },
                bias
            );
            
            if (isMounted.current) {
                setResult(data);
                savePlatinumHistory(data);
                showToast("Noyau Platinum v16.1 synchronisé.", "success");
            }
        } catch (e: any) {
            if (isMounted.current) showToast("Erreur noyau : " + e.message, "error");
        } finally {
            if (isMounted.current) {
                setLoading(false);
                setStep(0);
            }
        }
    };

    const handleAutoTune = () => {
        const optimal = calculateOptimalUserBias(drawName, history);
        setBias(optimal);
        saveFusionConfig(optimal as any);
        if (optimal.orchestration < 0.2) {
            showToast("Mode Organique activé (Pas de machine détectée).", "info");
        } else {
            showToast("Paramètres ajustés sur l'historique CSV.", "success");
        }
    };

    const BIAS_LABELS: Record<string, { label: string, desc: string, icon: any }> = {
        stability: { label: "Inertie", desc: "Suivi des répétitions.", icon: <ShieldCheck size={14}/> },
        chaos: { label: "Anticipation", desc: "Réveil des écarts.", icon: <Zap size={14}/> },
        harmony: { label: "Fréquence", desc: "Analyse FFT.", icon: <Star size={14}/> },
        wavelet: { label: "Impulsion", desc: "Singularité locale.", icon: <Activity size={14}/> },
        orchestration: { label: "Translocation", desc: "Echo Machine/Miroir.", icon: <Binary size={14}/> }
    };

    if (nexusLoading || (loading && !result)) return (
        <div className="flex flex-col items-center justify-center min-h-[500px] gap-10 bg-slate-950 rounded-[4rem] p-10 border border-indigo-500/20 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(79,70,229,0.1),transparent_70%)] animate-pulse"></div>
            
            <div className="relative">
                <div className="w-32 h-32 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
                <Brain className="absolute inset-0 m-auto text-indigo-400 w-12 h-12 animate-pulse" />
            </div>

            <div className="text-center space-y-4 relative z-10">
                <p className="text-indigo-400 font-black uppercase tracking-[0.5em] text-xs">Platinum Fusion v16.1</p>
                <div className="space-y-2">
                    <p className={`text-sm font-bold transition-all duration-500 ${step >= 1 ? 'text-white' : 'text-slate-700'}`}>1. Analyse Structurelle (Machine/Organique)</p>
                    <p className={`text-sm font-bold transition-all duration-500 ${step >= 2 ? 'text-white' : 'text-slate-700'}`}>2. Sélection Duale (Hot/Correction Sigma)</p>
                    <p className={`text-sm font-bold transition-all duration-500 ${step >= 3 ? 'text-white' : 'text-slate-700'}`}>3. Injection de Diversité Stochastique</p>
                    <p className={`text-sm font-bold transition-all duration-500 ${step >= 4 ? 'text-white' : 'text-slate-700'}`}>4. Validation Volatilité (AC > 6)</p>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-24 w-full overflow-hidden">
            {/* Status Info */}
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
                <div className="bg-indigo-600/10 border border-indigo-500/20 px-4 py-2 rounded-xl flex items-center gap-3 shrink-0">
                    <Shuffle size={14} className="text-indigo-400" />
                    <span className="text-[10px] font-black uppercase text-indigo-300">Data-Driven Bias</span>
                </div>
                <div className="bg-emerald-600/10 border border-emerald-500/20 px-4 py-2 rounded-xl flex items-center gap-3 shrink-0">
                    <Database size={14} className="text-emerald-400" />
                    <span className="text-[10px] font-black uppercase text-emerald-300">Deep History Scan</span>
                </div>
            </div>

            <div className="bg-slate-900 text-white p-8 md:p-12 rounded-[3.5rem] shadow-2xl border border-white/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none"></div>
                
                <div className="relative z-10 grid lg:grid-cols-12 gap-12 items-start">
                    <div className="lg:col-span-7 space-y-10">
                        <div>
                            <div className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full w-fit mb-4">KERNEL APEX v16.1</div>
                            <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-none">Neural <span className="text-indigo-500">Synthesizer</span></h2>
                            <p className="text-slate-400 mt-6 text-sm md:text-base font-medium leading-relaxed">
                                Le moteur v16.1 détecte automatiquement si le jeu inclut une machine ou non. En mode "Organique", il compense l'absence de données machine par une analyse accrue de la volatilité et des écarts.
                            </p>
                        </div>

                        <div className="space-y-6">
                            {Object.entries(bias).map(([key, val]) => (
                                <div key={key} className="space-y-4 bg-white/5 p-5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-4">
                                            <div className="text-indigo-400 p-2 bg-white/5 rounded-xl">{BIAS_LABELS[key].icon}</div>
                                            <div>
                                                <div className="text-xs font-black uppercase text-white">{BIAS_LABELS[key].label}</div>
                                                <div className="text-[10px] text-slate-500 font-medium">{BIAS_LABELS[key].desc}</div>
                                            </div>
                                        </div>
                                        <div className="text-xl font-black text-indigo-400 font-mono">{Math.round(Number(val) * 100)}%</div>
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
                        <div className="bg-black/40 p-10 rounded-[3.5rem] border border-white/10 text-center relative overflow-hidden group/box">
                            <Gauge size={64} className="mx-auto text-indigo-500 mb-6 animate-pulse-slow" />
                            <h4 className="text-white font-black uppercase text-sm tracking-widest mb-2">Cycle d'Inférence</h4>
                            <p className="text-xs text-slate-500 mb-10">Synthèse par équilibre structurel diversifié.</p>
                            
                            <div className="flex flex-col gap-4">
                                <button onClick={handleAutoTune} className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 transition-all">
                                    <Wand2 size={16}/> Calibration Auto (CSV)
                                </button>
                                <button onClick={runMetaAnalysis} disabled={loading} className="w-full py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl shadow-2xl shadow-indigo-600/30 font-black text-xs uppercase tracking-[0.3em] flex items-center justify-center gap-4 transition-all active:scale-[0.98] disabled:opacity-50">
                                    {loading ? <RefreshCw className="animate-spin" size={22}/> : <Sparkles size={22}/>} Lancer Fusion
                                </button>
                            </div>
                        </div>

                        <div className="p-6 bg-amber-500/10 rounded-[2.5rem] border border-amber-500/20 flex gap-4">
                            <Binary size={24} className="text-amber-500 shrink-0" />
                            <p className="text-[11px] text-amber-300 font-medium leading-relaxed italic">
                                "L'analyse hybride 'Sigma-Correction' cible les zones de probabilité négligées par la foule pour contrer la volatilité extrême."
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Résultats v16 */}
            {result && (
                <div className="space-y-8 animate-slide-up">
                    <div className="bg-gradient-to-br from-indigo-600 to-indigo-900 p-10 rounded-[4rem] shadow-2xl relative overflow-hidden text-white">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Crown size={140} /></div>
                        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-10">
                            <div className="text-center md:text-left">
                                <h3 className="text-3xl md:text-4xl font-black uppercase tracking-tighter flex items-center justify-center md:justify-start gap-4">
                                    <Star fill="currentColor" className="text-amber-400" size={32}/> Vecteurs Maîtres v16
                                </h3>
                                <p className="text-indigo-100 text-xs font-bold uppercase tracking-[0.2em] mt-2 opacity-80">Noyaux d'ancrage du pool thermique</p>
                            </div>
                            <div className="flex gap-4 md:gap-6 flex-wrap justify-center">
                                {result.kingNumbers.slice(0, 4).map(king => (
                                    <div key={king.number} className="flex flex-col items-center gap-3 bg-white/10 p-6 rounded-[2.5rem] backdrop-blur-md border border-white/20 hover:bg-white/20 transition-all cursor-help group/k">
                                        <NumberBall number={king.number} size="md" isAttractor />
                                        <div className="flex flex-col items-center">
                                            {/* Badge Hot/Cold */}
                                            {king.count === 2 ? (
                                                <span className="flex items-center gap-1 text-[8px] font-black uppercase text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/30">
                                                    <Flame size={8} fill="currentColor"/> HOT
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-[8px] font-black uppercase text-cyan-300 bg-cyan-500/20 px-2 py-0.5 rounded border border-cyan-500/30">
                                                    <Leaf size={8} fill="currentColor"/> ORGANIC
                                                </span>
                                            )}
                                        </div>
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
                                className={`bg-white dark:bg-slate-800 p-8 rounded-[3rem] border shadow-sm transition-all cursor-pointer relative overflow-hidden group ${expandedIdx === idx ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-2xl' : 'border-slate-100 dark:border-slate-700 hover:border-indigo-300'}`}
                            >
                                <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                                    <div className="flex items-center gap-8">
                                        <div className={`w-16 h-16 rounded-[1.8rem] flex items-center justify-center font-black text-2xl text-white shadow-lg ${idx === 0 ? 'bg-amber-500' : 'bg-slate-700'}`}>#{idx + 1}</div>
                                        <div className="flex gap-3">
                                            {combo.numbers.map(n => {
                                                const isKing = result.kingNumbers.some(k => k.number === n);
                                                return <NumberBall key={n} number={n} size="sm" isAttractor={isKing} />;
                                            })}
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-10">
                                        <div className="flex gap-2">
                                            {combo.tags?.map(tag => (
                                                <span key={tag} className="px-4 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[9px] font-black uppercase rounded-xl tracking-widest border border-black/5">{tag}</span>
                                            ))}
                                            <span className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-500 text-[8px] font-black uppercase rounded-lg border border-indigo-100 dark:border-indigo-800">
                                                Kings: {combo.breakdown?.kings}/5
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Confiance Apex</div>
                                            <div className="text-4xl font-black text-indigo-600 dark:text-indigo-400">{combo.score}%</div>
                                        </div>
                                        <ChevronDown size={24} className={`text-slate-300 transition-transform duration-500 ${expandedIdx === idx ? 'rotate-180 text-indigo-500' : ''}`} />
                                    </div>
                                </div>

                                {expandedIdx === idx && (
                                    <div className="mt-10 pt-10 border-t border-slate-100 dark:border-slate-700 animate-fade-in">
                                        <TicketXRay numbers={combo.numbers} score={combo.score} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    
                    <div className="bg-slate-900 p-10 rounded-[3.5rem] border border-indigo-500/10 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-5"><FileText size={100} /></div>
                        <h4 className="text-white font-black uppercase text-sm mb-6 flex items-center gap-3">
                            <Activity size={18} className="text-indigo-500" /> Synthèse de l'Oracle v16.1
                        </h4>
                        <p className="text-slate-400 text-sm md:text-base leading-relaxed italic font-medium max-w-5xl">
                            "{result.analysis}"
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
