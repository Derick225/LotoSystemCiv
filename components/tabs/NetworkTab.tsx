
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { calculateNetworkCentralityAsync, detectCommunities, calculateSuccessionMatrixAsync } from '../../services/mathService';
import { Share2, Play, Pause, Activity, Target, Users, ArrowRight, Info, Layers, RefreshCw } from 'lucide-react';
import { NumberBall } from '../NumberBall';

interface Node { 
    id: number; 
    x: number; 
    y: number; 
    vx: number; 
    vy: number; 
    community: number; 
    radius: number; 
    color: string;
    mass: number;
    isFixed?: boolean; 
}

interface Link { 
    source: number; 
    target: number; 
    strength: number;
    type: 'bidirectional' | 'directed'; 
}

type ViewMode = 'correlation' | 'transition';

const COMMUNITY_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#f43f5e', '#a855f7'];

export const NetworkTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history, correlationMatrix } = useNexus();
    const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
    const [selectedNode, setSelectedNode] = useState<number | null>(null);
    const [isSimulating, setIsSimulating] = useState(true);
    const [mode, setMode] = useState<ViewMode>('correlation');
    const [loadingGraph, setLoadingGraph] = useState(false);
    const [activeCommunity, setActiveCommunity] = useState<number | null>(null);
    
    // Canvas & Physics Refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const nodesRef = useRef<Node[]>([]);
    const linksRef = useRef<Link[]>([]);
    const animationRef = useRef<number | null>(null);
    const dragRef = useRef<{ nodeId: number, startX: number, startY: number } | null>(null);

    // Calcul des données du graphe
    useEffect(() => {
        if (history.length < 20) return;
        setLoadingGraph(true);

        const buildGraph = async () => {
            // On prend les 50 numéros les plus influents pour ne pas surcharger la vue
            const centralityScores = await calculateNetworkCentralityAsync(history);
            const activeNumbers = centralityScores.sort((a: any, b: any) => b.normalized - a.normalized).slice(0, 60);
            const activeIds = new Set<number>(activeNumbers.map((s: any) => s.number));
            
            // Détection de communautés (Tribus)
            const comms = detectCommunities(Array.from(activeIds), correlationMatrix);

            const newNodes: Node[] = activeNumbers.map((s: any, i: number) => {
                const angle = (i / activeNumbers.length) * Math.PI * 2; 
                const radius = 250;
                return {
                    id: s.number,
                    x: 400 + radius * Math.cos(angle),
                    y: 300 + radius * Math.sin(angle),
                    vx: 0, vy: 0,
                    community: comms[s.number] || 0,
                    radius: Math.max(12, 10 + (s.normalized / 100) * 15), 
                    color: COMMUNITY_COLORS[(comms[s.number] || 0) % COMMUNITY_COLORS.length],
                    mass: 1 + (s.normalized / 100)
                };
            });

            const newLinks: Link[] = [];

            if (mode === 'correlation') {
                newNodes.forEach((u, i) => {
                    const affs = correlationMatrix[u.id]?.affinities || {};
                    Object.entries(affs).forEach(([vStr, weight]) => {
                        const vId = parseInt(vStr);
                        if (!activeIds.has(vId)) return;
                        
                        const w = Number(weight);
                        const j = newNodes.findIndex(n => n.id === vId);
                        
                        if (j !== -1 && w > 0.15 && i < j) {
                            newLinks.push({ source: i, target: j, strength: w, type: 'bidirectional' });
                        }
                    });
                });
            } else {
                const { matrix, totals } = await calculateSuccessionMatrixAsync(history);
                newNodes.forEach((u, i) => {
                    const successors = matrix[u.id] || {};
                    const totalOccurrences = totals[u.id] || 1;
                    
                    Object.entries(successors).forEach(([vStr, count]) => {
                        const vId = parseInt(vStr);
                        if (!activeIds.has(vId)) return;

                        const probability = (count as number) / totalOccurrences;
                        const j = newNodes.findIndex(n => n.id === vId);

                        if (j !== -1 && probability > 0.12) {
                            newLinks.push({ source: i, target: j, strength: probability * 2, type: 'directed' });
                        }
                    });
                });
            }

            nodesRef.current = newNodes;
            linksRef.current = newLinks;
            setLoadingGraph(false);
            
            // Re-boot physics
            nodesRef.current.forEach(n => {
                n.vx = (Math.random() - 0.5) * 2;
                n.vy = (Math.random() - 0.5) * 2;
            });
        };

        buildGraph();
    }, [history, correlationMatrix, mode]);

    // Boucle de simulation Physique
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const runFrame = () => {
            if (!canvasRef.current) return;
            const width = canvasRef.current.width;
            const height = canvasRef.current.height;
            const center = { x: width / 2, y: height / 2 };

            if (isSimulating && !loadingGraph) {
                const nodes = nodesRef.current;
                const links = linksRef.current;

                // 1. Répulsion
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        const dx = nodes[i].x - nodes[j].x;
                        const dy = nodes[i].y - nodes[j].y;
                        const distSq = dx*dx + dy*dy || 1;
                        const minDist = nodes[i].radius + nodes[j].radius + 30;
                        
                        if (distSq < minDist * minDist * 4) { 
                            const force = (1500 * nodes[i].mass * nodes[j].mass) / distSq;
                            const fx = (dx / Math.sqrt(distSq)) * force;
                            const fy = (dy / Math.sqrt(distSq)) * force;
                            
                            if (!nodes[i].isFixed) { nodes[i].vx += fx; nodes[i].vy += fy; }
                            if (!nodes[j].isFixed) { nodes[j].vx -= fx; nodes[j].vy -= fy; }
                        }
                    }
                }

                // 2. Attraction
                links.forEach(link => {
                    const s = nodes[link.source];
                    const t = nodes[link.target];
                    const dx = t.x - s.x;
                    const dy = t.y - s.y;
                    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                    
                    const targetDist = 150; 
                    const force = (dist - targetDist) * 0.02 * link.strength;
                    
                    const fx = (dx/dist) * force;
                    const fy = (dy/dist) * force;
                    
                    if (!s.isFixed) { s.vx += fx; s.vy += fy; }
                    if (!t.isFixed) { t.vx -= fx; t.vy -= fy; }
                });

                // 3. Gravité Centrale & Friction (Dampening fort pour stabilité)
                nodes.forEach(n => {
                    if (n.isFixed) return;
                    n.vx += (center.x - n.x) * 0.015;
                    n.vy += (center.y - n.y) * 0.015;
                    n.vx *= 0.82; // Friction forte
                    n.vy *= 0.82;
                    n.x += n.vx;
                    n.y += n.vy;
                    
                    // Murs
                    if (n.x < n.radius) n.x = n.radius;
                    if (n.x > width - n.radius) n.x = width - n.radius;
                    if (n.y < n.radius) n.y = n.radius;
                    if (n.y > height - n.radius) n.y = height - n.radius;
                });
            }

            // --- RENDU ---
            ctx.clearRect(0, 0, width, height);
            
            // Liens
            linksRef.current.forEach(link => {
                const s = nodesRef.current[link.source];
                const t = nodesRef.current[link.target];
                
                // Filtre Communauté
                if (activeCommunity !== null && s.community !== activeCommunity && t.community !== activeCommunity) return;

                const isActive = (selectedNode === null && hoveredNodeId === null) || 
                                 (selectedNode === s.id || selectedNode === t.id || hoveredNodeId === s.id || hoveredNodeId === t.id);

                if (!isActive && activeCommunity === null) return; 

                ctx.globalAlpha = isActive ? Math.min(1, link.strength * 2) : 0.05;
                ctx.strokeStyle = mode === 'transition' ? '#6366f1' : s.color;
                ctx.lineWidth = link.strength * 3;
                
                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(t.x, t.y);
                ctx.stroke();
            });
            ctx.globalAlpha = 1;

            // Noeuds
            nodesRef.current.forEach(n => {
                // Filtre Communauté
                const isInCommunity = activeCommunity === null || n.community === activeCommunity;
                
                let isDimmed = !isInCommunity;
                if (isInCommunity) {
                    if (selectedNode !== null) {
                        const isDirect = n.id === selectedNode;
                        const isNeighbor = linksRef.current.some(l => 
                            (nodesRef.current[l.source].id === selectedNode && nodesRef.current[l.target].id === n.id) || 
                            (nodesRef.current[l.target].id === selectedNode && nodesRef.current[l.source].id === n.id)
                        );
                        if (!isDirect && !isNeighbor) isDimmed = true;
                    } else if (hoveredNodeId !== null) {
                        if (n.id !== hoveredNodeId) isDimmed = true;
                    }
                }

                ctx.globalAlpha = isDimmed ? 0.1 : 1;
                
                // Glow effect pour noeuds importants
                if (!isDimmed && n.radius > 18) {
                    ctx.shadowColor = n.color;
                    ctx.shadowBlur = 20;
                } else {
                    ctx.shadowBlur = 0;
                }

                // Corps
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
                ctx.fillStyle = '#0f172a';
                ctx.fill();
                
                ctx.lineWidth = n.id === selectedNode ? 4 : 2;
                ctx.strokeStyle = n.color;
                ctx.stroke();

                // Texte
                if (!isDimmed || n.mass > 1.2) {
                    ctx.fillStyle = '#fff';
                    ctx.font = `bold ${Math.max(10, n.radius * 0.7)}px Inter`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(n.id.toString(), n.x, n.y + 1);
                }
                
                ctx.globalAlpha = 1;
                ctx.shadowBlur = 0;
            });

            animationRef.current = requestAnimationFrame(runFrame);
        };

        runFrame();
        return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
    }, [isSimulating, hoveredNodeId, selectedNode, loadingGraph, mode, activeCommunity]);

    const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;

        const hit = nodesRef.current.find(n => {
            // Respect community filter click
            if (activeCommunity !== null && n.community !== activeCommunity) return false;
            const dx = n.x - x;
            const dy = n.y - y;
            return dx*dx + dy*dy <= Math.pow(n.radius + 15, 2);
        });

        if (hit) {
            dragRef.current = { nodeId: hit.id, startX: x, startY: y };
            hit.isFixed = true;
            hit.vx = 0; hit.vy = 0;
            setSelectedNode(hit.id === selectedNode ? null : hit.id); 
        } else {
            setSelectedNode(null);
        }
    };

    // Stats Profile
    const nodeStats = useMemo(() => {
        const targetId = selectedNode || hoveredNodeId;
        if (!targetId) return null;
        const targetIndex = nodesRef.current.findIndex(n => n.id === targetId);
        if (targetIndex === -1) return null;

        const connections = linksRef.current
            .filter(l => (mode === 'transition' ? l.source === targetIndex : (l.source === targetIndex || l.target === targetIndex)))
            .map(l => ({ 
                id: nodesRef.current[l.source === targetIndex ? l.target : l.source].id, 
                strength: l.strength,
                role: mode === 'transition' ? 'target' : 'friend'
            }))
            .sort((a,b) => b.strength - a.strength)
            .slice(0, 5);

        return { id: targetId, connections, community: nodesRef.current[targetIndex].community };
    }, [selectedNode, hoveredNodeId, loadingGraph, mode]);

    // Communautés uniques
    const communities = useMemo(() => {
        const counts: Record<number, number> = {};
        nodesRef.current.forEach(n => counts[n.community] = (counts[n.community] || 0) + 1);
        return Object.entries(counts).map(([id, count]) => ({ id: parseInt(id), count, color: COMMUNITY_COLORS[parseInt(id) % COMMUNITY_COLORS.length] }));
    }, [loadingGraph]);

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            <div className="grid lg:grid-cols-12 gap-8">
                
                {/* GRAPHE PRINCIPAL */}
                <div className="lg:col-span-8 bg-slate-950 p-6 rounded-[3rem] shadow-2xl border border-slate-800 relative overflow-hidden h-[650px] flex flex-col">
                    <div className="absolute top-6 left-8 z-20 flex flex-col gap-4 pointer-events-none">
                        <div className="flex items-center gap-3 pointer-events-auto bg-slate-900/50 p-2 rounded-2xl backdrop-blur-md border border-slate-800">
                            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg"><Share2 className="text-white" size={18}/></div>
                            <div>
                                <h3 className="text-white font-black uppercase text-xs tracking-widest">Topologie {mode === 'correlation' ? 'Sociale' : 'Temporelle'}</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase">{nodesRef.current.length} Vecteurs Actifs</p>
                            </div>
                        </div>
                        
                        <div className="bg-slate-900 p-1 rounded-2xl border border-slate-700 inline-flex pointer-events-auto shadow-xl">
                            <button onClick={() => setMode('correlation')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 transition-all ${mode === 'correlation' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                                <Users size={12}/> Amis
                            </button>
                            <button onClick={() => setMode('transition')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 transition-all ${mode === 'transition' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                                <ArrowRight size={12}/> Suites
                            </button>
                        </div>
                    </div>

                    {/* Légende Communautés */}
                    <div className="absolute top-6 right-8 z-20 pointer-events-auto bg-slate-900/80 p-3 rounded-2xl border border-slate-800 backdrop-blur-md max-w-[150px]">
                        <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Layers size={10}/> Tribus</h5>
                        <div className="flex flex-wrap gap-2">
                            <button 
                                onClick={() => setActiveCommunity(null)} 
                                className={`text-[8px] font-bold px-2 py-1 rounded border ${activeCommunity === null ? 'bg-white text-black border-white' : 'bg-slate-800 text-slate-400 border-slate-700'}`}
                            >
                                Tous
                            </button>
                            {communities.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setActiveCommunity(activeCommunity === c.id ? null : c.id)}
                                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white transition-transform ${activeCommunity === c.id ? 'scale-125 ring-2 ring-white' : 'opacity-70 hover:opacity-100'}`}
                                    style={{ backgroundColor: c.color }}
                                >
                                    {c.count}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 relative cursor-crosshair rounded-[2rem] overflow-hidden bg-gradient-to-br from-slate-950 to-[#0b0f19]">
                        {loadingGraph && <div className="absolute inset-0 flex items-center justify-center z-30 bg-slate-950/80"><p className="text-indigo-400 font-black text-xs uppercase animate-pulse">Cartographie en cours...</p></div>}
                        <canvas 
                            ref={canvasRef} 
                            width={800} 
                            height={600} 
                            className="w-full h-full touch-none"
                            onMouseDown={handlePointerDown}
                            onMouseMove={(e) => {
                                // Simple hover logic reused from original
                                const canvas = canvasRef.current;
                                if (!canvas) return;
                                const rect = canvas.getBoundingClientRect();
                                const x = (e.clientX - rect.left) * (canvas.width / rect.width);
                                const y = (e.clientY - rect.top) * (canvas.height / rect.height);
                                const hit = nodesRef.current.find(n => (n.x-x)**2 + (n.y-y)**2 <= Math.pow(n.radius + 5, 2));
                                if (hit && (activeCommunity === null || hit.community === activeCommunity)) {
                                    canvas.style.cursor = 'pointer';
                                    if (hoveredNodeId !== hit.id) setHoveredNodeId(hit.id);
                                } else {
                                    canvas.style.cursor = 'default';
                                    if (hoveredNodeId !== null) setHoveredNodeId(null);
                                }
                            }}
                            onMouseUp={() => { if (dragRef.current) nodesRef.current.find(n => n.id === dragRef.current!.nodeId)!.isFixed = false; dragRef.current = null; }}
                            onMouseLeave={() => { if (dragRef.current) nodesRef.current.find(n => n.id === dragRef.current!.nodeId)!.isFixed = false; dragRef.current = null; setHoveredNodeId(null); }}
                        />
                    </div>

                    <div className="absolute bottom-6 right-8 z-20 flex gap-2">
                        <button onClick={() => {
                            nodesRef.current.forEach(n => { n.vx = (Math.random()-0.5)*5; n.vy = (Math.random()-0.5)*5; });
                        }} className="p-3 bg-slate-800 text-slate-400 rounded-xl hover:text-white transition-all shadow-lg border border-white/5" title="Secouer">
                            <RefreshCw size={16}/>
                        </button>
                        <button onClick={() => setIsSimulating(!isSimulating)} className={`p-3 rounded-xl transition-all shadow-lg border border-white/5 ${isSimulating ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                            {isSimulating ? <Pause size={16}/> : <Play size={16}/>}
                        </button>
                    </div>
                </div>

                {/* SIDEBAR PROFIL */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 h-full flex flex-col relative overflow-hidden">
                        
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>

                        <div className="flex items-center gap-3 mb-6 relative z-10">
                            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl text-indigo-600 dark:text-indigo-400">
                                <Target size={20} />
                            </div>
                            <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">Fiche Profil</h4>
                        </div>
                        
                        {nodeStats ? (
                            <div className="space-y-8 animate-slide-up flex-1 relative z-10">
                                <div className="text-center py-6 bg-slate-50 dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 relative">
                                    <div className="absolute top-4 right-4 text-[8px] font-black text-white px-2 py-1 rounded-full uppercase tracking-widest" style={{ backgroundColor: COMMUNITY_COLORS[nodeStats.community % 8] }}>
                                        Tribu {nodeStats.community}
                                    </div>
                                    <div className="flex justify-center mb-4 transform scale-125">
                                        <NumberBall number={nodeStats.id} size="lg" selected />
                                    </div>
                                    <div className="text-2xl font-black text-slate-800 dark:text-white mb-1">Numéro {nodeStats.id}</div>
                                    <div className="text-[10px] font-bold text-slate-500 uppercase">
                                        {mode === 'correlation' ? 'Nœud Central' : 'Source de Transition'}
                                    </div>
                                </div>

                                <div>
                                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        {mode === 'correlation' ? <Users size={12}/> : <ArrowRight size={12}/>}
                                        {mode === 'correlation' ? 'Cercle Intime' : 'Prochain Arrêt'}
                                    </h5>
                                    
                                    <div className="space-y-3">
                                        {nodeStats.connections.length > 0 ? nodeStats.connections.map((c, i) => (
                                            <div key={c.id} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[9px] font-black text-slate-400 w-4">#{i+1}</span>
                                                    <NumberBall number={c.id} size="sm" />
                                                    <span className="text-xs font-bold text-slate-700 dark:text-white">N°{c.id}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-1.5 w-12 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                        <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, c.strength * 100)}%` }}></div>
                                                    </div>
                                                    <span className="text-[9px] font-bold text-indigo-500">{Math.round(c.strength * 100)}%</span>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="text-center text-xs text-slate-400 italic py-4">Solitaire (Aucune connexion forte)</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50 p-6">
                                <Activity size={48} className="text-slate-300 dark:text-slate-600 mb-4 animate-pulse-slow"/>
                                <p className="text-xs font-bold text-slate-400 max-w-[200px] leading-relaxed">
                                    Touchez une boule sur le graphe pour révéler ses connexions.
                                </p>
                            </div>
                        )}
                        
                        <div className="mt-auto p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800 flex gap-3">
                            <Info size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-indigo-800 dark:text-indigo-300 font-medium leading-relaxed">
                                Les couleurs représentent des "Tribus" de numéros qui évoluent ensemble. Filtrez-les via la légende pour y voir plus clair.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
