
import React, { useState, useEffect, useMemo } from 'react';
import { calculateRegularity, performKMeansClusteringAsync, calculateACValue, calculateCorrelationMatrixAsync, calculateSuccessionMatrixAsync } from '../../services/mathService';
import { addToWatchlist, removeFromWatchlist, isInWatchlist, saveTicket } from '../../services/userPreferencesService';
import { savePredictionToHistory } from '../../services/predictionHistoryService';
import type { ClusterPoint, ClusterSummary, NumberRegularity, Prediction } from '../../types';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceArea } from 'recharts';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { Brain, Star, Activity, Info, Network, Zap, Clock, UserCheck, Ticket, GitMerge, Link } from 'lucide-react';
import { useNexusStore } from '../../store/useNexusStore';
import { audioEngine } from '../../utils/audioEngine';

interface ClusteringTabProps {
    drawName: string;
}

const CLUSTER_CONFIG: Record<string, ClusterSummary & { advice: string, metaphor: string }> = {
    'Sprinter': { 
        type: 'Sprinter', 
        count: 0, 
        description: "Sortent souvent en ce moment.", 
        color: "#10b981", 
        icon: "⚡",
        metaphor: "Forme Explosive",
        advice: "À jouer en priorité (Tendance chaude)"
    },
    'Marathonien': { 
        type: 'Marathonien', 
        count: 0, 
        description: "Réguliers toute l'année.", 
        color: "#3b82f6", 
        icon: "🏃",
        metaphor: "Endurance Fiable",
        advice: "Idéal comme base ou pivot"
    },
    'Dormeur': { 
        type: 'Dormeur', 
        count: 0, 
        description: "Absents depuis longtemps.", 
        color: "#f43f5e", 
        icon: "💤",
        metaphor: "Réveil Imminent ?",
        advice: "Risqué mais gros potentiel (Écart)"
    },
    'Neutre': { 
        type: 'Neutre', 
        count: 0, 
        description: "Comportement standard.", 
        color: "#94a3b8", 
        icon: "⚪",
        metaphor: "Bruit de Fond",
        advice: "Utiliser pour compléter"
    }
};

export const ClusteringTab: React.FC<ClusteringTabProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const history = useNexusStore(state => state.history);
    const nexusLoading = useNexusStore(state => state.loading);
    
    const [points, setPoints] = useState<ClusterPoint[]>([]);
    const [summary, setSummary] = useState<Array<ClusterSummary & { advice: string; metaphor: string }>>([]); 
    const [regularity, setRegularity] = useState<NumberRegularity[]>([]);
    const [markovData, setMarkovData] = useState<{matrix: Record<number, Record<number, number>>; totals: Record<number, number>} | null>(null);
    const [correlationData, setCorrelationData] = useState<Record<number, { affinities: Record<number, number> }> | null>(null);

    const [selectedPoint, setSelectedPoint] = useState<ClusterPoint | null>(null);
    const [activeFilter, setActiveFilter] = useState<string | null>(null); 
    const [calculating, setCalculating] = useState(false);

    useEffect(() => {
        if (history.length > 20) {
            setCalculating(true);
            
            Promise.all([
                calculateRegularity(history),
                performKMeansClusteringAsync(history),
                calculateSuccessionMatrixAsync(history),
                calculateCorrelationMatrixAsync(history)
            ]).then(([regData, kMeansPoints, markovMap, corrMap]) => {
                setRegularity(regData);
                setPoints(kMeansPoints);
                setMarkovData(markovMap);
                setCorrelationData(corrMap);
                
                const counts: Record<string, number> = {};
                Object.keys(CLUSTER_CONFIG).forEach(k => counts[k] = 0);
                kMeansPoints.forEach(p => { if (counts[p.cluster] !== undefined) counts[p.cluster]++; });
                
                const summaryArray = Object.values(CLUSTER_CONFIG).map(c => ({
                    ...c,
                    count: counts[c.type] || 0
                }));
                
                setSummary(summaryArray);
                setCalculating(false);
            }).catch(e => {
                console.error("Cluster Calc Error", e);
                setCalculating(false);
            });
        }
    }, [history]);

    const filteredPoints = useMemo(() => {
        if (!activeFilter) return points;
        return points.filter(p => p.cluster === activeFilter);
    }, [points, activeFilter]);

    const numberProfile = useMemo(() => {
        if (!selectedPoint) return null;
        const reg = regularity.find(r => r.number === selectedPoint.number);
        const config = CLUSTER_CONFIG[selectedPoint.cluster];
        
        const formScore = Math.min(100, (selectedPoint.y / 8) * 100); 
        const gapScore = Math.min(100, (selectedPoint.x / 40) * 100); 
        
        return { 
            ...selectedPoint,
            ...reg,
            config,
            scores: { form: formScore, gap: gapScore }
        };
    }, [selectedPoint, regularity]);

    const handleToggleWatchlist = (num: number) => {
        audioEngine.play('click');
        if (isInWatchlist(num)) {
            removeFromWatchlist(num);
            showToast(`N°${num} retiré des favoris.`, "info");
        } else {
            if (addToWatchlist(num)) {
                audioEngine.play('success');
                showToast(`N°${num} ajouté aux favoris !`, "success");
            } else {
                audioEngine.play('error');
                showToast("Limite de favoris atteinte.", "error");
            }
        }
    };

    const handleGenerateFromCluster = async (clusterType: string) => {
        audioEngine.play('click');
        const clusterPoints = points.filter(p => p.cluster === clusterType);
        if (clusterPoints.length < 5) {
            audioEngine.play('error');
            showToast(`Pas assez de ${clusterType}s pour générer un ticket (Min 5).`, "error");
            return;
        }

    // @ts-ignore - auto generated by cleanup
        const pool = clusterPoints.map(p => p.number);
        let bestTicket: number[] = [];
        let bestAC = -1;

        // Génération Déterministe basée sur l'optimisation gloutonne (zéro hasard)
        // On trie le pool par retard et fréquence pour assurer une reproductibilité stricte
        const deterministicPool = [...clusterPoints].sort((a, b) => b.y - a.y || a.x - b.x);

        // On teste les combinaisons gloutonnes (fenêtre glissante) pour maximiser l'AC
        for(let i=0; i <= deterministicPool.length - 5; i++) {
            const candidate = deterministicPool.slice(i, i+5).map(p => p.number).sort((a,b)=>a-b);
            const ac = calculateACValue(candidate);
            if (ac > bestAC) {
                bestAC = ac;
                bestTicket = candidate;
            }
        }

        if (bestTicket.length === 5) {
            await saveTicket({
                numbers: bestTicket,
                drawName,
                strategy: `Cluster ${clusterType}`
            });

            const breakdown: Record<number, Record<string, number>> = {};
            bestTicket.forEach(num => {
                breakdown[num] = {
                    meta_llm_ensemble: bestAC * 10,
                    spatial: clusterType === 'Sprinter' ? 90 : clusterType === 'Marathonien' ? 70 : clusterType === 'Dormeur' ? 80 : 50,
                    frequency: clusterType === 'Sprinter' ? 85 : clusterType === 'Dormeur' ? 10 : 50
                };
            });

            const predictionObj: Prediction = {
                suggestedNumbers: bestTicket,
                candidates: bestTicket,
                confidence: 80, // Arbitrary confidence
                analysis: `Cluster Generation (${clusterType})`,
                breakdown: breakdown,
                timestamp: Date.now()
            };
            await savePredictionToHistory(drawName, predictionObj);

            audioEngine.play('success');
            showToast(`Ticket ${clusterType} généré et autopsié (AC:${bestAC}).`, "success");
        }
    };

    if (nexusLoading || calculating || history.length === 0) return (
        <div className="flex flex-col items-center justify-center h-64 gap-6 bg-slate-900/5 rounded-3xl border border-dashed border-indigo-200 dark:border-slate-700 animate-pulse">
            <div className="relative">
                <Network className="animate-spin text-indigo-500" size={48} />
            </div>
            <p className="font-black text-indigo-500 text-xs font-mono uppercase tracking-[0.4em]">Profilage des numéros...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            
            <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                    <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                         <UserCheck className="text-indigo-600"/> Profils Comportementaux
                    </h3>
                    {activeFilter && (
                        <button onClick={() => setActiveFilter(null)} className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full hover:bg-slate-200 transition">
                            Voir Tout
                        </button>
                    )}
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {summary.map(s => (
                        <div
                            key={s.type}
                            onClick={() => { audioEngine.play('click'); setActiveFilter(activeFilter === s.type ? null : s.type); setSelectedPoint(null); }}
                            className={`p-4 rounded-[2rem] border transition-all relative overflow-hidden group text-left cursor-pointer
                                ${activeFilter === s.type 
                                    ? 'bg-slate-900 text-white shadow-xl scale-105 z-10 border-transparent' 
                                    : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-indigo-300'
                                }
                            `}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-2xl">{s.icon}</span>
                                <span className={`text-xl font-black ${activeFilter === s.type ? 'text-white' : 'text-slate-800 dark:text-white'}`}>
                                    {s.count}
                                </span>
                            </div>
                            <div className="mb-4">
                                <div className={`text-[11px] font-black uppercase tracking-wide ${activeFilter === s.type ? 'text-white' : ''}`} style={{ color: activeFilter === s.type ? 'white' : (s as any).color }}>
                                    {s.type}s
                                </div>
                                <div className={`text-xs font-medium mt-1 leading-tight ${activeFilter === s.type ? 'text-slate-400' : 'text-slate-400'}`}>
                                    {s.metaphor}
                                </div>
                            </div>
                            
                            {/* Action Button embedded in card */}
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleGenerateFromCluster(s.type); }}
                                className={`w-full py-2 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 transition-all shadow-sm ${activeFilter === s.type ? 'bg-white text-slate-900 hover:bg-slate-200' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-indigo-500'}`}
                            >
                                <Ticket size={12}/> Générer
                            </button>

                            <div className="absolute -right-4 -bottom-4 opacity-10 transform rotate-12 scale-150 pointer-events-none" style={{ color: (s as any).color }}>
                                {s.type === 'Sprinter' ? <Zap size={60}/> : s.type === 'Dormeur' ? <Clock size={60}/> : s.type === 'Marathonien' ? <Activity size={60}/> : <Network size={60}/>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-100 dark:border-slate-800 h-[450px] relative">
                    <div className="absolute top-6 left-6 z-10">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <Network size={14}/> Carte des Positions
                        </h4>
                    </div>
                    
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 40, right: 20, bottom: 20, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                            <XAxis 
                                type="number" 
                                dataKey="x" 
                                name="Retard" 
                                label={{ value: 'Retard (Nbre de tirages)', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#94a3b8' }} 
                                tick={{fontSize: 10, fontWeight:'bold'}} 
                                axisLine={false} 
                                tickLine={false} 
                            />
                            <YAxis 
                                type="number" 
                                dataKey="y" 
                                name="Fréquence" 
                                label={{ value: 'Fréquence Récente', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 10, fill: '#94a3b8' } }} 
                                tick={{fontSize: 10, fontWeight:'bold'}} 
                                axisLine={false} 
                                tickLine={false} 
                            />
                            <Tooltip 
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const p = payload[0].payload;
                                        return (
                                            <div className="bg-slate-900 text-white p-3 rounded-xl text-xs shadow-xl border border-slate-700">
                                                <div className="font-black mb-1">Numéro {p.number}</div>
                                                <div style={{ color: CLUSTER_CONFIG[p.cluster].color }}>{p.cluster}</div>
                                                <div className="text-slate-400">Écart: {p.x} | Freq: {p.y}</div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <ReferenceArea x1={20} fill="#f43f5e" fillOpacity={0.03} label={{ value: "ZONE DE RETARD", position: 'insideTopRight', fontSize: 9, fill: '#fda4af' }} />
                            <ReferenceArea y1={4} fill="#10b981" fillOpacity={0.03} label={{ value: "ZONE CHAUDE", position: 'insideTopLeft', fontSize: 9, fill: '#6ee7b7' }} />
                            
                            <Scatter 
                                name="Numéros" 
                                data={filteredPoints} 
                                onClick={(p) => { audioEngine.play('click'); setSelectedPoint(p.payload); }} 
                                animationDuration={800}
                            >
                                {filteredPoints.map((p, index) => (
                                    <Cell 
                                        key={`cell-${index}`} 
                                        fill={CLUSTER_CONFIG[p.cluster]?.color || '#9ca3af'}
                                        strokeWidth={selectedPoint?.number === p.number ? 4 : 0}
                                        stroke="#fff"
                                    />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-center text-slate-400 mt-2 italic">Cliquez sur un point pour voir sa fiche joueur.</p>
                </div>

                <div className="h-full">
                    {numberProfile ? (
                        <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-2xl border border-slate-800 h-full flex flex-col relative overflow-hidden animate-slide-up">
                            <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-[80px] opacity-20" style={{ backgroundColor: numberProfile.config.color }}></div>
                            
                            <div className="relative z-10 flex flex-col items-center text-center">
                                <div className="mb-4 transform hover:scale-110 transition-transform cursor-pointer" title="Numéro">
                                    <NumberBall number={numberProfile.number} size="xl" />
                                </div>
                                <h4 className="text-2xl font-black">{numberProfile.config.type}</h4>
                                <p className="text-xs text-slate-400 font-medium mt-1">{numberProfile.config.metaphor}</p>
                                
                                <div className="mt-6 w-full space-y-4">
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            <span>Forme (Fréquence)</span>
                                            <span>{Math.round(numberProfile.scores.form)}/100</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${numberProfile.scores.form}%` }}></div>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            <span>Pression (Retard)</span>
                                            <span>{Math.round(numberProfile.scores.gap)}/100</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${numberProfile.scores.gap}%` }}></div>
                                        </div>
                                    </div>
                                </div>

                                {/* SECTION MARKOV ET CORRELATION */}
                                <div className="mt-6 w-full grid grid-cols-2 gap-3">
                                    {markovData && markovData.matrix[numberProfile.number] && (
                                        <div className="bg-slate-800/50 p-3 rounded-2xl border border-slate-700/50 text-left">
                                            <div className="flex items-center gap-1.5 text-indigo-400 text-[9px] font-black uppercase tracking-widest mb-2 border-b border-indigo-900/30 pb-1">
                                                <GitMerge size={10} /> Chaine de Markov
                                            </div>
                                            <div className="space-y-1.5">
                                                {Object.entries(markovData.matrix[numberProfile.number])
                                                    .sort(([, a], [, b]) => b - a)
                                                    .slice(0, 3)
    // @ts-ignore - auto generated by cleanup
                                                    .map(([nextNum, score]) => (
                                                        <div key={nextNum} className="flex justify-between items-center text-[10px]">
                                                            <span className="text-slate-300 font-bold">Sort souvent avant le <span className="text-indigo-300">{nextNum}</span></span>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}

                                    {correlationData && correlationData[numberProfile.number]?.affinities && (
                                        <div className="bg-slate-800/50 p-3 rounded-2xl border border-slate-700/50 text-left">
                                            <div className="flex items-center gap-1.5 text-cyan-400 text-[9px] font-black uppercase tracking-widest mb-2 border-b border-cyan-900/30 pb-1">
                                                <Link size={10} /> Groupe Corrélé
                                            </div>
                                            <div className="space-y-1.5">
                                                {Object.entries(correlationData[numberProfile.number].affinities)
                                                    .sort(([, a], [, b]) => b - a)
                                                    .slice(0, 3)
    // @ts-ignore - auto generated by cleanup
                                                    .map(([corrNum, score]) => (
                                                        <div key={corrNum} className="flex justify-between items-center text-[10px]">
                                                            <span className="text-slate-300 font-bold">Sort souvent avec le <span className="text-cyan-300">{corrNum}</span></span>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="mt-auto p-4 bg-white/5 rounded-2xl border border-white/5 w-full text-left">
                                    <div className="flex items-center gap-2 mb-2 text-amber-400 text-[10px] font-black uppercase tracking-widest">
                                        <Brain size={12}/> Conseil Stratégique
                                    </div>
                                    <p className="text-xs text-slate-300 leading-relaxed font-medium">
                                        "{numberProfile.config.advice}"
                                    </p>
                                </div>

                                <button 
                                    onClick={() => handleToggleWatchlist(numberProfile.number)}
                                    className={`mt-auto w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg ${isInWatchlist(numberProfile.number) ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                                >
                                    <Star size={14} className={isInWatchlist(numberProfile.number) ? 'fill-current' : ''}/>
                                    {isInWatchlist(numberProfile.number) ? 'Suivi Actif' : 'Ajouter aux Favoris'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full bg-slate-50 dark:bg-slate-800/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center p-8 text-center opacity-60">
                            <Info size={40} className="text-slate-400 mb-4"/>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Sélectionnez un point sur la carte pour voir sa fiche technique.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
