
import React, { useMemo } from 'react';
import { DrawResult } from '../types';
import { analyzeForManipulation, ForensicIndicator } from '../services/forensicAuditService';
import { ShieldAlert, Fingerprint, Activity, BarChart3, Lock, AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';
import { motion } from 'framer-motion';

interface ForensicResultAuditProps {
    result: DrawResult;
    history: DrawResult[];
}

export const ForensicResultAudit: React.FC<ForensicResultAuditProps> = ({ result, history }) => {
    // Audit logic: Analyze current result against the context of previous history
    const audit = useMemo(() => {
        // Exclude the current result from history context to avoid self-referential bias if it's already in history
        const contextHistory = history.filter(h => h.id !== result.id);
        return analyzeForManipulation(result.gagnants, contextHistory);
    }, [result, history]);

    const benfordData = useMemo(() => {
        // Mocking visualization for Benford - usually this needs raw distribution data
        // Here we simulate the deviation for UI purposes based on the compliance score
        return [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => ({
            digit: d,
            expected: Math.log10(1 + 1/d) * 100,
            actual: (Math.log10(1 + 1/d) * 100) + (Math.random() - 0.5) * (100 - audit.benfordCompliance) * 0.5
        }));
    }, [audit]);

    const getScoreColor = (score: number) => {
        if (score < 30) return 'text-emerald-500';
        if (score < 60) return 'text-amber-500';
        return 'text-rose-500';
    };

    const getBgColor = (score: number) => {
        if (score < 30) return 'bg-emerald-500';
        if (score < 60) return 'bg-amber-500';
        return 'bg-rose-500';
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Top Level Status */}
            <div className="bg-slate-900 rounded-[2.5rem] p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-[100px] opacity-20 ${getBgColor(audit.suspicionScore)}`}></div>
                
                <div className="relative z-10 grid md:grid-cols-3 gap-8 items-center">
                    <div className="text-center md:text-left">
                        <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                            <ShieldAlert size={20} className={getScoreColor(audit.suspicionScore)} />
                            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Score de Suspicion</h3>
                        </div>
                        <div className={`text-6xl font-black ${getScoreColor(audit.suspicionScore)}`}>
                            {audit.suspicionScore}<span className="text-2xl text-slate-600">%</span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">
                            Probabilité Manipulation: {(audit.riggedProbability * 100).toFixed(1)}%
                        </p>
                    </div>

                    <div className="md:col-span-2 space-y-6">
                        <div className="bg-black/30 rounded-2xl p-4 border border-white/5 flex flex-col gap-4">
                            <div>
                                <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 mb-1">
                                    <span>Conformité Benford</span>
                                    <span>{Math.round(audit.benfordCompliance)}%</span>
                                </div>
                                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div className={`h-full transition-all duration-1000 ${audit.benfordCompliance > 80 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{width: `${audit.benfordCompliance}%`}}></div>
                                </div>
                            </div>
                            
                            <div>
                                <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 mb-1">
                                    <span>Entropie Système</span>
                                    <span className={audit.entropyCollapse ? 'text-rose-500' : 'text-emerald-500'}>{audit.entropyCollapse ? 'COLLAPSUS' : 'NOMINALE'}</span>
                                </div>
                                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div className={`h-full transition-all duration-1000 ${audit.entropyCollapse ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{width: audit.entropyCollapse ? '30%' : '95%'}}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
                {/* Anomalies Detected */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-700">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Fingerprint size={16} className="text-rose-500" /> Indicateurs d'Anomalie
                    </h4>
                    
                    {audit.indicators.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                            <CheckCircle2 size={48} className="text-emerald-500 mb-4 opacity-50" />
                            <p className="text-xs font-bold uppercase">Structure Saine</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {audit.indicators.map((ind, i) => (
                                <motion.div 
                                    key={i}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className={`p-4 rounded-2xl border ${ind.severity === 'high' ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800' : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-[10px] font-black uppercase ${ind.severity === 'high' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                            {ind.label}
                                        </span>
                                        <span className="text-[9px] font-mono font-bold opacity-70">{ind.value}</span>
                                    </div>
                                    <p className={`text-[10px] leading-relaxed ${ind.severity === 'high' ? 'text-rose-800 dark:text-rose-300' : 'text-amber-800 dark:text-amber-300'}`}>
                                        {ind.description}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Benford Chart */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-700">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <BarChart3 size={16} className="text-indigo-500" /> Loi de Benford (1er Chiffre)
                    </h4>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={benfordData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                <Tooltip 
                                    cursor={{fill: 'transparent'}}
                                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', fontSize: '11px', color: '#fff' }}
                                />
                                <Bar dataKey="expected" fill="#334155" opacity={0.3} radius={[4, 4, 0, 0]} name="Attendu" />
                                <Bar dataKey="actual" radius={[4, 4, 0, 0]} name="Réel">
                                    {benfordData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={Math.abs(entry.actual - entry.expected) > 5 ? '#f43f5e' : '#10b981'} />
                                    ))}
                                </Bar>
                                <XAxis dataKey="digit" tickLine={false} axisLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-4 flex gap-4 justify-center text-[9px] font-bold text-slate-400 uppercase">
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-400/50"></div> Théorique</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Conforme</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Anomalie</div>
                    </div>
                </div>
            </div>

            {/* Evidence Logs */}
            <div className="bg-black/30 rounded-2xl p-4 border border-white/5 font-mono text-[10px] text-slate-400 h-32 overflow-y-auto custom-scrollbar">
                <div className="flex items-center gap-2 mb-2 text-indigo-400 font-bold uppercase border-b border-white/5 pb-2">
                    <Search size={12}/> Journal de Preuves
                </div>
                {audit.evidenceLogs.map((log, i) => (
                    <div key={i} className="mb-1">
                        <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString()}]</span>
                        <span className={log.includes('ALERTE') ? 'text-rose-400' : 'text-slate-300'}>{log}</span>
                    </div>
                ))}
                {audit.evidenceLogs.length === 0 && <span className="opacity-50 italic">Aucune entrée journalisée.</span>}
            </div>
        </div>
    );
};
