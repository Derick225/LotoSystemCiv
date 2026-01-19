import React, { useState, useEffect, useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { getPredictionHistoryAsync } from '../../services/predictionHistoryService';
import { performForensicAnalysis } from '../../services/postPredictionAnalysisService';
import { PredictionForensics } from '../PredictionForensics';
import { Microscope, Calendar, ChevronRight, Activity, TrendingUp, Cpu, Network, Target, SearchX } from 'lucide-react';
import { ForensicReport } from '../../types';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';

export const ForensicHub: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history } = useNexus();
    const [reports, setReports] = useState<ForensicReport[]>([]);
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
                const preds = await getPredictionHistoryAsync(drawName);
                const computedReports: ForensicReport[] = [];

                // Analyse des prédictions récentes
                // On s'assure d'une correspondance stricte Prediction(Date) == Result(Date)
                for (const pred of preds.slice(0, 30)) {
                    let actual = null;

                    // 1. Tentative de lien par ID (Lien explicite déjà établi)
                    if (pred.drawResultId) {
                        actual = history.find(h => h.id === pred.drawResultId);
                    }

                    // 2. Correspondance stricte par Date Locale (Format DD/MM/YYYY)
                    if (!actual) {
                        // On utilise la date locale de la machine au moment de la prédiction
                        const predDateLocale = new Date(pred.timestamp).toLocaleDateString('fr-FR');
                        // history contient des dates formatées en "DD/MM/YYYY" par le lotteryService
                        actual = history.find(h => h.date === predDateLocale);
                    }

                    // Seule la prédiction du jour correspondant au tirage du même jour est traitée
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

    const trendData = useMemo(() => {
        return reports.map(r => ({
            date: r.date.slice(0, 5),
            hits: r.matches.filter(m => m.errorType === 'Hit').length,
            proximity: r.matches.filter(m => ['Voisin', 'Miroir'].includes(m.errorType)).length
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
                            <Microscope className="text-rose-500" size={24} />
                            <h3 className="text-sm font-black uppercase tracking-[0.4em] text-rose-500">Forensic Analytics Unit</h3>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-none mb-6">
                            Autopsie <span className="text-rose-500">Synchronisée</span>
                        </h2>
                        <p className="text-slate-400 text-sm font-medium leading-relaxed border-l-2 border-rose-500/30 pl-6 italic">
                            Analyse de précision par rapprochement strict. Le système ne compare que les prédictions et les résultats du **même jour calendaire**.
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
                                                            {hits} Hit{hits > 1 ? 's' : ''} Direct
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
                                        <Area type="monotone" dataKey="proximity" stackId="1" stroke="#6366f1" fill="url(#colorProxForensic)" strokeWidth={2} name="Voisins" />
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
                                "Le système a filtré toutes les archives pour ne conserver que les prédictions générées le même jour que le tirage réel. C'est l'étalon-or pour valider l'intuition de l'IA."
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