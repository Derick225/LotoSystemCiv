import React, { useMemo, useState } from 'react';
import { DrawResult } from '../types';
import { Network, Link2 } from 'lucide-react';

interface CoOccurrenceGraphProps {
    history: DrawResult[];
}

export const CoOccurrenceGraph: React.FC<CoOccurrenceGraphProps> = ({ history }) => {
    const [hoveredNode, setHoveredNode] = useState<number | null>(null);

    // 1. Calculer les paires (Co-occurrences)
    const { nodes, links, maxCount } = useMemo(() => {
        if (!history || history.length === 0) return { nodes: [], links: [], maxCount: 0 };

        const pairCounts = new Map<string, number>();
        const nodeFreq = new Map<number, number>();

        history.forEach(draw => {
            const nums = [...draw.gagnants].sort((a, b) => a - b);
            nums.forEach(n => nodeFreq.set(n, (nodeFreq.get(n) || 0) + 1));

            for (let i = 0; i < nums.length; i++) {
                for (let j = i + 1; j < nums.length; j++) {
                    const key = `${nums[i]}-${nums[j]}`;
                    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
                }
            }
        });

        // Prendre les 40 paires les plus fréquentes
        const sortedPairs = Array.from(pairCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 40);

        if (sortedPairs.length === 0) return { nodes: [], links: [], maxCount: 0 };

        const maxC = sortedPairs[0][1];

        // Extraire les nœuds uniques de ces paires
        const nodeSet = new Set<number>();
        const formattedLinks = sortedPairs.map(([key, count]) => {
            const [source, target] = key.split('-').map(Number);
            nodeSet.add(source);
            nodeSet.add(target);
            return { source, target, count };
        });

        const formattedNodes = Array.from(nodeSet)
            .sort((a, b) => a - b)
            .map(id => ({
                id,
                freq: nodeFreq.get(id) || 0
            }));

        return { nodes: formattedNodes, links: formattedLinks, maxCount: maxC };
    }, [history]);

    if (nodes.length === 0) return null;

    // Paramètres géométriques
    const size = 400;
    const center = size / 2;
    const radius = size * 0.4; // 40% de la taille pour laisser de la place aux labels

    // Calculer les positions des nœuds
    const nodePositions = useMemo(() => {
        const pos = new Map<number, { x: number, y: number, angle: number }>();
        nodes.forEach((node, i) => {
            const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
            pos.set(node.id, {
                x: center + radius * Math.cos(angle),
                y: center + radius * Math.sin(angle),
                angle
            });
        });
        return pos;
    }, [nodes, center, radius]);

    return (
        <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[2.2rem] md:rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden flex flex-col items-center">
            <div className="absolute top-0 left-0 p-4 opacity-5 pointer-events-none"><Network size={120} /></div>
            
            <div className="w-full flex flex-col md:flex-row justify-between items-start md:items-center mb-8 relative z-10">
                <div>
                    <h4 className="text-xs md:text-sm font-black text-slate-800 dark:text-white flex items-center gap-2 uppercase tracking-widest mb-1">
                        <Network className="text-fuchsia-500" size={18}/> Graphe de Symbiose
                    </h4>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Analyse Combinatoire (Top 40 Paires)</p>
                </div>
                
                {hoveredNode && (
                    <div className="mt-4 md:mt-0 px-4 py-2 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-xl flex items-center gap-3 animate-fade-in">
                        <div className="w-8 h-8 rounded-full bg-fuchsia-500 text-white flex items-center justify-center font-black text-xs shadow-[0_0_15px_rgba(217,70,239,0.4)]">
                            {hoveredNode}
                        </div>
                        <div className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-widest">
                            Connexions Fortes : {links.filter(l => l.source === hoveredNode || l.target === hoveredNode).length}
                        </div>
                    </div>
                )}
            </div>

            <div className="relative w-full max-w-[500px] aspect-square">
                <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full overflow-visible">
                    <defs>
                        <filter id="glow-link" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="2" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                    </defs>

                    {/* Liens (Edges) */}
                    {links.map((link, i) => {
                        const sourcePos = nodePositions.get(link.source);
                        const targetPos = nodePositions.get(link.target);
                        if (!sourcePos || !targetPos) return null;

                        const isHovered = hoveredNode === link.source || hoveredNode === link.target;
                        const isDimmed = hoveredNode !== null && !isHovered;
                        
                        // Intensité basée sur le compte
                        const intensity = link.count / maxCount;
                        const strokeWidth = 1 + intensity * 4;
                        const opacity = isDimmed ? 0.05 : (isHovered ? 0.8 : 0.2 + intensity * 0.4);
                        const color = isHovered ? '#d946ef' : '#6366f1'; // Fuchsia si survolé, Indigo sinon

                        // Courbe quadratique passant par le centre pour un effet "toile d'araignée"
                        // On décale légèrement le point de contrôle du centre pour éviter que toutes les lignes ne se croisent exactement au même pixel
                        const controlX = center + (sourcePos.x + targetPos.x - 2 * center) * 0.2;
                        const controlY = center + (sourcePos.y + targetPos.y - 2 * center) * 0.2;

                        return (
                            <path
                                key={`link-${i}`}
                                d={`M ${sourcePos.x} ${sourcePos.y} Q ${controlX} ${controlY} ${targetPos.x} ${targetPos.y}`}
                                fill="none"
                                stroke={color}
                                strokeWidth={strokeWidth}
                                strokeOpacity={opacity}
                                className="transition-all duration-300"
                                filter={isHovered ? "url(#glow-link)" : ""}
                            />
                        );
                    })}

                    {/* Nœuds (Nodes) */}
                    {nodes.map((node) => {
                        const pos = nodePositions.get(node.id);
                        if (!pos) return null;

                        const isHovered = hoveredNode === node.id;
                        const isConnected = hoveredNode !== null && links.some(l => (l.source === hoveredNode && l.target === node.id) || (l.target === hoveredNode && l.source === node.id));
                        const isDimmed = hoveredNode !== null && !isHovered && !isConnected;

                        // Taille du nœud basée sur sa fréquence globale
                        const nodeRadius = 12 + (node.freq / 10);

                        return (
                            <g 
                                key={`node-${node.id}`}
                                transform={`translate(${pos.x}, ${pos.y})`}
                                onMouseEnter={() => setHoveredNode(node.id)}
                                onMouseLeave={() => setHoveredNode(null)}
                                className="cursor-pointer transition-all duration-300"
                                style={{ opacity: isDimmed ? 0.3 : 1 }}
                            >
                                <circle
                                    r={nodeRadius}
                                    fill={isHovered ? '#d946ef' : (isConnected ? '#8b5cf6' : '#1e293b')}
                                    stroke={isHovered ? '#fdf4ff' : '#334155'}
                                    strokeWidth={isHovered ? 2 : 1}
                                    className="transition-colors duration-300"
                                    filter={isHovered || isConnected ? "url(#glow-link)" : ""}
                                />
                                <text
                                    textAnchor="middle"
                                    dy=".3em"
                                    fill="#ffffff"
                                    fontSize={isHovered ? "12px" : "10px"}
                                    fontWeight="900"
                                    className="pointer-events-none transition-all duration-300"
                                >
                                    {node.id}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
            
            <div className="mt-6 flex items-center gap-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#1e293b] border border-slate-500"></div> Nœud Standard</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#8b5cf6]"></div> Symbiote Connecté</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#d946ef] shadow-[0_0_5px_#d946ef]"></div> Nœud Actif</div>
            </div>
        </div>
    );
};
