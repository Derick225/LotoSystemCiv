
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { calculateNetworkCentralityAsync, detectCommunities, calculateSuccessionMatrixAsync } from '../../services/mathService';
import { Share2, Play, Pause, Activity, Target, GitMerge, GitCommit, Layers, MousePointer2, Users, ArrowRight, Sparkles, Zap, Info } from 'lucide-react';
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

export const NetworkTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history, correlationMatrix } = useNexus();
    const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
    const [selectedNode, setSelectedNode] = useState<number | null>(null);
    const [isSimulating, setIsSimulating] = useState(true);
    const [mode, setMode] = useState<ViewMode>('correlation');
    const [loadingGraph, setLoadingGraph] = useState(false);
    
    // Canvas & Physics Refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const nodesRef = useRef<Node[]>([]);
    const linksRef = useRef<Link[]>([]);
    const animationRef = useRef<number | null>(null);
    const dragRef = useRef<{ nodeId: number, startX: number, startY: number } | null>(null);

    const COMMUNITY_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#f43f5e', '#a855f7'];

    // Calcul des données du graphe
    useEffect(() => {
        if (history.length < 20) return;
        setLoadingGraph(true);

        const buildGraph = async () => {
            // On prend les 50 numéros les plus influents pour ne pas surcharger la vue du novice
            const centralityScores = await calculateNetworkCentralityAsync(history);
            const activeNumbers = centralityScores.sort((a: any, b: any) => b.normalized - a.normalized).slice(0, 50);
            const activeIds = new Set<number>(activeNumbers.map((s: any) => s.number));
            
            // Détection de communautés (Tribus)
            const comms = detectCommunities(Array.from(activeIds), correlationMatrix);

            const newNodes: Node[] = activeNumbers.map((s: any, i: number) => {
                const angle = (i / activeNumbers.length) * Math.PI * 2; // Cercle parfait au début
                const radius = 200;
                return {
                    id: s.number,
                    x: 400 + radius * Math.cos(angle),
                    y: 300 + radius * Math.sin(angle),
                    vx: 0, vy: 0,
                    community: comms[s.number] || 0,
                    radius: Math.max(15, 12 + (s.normalized / 100) * 20), // Plus gros = Plus influent
                    color: COMMUNITY_COLORS[(comms[s.number] || 0) % COMMUNITY_COLORS.length],
                    mass: 1 + (s.normalized / 100)
                };
            });

            const newLinks: Link[] = [];

            if (mode === 'correlation') {
                // MODE "AMIS" (Affinité)
                newNodes.forEach((u, i) => {
                    const affs = correlationMatrix[u.id]?.affinities || {};
                    Object.entries(affs).forEach(([vStr, weight]) => {
                        const vId = parseInt(vStr);
                        if (!activeIds.has(vId)) return;
                        
                        const w = Number(weight);
                        const j = newNodes.findIndex(n => n.id === vId);
                        
                        // On ne garde que les "Meilleurs Amis" (> 0.15) pour simplifier
                        if (j !== -1 && w > 0.15 && i < j) {
                            newLinks.push({ source: i, target: j, strength: w, type: 'bidirectional' });
                        }
                    });
                });
            } else {
                // MODE "SUITE" (Qui appelle qui ?)
                const { matrix, totals } = await calculateSuccessionMatrixAsync(history);
                newNodes.forEach((u, i) => {
                    const successors = matrix[u.id] || {};
                    const totalOccurrences = totals[u.id] || 1;
                    
                    Object.entries(successors).forEach(([vStr, count]) => {
                        const vId = parseInt(vStr);
                        if (!activeIds.has(vId)) return;

                        const probability = (count as number) / totalOccurrences;
                        const j = newNodes.findIndex(n => n.id === vId);

                        // On ne garde que les appels forts (> 12%)
                        if (j !== -1 && probability > 0.12) {
                            newLinks.push({ source: i, target: j, strength: probability * 2, type: 'directed' });
                        }
                    });
                });
            }

            nodesRef.current = newNodes;
            linksRef.current = newLinks;
            setLoadingGraph(false);
            
            // Petit coup de boost physique au changement de mode pour reorganiser
            nodesRef.current.forEach(n => {
                n.vx = (Math.random() - 0.5) * 5;
                n.vy = (Math.random() - 0.5) * 5;
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

                // 1. Répulsion (Éviter la superposition)
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        const dx = nodes[i].x - nodes[j].x;
                        const dy = nodes[i].y - nodes[j].y;
                        const distSq = dx*dx + dy*dy || 1;
                        const minDist = nodes[i].radius + nodes[j].radius + 20; // Marge de confort
                        
                        if (distSq < minDist * minDist * 4) { 
                            const force = (1200 * nodes[i].mass * nodes[j].mass) / distSq;
                            const fx = (dx / Math.sqrt(distSq)) * force;
                            const fy = (dy / Math.sqrt(distSq)) * force;
                            
                            if (!nodes[i].isFixed) { nodes[i].vx += fx; nodes[i].vy += fy; }
                            if (!nodes[j].isFixed) { nodes[j].vx -= fx; nodes[j].vy -= fy; }
                        }
                    }
                }

                // 2. Attraction (Liens élastiques)
                links.forEach(link => {
                    const s = nodes[link.source];
                    const t = nodes[link.target];
                    const dx = t.x - s.x;
                    const dy = t.y - s.y;
                    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                    
                    const targetDist = 120; // Distance idéale standard
                    const force = (dist - targetDist) * 0.03 * link.strength;
                    
                    const fx = (dx/dist) * force;
                    const fy = (dy/dist) * force;
                    
                    if (!s.isFixed) { s.vx += fx; s.vy += fy; }
                    if (!t.isFixed) { t.vx -= fx; t.vy -= fy; }
                });

                // 3. Gravité Centrale & Friction
                nodes.forEach(n => {
                    if (n.isFixed) return;
                    n.vx += (center.x - n.x) * 0.012;
                    n.vy += (center.y - n.y) * 0.012;
                    n.vx *= 0.85; 
                    n.vy *= 0.85;
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
                
                const isActive = (selectedNode === null && hoveredNodeId === null) || 
                                 (selectedNode === s.id || selectedNode === t.id || hoveredNodeId === s.id || hoveredNodeId === t.id);

                if (!isActive) return; // On cache les liens non pertinents

                ctx.globalAlpha = isActive ? Math.min(1, link.strength * 2) : 0.05;
                ctx.strokeStyle = mode === 'transition' ? '#6366f1' : s.color; // Indigo si flux, sinon couleur communauté
                ctx.lineWidth = link.strength * 4;
                
                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(t.x, t.y);
                ctx.stroke();

                if (mode === 'transition') {
                    const angle = Math.atan2(t.y - s.y, t.x - s.x);
                    const endX = t.x - (t.radius + 5) * Math.cos(angle);
                    const endY = t.y - (t.radius + 5) * Math.sin(angle);
                    ctx.beginPath();
                    ctx.arc(endX, endY, 3, 0, Math.PI * 2);
                    ctx.fillStyle = '#6366f1';
                    ctx.fill();
                }
            });
            ctx.globalAlpha = 1;

            // Noeuds
            nodesRef.current.forEach(n => {
                // Logique de Focus : Si un noeud est sélectionné, on grise les autres (sauf voisins)
                let isDimmed = false;
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

                ctx.globalAlpha = isDimmed ? 0.1 : 1;
                
                // Ombre
                if (!isDimmed) {
                    ctx.shadowColor = n.color;
                    ctx.shadowBlur = n.id === selectedNode ? 30 : 10;
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
                    ctx.font = `bold ${Math.max(10, n.radius * 0.8)}px Inter`;
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
    }, [isSimulating, hoveredNodeId, selectedNode, loadingGraph, mode]);

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
            const dx = n.x - x;
            const dy = n.y - y;
            return dx*dx + dy*dy <= Math.pow(n.radius + 15, 2);
        });

        if (hit) {
            dragRef.current = { nodeId: hit.id, startX: x, startY: y };
            hit.isFixed = true;
            hit.vx = 0; hit.vy = 0;
            setSelectedNode(hit.id === selectedNode ? null : hit.id); // Toggle select
        } else {
            // Click dans le vide = Reset
            setSelectedNode(null);
        }
    };

    const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        const x = (clientX - rect.left) * (canvas.width / rect.width);
        const y = (clientY - rect.top) * (canvas.height / rect.height);

        if (dragRef.current) {
            const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
            if (node) { node.x = x; node.y = y; }
        } else if (!('touches' in e)) {
            const hit = nodesRef.current.find(n => (n.x-x)**2 + (n.y-y)**2 <= Math.pow(n.radius + 5, 2));
            if (hit) {
                canvas.style.cursor = 'pointer';
                if (hoveredNodeId !== hit.id) setHoveredNodeId(hit.id);
            } else {
                canvas.style.cursor = 'default';
                if (hoveredNodeId !== null) setHoveredNodeId(null);
            }
        }
    };

    const handlePointerUp = () => {
        if (dragRef.current) {
            const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
            if (node) { node.isFixed = false; } // On relâche mais on garde la sélection
            dragRef.current = null;
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

        return { id: targetId, connections };
    }, [selectedNode, hoveredNodeId, loadingGraph, mode]);

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            <div className="grid lg:grid-cols-12 gap-8">
                
                {/* GRAPHE PRINCIPAL */}
                <div className="lg:col-span-8 bg-slate-950 p-6 rounded-[3rem] shadow-2xl border border-slate-800 relative overflow-hidden h-[600px] flex flex-col">
                    <div className="absolute top-6 left-8 z-20 flex flex-col gap-4 pointer-events-none">
                        <div className="flex items-center gap-3 pointer-events-auto bg-slate-900/50 p-2 rounded-2xl backdrop-blur-md border border-slate-800">
                            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg"><Share2 className="text-white" size={18}/></div>
                            <div>
                                <h3 className="text-white font-black uppercase text-xs tracking-widest">Réseau Social</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase">{nodesRef.current.length} membres actifs</p>
                            </div>
                        </div>
                        
                        <div className="bg-slate-900 p-1 rounded-2xl border border-slate-700 inline-flex pointer-events-auto shadow-xl">
                            <button onClick={() => setMode('correlation')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 transition-all ${mode === 'correlation' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                                <Users size={12}/> Amis (Affinité)
                            </button>
                            <button onClick={() => setMode('transition')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 transition-all ${mode === 'transition' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                                <ArrowRight size={12}/> Suites (Appels)
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 relative cursor-crosshair">
                        {loadingGraph && <div className="absolute inset-0 flex items-center justify-center z-30 bg-slate-950/80"><p className="text-indigo-400 font-black text-xs uppercase animate-pulse">Cartographie en cours...</p></div>}
                        <canvas 
                            ref={canvasRef} 
                            width={800} 
                            height={600} 
                            className="w-full h-full touch-none"
                            onMouseDown={handlePointerDown}
                            onMouseMove={handlePointerMove}
                            onMouseUp={handlePointerUp}
                            onMouseLeave={() => { handlePointerUp(); setHoveredNodeId(null); }}
                            onTouchStart={handlePointerDown}
                            onTouchMove={handlePointerMove}
                            onTouchEnd={handlePointerUp}
                        />
                        <div className="absolute bottom-6 left-8 pointer-events-none text-[9px] text-slate-500 font-bold bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
                            <MousePointer2 size={10} className="inline mr-1"/> Touchez une boule pour isoler ses liens
                        </div>
                    </div>

                    <div className="absolute bottom-6 right-8 z-20">
                        <button onClick={() => setIsSimulating(!isSimulating)} className={`p-3 rounded-xl transition-all shadow-lg border border-white/5 ${isSimulating ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                            {isSimulating ? <Pause size={16}/> : <Play size={16}/>}
                        </button>
                    </div>
                </div>

                {/* SIDEBAR PROFIL */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 h-full flex flex-col relative overflow-hidden">
                        
                        {/* Background Decor */}
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
                                    <div className="absolute top-4 right-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Actif</div>
                                    <div className="flex justify-center mb-4 transform scale-125">
                                        <NumberBall number={nodeStats.id} size="lg" selected />
                                    </div>
                                    <div className="text-2xl font-black text-slate-800 dark:text-white mb-1">Numéro {nodeStats.id}</div>
                                    <div className="text-[10px] font-bold text-slate-500 uppercase">
                                        {mode === 'correlation' ? 'Au centre de la tribu' : 'Source du flux'}
                                    </div>
                                </div>

                                <div>
                                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        {mode === 'correlation' ? <Users size={12}/> : <ArrowRight size={12}/>}
                                        {mode === 'correlation' ? 'Ses Meilleurs Amis' : 'Il appelle souvent...'}
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
                                    Touchez une boule sur le graphe pour voir qui sont ses alliés.
                                </p>
                            </div>
                        )}
                        
                        <div className="mt-auto p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800 flex gap-3">
                            <Info size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-indigo-800 dark:text-indigo-300 font-medium leading-relaxed">
                                {mode === 'correlation' 
                                    ? "En mode **Amis**, les lignes montrent les numéros qui sortent souvent ensemble dans le même tirage."
                                    : "En mode **Suites**, une ligne signifie que le numéro ciblé a tendance à sortir au tirage suivant."}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
