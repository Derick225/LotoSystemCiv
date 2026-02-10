
import React, { useState, useEffect, useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { getPredictionHistoryAsync } from '../../services/predictionHistoryService';
import { performForensicAnalysis } from '../../services/postPredictionAnalysisService';
import { getPlatinumHistory, performPlatinumAudit } from '../../services/metaAnalystService';
import { PredictionForensics } from '../PredictionForensics';
import { Microscope, Calendar, ChevronRight, Activity, TrendingUp, Cpu, Network, Target, SearchX, Crown } from 'lucide-react';
import { ForensicReport, PlatinumAudit } from '../../types';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar, Cell } from 'recharts';

export const ForensicHub: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history } = useNexus();
    const [reports, setReports] = useState<ForensicReport[]>([]);
    const [platinumAudits, setPlatinumAudits] = useState<PlatinumAudit[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState<ForensicReport | null>(null);

    useEffect(() => {
        const analyze = async () => {
            if (history.length < 1) {
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                // 1. Audit Standard (Oracle)
                const preds = await getPredictionHistoryAsync(drawName);
                const computedReports: ForensicReport[] = [];

                for (const pred of preds.slice(0, 30)) {
                    let actual = null;
                    if (pred.drawResultId) {
                        actual = history.find(h => h.id === pred.drawResultId);
                    }
                    if (!actual) {
                        const predDateLocale = new Date(pred.timestamp).toLocaleDateString('fr-FR');
                        actual = history.find(h => h.date === predDateLocale);
                    }

                    if (actual) {
                        const rep = await performForensicAnalysis(
                            drawName, 
                            actual.date, 
                            pred.prediction.suggestedNumbers, 
                            actual.gagnants, 
                            pred.prediction.breakdown,
                            pred.id
                        );
                        computedReports.push(rep);
                    }
                }
                setReports(computedReports);

                // 2. Audit Platinum (Timelines)
                const platHist = getPlatinumHistory(drawName);
                const computedAudits: PlatinumAudit[] = [];
                
                for (const plat of platHist.slice(0, 20)) {
                    // Recherche stricte par date
                    const platDateLocale = new Date(plat.timestamp).toLocaleDateString('fr-FR');
                    const actual = history.find(h => h.date === platDateLocale);
                    
                    if (actual) {
                        const audit = performPlatinumAudit(plat, actual);
                        computedAudits.push(audit);
                    }
                }
                setPlatinumAudits(computedAudits);

            } catch (err) {
                console.error("Forensic Hub Sync Error:", err);
            } finally {
                setLoading(false);
            }
        };
        analyze();
    }, [drawName, history]);

    // Calcul de la précision agrégée des neurones
    const algoRadarData = useMemo(() => {
        if (reports.length === 0) return [];
        const aggregates: Record<string, { sum: number, count: number }> = {};
        
        reports.forEach(r => {
            r.scoreDivergence.forEach(d => {
                if (!aggregates[d.algo]) aggregates[d.algo] = { sum: 0, count: 0 };
                aggregates[d.algo].sum += d.impact;
                aggregates[d.algo].count++;
            });
        });

        return Object.entries(aggregates).map(([algo, data]) => ({
            algo: algo.charAt(0).toUpperCase() + algo.slice(1),
            precision: Math.round(data.sum / Math.max(1, data.count)),
            fullMark: 100
        })).sort((a, b) => b.precision - a.precision).slice(0, 6);
    }, [reports]);

    // Calcul de la performance des Timelines Platinum
    const platinumStats = useMemo(() => {
        if (platinumAudits.length === 0) return [];
        const stats: Record<string, number> = { 'NOVA': 0, 'NEON': 0, 'TERRA': 0, 'CHRONOS': 0, 'AETHER': 0 };
        
        platinumAudits.forEach(audit => {
            audit.timelinePerformance.forEach(tp => {
                stats[tp.type] += tp.hits;
            });
        });
        
        return Object.entries(stats).map(([type, hits]) => ({
            name: type,
            hits: hits,
            color: type === 'NOVA' ? '#a855f7' : type === 'NEON' ? '#06b6d4' : type === 'TERRA' ? '#10b981' : type === 'CHRONOS' ? '#f59e0b' : '#f43f5e'
        })).sort((a, b) => b.hits - a.hits);
    }, [platinumAudits]);

    const trendData = useMemo(() => {
        return reports.map(r => ({
            date: r.date.slice(0, 5),
            hits: r.matches.filter(m => m.errorType === 'Hit').length,
            proximity: r.matches.filter(m => ['Voisin', 'Miroir', 'Shadow'].includes(m.errorType)).length
        })).reverse();
    }, [reports]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-20 gap-4 animate-pulse text-indigo-500">
            <RefreshCw className="animate-spin" size={32} />
            <p className="font-black uppercase text-[10px] tracking-[0.4em]">Comparaison des vecteurs de même date...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-16">
            {/* Header Forensic Unit */}
            <div className="bg-slate-900 text-white p-8 md:p-12 rounded-[3.5rem] shadow-2xl border border-slate-800 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Network size={160} /></div>
                
                <div className="relative z-10 grid lg:grid-cols-2 gap-12 items-center">
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-rose-500/20 rounded-xl border border-rose-500/30">
                                <Microscope className="text-rose-500" size={24} />
                            </div>
                            <h3 className="text-sm font-black uppercase tracking-[0.4em] text-rose-500">Forensic Analytics Unit</h3>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-none mb-6">
                            Autopsie <span className="text-rose-500">Synchronisée</span>
                        </h2>
                        <p className="text-slate-400 text-sm font-medium leading-relaxed border-l-2 border-rose-500/30 pl-6 italic">
                            Analyse de précision par rapprochement strict. Le système détecte les hits, voisins, miroirs et shadows (inversions) pour calculer la dérive précise de l'IA.
                        </p>
                    </div>

                    <div className="bg-black/40 p-6 rounded-[3rem] border border-white/5 shadow-inner">
                        <div className="flex justify-between items-center mb-6">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Algos sous-estimés (Potentiel)</span>
                            <span className="text-[8px] font-bold text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded border border-rose-400/20">VALIDÉ PAR DATE</span>
                        </div>
                        <div className="h-56 w-full">
                            {reports.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={algoRadarData}>
                                        <PolarGrid stroke="#1e293b" />
                                        <PolarAngleAxis dataKey="algo" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                                        <Radar name="Précision Manquée" dataKey="precision" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.5} strokeWidth={2} />
                                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-600 text-xs font-bold uppercase italic">Données de comparaison absentes</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Platinum Performance Monitor */}
            {platinumAudits.length > 0 && (
                <div className="bg-white dark:bg-slate-950 p-6 rounded-[3rem] border border-indigo-100 dark:border-indigo-900/30 shadow-xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-6 opacity-5"><Crown size={120} /></div>
                    
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8 relative z-10">
                        <div>
                            <h4 className="text-xs font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                                <Crown size={14}/> Platinum Performance (20 derniers)
                            </h4>
                            <p className="text-[10px] text-slate-400 font-bold mt-1">Quelle Timeline domine le flux ?</p>
                        </div>
                        <div className="text-[9px] font-black bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/20">
                            LEADER: {platinumStats[0]?.name}
                        </div>
                    </div>

                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={platinumStats} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', fontSize: '11px', color: '#fff' }} />
                                <Bar dataKey="hits" radius={[6, 6, 0, 0]} barSize={40}>
                                    {platinumStats.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Reports List */}
                <div className="lg:col-span-7 space-y-6">
                    <h4 className="px-4 text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Activity size={14}/> Dossiers Synchronisés ({reports.length})
                    </h4>
                    
                    {reports.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-20 bg-slate-50 dark:bg-slate-900/40 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center">
                            <SearchX size={48} className="text-slate-300 dark:text-slate-700 mb-4" />
                            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.2em] max-w-xs leading-relaxed">
                                Aucune prédiction ne correspond à un résultat du même jour dans l'historique actuel.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {reports.map((rep, idx) => {
                                const hits = rep.matches.filter(m => m.errorType === 'Hit').length;
                                const proximity = rep.matches.filter(m => ['Voisin', 'Miroir', 'Shadow'].includes(m.errorType)).length;
                                
                                return (
                                    <div 
                                        key={idx} 
                                        onClick={() => setSelectedReport(rep)}
                                        className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-700 cursor-pointer hover:border-rose-400 transition-all group relative overflow-hidden"
                                    >
                                        <div className="flex justify-between items-center relative z-10">
                                            <div className="flex items-center gap-4">
                                                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl text-slate-400 group-hover:text-rose-500 transition-colors">
                                                    <Calendar size={20}/>
                                                </div>
                                                <div>
                                                    <div className="text-lg font-black text-slate-800 dark:text-white leading-none">{rep.date}</div>
                                                    <div className="flex gap-2 mt-2">
                                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${hits > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                                            {hits} Hit{hits > 1 ? 's' : ''} Direct
                                                        </span>
                                                        {proximity > 0 && (
                                                            <span className="text-[8px] font-black uppercase bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                                                                {proximity} Signaux Proches
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-full text-slate-400 group-hover:text-rose-600 transition-colors">
                                                <ChevronRight size={20} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Sidebar Insight & Trend Chart */}
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl text-indigo-600">
                                <Target size={20} />
                            </div>
                            <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">Dérive de Précision</h4>
                        </div>
                        
                        <div className="h-40 w-full mb-2">
                            {reports.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={trendData}>
                                        <defs>
                                            <linearGradient id="colorHitsForensic" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                            </linearGradient>
                                            <linearGradient id="colorProxForensic" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                        <XAxis dataKey="date" hide />
                                        <YAxis hide domain={[0, 5]} />
                                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                                        <Area type="monotone" dataKey="proximity" stackId="1" stroke="#6366f1" fill="url(#colorProxForensic)" strokeWidth={2} name="Zones Proches" />
                                        <Area type="monotone" dataKey="hits" stackId="2" stroke="#10b981" fill="url(#colorHitsForensic)" strokeWidth={2} name="Hits" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center opacity-30"><Activity size={32} /></div>
                            )}
                        </div>
                        <div className="flex justify-center gap-4 text-[9px] font-bold text-slate-400 uppercase">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Hits</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> Proximité</span>
                        </div>
                    </div>

                    <div className="p-6 bg-slate-900 rounded-[2.5rem] text-white border border-slate-800 shadow-xl relative overflow-hidden">
                        <Cpu className="absolute top-0 right-0 p-4 opacity-10" size={64} />
                        <div className="relative z-10">
                            <h5 className="text-[10px] font-black uppercase text-rose-500 tracking-[0.2em] mb-3">Diagnostic de Rapprochement</h5>
                            <p className="text-xs text-slate-400 leading-relaxed font-medium italic">
                                "Le système détecte désormais les inversions (ex: 12 vs 21) et les ombres mathématiques pour affiner le calcul de la dérive."
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {selectedReport && (
                <PredictionForensics 
                    report={selectedReport} 
                    onClose={() => setSelectedReport(null)} 
                />
            )}
        </div>
    );
};

const RefreshCw = ({size, className}:any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M23 4v6h-6"></path>
        <path d="M1 20v-6h6"></path>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
    </svg>
);
