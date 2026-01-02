
import React, { useEffect, useState, useMemo } from 'react';
import { PredictionHistory } from '../PredictionHistory';
import { getPredictionHistoryAsync, calculateHistoricalPerformance } from '../../services/predictionHistoryService';
import { useNexus } from '../NexusProvider';
import { History, Info, TrendingUp, Target, Trophy, Activity } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useToast } from '../ui/Toast';

interface HistoryTabProps {
    drawName: string;
}

/**
 * Onglet dédié à la consultation croisée des prédictions de l'IA et des résultats réels.
 */
export const HistoryTab: React.FC<HistoryTabProps> = ({ drawName }) => {
    const { history: actualResults, loading: nexusLoading } = useNexus();
    const [stats, setStats] = useState<{ accuracy: number; totalHits: number; perfectDraws: number; analyzedDrawsCount: number; trend: any[] } | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);

    useEffect(() => {
        const computeStats = async () => {
            if (nexusLoading) return;
            setLoadingStats(true);
            try {
                const predictions = await getPredictionHistoryAsync(drawName);
                if (predictions.length > 0 && actualResults.length > 0) {
                    const computed = calculateHistoricalPerformance(predictions, actualResults);
                    setStats(computed);
                } else {
                    setStats(null);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingStats(false);
            }
        };
        computeStats();
    }, [drawName, actualResults, nexusLoading]);

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            {/* AI Performance Dashboard */}
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group border border-slate-800">
                <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px] -mr-32 -mt-32 group-hover:scale-125 transition-transform duration-1000"></div>
                
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-8">
                    <div className="flex-1 space-y-6 w-full">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
                                <History className="w-8 h-8 text-indigo-300" />
                            </div>
                            <div>
                                <h3 className="text-2xl md:text-3xl font-black tracking-tight">Performance IA</h3>
                                <p className="text-indigo-200/60 text-xs font-bold uppercase tracking-widest">
                                    {stats ? `Sur ${stats.analyzedDrawsCount} tirages analysés` : 'Analyse en cours...'}
                                </p>
                            </div>
                        </div>

                        {stats ? (
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-black/20 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
                                    <div className="flex items-center gap-2 mb-1 text-emerald-400">
                                        <Target size={14} />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Précision</span>
                                    </div>
                                    <div className="text-2xl font-black">{stats.accuracy.toFixed(1)}%</div>
                                    <div className="text-[8px] text-slate-400">taux de réussite</div>
                                </div>
                                <div className="bg-black/20 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
                                    <div className="flex items-center gap-2 mb-1 text-indigo-400">
                                        <Activity size={14} />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Hits</span>
                                    </div>
                                    <div className="text-2xl font-black">{stats.totalHits}</div>
                                    <div className="text-[8px] text-slate-400">numéros trouvés</div>
                                </div>
                                <div className="bg-black/20 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
                                    <div className="flex items-center gap-2 mb-1 text-amber-400">
                                        <Trophy size={14} />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Élite</span>
                                    </div>
                                    <div className="text-2xl font-black">{stats.perfectDraws}</div>
                                    <div className="text-[8px] text-slate-400">tirages à 3+ hits</div>
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 bg-white/5 rounded-2xl border border-dashed border-white/10 text-center text-xs text-slate-400 italic">
                                Aucune donnée comparative disponible pour l'instant.
                            </div>
                        )}
                    </div>

                    {/* Chart Zone */}
                    <div className="w-full lg:w-1/2 h-48 bg-black/20 rounded-3xl border border-white/5 p-4 relative">
                        <div className="absolute top-4 left-4 text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <TrendingUp size={12}/> Tendance (Hits / Tirage)
                        </div>
                        {stats && stats.trend.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={stats.trend}>
                                    <defs>
                                        <linearGradient id="colorHits" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                    <XAxis dataKey="date" tick={{fontSize: 9, fill: '#64748b'}} axisLine={false} tickLine={false} minTickGap={20} />
                                    <YAxis hide domain={[0, 5]} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '11px', color: '#fff' }}
                                        formatter={(value: any) => [`${value} Hits`, 'Performance']}
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey="hits" 
                                        stroke="#818cf8" 
                                        strokeWidth={3} 
                                        fill="url(#colorHits)" 
                                        animationDuration={1500}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-600 text-xs font-bold uppercase">Graphique indisponible</div>
                        )}
                    </div>
                </div>
            </div>

            {/* List Details */}
            <div className="bg-white dark:bg-gray-800 p-2 sm:p-6 rounded-[3rem] border border-gray-100 dark:border-gray-700 shadow-sm min-h-[400px]">
                <PredictionHistory drawName={drawName} />
            </div>
        </div>
    );
};
