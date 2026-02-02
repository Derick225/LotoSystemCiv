
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getFullOrchestrationAnalysis, analyzeShortTermMimicry } from '../../services/orchestrationService';
import { useNexus } from '../NexusProvider';
import type { OrchestrationMetrics, DrawResult, MimicryMetric } from '../../types';
import { NumberBall } from '../NumberBall';
import { OrchestrationRadar } from '../OrchestrationRadar';
import { Activity, Layers, Zap, Target, Binary, ChevronDown, CheckCircle2, Copy, Wand2, Save, ArrowRight, Share2 } from 'lucide-react';
import { saveTicket } from '../../services/userPreferencesService';
import { useToast } from '../ui/Toast';
import { TicketXRay } from '../TicketXRay';

interface OrchestrationTabProps { drawName: string; }

// --- COMPOSANT VECTOR FLOW CHART (ANIMÉ & INTERACTIF) ---
const VectorFlowChart: React.FC<{ prevDraw: number[], candidates: number[] }> = ({ prevDraw, candidates }) => {
    const [hoveredNode, setHoveredNode] = useState<{ id: number, type: 'src' | 'tgt' } | null>(null);

    const topCands = candidates.slice(0, 5);

    // Pré-calcul des liens pour performance
    const links = useMemo(() => {
        const l: {src: number, tgt: number, type: string, color: string}[] = [];
        prevDraw.forEach(src => {
            topCands.forEach(tgt => {
                let type = '';
                let color = '';
                
                if (src === tgt) { type = 'Répétition'; color = '#10b981'; } // Vert
                else if (Math.abs(src - tgt) === 1) { type = 'Voisin'; color = '#3b82f6'; } // Bleu
                else if (src === 91 - tgt) { type = 'Miroir'; color = '#ec4899'; } // Rose
                else if (Math.abs(src - tgt) === 10) { type = 'Dizaine'; color = '#f59e0b'; } // Orange (Nouveau)
                
                if (type) l.push({ src, tgt, type, color });
            });
        });
        return l;
    }, [prevDraw, topCands]);

    const isLinkActive = (src: number, tgt: number) => {
        if (!hoveredNode) return true; // Tout montrer par défaut
        if (hoveredNode.type === 'src' && hoveredNode.id === src) return true;
        if (hoveredNode.type === 'tgt' && hoveredNode.id === tgt) return true;
        return false;
    };

    return (
        <div className="bg-slate-950 text-white p-6 md:p-8 rounded-[3rem] shadow-2xl border border-slate-800 overflow-hidden relative min-h-[450px] flex flex-col justify-between group select-none">
            {/* Background Grid animée */}
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,#4f46e5_0%,transparent_70%)] animate-pulse-slow"></div>
            <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
            
            <div className="flex justify-between items-stretch relative z-10 h-full">
                {/* SOURCE COLUMN (T-1) */}
                <div className="flex flex-col justify-around items-center w-24 py-4">
                    <div className="text-[9px] uppercase font-black text-slate-500 tracking-widest bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-700 mb-2">Source (T-1)</div>
                    {prevDraw.map(n => {
                        const isActive = hoveredNode ? (hoveredNode.type === 'src' && hoveredNode.id === n) || links.some(l => l.src === n && l.tgt === (hoveredNode.type === 'tgt' ? hoveredNode.id : -1)) : true;
                        return (
                            <div 
                                key={`src-${n}`} 
                                className={`transition-all duration-300 transform ${isActive ? 'scale-110 opacity-100' : 'scale-90 opacity-20 blur-[1px]'}`}
                                onMouseEnter={() => setHoveredNode({ id: n, type: 'src' })}
                                onMouseLeave={() => setHoveredNode(null)}
                            >
                                <NumberBall number={n} size="sm" />
                            </div>
                        );
                    })}
                </div>
                
                {/* SVG CONNECTIONS LAYER */}
                <div className="flex-1 relative">
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                        <defs>
                            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="currentColor" stopOpacity="0.1" />
                                <stop offset="50%" stopColor="currentColor" stopOpacity="1" />
                                <stop offset="100%" stopColor="currentColor" stopOpacity="0.1" />
                            </linearGradient>
                        </defs>
                        {links.map((link, i) => {
                            const sIdx = prevDraw.indexOf(link.src);
                            const tIdx = topCands.indexOf(link.tgt);
                            if (sIdx === -1 || tIdx === -1) return null;
                            
                            const isActive = isLinkActive(link.src, link.tgt);
                            if (!isActive && hoveredNode) return null; // Hide non-active links when hovering

                            // Calcul dynamique des positions Y (basé sur flex-around)
                            // Approx: (index + 0.5) / count * 100%
                            const sY = `${((sIdx + 0.5) / prevDraw.length) * 100}%`;
                            const tY = `${((tIdx + 0.5) / topCands.length) * 100}%`;
                            
                            return (
                                <g key={i}>
                                    <path 
                                        d={`M 0 ${sY} C 50% ${sY}, 50% ${tY}, 100% ${tY}`} 
                                        fill="none" 
                                        stroke={link.color} 
                                        strokeWidth={isActive ? 3 : 1} 
                                        strokeOpacity={isActive ? 0.8 : 0.2}
                                        strokeDasharray={isActive ? "none" : "4 4"}
                                        className="transition-all duration-500"
                                    >
                                        {isActive && (
                                            <animate attributeName="stroke-dashoffset" from="100" to="0" dur="1.5s" repeatCount="indefinite" />
                                        )}
                                    </path>
                                    {/* Label au milieu de la courbe si actif */}
                                    {isActive && hoveredNode && (
                                        <text x="50%" y={`${((sIdx + tIdx + 1) / (prevDraw.length + topCands.length)) * 100 + 20}%`} fill={link.color} fontSize="10" fontWeight="bold" textAnchor="middle" dy="-5">
                                            {link.type}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                </div>

                {/* TARGET COLUMN (Predictions) */}
                <div className="flex flex-col justify-around items-center w-24 py-4">
                    <div className="text-[9px] uppercase font-black text-slate-500 tracking-widest bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-700 mb-2">Cibles (IA)</div>
                    {topCands.map(n => {
                        const isActive = hoveredNode ? (hoveredNode.type === 'tgt' && hoveredNode.id === n) || links.some(l => l.tgt === n && l.src === (hoveredNode.type === 'src' ? hoveredNode.id : -1)) : true;
                        return (
                            <div 
                                key={`tgt-${n}`} 
                                className={`cursor-pointer transition-all duration-300 transform ${isActive ? 'scale-125 opacity-100 z-10' : 'scale-90 opacity-20 blur-[1px]'}`} 
                                onMouseEnter={() => setHoveredNode({ id: n, type: 'tgt' })} 
                                onMouseLeave={() => setHoveredNode(null)}
                            >
                                <NumberBall number={n} size="md" selected={hoveredNode?.id === n && hoveredNode?.type === 'tgt'} />
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* LEGEND */}
            <div className="mt-4 flex flex-wrap gap-3 justify-center items-center">
                {[
                    { label: 'Répétition', color: '#10b981' },
                    { label: 'Voisin', color: '#3b82f6' },
                    { label: 'Miroir', color: '#ec4899' },
                    { label: 'Dizaine', color: '#f59e0b' }
                ].map((l, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-slate-900 rounded-md border border-slate-800">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }}></div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase">{l.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- COMPOSANT MIMICRY CARD ---
const MimicryCard: React.FC<{ mimicry: MimicryMetric[] }> = ({ mimicry }) => {
    return (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl h-full flex flex-col">
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
    
    const [metrics, setMetrics] = useState<OrchestrationMetrics | null>(null);
    const [prevDraw, setPrevDraw] = useState<DrawResult | null>(null);
    const [mimicryData, setMimicryData] = useState<MimicryMetric[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedCard, setExpandedCard] = useState<number | null>(null);
    const [generatedTicket, setGeneratedTicket] = useState<number[] | null>(null);
    
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        const load = async () => {
            setLoading(true);
            try {
                if (history.length > 2 && isMounted.current) {
                    // Calcul parallèle
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
            } catch (e) { 
                console.error(e);
            } finally { 
                if (isMounted.current) setLoading(false); 
            }
        };
        load();
        return () => { isMounted.current = false; };
    }, [drawName, history]);

    const handleGenerateTicket = () => {
        if (!metrics || metrics.topCandidates.length < 5) return;
        // Sélection intelligente : Top 3 + 2 Complémentaires pour l'harmonie
        const core = metrics.topCandidates.slice(0, 3).map(c => c.number);
        const fillers = metrics.topCandidates.slice(3, 8).map(c => c.number);
        
        // Shuffle fillers
        const shuffledFillers = fillers.sort(() => 0.5 - Math.random()).slice(0, 2);
        const ticket = [...core, ...shuffledFillers].sort((a,b) => a-b);
        
        setGeneratedTicket(ticket);
        showToast("Ticket Orchestral généré avec optimisation harmonique.", "success");
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
    
    if (!metrics) return <div className="p-20 text-center text-slate-400 italic">Historique insuffisant.</div>;

    return (
        <div className="space-y-10 animate-fade-in pb-20 w-full overflow-hidden">
            {/* HERO CARD */}
            <div className="bg-slate-900 p-8 md:p-12 rounded-[3.5rem] shadow-2xl border border-indigo-500/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] group-hover:scale-125 transition-transform duration-1000 -mr-20 -mt-20"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-10">
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg"><Share2 size={20} className="text-white"/></div>
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">Interconnexion Temporelle</span>
                        </div>
                        <h3 className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-none">
                            Orchestration <span className="text-indigo-500">Scoped</span>
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
                        <div className="bg-white dark:bg-slate-800 p-2 rounded-[3.5rem] shadow-xl border border-slate-100 dark:border-slate-700">
                            <div className="px-8 pt-6 pb-2 flex items-center gap-3">
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

            {/* CANDIDATES GRID */}
            <div className="bg-white dark:bg-slate-800 p-8 md:p-12 rounded-[4rem] shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="flex items-center gap-4 mb-10 border-b border-slate-100 dark:border-slate-700 pb-6">
                    <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-2xl">
                        <Target size={24} />
                    </div>
                    <div>
                        <h4 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Vecteurs de Convergence</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Top 10 Signaux Isolés</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-6">
                    {metrics.topCandidates.slice(0, 10).map((cand, idx) => (
                        <div 
                            key={cand.number} 
                            onClick={() => setExpandedCard(expandedCard === cand.number ? null : cand.number)}
                            className={`
                                flex flex-col items-center p-6 rounded-[2.5rem] border transition-all group relative overflow-hidden cursor-pointer
                                ${expandedCard === cand.number 
                                    ? 'bg-white dark:bg-slate-700 shadow-2xl ring-2 ring-indigo-500 border-transparent z-10 scale-105' 
                                    : 'bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 hover:border-indigo-400'
                                }
                            `}
                        >
                            <div className="absolute top-3 right-3 opacity-10 font-black text-4xl text-slate-300 pointer-events-none">#{idx+1}</div>
                            
                            <NumberBall number={cand.number} size="lg" selected={expandedCard === cand.number} />
                            
                            <div className="mt-4 text-center w-full">
                                <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{cand.score}</div>
                                <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-2">Impact Score</div>
                                
                                {expandedCard === cand.number ? (
                                    <div className="animate-slide-up w-full text-left bg-slate-50 dark:bg-slate-800 p-3 rounded-xl shadow-inner mt-2 border border-slate-100 dark:border-slate-600">
                                        {cand.reasons.map((r, i) => (
                                            <div key={i} className="flex items-start gap-2 text-[9px] font-bold text-slate-600 dark:text-slate-300 mb-1 last:mb-0">
                                                <CheckCircle2 size={10} className="text-emerald-500 mt-0.5 shrink-0" /> 
                                                <span className="leading-tight">{r}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <ChevronDown size={14} className="text-slate-300 mx-auto mt-2 group-hover:text-indigo-400 transition-colors" />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
