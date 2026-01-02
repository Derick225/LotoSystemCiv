
import React, { useState, useEffect, useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { getPredictionHistoryAsync } from '../../services/predictionHistoryService';
import { performForensicAnalysis } from '../../services/postPredictionAnalysisService';
import { PredictionForensics } from '../PredictionForensics';
import { Microscope, Search, Calendar, ChevronRight, Activity, TrendingUp, Cpu, Network } from 'lucide-react';
import { ForensicReport } from '../../types';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip } from 'recharts';

export const ForensicHub: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history } = useNexus();
    const [reports, setReports] = useState<ForensicReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState<ForensicReport | null>(null);

    useEffect(() => {
        const analyze = async () => {
            if (history.length < 5) return;
            setLoading(true);
            try {
                const preds = await getPredictionHistoryAsync(drawName);
                const computedReports: ForensicReport[] = [];

                for (const pred of preds.slice(0, 10)) {
                    const predDate = new Date(pred.timestamp).toLocaleDateString('fr-FR');
                    const actual = history.find(h => h.date === predDate);
                    
                    if (actual) {
                        const rep = await performForensicAnalysis(
                            drawName, 
                            predDate, 
                            pred.prediction.suggestedNumbers, 
                            actual.gagnants, 
                            pred.prediction.breakdown,
                            pred.id
                        );
                        computedReports.push(rep);
                    }
                }
                setReports(computedReports);
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
            precision: Math.round(data.sum / data.count),
            fullMark: 100
        }));
    }, [reports]);

    if (loading) return <div className="p-20 text-center animate-pulse text-slate-400 font-black uppercase text-xs tracking-widest">Calcul de la divergence algorithmique...</div>;

    return (
        <div className="space-y-8 animate-fade-in pb-16">
            {/* Header Forensic Unit */}
            <div className="bg-slate-900 text-white p-8 md:p-12 rounded-[3.5rem] shadow-2xl border border-slate-800 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Network size={160} /></div>
                
                <div className="relative z-10 grid lg:grid-cols-2 gap-12 items-center">
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <Microscope className="text-rose-500" size={24} />
                            <h3 className="text-sm font-black uppercase tracking-[0.4em] text-rose-500">Forensic Analytics Unit</h3>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-none mb-6">
                            Autopsie des <span className="text-rose-500">Biais Neuraux</span>
                        </h2>
                        <p className="text-slate-400 text-sm font-medium leading-relaxed border-l-2 border-rose-500/30 pl-6 italic">
                            Identifiez quel algorithme domine la structure actuelle et pourquoi le consensus échoue ou réussit. Une rétro-action directe sur le noyau de calcul.
                        </p>
                    </div>

                    <div className="bg-black/40 p-6 rounded-[3rem] border border-white/5 shadow-inner">
                        <div className="flex justify-between items-center mb-6">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Précision par Neurone</span>
                            <span className="text-[8px] font-bold text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded border border-rose-400/20">LIVE DATA</span>
                        </div>
                        <div className="h-56 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={algoRadarData}>
                                    <PolarGrid stroke="#1e293b" />
                                    <PolarAngleAxis dataKey="algo" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                                    <Radar name="Précision" dataKey="precision" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.5} strokeWidth={2} />
                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Reports List */}
                <div className="lg:col-span-7 space-y-4">
                    <h4 className="px-4 text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Activity size={14}/> Dossiers Post-Tirage ({reports.length})
                    </h4>
                    
                    {reports.length === 0 ? (
                        <div className="p-12 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-[3rem]">
                            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Aucune archive comparative.</p>
                        </div>
                    ) : (
                        reports.map((rep, idx) => {
                            const hits = rep.matches.filter(m => m.errorType === 'Hit').length;
                            const proximity = rep.matches.filter(m => ['Voisin', 'Miroir'].includes(m.errorType)).length;
                            
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
                                                        {hits} Hit{hits > 1 ? 's' : ''} Direct{hits > 1 ? 's' : ''}
                                                    </span>
                                                    {proximity > 0 && (
                                                        <span className="text-[8px] font-black uppercase bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                                                            {proximity} Frôlement{proximity > 1 ? 's' : ''}
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
                        })
                    )}
                </div>

                {/* Sidebar Insight */}
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 h-full">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-rose-50 dark:bg-rose-900/30 rounded-2xl text-rose-600">
                                <TrendingUp size={20} />
                            </div>
                            <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">Vecteurs d'Erreur Type</h4>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-slate-100 dark:border-slate-800">
                                <div className="text-[10px] font-black text-slate-500 uppercase mb-4">Analyse de la "Presque Précision"</div>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-slate-400">Hits Voisins (±1)</span>
                                        <span className="text-xs font-black text-white">{reports.reduce((acc, r) => acc + r.matches.filter(m => m.errorType === 'Voisin').length, 0)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-slate-400">Hits Miroirs (Inv)</span>
                                        <span className="text-xs font-black text-white">{reports.reduce((acc, r) => acc + r.matches.filter(m => m.errorType === 'Miroir').length, 0)}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-6 bg-rose-600 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
                                <Cpu className="absolute top-0 right-0 p-4 opacity-20" size={60} />
                                <div className="relative z-10">
                                    <h5 className="text-sm font-black uppercase mb-3">Recalibrage Recommandé</h5>
                                    <p className="text-xs text-rose-100 leading-relaxed font-medium">
                                        {algoRadarData.length > 0 
                                            ? `Le neurone "${algoRadarData.sort((a,b)=>b.precision-a.precision)[0].algo}" sur-performe actuellement. Pensez à augmenter son poids de 15% dans le module Tuning.`
                                            : "Collecte de données insuffisante pour un diagnostic de recalibrage."
                                        }
                                    </p>
                                </div>
                            </div>
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
