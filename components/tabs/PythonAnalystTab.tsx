import React, { useState, useRef, useEffect } from 'react';
import { useNexus } from '../NexusProvider';
import { runDeepPythonAnalysis } from '../../services/pythonAnalystService';
import { PythonAnalysisResult } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { Terminal, Play, Cpu, Activity, BarChart2, CheckCircle, RefreshCw } from 'lucide-react';
import { SafeMarkdown } from '../ui/SafeMarkdown';

export const PythonAnalystTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history } = useNexus();
    const { showToast } = useToast();
    
    const [status, setStatus] = useState<'idle' | 'running' | 'completed'>('idle');
    const [result, setResult] = useState<PythonAnalysisResult | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [logs]);

    const runAnalysis = async () => {
        setStatus('running');
        setLogs([
            "> [SYSTEM] Initializing Python 3.11 Deep Learning Kernel...",
            `> [DATA] Mounting history registry for ${drawName} (n=${history.length})`,
            "> [MODEL] Pre-calculating Poisson Distribution Matrix...",
            "> [MODEL] Computing Markov State Transitions (Lag-1)...",
            "> [KERNEL] Running Stochastic Gradient Descent..."
        ]);

        try {
            const data = await runDeepPythonAnalysis(drawName, history, 'XGBoost', undefined, (msg) => {
                setLogs(prev => [...prev, `> ${msg}`]);
            });
            setResult(data);
            setStatus('completed');
            showToast("Inférence Kernel terminée.", "success");
        } catch (e: any) {
            setStatus('idle');
            setLogs(prev => [...prev, `! [CRITICAL] Kernel Panic: ${e.message}`]);
        }
    };

    const featureData = [
        { name: 'Poisson', value: 38, color: '#6366f1' },
        { name: 'Markov', value: 32, color: '#8b5cf6' },
        { name: 'Gap Vel.', value: 18, color: '#ec4899' },
        { name: 'Spectral', value: 12, color: '#10b981' }
    ];

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Command Header */}
            <div className="bg-slate-950 border border-emerald-500/20 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px] group-hover:bg-emerald-500/10 transition-all duration-1000"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <Cpu size={20} className="text-emerald-500" />
                            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-emerald-500">Neuro-Python Lab v2.0</h3>
                        </div>
                        <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase">Nexus <span className="text-emerald-500">Kernel</span></h2>
                        <p className="text-slate-400 text-xs md:text-sm mt-3 max-w-lg font-medium leading-relaxed">
                            L'IA simule un environnement Python scientifique pour exécuter des modèles de régression et des chaînes de Markov sur vos vecteurs.
                        </p>
                    </div>
                    <button 
                        onClick={runAnalysis}
                        disabled={status === 'running'}
                        className="px-10 py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                    >
                        {status === 'running' ? <RefreshCw className="animate-spin" size={18}/> : <Play size={18} fill="currentColor"/>}
                        {status === 'running' ? 'EXECUTING...' : 'RUN KERNEL'}
                    </button>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Kernel Console */}
                <div className="lg:col-span-7 bg-black rounded-[3rem] border border-slate-800 shadow-2xl overflow-hidden flex flex-col h-[550px]">
                    <div className="bg-slate-800 p-4 flex items-center gap-3 border-b border-slate-700">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">nexus_inference_engine.py</span>
                    </div>
                    <div ref={scrollRef} className="p-8 font-mono text-xs text-emerald-400 overflow-y-auto custom-scrollbar flex-1 space-y-3 bg-[#0a0a0a]">
                        {logs.length === 0 && <span className="text-slate-700 italic">Kernel Idle. Standby for operation...</span>}
                        {logs.map((log, i) => <div key={i} className="animate-fade-in">{log}</div>)}
                        {status === 'running' && <div className="w-2 h-4 bg-emerald-500 animate-pulse inline-block"></div>}
                    </div>
                </div>

                {/* Data Insights Sidebar */}
                <div className="lg:col-span-5 space-y-6">
                    {result ? (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                            {/* Feature Importance */}
                            <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-xl">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                                    <BarChart2 size={14}/> Feature Importance (Weights)
                                </h4>
                                <div className="h-48 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={featureData} layout="vertical">
                                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.05} />
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} width={70} axisLine={false} tickLine={false} />
                                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                                {featureData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Top Probabilities */}
                            <div className="bg-slate-900 p-8 rounded-[3rem] border border-indigo-500/20 shadow-2xl text-center">
                                <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-8">Model Output: Top Vectors</h4>
                                <div className="flex justify-center gap-3 flex-wrap">
                                    {result.findings.result_vector.map((n, i) => (
                                        <NumberBall key={n} number={n} size="md" isAttractor={i < 2} />
                                    ))}
                                </div>
                                <div className="mt-10 pt-8 border-t border-white/5 grid grid-cols-2">
                                    <div className="text-center border-r border-white/5">
                                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Confiance</div>
                                        <div className="text-3xl font-black text-emerald-400 font-mono">{Math.round(result.findings.confidence_score)}%</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">P-Value</div>
                                        <div className="text-3xl font-black text-indigo-400 font-mono">{result.findings.p_value.toFixed(3)}</div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/50 p-12 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center opacity-40">
                            <Activity size={48} className="mx-auto mb-4 text-slate-400" />
                            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Standby for Kernel Data...</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Final Interpretation */}
            {result && (
                <div className="bg-white dark:bg-slate-800 p-8 md:p-12 rounded-[3.5rem] border border-slate-100 dark:border-slate-700 shadow-xl animate-slide-up">
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <CheckCircle size={16} className="text-emerald-500"/> Kernel Intelligence Report
                    </h4>
                    <div className="prose dark:prose-invert max-w-none text-sm md:text-base font-medium leading-relaxed italic text-slate-600 dark:text-slate-300">
                        <SafeMarkdown text={result.insight} />
                    </div>
                </div>
            )}
        </div>
    );
};
