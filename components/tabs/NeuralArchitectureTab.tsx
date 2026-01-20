
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { Network, Zap, Activity, Info, Maximize2, Share2, Target, Link as LinkIcon, TrendingUp } from 'lucide-react';
import { NumberBall } from '../NumberBall';

interface Node { id: number; x: number; y: number; vx: number; vy: number; radius: number; color: string; mass: number; }
interface Link { source: number; target: number; strength: number; }

export const NeuralArchitectureTab: React.FC = () => {
    const { history, correlationMatrix, loading } = useNexus();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hoveredNode, setHoveredNode] = useState<number | null>(null);
    const [selectedNode, setSelectedNode] = useState<number | null>(null);

    // Initialisation des nœuds (1-90)
    const nodes = useMemo(() => {
        return Array.from({ length: 90 }, (_, i) => ({
            id: i + 1,
            x: Math.random() * 800,
            y: Math.random() * 600,
            vx: 0, vy: 0,
            radius: 6,
            color: '#4f46e5',
            mass: 1
        }));
    }, []);

    // Extraction des liens de synergie les plus forts
    const links = useMemo(() => {
        const l: Link[] = [];
        Object.entries(correlationMatrix).forEach(([srcStr, data]: [string, any]) => {
            const src = parseInt(srcStr);
            Object.entries(data.affinities).forEach(([tgtStr, strength]: [string, any]) => {
                const tgt = parseInt(tgtStr);
                // On ne garde que les synergies significatives (> 0.20)
                if (strength > 0.20 && src < tgt) {
                    l.push({ source: src, target: tgt, strength: Number(strength) });
                }
            });
        });
        return l.sort((a, b) => b.strength - a.strength);
    }, [correlationMatrix]);

    // Top 5 des Binômes (Les plus fortes connexions)
    const topBinomials = useMemo(() => links.slice(0, 6), [links]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let frame: number;
        const width = canvas.width;
        const height = canvas.height;

        const run = () => {
            // FOND BLANC HAUT CONTRASTE
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);

            // Grille technique subtile
            ctx.strokeStyle = '#f1f5f9';
            ctx.lineWidth = 1;
            for(let i=0; i<width; i+=40) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
            }
            for(let i=0; i<height; i+=40) {
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
            }

            // Physique de force-direction
            nodes.forEach(n => {
                n.vx += (width / 2 - n.x) * 0.002;
                n.vy += (height / 2 - n.y) * 0.002;
                
                nodes.forEach(n2 => {
                    if (n === n2) return;
                    const dx = n.x - n2.x;
                    const dy = n.y - n2.y;
                    const distSq = dx*dx + dy*dy || 1;
                    if (distSq < 2500) {
                        const force = 0.8;
                        n.vx += (dx / Math.sqrt(distSq)) * force;
                        n.vy += (dy / Math.sqrt(distSq)) * force;
                    }
                });

                n.vx *= 0.85; n.vy *= 0.85;
                n.x += n.vx; n.y += n.vy;
            });

            // Dessin des Liens (Synergies)
            links.forEach(l => {
                const s = nodes[l.source - 1];
                const t = nodes[l.target - 1];
                
                const isRel = selectedNode === null || l.source === selectedNode || l.target === selectedNode;
                const isHov = hoveredNode === l.source || hoveredNode === l.target;

                if (!isRel && !isHov) return;

                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(t.x, t.y);
                ctx.lineWidth = l.strength * 4;
                ctx.strokeStyle = isHov ? '#10b981' : (selectedNode ? '#6366f1' : 'rgba(99, 102, 241, 0.15)');
                ctx.stroke();
            });

            // Dessin des Nœuds (Numéros)
            nodes.forEach(n => {
                const isSelected = selectedNode === n.id;
                const isHovered = hoveredNode === n.id;
                const hasLinks = links.some(l => l.source === n.id || l.target === n.id);

                if (!hasLinks && selectedNode !== null && !isSelected) return;

                ctx.beginPath();
                ctx.arc(n.x, n.y, (isSelected || isHovered) ? 12 : 5, 0, Math.PI * 2);
                ctx.fillStyle = isHovered ? '#10b981' : (isSelected ? '#6366f1' : '#cbd5e1');
                ctx.fill();
                
                if (isSelected || isHovered) {
                    ctx.font = 'bold 11px Inter';
                    ctx.fillStyle = '#1e293b';
                    ctx.textAlign = 'center';
                    ctx.fillText(n.id.toString(), n.x, n.y - 15);
                }
            });

            frame = requestAnimationFrame(run);
        };

        run();
        return () => cancelAnimationFrame(frame);
    }, [nodes, links, hoveredNode, selectedNode]);

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Header explicatif */}
            <div className="bg-slate-900 rounded-[2.5rem] p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5"><Network size={120}/></div>
                <div className="relative z-10">
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Architecture des Liaisons</h3>
                    <p className="text-slate-400 text-xs font-medium max-w-2xl leading-relaxed">
                        Cette carte identifie les **familles de numéros**. Si deux numéros sont reliés par un trait, cela signifie qu'ils ont une forte tendance historique à apparaître ensemble dans le même tirage.
                    </p>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Canevas Principal - FOND BLANC */}
                <div className="lg:col-span-8 bg-white rounded-[3rem] border border-slate-200 shadow-xl overflow-hidden relative group h-[600px]">
                    <div className="absolute top-6 left-6 z-10 flex gap-2">
                        <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase border border-indigo-100 flex items-center gap-2">
                            <Activity size={10} className="animate-pulse" /> Scanner de Co-occurrence
                        </div>
                    </div>

                    <canvas 
                        ref={canvasRef} 
                        width={800} height={600} 
                        className="w-full h-full cursor-crosshair"
                        onMouseMove={(e) => {
                            const rect = canvasRef.current?.getBoundingClientRect();
                            if (!rect) return;
                            const x = (e.clientX - rect.left) * (800 / rect.width);
                            const y = (e.clientY - rect.top) * (600 / rect.height);
                            const hit = nodes.find(n => Math.sqrt((n.x-x)**2 + (n.y-y)**2) < 20);
                            setHoveredNode(hit ? hit.id : null);
                        }}
                        onClick={() => setSelectedNode(hoveredNode)}
                    />

                    {selectedNode && (
                        <div className="absolute bottom-6 left-6 p-4 bg-slate-900 text-white rounded-2xl shadow-2xl animate-slide-up border border-indigo-500/30 flex items-center gap-4">
                            <NumberBall number={selectedNode} size="sm" glow />
                            <div>
                                <div className="text-[10px] font-black text-indigo-400 uppercase">Focus Isolé</div>
                                <div className="text-xs font-bold">Vecteur {selectedNode} & ses alliés</div>
                            </div>
                            <button onClick={() => setSelectedNode(null)} className="ml-2 p-1 hover:bg-white/10 rounded-lg"><Share2 size={14}/></button>
                        </div>
                    )}
                </div>

                {/* Panneau d'Interprétation */}
                <div className="lg:col-span-4 space-y-6">
                    {/* Légende Pédagogique */}
                    <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-lg">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Info size={14} className="text-indigo-500"/> Guide de lecture
                        </h4>
                        <div className="space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="w-4 h-4 rounded-full bg-indigo-600 mt-1"></div>
                                <div className="text-[11px] text-slate-600 font-medium"><strong>Liens épais</strong> : Ces numéros sont statistiquement "inséparables".</div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-4 h-4 rounded-full bg-slate-200 mt-1"></div>
                                <div className="text-[11px] text-slate-600 font-medium"><strong>Zones vides</strong> : Indiquent des numéros qui sortent de manière isolée ou aléatoire.</div>
                            </div>
                        </div>
                    </div>

                    {/* Recommandations Textuelles (Les Binômes) */}
                    <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-xl flex-1">
                        <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <TrendingUp size={14}/> Binômes de Synergie
                        </h4>
                        <div className="space-y-3">
                            {topBinomials.length > 0 ? topBinomials.map((link, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5 group hover:border-emerald-500/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="flex -space-x-2">
                                            <NumberBall number={link.source} size="sm" />
                                            <NumberBall number={link.target} size="sm" />
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-300">Paire {i+1}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-black text-emerald-400">{Math.round(link.strength * 100)}%</div>
                                        <div className="text-[8px] font-bold text-slate-500 uppercase">Affinité</div>
                                    </div>
                                </div>
                            )) : (
                                <div className="py-10 text-center text-slate-500 text-[10px] italic font-medium">Calcul des liaisons en cours...</div>
                            )}
                        </div>
                        <div className="mt-6 p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                            <p className="text-[9px] text-indigo-300 font-medium italic leading-relaxed">
                                "Conseil Platinum : Jouer l'un des binômes ci-dessus augmente vos chances de 'doubler' vos gains si l'un des deux numéros est déjà dans votre sélection."
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
