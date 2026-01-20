
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { Network, Search, X, Activity, Info, TrendingUp, Cpu, Target } from 'lucide-react';
import { NumberBall } from '../NumberBall';

interface Node { id: number; x: number; y: number; vx: number; vy: number; radius: number; color: string; mass: number; }
interface Link { source: number; target: number; strength: number; }

export const NeuralArchitectureTab: React.FC = () => {
    const { history, correlationMatrix, loading } = useNexus();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hoveredNode, setHoveredNode] = useState<number | null>(null);
    const [selectedNode, setSelectedNode] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

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

    // Extraction des liens de synergie significatifs (> 0.20)
    const links = useMemo(() => {
        const l: Link[] = [];
        Object.entries(correlationMatrix).forEach(([srcStr, data]: [string, any]) => {
            const src = parseInt(srcStr);
            Object.entries(data.affinities).forEach(([tgtStr, strength]: [string, any]) => {
                const tgt = parseInt(tgtStr);
                if (strength > 0.20 && src < tgt) {
                    l.push({ source: src, target: tgt, strength: Number(strength) });
                }
            });
        });
        return l.sort((a, b) => b.strength - a.strength);
    }, [correlationMatrix]);

    const topBinomials = useMemo(() => links.slice(0, 6), [links]);

    const handleSearch = (val: string) => {
        setSearchQuery(val);
        const num = parseInt(val);
        if (!isNaN(num) && num >= 1 && num <= 90) {
            setSelectedNode(num);
        } else if (val === '') {
            setSelectedNode(null);
        }
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let frame: number;
        const width = canvas.width;
        const height = canvas.height;

        const run = () => {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);

            // Grille technique de fond
            ctx.strokeStyle = '#f8fafc';
            ctx.lineWidth = 1;
            for(let i=0; i<width; i+=40) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
            }
            for(let i=0; i<height; i+=40) {
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
            }

            // Physique de force-direction simplifiée
            nodes.forEach(n => {
                n.vx += (width / 2 - n.x) * 0.002;
                n.vy += (height / 2 - n.y) * 0.002;
                
                nodes.forEach(n2 => {
                    if (n === n2) return;
                    const dx = n.x - n2.x;
                    const dy = n.y - n2.y;
                    const distSq = dx*dx + dy*dy || 1;
                    if (distSq < 3000) {
                        const force = 0.6;
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
                
                const isRelatedToSelection = selectedNode === null || l.source === selectedNode || l.target === selectedNode;
                const isHov = hoveredNode === l.source || hoveredNode === l.target;

                if (!isRelatedToSelection && !isHov) return;

                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(t.x, t.y);
                ctx.lineWidth = l.strength * (isHov || (selectedNode && isRelatedToSelection) ? 6 : 2);
                ctx.strokeStyle = isHov ? '#10b981' : (selectedNode ? 'rgba(99, 102, 241, 0.8)' : 'rgba(99, 102, 241, 0.1)');
                ctx.stroke();
            });

            // Dessin des Nœuds
            nodes.forEach(n => {
                const isSelected = selectedNode === n.id;
                const isHovered = hoveredNode === n.id;
                const hasLinksToSelected = selectedNode ? links.some(l => (l.source === selectedNode && l.target === n.id) || (l.target === selectedNode && l.source === n.id)) : true;

                let alpha = 1;
                if (selectedNode && !isSelected && !hasLinksToSelected) alpha = 0.1;

                ctx.globalAlpha = alpha;
                ctx.beginPath();
                const radius = isSelected ? 14 : isHovered ? 10 : 5;
                ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
                ctx.fillStyle = isSelected ? '#4f46e5' : isHovered ? '#10b981' : '#cbd5e1';
                
                if (isSelected) {
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = 'rgba(79, 70, 229, 0.5)';
                }
                
                ctx.fill();
                ctx.shadowBlur = 0;
                
                if (isSelected || isHovered || (selectedNode && hasLinksToSelected)) {
                    ctx.font = `bold ${isSelected ? '12px' : '9px'} Inter`;
                    ctx.fillStyle = isSelected ? '#1e293b' : '#64748b';
                    ctx.textAlign = 'center';
                    ctx.fillText(n.id.toString(), n.x, n.y - (radius + 5));
                }
                ctx.globalAlpha = 1;
            });

            frame = requestAnimationFrame(run);
        };

        run();
        return () => cancelAnimationFrame(frame);
    }, [nodes, links, hoveredNode, selectedNode]);

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Header avec Barre de Recherche */}
            <div className="bg-slate-900 rounded-[2.5rem] p-6 md:p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5"><Network size={120}/></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="text-center md:text-left">
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Cartographie des Liaisons</h3>
                        <p className="text-slate-400 text-xs font-medium max-w-xl leading-relaxed">
                            Visualisez les "familles de numéros". Identifiez les vecteurs qui sortent historiquement ensemble.
                        </p>
                    </div>
                    
                    {/* Barre de Recherche Industrielle */}
                    <div className="relative w-full md:w-64 group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                        </div>
                        <input
                            type="number"
                            min="1" max="90"
                            placeholder="Isoler un numéro (1-90)..."
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                            className="block w-full pl-11 pr-10 py-4 bg-black/40 border border-slate-700 rounded-2xl text-xs font-bold text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all appearance-none"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => { setSearchQuery(''); setSelectedNode(null); }}
                                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-white transition-colors"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Canevas Principal */}
                <div className="lg:col-span-8 bg-white rounded-[3rem] border border-slate-200 shadow-xl overflow-hidden relative group h-[600px]">
                    <div className="absolute top-6 left-6 z-10 flex flex-col gap-3">
                        <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase border border-indigo-100 flex items-center gap-2 shadow-sm">
                            <Activity size={10} className="animate-pulse" /> Scanner de Synergie Actif
                        </div>
                        {selectedNode && (
                            <div className="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[9px] font-black uppercase border border-rose-100 flex items-center gap-2 shadow-sm animate-slide-up">
                                <Target size={10} /> Focus : Vecteur {selectedNode}
                            </div>
                        )}
                    </div>

                    <canvas 
                        ref={canvasRef} 
                        width={800} height={600} 
                        className="w-full h-full cursor-crosshair touch-none"
                        onMouseMove={(e) => {
                            const rect = canvasRef.current?.getBoundingClientRect();
                            if (!rect) return;
                            const x = (e.clientX - rect.left) * (800 / rect.width);
                            const y = (e.clientY - rect.top) * (600 / rect.height);
                            const hit = nodes.find(n => Math.sqrt((n.x-x)**2 + (n.y-y)**2) < 20);
                            setHoveredNode(hit ? hit.id : null);
                        }}
                        onClick={() => {
                            if (hoveredNode) {
                                setSelectedNode(hoveredNode);
                                setSearchQuery(hoveredNode.toString());
                            } else {
                                setSelectedNode(null);
                                setSearchQuery('');
                            }
                        }}
                    />
                    
                    {/* Watermark */}
                    <div className="absolute bottom-6 right-8 opacity-20 pointer-events-none flex items-center gap-2">
                        <Cpu size={14}/> <span className="text-[9px] font-black uppercase tracking-widest">Nexus Core Graphics</span>
                    </div>
                </div>

                {/* Sidebar d'Interprétation */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-lg">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Info size={14} className="text-indigo-500"/> Guide de lecture
                        </h4>
                        <div className="space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="w-4 h-4 rounded-full bg-indigo-600 mt-1 shadow-lg shadow-indigo-500/30"></div>
                                <div className="text-[11px] text-slate-600 font-medium leading-relaxed"><strong>Liens Épais</strong> : Représentent des numéros "binômes" qui ont une probabilité de sortie conjointe élevée.</div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-4 h-4 rounded-full bg-slate-200 mt-1"></div>
                                <div className="text-[11px] text-slate-600 font-medium leading-relaxed"><strong>Nœuds Isolés</strong> : Indiquent des numéros dont les sorties ne dépendent d'aucun pattern de co-occurrence identifié.</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-xl flex-1">
                        <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <TrendingUp size={14}/> Binômes Dominants
                        </h4>
                        <div className="space-y-3">
                            {topBinomials.map((link, i) => (
                                <div 
                                    key={i} 
                                    onClick={() => { setSelectedNode(link.source); setSearchQuery(link.source.toString()); }}
                                    className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5 group hover:border-emerald-500/50 transition-all cursor-pointer"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex -space-x-2">
                                            <NumberBall number={link.source} size="sm" />
                                            <NumberBall number={link.target} size="sm" />
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-300">Paire Alpha {i+1}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-black text-emerald-400">{Math.round(link.strength * 100)}%</div>
                                        <div className="text-[8px] font-bold text-slate-500 uppercase">Affinité</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-6 p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                            <p className="text-[9px] text-indigo-300 font-medium italic leading-relaxed">
                                "Conseil Elite : Une synergie &gt; 40% indique une dépendance structurelle forte. Jouer ces numéros séparément réduit vos chances mathématiques."
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
