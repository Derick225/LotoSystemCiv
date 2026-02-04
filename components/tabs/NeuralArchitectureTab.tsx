
import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useNexus } from '../NexusProvider';
import { Network, Search, X, Activity, Share2, Layers, Cpu, Zap, MousePointer2, Move, Sliders } from 'lucide-react';
import { NumberBall } from '../NumberBall';
import { saveTicket } from '../../services/userPreferencesService';
import { useToast } from '../ui/Toast';

interface Node { 
    id: number; 
    x: number; 
    y: number; 
    vx: number; 
    vy: number; 
    radius: number; 
    color: string; 
    mass: number;
    centrality: number;
    community: number;
    fixed: boolean;
}

interface Link { 
    source: number; 
    target: number; 
    strength: number; 
}

const COMMUNITY_COLORS = [
    '#6366f1', // Indigo
    '#10b981', // Emerald
    '#f43f5e', // Rose
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#06b6d4', // Cyan
];

const MAX_VELOCITY = 4; // Limite de vitesse physique pour éviter les explosions

export const NeuralArchitectureTab: React.FC = () => {
    const { history, correlationMatrix, drawName } = useNexus();
    const { showToast } = useToast();
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // State
    const [hoveredNode, setHoveredNode] = useState<number | null>(null);
    const [selectedNode, setSelectedNode] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [minStrength, setMinStrength] = useState(25); 
    const [generatedPath, setGeneratedPath] = useState<number[]>([]);
    
    const nodesRef = useRef<Node[]>([]);
    const linksRef = useRef<Link[]>([]);
    const draggingRef = useRef<number | null>(null);
    const animationRef = useRef<number>();

    // --- INITIALISATION DES DONNÉES ---
    useEffect(() => {
        const rawLinks: Link[] = [];
        const nodeDegrees: Record<number, number> = {};
        
        Object.entries(correlationMatrix).forEach(([srcStr, data]: [string, any]) => {
            const src = parseInt(srcStr);
            Object.entries(data.affinities).forEach(([tgtStr, strength]: [string, any]) => {
                const tgt = parseInt(tgtStr);
                const sVal = Number(strength);
                if (src < tgt && sVal > 0.10) { 
                    rawLinks.push({ source: src, target: tgt, strength: sVal });
                    nodeDegrees[src] = (nodeDegrees[src] || 0) + sVal;
                    nodeDegrees[tgt] = (nodeDegrees[tgt] || 0) + sVal;
                }
            });
        });

        const newNodes: Node[] = Array.from({ length: 90 }, (_, i) => {
            const id = i + 1;
            const degree = nodeDegrees[id] || 0;
            const community = id % 6; 
            
            return {
                id,
                x: Math.random() * 800,
                y: Math.random() * 600,
                vx: 0, vy: 0,
                radius: 4 + (degree * 1.5), 
                color: COMMUNITY_COLORS[community],
                mass: 1 + degree,
                centrality: degree,
                community,
                fixed: false
            };
        });

        // Positionnement initial circulaire
        const centerX = 400;
        const centerY = 300;
        newNodes.forEach((n, i) => {
            const angle = (i / 90) * Math.PI * 2;
            const r = 250;
            n.x = centerX + Math.cos(angle) * r;
            n.y = centerY + Math.sin(angle) * r;
        });

        nodesRef.current = newNodes;
        linksRef.current = rawLinks;

    }, [correlationMatrix]);

    // --- MOTEUR PHYSIQUE OPTIMISÉ ---
    const updatePhysics = useCallback(() => {
        const nodes = nodesRef.current;
        const links = linksRef.current;
        const width = canvasRef.current?.width || 800;
        const height = canvasRef.current?.height || 600;
        const threshold = minStrength / 100;

        const activeLinks = links.filter(l => l.strength >= threshold);

        // 1. Forces de Répulsion (Coulomb) - O(N^2) mais acceptable pour N=90
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i];
                const b = nodes[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const distSq = dx*dx + dy*dy || 1;
                
                if (distSq < 25000) { 
                    const force = (100 * a.mass * b.mass) / distSq;
                    const fx = (dx * force) / Math.sqrt(distSq);
                    const fy = (dy * force) / Math.sqrt(distSq);
                    
                    if (!a.fixed) { a.vx += fx; a.vy += fy; }
                    if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
                }
            }
        }

        // 2. Forces d'Attraction (Ressort)
        activeLinks.forEach(l => {
            const s = nodes[l.source - 1];
            const t = nodes[l.target - 1];
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            
            const targetDist = 100 - (l.strength * 50); 
            const force = (dist - targetDist) * 0.05 * l.strength;
            
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (!s.fixed) { s.vx += fx; s.vy += fy; }
            if (!t.fixed) { t.vx -= fx; t.vy -= fy; }
        });

        // 3. Intégration & Contraintes
        nodes.forEach(n => {
            if (n.fixed) return;
            n.vx += (width/2 - n.x) * 0.005; // Gravité
            n.vy += (height/2 - n.y) * 0.005;
            
            // Terminal Velocity Cap (Anti-Explosion)
            const speed = Math.sqrt(n.vx*n.vx + n.vy*n.vy);
            if(speed > MAX_VELOCITY) {
                n.vx = (n.vx / speed) * MAX_VELOCITY;
                n.vy = (n.vy / speed) * MAX_VELOCITY;
            }

            n.vx *= 0.85; // Friction
            n.vy *= 0.85;
            
            n.x += n.vx;
            n.y += n.vy;

            // Bounding Box
            const margin = 20;
            if (n.x < margin) n.x = margin;
            if (n.x > width - margin) n.x = width - margin;
            if (n.y < margin) n.y = margin;
            if (n.y > height - margin) n.y = height - margin;
        });
    }, [minStrength]);

    // --- RENDU CANVAS ---
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        updatePhysics();

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for(let i=0; i<canvas.width; i+=50) { ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); }
        for(let i=0; i<canvas.height; i+=50) { ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); }
        ctx.stroke();

        const threshold = minStrength / 100;
        const nodes = nodesRef.current;
        
        // Liens
        linksRef.current.forEach(l => {
            if (l.strength < threshold) return;
            const s = nodes[l.source - 1];
            const t = nodes[l.target - 1];

            let alpha = (l.strength - threshold) / (1 - threshold);
            alpha = Math.max(0.05, Math.min(0.8, alpha));

            if (selectedNode || hoveredNode) {
                const target = selectedNode || hoveredNode;
                const isConnected = l.source === target || l.target === target;
                if (isConnected) {
                    alpha = 1;
                    ctx.strokeStyle = '#a5b4fc'; 
                    ctx.lineWidth = l.strength * 4;
                } else {
                    alpha *= 0.1;
                    ctx.strokeStyle = s.color;
                    ctx.lineWidth = l.strength;
                }
            } else {
                ctx.strokeStyle = s.color; 
                ctx.lineWidth = l.strength * 2;
            }

            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(t.x, t.y);
            ctx.stroke();
        });

        // Noeuds
        nodes.forEach(n => {
            let alpha = 1;
            let scale = 1;

            if (selectedNode || hoveredNode) {
                const target = selectedNode || hoveredNode;
                const isTarget = n.id === target;
                const isNeighbor = linksRef.current.some(l => 
                    l.strength >= threshold && 
                    ((l.source === target && l.target === n.id) || (l.target === target && l.source === n.id))
                );

                if (isTarget) {
                    scale = 1.5;
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = n.color;
                } else if (isNeighbor) {
                    scale = 1.1;
                } else {
                    alpha = 0.1;
                }
            }

            ctx.globalAlpha = alpha;
            
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius * scale, 0, Math.PI * 2);
            ctx.fillStyle = '#0f172a';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = n.color;
            ctx.stroke();

            if (alpha > 0.2 && (n.centrality > 1.5 || scale > 1)) {
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${10 * scale}px Inter`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(n.id.toString(), n.x, n.y);
            }
            ctx.shadowBlur = 0;
        });
        
        ctx.globalAlpha = 1;
        animationRef.current = requestAnimationFrame(draw);
    }, [minStrength, selectedNode, hoveredNode]);

    useEffect(() => {
        animationRef.current = requestAnimationFrame(draw);
        return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
    }, [draw]);

    const handleMouseDown = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const hit = nodesRef.current.find(n => Math.pow(n.x - x, 2) + Math.pow(n.y - y, 2) < Math.pow(n.radius + 10, 2));
        
        if (hit) {
            draggingRef.current = hit.id;
            hit.fixed = true;
            setSelectedNode(prev => prev === hit.id ? null : hit.id);
            setGeneratedPath([]);
        } else {
            setSelectedNode(null);
            setGeneratedPath([]);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (draggingRef.current) {
            const node = nodesRef.current.find(n => n.id === draggingRef.current);
            if (node) { node.x = x; node.y = y; }
        } else {
            const hit = nodesRef.current.find(n => Math.pow(n.x - x, 2) + Math.pow(n.y - y, 2) < Math.pow(n.radius + 10, 2));
            setHoveredNode(hit ? hit.id : null);
        }
    };

    const handleMouseUp = () => {
        if (draggingRef.current) {
            const node = nodesRef.current.find(n => n.id === draggingRef.current);
            if (node) node.fixed = false;
            draggingRef.current = null;
        }
    };

    const generateNeuralPath = () => {
        if (!selectedNode) return;
        const path = new Set<number>();
        path.add(selectedNode);
        let currentId = selectedNode;
        const threshold = minStrength / 100;

        for (let i = 0; i < 4; i++) {
            const links = linksRef.current
                .filter(l => l.strength >= threshold && (l.source === currentId || l.target === currentId))
                .map(l => ({ id: l.source === currentId ? l.target : l.source, str: l.strength }))
                .filter(n => !path.has(n.id))
                .sort((a,b) => b.str - a.str);
            
            if (links.length > 0) {
                // Stochastic Path: Pick top 1-3 weighted
                const pick = links[Math.floor(Math.random() * Math.min(3, links.length))];
                path.add(pick.id);
                currentId = pick.id;
            } else {
                break;
            }
        }

        if (path.size < 5) {
            const neighbors = linksRef.current
                .filter(l => l.strength >= threshold && (l.source === selectedNode || l.target === selectedNode))
                .map(l => ({ id: l.source === selectedNode ? l.target : l.source, str: l.strength }))
                .filter(n => !path.has(n.id))
                .sort((a,b) => b.str - a.str);
            
            neighbors.slice(0, 5 - path.size).forEach(n => path.add(n.id));
        }

        setGeneratedPath(Array.from(path).sort((a,b) => a-b));
        showToast("Chemin Neuronal tracé.", "success");
    };

    const savePath = async () => {
        if (generatedPath.length < 5) return;
        await saveTicket({
            numbers: generatedPath,
            drawName,
            strategy: `Neural Path (Origin #${selectedNode})`
        });
        showToast("Chemin sauvegardé dans le Wallet.", "success");
    };

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                        <Network size={24} className="text-indigo-500" /> Architecture Neurale
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">Cartographie gravitationnelle des vecteurs.</p>
                </div>
                <div className="flex items-center gap-4 bg-black/30 p-3 rounded-2xl border border-white/5 w-full md:w-auto">
                    <Sliders size={16} className="text-slate-400" />
                    <div className="flex-1">
                        <div className="flex justify-between text-[9px] font-black uppercase text-slate-500 mb-1">
                            <span>Bruit</span><span>Signal Pur</span>
                        </div>
                        <input type="range" min="0" max="60" step="1" value={minStrength} onChange={(e) => setMinStrength(Number(e.target.value))} className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-indigo-500"/>
                    </div>
                    <span className="text-xs font-bold text-white w-8 text-right">{minStrength}%</span>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 h-[600px] bg-slate-950 rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden group cursor-crosshair">
                    <canvas ref={canvasRef} width={800} height={600} className="w-full h-full touch-none" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}/>
                    <div className="absolute bottom-6 left-6 pointer-events-none">
                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-900/80 px-3 py-1 rounded-full border border-slate-800">
                            <MousePointer2 size={12}/> {selectedNode ? `Nœud ${selectedNode} verrouillé` : 'Survoler / Cliquer'}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4 flex flex-col gap-6">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-lg flex-1 flex flex-col">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Activity size={16} className="text-emerald-500"/> Inspecteur
                        </h4>
                        {selectedNode ? (
                            <div className="space-y-6 animate-slide-up">
                                <div className="text-center">
                                    <div className="inline-block p-4 bg-slate-100 dark:bg-slate-900 rounded-full mb-2">
                                        <NumberBall number={selectedNode} size="lg" selected />
                                    </div>
                                    <div className="text-2xl font-black text-slate-800 dark:text-white">Vecteur {selectedNode}</div>
                                    <div className="text-[10px] font-bold text-indigo-500 uppercase">Nœud Sélectionné</div>
                                </div>
                                <button onClick={generateNeuralPath} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all">
                                    <Zap size={16} fill="currentColor"/> Tracer Chemin Neuronal
                                </button>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40">
                                <Share2 size={48} className="text-slate-400 mb-4"/>
                                <p className="text-xs font-bold text-slate-500">Sélectionnez un nœud sur le graphe pour l'analyser.</p>
                            </div>
                        )}
                    </div>

                    {generatedPath.length > 0 && (
                        <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-indigo-500/30 shadow-2xl relative overflow-hidden animate-slide-up">
                            <div className="absolute top-0 right-0 p-4 opacity-10"><Cpu size={64}/></div>
                            <h4 className="text-xs font-black text-white uppercase tracking-widest mb-4">Séquence Dérivée</h4>
                            <div className="flex justify-center gap-2 mb-6">
                                {generatedPath.map(n => <NumberBall key={n} number={n} size="sm" />)}
                            </div>
                            <button onClick={savePath} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                                <Layers size={14}/> Sauvegarder
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
