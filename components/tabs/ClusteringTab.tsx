
import React, { useState, useEffect, useMemo } from 'react';
import { calculateRegularity, performKMeansClusteringAsync } from '../../services/mathService';
import { addToWatchlist, removeFromWatchlist, isInWatchlist } from '../../services/userPreferencesService';
import type { ClusterPoint, ClusterSummary, NumberRegularity } from '../../types';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceArea, ReferenceLine } from 'recharts';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { Brain, Star, Activity, Info, Network, Zap, Clock, TrendingUp, UserCheck, HelpCircle } from 'lucide-react';
import { useNexus } from '../NexusProvider';

interface ClusteringTabProps {
    drawName: string;
}

// Configuration "Novice-Friendly" des familles
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
    const { history, loading: nexusLoading } = useNexus();
    
    const [points, setPoints] = useState<ClusterPoint[]>([]);
    const [summary, setSummary] = useState<any[]>([]); // Using any for enriched summary
    const [regularity, setRegularity] = useState<NumberRegularity[]>([]);
    const [selectedPoint, setSelectedPoint] = useState<ClusterPoint | null>(null);
    const [activeFilter, setActiveFilter] = useState<string | null>(null); // Filtre actif
    const [calculating, setCalculating] = useState(false);

    useEffect(() => {
        if (history.length > 20) {
            setCalculating(true);
            
            Promise.all([
                calculateRegularity(history),
                performKMeansClusteringAsync(history)
            ]).then(([regData, kMeansPoints]) => {
                setRegularity(regData);
                setPoints(kMeansPoints);
                
                // Calcul des comptes pour les cartes
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

    // Données filtrées pour le graphique
    const filteredPoints = useMemo(() => {
        if (!activeFilter) return points;
        return points.filter(p => p.cluster === activeFilter);
    }, [points, activeFilter]);

    // Construction de la "Carte d'Identité" du numéro sélectionné
    const numberProfile = useMemo(() => {
        if (!selectedPoint) return null;
        const reg = regularity.find(r => r.number === selectedPoint.number);
        const config = CLUSTER_CONFIG[selectedPoint.cluster];
        
        // Scores (0-100) pour les jauges
        const formScore = Math.min(100, (selectedPoint.y / 8) * 100); // Basé sur fréquence récente
        const gapScore = Math.min(100, (selectedPoint.x / 40) * 100); // Basé sur l'écart
        
        return { 
            ...selectedPoint,
            ...reg,
            config,
            scores: { form: formScore, gap: gapScore }
        };
    }, [selectedPoint, regularity]);

    const handleToggleWatchlist = (num: number) => {
        if (isInWatchlist(num)) {
            removeFromWatchlist(num);
            showToast(`N°${num} retiré des favoris.`, "info");
        } else {
            if (addToWatchlist(num)) showToast(`N°${num} ajouté aux favoris !`, "success");
            else showToast("Limite de favoris atteinte.", "error");
        }
    };

    if (nexusLoading || calculating || history.length === 0) return (
        <div className="flex flex-col items-center justify-center h-64 gap-6 bg-slate-900/5 rounded-[3rem] border border-dashed border-indigo-200 dark:border-slate-700 animate-pulse">
            <div className="relative">
                <Network className="animate-spin text-indigo-500" size={48} />
            </div>
            <p className="font-black text-indigo-500 text-xs font-mono uppercase tracking-[0.4em]">Profilage des numéros...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            
            {/* HERO SECTION: LES FAMILLES */}
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
                        <button
                            key={s.type}
                            onClick={() => { setActiveFilter(activeFilter === s.type ? null : s.type); setSelectedPoint(null); }}
                            className={`p-4 rounded-[2rem] border transition-all relative overflow-hidden group text-left
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
                            <div>
                                <div className={`text-[11px] font-black uppercase tracking-wide ${activeFilter === s.type ? 'text-white' : ''}`} style={{ color: activeFilter === s.type ? 'white' : s.color }}>
                                    {s.type}s
                                </div>
                                <div className={`text-[9px] font-medium mt-1 leading-tight ${activeFilter === s.type ? 'text-slate-400' : 'text-slate-400'}`}>
                                    {s.metaphor}
                                </div>
                            </div>
                            {/* Background decoration */}
                            <div className="absolute -right-4 -bottom-4 opacity-10 transform rotate-12 scale-150" style={{ color: s.color }}>
                                {s.type === 'Sprinter' ? <Zap size={60}/> : s.type === 'Dormeur' ? <Clock size={60}/> : s.type === 'Marathonien' ? <Activity size={60}/> : <Network size={60}/>}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                
                {/* GRAPHIQUE (CARTE DE POSITION) */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-[3rem] p-6 shadow-xl border border-slate-100 dark:border-slate-800 h-[450px] relative">
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
                                cursor={{ strokeDasharray: '3 3' }} 
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
                            {/* Zones visuelles */}
                            <ReferenceArea x1={20} fill="#f43f5e" fillOpacity={0.03} label={{ value: "ZONE DE RETARD", position: 'insideTopRight', fontSize: 9, fill: '#fda4af' }} />
                            <ReferenceArea y1={4} fill="#10b981" fillOpacity={0.03} label={{ value: "ZONE CHAUDE", position: 'insideTopLeft', fontSize: 9, fill: '#6ee7b7' }} />
                            
                            <Scatter 
                                name="Numéros" 
                                data={filteredPoints} 
                                onClick={(p) => setSelectedPoint(p.payload)} 
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
                    <p className="text-[9px] text-center text-slate-400 mt-2 italic">Cliquez sur un point pour voir sa fiche joueur.</p>
                </div>

                {/* FICHE JOUEUR (RPG STYLE) */}
                <div className="h-full">
                    {numberProfile ? (
                        <div className="bg-slate-900 text-white p-6 rounded-[3rem] shadow-2xl border border-slate-800 h-full flex flex-col relative overflow-hidden animate-slide-up">
                            {/* Background Glow */}
                            <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-[80px] opacity-20" style={{ backgroundColor: numberProfile.config.color }}></div>
                            
                            <div className="relative z-10 flex flex-col items-center text-center">
                                <div className="mb-4 transform hover:scale-110 transition-transform cursor-pointer" title="Numéro">
                                    <NumberBall number={numberProfile.number} size="xl" />
                                </div>
                                <h4 className="text-2xl font-black">{numberProfile.config.type}</h4>
                                <p className="text-xs text-slate-400 font-medium mt-1">{numberProfile.config.metaphor}</p>
                                
                                <div className="mt-6 w-full space-y-4">
                                    {/* Jauges RPG */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            <span>Forme (Fréquence)</span>
                                            <span>{Math.round(numberProfile.scores.form)}/100</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${numberProfile.scores.form}%` }}></div>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            <span>Pression (Retard)</span>
                                            <span>{Math.round(numberProfile.scores.gap)}/100</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-rose-500 transition-all duration-1000" style={{ width: `${numberProfile.scores.gap}%` }}></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 p-4 bg-white/5 rounded-2xl border border-white/5 w-full text-left">
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
                        <div className="h-full bg-slate-50 dark:bg-slate-800/50 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center p-8 text-center opacity-60">
                            <Info size={40} className="text-slate-400 mb-4"/>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Sélectionnez un point sur la carte pour voir sa fiche technique.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* QUICK LIST: TOP OPPORTUNITÉS */}
            {!selectedPoint && (
                <div className="bg-indigo-50 dark:bg-indigo-900/10 p-6 rounded-[2.5rem] border border-indigo-100 dark:border-indigo-800/30 flex items-start gap-4">
                    <HelpCircle size={24} className="text-indigo-500 shrink-0 mt-1" />
                    <div>
                        <h5 className="text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase mb-1">Comment utiliser ce graphe ?</h5>
                        <p className="text-[11px] text-indigo-800/70 dark:text-indigo-200/70 leading-relaxed font-medium">
                            Les <strong>Sprinters</strong> (en vert, en haut à gauche) sont chauds et sortent souvent. Les <strong>Dormeurs</strong> (en rouge, à droite) sont des numéros qui n'ont pas joué depuis longtemps. Une bonne combinaison mélange souvent 1 Sprinter, 1 Dormeur et 3 Marathoniens.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
