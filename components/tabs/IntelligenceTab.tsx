
import React, { useState, useEffect, useRef } from 'react';
import { analyzeDrawLogic } from '../../services/geminiService';
import { generateNarrativeReport } from '../../services/narrativeService';
import { calculateVolatility, calculateShannonEntropy, calculateChiSquare, calculateFractalIndex } from '../../services/mathService';
import type { GeminiReasoning, NarrativeReport } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { SafeMarkdown } from '../ui/SafeMarkdown';
import { useNexus } from '../NexusProvider';
import { Brain, Sparkles, Activity, ShieldCheck, Terminal, FileText, BrainCircuit, Target } from 'lucide-react';

interface IntelligenceTabProps {
    drawName: string;
}

export const IntelligenceTab: React.FC<IntelligenceTabProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { history, stats } = useNexus();
    const [analysis, setAnalysis] = useState<GeminiReasoning | null>(null);
    const [narrative, setNarrative] = useState<NarrativeReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [contextMetrics, setContextMetrics] = useState<{ volatility: number, entropy: number, hurst: number } | null>(null);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

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

            // Lancement parallèle : Analyse Logique + Rapport Narratif
            const [reasoning, story] = await Promise.all([
                analyzeDrawLogic(drawName, history),
                generateNarrativeReport(drawName, history, ent, chi, safeHurst)
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

    const getScoreColor = (score: number) => {
        const s = isNaN(score) ? 50 : score;
        if (s >= 80) return "text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.6)]";
        if (s >= 60) return "text-indigo-400 drop-shadow-[0_0_15px_rgba(129,140,248,0.6)]";
        return "text-rose-400 drop-shadow-[0_0_15px_rgba(251,113,133,0.6)]";
    };

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            {/* Hero Header */}
            <div className="bg-gradient-to-br from-slate-900 to-black text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden border border-slate-800">
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[140px] -mr-32 -mt-32"></div>
                
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-10">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
                                <BrainCircuit size={24} className="text-indigo-400" />
                            </div>
                            <h3 className="text-sm font-mono font-bold tracking-[0.2em] text-indigo-300 uppercase">Nexus Narrative Engine</h3>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-none mb-6">
                            Fusion Cognitive <span className="text-indigo-500">&</span> Stochastique
                        </h2>
                        <p className="text-slate-400 max-w-xl text-xs md:text-sm font-medium leading-relaxed border-l-2 border-indigo-500/50 pl-6">
                            L'Oracle Nexus analyse la texture mathématique du flux (Entropie, Hurst, Chi²) et génère une stratégie narrative intelligible. Il détecte les ruptures de symétrie invisibles aux algos classiques.
                        </p>
                    </div>
                    <button 
                        onClick={handleRunAnalysis} 
                        disabled={loading}
                        className="group relative px-10 py-6 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-[2rem] shadow-2xl transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="absolute inset-0 bg-white/20 rounded-[2rem] blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <span className="relative flex items-center gap-3 text-sm tracking-widest uppercase">
                            {loading ? (
                                <>
                                    <Sparkles className="animate-spin" size={20} />
                                    Calcul en cours...
                                </>
                            ) : (
                                <>
                                    <Brain size={20} />
                                    Activer l'Oracle
                                </>
                            )}
                        </span>
                    </button>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Narrative & Reasoning (Left) */}
                <div className="lg:col-span-7 space-y-8">
                    {narrative && (
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 animate-slide-up">
                            <div className="flex items-center gap-3 mb-8">
                                <FileText size={20} className="text-indigo-500" />
                                <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-[0.2em]">Rapport Stratégique</h4>
                            </div>
                            
                            <div className="space-y-6">
                                <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 relative">
                                    <Sparkles size={16} className="absolute top-6 left-6 text-amber-500" />
                                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed italic font-medium pl-8">
                                        "{narrative.summary}"
                                    </p>
                                </div>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="p-5 bg-emerald-50 dark:bg-emerald-900/10 rounded-3xl border border-emerald-100 dark:border-emerald-800/50">
                                        <div className="text-[10px] font-black text-emerald-600 uppercase mb-2 tracking-wider">Verdict Technique</div>
                                        <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">{narrative.technicalVerdict}</p>
                                    </div>
                                    <div className="p-5 bg-orange-50 dark:bg-orange-900/10 rounded-3xl border border-orange-100 dark:border-orange-800/50">
                                        <div className="text-[10px] font-black text-orange-600 uppercase mb-2 tracking-wider">Risque de Marché</div>
                                        <p className="text-xs font-bold text-orange-800 dark:text-orange-300">{narrative.riskAssessment}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {analysis && (
                        <div className="bg-slate-950 text-white p-8 rounded-[3rem] shadow-2xl border border-slate-800 relative overflow-hidden h-full max-h-[500px] flex flex-col">
                            <div className="absolute top-0 right-0 p-6 opacity-5"><Terminal size={80} /></div>
                            <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-6 flex items-center gap-2 font-mono border-b border-white/10 pb-4">
                                <span>&gt;_</span> Trace Logique IA
                            </h4>
                            <div className="font-mono text-xs text-slate-400 leading-relaxed flex-1 overflow-y-auto custom-scrollbar pr-2">
                                <SafeMarkdown text={analysis.logicalAnalysis} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Metrics & KPIs (Right) */}
                <div className="lg:col-span-5 space-y-6">
                    {analysis && (
                        <div className="bg-white dark:bg-slate-800 p-10 rounded-[3.5rem] shadow-xl border border-slate-100 dark:border-slate-700 flex flex-col items-center text-center relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors"></div>
                            
                            <h4 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mb-10">Niveau de Confiance</h4>
                            
                            <div className="relative w-48 h-48 mb-10">
                                <svg className="w-full h-full transform -rotate-90 drop-shadow-xl" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-slate-100 dark:text-slate-700" />
                                    <circle 
                                        cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" 
                                        strokeDasharray={263.8} strokeDashoffset={263.8 - ((isNaN(analysis.intuitionScore) ? 50 : analysis.intuitionScore) / 100) * 263.8} 
                                        strokeLinecap="round" className={`transition-all duration-1000 ${getScoreColor(analysis.intuitionScore)}`} 
                                    />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className={`text-5xl font-black tracking-tighter ${getScoreColor(analysis.intuitionScore).split(' ')[0]}`}>
                                        {isNaN(analysis.intuitionScore) ? '--' : analysis.intuitionScore}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase mt-1">% Fiabilité</span>
                                </div>
                            </div>

                            <div className="w-full space-y-6 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-700">
                                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-center gap-2">
                                    <Target size={14}/> Attracteurs Identifiés
                                </h5>
                                <div className="flex justify-center gap-3 flex-wrap">
                                    {analysis.suggestedFocus?.length > 0 ? analysis.suggestedFocus.map(n => <NumberBall key={n} number={n} size="md" />) : <span className="text-xs text-slate-400 italic">Aucune cible isolée</span>}
                                </div>
                            </div>
                        </div>
                    )}

                    {contextMetrics && (
                        <div className="bg-slate-900 p-8 rounded-[3rem] shadow-xl border border-slate-800 space-y-6">
                            <h4 className="text-white font-black text-sm uppercase tracking-widest flex items-center gap-3">
                                <Activity size={16} className="text-indigo-500"/> Métriques de Contexte
                            </h4>
                            
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase mb-2">
                                        <span>Entropie (Chaos)</span>
                                        <span className="text-indigo-400">{Math.round(contextMetrics.entropy * 100)}%</span>
                                    </div>
                                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500" style={{ width: `${contextMetrics.entropy * 100}%` }}></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase mb-2">
                                        <span>Hurst (Mémoire)</span>
                                        <span className="text-emerald-400">{contextMetrics.hurst.toFixed(2)}</span>
                                    </div>
                                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500" style={{ width: `${contextMetrics.hurst * 100}%` }}></div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-start gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                                <ShieldCheck size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                                    {contextMetrics.entropy > 0.9 
                                        ? "Entropie élevée : Le système est en régime aléatoire pur. Privilégiez les stratégies de couverture large." 
                                        : "Entropie basse : Structure détectée. Les patterns répétitifs sont favorisés."}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
