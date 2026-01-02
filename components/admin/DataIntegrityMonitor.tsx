import React, { useState, useEffect } from 'react';
import { fetchResults, checkAndSyncRecentResults } from '../../services/lotteryService';
import type { DrawResult } from '../../types';
import { CheckCircle, Database, CalendarX, RefreshCw, AlertTriangle, Trash2, Zap, ShieldCheck } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { useDeleteDrawMutation } from '../../hooks/useLottery';

interface IntegrityReport {
    totalDraws: number;
    healthScore: number;
    duplicates: DrawResult[];
    missingDates: string[];
    lastGapDays: number;
    status: 'Excellent' | 'Bon' | 'Critique';
}

export const DataIntegrityMonitor: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { showToast } = useToast();
    const [report, setReport] = useState<IntegrityReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [fixing, setFixing] = useState(false);
    
    const deleteMutation = useDeleteDrawMutation(drawName);

    const analyzeIntegrity = async () => {
        setLoading(true);
        try {
            const { data } = await fetchResults(drawName);
            if (data.length === 0) {
                setReport({ totalDraws: 0, healthScore: 0, duplicates: [], missingDates: [], lastGapDays: 0, status: 'Critique' });
                return;
            }

            const dateMap = new Map<string, DrawResult[]>();
            const duplicates: DrawResult[] = [];
            data.forEach(d => {
                const existing = dateMap.get(d.date) || [];
                if (existing.length > 0) duplicates.push(d);
                dateMap.set(d.date, [...existing, d]);
            });

            const sorted = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const lastDrawDate = new Date(sorted[0].date);
            const daysSinceLast = Math.floor((new Date().getTime() - lastDrawDate.getTime()) / (1000 * 60 * 60 * 24));

            let score = 100 - (duplicates.length * 10);
            if (daysSinceLast > 7) score -= 20;

            setReport({
                totalDraws: data.length,
                healthScore: Math.max(0, score),
                duplicates,
                missingDates: [],
                lastGapDays: daysSinceLast,
                status: score > 80 ? 'Excellent' : score > 50 ? 'Bon' : 'Critique'
            });
        } finally { setLoading(false); }
    };

    useEffect(() => { analyzeIntegrity(); }, [drawName]);

    return (
        <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-xl animate-fade-in">
            <div className="flex justify-between items-center mb-10">
                <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-4 uppercase tracking-tighter">
                    <Database className="w-6 h-6 text-indigo-500" /> Moniteur d'Intégrité HPC
                </h3>
                <button onClick={analyzeIntegrity} className="p-3 bg-slate-100 dark:bg-slate-700 rounded-2xl hover:rotate-180 transition-all">
                    <RefreshCw className={loading ? 'animate-spin text-indigo-500' : 'text-slate-500'} size={18} />
                </button>
            </div>

            {report && (
                <div className="grid md:grid-cols-3 gap-8">
                    <div className="p-8 bg-slate-50 dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Health Score</div>
                        <div className={`text-6xl font-black ${report.healthScore > 80 ? 'text-emerald-500' : 'text-rose-500'}`}>{report.healthScore}%</div>
                        <span className="text-[10px] font-black px-3 py-1 bg-white dark:bg-slate-800 rounded-full mt-4 border border-black/5 dark:border-white/5 uppercase tracking-widest">{report.status}</span>
                    </div>

                    <div className="p-8 bg-slate-50 dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 flex flex-col justify-center space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-400 uppercase">Tirages</span>
                            <span className="text-lg font-black text-slate-800 dark:text-white">{report.totalDraws}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-400 uppercase">Doublons</span>
                            <span className={`text-lg font-black ${report.duplicates.length > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{report.duplicates.length}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-400 uppercase">Dernier Sync</span>
                            <span className="text-lg font-black text-indigo-500">{report.lastGapDays}j</span>
                        </div>
                    </div>

                    <div className="p-8 bg-indigo-600 rounded-[2.5rem] text-white flex flex-col justify-center items-center text-center shadow-xl shadow-indigo-600/20 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform"><Zap size={60} /></div>
                        <h4 className="text-sm font-black uppercase mb-4 tracking-widest">Maintenance Directe</h4>
                        <button 
                            onClick={async () => { setFixing(true); await checkAndSyncRecentResults(); analyzeIntegrity(); setFixing(false); }}
                            disabled={fixing}
                            className="w-full py-4 bg-white text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:scale-105 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {fixing ? 'Synchronisation...' : 'Forcer Sync API'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};