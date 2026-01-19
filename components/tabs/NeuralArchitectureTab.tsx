import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { Network, Zap, Activity, Info, Maximize2, Share2 } from 'lucide-react';
import { NumberBall } from '../NumberBall';

interface Node { id: number; x: number; y: number; vx: number; vy: number; radius: number; color: string; }
interface Link { source: number; target: number; strength: number; }

export const NeuralArchitectureTab: React.FC = () => {
    const { history, correlationMatrix, loading } = useNexus();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hoveredNode, setHoveredNode] = useState<number | null>(null);
    const [activeLinks, setActiveLinks] = useState(0);

    const nodes = useMemo(() => {
        return Array.from({ length: 90 }, (_, i) => ({
            id: i + 1,
            x: Math.random() * 800,
            y: Math.random() * 600,
            vx: 0, vy: 0,
            radius: 8,
            color: '#6366f1'
        }));
    }, []);

    const links = useMemo(() => {
        const l: Link[] = [];
        Object.entries(correlationMatrix).forEach(([srcStr, data]: [string, any]) => {
            const src = parseInt(srcStr);
            Object.entries(data.affinities).forEach(([tgtStr, strength]: [string, any]) => {
                const tgt = parseInt(tgtStr);
                if (strength > 0.18 && src < tgt) {
                    l.push({ source: src, target: tgt, strength });
                }
            });
        });
        return l;
    }, [correlationMatrix]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let frame: number;
        const width = 800;
        const height = 600;

        const run = () => {
            ctx.fillStyle = 'rgba(2, 6, 23, 0.2)';
            ctx.fillRect(0, 0, width, height);

            // 1. Physique simple
            nodes.forEach(n => {
                // Gravité centrale
                n.vx += (width / 2 - n.x) * 0.001;
                n.vy += (height / 2 - n.y) * 0.001;
                
                // Répulsion
                nodes.forEach(n2 => {
                    if (n === n2) return;
                    const dx = n.x - n2.x;
                    const dy = n.y - n2.y;
                    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                    if (dist < 60) {
                        n.vx += (dx / dist) * 0.5;
                        n.vy += (dy / dist) * 0.5;
                    }
                });

                n.vx *= 0.9; n.vy *= 0.9;
                n.x += n.vx; n.y += n.vy;
            });

            // 2. Dessin liens
            ctx.lineWidth = 0.5;
            links.forEach(l => {
                const s = nodes[l.source - 1];
                const t = nodes[l.target - 1];
                const isHighlighted = hoveredNode === l.source || hoveredNode === l.target;
                
                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(t.x, t.y);
                ctx.strokeStyle = isHighlighted ? '#10b981' : `rgba(99, 102, 241, ${l.strength * 0.2})`;
                ctx.stroke();
            });

            // 3. Dessin Noeuds
            nodes.forEach(n => {
                const isHovered = hoveredNode === n.id;
                ctx.beginPath();
                ctx.arc(n.x, n.y, isHovered ? 12 : 4, 0, Math.PI * 2);
                ctx.fillStyle = isHovered ? '#10b981' : '#6366f1';
                ctx.fill();
                if (isHovered) {
                    ctx.font = 'bold 12px Inter';
                    ctx.fillStyle = 'white';
                    ctx.fillText(n.id.toString(), n.x + 15, n.y + 5);
                }
            });

            frame = requestAnimationFrame(run);
        };

        run();
        return () => cancelAnimationFrame(frame);
    }, [nodes, links, hoveredNode]);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-slate-900 rounded-[3rem] p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg"><Network size={24}/></div>
                        <div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tighter">Nexus Synaptic Map</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{links.length} Connexions actives</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-[10px] font-black text-indigo-400 flex items-center gap-2">
                            <Activity size={14} className="animate-pulse" /> SCANNER ACTIF
                        </div>
                    </div>
                </div>

                <div className="bg-black/50 rounded-[2rem] border border-white/5 relative cursor-crosshair h-[500px]">
                    <canvas 
                        ref={canvasRef} 
                        width={800} height={500} 
                        className="w-full h-full"
                        onMouseMove={(e) => {
                            const rect = canvasRef.current?.getBoundingClientRect();
                            if (!rect) return;
                            const x = e.clientX - rect.left;
                            const y = e.clientY - rect.top;
                            const hit = nodes.find(n => Math.sqrt((n.x-x)**2 + (n.y-y)**2) < 20);
                            setHoveredNode(hit ? hit.id : null);
                        }}
                    />
                </div>

                <div className="mt-6 flex gap-4">
                    <div className="flex-1 p-4 bg-white/5 rounded-2xl border border-white/5 flex items-start gap-3">
                        <Info size={16} className="text-indigo-400 mt-1" />
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                            Cette carte représente la structure neurale du tirage. Les lignes indiquent des paires de numéros qui sortent statistiquement ensemble (Synergies). Plus la toile est dense, plus le jeu est prévisible.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};