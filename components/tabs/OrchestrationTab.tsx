
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getFullOrchestrationAnalysis, analyzeShortTermMimicry } from '../../services/orchestrationService';
import { useNexus } from '../NexusProvider';
import type { OrchestrationMetrics, DrawResult, MimicryMetric, ScoreComposition } from '../../types';
import { NumberBall } from '../NumberBall';
import { OrchestrationRadar } from '../OrchestrationRadar';
import { Activity, Layers, Zap, Target, Binary, Copy, Wand2, Save, ArrowRight, Share2, Workflow, GitMerge, GitBranch } from 'lucide-react';
import { saveTicket } from '../../services/userPreferencesService';
import { useToast } from '../ui/Toast';
import { TicketXRay } from '../TicketXRay';
import { motion, AnimatePresence } from 'framer-motion';

interface OrchestrationTabProps { drawName: string; }

// --- COMPOSANT VECTOR FLOW CHART ---
// Visualise les liens physiques entre T-1 et les prédictions (T) via SVG
const VectorFlowChart: React.FC<{ prevDraw: number[], candidates: number[] }> = ({ prevDraw, candidates }) => {
    const [hoveredNode, setHoveredNode] = useState<{ id: number, type: 'src' | 'tgt' } | null>(null);
    const topCands = candidates.slice(0, 8); // On montre 8 candidats

    // Calcul des liens vectoriels RÉELS entre le tirage précédent et les candidats proposés
    const links = useMemo(() => {
        const l: {src: number, tgt: number, type: string, color: string, strength: number}[] = [];
        prevDraw.forEach(src => {
            topCands.forEach(tgt => {
                let type = '';
                let color = '';
                let strength = 0;
                
                // Répétition
                if (src === tgt) { type = 'Inertie'; color = '#10b981'; strength = 3; } // Emerald
                // Voisinage
                else if (Math.abs(src - tgt) === 1) { type = 'Voisin'; color = '#3b82f6'; strength = 1.5; } // Blue
                // Miroir Loto (1 <-> 90)
                else if (src === 91 - tgt) { type = 'Miroir'; color = '#ec4899'; strength = 2; } // Pink
                // Inversion Chiffres (12 <-> 21)
                else if (src.toString().split('').reverse().join('') === tgt.toString() && src > 10) { type = 'Shadow'; color = '#f59e0b'; strength = 2; } // Amber
                
                if (type) l.push({ src, tgt, type, color, strength });
            });
        });
        return l;
    }, [prevDraw, topCands]);

    const isLinkActive = (src: number, tgt: number) => {
        if (!hoveredNode) return true;
        if (hoveredNode.type === 'src' && hoveredNode.id === src) return true;
        if (hoveredNode.type === 'tgt' && hoveredNode.id === tgt) return true;
        return false;
    };

    return (
        <div className="bg-slate-950 text-white p-6 md:p-8 rounded-[2.5rem] shadow-2xl border border-slate-800 overflow-hidden relative min-h-[450px] flex flex-col justify-between group select-none">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,#4f46e5_0%,transparent_70%)] animate-pulse-slow"></div>
            <div className="absolute top-0 bottom-0 left-24 right-24 border-x border-dashed border-white/5"></div>
            
            <div className="flex justify-between items-stretch relative z-10 h-full gap-12">
                {/* SOURCE COLUMN (T-1) */}
                <div className="flex flex-col justify-around items-center w-24 py-4 relative z-20">
                    <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-slate-700 to-transparent"></div>
                    <div className="text-[9px] uppercase font-black text-slate-500 tracking-widest bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-700 mb-2 shadow-lg backdrop-blur-md">
                        T-1 (Source)
                    </div>
                    {prevDraw.map(n => {
                        const isActive = hoveredNode ? (hoveredNode.type === 'src' && hoveredNode.id === n) || links.some(l => l.src === n && l.tgt === (hoveredNode.type === 'tgt' ? hoveredNode.id : -1)) : true;
                        return (
                            <div 
                                key={`src-${n}`} 
                                className={`transition-all duration-300 transform ${isActive ? 'scale-110 opacity-100' : 'scale-90 opacity-20 blur-[1px]'}`}
                                onMouseEnter={() => setHoveredNode({ id: n, type: 'src' })}
                                onMouseLeave={() => setHoveredNode(null)}
                            >
                                <NumberBall number={n} size="md" />
                            </div>
                        );
                    })}
                </div>
                
                {/* SVG CONNECTIONS LAYER */}
                <div className="flex-1 relative">
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                        <defs>
                            <filter id="glow-line">
                                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                                <feMerge>
                                    <feMergeNode in="coloredBlur"/>
                                    <feMergeNode in="SourceGraphic"/>
                                </feMerge>
                            </filter>
                        </defs>
                        {links.map((link, i) => {
                            const sIdx = prevDraw.indexOf(link.src);
                            const tIdx = topCands.indexOf(link.tgt);
                            if (sIdx === -1 || tIdx === -1) return null;
                            
                            const isActive = isLinkActive(link.src, link.tgt);
                            if (!isActive && hoveredNode) return null;

                            const sY = `${((sIdx + 0.5) / prevDraw.length) * 100}%`;
                            const tY = `${((tIdx + 0.5) / topCands.length) * 100}%`;
                            
                            return (
                                <g key={i}>
                                    <path 
                                        d={`M 0 ${sY} C 40% ${sY}, 60% ${tY}, 100% ${tY}`} 
                                        fill="none" 
                                        stroke={link.color} 
                                        strokeWidth={isActive ? link.strength * 2 : 1} 
                                        strokeOpacity={isActive ? 0.8 : 0.1}
                                        strokeLinecap="round"
                                        filter={isActive ? "url(#glow-line)" : ""}
                                        className="transition-all duration-500"
                                    />
                                </g>
                            );
                        })}
                    </svg>
                    
                    {hoveredNode && links.map((link, i) => {
                         const isActive = isLinkActive(link.src, link.tgt);
                         if (!isActive) return null;
                         const sIdx = prevDraw.indexOf(link.src);
                         const tIdx = topCands.indexOf(link.tgt);
                         const topPos = ((sIdx + tIdx + 1) / (prevDraw.length + topCands.length)) * 100;
                         
                         return (
                            <div key={`lbl-${i}`} className="absolute left-1/2 -translate-x-1/2 transition-all duration-300 pointer-events-none z-30" style={{ top: `${topPos}%` }}>
                                <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white shadow-xl" style={{ color: link.color }}>
                                    {link.type}
                                </span>
                            </div>
                         )
                    })}
                </div>

                {/* TARGET COLUMN (Predictions) */}
                <div className="flex flex-col justify-around items-center w-24 py-4 relative z-20">
                    <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-indigo-500 to-transparent"></div>
                    <div className="text-[9px] uppercase font-black text-indigo-400 tracking-widest bg-slate-900/90 px-3 py-1.5 rounded-lg border border-indigo-900/50 mb-2 shadow-lg backdrop-blur-md">
                        IA (Cibles)
                    </div>
                    {topCands.map(n => {
                        const isActive = hoveredNode ? (hoveredNode.type === 'tgt' && hoveredNode.id === n) || links.some(l => l.tgt === n && l.src === (hoveredNode.type === 'src' ? hoveredNode.id : -1)) : true;
                        return (
                            <div 
                                key={`tgt-${n}`} 
                                className={`cursor-pointer transition-all duration-300 transform ${isActive ? 'scale-125 opacity-100 z-10 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'scale-90 opacity-20 blur-[1px]'}`} 
                                onMouseEnter={() => setHoveredNode({ id: n, type: 'tgt' })} 
                                onMouseLeave={() => setHoveredNode(null)}
                            >
                                <NumberBall number={n} size="md" selected={hoveredNode?.id === n && hoveredNode?.type === 'tgt'} />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const MimicryCard: React.FC<{ mimicry: MimicryMetric[] }> = ({ mimicry }) => {
    return (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-xl h-full flex flex-col">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-3">
                <Copy size={16} className="text-amber-500"/> Mimétisme Séquentiel
            </h4>
            
            {mimicry.length === 0 ? (
                <div className="text-center text-xs text-slate-400 italic py-6 my-auto">
                    Aucun pattern de répétition immédiate détecté sur T, T-1, T-2.
                </div>
            ) : (
                <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar max-h-[300px] pr-2">
                    {mimicry.slice(0, 5).map((m, i) => (
                        <div key={m.number} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-slate-800 hover:border-amber-500/30 transition-colors">
                            <div className="flex items-center gap-3">
                                <NumberBall number={m.number} size="sm" />
                                <div>
                                    <div className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase">{m.type}</div>
                                    <div className="text-[9px] font-mono text-slate-400">Source: {m.sourceDraw}</div>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className={`text-sm font-black ${m.score >= 50 ? 'text-emerald-500' : 'text-indigo-500'}`}>{m.score}pts</span>
                                <div className="h-1 w-12 bg-slate-200 dark:bg-slate-700 rounded-full mt-1 overflow-hidden">
                                    <div className={`h-full rounded-full ${m.score >= 50 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, m.score)}%` }}></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export const OrchestrationTab: React.FC<OrchestrationTabProps> = ({ drawName }) => {
    const { history, loading: nexusLoading } = useNexus();
    const { showToast } = useToast();
    
    const [metrics, setMetrics] = useState<(OrchestrationMetrics & { candidatesDetails?: Record<number, ScoreComposition> }) | null>(null);
    const [prevDraw, setPrevDraw] = useState<DrawResult | null>(null);
    const [mimicryData, setMimicryData] = useState<MimicryMetric[]>([]);
    const [loading, setLoading] = useState(true);
    const [generatedTicket, setGeneratedTicket] = useState<number[] | null>(null);
    
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        const load = async () => {
            setLoading(true);
            try {
                if (history.length > 2 && isMounted.current) {
                    const [res, mim] = await Promise.all([
                        getFullOrchestrationAnalysis(drawName, history),
                        Promise.resolve(analyzeShortTermMimicry(history))
                    ]);
                    
                    if (isMounted.current) {
                        setMetrics(res);
                        setMimicryData(mim);
                        setPrevDraw(history[0]); 
                    }
                }
            } catch (e) { console.error(e); } 
            finally { if (isMounted.current) setLoading(false); }
        };
        load();
        return () => { isMounted.current = false; };
    }, [drawName, history]);

    const handleGenerateTicket = () => {
        if (!metrics || metrics.topCandidates.length < 5) return;
        
        // Algorithme de synthèse intelligente : Coeur solide + Dispersion
        // 1. Cœur : Les 3 meilleurs vecteurs
        const core = metrics.topCandidates.slice(0, 3).map(c => c.number);
        // 2. Dispersion : 2 numéros piochés dans le top 10 (hors top 3) pour la variance
        const fillers = metrics.topCandidates.slice(3, 10).map(c => c.number);
        
        const shuffledFillers = fillers.sort(() => 0.5 - Math.random());
        const finalTicket = [...core, ...shuffledFillers.slice(0, 2)].sort((a,b) => a-b);
        
        setGeneratedTicket(finalTicket);
        showToast("Synthèse Harmonique terminée.", "success");
    };

    const handleSaveTicket = async () => {
        if(!generatedTicket) return;
        await saveTicket({
            numbers: generatedTicket,
            drawName,
            strategy: 'Orchestration Elite'
        });
        showToast("Ticket sauvegardé.", "success");
    };

    if (nexusLoading || loading) return (
        <div className="flex flex-col items-center justify-center p-24 gap-6 animate-pulse">
            <Layers className="text-indigo-500 animate-bounce" size={48} />
            <p className="font-black text-indigo-500 uppercase tracking-[0.4em] text-xs">Triangulation Vectorielle...</p>
        </div>
    );
    
    if (!metrics) return <div className="p-20 text-center text-slate-400 italic">Historique insuffisant pour l'orchestration.</div>;

    return (
        <div className="space-y-10 animate-fade-in pb-20 w-full overflow-hidden">
            {/* HERO CARD */}
            <div className="bg-slate-900 p-8 md:p-12 rounded-[3.5rem] shadow-2xl border border-indigo-500/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] group-hover:scale-125 transition-transform duration-1000 -mr-20 -mt-20"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-10">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg"><Share2 size={20} className="text-white"/></div>
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">Interconnexion Temporelle</span>
                        </div>
                        <h3 className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-none">
                            Orchestration <span className="text-indigo-500">Flux</span>
                        </h3>
                        <p className="text-slate-400 text-sm mt-4 max-w-xl font-medium leading-relaxed border-l-2 border-indigo-500/30 pl-4">
                            {metrics.narrativeLesson}
                        </p>
                    </div>
                    
                    <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl text-center min-w-[220px]">
                        <div className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-2">Couverture Backtest</div>
                        <div className="text-6xl font-black text-white">{metrics.backtestAccuracy}%</div>
                        <div className="text-[9px] font-bold text-slate-500 mt-2">Précision estimée sur 10 tirages</div>
                    </div>
                </div>
            </div>

            {/* FLOW CHART & ANALYSIS */}
            <div className="grid lg:grid-cols-12 gap-8">
                {prevDraw && (
                    <div className="lg:col-span-8 space-y-6">
                        <div className="bg-white dark:bg-slate-800 p-2 rounded-[3.5rem] shadow-xl border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                            <div className="px-8 pt-6 pb-2 flex items-center gap-3 relative z-10">
                                <Zap size={18} className="text-indigo-600"/>
                                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Flux d'Influence Directe (T-1 ➜ IA)</h4>
                            </div>
                            <VectorFlowChart prevDraw={prevDraw.gagnants} candidates={metrics.topCandidates.map(c => c.number)} />
                        </div>
                    </div>
                )}
                
                <div className="lg:col-span-4 flex flex-col gap-8">
                    <div className="flex-1">
                        <MimicryCard mimicry={mimicryData} />
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-lg">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-3">
                            <Activity size={16} className="text-rose-500"/> Radar Menaces
                        </h4>
                        <div className="h-48">
                            <OrchestrationRadar drawName={drawName} />
                        </div>
                    </div>
                </div>
            </div>

            {/* CANDIDATES GRID WITH DNA BREAKDOWN */}
            <div className="bg-white dark:bg-slate-800 p-8 md:p-12 rounded-[4rem] shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="flex items-center gap-4 mb-10 border-b border-slate-100 dark:border-slate-700 pb-6">
                    <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-2xl">
                        <Target size={24} />
                    </div>
                    <div>
                        <h4 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Vecteurs de Convergence</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Décomposition ADN du Signal</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
                    {metrics.topCandidates.slice(0, 10).map((cand, idx) => {
                        const details = metrics.candidatesDetails?.[cand.number] || { markov: 0, structural: 0, machine: 0, trend: 0 };
                        // Calcul d'un total local pour les pourcentages relatifs
                        const localTotal = (details.markov + details.structural + details.machine + details.trend) || 1;
                        
                        // Normalisation pour la barre visuelle
                        const pMarkov = (details.markov / localTotal) * 100;
                        const pStruct = (details.structural / localTotal) * 100;
                        const pMachine = (details.machine / localTotal) * 100;
                        const pTrend = (details.trend / localTotal) * 100;

                        return (
                            <div 
                                key={cand.number} 
                                className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 p-5 rounded-[2.5rem] hover:border-indigo-400 transition-all group relative overflow-hidden"
                            >
                                <div className="absolute top-4 right-4 text-[8px] font-black text-slate-300">#{idx+1}</div>
                                <div className="flex justify-center mb-4">
                                    <NumberBall number={cand.number} size="md" isAttractor={idx < 3} />
                                </div>
                                
                                <div className="space-y-1.5 mb-3">
                                    <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
                                        <div style={{ width: `${pMarkov}%` }} className="bg-indigo-500" title="Markov"></div>
                                        <div style={{ width: `${pStruct}%` }} className="bg-emerald-500" title="Structure"></div>
                                        <div style={{ width: `${pMachine}%` }} className="bg-amber-500" title="Machine"></div>
                                        <div style={{ width: `${pTrend}%` }} className="bg-rose-500" title="Tendance"></div>
                                    </div>
                                    <div className="flex justify-between text-[8px] font-bold uppercase text-slate-400">
                                        <span>ADN</span>
                                        <span>{cand.score}pts</span>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    {pMarkov > 30 && <div className="text-[8px] font-bold text-indigo-500 flex items-center gap-1"><Workflow size={8}/> Markovien</div>}
                                    {pStruct > 30 && <div className="text-[8px] font-bold text-emerald-500 flex items-center gap-1"><Layers size={8}/> Symétrie</div>}
                                    {pMachine > 20 && <div className="text-[8px] font-bold text-amber-500 flex items-center gap-1"><Binary size={8}/> Machine</div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* SYNTHESIS & GENERATOR */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-950 p-8 md:p-10 rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-10">
                    <div className="max-w-md">
                        <h4 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3 mb-2">
                            <Wand2 className="text-emerald-500"/> Synthèse Harmonique
                        </h4>
                        <p className="text-slate-400 text-xs font-medium leading-relaxed">
                            Générez un ticket optimisé qui respecte à la fois les scores d'orchestration et les règles de cohérence géométrique (AC, Spread).
                        </p>
                    </div>
                    
                    <button 
                        onClick={handleGenerateTicket}
                        className="px-10 py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-emerald-900/50 flex items-center gap-3 transition-all active:scale-95 group"
                    >
                        <Wand2 size={18} className="group-hover:rotate-12 transition-transform"/> Générer Le Ticket
                    </button>
                </div>

                {generatedTicket && (
                    <div className="mt-10 pt-10 border-t border-white/10 animate-slide-up">
                        <div className="bg-white/5 rounded-3xl p-6 border border-emerald-500/30 flex flex-col items-center gap-8">
                            <div className="flex gap-4 scale-110 md:scale-125">
                                {generatedTicket.map((n, i) => (
                                    <NumberBall key={n} number={n} size="md" isAttractor />
                                ))}
                            </div>
                            
                            <div className="flex gap-4">
                                <button 
                                    onClick={handleSaveTicket}
                                    className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all"
                                >
                                    <Save size={14}/> Sauvegarder
                                </button>
                            </div>
                            
                            <div className="w-full max-w-2xl">
                                <TicketXRay numbers={generatedTicket} score={metrics.globalScore} showTitle={false} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};