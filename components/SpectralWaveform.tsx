import React, { useRef, useEffect } from 'react';

interface SpectralWaveformProps {
    energy: number;
    hurst: number;
}

export const SpectralWaveform: React.FC<SpectralWaveformProps> = ({ energy, hurst }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let frame: number;
        let t = 0;

        const render = () => {
            t += 0.05;
            const width = canvas.width;
            const height = canvas.height;
            
            ctx.clearRect(0, 0, width, height);

            // Background Grid
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            for(let i=0; i<width; i+=40) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
            }

            // Wave Parameters
            const amplitude = (energy / 100) * (height / 3);
            const frequency = 0.02 + (hurst / 10);
            
            // Draw Wave
            ctx.beginPath();
            ctx.lineWidth = 3;
            const gradient = ctx.createLinearGradient(0, 0, width, 0);
            gradient.addColorStop(0, '#6366f1');
            gradient.addColorStop(0.5, '#a855f7');
            gradient.addColorStop(1, '#ec4899');
            ctx.strokeStyle = gradient;

            for (let x = 0; x <= width; x++) {
                const y = height / 2 + Math.sin(x * frequency + t) * amplitude;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Glow Effect
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#6366f1';
            ctx.globalAlpha = 0.3;
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;

            // Current Phase Marker
            const markerX = width * 0.8;
            const markerY = height / 2 + Math.sin(markerX * frequency + t) * amplitude;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(markerX, markerY, 5, 0, Math.PI * 2);
            ctx.fill();

            frame = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(frame);
    }, [energy, hurst]);

    return (
        <canvas 
            ref={canvasRef} 
            width={600} 
            height={160} 
            className="w-full h-full"
        />
    );
};