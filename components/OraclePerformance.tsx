
import React, { useEffect, useState, useRef } from 'react';
import { useNexus } from './NexusProvider';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';

interface OraclePerformanceProps {
    drawName: string;
}

export const OraclePerformance: React.FC<OraclePerformanceProps> = ({ drawName }) => {
    // Connexion directe au Cerveau Nexus
    const { volatility: globalVolatility, history } = useNexus();
    
    const [volatility, setVolatility] = useState<{ score: number, status: string, trend: string } | null>(null);
    const [historyData, setHistoryData] = useState<any[]>([]);
    
    useEffect(() => {
        // Utilisation de la volatilité calculée globalement si disponible
        if (globalVolatility) {
            setVolatility(globalVolatility);
        } else {
            // Fallback sûr par défaut si pas encore calculé
            setVolatility({ score: 0, status: 'Analyse...', trend: 'steady' });
        }

        // Génération du graphe de pouls à partir de l'historique global
        if (history.length > 0) {
            const chartData = history.slice(0, 20).reverse().map(d => ({
                date: d.date.slice(0, 5),
                pulse: d.gagnants.reduce((a,b)=>a+b,0)
            }));
            setHistoryData(chartData);
        }
    }, [globalVolatility, history]);

    if (!volatility) return null;

    const getStatusColor = (status: string) => {
        if (status === 'Stable') return 'text-green-500';
        if (status === 'Chaos') return 'text-red-500';
        if (status === 'Analyse...') return 'text-gray-400';
        return 'text-yellow-500';
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 animate-fade-in relative overflow-hidden">
            {/* Background Pulse Effect */}
            <div className={`absolute -right-10 -top-10 w-40 h-40 rounded-full blur-[60px] opacity-20 ${volatility.status === 'Chaos' ? 'bg-red-600' : 'bg-green-500'}`}></div>

            <div className="flex justify-between items-start mb-6 relative z-10">
                <div>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <span>🩺</span> Diagnostic Vital
                    </h3>
                    <p className="text-xs text-gray-500">Moniteur de stabilité stochastique</p>
                </div>
                <div className={`text-right ${getStatusColor(volatility.status)}`}>
                    <div className="text-2xl font-black">{isNaN(volatility.score) ? '--' : volatility.score}%</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider">Entropie</div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
                <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="text-xs text-gray-400 uppercase font-bold mb-1">Régime</div>
                    <div className={`font-bold text-lg ${getStatusColor(volatility.status)}`}>
                        {volatility.status.toUpperCase()}
                    </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="text-xs text-gray-400 uppercase font-bold mb-1">Tendance</div>
                    <div className="font-bold text-lg text-indigo-500">
                        {volatility.trend === 'up' ? '↗️ Hausse' : volatility.trend === 'down' ? '↘️ Baisse' : '➡️ Stable'}
                    </div>
                </div>
            </div>

            {/* ECG Chart */}
            <div className="h-24 w-full bg-gray-50 dark:bg-gray-900/30 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800 relative">
                <div className="absolute top-2 left-2 text-[10px] font-mono text-gray-400">ECG (Somme Sigma)</div>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={historyData}>
                        <defs>
                            <linearGradient id="colorPulse" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={volatility.status === 'Chaos' ? '#ef4444' : '#10b981'} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={volatility.status === 'Chaos' ? '#ef4444' : '#10b981'} stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <Area 
                            type="monotone" 
                            dataKey="pulse" 
                            stroke={volatility.status === 'Chaos' ? '#ef4444' : '#10b981'} 
                            strokeWidth={2} 
                            fill="url(#colorPulse)" 
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-4 text-xs text-gray-500 italic bg-white/50 dark:bg-black/20 p-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                "Le traitement algorithmique a été adapté automatiquement en fonction de ce diagnostic."
            </div>
        </div>
    );
};
