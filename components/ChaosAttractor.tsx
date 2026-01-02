
import React, { useEffect, useRef, useMemo } from 'react';
import { DrawResult } from '../types';
import { Layers, Box, Activity } from 'lucide-react';
import { useNexus } from './NexusProvider';

interface ChaosAttractorProps {
    history: DrawResult[];
}

export const ChaosAttractor: React.FC<ChaosAttractorProps> = ({ history }) => {
    const { regime, volatility } = useNexus();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // État de rotation mutable pour l'animation fluide
    const rotationRef = useRef({ x: 0, y: 0 });
    const animationFrameRef = useRef<number | null>(null);

    // Extraction des points 3D (Espace des phases : Somme(t), Somme(t-1), Somme(t-2))
    const points3D = useMemo(() => {
        if (history.length < 3) return [];
        // On utilise la somme des gagnants comme variable d'état simple
        const sums = history.map(d => d.gagnants.reduce((a, b) => a + b, 0));
        const pts = [];
        // Normalisation (Min théorique 15, Max théorique ~400)
        // On centre autour de 0 (-1 à 1)
        const minS = 15, maxS = 300; 
        
        for (let i = 0; i < sums.length - 2; i++) {
            const x = ((sums[i] - minS) / (maxS - minS)) * 2 - 1;
            const y = ((sums[i+1] - minS) / (maxS - minS)) * 2 - 1;
            const z = ((sums[i+2] - minS) / (maxS - minS)) * 2 - 1;
            pts.push({ x, y, z, sum: sums[i] });
        }
        return pts;
    }, [history]);

    // Détermine la couleur en fonction du régime IA
    const getRegimeColor = () => {
        const r = regime?.regime || 'NOMINAL';
        if (r === 'CHAOS') return '#f43f5e'; // Rose-500
        if (r === 'PERSISTANT') return '#6366f1'; // Indigo-500
        if (r === 'ANTI-PERSISTANT') return '#10b981'; // Emerald-500
        return '#94a3b8'; // Slate-400
    };

    const getRotationSpeed = () => {
        const v = volatility?.score || 20;
        // Plus c'est volatile, plus ça tourne vite
        return 0.002 + (v / 100) * 0.015;
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = canvas.width;
        let height = canvas.height;
        const cx = width / 2;
        const cy = height / 2;
        const scale = Math.min(width, height) * 0.35;

        const render = () => {
            // Nettoyage avec traînée pour effet de mouvement
            ctx.fillStyle = 'rgba(15, 23, 42, 0.2)'; // Slate-900 avec opacité
            ctx.fillRect(0, 0, width, height);

            const color = getRegimeColor();
            const speed = getRotationSpeed();

            rotationRef.current.y += speed;
            rotationRef.current.x += speed * 0.5;

            const cosY = Math.cos(rotationRef.current.y);
            const sinY = Math.sin(rotationRef.current.y);
            const cosX = Math.cos(rotationRef.current.x);
            const sinX = Math.sin(rotationRef.current.x);

            points3D.forEach((p, i) => {
                // Rotation Y
                let x1 = p.x * cosY - p.z * sinY;
                let z1 = p.z * cosY + p.x * sinY;
                
                // Rotation X
                let y2 = p.y * cosX - z1 * sinX;
                let z2 = z1 * cosX + p.y * sinX;

                // Projection perspective simple
                const perspective = 2 / (2 + z2);
                const x2D = x1 * scale * perspective + cx;
                const y2D = y2 * scale * perspective + cy;
                const size = Math.max(0.5, 3 * perspective);

                // Dessin du point
                ctx.beginPath();
                ctx.arc(x2D, y2D, size, 0, Math.PI * 2);
                ctx.fillStyle = color;
                // Opacité basée sur la profondeur (z2) pour effet 3D
                ctx.globalAlpha = Math.max(0.1, (z2 + 1) / 2);
                ctx.fill();
                
                // Lier les points récents pour montrer la trajectoire
                if (i > 0 && i < 20) { // Traînée sur les 20 derniers points (récents car history[0] est récent)
                    const prevP = points3D[i-1];
                    // On doit recalculer la projection du point précédent (optimisation possible mais fait ici pour clarté)
                    let px1 = prevP.x * cosY - prevP.z * sinY;
                    let pz1 = prevP.z * cosY + prevP.x * sinY;
                    let py2 = prevP.y * cosX - pz1 * sinX;
                    let pz2 = pz1 * cosX + prevP.y * sinX;
                    const ppersp = 2 / (2 + pz2);
                    const px2D = px1 * scale * ppersp + cx;
                    const py2D = py2 * scale * ppersp + cy;

                    ctx.beginPath();
                    ctx.moveTo(px2D, py2D);
                    ctx.lineTo(x2D, y2D);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 0.5 * perspective;
                    ctx.stroke();
                }
            });
            
            ctx.globalAlpha = 1;
            animationFrameRef.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [points3D, regime, volatility]);

    // Gestion du redimensionnement
    useEffect(() => {
        const resize = () => {
            if (containerRef.current && canvasRef.current) {
                const { clientWidth, clientHeight } = containerRef.current;
                canvasRef.current.width = clientWidth;
                canvasRef.current.height = clientHeight;
            }
        };
        window.addEventListener('resize', resize);
        resize();
        return () => window.removeEventListener('resize', resize);
    }, []);

    return (
        <div className="bg-slate-950 rounded-[2.5rem] p-1 border border-slate-800 shadow-2xl relative overflow-hidden group h-[400px] flex flex-col">
            {/* Header Overlay */}
            <div className="absolute top-6 left-6 z-10 pointer-events-none">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-white/5 rounded-xl border border-white/10 backdrop-blur-md">
                        <Box size={18} className="text-indigo-400" />
                    </div>
                    <div>
                        <h4 className="text-white font-black text-xs uppercase tracking-widest">Attracteur de Phase</h4>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: getRegimeColor() }}></span>
                            <span className="text-[9px] font-mono text-slate-400">
                                {regime?.regime || 'CALIBRATION'} 
                                <span className="opacity-50 mx-1">|</span> 
                                V={volatility?.score || 0}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div ref={containerRef} className="flex-1 w-full h-full relative">
                <canvas ref={canvasRef} className="block w-full h-full cursor-move" />
                <div className="absolute bottom-4 right-4 z-10 pointer-events-none text-right">
                    <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Projection 3D (T, T-1, T-2)</div>
                    <div className="text-[8px] text-slate-700 font-mono">Dynamique non-linéaire</div>
                </div>
            </div>
        </div>
    );
};
