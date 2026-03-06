
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNexus } from '../NexusProvider';
import { getPredictionHistoryAsync } from '../../services/predictionHistoryService';
import { performForensicAnalysis, saveForensicReport, getLocalForensicReports, syncForensicReportsWithCloud, deleteForensicReportLocal } from '../../services/postPredictionAnalysisService';
import { deleteForensicReportCloud } from '../../services/syncService';
import { getPlatinumHistory, performPlatinumAudit } from '../../services/metaAnalystService';
import { PredictionForensics } from '../PredictionForensics';
import { ForensicResultAudit } from '../ForensicResultAudit';
import { Microscope, Calendar, ChevronRight, Activity, Target, SearchX, Crown, ScanBarcode, Radar as RadarIcon, Network, RefreshCw, Cloud, Trash2 } from 'lucide-react';
import { ForensicReport, PlatinumAudit } from '../../types';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import { useToast } from '../ui/Toast';

type ForensicMode = 'prediction' | 'structure';

export const ForensicHub: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history } = useNexus();
    const { showToast } = useToast();
    const [reports, setReports] = useState<ForensicReport[]>([]);
    const [platinumAudits, setPlatinumAudits] = useState<PlatinumAudit[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [selectedReport, setSelectedReport] = useState<ForensicReport | null>(null);
    const [mode, setMode] = useState<ForensicMode>('prediction');
    const [refreshKey, setRefreshKey] = useState(0);

    const runAnalysis = useCallback(async () => {
        if (history.length < 1) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            // 1. Charger les rapports existants (Local First)
            let currentReports = getLocalForensicReports().filter(r => r.drawName === drawName);
            
            // 2. Identifier les prédictions sans rapport
            const preds = await getPredictionHistoryAsync(drawName);
            let newReportsCount = 0;

            for (const pred of preds.slice(0, 30)) {
                // Si rapport existe déjà pour cette prédiction, skip
                if (currentReports.some(r => r.predictionId === pred.id)) continue;

                let actual = null;
                if (pred.drawResultId) {
                    actual = history.find(h => h.id === pred.drawResultId);
                }
                if (!actual) {
                    const predDateLocale = new Date(pred.timestamp).toLocaleDateString('fr-FR');
                    actual = history.find(h => h.date === predDateLocale);
                    
                    // Fallback date approximative
                    if (!actual) {
                         const predTime = pred.timestamp;
                         const sortedHistory = [...history].sort((a, b) => new Date(a.date.split('/').reverse().join('-')).getTime() - new Date(b.date.split('/').reverse().join('-')).getTime());
                         actual = sortedHistory.find(d => {
                             const dTime = new Date(d.date.split('/').reverse().join('-')).getTime();
                             return dTime >= predTime && (dTime - predTime) < 48 * 3600 * 1000;
                         });
                    }
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
                    // Sauvegarder immédiatement
                    saveForensicReport(rep);
                    currentReports.push(rep);
                    newReportsCount++;
                }
            }
            
            // Trier par date décroissante
            currentReports.sort((a, b) => new Date(b.date.split('/').reverse().join('-')).getTime() - new Date(a.date.split('/').reverse().join('-')).getTime());
            setReports(currentReports);

            if (newReportsCount > 0) {
                showToast(`${newReportsCount} nouvelles autopsies générées.`, "success");
            }

            // 3. Audit Platinum (Timelines) - Recalculé à la volée car léger
            const platHist = getPlatinumHistory(drawName);
            const computedAudits: PlatinumAudit[] = [];
            
            for (const plat of platHist.slice(0, 20)) {
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
            showToast("Erreur lors de l'analyse Forensic.", "error");
        } finally {
            setLoading(false);
        }
    }, [drawName, history, showToast]);

    useEffect(() => {
        runAnalysis();
    }, [runAnalysis, refreshKey]);

    const handleRefresh = () => {
        setRefreshKey(prev => prev + 1);
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const synced = await syncForensicReportsWithCloud();
            setReports(synced.filter(r => r.drawName === drawName));
            showToast("Synchronisation Cloud terminée.", "success");
        } catch (e) {
            showToast("Erreur de synchronisation.", "error");
        } finally {
            setSyncing(false);
        }
    };

    const handleDeleteReport = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Supprimer ce rapport Forensic (Local + Cloud) ?")) return;

        try {
            deleteForensicReportLocal(id);
            await deleteForensicReportCloud(id);
            setReports(prev => prev.filter(r => r.id !== id));
            if (selectedReport?.id === id) setSelectedReport(null);
            showToast("Rapport supprimé.", "info");
        } catch (e) {
            showToast("Erreur suppression.", "error");
        }
    };

    // ... (rest of the component logic: useMemo, render)

    // Calcul de la précision agrégée des neurones pour le Radar
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
            precision: Math.round((data.sum / Math.max(1, data.count)) * 1.5), 
            fullMark: 100
        })).sort((a, b) => b.precision - a.precision).slice(0, 6);
    }, [reports]);

    const platinumStats = useMemo(() => {
        if (platinumAudits.length === 0) return [];
        const stats: Record<string, number> = { 'Alpha Core': 0, 'Beta Flow': 0, 'Gamma Burst': 0 };
        
        platinumAudits.forEach(audit => {
            audit.timelinePerformance.forEach(tp => {
                const key = Object.keys(stats).find(k => tp.type.includes(k.split(' ')[0]));
                if (key) stats[key] += tp.hits;
            });
        });
        
        return Object.entries(stats).map(([type, hits]) => ({
            name: type.split(' ')[0], 
            hits: hits,
            color: type.includes('Alpha') ? '#10b981' : type.includes('Beta') ? '#6366f1' : '#f43f5e'
        })).sort((a, b) => b.hits - a.hits);
    }, [platinumAudits]);

    const trendData = useMemo(() => {
        return reports.map(r => ({
            date: r.date.slice(0, 5),
            hits: r.matches.filter(m => m.errorType === 'Hit').length,
            proximity: r.matches.filter(m => ['Voisin', 'Miroir', 'Shadow'].includes(m.errorType)).length
        })).reverse();
    }, [reports]);

    if (loading && reports.length === 0) return (
        <div className="flex flex-col items-center justify-center p-24 gap-6 animate-pulse">
            <Microscope className="text-indigo-500 animate-bounce" size={48} />
            <p className="font-black text-indigo-500 uppercase tracking-[0.4em] text-xs">Analyse Vectorielle Post-Mortem...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-16">
            <div className="bg-slate-900 text-white p-8 md:p-12 rounded-[3.5rem] shadow-2xl border border-slate-800 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Network size={160} /></div>
                
                <div className="relative z-10 flex flex-col md:flex-row gap-12 items-center justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-rose-500/20 rounded-xl border border-rose-500/30">
                                <Microscope className="text-rose-500" size={24} />
                            </div>
                            <h3 className="text-sm font-black uppercase tracking-[0.4em] text-rose-500">Forensic Analytics Unit</h3>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-none mb-6">
                            Autopsie <span className="text-rose-500">Deep-Scan</span>
                        </h2>
                        
                        <div className="flex gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/5 w-fit">
                            <button 
                                onClick={() => setMode('prediction')}
                                className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${mode === 'prediction' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-500 hover:text-white'}`}
                            >
                                <Target size={14}/> Prédictions
                            </button>
                            <button 
                                onClick={() => setMode('structure')}
                                className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${mode === 'structure' ? 'bg-rose-600 text-white shadow-xl' : 'text-slate-500 hover:text-white'}`}
                            >
                                <ScanBarcode size={14}/> Intégrité Tirage
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <button 
                            onClick={handleSync}
                            disabled={syncing}
                            className={`p-4 bg-indigo-600/20 hover:bg-indigo-600/40 rounded-2xl border border-indigo-500/30 text-indigo-400 hover:text-white transition-all group ${syncing ? 'animate-pulse' : ''}`}
                            title="Synchroniser Cloud"
                        >
                             <Cloud size={20} className={syncing ? 'animate-bounce' : ''} />
                        </button>
                        <button 
                            onClick={handleRefresh}
                            className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-2xl border border-white/10 text-slate-400 hover:text-white transition-all group"
                            title="Relancer l'analyse"
                        >
                             <RefreshCw size={20} className={`group-hover:rotate-180 transition-transform duration-700 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            {mode === 'structure' && history.length > 0 && (
                <ForensicResultAudit 
                    result={history[0]} 
                    history={history} 
                    onBack={() => setMode('prediction')} 
                />
            )}

            {mode === 'prediction' && (
                <div className="space-y-8 animate-slide-up">
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Platinum Stats */}
                        <div className="bg-white dark:bg-slate-950 p-6 rounded-[3rem] border border-indigo-100 dark:border-indigo-900/30 shadow-xl relative overflow-hidden">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-xs font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                                    <Crown size={14}/> Platinum Leaders
                                </h4>
                                {platinumStats.length > 0 && (
                                    <span className="text-[9px] font-black bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 px-2 py-1 rounded-lg">
                                        TOP: {platinumStats[0].name}
                                    </span>
                                )}
                            </div>
                            <div className="h-40 w-full">
                                {platinumStats.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={platinumStats}>
                                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', fontSize: '11px', color: '#fff' }} />
                                            <Bar dataKey="hits" radius={[6, 6, 6, 6]} barSize={30}>
                                                {platinumStats.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">Pas assez de données Platinum</div>
                                )}
                            </div>
                        </div>

                        {/* Algo Accuracy Radar */}
                        <div className="bg-slate-900 p-6 rounded-[3rem] border border-slate-800 shadow-xl relative overflow-hidden">
                            <div className="flex justify-between items-center mb-4 relative z-10">
                                <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                    <RadarIcon size={14}/> Précision Heuristique
                                </h4>
                            </div>
                            <div className="h-40 w-full relative z-10">
                                {algoRadarData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={algoRadarData}>
                                            <PolarGrid stroke="#334155" />
                                            <PolarAngleAxis dataKey="algo" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                            <Radar name="Précision" dataKey="precision" stroke="#10b981" strokeWidth={2} fill="#10b981" fillOpacity={0.4} />
                                            <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '10px', color: '#fff' }} />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">Données insuffisantes</div>
                                )}
                            </div>
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>
                        </div>
                    </div>

                    <div className="flex flex-col lg:grid lg:grid-cols-12 gap-8">
                        {/* Reports List */}
                        <div className="lg:col-span-7 space-y-6">
                            <h4 className="px-4 text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Activity size={14}/> Dossiers Synchronisés ({reports.length})
                            </h4>
                            
                            {reports.length === 0 ? (
                                <div className="flex flex-col items-center justify-center p-20 bg-slate-50 dark:bg-slate-900/40 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center">
                                    <SearchX size={48} className="text-slate-300 dark:text-slate-700 mb-4" />
                                    <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.2em] max-w-xs leading-relaxed">
                                        Aucune prédiction correspondante trouvée. Lancez une prédiction puis attendez le tirage.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                                    {reports.map((rep, idx) => {
                                        const hits = rep.matches.filter(m => m.errorType === 'Hit').length;
                                        const proximity = rep.matches.filter(m => ['Voisin', 'Miroir', 'Shadow'].includes(m.errorType)).length;
                                        
                                        return (
                                            <div 
                                                key={idx} 
                                                onClick={() => setSelectedReport(rep)}
                                                className="bg-white dark:bg-slate-800 p-5 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-all group relative overflow-hidden"
                                            >
                                                <div className="flex justify-between items-center relative z-10">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`p-3 rounded-2xl transition-colors ${hits > 0 ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-900 text-slate-400'}`}>
                                                            <Calendar size={18}/>
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-black text-slate-800 dark:text-white leading-none">{rep.date}</div>
                                                            <div className="flex gap-2 mt-1.5">
                                                                {hits > 0 && <span className="text-[8px] font-black uppercase bg-emerald-500 text-white px-2 py-0.5 rounded-md shadow-sm">{hits} Hits</span>}
                                                                {proximity > 0 && <span className="text-[8px] font-black uppercase bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-800">{proximity} Proches</span>}
                                                                {hits === 0 && proximity === 0 && <span className="text-[8px] font-bold text-slate-400 uppercase">Miss</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
                                                </div>
                                                
                                                <button 
                                                    onClick={(e) => handleDeleteReport(rep.id, e)}
                                                    className="absolute top-2 right-2 p-1.5 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all z-20"
                                                    title="Supprimer"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Trend Chart */}
                        <div className="lg:col-span-5 space-y-6">
                            <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 h-full flex flex-col">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl text-indigo-600">
                                        <Target size={20} />
                                    </div>
                                    <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">Dérive de Précision</h4>
                                </div>
                                
                                <div className="flex-1 min-h-[200px] w-full mb-2">
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
                        </div>
                    </div>
                </div>
            )}

            {selectedReport && (
                <PredictionForensics 
                    report={selectedReport} 
                    onClose={() => setSelectedReport(null)} 
                />
            )}
        </div>
    );
};
