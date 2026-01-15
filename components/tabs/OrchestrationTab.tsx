
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getFullOrchestrationAnalysis, analyzeShortTermMimicry } from '../../services/orchestrationService';
import { useNexus } from '../NexusProvider';
import type { OrchestrationMetrics, DrawResult, MimicryMetric } from '../../types';
import { NumberBall } from '../NumberBall';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from 'recharts';
import { OrchestrationRadar } from '../OrchestrationRadar';
import { Activity, Layers, Zap, Target, Binary, ChevronDown, CheckCircle2, Copy } from 'lucide-react';

interface OrchestrationTabProps { drawName: string; }

// --- COMPOSANT DE VISUALISATION DE FLUX (FLOW CHART) ---
const VectorFlowChart: React.FC<{ prevDraw: number[], candidates: number[] }> = ({ prevDraw, candidates }) => {
    const [links, setLinks] = useState<{src: number, tgt: number, type: string, color: string}[]>([]);
    const [hoveredTgt, setHoveredTgt] = useState<number | null>(null);

    const computedLinks = useMemo(() => {
        const newLinks: {src: number, tgt: number, type: string, color: string}[] = [];
        const topCands = candidates.slice(0, 5);

        prevDraw.forEach(src => {
            topCands.forEach(tgt => {
                if (src === tgt) newLinks.push({ src, tgt, type: 'Répétition', color: '#10b981' }); // Vert
                else if (Math.abs(src - tgt) === 1) newLinks.push({ src, tgt, type: 'Voisin', color: '#3b82f6' }); // Bleu
                else if (src === 91 - tgt) newLinks.push({ src, tgt, type: 'Miroir', color: '#ec4899' }); // Rose
            });
        });
        return newLinks;
    }, [prevDraw, candidates]);

    useEffect(() => { setLinks(computedLinks); }, [computedLinks]);

    return (
        <div className="bg-slate-950 text-white p-8 rounded-[3rem] shadow-2xl border border-slate-800 overflow-hidden relative min-h-[420px] flex flex-col justify-between group">
            {/* Background Grid */}
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,#1e1b4b_0%,transparent_100%)]"></div>
            
            <div className="flex justify-between items-start relative z-10">
                {/* SOURCE COLUMN (T-1) */}
                <div className="text-center w-1/3 space-y-4">
                    <div className="text-[10px] uppercase font-black text-slate-500 tracking-widest bg-slate-900 px-3 py-1 rounded-full border border-slate-800 inline-block">T-1 Winners</div>
                    <div className="flex flex-col items-center gap-3">
                        {prevDraw.map(n => {
                            // On grise si on survole une cible et qu'il n'y a pas de lien
                            const isRel = hoveredTgt ? links.some(l => l.tgt === hoveredTgt && l.src === n) : true;
                            return (
                                <div key={`src-${n}`} className={`transition-all duration-300 ${!isRel ? 'opacity-20 scale-90 blur-[1px]' : 'opacity-100 scale-100'}`}>
                                    <NumberBall number={n} size="sm" />
                                </div>
                            );
                        })}
                    </div>
                </div>
                
                {/* CENTER HUB */}
                <div className="text-center w-1/3 pt-12 flex flex-col items-center">
                    <div className="text-[9px] uppercase font-black text-indigo-500 animate-pulse tracking-[0.4em]">Flux Neural</div>
                    <div className="mt-4 p-4 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                        <Binary size={24} className="text-indigo-400" />
                    </div>
                </div>

                {/* TARGET COLUMN (Predictions) */}
                <div className="text-center w-1/3 space-y-4">
                    <div className="text-[10px] uppercase font-black text-slate-500 tracking-widest bg-slate-900 px-3 py-1 rounded-full border border-slate-800 inline-block">IA Cibles</div>
                    <div className="flex flex-col items-center gap-3">
                        {candidates.slice(0, 5).map(n => (
                            <div 
                                key={`tgt-${n}`} 
                                className={`cursor-pointer transition-all duration-300 ${hoveredTgt === n ? 'scale-125 z-20' : hoveredTgt ? 'opacity-30 scale-90 blur-[1px]' : 'hover:scale-110'}`} 
                                onMouseEnter={() => setHoveredTgt(n)} 
                                onMouseLeave={() => setHoveredTgt(null)}
                            >
                                <NumberBall number={n} size="md" selected={hoveredTgt === n} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* VECTOR LINES (SVG LAYER) */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                    <marker id="arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                        <polygon points="0 0, 6 2, 0 4" fill="#6366f1" />
                    </marker>
                </defs>
                {links.map((link, i) => {
                    const sIdx = prevDraw.indexOf(link.src);
                    const tIdx = candidates.slice(0, 5).indexOf(link.tgt);
                    if (sIdx === -1 || tIdx === -1) return null;
                    
                    const isFocus = hoveredTgt === null || link.tgt === hoveredTgt;
                    // Coordonnées relatives (0-100)
                    const sY = 18 + (sIdx * 13); // Ajustement position verticale source
                    const tY = 18 + (tIdx * 13); // Ajustement position verticale cible
                    
                    return (
                        <path 
                            key={i} 
                            d={`M 28 ${sY} C 50 ${sY}, 50 ${tY}, 72 ${tY}`} // Courbe de Bézier cubique
                            fill="none" 
                            stroke={link.color} 
                            strokeWidth={isFocus ? 0.8 : 0.2} 
                            strokeOpacity={isFocus ? (hoveredTgt ? 1 : 0.6) : 0.1} 
                            strokeDasharray={isFocus ? "none" : "2 2"}
                            className="transition-all duration-500 ease-out" 
                        />
                    );
                })}
            </svg>

            {/* LEGEND */}
            <div className="mt-8 flex flex-wrap gap-2 relative z-10 justify-center h-12 overflow-hidden items-center">
                {links.filter(l => hoveredTgt === null || l.tgt === hoveredTgt).slice(0, 3).map((link, i) => (
                    <div key={i} className="px-3 py-1 bg-slate-900 border border-slate-700 rounded-full text-[8px] font-black uppercase tracking-widest shadow-xl animate-fade-in flex items-center gap-1" style={{ borderColor: link.color }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: link.color }}></div>
                        <span style={{ color: link.color }}>{link.type}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- COMPOSANT MIMICRY CARD ---
const MimicryCard: React.FC<{ mimicry: MimicryMetric[] }> = ({ mimicry }) => {
    return (
        <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-lg">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-3">
                <Copy size={16} className="text-amber-500"/> Mimétisme Séquentiel (3 Derniers)
            </h4>
            
            {mimicry.length === 0 ? (
                <div className="text-center text-xs text-slate-400 italic py-6">
                    Aucun pattern de répétition immédiate détecté sur T, T-1, T-2.
                </div>
            ) : (
                <div className="space-y-3">
                    {mimicry.slice(0, 4).map((m, i) => (
                        <div key={m.number} className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-black/20 border border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <NumberBall number={m.number} size="sm" />
                                <div>
                                    <div className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase">{m.type}</div>
                                    <div className="text-[9px] font-mono text-slate-400">Source: {m.sourceDraw}</div>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className={`text-sm font-black ${m.score >= 50 ? 'text-emerald-500' : 'text-indigo-500'}`}>{m.score}pts</span>
                                <div className="h-1 w-12 bg-slate-200 dark:bg-slate-700 rounded-full mt-1">
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
    const [metrics, setMetrics] = useState<OrchestrationMetrics | null>(null);
    const [prevDraw, setPrevDraw] = useState<DrawResult | null>(null);
    const [mimicryData, setMimicryData] = useState<MimicryMetric[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedCard, setExpandedCard] = useState<number | null>(null); 
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

    if (nexusLoading || loading) return <div className="p-24 text-center animate-pulse font-black text-indigo-500 uppercase tracking-[0.4em] text-sm">Orchestration Analysis Hub...</div>;
    if (!metrics) return <div className="p-20 text-center text-slate-400 italic">Historique insuffisant.</div>;

    return (
        <div className="space-y-10 animate-fade-in pb-20 w-full overflow-hidden">
            {/* HERO CARD */}
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 p-8 md:p-12 rounded-[3.5rem] shadow-2xl border border-indigo-500/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] group-hover:scale-125 transition-transform duration-1000"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-10">
                    <div>
                        <h3 className="text-3xl md:text-5xl font-black text-white tracking-tighter flex items-center gap-4">
                            <Layers className="text-indigo-500 w-8 h-8 md:w-12 md:h-12" /> Orchestration <span className="text-indigo-400">Scoped</span>
                        </h3>
                        <p className="text-slate-400 text-sm md:text-lg mt-4 max-w-2xl font-medium leading-relaxed">
                            Cartographie synaptique des transitions temporelles. Le système analyse comment le tirage T-1 "oriente" le tirage T via les miroirs et les échos de voisinage.
                        </p>
                    </div>
                    <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-inner text-center min-w-[220px]">
                        <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Impact Global</div>
                        <div className="text-6xl font-black text-white">{metrics.globalScore}%</div>
                    </div>
                </div>
            </div>

            {/* FLOW CHART & RADAR */}
            <div className="grid lg:grid-cols-2 gap-8">
                {prevDraw && (
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3.5rem] shadow-sm border border-slate-100 dark:border-slate-700">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-3">
                            <Zap size={18} className="text-indigo-600"/> Flux d'Influence Directe
                        </h4>
                        <VectorFlowChart prevDraw={prevDraw.gagnants} candidates={metrics.topCandidates.map(c => c.number)} />
                    </div>
                )}
                
                <div className="space-y-8">
                    {/* Mimicry Card (Nouvel ajout) */}
                    <MimicryCard mimicry={mimicryData} />

                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3.5rem] shadow-sm border border-slate-100 dark:border-slate-700">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-3">
                            <Activity size={18} className="text-rose-500"/> Spectre des Menaces Hebdo
                        </h4>
                        <OrchestrationRadar drawName={drawName} />
                    </div>
                </div>
            </div>

            {/* CANDIDATES GRID */}
            <div className="bg-white dark:bg-slate-800 p-10 rounded-[4rem] shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <h4 className="text-xl font-black text-slate-800 dark:text-white mb-10 flex items-center gap-4">
                    <Target className="text-indigo-600" size={28} /> Vecteurs de Convergence Isolés
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-6">
                    {metrics.topCandidates.slice(0, 10).map((cand) => (
                        <div 
                            key={cand.number} 
                            onClick={() => setExpandedCard(expandedCard === cand.number ? null : cand.number)}
                            className={`flex flex-col items-center p-6 bg-slate-50 dark:bg-slate-900/50 rounded-[2.5rem] border border-transparent transition-all group relative overflow-hidden cursor-pointer ${expandedCard === cand.number ? 'ring-2 ring-indigo-500 shadow-xl' : 'hover:border-indigo-400'}`}
                        >
                            <div className="absolute top-0 right-0 p-2 opacity-5"><Binary size={40}/></div>
                            <NumberBall number={cand.number} size="lg" />
                            <div className="mt-6 text-center">
                                <div className="text-2xl font-black text-indigo-600">{cand.score} <span className="text-[10px] font-bold text-slate-400">pts</span></div>
                                <div className="mt-2 flex flex-wrap justify-center gap-1">
                                    {/* Default simplified view */}
                                    {!expandedCard || expandedCard !== cand.number ? (
                                        <div className="flex flex-col items-center mt-2">
                                            <ChevronDown size={14} className="text-slate-400 animate-bounce" />
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Détails</span>
                                        </div>
                                    ) : (
                                        <div className="space-y-1 animate-slide-up w-full mt-2 text-left bg-white dark:bg-slate-800 p-3 rounded-xl shadow-inner">
                                            {cand.reasons.map((r, i) => (
                                                <div key={i} className="flex items-center gap-2 text-[9px] font-bold text-slate-600 dark:text-slate-300">
                                                    <CheckCircle2 size={10} className="text-emerald-500" /> {r}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
