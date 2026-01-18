import React, { useRef, useEffect, useMemo } from 'react';
import type { ScoreBreakdown } from '../types';
import { Activity, Radio, Magnet, Scan, Maximize2 } from 'lucide-react';

interface QuantumTensionFieldProps {
    breakdown: Record<number, ScoreBreakdown>;
    suggestedNumbers: number[];
}

export const QuantumTensionField: React.FC<QuantumTensionFieldProps> = ({ breakdown, suggestedNumbers }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mouseRef = useRef({ x: -1000, y: -1000 });

    const particles = useMemo(() => {
        return Array.from({ length: 90 }, (_, i) => {
            const num = i + 1;
            const score = breakdown[num];
            const numericValues = score ? Object.values(score).filter((v): v is number => typeof v === 'number') : [];
            const avg = numericValues.length > 0 ? numericValues.reduce<number>((a, b) => a + b, 0) / numericValues.length : 0;

            const isSuggested = suggestedNumbers.includes(num);

            return {
                num,
                x: 0, // Initialisé dans l'effet
                y: 0,
                baseX: ((i % 10) * 45) + 40,
                baseY: (Math.floor(i / 10) * 45) + 40,
                intensity: avg,
                isSuggested,
                size: isSuggested ? 4 : 1.5,
                phase: Math.random() * Math.PI * 2,
                vx: 0,
                vy: 0
            };
        });
    }, [breakdown, suggestedNumbers]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrame: number;
        let time = 0;

        // Initialisation des positions
        particles.forEach(p => {
            p.x = p.baseX;
            p.y = p.baseY;
        });

        const render = () => {
            time += 0.015;
            
            // Effet de traînée élégant
            ctx.fillStyle = 'rgba(2, 6, 23, 0.15)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // 1. DESSINER LES LIAISONS LASER (DESSOUS)
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath();
            suggestedNumbers.forEach((s1, idx) => {
                const p1 = particles[s1 - 1];
                if (!p1) return;
                suggestedNumbers.slice(idx + 1).forEach(s2 => {
                    const p2 = particles[s2 - 1];
                    if (!p2) return;
                    
                    const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
                    const alpha = 0.1 + Math.sin(time * 3) * 0.05;
                    grad.addColorStop(0, `rgba(99, 102, 241, ${alpha})`);
                    grad.addColorStop(0.5, `rgba(167, 139, 250, ${alpha * 2})`);
                    grad.addColorStop(1, `rgba(99, 102, 241, ${alpha})`);
                    
                    ctx.strokeStyle = grad;
                    ctx.lineWidth = 1;
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                });
            });
            ctx.stroke();

            // 2. MISE À JOUR PHYSIQUE & DESSIN DES PARTICULES
            particles.forEach(p => {
                // Physique de flottement organique
                const driftX = Math.sin(time + p.phase) * (p.intensity / 15);
                const driftY = Math.cos(time + p.phase) * (p.intensity / 15);
                
                // Répulsion souris
                const dx = p.x - mouseRef.current.x;
                const dy = p.y - mouseRef.current.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const force = Math.max(0, (100 - dist) / 100);
                
                const targetX = p.baseX + driftX + (dx/dist || 0) * force * 30;
                const targetY = p.baseY + driftY + (dy/dist || 0) * force * 30;

                // Smoothing (Lerp)
                p.x += (targetX - p.x) * 0.1;
                p.y += (targetY - p.y) * 0.1;

                const alpha = 0.1 + (p.intensity / 100) * 0.8;
                
                if (p.isSuggested) {
                    // Bloom Effect pour les attracteurs
                    ctx.shadowBlur = 15 + Math.sin(time * 4) * 5;
                    ctx.shadowColor = '#6366f1';
                    ctx.fillStyle = '#ffffff';
                    
                    // Halo externe
                    const pulse = 15 + Math.sin(time * 2) * 5;
                    const innerGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pulse);
                    innerGrad.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
                    innerGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
                    ctx.globalCompositeOperation = 'screen';
                    ctx.fillStyle = innerGrad;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.fillStyle = '#fff';
                    ctx.globalCompositeOperation = 'source-over';
                } else {
                    ctx.shadowBlur = 0;
                    const hot = p.intensity > 70;
                    ctx.fillStyle = hot ? `rgba(244, 63, 94, ${alpha})` : `rgba(79, 70, 229, ${alpha})`;
                }

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.isSuggested ? 4 : 2, 0, Math.PI * 2);
                ctx.fill();

                // Étiquettes numériques pour les points chauds
                if (p.intensity > 70 || p.isSuggested) {
                    ctx.font = `bold ${p.isSuggested ? '11px' : '7px'} Inter, sans-serif`;
                    ctx.fillStyle = p.isSuggested ? '#fff' : 'rgba(148, 163, 184, 0.8)';
                    ctx.textAlign = 'center';
                    ctx.shadowBlur = 0;
                    ctx.fillText(p.num.toString(), p.x, p.y - (p.isSuggested ? 12 : 8));
                }
            });

            animationFrame = requestAnimationFrame(render);
        };
        render();

        const handleMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            mouseRef.current = {
                x: (e.clientX - rect.left) * (canvas.width / rect.width),
                y: (e.clientY - rect.top) * (canvas.height / rect.height)
            };
        };

        const handleMouseLeave = () => {
            mouseRef.current = { x: -1000, y: -1000 };
        };

        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            cancelAnimationFrame(animationFrame);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [particles, suggestedNumbers]);

    return (
        <div className="bg-slate-950 p-6 md:p-10 rounded-[3.5rem] border border-white/10 shadow-2xl relative overflow-hidden group">
            {/* Décoration HUD */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
                <div className="absolute top-8 left-8 w-4 h-4 border-t-2 border-l-2 border-indigo-500"></div>
                <div className="absolute top-8 right-8 w-4 h-4 border-t-2 border-r-2 border-indigo-500"></div>
                <div className="absolute bottom-8 left-8 w-4 h-4 border-b-2 border-l-2 border-indigo-500"></div>
                <div className="absolute bottom-8 right-8 w-4 h-4 border-b-2 border-r-2 border-indigo-500"></div>
            </div>

            <div className="flex justify-between items-center mb-8 relative z-10">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Magnet size={18} className="text-indigo-400 animate-pulse" />
                        <h4 className="text-white font-black text-xl uppercase tracking-tighter">Champ de Tension Quantum</h4>
                    </div>
                    <p className="text-[10px] text-indigo-400/60 font-black uppercase tracking-[0.3em]">Cinématique stochastique v9.2</p>
                </div>
                <div className="flex gap-2">
                    <div className="p-2 bg-white/5 rounded-xl border border-white/10 text-slate-500">
                        <Scan size={16} />
                    </div>
                </div>
            </div>

            <div className="flex justify-center items-center bg-black/40 rounded-[3rem] border border-white/5 shadow-inner p-4 relative overflow-hidden">
                {/* Background Grid Lines */}
                <div className="absolute inset-0 grid grid-cols-10 grid-rows-10 opacity-[0.03] pointer-events-none">
                    {Array.from({length: 100}).map((_, i) => (
                        <div key={i} className="border border-white"></div>
                    ))}
                </div>
                <canvas ref={canvasRef} width={480} height={440} className="max-w-full h-auto cursor-none relative z-10" />
            </div>

            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_10px_#fff]"></div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Attracteurs</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_10px_#f43f5e]"></div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Phase Critique</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Résonance</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-slate-800"></div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Neutre</span>
                </div>
            </div>
        </div>
    );
};