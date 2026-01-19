
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
    
    const rotationRef = useRef({ x: 0, y: 0 });
    const animationFrameRef = useRef<number | null>(null);

    const points3D = useMemo(() => {
        if (history.length < 3) return [];
        const sums = history.map(d => d.gagnants.reduce((a, b) => a + b, 0));
        const pts = [];
        const minS = 15, maxS = 300; 
        
        for (let i = 0; i < Math.min(sums.length - 2, 60); i++) {
            const x = ((sums[i] - minS) / (maxS - minS)) * 2 - 1;
            const y = ((sums[i+1] - minS) / (maxS - minS)) * 2 - 1;
            const z = ((sums[i+2] - minS) / (maxS - minS)) * 2 - 1;
            pts.push({ x, y, z, sum: sums[i] });
        }
        return pts;
    }, [history]);

    const getRegimeColor = () => {
        const r = regime?.regime || 'NOMINAL';
        if (r === 'CHAOS') return '#f43f5e';
        if (r === 'PERSISTANT') return '#6366f1';
        if (r === 'RETOUR MOYENNE') return '#10b981';
        return '#94a3b8';
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const render = () => {
            const width = canvas.width;
            const height = canvas.height;
            const cx = width / 2;
            const cy = height / 2;
            const scale = Math.min(width, height) * 0.4;

            ctx.fillStyle = 'rgba(2, 6, 23, 0.2)';
            ctx.fillRect(0, 0, width, height);

            const color = getRegimeColor();
            rotationRef.current.y += 0.005;
            rotationRef.current.x += 0.002;

            const cosY = Math.cos(rotationRef.current.y);
            const sinY = Math.sin(rotationRef.current.y);
            const cosX = Math.cos(rotationRef.current.x);
            const sinX = Math.sin(rotationRef.current.x);

            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 0.5;

            points3D.forEach((p, i) => {
                let x1 = p.x * cosY - p.z * sinY;
                let z1 = p.z * cosY + p.x * sinY;
                let y2 = p.y * cosX - z1 * sinX;
                let z2 = z1 * cosX + p.y * sinX;

                const perspective = 2 / (2 + z2);
                const x2D = x1 * scale * perspective + cx;
                const y2D = y2 * scale * perspective + cy;
                
                if (i === 0) ctx.moveTo(x2D, y2D);
                else ctx.lineTo(x2D, y2D);

                ctx.fillStyle = color;
                ctx.globalAlpha = (z2 + 1) / 2;
                ctx.fillRect(x2D - 1, y2D - 1, 3 * perspective, 3 * perspective);
            });
            
            ctx.stroke();
            ctx.globalAlpha = 1;
            animationFrameRef.current = requestAnimationFrame(render);
        };

        render();
        return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
    }, [points3D, regime]);

    useEffect(() => {
        const resize = () => {
            if (containerRef.current && canvasRef.current) {
                canvasRef.current.width = containerRef.current.clientWidth;
                canvasRef.current.height = containerRef.current.clientHeight;
            }
        };
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, []);

    return (
        <div ref={containerRef} className="bg-slate-950 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden h-[300px]">
            <div className="absolute top-4 left-6 z-10 pointer-events-none">
                <div className="flex items-center gap-2">
                    <Box size={14} className="text-indigo-400" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Chaos Attractor 3D</span>
                </div>
            </div>
            <canvas ref={canvasRef} className="w-full h-full cursor-move" />
        </div>
    );
};
