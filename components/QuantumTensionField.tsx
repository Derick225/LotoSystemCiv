import React, { useRef, useEffect, useMemo } from 'react';
import type { ScoreBreakdown } from '../types';

interface QuantumTensionFieldProps {
    breakdown: Record<number, ScoreBreakdown>;
    suggestedNumbers: number[];
}

export const QuantumTensionField: React.FC<QuantumTensionFieldProps> = ({ breakdown, suggestedNumbers }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const particles = useMemo(() => {
        return Array.from({ length: 90 }, (_, i) => {
            const num = i + 1;
            const score = breakdown[num];
            if (!score) {
                return { num, x: 0, y: 0, baseX: 0, baseY: 0, intensity: 0, isSuggested: false, pulse: 0 };
            }
            const numericValues = Object.values(score).filter((v): v is number => typeof v === 'number');
            const avg = numericValues.length > 0
                ? numericValues.reduce<number>((a, b) => a + b, 0) / numericValues.length
                : 0;

            return {
                num,
                x: ((i % 10) * 40) + 30,
                y: (Math.floor(i / 10) * 40) + 30,
                baseX: ((i % 10) * 40) + 30,
                baseY: (Math.floor(i / 10) * 40) + 30,
                intensity: avg,
                isSuggested: suggestedNumbers.includes(num),
                pulse: Math.random() * Math.PI * 2
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

        const render = () => {
            time += 0.02;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.beginPath();
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.05)';
            ctx.lineWidth = 0.5;
            suggestedNumbers.forEach((s1, idx) => {
                const p1 = particles[s1 - 1];
                if (!p1) return;
                suggestedNumbers.slice(idx + 1).forEach(s2 => {
                    const p2 = particles[s2 - 1];
                    if (!p2) return;
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                });
            });
            ctx.stroke();

            particles.forEach(p => {
                if (!p) return;
                const wave = Math.sin(time + p.pulse) * (p.intensity / 20);
                p.x = p.baseX + wave;
                p.y = p.baseY + (Math.cos(time + p.pulse) * (p.intensity / 25));

                const alpha = 0.1 + (p.intensity / 100) * 0.9;
                
                if (p.isSuggested) {
                    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 25);
                    grad.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
                    grad.addColorStop(1, 'rgba(99, 102, 241, 0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 25 + (Math.sin(time * 2) * 5), 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#ffffff';
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = '#6366f1';
                } else {
                    ctx.fillStyle = `rgba(148, 163, 184, ${alpha})`;
                    ctx.shadowBlur = 0;
                }

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.isSuggested ? 5 : 2, 0, Math.PI * 2);
                ctx.fill();

                if (p.intensity > 60 || p.isSuggested) {
                    ctx.font = `bold ${p.isSuggested ? '12px' : '8px'} Inter, sans-serif`;
                    ctx.fillStyle = p.isSuggested ? '#fff' : 'rgba(99, 102, 241, 0.6)';
                    ctx.textAlign = 'center';
                    ctx.fillText(p.num.toString(), p.x, p.y - 10);
                }
            });
            animationFrame = requestAnimationFrame(render);
        };
        render();
        return () => cancelAnimationFrame(animationFrame);
    }, [particles, suggestedNumbers]);

    return (
        <div className="bg-slate-950 p-6 md:p-10 rounded-[3.5rem] border border-indigo-500/20 shadow-2xl relative overflow-hidden group">
            <div className="flex justify-between items-center mb-8 relative z-10">
                <div>
                    <h4 className="text-white font-black text-xl uppercase tracking-tighter">Champ de Tension Quantum</h4>
                    <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-[0.3em] mt-1">Modélisation particulaire v9.0</p>
                </div>
                <div className="bg-white/5 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10"><span className="text-[9px] font-black text-slate-400 uppercase">Flux Temps Réel</span></div>
            </div>
            <div className="flex justify-center items-center bg-black/40 rounded-[2.5rem] border border-white/5 shadow-inner p-4">
                <canvas ref={canvasRef} width={420} height={380} className="max-w-full h-auto cursor-crosshair" />
            </div>
            <div className="mt-8 grid grid-cols-3 gap-4">
                <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_#fff]"></div><span className="text-[9px] font-black text-slate-500 uppercase">Attracteurs</span></div>
                <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-indigo-500"></div><span className="text-[9px] font-black text-slate-500 uppercase">Haute Tension</span></div>
                <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-slate-800"></div><span className="text-[9px] font-black text-slate-500 uppercase">Bruit Neutre</span></div>
            </div>
        </div>
    );
};