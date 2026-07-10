
import React, { useEffect, useState } from 'react';
import { getPatternIntensityAsync } from '../services/predictionHistoryService';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { AlertOctagon } from 'lucide-react';

interface OrchestrationRadarProps {
    drawName: string;
}

export const OrchestrationRadar: React.FC<OrchestrationRadarProps> = React.memo(({ drawName }) => {
    const [data, setData] = useState<{ subject: string, A: number, fullMark: number }[]>([]);

    useEffect(() => {
        let isMounted = true;
        const fetchIntensity = async () => {
            const intensity = await getPatternIntensityAsync(drawName);
            if (isMounted) setData(intensity);
        };
        fetchIntensity();
        return () => { isMounted = false; };
    }, [drawName]);

    const isEmpty = data.every(d => d.A === 0);

    return (
        <div className="w-full h-full relative">
            {isEmpty && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-900/50 backdrop-blur-sm rounded-3xl">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 py-2 bg-slate-800 rounded-full border border-slate-700">
                        Signal Neutre (Scan en cours...)
                    </span>
                </div>
            )}

            <div className="h-64 w-full relative z-0">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
                        <defs>
                            <radialGradient id="radarFill" cx="0.5" cy="0.5" r="0.5">
                                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.6"/>
                                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.1"/>
                            </radialGradient>
                        </defs>
                        <PolarGrid stroke="#334155" strokeDasharray="3 3" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar
                            name="Intensité"
                            dataKey="A"
                            stroke="#f43f5e"
                            strokeWidth={3}
                            fill="url(#radarFill)"
                            fillOpacity={1}
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#fff', borderRadius: '12px', fontSize: '10px' }}
                            itemStyle={{ color: '#fda4af' }}
                        />
                    </RadarChart>
                </ResponsiveContainer>
            </div>
            
            <div className="absolute bottom-2 right-2 flex items-center gap-2">
                <AlertOctagon size={12} className="text-rose-500 animate-pulse"/>
                <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Live Monitoring</span>
            </div>
        </div>
    );
});
