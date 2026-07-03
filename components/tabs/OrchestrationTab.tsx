
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getFullOrchestrationAnalysis, analyzeShortTermMimicry } from '../../services/orchestrationService';
import { useNexusStore } from '../../store/useNexusStore';
import type { OrchestrationMetrics, DrawResult, MimicryMetric, ScoreComposition, Prediction } from '../../types';
import { savePredictionToHistory } from '../../services/predictionHistoryService';
import { NumberBall } from '../NumberBall';
import { OrchestrationRadar } from '../OrchestrationRadar';
import { Activity, Layers, Zap, Target, Binary, Copy, Wand2, Save, Share2, Workflow, Network } from 'lucide-react';
import { saveTicket } from '../../services/userPreferencesService';
import { useToast } from '../ui/Toast';
import { TicketXRay } from '../TicketXRay';
import { audioEngine } from '../../utils/audioEngine';
import html2canvas from 'html2canvas';

interface OrchestrationTabProps { drawName: string; }

// --- COMPOSANT VECTOR FLOW CHART ---
// Visualise les liens physiques entre T-1 et les prédictions (T) via SVG
const VectorFlowChart: React.FC<{ prevDraw: number[], candidates: number[] }> = ({ prevDraw, candidates }) => {
    const [hoveredNode, setHoveredNode] = useState<{ id: number, type: 'src' | 'tgt' } | null>(null);
    const topCands = candidates.slice(0, 8); 

    // Calcul des liens vectoriels RÉELS entre le tirage précédent et les candidats proposés
    const links = useMemo(() => {
        const l: {src: number, tgt: number, type: string, color: string, strength: number}[] = [];
        prevDraw.forEach(src => {
            topCands.forEach(tgt => {
                let type = '';
                let color = '';
                let strength = 0;
                
                // Répétition
                if (src === tgt) { type = 'Inertie'; color = '#10b981'; strength = 3; } 
                // Voisinage
                else if (Math.abs(src - tgt) === 1) { type = 'Voisin'; color = '#3b82f6'; strength = 1.5; }
                // Miroir Loto (1 <-> 90)
                else if (src === 91 - tgt) { type = 'Miroir'; color = '#ec4899'; strength = 2; }
                // Inversion Chiffres (12 <-> 21)
                else if (src.toString().split('').reverse().join('') === tgt.toString() && src > 10) { type = 'Shadow'; color = '#f59e0b'; strength = 2; }
                
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
        <div className="bg-slate-950 text-white p-6 md:p-8 rounded-2xl shadow-2xl border border-slate-800 overflow-hidden relative min-h-[450px] flex flex-col justify-between group select-none">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,#4f46e5_0%,transparent_70%)] animate-pulse-slow"></div>
            <div className="absolute top-0 bottom-0 left-24 right-24 border-x border-dashed border-white/5"></div>
            
            <div className="flex justify-between items-stretch relative z-10 h-full gap-8">
                {/* SOURCE COLUMN (T-1) */}
                <div className="flex flex-col justify-around items-center w-24 py-4 relative z-20">
                    <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-slate-700 to-transparent"></div>
                    <div className="text-xs uppercase font-black text-slate-500 tracking-widest bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-700 mb-2 shadow-lg backdrop-blur-md">
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
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
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

                            const sY = ((sIdx + 0.5) / Math.max(1, prevDraw.length)) * 100;
                            const tY = ((tIdx + 0.5) / Math.max(1, topCands.length)) * 100;
                            
                            return (
                                <g key={i}>
                                    <path 
                                        d={`M 0 ${sY} C 40 ${sY}, 60 ${tY}, 100 ${tY}`} 
                                        fill="none" 
                                        stroke={link.color} 
                                        strokeWidth={isActive ? link.strength * 2 : 1} 
                                        strokeOpacity={isActive ? 0.8 : 0.1}
                                        strokeLinecap="round"
                                        vectorEffect="non-scaling-stroke"
                                        filter={isActive ? "url(#glow-line)" : ""}
                                        className="transition-all duration-500"
                                        strokeDasharray={isActive ? "4 8" : "none"}
                                        style={{
                                            animation: isActive ? "flowAnimation 1s linear infinite" : "none"
                                        }}
                                    />
                                </g>
                            );
                        })}
                    </svg>
                    
                    <style dangerouslySetInnerHTML={{__html: `
                        @keyframes flowAnimation {
                            from { stroke-dashoffset: 24; }
                            to { stroke-dashoffset: 0; }
                        }
                    `}} />
                    
                    {hoveredNode && links.map((link, i) => {
                         const isActive = isLinkActive(link.src, link.tgt);
                         if (!isActive) return null;
                         const sIdx = prevDraw.indexOf(link.src);
                         const tIdx = topCands.indexOf(link.tgt);
                         const topPos = ((sIdx + tIdx + 1) / (prevDraw.length + topCands.length)) * 100;
                         
                         return (
                            <div key={`lbl-${i}`} className="absolute left-1/2 -translate-x-1/2 transition-all duration-300 pointer-events-none z-30" style={{ top: `${topPos}%` }}>
                                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white shadow-xl" style={{ color: link.color }}>
                                    {link.type}
                                </span>
                            </div>
                         )
                    })}
                </div>

                {/* TARGET COLUMN (Predictions) */}
                <div className="flex flex-col justify-around items-center w-24 py-4 relative z-20">
                    <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-indigo-500 to-transparent"></div>
                    <div className="text-xs uppercase font-black text-indigo-400 tracking-widest bg-slate-900/90 px-3 py-1.5 rounded-lg border border-indigo-900/50 mb-2 shadow-lg backdrop-blur-md">
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
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl h-full flex flex-col">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-3">
                <Copy size={16} className="text-amber-500"/> Mimétisme Séquentiel
            </h4>
            
            {mimicry.length === 0 ? (
                <div className="text-center text-xs text-slate-400 italic py-6 my-auto">
                    Aucun pattern de répétition immédiate détecté sur T, T-1, T-2.
                </div>
            ) : (
                <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar max-h-[300px] pr-2">
                    {mimicry.slice(0, 5).map((m, _i) => (
                        <div key={m.number} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-slate-800 hover:border-amber-500/30 transition-colors">
                            <div className="flex items-center gap-3">
                                <NumberBall number={m.number} size="sm" />
                                <div>
                                    <div className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase">{m.type}</div>
                                    <div className="text-xs font-mono text-slate-400">Source: {m.sourceDraw}</div>
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
    const history = useNexusStore(state => state.history);
    const nexusLoading = useNexusStore(state => state.loading);
    const globalWeights = useNexusStore(state => state.globalWeights);
    const temporalDepth = useNexusStore(state => state.temporalDepth);
    const { showToast } = useToast();
    
    const [metrics, setMetrics] = useState<(OrchestrationMetrics & { candidatesDetails?: Record<number, ScoreComposition> }) | null>(null);
    const [prevDraw, setPrevDraw] = useState<DrawResult | null>(null);
    const [mimicryData, setMimicryData] = useState<MimicryMetric[]>([]);
    const [loading, setLoading] = useState(true);
    const [generatedTicket, setGeneratedTicket] = useState<number[] | null>(null);
    const [currentPrediction, setCurrentPrediction] = useState<import('../../types').Prediction | null>(null);
    
    const [isGenerating, setIsGenerating] = useState(false);
    
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        const load = async () => {
            setLoading(true);
            try {
                if (history.length > 2 && isMounted.current) {
                    const validHistory = history.filter(d => d && Array.isArray(d.gagnants) && d.gagnants.length > 0);
                    if (validHistory.length < 3) {
                        setLoading(false);
                        return;
                    }
                    const [res, mim] = await Promise.all([
                        getFullOrchestrationAnalysis(drawName, validHistory, globalWeights), // Passage des poids ADN
                        Promise.resolve(analyzeShortTermMimicry(validHistory))
                    ]);
                    
                    if (isMounted.current) {
                        setMetrics(res);
                        setMimicryData(mim);
                        setPrevDraw(validHistory[0]); 
                    }
                }
            } catch (e) { console.error(e); } 
            finally { if (isMounted.current) setLoading(false); }
        };
        load();
        return () => { isMounted.current = false; };
    }, [drawName, history, globalWeights]); // Recalcul si les poids changent

    const handleGenerateTicket = async () => {
        audioEngine.play('click');
        if (!metrics || metrics.topCandidates.length < 5) return;
        
        setIsGenerating(true);
        setGeneratedTicket(null);
        setCurrentPrediction(null);
        
        try {
            const { generateMasterPrediction } = await import('../../services/prediction/predictionFacade');
            const prediction = await generateMasterPrediction(drawName, history, temporalDepth, globalWeights);
            
            setGeneratedTicket(prediction.suggestedNumbers);
            setCurrentPrediction(prediction);
            audioEngine.play('success');
            showToast("Synthèse Harmonique terminée.", "success");
        } catch (e) {
            console.error(e);
            showToast("Erreur lors de la génération.", "error");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSaveTicket = async () => {
        audioEngine.play('click');
        if(!generatedTicket) return;
        await saveTicket({
            numbers: generatedTicket,
            drawName,
            strategy: 'Orchestration Elite'
        });

        const breakdown: Record<number, Record<string, number>> = {};
        generatedTicket.forEach(num => {
            const candidate = metrics?.topCandidates.find(c => c.number === num);
            breakdown[num] = {
                orchestration: candidate ? candidate.score : 50,
                fractal: 0,
                spectral: 0,
                momentum: 0
            };
        });

        const predictionObj: Prediction = {
            suggestedNumbers: generatedTicket,
            candidates: generatedTicket,
            confidence: 85, // Arbitrary high confidence for Orchestration
            analysis: "Orchestration Elite Synthesis",
            breakdown: breakdown,
            timestamp: Date.now()
        };
        await savePredictionToHistory(drawName, predictionObj);

        audioEngine.play('success');
        showToast("Ticket sauvegardé et autopsié.", "success");
    };

    const handleExportTicket = async () => {
        audioEngine.play('click');
        const ticketElement = document.getElementById('generated-ticket-view');
        if (!ticketElement) return;
        
        try {
            const canvas = await html2canvas(ticketElement, {
                backgroundColor: '#020617', // nexus-950
                scale: 2,
                logging: false
            });
            
            const image = canvas.toDataURL("image/png");
            const link = document.createElement('a');
            link.href = image;
            link.download = `NexusPro_Ticket_${drawName}_${new Date().toISOString().split('T')[0]}.png`;
            link.click();
            
            showToast("Ticket exporté avec succès !", "success");
            audioEngine.play('success');
        } catch (e) {
            console.error("Export error:", e);
            showToast("Erreur lors de l'export.", "error");
            audioEngine.play('error');
        }
    };

    if (nexusLoading || loading) return (
        <div className="flex flex-col items-center justify-center p-24 gap-6 animate-pulse">
            <Layers className="text-indigo-500 animate-bounce" size={48} />
            <p className="font-black text-indigo-500 uppercase tracking-[0.4em] text-xs">Triangulation Vectorielle (ADN Actif)...</p>
        </div>
    );
    
    if (!metrics) return <div className="p-20 text-center text-slate-400 italic">Historique insuffisant pour l'orchestration.</div>;

    return (
        <div className="space-y-10 animate-fade-in pb-20 w-full overflow-hidden">
            {/* HERO CARD */}
            <div className="bg-slate-900 p-8 md:p-8 rounded-3xl shadow-2xl border border-indigo-500/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] group-hover:scale-125 transition-transform duration-500 -mr-20 -mt-20"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
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
                    
                    <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl text-center min-w-[220px]">
                        <div className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-2">Couverture Backtest</div>
                        <div className="text-6xl font-black text-white">{metrics.backtestAccuracy}%</div>
                        <div className="text-xs font-bold text-slate-500 mt-2">Précision estimée sur 5 tirages</div>
                    </div>
                </div>
            </div>

            {/* FLOW CHART & ANALYSIS */}
            <div className="grid lg:grid-cols-12 gap-8">
                {prevDraw && (
                    <div className="lg:col-span-8 space-y-6">
                        <div className="bg-white dark:bg-slate-800 p-2 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 relative overflow-hidden">
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
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg">
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
            <div className="bg-white dark:bg-slate-800 p-8 md:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
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
                                className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl hover:border-indigo-400 transition-all group relative overflow-hidden"
                            >
                                <div className="absolute top-4 right-4 text-[10px] font-black text-slate-300">#{idx+1}</div>
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
                                    <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400">
                                        <span>ADN</span>
                                        <span>{cand.score}pts</span>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    {pMarkov > 30 && <div className="text-[10px] font-bold text-indigo-500 flex items-center gap-1"><Workflow size={8}/> Markovien</div>}
                                    {pStruct > 30 && <div className="text-[10px] font-bold text-emerald-500 flex items-center gap-1"><Layers size={8}/> Symétrie</div>}
                                    {pMachine > 20 && <div className="text-[10px] font-bold text-amber-500 flex items-center gap-1"><Binary size={8}/> Machine</div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* SYNTHESIS & GENERATOR */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-950 p-8 md:p-6 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6">
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
                        disabled={isGenerating}
                        className={`w-full lg:w-auto px-4 md:px-10 py-4 md:py-5 rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-[0.1em] md:tracking-[0.2em] shadow-xl flex justify-center items-center gap-2 md:gap-3 transition-all active:scale-95 group ${isGenerating ? 'bg-slate-800 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/50'}`}
                    >
                        {isGenerating ? (
                            <><Layers size={18} className="animate-spin" /> Analyse en cours...</>
                        ) : (
                            <><Wand2 size={18} className="group-hover:rotate-12 transition-transform"/> Générer Le Ticket</>
                        )}
                    </button>
                </div>

                {isGenerating && (
                    <div className="mt-10 pt-10 border-t border-white/10 flex flex-col items-center justify-center gap-6 animate-pulse">
                        <div className="flex gap-4">
                            {[1,2,3,4,5].map(i => (
                                <div key={i} className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }}></div>
                            ))}
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Alignement des vecteurs...</p>
                    </div>
                )}

                {generatedTicket && !isGenerating && (
                    <div className="mt-10 pt-10 border-t border-white/10 animate-slide-up">
                        <div id="generated-ticket-view" className="bg-white/5 rounded-3xl p-6 border border-emerald-500/30 flex flex-col items-center gap-8">
                            <div className="flex gap-4 scale-110 md:scale-125">
                                {generatedTicket.map((n, _i) => (
                                    <NumberBall key={n} number={n} size="md" isAttractor />
                                ))}
                            </div>
                            
                            <div className="flex gap-4" data-html2canvas-ignore>
                                <button 
                                    onClick={handleSaveTicket}
                                    className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all"
                                >
                                    <Save size={14}/> Sauvegarder
                                </button>
                                <button 
                                    onClick={handleExportTicket}
                                    className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all border border-slate-700"
                                >
                                    <Share2 size={14}/> Exporter Image
                                </button>
                            </div>
                            
                            <div className="w-full max-w-2xl">
                                <TicketXRay numbers={generatedTicket} score={metrics.globalScore} showTitle={false} />
                            </div>

                            {/* XAP Floor for Orchestra */}
                            {currentPrediction?.xapExp && currentPrediction.xapExp.length > 0 && (
                                <div className="w-full mt-6 bg-slate-900/50 rounded-2xl p-6 border border-slate-800 backdrop-blur-xl">
                                    <h4 className="text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase mb-6 flex items-center justify-center gap-2">
                                        <Network size={14} className="text-indigo-400" /> Attribution XAP (Orchestra)
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                        {currentPrediction.xapExp.map((xap) => (
                                            <div key={xap.number} className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/50 flex flex-col items-center text-center">
                                                <div className="w-8 h-8 rounded-full bg-slate-950 flex items-center justify-center text-slate-300 font-bold mb-2 shadow-inner border border-white/5">
                                                    {xap.number}
                                                </div>
                                                <span className="text-[9px] uppercase font-bold text-indigo-400 mb-1 leading-tight line-clamp-1" title={xap.dominantAlgo}>
                                                    {xap.dominantAlgo}
                                                </span>
                                                <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden mb-1 mt-1">
                                                    <div 
                                                        className="bg-indigo-500 h-full rounded-full" 
                                                        style={{ width: `${xap.contributionPercentage}%` }}
                                                    />
                                                </div>
                                                <span className="text-[8px] font-mono text-slate-500">
                                                    {xap.contributionPercentage.toFixed(1)}% force
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
