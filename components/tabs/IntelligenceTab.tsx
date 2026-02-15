
import React, { useState, useEffect, useRef } from 'react';
import { analyzeDrawLogic } from '../../services/geminiService';
import { generateNarrativeReport } from '../../services/narrativeService';
import { calculateVolatility, calculateShannonEntropy, calculateChiSquare, calculateFractalIndex } from '../../services/mathService';
import type { GeminiReasoning, NarrativeReport } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { SafeMarkdown } from '../ui/SafeMarkdown';
import { useNexus } from '../NexusProvider';
import { Brain, Sparkles, Activity, ShieldCheck, Terminal, FileText, BrainCircuit, Target, Copy, RefreshCw, BarChart3, Wind, Fingerprint } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface IntelligenceTabProps {
    drawName: string;
}

export const IntelligenceTab: React.FC<IntelligenceTabProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { history, stats } = useNexus();
    
    // State
    const [analysis, setAnalysis] = useState<GeminiReasoning | null>(null);
    const [narrative, setNarrative] = useState<NarrativeReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [contextMetrics, setContextMetrics] = useState<{ volatility: number, entropy: number, hurst: number } | null>(null);
    const [activeView, setActiveView] = useState<'narrative' | 'terminal'>('narrative'); // For mobile toggle

    const isMounted = useRef(true);
    const terminalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // Scroll auto du terminal
    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [analysis]);

    const handleRunAnalysis = async () => {
        if (isMounted.current) setLoading(true);
        try {
            if (history.length < 15) {
                if (isMounted.current) {
                    showToast("Pas assez d'historique (Min 15 requis).", "error");
                    setLoading(false);
                }
                return;
            }

            // 1. Calculs Mathématiques Préalables (Le "Grounding")
            const freqMap: Record<number, number> = {};
            stats.forEach(s => freqMap[s.number] = s.count);

            const vol = calculateVolatility(history);
            const ent = calculateShannonEntropy(history);
            const chi = calculateChiSquare(freqMap, history.length * 5);
            const hurst = calculateFractalIndex(history);

            // Protection NaN
            const safeVolatility = isNaN(vol.score) ? 50 : vol.score;
            const safeEntropy = isNaN(ent.normalized) ? 0.95 : ent.normalized;
            const safeHurst = isNaN(hurst) ? 0.5 : hurst;

            if (isMounted.current) {
                setContextMetrics({ volatility: safeVolatility, entropy: safeEntropy, hurst: safeHurst });
            }

            // 2. Lancement parallèle : Analyse Logique + Rapport Narratif
            // On introduit un léger délai artificiel pour l'effet "Calcul en cours" si la réponse est trop rapide (cache)
            const [reasoning, story] = await Promise.all([
                analyzeDrawLogic(drawName, history),
                generateNarrativeReport(drawName, history, ent, chi, safeHurst),
                new Promise(r => setTimeout(r, 1500))
            ]);

            if (isMounted.current) {
                if (reasoning) {
                    const safeReasoning = {
                        ...reasoning,
                        suggestedFocus: Array.isArray(reasoning.suggestedFocus) ? reasoning.suggestedFocus : []
                    };
                    setAnalysis(safeReasoning);
                }
                if (story) setNarrative(story);
                showToast("Inférence Nexus terminée.", "success");
            }
        } catch (e: any) {
            console.error("Inference Tab Error:", e);
            if (isMounted.current) showToast(`Anomalie : ${e.message || "Échec de l'inférence"}`, "error");
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast("Rapport copié.", "success");
    };

    const getScoreColor = (score: number) => {
        const s = isNaN(score) ? 50 : score;
        if (s >= 80) return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
        if (s >= 60) return "text-indigo-400 border-indigo-500/30 bg-indigo-500/10";
        return "text-rose-400 border-rose-500/30 bg-rose-500/10";
    };

    return (
        <div className="space-y-8 animate-fade-in pb-20 w-full overflow-hidden">
            
            {/* HERO SECTION: CONTROL CENTER */}
            <div className="relative bg-slate-900 rounded-[3.5rem] p-8 md:p-12 border border-slate-800 shadow-2xl overflow-hidden group">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[120px] -mr-32 -mt-32 pointer-events-none group-hover:bg-indigo-600/10 transition-colors duration-1000"></div>
                
                <div className="relative z-10 flex flex-col xl:flex-row justify-between items-center gap-10">
                    <div className="flex-1 space-y-6 text-center xl:text-left">
                        <div className="inline-flex items-center gap-3 px-4 py-2 bg-indigo-500/10 rounded-full border border-indigo-500/20 backdrop-blur-md">
                            <BrainCircuit size={18} className="text-indigo-400 animate-pulse-slow" />
                            <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-indigo-300 uppercase">Nexus Narrative Engine v12.1</span>
                        </div>
                        
                        <div>
                            <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-none mb-2">
                                Intelligence <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Cognitive</span>
                            </h2>
                            <p className="text-slate-400 max-w-xl text-sm md:text-base font-medium leading-relaxed mx-auto xl:mx-0">
                                L'Oracle analyse la texture mathématique du flux (Entropie, Hurst, Chi²) et génère une stratégie narrative intelligible. Il détecte les ruptures de symétrie invisibles aux algos classiques.
                            </p>
                        </div>
                    </div>

                    <button 
                        onClick={handleRunAnalysis} 
                        disabled={loading}
                        className="group relative px-10 py-6 bg-white hover:bg-indigo-50 text-slate-900 rounded-[2.5rem] shadow-2xl transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed min-w-[240px] flex flex-col items-center justify-center gap-2 border border-white/50"
                    >
                        {loading ? (
                            <>
                                <RefreshCw className="animate-spin text-indigo-600" size={32} />
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Traitement Neural...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles size={32} className="text-indigo-600 group-hover:scale-110 transition-transform duration-500" />
                                <span className="text-xs font-black uppercase tracking-[0.2em]">Générer Rapport</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* MAIN CONTENT GRID */}
            <div className="grid lg:grid-cols-12 gap-8">
                
                {/* LEFT: NARRATIVE REPORT (Bloomberg Style) */}
                <div className="lg:col-span-7 flex flex-col gap-6">
                    {narrative ? (
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 h-full flex flex-col relative overflow-hidden"
                        >
                            {/* Paper Header */}
                            <div className="flex justify-between items-start mb-8 pb-6 border-b border-slate-100 dark:border-slate-700">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl text-indigo-600 dark:text-indigo-400">
                                        <FileText size={24} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-[0.2em]">Dépêche Stratégique</h4>
                                        <p className="text-[10px] text-slate-400 font-medium mt-1">Généré le {new Date().toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <button onClick={() => copyToClipboard(narrative.summary)} className="p-2 text-slate-400 hover:text-indigo-500 transition-colors">
                                    <Copy size={18} />
                                </button>
                            </div>
                            
                            {/* Core Narrative */}
                            <div className="flex-1 space-y-8">
                                <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 relative">
                                    <div className="absolute top-6 left-6 text-4xl text-slate-200 dark:text-slate-800 font-serif font-black leading-none z-0">“</div>
                                    <p className="text-sm md:text-base text-slate-700 dark:text-slate-300 leading-loose font-medium relative z-10 pl-6 indent-4 text-justify">
                                        {narrative.summary}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-5 bg-emerald-50 dark:bg-emerald-900/10 rounded-3xl border border-emerald-100 dark:border-emerald-800/30">
                                        <div className="text-[9px] font-black text-emerald-600/70 uppercase mb-2 tracking-wider flex items-center gap-2"><Target size={10}/> Verdict</div>
                                        <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 leading-tight">{narrative.technicalVerdict}</p>
                                    </div>
                                    <div className="p-5 bg-orange-50 dark:bg-orange-900/10 rounded-3xl border border-orange-100 dark:border-orange-800/30">
                                        <div className="text-[9px] font-black text-orange-600/70 uppercase mb-2 tracking-wider flex items-center gap-2"><ShieldCheck size={10}/> Risque</div>
                                        <p className="text-xs font-bold text-orange-800 dark:text-orange-300 leading-tight">{narrative.riskAssessment}</p>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Confidence Footer */}
                            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Niveau de Confiance</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{narrative.confidence}%</span>
                                    <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500" style={{ width: `${narrative.confidence}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <div className="h-full min-h-[400px] bg-slate-50 dark:bg-slate-900/40 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-12 text-center opacity-60">
                            <Brain size={48} className="text-slate-400 mb-6" />
                            <h3 className="text-lg font-black text-slate-500 uppercase tracking-widest">En attente de signal</h3>
                            <p className="text-xs text-slate-400 mt-2 max-w-xs">Lancez l'analyse pour générer un rapport narratif complet.</p>
                        </div>
                    )}
                </div>

                {/* RIGHT: LOGICAL KERNEL (Hacker Terminal) */}
                <div className="lg:col-span-5 flex flex-col gap-6">
                    {/* METRICS HUD */}
                    {contextMetrics && (
                        <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-lg grid grid-cols-3 gap-2 animate-scale-in">
                            <div className="bg-black/30 p-3 rounded-2xl text-center border border-white/5">
                                <div className="text-[8px] font-black text-slate-500 uppercase mb-1">Entropie</div>
                                <div className={`text-lg font-black ${contextMetrics.entropy > 0.9 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    {Math.round(contextMetrics.entropy * 100)}%
                                </div>
                            </div>
                            <div className="bg-black/30 p-3 rounded-2xl text-center border border-white/5">
                                <div className="text-[8px] font-black text-slate-500 uppercase mb-1">Hurst</div>
                                <div className={`text-lg font-black ${contextMetrics.hurst > 0.6 ? 'text-indigo-400' : 'text-slate-300'}`}>
                                    {contextMetrics.hurst.toFixed(2)}
                                </div>
                            </div>
                            <div className="bg-black/30 p-3 rounded-2xl text-center border border-white/5">
                                <div className="text-[8px] font-black text-slate-500 uppercase mb-1">Volatilité</div>
                                <div className="text-lg font-black text-amber-400">
                                    {Math.round(contextMetrics.volatility)}%
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TERMINAL OUTPUT */}
                    <div className="bg-black rounded-[3rem] p-8 border border-slate-800 shadow-2xl flex-1 min-h-[400px] flex flex-col relative overflow-hidden font-mono">
                        {/* Header Terminal */}
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10 z-10 relative">
                            <div className="flex items-center gap-2 text-emerald-500">
                                <Terminal size={16} />
                                <span className="text-[10px] font-bold tracking-widest">KERNEL_OUTPUT</span>
                            </div>
                            <div className="flex gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50"></div>
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/50"></div>
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>
                            </div>
                        </div>

                        {/* Content */}
                        <div 
                            ref={terminalRef}
                            className="flex-1 overflow-y-auto custom-scrollbar space-y-4 text-xs z-10 relative pr-2"
                            style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        >
                            {!analysis && !loading && (
                                <div className="text-slate-600 flex flex-col items-center justify-center h-full gap-2">
                                    <Activity size={24} className="opacity-20"/>
                                    <span className="text-[10px]">SYSTEM IDLE</span>
                                </div>
                            )}

                            {loading && (
                                <div className="space-y-1">
                                    <div className="text-emerald-500/80">> Initializing neural link... OK</div>
                                    <div className="text-emerald-500/80">> Loading historical tensors... OK</div>
                                    <div className="text-emerald-500/80 animate-pulse">> Computing fractal dimension...</div>
                                </div>
                            )}

                            {analysis && (
                                <div className="space-y-6 animate-slide-up">
                                    {/* Reasoning Section */}
                                    <div>
                                        <span className="text-[9px] text-slate-500 block mb-2 uppercase">/// LOGICAL_TRACE</span>
                                        <div className="text-slate-300 leading-relaxed opacity-90">
                                            <SafeMarkdown text={analysis.logicalAnalysis} />
                                        </div>
                                    </div>

                                    {/* Anomalies */}
                                    {analysis.anomalies.length > 0 && (
                                        <div className="p-3 border border-rose-900/50 bg-rose-900/10 rounded-lg">
                                            <span className="text-[9px] text-rose-500 block mb-1 uppercase">!!! ANOMALY_DETECTED</span>
                                            <ul className="list-none space-y-1">
                                                {analysis.anomalies.map((ano, i) => (
                                                    <li key={i} className="text-rose-400 flex items-start gap-2">
                                                        <span>⚠</span> {ano}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Next Sequence */}
                                    <div>
                                        <span className="text-[9px] text-indigo-400 block mb-2 uppercase">>>> PREDICTIVE_VECTOR</span>
                                        <div className="text-indigo-300 font-bold">
                                            {analysis.nextSequence}
                                        </div>
                                    </div>

                                    {/* Focus Points */}
                                    {analysis.suggestedFocus.length > 0 && (
                                        <div className="pt-4 border-t border-white/10">
                                             <span className="text-[9px] text-emerald-500 block mb-3 uppercase">/// TARGET_LOCK</span>
                                             <div className="flex flex-wrap gap-2">
                                                {analysis.suggestedFocus.map(n => (
                                                    <span key={n} className="px-2 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded text-[10px] font-bold">
                                                        N°{n}
                                                    </span>
                                                ))}
                                             </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Scanline Overlay */}
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,6px_100%] pointer-events-none opacity-20 z-20"></div>
                    </div>
                </div>
            </div>
        </div>
    );
};
