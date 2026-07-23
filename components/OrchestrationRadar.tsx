
import React, { useEffect, useState } from 'react';
import { getPatternIntensityAsync } from '../services/predictionHistoryService';
import { UnifiedAlgoRadar } from './UnifiedAlgoRadar';
import { AlertOctagon } from 'lucide-react';

interface OrchestrationRadarProps {
    drawName: string;
}

export const OrchestrationRadar: React.FC<OrchestrationRadarProps> = ({ drawName }) => {
    const [data, setData] = useState<{ subject: string; value: number }[]>([]);

    useEffect(() => {
        let isMounted = true;
        const fetchIntensity = async () => {
            const intensity = await getPatternIntensityAsync(drawName);
            if (isMounted) {
                setData(intensity.map(d => ({ subject: d.subject, value: d.A })));
            }
        };
        fetchIntensity();
        return () => { isMounted = false; };
    }, [drawName]);

    const isEmpty = data.every(d => d.value === 0);

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
                <UnifiedAlgoRadar
                    data={data}
                    primaryColor="#f43f5e"
                    primaryName="Intensité"
                    height={250}
                />
            </div>
            
            <div className="absolute bottom-2 right-2 flex items-center gap-2">
                <AlertOctagon size={12} className="text-rose-500 animate-pulse"/>
                <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Live Monitoring</span>
            </div>
        </div>
    );
};

