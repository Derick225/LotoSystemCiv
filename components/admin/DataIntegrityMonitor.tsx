
import React, { useState, useEffect } from 'react';
import { fetchResults, checkAndSyncRecentResults } from '../../services/lotteryService';
import type { DrawResult } from '../../types';
import { CheckCircle, Database, CalendarX, RefreshCw, AlertTriangle, Trash2, Zap, ShieldCheck } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { useDeleteDrawMutation } from '../../hooks/useLottery';
import { audioEngine } from '../../utils/audioEngine';

interface IntegrityReport {
    totalDraws: number;
    healthScore: number;
    duplicates: DrawResult[];
    corruptData: { id: string, reason: string }[];
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
        audioEngine.play('scan');
        setLoading(true);
        try {
            const { data } = await fetchResults(drawName);
            if (data.length === 0) {
                setReport({ totalDraws: 0, healthScore: 0, duplicates: [], corruptData: [], missingDates: [], lastGapDays: 0, status: 'Critique' });
                return;
            }

            const dateMap = new Map<string, DrawResult[]>();
            const duplicates: DrawResult[] = [];
            const corruptData: { id: string, reason: string }[] = [];

            data.forEach(d => {
                // Check Duplicates
                const existing = dateMap.get(d.date) || [];
                if (existing.length > 0) duplicates.push(d);
                dateMap.set(d.date, [...existing, d]);

                // Check Corruption
                const issues: string[] = [];
                const invalidNums = d.gagnants.filter(n => n < 1 || n > 90);
                if (invalidNums.length > 0) issues.push(`Hors limites: ${invalidNums.join(',')}`);
                if (d.gagnants.length !== 5) issues.push(`Taille invalide: ${d.gagnants.length}`);
                if (d.date === 'Invalid Date' || !d.date) issues.push("Date invalide");

                if (issues.length > 0) {
                    corruptData.push({ id: d.id, reason: issues.join(' | ') });
                }
            });

            const sorted = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const lastDrawDate = new Date(sorted[0].date);
            const daysSinceLast = Math.floor((new Date().getTime() - lastDrawDate.getTime()) / (1000 * 60 * 60 * 24));

            let score = 100 - (duplicates.length * 10) - (corruptData.length * 15);
            if (daysSinceLast > 7) score -= 20;

            setReport({
                totalDraws: data.length,
                healthScore: Math.max(0, score),
                duplicates,
                corruptData,
                missingDates: [],
                lastGapDays: daysSinceLast,
                status: score > 80 ? 'Excellent' : score > 50 ? 'Bon' : 'Critique'
            });
            audioEngine.play('success');
        } finally { setLoading(false); }
    };

    const handleAutoClean = async () => {
        audioEngine.play('click');
        if (!report) return;
        setFixing(true);
        try {
            // Delete Duplicates (Keep 1)
            for (const dup of report.duplicates) {
                await deleteMutation.mutateAsync(dup.id);
            }
            // Delete Corrupt
            for (const corrupt of report.corruptData) {
                await deleteMutation.mutateAsync(corrupt.id);
            }
            audioEngine.play('success');
            showToast("Nettoyage terminé.", "success");
            analyzeIntegrity();
        } catch(e) {
            audioEngine.play('error');
            showToast("Erreur lors du nettoyage.", "error");
        } finally {
            setFixing(false);
        }
    };

    useEffect(() => { analyzeIntegrity(); }, [drawName]);

    return (
        <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-xl animate-fade-in">
            <div className="flex justify-between items-center mb-10">
                <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-4 uppercase tracking-tighter">
                    <Database className="w-6 h-6 text-indigo-500" /> Moniteur d'Intégrité HPC
                </h3>
                <button onClick={() => { audioEngine.play('click'); analyzeIntegrity(); }} className="p-3 bg-slate-100 dark:bg-slate-700 rounded-2xl hover:rotate-180 transition-all">
                    <RefreshCw className={loading ? 'animate-spin text-indigo-500' : 'text-slate-500'} size={18} />
                </button>
            </div>

            {report && (
                <div className="space-y-8">
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
                                <span className="text-xs font-bold text-slate-400 uppercase">Corrompus</span>
                                <span className={`text-lg font-black ${report.corruptData.length > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{report.corruptData.length}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-400 uppercase">Dernier Sync</span>
                                <span className="text-lg font-black text-indigo-500">{report.lastGapDays}j</span>
                            </div>
                        </div>

                        <div className="p-8 bg-indigo-600 rounded-[2.5rem] text-white flex flex-col justify-center items-center text-center shadow-xl shadow-indigo-600/20 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform"><Zap size={60} /></div>
                            <h4 className="text-sm font-black uppercase mb-4 tracking-widest">Maintenance Directe</h4>
                            <div className="space-y-2 w-full">
                                <button 
                                    onClick={async () => { audioEngine.play('click'); setFixing(true); await checkAndSyncRecentResults(); analyzeIntegrity(); setFixing(false); }}
                                    disabled={fixing}
                                    className="w-full py-3 bg-white text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:scale-105 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {fixing ? 'Sync...' : 'Forcer Sync API'}
                                </button>
                                {(report.duplicates.length > 0 || report.corruptData.length > 0) && (
                                    <button 
                                        onClick={handleAutoClean}
                                        disabled={fixing}
                                        className="w-full py-3 bg-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-rose-400 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        {fixing ? 'Nettoyage...' : 'Auto-Clean DB'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {report.corruptData.length > 0 && (
                        <div className="p-6 bg-rose-50 dark:bg-rose-900/10 rounded-[2rem] border border-rose-100 dark:border-rose-800">
                            <h4 className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <AlertTriangle size={14}/> Données Corrompues Détectées
                            </h4>
                            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                {report.corruptData.map((c, i) => (
                                    <div key={i} className="flex justify-between items-center text-[10px] font-mono text-rose-800 dark:text-rose-300 bg-white/50 dark:bg-black/20 p-2 rounded-lg">
                                        <span>ID: {c.id.slice(0,8)}...</span>
                                        <span className="font-bold">{c.reason}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
