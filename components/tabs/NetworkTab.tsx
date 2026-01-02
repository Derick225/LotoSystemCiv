
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { calculateNetworkCentralityAsync, detectCommunities, calculateSuccessionMatrixAsync } from '../../services/mathService';
import { Share2, Play, Pause, Activity, Target, GitMerge, GitCommit, Layers, MousePointer2 } from 'lucide-react';
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
    isFixed?: boolean; // Pour le drag & drop
}

interface Link { 
    source: number; // Index dans le tableau nodes
    target: number; // Index dans le tableau nodes
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
            // 1. Initialisation des Noeuds (Base commune)
            const centralityScores = await calculateNetworkCentralityAsync(history);
            // On prend les 60 numéros les plus centraux pour éviter la surcharge visuelle
            const activeNumbers = centralityScores.sort((a: any, b: any) => b.normalized - a.normalized).slice(0, 60);
            
            // Fix: Explicitly type activeIds Set to number to avoid unknown[] error during Array.from
            const activeIds = new Set<number>(activeNumbers.map((s: any) => s.number));
            
            // Détection de communautés (clustering)
            const comms = detectCommunities(Array.from(activeIds), correlationMatrix);

            const newNodes: Node[] = activeNumbers.map((s: any, i: number) => {
                // Positionnement initial en spirale pour une meilleure distribution
                const angle = 0.5 * i;
                const radius = 10 + 5 * i;
                return {
                    id: s.number,
                    x: 400 + radius * Math.cos(angle),
                    y: 300 + radius * Math.sin(angle),
                    vx: 0, vy: 0,
                    community: comms[s.number] || 0,
                    radius: Math.max(12, 10 + (s.normalized / 100) * 15), // Taille relative à la centralité
                    color: COMMUNITY_COLORS[(comms[s.number] || 0) % COMMUNITY_COLORS.length],
                    mass: 1 + (s.normalized / 100)
                };
            });

            const newLinks: Link[] = [];

            if (mode === 'correlation') {
                // MODE SYNCHRONE (Pearson - Non dirigé)
                newNodes.forEach((u, i) => {
                    const affs = correlationMatrix[u.id]?.affinities || {};
                    Object.entries(affs).forEach(([vStr, weight]) => {
                        const vId = parseInt(vStr);
                        if (!activeIds.has(vId)) return;
                        
                        const w = Number(weight);
                        const j = newNodes.findIndex(n => n.id === vId);
                        
                        // Seuil adaptatif pour éviter le "hairball"
                        if (j !== -1 && w > 0.12 && i < j) {
                            newLinks.push({ source: i, target: j, strength: w, type: 'bidirectional' });
                        }
                    });
                });
            } else {
                // MODE DIACHRONE (Markov - Dirigé T-1 -> T)
                const { matrix, totals } = await calculateSuccessionMatrixAsync(history);
                newNodes.forEach((u, i) => {
                    const successors = matrix[u.id] || {};
                    const totalOccurrences = totals[u.id] || 1;
                    
                    Object.entries(successors).forEach(([vStr, count]) => {
                        const vId = parseInt(vStr);
                        if (!activeIds.has(vId)) return;

                        const probability = (count as number) / totalOccurrences;
                        const j = newNodes.findIndex(n => n.id === vId);

                        // On ne garde que les transitions fortes (> 10% de proba)
                        if (j !== -1 && probability > 0.10) {
                            newLinks.push({ source: i, target: j, strength: probability * 2, type: 'directed' });
                        }
                    });
                });
            }

            nodesRef.current = newNodes;
            linksRef.current = newLinks;
            setLoadingGraph(false);
        };

        buildGraph();
    }, [history, correlationMatrix, mode]);

    // Boucle de simulation Physique (Canvas)
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

                // 1. Forces de Répulsion (Coulomb)
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        const dx = nodes[i].x - nodes[j].x;
                        const dy = nodes[i].y - nodes[j].y;
                        const distSq = dx*dx + dy*dy || 1;
                        
                        if (distSq < 50000) { // Rayon d'action optimisé
                            const force = (800 * nodes[i].mass * nodes[j].mass) / distSq;
                            const fx = (dx / Math.sqrt(distSq)) * force;
                            const fy = (dy / Math.sqrt(distSq)) * force;
                            
                            if (!nodes[i].isFixed) { nodes[i].vx += fx; nodes[i].vy += fy; }
                            if (!nodes[j].isFixed) { nodes[j].vx -= fx; nodes[j].vy -= fy; }
                        }
                    }
                }

                // 2. Forces d'Attraction (Ressorts sur les liens)
                links.forEach(link => {
                    const s = nodes[link.source];
                    const t = nodes[link.target];
                    const dx = t.x - s.x;
                    const dy = t.y - s.y;
                    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                    
                    // Longueur idéale du ressort dépend de la force du lien (plus fort = plus court)
                    const targetDist = 150 * (1 - Math.min(0.8, link.strength)); 
                    const force = (dist - targetDist) * 0.05 * (mode === 'transition' ? 0.5 : 1); 
                    
                    const fx = (dx/dist) * force;
                    const fy = (dy/dist) * force;
                    
                    if (!s.isFixed) { s.vx += fx; s.vy += fy; }
                    if (!t.isFixed) { t.vx -= fx; t.vy -= fy; }
                });

                // 3. Gravité Centrale & Friction & Intégration
                nodes.forEach(n => {
                    if (n.isFixed) return;

                    // Gravité douce vers le centre
                    n.vx += (center.x - n.x) * 0.015;
                    n.vy += (center.y - n.y) * 0.015;
                    
                    // Friction (Amortissement)
                    n.vx *= 0.85; 
                    n.vy *= 0.85;
                    
                    // Mise à jour position
                    n.x += n.vx;
                    n.y += n.vy;
                    
                    // Bounding Box (Mur élastique)
                    const padding = n.radius + 5;
                    if (n.x < padding) { n.x = padding; n.vx *= -0.5; }
                    if (n.x > width - padding) { n.x = width - padding; n.vx *= -0.5; }
                    if (n.y < padding) { n.y = padding; n.vy *= -0.5; }
                    if (n.y > height - padding) { n.y = height - padding; n.vy *= -0.5; }
                });
            }

            // --- RENDU GRAPHIQUE ---
            ctx.clearRect(0, 0, width, height);
            
            // Liens
            linksRef.current.forEach(link => {
                const s = nodesRef.current[link.source];
                const t = nodesRef.current[link.target];
                
                const isConnectedToHover = hoveredNodeId !== null && (s.id === hoveredNodeId || t.id === hoveredNodeId);
                const isConnectedToSelect = selectedNode !== null && (s.id === selectedNode || t.id === selectedNode);
                const isHighlight = isConnectedToHover || isConnectedToSelect;
                const isDimmed = (hoveredNodeId !== null || selectedNode !== null) && !isHighlight;

                ctx.globalAlpha = isHighlight ? 0.9 : isDimmed ? 0.05 : Math.max(0.1, link.strength * 0.8);
                ctx.strokeStyle = isHighlight ? '#ffffff' : mode === 'transition' ? '#6366f1' : s.color;
                ctx.lineWidth = isHighlight ? 2 : Math.max(0.5, link.strength * 3);
                
                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(t.x, t.y);
                ctx.stroke();

                // Flèche pour le mode Transition
                if (mode === 'transition' && (isHighlight || ctx.globalAlpha > 0.2)) {
                    const angle = Math.atan2(t.y - s.y, t.x - s.x);
                    const headLen = 8;
                    const endX = t.x - (t.radius + 4) * Math.cos(angle);
                    const endY = t.y - (t.radius + 4) * Math.sin(angle);
                    
                    ctx.beginPath();
                    ctx.moveTo(endX, endY);
                    ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
                    ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.fill();
                }
            });
            ctx.globalAlpha = 1;

            // Noeuds
            nodesRef.current.forEach(n => {
                const isHovered = hoveredNodeId === n.id;
                const isSelected = selectedNode === n.id;
                
                // Dimming Logic
                let isRelated = false;
                if (hoveredNodeId !== null || selectedNode !== null) {
                    const targetId = hoveredNodeId || selectedNode;
                    const targetIdx = nodesRef.current.findIndex(x => x.id === targetId);
                    const myIdx = nodesRef.current.indexOf(n);
                    
                    isRelated = linksRef.current.some(l => 
                        (l.source === targetIdx && l.target === myIdx) || 
                        (l.target === targetIdx && l.source === myIdx)
                    );
                }
                const isTarget = n.id === hoveredNodeId || n.id === selectedNode;
                const isDimmed = (hoveredNodeId !== null || selectedNode !== null) && !isTarget && !isRelated;

                if (isDimmed) ctx.globalAlpha = 0.15;

                // Ombre portée si actif
                if (isHovered || isSelected) {
                    ctx.shadowColor = n.color;
                    ctx.shadowBlur = 20;
                } else {
                    ctx.shadowBlur = 0;
                }

                // Cercle du noeud
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
                ctx.fillStyle = '#0f172a'; // Dark slate center
                ctx.fill();
                
                ctx.lineWidth = (isHovered || isSelected) ? 3 : 2;
                ctx.strokeStyle = n.color;
                ctx.stroke();

                // Numéro
                if (!isDimmed || n.mass > 1.5) {
                    ctx.fillStyle = '#fff';
                    ctx.font = `bold ${Math.max(10, n.radius)}px Inter`;
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

    // Interaction Handlers (Mouse & Touch)
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

        // Trouver le noeud cliqué
        const hit = nodesRef.current.find(n => {
            const dx = n.x - x;
            const dy = n.y - y;
            return dx*dx + dy*dy <= Math.pow(n.radius + 10, 2); // Hitbox généreuse
        });

        if (hit) {
            dragRef.current = { nodeId: hit.id, startX: x, startY: y };
            hit.isFixed = true; // Arrête la physique pour ce noeud
            hit.vx = 0; hit.vy = 0;
            setSelectedNode(hit.id);
        } else {
            setSelectedNode(null);
        }
    };

    const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;

        if (dragRef.current) {
            // Mode Dragging
            const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
            if (node) {
                node.x = x;
                node.y = y;
            }
        } else {
            // Mode Hover (seulement souris)
            if (!('touches' in e)) {
                const hit = nodesRef.current.find(n => {
                    const dx = n.x - x;
                    const dy = n.y - y;
                    return dx*dx + dy*dy <= Math.pow(n.radius + 5, 2);
                });
                
                if (hit) {
                    canvas.style.cursor = 'pointer';
                    if (hoveredNodeId !== hit.id) setHoveredNodeId(hit.id);
                } else {
                    canvas.style.cursor = 'default';
                    if (hoveredNodeId !== null) setHoveredNodeId(null);
                }
            }
        }
    };

    const handlePointerUp = () => {
        if (dragRef.current) {
            const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
            if (node) {
                node.isFixed = false; // Relâche la physique
                // Petit boost de vélocité pour éviter qu'il ne se fige
                node.vx = (Math.random() - 0.5) * 2;
                node.vy = (Math.random() - 0.5) * 2;
            }
            dragRef.current = null;
        }
    };

    // Calcul des statistiques du noeud sélectionné
    const nodeStats = useMemo(() => {
        const targetId = selectedNode || hoveredNodeId;
        if (!targetId) return null;
        
        const targetIndex = nodesRef.current.findIndex(n => n.id === targetId);
        if (targetIndex === -1) return null;

        const incoming = linksRef.current
            .filter(l => l.target === targetIndex)
            .sort((a,b) => b.strength - a.strength)
            .slice(0, 5)
            .map(l => ({ id: nodesRef.current[l.source].id, strength: l.strength }));

        const outgoing = linksRef.current
            .filter(l => l.source === targetIndex)
            .sort((a,b) => b.strength - a.strength)
            .slice(0, 5)
            .map(l => ({ id: nodesRef.current[l.target].id, strength: l.strength }));

        return { id: targetId, incoming, outgoing };
    }, [selectedNode, hoveredNodeId, loadingGraph]);

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            <div className="grid lg:grid-cols-12 gap-8">
                {/* Visualiseur Principal */}
                <div className="lg:col-span-8 bg-slate-950 p-6 rounded-[3rem] shadow-2xl border border-slate-800 relative overflow-hidden h-[650px] flex flex-col">
                    <div className="absolute top-6 left-8 z-20 flex flex-col gap-4 pointer-events-none">
                        <div className="flex items-center gap-3 pointer-events-auto">
                            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg"><Share2 className="text-white" size={18}/></div>
                            <div>
                                <h3 className="text-white font-black uppercase text-sm tracking-widest">Neural Graph v9.0</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase">{nodesRef.current.length} Vecteurs Actifs</p>
                            </div>
                        </div>
                        
                        {/* Mode Switcher */}
                        <div className="bg-slate-900 p-1 rounded-2xl border border-slate-700 inline-flex pointer-events-auto shadow-xl">
                            <button 
                                onClick={() => setMode('correlation')} 
                                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 transition-all ${mode === 'correlation' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                <GitMerge size={12}/> Affinité
                            </button>
                            <button 
                                onClick={() => setMode('transition')} 
                                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 transition-all ${mode === 'transition' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                <GitCommit size={12}/> Dépendance (T-1)
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 relative cursor-crosshair">
                        {loadingGraph && (
                            <div className="absolute inset-0 flex items-center justify-center z-30 bg-slate-950/50 backdrop-blur-sm">
                                <p className="text-indigo-400 font-black text-xs uppercase tracking-[0.3em] animate-pulse">Calcul Topology...</p>
                            </div>
                        )}
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
                        <div className="absolute bottom-6 left-8 pointer-events-none text-[9px] text-slate-500 font-mono">
                            <MousePointer2 size={10} className="inline mr-1"/> Drag & Drop activé
                        </div>
                    </div>

                    <div className="absolute bottom-6 right-8 z-20 flex gap-2">
                        <button onClick={() => setIsSimulating(!isSimulating)} className={`p-4 rounded-2xl transition-all shadow-xl border border-white/5 ${isSimulating ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                            {isSimulating ? <Pause size={20}/> : <Play size={20}/>}
                        </button>
                    </div>
                </div>

                {/* Sidebar Details */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 h-full flex flex-col">
                        <h4 className="text-sm font-black mb-6 uppercase tracking-widest text-slate-400 flex items-center gap-3">
                            <Target size={16} className={mode === 'transition' ? "text-emerald-500" : "text-indigo-600"} /> 
                            {mode === 'transition' ? 'Analyse de Flux' : 'Analyse Gravitaire'}
                        </h4>
                        
                        {nodeStats ? (
                            <div className="space-y-6 animate-slide-up flex-1">
                                <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
                                    <NumberBall number={nodeStats.id} size="lg" />
                                    <div>
                                        <div className="text-xl font-black text-slate-800 dark:text-white">Noeud {nodeStats.id}</div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase">Focus Actif</div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {mode === 'transition' ? (
                                        <>
                                            <div>
                                                <div className="text-[9px] font-black text-slate-400 uppercase mb-2">Est appelé par (Sources)</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {nodeStats.incoming.length > 0 ? nodeStats.incoming.map(n => (
                                                        <div key={n.id} className="px-3 py-1 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-lg text-[10px] font-black flex items-center gap-1">
                                                            {n.id} <span className="opacity-50 text-[8px]">({Math.round(n.strength * 100)}%)</span>
                                                        </div>
                                                    )) : <span className="text-xs text-slate-400 italic">Aucune source forte</span>}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-[9px] font-black text-slate-400 uppercase mb-2">Appelle ensuite (Cibles)</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {nodeStats.outgoing.length > 0 ? nodeStats.outgoing.map(n => (
                                                        <div key={n.id} className="px-3 py-1 bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 rounded-lg text-[10px] font-black flex items-center gap-1">
                                                            {n.id} <span className="opacity-50 text-[8px]">({Math.round(n.strength * 100)}%)</span>
                                                        </div>
                                                    )) : <span className="text-xs text-slate-400 italic">Aucune cible probable</span>}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div>
                                            <div className="text-[9px] font-black text-slate-400 uppercase mb-2">Connexions Fortes (Pearson)</div>
                                            <div className="space-y-2">
                                                {nodeStats.outgoing.map(n => (
                                                    <div key={n.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-900/50">
                                                        <div className="flex items-center gap-2">
                                                            <NumberBall number={n.id} size="sm" />
                                                            <span className="text-xs font-bold dark:text-white">N°{n.id}</span>
                                                        </div>
                                                        <div className="h-1.5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                            <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, n.strength * 100)}%` }}></div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50 p-6">
                                <Activity size={48} className="text-slate-300 dark:text-slate-600 mb-4"/>
                                <p className="text-xs font-bold text-slate-400 max-w-[200px]">Cliquez sur un noeud pour révéler ses connexions synaptiques.</p>
                            </div>
                        )}
                        
                        <div className="mt-auto p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800 text-[10px] text-indigo-800 dark:text-indigo-300 font-medium leading-relaxed italic">
                            {mode === 'correlation' 
                                ? "Le mode Affinité montre les numéros qui sortent souvent ensemble. Idéal pour construire des combinaisons."
                                : "Le mode Dépendance montre les suites logiques (T-1 vers T). Idéal pour prédire le prochain tirage."}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
