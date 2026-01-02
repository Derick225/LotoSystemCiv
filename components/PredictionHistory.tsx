
import React, { useState, useEffect, useCallback } from 'react';
import { getPredictionHistoryAsync, clearPredictionHistory, linkPredictionToResult } from '../services/predictionHistoryService';
import { performForensicAnalysis } from '../services/postPredictionAnalysisService';
import type { PredictionHistoryItem, DrawResult, ForensicReport } from '../types';
import { NumberBall } from './NumberBall';
import { Trash2, History, CheckCircle2, Microscope, Link as LinkIcon, AlertCircle, Binary, ChevronDown, Activity, Clock } from 'lucide-react';
import { useToast } from './ui/Toast';
import { PredictionForensics } from './PredictionForensics';
import { useNexus } from './NexusProvider';
import { TicketXRay } from './TicketXRay';

interface PredictionHistoryProps { drawName: string; }

export const PredictionHistory: React.FC<PredictionHistoryProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { history: results, loading: nexusLoading } = useNexus();
    const [history, setHistory] = useState<PredictionHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [forensicReport, setForensicReport] = useState<ForensicReport | null>(null);
    const [expandedItem, setExpandedItem] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const hist = await getPredictionHistoryAsync(drawName);
            setHistory(hist);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, [drawName]);

    useEffect(() => { loadData(); }, [loadData]);

    const getResultById = useCallback((id: string) => results.find(r => r.id === id), [results]);
    const getResultByDate = useCallback((date: string) => results.find(r => r.date === date), [results]);

    // Operational Auto-Linker
    useEffect(() => {
        const linkOrphans = async () => {
            if (history.length > 0 && results.length > 0) {
                let changed = false;
                for (const item of history) {
                    if (!item.drawResultId) {
                        const dateStr = new Date(item.timestamp).toLocaleDateString('fr-FR');
                        const match = getResultByDate(dateStr);
                        if (match) {
                            await linkPredictionToResult(item.id, match.id);
                            changed = true;
                        }
                    }
                }
                if (changed) loadData();
            }
        };
        linkOrphans();
    }, [history, results, getResultByDate, loadData]);

    const handleOpenAudit = async (e: React.MouseEvent, result: DrawResult, predictionItem: PredictionHistoryItem) => {
        e.stopPropagation();
        const report = await performForensicAnalysis(
            drawName, result.date, 
            predictionItem.prediction.suggestedNumbers, 
            result.gagnants, predictionItem.prediction.breakdown,
            predictionItem.id
        );
        setForensicReport(report);
    };

    if (loading || nexusLoading) return <div className="p-12 space-y-4"><div className="h-20 bg-slate-100 rounded-3xl animate-pulse"></div><div className="h-20 bg-slate-100 rounded-3xl animate-pulse"></div></div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center px-2">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600"><History size={20}/></div>
                    <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-tighter">Historique Inférence</h3>
                </div>
                <button onClick={() => { if(confirm("Vider l'historique ?")) { clearPredictionHistory(drawName); setHistory([]); }}} className="text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-widest flex items-center gap-2 transition-colors"><Trash2 size={14}/> Reset Journal</button>
            </div>

            <div className="grid gap-4">
                {history.map((item) => {
                    const res = item.drawResultId ? getResultById(item.drawResultId) : getResultByDate(new Date(item.timestamp).toLocaleDateString('fr-FR'));
                    const hits = res ? item.prediction.suggestedNumbers.filter(n => res.gagnants.includes(n)) : [];
                    const isExpanded = expandedItem === item.id;
                    const dateObj = new Date(item.timestamp);
                    
                    return (
                        <div 
                            key={item.id} 
                            onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                            className={`bg-white dark:bg-gray-800 rounded-[2rem] border shadow-sm overflow-hidden group transition-all cursor-pointer ${isExpanded ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-slate-100 dark:border-slate-700 hover:border-indigo-500'}`}
                        >
                            <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-50 dark:divide-slate-700">
                                <div className="p-6 md:w-3/5">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <div className="text-base font-black text-slate-800 dark:text-white">{dateObj.toLocaleDateString('fr-FR')}</div>
                                                <div className="flex items-center gap-1 text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-full">
                                                    <Clock size={10} />
                                                    {dateObj.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Confiance {item.prediction.confidence}%</span>
                                                {item.drawResultId && <span className="flex items-center gap-1 text-[8px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-100 uppercase"><LinkIcon size={8}/> ID-LINKED</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {res && <button onClick={(e) => handleOpenAudit(e, res, item)} className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"><Microscope size={18}/></button>}
                                            <div className={`p-2 rounded-full transition-transform ${isExpanded ? 'rotate-180 bg-slate-100 text-indigo-600' : 'text-slate-400'}`}>
                                                <ChevronDown size={16}/>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2.5">
                                        {item.prediction.suggestedNumbers.map(n => (
                                            <div key={n} className="relative">
                                                {hits.includes(n) && <div className="absolute -inset-1 bg-emerald-500/40 rounded-full blur animate-pulse"></div>}
                                                <NumberBall number={n} size="sm" selected={hits.includes(n)} />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className={`p-6 md:w-2/5 flex flex-col justify-center ${res ? 'bg-slate-50/30 dark:bg-slate-900/20' : 'bg-slate-50/10'}`}>
                                    {res ? (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Résultat Officiel</span>
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${hits.length >= 2 ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-200 text-slate-500'}`}>{hits.length} HITS</span>
                                            </div>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {res.gagnants.map(n => {
                                                    const isHit = item.prediction.suggestedNumbers.includes(n);
                                                    return <div key={n} className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black border transition-all ${isHit ? 'bg-emerald-600 border-emerald-400 text-white scale-110 shadow-md' : 'bg-white dark:bg-slate-800 border-slate-200 text-slate-300'}`}>{n}</div>
                                                })}
                                            </div>
                                            
                                            {res.machine && res.machine.length > 0 && (
                                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter flex items-center gap-1">
                                                        <Binary size={8}/> Machine
                                                    </span>
                                                    <div className="flex gap-1">
                                                        {res.machine.map(n => (
                                                            <div key={n} className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-900/50 text-[7px] font-black text-slate-500 border border-slate-200 dark:border-slate-700 flex items-center justify-center">{n}</div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {hits.length >= 3 && <div className="flex items-center gap-2 text-[9px] font-black text-emerald-600 bg-emerald-50 p-1.5 rounded-lg animate-bounce-subtle"><CheckCircle2 size={12}/> PRÉCISION ÉLITE DÉTECTÉE</div>}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center gap-2 opacity-30 text-slate-400">
                                            <AlertCircle size={24}/>
                                            <span className="text-[9px] font-black uppercase tracking-[0.2em]">En attente de tirage</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {isExpanded && (
                                <div className="border-t border-slate-100 dark:border-slate-700 p-2 cursor-default" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-2 px-4 py-2">
                                        <Activity size={14} className="text-indigo-500"/>
                                        <span className="text-[10px] font-black text-slate-500 uppercase">Analyse Structurelle Prédiction</span>
                                    </div>
                                    <TicketXRay numbers={item.prediction.suggestedNumbers} score={item.prediction.confidence} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            {forensicReport && <PredictionForensics report={forensicReport} onClose={() => setForensicReport(null)} />}
        </div>
    );
};
