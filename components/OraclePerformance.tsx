
import React, { useEffect, useState } from 'react';
import { useNexus } from './NexusProvider';
import { HeartPulse, CheckCircle2, AlertTriangle, Activity } from 'lucide-react';

interface OraclePerformanceProps {
    drawName: string;
}

export const OraclePerformance: React.FC<OraclePerformanceProps> = ({ drawName }) => {
    const { volatility } = useNexus();
    
    const [health, setHealth] = useState<{ status: string, color: string, message: string }>({ 
        status: 'Calcul...', color: 'text-slate-400', message: 'Attente du signal...' 
    });
    
    useEffect(() => {
        if (volatility) {
            if (volatility.score > 60) {
                setHealth({ status: 'Agité', color: 'text-rose-500', message: 'Le jeu est difficile et changeant.' });
            } else if (volatility.score > 30) {
                setHealth({ status: 'Normal', color: 'text-indigo-500', message: 'Le jeu est stable.' });
            } else {
                setHealth({ status: 'Excellent', color: 'text-emerald-500', message: 'Les conditions sont idéales.' });
            }
        }
    }, [volatility]);

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 animate-fade-in relative overflow-hidden">
            <div className="flex items-center gap-6">
                <div className={`p-4 rounded-full bg-slate-100 dark:bg-slate-900 ${health.color} animate-pulse`}>
                    <HeartPulse size={40} />
                </div>
                <div>
                    <h3 className="text-lg font-black text-gray-800 dark:text-white uppercase tracking-tight">Santé du Jeu</h3>
                    <div className={`text-2xl font-black ${health.color}`}>{health.status}</div>
                    <p className="text-xs text-gray-500 font-medium mt-1">{health.message}</p>
                </div>
            </div>
            
            <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center">
                    <Activity size={20} className="text-slate-400 mb-1"/>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Activité</span>
                    <span className="text-lg font-black text-slate-700 dark:text-white">{volatility?.score || 0}%</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center">
                    {volatility?.status === 'Chaos' ? <AlertTriangle size={20} className="text-rose-500 mb-1"/> : <CheckCircle2 size={20} className="text-emerald-500 mb-1"/>}
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Risque</span>
                    <span className={`text-lg font-black ${volatility?.status === 'Chaos' ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {volatility?.status === 'Chaos' ? 'Élevé' : 'Faible'}
                    </span>
                </div>
            </div>
        </div>
    );
};
