
import React, { useState, useEffect, useMemo } from 'react';
import { calculateRegularity, performKMeansClusteringAsync } from '../../services/mathService';
import { addToWatchlist, removeFromWatchlist, isInWatchlist } from '../../services/userPreferencesService';
import type { ClusterPoint, ClusterSummary, NumberRegularity } from '../../types';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { Brain, Star, Activity, Info, Network } from 'lucide-react';
import { useNexus } from '../NexusProvider';

interface ClusteringTabProps {
    drawName: string;
}

const CLUSTER_CONFIG: Record<string, ClusterSummary> = {
    'Sprinter': { type: 'Sprinter', count: 0, description: "Haute fréquence récente, gap faible.", color: "#10b981", icon: "🚀" },
    'Marathonien': { type: 'Marathonien', count: 0, description: "Réguliers sur le long terme.", color: "#3b82f6", icon: "🏃" },
    'Dormeur': { type: 'Dormeur', count: 0, description: "Retard extrême (>30t).", color: "#6366f1", icon: "💤" },
    'Neutre': { type: 'Neutre', count: 0, description: "Bruit standard.", color: "#9ca3af", icon: "⚪" }
};

export const ClusteringTab: React.FC<ClusteringTabProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { history, loading: nexusLoading } = useNexus();
    const [points, setPoints] = useState<ClusterPoint[]>([]);
    const [summary, setSummary] = useState<ClusterSummary[]>([]);
    const [regularity, setRegularity] = useState<NumberRegularity[]>([]);
    const [selectedPoint, setSelectedPoint] = useState<ClusterPoint | null>(null);
    const [calculating, setCalculating] = useState(false);

    const xAxisLabelProps = { value: 'Retard (Gap)', position: 'insideBottom' as const, offset: -10 };

    useEffect(() => {
        if (history.length > 20) {
            setCalculating(true);
            
            // Calculs parallèles
            Promise.all([
                calculateRegularity(history),
                performKMeansClusteringAsync(history)
            ]).then(([regData, kMeansPoints]) => {
                setRegularity(regData);
                setPoints(kMeansPoints);
                
                // Résumé dynamique
                const counts = { ...CLUSTER_CONFIG };
                Object.keys(counts).forEach(k => counts[k].count = 0);
                kMeansPoints.forEach(p => { if (counts[p.cluster]) counts[p.cluster].count++; });
                setSummary(Object.values(counts));
                setCalculating(false);
            }).catch(e => {
                console.error("Cluster Calc Error", e);
                setCalculating(false);
            });
        }
    }, [history]);

    const bioInfo = useMemo(() => {
        if (!selectedPoint) return null;
        const reg = regularity.find(r => r.number === selectedPoint.number);
        // Approximation visuelle de fatigue (si x est grand)
        const fatigue = Math.round((selectedPoint.x / (reg?.avgGap || 20)) * 100);
        
        return { 
            number: selectedPoint.number,
            avgGap: reg?.avgGap || 0,
            stdDev: reg?.stdDev || 0,
            currentGap: reg?.currentGap || 0,
            lastGaps: reg?.lastGaps || [],
            nextExpectedIn: reg?.nextExpectedIn || 0,
            fatigue 
        };
    }, [selectedPoint, regularity]);

    const handleToggleWatchlist = (num: number) => {
        if (isInWatchlist(num)) {
            removeFromWatchlist(num);
            showToast(`N°${num} retiré.`, "info");
        } else {
            if (addToWatchlist(num)) showToast(`N°${num} en surveillance !`, "success");
            else showToast("Limite atteinte.", "error");
        }
    };

    if (nexusLoading || calculating || history.length === 0) return (
        <div className="flex flex-col items-center justify-center h-64 gap-6 bg-slate-900/5 rounded-[3rem] border border-dashed border-indigo-200 dark:border-slate-700">
            <div className="relative">
                <Network className="animate-spin text-indigo-500" size={48} />
                <div className="absolute inset-0 flex items-center justify-center"><div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div></div>
            </div>
            <p className="font-black text-indigo-500 text-xs font-mono uppercase tracking-[0.4em] animate-pulse">Clustering K-Means++...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-xl font-black text-gray-800 dark:text-white flex items-center gap-3">
                             <Network className="text-indigo-600"/> Segmentation Non-Supervisée
                        </h3>
                        <p className="text-xs text-gray-400 mt-1 uppercase font-bold tracking-tighter opacity-60">Classification Automatique par Centroïdes</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {summary.map(s => (
                        <div key={s.type} className="p-4 rounded-2xl border flex flex-col items-center text-center transition-all hover:shadow-md cursor-help group" style={{ borderColor: s.color + '40', backgroundColor: s.color + '08' }} title={s.description}>
                            <div className="text-2xl mb-2 group-hover:scale-125 transition-transform">{s.icon}</div>
                            <div className="font-black text-[10px] uppercase tracking-widest" style={{ color: s.color }}>{s.type}</div>
                            <div className="text-3xl font-black text-gray-800 dark:text-white mt-1">{s.count}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-[3rem] shadow-inner border border-slate-200 dark:border-slate-800 h-[500px] relative overflow-hidden">
                    <div className="absolute top-6 right-8 flex flex-col gap-2 text-[8px] font-black uppercase text-gray-400 z-10">
                        {summary.map(s => (
                            <div key={s.type} className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{backgroundColor: s.color}}></span> {s.type}
                            </div>
                        ))}
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 40, right: 20, bottom: 40, left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                            <XAxis type="number" dataKey="x" name="Retard" domain={[0, 'auto']} label={xAxisLabelProps} tick={{fontSize: 10, fontWeight:'bold'}} axisLine={false} tickLine={false} />
                            <YAxis type="number" dataKey="y" name="Freq 20" domain={[0, 'auto']} label={{ value: 'Fréquence Courte (20t)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 10, fontWeight:'bold' }, offset: 10 }} tick={{fontSize: 10, fontWeight:'bold'}} axisLine={false} tickLine={false} />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '16px', color: '#fff', fontSize: '11px' }} itemStyle={{color: '#fff'}} />
                            <ReferenceLine x={15} stroke="#94a3b8" strokeDasharray="4 4" opacity={0.2} label={{ value: "Gap Critique", fontSize: 9, fill:"#94a3b8" }} />
                            <Scatter name="Clusters" data={points} onClick={(p) => setSelectedPoint(p.payload)} animationDuration={1000}>
                                {points.map((p, index) => (
                                    <Cell key={`cell-${index}`} fill={CLUSTER_CONFIG[p.cluster]?.color || '#9ca3af'} />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-[3rem] shadow-xl border border-gray-100 dark:border-gray-700 flex flex-col">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl text-indigo-600 dark:text-indigo-300 shadow-inner">
                            <Brain size={24} />
                        </div>
                        <div>
                            <h4 className="text-lg font-black text-gray-800 dark:text-white leading-none">Profil IA</h4>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Détail du vecteur</p>
                        </div>
                    </div>
                    {selectedPoint && bioInfo ? (
                        <div className="space-y-6 animate-fade-in flex-1 flex flex-col justify-between">
                            <div className="text-center">
                                <div className="flex justify-center mb-4 transform hover:scale-110 transition-transform">
                                    <NumberBall number={selectedPoint.number} size="lg" />
                                </div>
                                <h5 className="text-xl font-black text-gray-800 dark:text-white">Unité {selectedPoint.number}</h5>
                                <div className="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full border inline-block mt-2" style={{ color: CLUSTER_CONFIG[selectedPoint.cluster]?.color, borderColor: CLUSTER_CONFIG[selectedPoint.cluster]?.color + '40', backgroundColor: CLUSTER_CONFIG[selectedPoint.cluster]?.color + '10' }}>
                                    {selectedPoint.cluster}
                                </div>
                            </div>
                            <div className="space-y-4 bg-gray-50 dark:bg-gray-900/50 p-5 rounded-[2rem] border border-gray-100 dark:border-gray-700 shadow-inner">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-gray-500 uppercase">Écart Actuel</span>
                                    <span className="font-black text-gray-700 dark:text-white">{bioInfo.currentGap || 0}t</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-gray-500 uppercase">Cycle Moyen</span>
                                    <span className="font-black text-gray-700 dark:text-white">{bioInfo.avgGap || 0}t</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-gray-500 uppercase">Stabilité σ</span>
                                    <span className={`font-black ${bioInfo.stdDev < 2.5 ? 'text-green-500' : 'text-orange-500'}`}>±{bioInfo.stdDev || 0}</span>
                                </div>
                                <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-2">
                                    <div className={`h-full ${bioInfo.fatigue > 80 ? 'bg-red-500' : 'bg-indigo-500'} transition-all duration-1000`} style={{width: `${Math.min(100, bioInfo.fatigue)}%`}}></div>
                                </div>
                                <div className="text-center text-[9px] font-bold text-gray-400 uppercase">Indice de Saturation</div>
                            </div>
                            <button 
                                onClick={() => handleToggleWatchlist(selectedPoint.number)}
                                className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 ${isInWatchlist(selectedPoint.number) ? 'bg-amber-400 text-amber-900 hover:bg-amber-300' : 'bg-slate-900 text-white hover:bg-indigo-600'}`}
                            >
                                <Star size={14} className={isInWatchlist(selectedPoint.number) ? 'fill-current' : ''} /> 
                                {isInWatchlist(selectedPoint.number) ? 'Surveillé' : 'Ajouter Watchlist'}
                            </button>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50 dark:bg-gray-900/30 rounded-[2rem] border border-dashed border-gray-200 dark:border-gray-700 opacity-60">
                            <Info className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sélectionnez un point pour inspecter ses métriques.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
