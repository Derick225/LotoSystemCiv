
import React, { useMemo } from 'react';
import { DrawResult } from '../types';
import { Wind, AlertTriangle, ShieldCheck, Gauge, Compass, Activity } from 'lucide-react';
import { useNexusStore } from '../store/useNexusStore';

interface ChaosAttractorProps {
    history: DrawResult[];
}

export const ChaosAttractor: React.FC<ChaosAttractorProps> = React.memo(({ history }) => {
    const regime = useNexusStore(state => state.regime);
    const volatility = useNexusStore(state => state.volatility);
    
    const turbulence = volatility?.score || 50;
    const weylDiscrepancy = regime?.weylDiscrepancy ?? 0.18;
    const chaosDimension = regime?.chaosDimension ?? 1.84;
    
    const status = useMemo(() => {
        if (turbulence > 75) return { 
            label: "TEMPÊTE (Hasard pur)", 
            color: "text-rose-500", 
            border: "border-rose-500/25",
            bg: "bg-rose-500/10",
            desc: "Le jeu est imprévisible. Évitez les grosses mises.",
            icon: <AlertTriangle className="text-rose-500" size={24} />
        };
        if (turbulence > 40) return { 
            label: "BRÈSE (Variable)", 
            color: "text-indigo-400", 
            border: "border-indigo-500/25",
            bg: "bg-indigo-500/10",
            desc: "Le jeu alterne entre logique et surprise.",
            icon: <Wind className="text-indigo-400" size={24} />
        };
        return { 
            label: "CALME (Régularité)", 
            color: "text-emerald-500", 
            border: "border-emerald-500/25",
            bg: "bg-emerald-500/10",
            desc: "Les patterns historiques sont respectés. Idéal pour l'IA.",
            icon: <ShieldCheck className="text-emerald-500" size={24} />
        };
    }, [turbulence]);

    // 2D Phase-Space Trajectory reconstruction: X = Sum(t-1), Y = Sum(t)
    const trajectoryPoints = useMemo(() => {
        if (!history || history.length < 6) return [];
        
        // Take chronologically ordered elements from the past 20 draws
        const lastDraws = history.slice(0, 20).reverse();
        const sums = lastDraws.map(d => d.gagnants.reduce((a, b) => a + b, 0));
        
        let minSum = Infinity;
        let maxSum = -Infinity;
        for (const s of sums) {
            if (s < minSum) minSum = s;
            if (s > maxSum) maxSum = s;
        }
        
        // Handle constant sums if there's zero variance
        if (maxSum === minSum) {
            minSum = 15;
            maxSum = 440;
        }
        
        const pts: { x: number; y: number; valX: number; valY: number }[] = [];
        for (let i = 1; i < sums.length; i++) {
            const valX = sums[i - 1];
            const valY = sums[i];
            
            // Map to a 200x200 coordinate space inside a 200x200 box with 25px margins
            const x = 25 + ((valX - minSum) / (maxSum - minSum || 1)) * 150;
            const y = 175 - ((valY - minSum) / (maxSum - minSum || 1)) * 150; // Inverted Y axis
            
            pts.push({ x, y, valX, valY });
        }
        return pts;
    }, [history]);

    // Construct the SVG path string
    const pathD = useMemo(() => {
        if (trajectoryPoints.length < 2) return '';
        return trajectoryPoints.reduce((acc, p, i) => {
            return acc + `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        }, '');
    }, [trajectoryPoints]);

    return (
        <div className="bg-slate-950 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-900 pb-4">
                <div className="flex items-center gap-3">
                    <Gauge size={16} className="text-indigo-400" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Attracteur de Phase 2D</span>
                </div>
                <div className={`px-2.5 py-1 rounded-full text-[9px] font-bold ${status.bg} ${status.color} border ${status.border} flex items-center gap-1.5`}>
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current"></span>
                    </span>
                    {status.label}
                </div>
            </div>

            {/* Trajectory Phase Space Canvas Container */}
            <div className="relative flex justify-center bg-slate-950 rounded-2xl border border-slate-900/60 p-4 shadow-inner overflow-hidden">
                <div className="absolute top-2 left-2 text-[8px] font-bold text-slate-500 font-mono">
                    Y : Somme(t)
                </div>
                <div className="absolute bottom-2 right-2 text-[8px] font-bold text-slate-500 font-mono">
                    X : Somme(t-1)
                </div>

                {trajectoryPoints.length >= 2 ? (
                    <svg width="200" height="200" className="opacity-90">
                        {/* Phase Space Grid lines */}
                        <line x1="25" y1="25" x2="25" y2="175" stroke="#1e293b" strokeWidth="1" strokeDasharray="2,2" />
                        <line x1="25" y1="175" x2="175" y2="175" stroke="#1e293b" strokeWidth="1" strokeDasharray="2,2" />
                        
                        {/* Trajectory Path */}
                        <path 
                            d={pathD} 
                            fill="none" 
                            stroke="url(#attractor-gradient)" 
                            strokeWidth="1.5" 
                            className="stroke-pulse"
                        />
                        
                        {/* Definition Gradient */}
                        <defs>
                            <linearGradient id="attractor-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.4" />
                                <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.75" />
                                <stop offset="100%" stopColor="#22c55e" stopOpacity="1" />
                            </linearGradient>
                        </defs>

                        {/* Trajectory nodes */}
                        {trajectoryPoints.map((p, idx) => {
                            const isLast = idx === trajectoryPoints.length - 1;
                            return (
                                <g key={idx}>
                                    <circle 
                                        cx={p.x} 
                                        cy={p.y} 
                                        r={isLast ? 4 : 2} 
                                        fill={isLast ? "#22c55e" : "#4f46e5"} 
                                        opacity={isLast ? 1 : 0.4 + (idx / trajectoryPoints.length) * 0.4}
                                    />
                                    {isLast && (
                                        <circle 
                                            cx={p.x} 
                                            cy={p.y} 
                                            r="8" 
                                            fill="none" 
                                            stroke="#22c55e" 
                                            strokeWidth="1" 
                                            className="animate-ping"
                                        />
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                ) : (
                    <div className="h-48 flex items-center justify-center text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                        Données insuffisantes...
                    </div>
                )}
            </div>

            {/* Advanced Invariant Statistics */}
            <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="bg-slate-900/40 border border-slate-900 p-3.5 rounded-xl flex items-center gap-3">
                    <Compass size={18} className="text-indigo-400 shrink-0" />
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">Weyl Modulaire</div>
                        <div className="text-sm font-black font-mono text-slate-200 mt-1">{weylDiscrepancy.toFixed(4)}</div>
                    </div>
                </div>

                <div className="bg-slate-900/40 border border-slate-900 p-3.5 rounded-xl flex items-center gap-3">
                    <Activity size={18} className="text-violet-400 shrink-0" />
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">Attracteur GP ν</div>
                        <div className="text-sm font-black font-mono text-slate-200 mt-1">{chaosDimension.toFixed(3)}</div>
                    </div>
                </div>
            </div>

            {/* Turbulence Meter Slider */}
            <div className="space-y-2 pt-2 border-t border-slate-900">
                <div className="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    <span>Stabilité du Flux</span>
                    <span className="font-mono text-slate-200">{turbulence.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div 
                        className="h-full transition-all duration-1000"
                        style={{ 
                            width: `${Math.min(100, Math.max(0, turbulence))}%`,
                            backgroundColor: `hsl(${120 - Math.min(100, turbulence) * 1.2}, 80%, 50%)`
                        }}
                    ></div>
                </div>
                <p className="text-[10px] text-slate-500 font-medium">
                    {status.desc}
                </p>
            </div>
        </div>
    );
});

