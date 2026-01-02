
import React, { useEffect, useState } from 'react';
import { getPatternIntensity } from '../services/predictionHistoryService';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface OrchestrationRadarProps {
    drawName: string;
}

export const OrchestrationRadar: React.FC<OrchestrationRadarProps> = ({ drawName }) => {
    const [data, setData] = useState<{ subject: string, A: number, fullMark: number }[]>([]);

    useEffect(() => {
        const intensity = getPatternIntensity(drawName);
        setData(intensity);
    }, [drawName]);

    const isEmpty = data.every(d => d.A === 0);

    return (
        <div className="bg-gray-900 text-white p-4 rounded-xl shadow-lg border border-red-900/30 relative overflow-hidden">
            <div className="flex justify-between items-center mb-2 relative z-10">
                <h4 className="text-sm font-bold text-red-400 flex items-center gap-2 uppercase tracking-wider">
                    <span>🕵️</span> Menace Scoped
                </h4>
                {isEmpty ? (
                    <span className="text-[10px] bg-green-900/50 text-green-300 px-2 py-0.5 rounded border border-green-700">
                        Signal Neutre
                    </span>
                ) : (
                    <span className="text-[10px] bg-red-900/50 text-red-300 px-2 py-0.5 rounded border border-red-700 animate-pulse">
                        Activité {drawName}
                    </span>
                )}
            </div>

            <div className="h-48 w-full relative z-10 min-h-[12rem]" style={{ minHeight: '200px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
                        <PolarGrid stroke="#4b5563" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar
                            name="Intensité"
                            dataKey="A"
                            stroke="#ef4444"
                            strokeWidth={2}
                            fill="#ef4444"
                            fillOpacity={0.4}
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1f2937', border: 'none', color: '#fff', borderRadius: '8px', fontSize: '12px' }}
                            itemStyle={{ color: '#fca5a5' }}
                        />
                    </RadarChart>
                </ResponsiveContainer>
            </div>

            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-red-600 rounded-full filter blur-[50px] opacity-10 pointer-events-none"></div>
        </div>
    );
};
