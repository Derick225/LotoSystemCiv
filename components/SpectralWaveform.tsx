
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
        let phase = 0;

        // Fonction d'onde composite
        const wave = (x: number, time: number, freq: number, amp: number) => {
            return Math.sin(x * freq + time) * amp + 
                   Math.sin(x * (freq * 2.5) + time * 1.5) * (amp * 0.3) * Math.cos(time * 0.2); // Harmonique
        };

        const render = () => {
            t += 0.05 + (energy / 2000); // Vitesse basée sur l'énergie
            phase += 0.02;

            const width = canvas.width;
            const height = canvas.height;
            const centerY = height / 2;
            
            ctx.clearRect(0, 0, width, height);

            // Grille de fond dynamique
            ctx.strokeStyle = 'rgba(255,255,255,0.03)';
            ctx.lineWidth = 1;
            const gridOffset = (t * 10) % 40;
            for(let i = -40; i < width + 40; i += 40) {
                ctx.beginPath(); 
                ctx.moveTo(i + gridOffset, 0); 
                ctx.lineTo(i + gridOffset, height); 
                ctx.stroke();
            }

            // Paramètres d'onde basés sur les métriques
            const amplitude = Math.max(10, (energy / 100) * (height * 0.4));
            const frequency = 0.01 + (hurst / 15);
            const colorEnergy = energy > 80 ? '#f43f5e' : energy > 50 ? '#a855f7' : '#6366f1';

            // Onde Principale (Lueur)
            ctx.shadowBlur = 20;
            ctx.shadowColor = colorEnergy;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.strokeStyle = colorEnergy;
            ctx.beginPath();

            for (let x = 0; x <= width; x++) {
                const y = centerY + wave(x, t, frequency, amplitude);
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Onde Secondaire (Interférence - "Ghost Signal")
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            for (let x = 0; x <= width; x++) {
                // Décalage de phase pour l'effet fantôme
                const y = centerY + wave(x, t - 0.5, frequency * 1.1, amplitude * 0.8);
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Curseurs d'amplitude (Peak Meters)
            const peakY = centerY + wave(width * 0.8, t, frequency, amplitude);
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#fff';
            ctx.beginPath();
            ctx.arc(width * 0.8, peakY, 4, 0, Math.PI * 2);
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
            className="w-full h-full object-cover"
        />
    );
};
