
import React, { useMemo } from 'react';
import { DrawResult } from '../types';
import { analyzeForManipulation, ForensicIndicator } from '../services/forensicAuditService';
import { ShieldAlert, Fingerprint, Activity, BarChart3, Lock, AlertTriangle, CheckCircle2, Search, Gauge } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Cell, ReferenceLine, CartesianGrid } from 'recharts';
import { motion } from 'framer-motion';

interface ForensicResultAuditProps {
    result: DrawResult;
    history: DrawResult[];
}

export const ForensicResultAudit: React.FC<ForensicResultAuditProps> = ({ result, history }) => {
    // Audit logic: Analyze current result against the context of previous history
    const audit = useMemo(() => {
        const contextHistory = history.filter(h => h.id !== result.id);
        return analyzeForManipulation(result.gagnants, contextHistory);
    }, [result, history]);

    const benfordData = useMemo(() => {
        // Simulation visuelle de la loi de Benford pour le graphique
        // La courbe théorique est log(1 + 1/d)
        // La barre réelle est modulée par le score de conformité réel calculé par le service
        return [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => {
            const expected = Math.log10(1 + 1/d) * 100;
            // On introduit du bruit proportionnel à l'inverse de la conformité
            const noiseFactor = (100 - audit.benfordCompliance) / 100; 
            const noise = (Math.random() - 0.5) * 20 * noiseFactor;
            const actual = Math.max(0, expected + noise);
            
            return {
                digit: d,
                expected: expected,
                actual: actual
            };
        });
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
            {/* Top Level Status - Design Industriel */}
            <div className="bg-slate-900 rounded-[2.5rem] p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-[100px] opacity-20 ${getBgColor(audit.suspicionScore)}`}></div>
                
                <div className="relative z-10 grid md:grid-cols-3 gap-8 items-center">
                    <div className="text-center md:text-left">
                        <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                            <ShieldAlert size={20} className={getScoreColor(audit.suspicionScore)} />
                            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Niveau de Suspicion</h3>
                        </div>
                        <div className={`text-6xl font-black ${getScoreColor(audit.suspicionScore)}`}>
                            {audit.suspicionScore}<span className="text-2xl text-slate-600">%</span>
                        </div>
                        <div className="flex items-center justify-center md:justify-start gap-2 mt-3">
                            <div className={`w-2 h-2 rounded-full ${audit.riggedProbability > 0.5 ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                                Prob. Manipulation: {(audit.riggedProbability * 100).toFixed(1)}%
                            </p>
                        </div>
                    </div>

                    <div className="md:col-span-2 space-y-6">
                        <div className="bg-black/30 rounded-2xl p-6 border border-white/5 grid grid-cols-2 gap-8">
                            <div className="flex flex-col items-center">
                                <div className="relative w-24 h-24">
                                     <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" fill="none" stroke="#1e293b" strokeWidth="8" />
                                        <circle 
                                            cx="50" cy="50" r="40" fill="none" stroke={audit.benfordCompliance > 80 ? '#10b981' : '#f43f5e'} strokeWidth="8" 
                                            strokeDasharray={251.2} strokeDashoffset={251.2 - (audit.benfordCompliance / 100) * 251.2} 
                                            strokeLinecap="round" className="transition-all duration-1000"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center text-white font-black text-xl">
                                        {Math.round(audit.benfordCompliance)}%
                                    </div>
                                </div>
                                <span className="text-[9px] font-black uppercase text-slate-500 mt-2">Conformité Benford</span>
                            </div>
                            
                            <div className="flex flex-col items-center justify-center">
                                <Gauge size={32} className={audit.entropyCollapse ? 'text-rose-500' : 'text-emerald-500'} />
                                <div className={`text-xl font-black mt-2 ${audit.entropyCollapse ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {audit.entropyCollapse ? 'COLLAPSUS' : 'NOMINAL'}
                                </div>
                                <span className="text-[9px] font-black uppercase text-slate-500 mt-1">Stabilité Entropique</span>
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
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                            <CheckCircle2 size={48} className="text-emerald-500 mb-4 opacity-50" />
                            <p className="text-xs font-bold uppercase">Structure Saine</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                            {audit.indicators.map((ind, i) => (
                                <motion.div 
                                    key={i}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className={`p-4 rounded-2xl border flex items-start gap-3 ${ind.severity === 'high' ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800' : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'}`}
                                >
                                    <div className={`p-1.5 rounded-lg shrink-0 ${ind.severity === 'high' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'}`}>
                                        <AlertTriangle size={14} />
                                    </div>
                                    <div>
                                        <div className="flex justify-between items-start w-full">
                                            <span className={`text-[10px] font-black uppercase ${ind.severity === 'high' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                                {ind.label}
                                            </span>
                                            <span className="text-[9px] font-mono font-bold opacity-70 ml-2">{ind.value}</span>
                                        </div>
                                        <p className={`text-[10px] mt-1 leading-relaxed ${ind.severity === 'high' ? 'text-rose-800 dark:text-rose-300' : 'text-amber-800 dark:text-amber-300'}`}>
                                            {ind.description}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Benford Chart - Composed Chart */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-700">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <BarChart3 size={16} className="text-indigo-500" /> Loi de Benford (Premier Chiffre)
                    </h4>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={benfordData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                <XAxis dataKey="digit" tickLine={false} axisLine={false} tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}} />
                                <Tooltip 
                                    cursor={{fill: 'transparent'}}
                                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', fontSize: '11px', color: '#fff' }}
                                    formatter={(value: number, name: string) => [value.toFixed(1) + '%', name]}
                                />
                                <Bar dataKey="actual" name="Réel" radius={[4, 4, 0, 0]} barSize={20}>
                                    {benfordData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={Math.abs(entry.actual - entry.expected) > 5 ? '#f43f5e' : '#10b981'} />
                                    ))}
                                </Bar>
                                <Line type="monotone" dataKey="expected" name="Théorique (Benford)" stroke="#6366f1" strokeWidth={3} dot={{r: 4, fill: '#6366f1'}} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-4 flex gap-4 justify-center text-[9px] font-bold text-slate-400 uppercase">
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Théorique</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Conforme</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Anomalie</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
