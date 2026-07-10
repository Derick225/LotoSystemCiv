
import React from 'react';
import { getNumberColor } from '../constants';

interface DrawTopologyProps {
    winners: number[];
    machine?: number[];
    size?: 'sm' | 'md' | 'lg';
}

export const DrawTopology: React.FC<DrawTopologyProps> = React.memo(({ winners, machine = [], size = 'sm' }) => {
    const winnerSet = new Set(winners);
    const machineSet = new Set(machine);
    const sortedWinners = [...winners].sort((a, b) => a - b);

    // Taille des cellules
    const cellSize = size === 'sm' ? 12 : size === 'md' ? 24 : 36;
    const gapSize = 2;
    const totalSize = (cellSize + gapSize) * 10;

    // Helper pour obtenir les coordonnées X,Y d'un numéro
    const getCoords = (num: number) => {
        const index = num - 1;
        const col = index % 10;
        const row = Math.floor(index / 10);
        return {
            x: col * (cellSize + gapSize) + cellSize / 2,
            y: row * (cellSize + gapSize) + cellSize / 2
        };
    };

    // Construction du chemin SVG reliant les gagnants
    const getPathData = () => {
        if (sortedWinners.length < 2) return "";
        return sortedWinners.map((num, i) => {
            const { x, y } = getCoords(num);
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(" ");
    };

    return (
        <div className="relative inline-block bg-slate-900 p-3 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden group">
            {/* Grille de fond */}
            <div 
                className="grid grid-cols-10 gap-[2px] relative z-10"
                style={{ width: `${totalSize}px` }}
            >
                {Array.from({ length: 90 }, (_, i) => i + 1).map(num => {
                    const isWinner = winnerSet.has(num);
                    const isMachine = machineSet.has(num);
                    const colorClass = getNumberColor(num);

                    return (
                        <div 
                            key={num} 
                            style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                            className={`
                                rounded-[2px] transition-all duration-500
                                ${isWinner && isMachine ? 'bg-white ring-4 ring-yellow-400 z-30 scale-125' : 
                                  isWinner ? `${colorClass} shadow-lg z-20 scale-110 ring-1 ring-white/20` : 
                                  isMachine ? 'bg-slate-700/50 border border-dashed border-slate-500' : 'bg-slate-800/40'}
                            `}
                        ></div>
                    );
                })}
            </div>

            {/* Couche Vectorielle (Tracé du Tirage) */}
            <svg 
                className="absolute inset-0 pointer-events-none z-15"
                style={{ width: '100%', height: '100%', padding: '12px' }}
                viewBox={`0 0 ${totalSize} ${totalSize * 0.9}`}
            >
                <path 
                    d={getPathData()} 
                    fill="none" 
                    stroke="rgba(255,255,255,0.15)" 
                    strokeWidth="1.5" 
                    strokeDasharray="4 2"
                    className="group-hover:stroke-indigo-400/40 transition-colors duration-300"
                />
                {sortedWinners.map(num => {
                    const { x, y } = getCoords(num);
                    return (
                        <circle 
                            key={`aura-${num}`}
                            cx={x} cy={y} r={cellSize * 0.8}
                            fill="url(#glowGradient)"
                            className="animate-pulse opacity-20"
                        />
                    );
                })}
                <defs>
                    <radialGradient id="glowGradient">
                        <stop offset="0%" stopColor="white" />
                        <stop offset="100%" stopColor="transparent" />
                    </radialGradient>
                </defs>
            </svg>
        </div>
    );
});
