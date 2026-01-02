
import React, { useState, useEffect, useRef } from 'react';
import { useNexus } from '../NexusProvider';
import { runDeepPythonAnalysis } from '../../services/pythonAnalystService';
import { PythonAnalysisResult } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { Terminal, Play, Cpu, Code2, Database, Activity, Sparkles, Binary, CheckCircle2, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const PythonAnalystTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history } = useNexus();
    const { showToast } = useToast();
    
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const [result, setResult] = useState<PythonAnalysisResult | null>(null);
    const [visibleLogs, setVisibleLogs] = useState<string[]>([]);
    const logIntervalRef = useRef<number | null>(null);

    const runAnalysis = async () => {
        if (history.length < 20) {
            showToast("Dataset insuffisant pour le Kernel Python.", "error");
            return;
        }
        
        setStatus('running');
        setVisibleLogs(["[SYSTEM] Initializing Python 3.12 Kernel...", "[SYSTEM] Loading dependencies (numpy, pandas, scikit-learn)..."]);
        setResult(null);

        try {
            const data = await runDeepPythonAnalysis(drawName, history);
            
            // Simulation de logs en différé pour l'immersion
            let logIdx = 0;
            const fullLogs = [
                ...data.stdout,
                `[SUCCESS] Model ${data.findings.method} convergence reached.`,
                `[INFO] P-Value: ${data.findings.p_value.toFixed(4)}`,
                "[SYSTEM] Exporting results to JSON structure..."
            ];

            logIntervalRef.current = window.setInterval(() => {
                if (logIdx < fullLogs.length) {
                    setVisibleLogs(prev => [...prev, fullLogs[logIdx]]);
                    logIdx++;
                } else {
                    if (logIntervalRef.current) clearInterval(logIntervalRef.current);
                    setResult(data);
                    setStatus('completed');
                    showToast("Analyse Python terminée.", "success");
                }
            }, 600);

        } catch (e) {
            setStatus('error');
            showToast("Kernel Panic: Erreur d'exécution.", "error");
        }
    };

    useEffect(() => {
        return () => { if (logIntervalRef.current) clearInterval(logIntervalRef.current); };
    }, []);

    return (
        <div className="space-y-8 animate-fade-in pb-12 w-full overflow-hidden">
            {/* Header Hero */}
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-1000"></div>
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-10">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-emerald-600 rounded-xl shadow-lg"><Terminal size={18} className="text-white" /></div>
                            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-400">Deep Analytics Module</h3>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-none mb-6">
                            Python <span className="text-emerald-500">Neural Kernel</span>
                        </h2>
                        <p className="text-slate-400 max-w-2xl text-sm font-medium leading-relaxed border-l-2 border-emerald-500/30 pl-6">
                            Exécutez des modèles de régression vectorielle et d'apprentissage profond sur l'historique complet pour isoler les signatures mathématiques de rupture.
                        </p>
                    </div>
                    
                    <button 
                        onClick={runAnalysis} 
                        disabled={status === 'running'}
                        className={`
                            relative px-12 py-6 rounded-[2rem] font-black uppercase tracking-widest text-sm flex items-center gap-4 transition-all shadow-2xl transform active:scale-95
                            ${status === 'running' ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'}
                        `}
                    >
                        {status === 'running' ? <Cpu className="animate-spin" size={20} /> : <Play size={20} className="fill-current" />}
                        {status === 'running' ? 'Kernel Active...' : 'Lancer Deep Analysis'}
                    </button>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Console Terminal */}
                <div className="lg:col-span-7 space-y-6">
                    <div className="bg-black/90 rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden h-[500px] flex flex-col group">
                        <div className="p-4 bg-slate-900 border-b border-white/5 flex justify-between items-center">
                            <div className="flex gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                            </div>
                            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">nexus_python_console_v3.12</span>
                        </div>
                        <div className="flex-1 p-6 font-mono text-xs overflow-y-auto custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] bg-fixed">
                            <div className="space-y-1.5">
                                {visibleLogs.map((log, i) => (
                                    <div key={i} className={`flex gap-3 ${log.includes('[SUCCESS]') ? 'text-emerald-400' : log.includes('[ERROR]') ? 'text-rose-400' : 'text-slate-300'}`}>
                                        <span className="text-slate-600 select-none">{i+1}</span>
                                        <span className="break-all">{log}</span>
                                    </div>
                                ))}
                                {status === 'running' && (
                                    <div className="flex gap-3 text-emerald-500 animate-pulse">
                                        <span className="text-slate-600">{visibleLogs.length + 1}</span>
                                        <span>_</span>
                                    </div>
                                )}
                                {status === 'idle' && (
                                    <div className="text-slate-600 italic">En attente d'initialisation du Kernel...</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Script Output Area */}
                    <AnimatePresence>
                        {result && (
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-xl relative overflow-hidden"
                            >
                                <div className="flex items-center gap-3 mb-6">
                                    <Code2 size={20} className="text-emerald-500" />
                                    <h4 className="text-white font-black uppercase text-xs tracking-widest">Source Analysis Script</h4>
                                </div>
                                <div className="bg-black/50 p-6 rounded-2xl border border-white/5 font-mono text-[11px] text-emerald-400/80 overflow-x-auto">
                                    <pre>{result.script}</pre>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Findings & Deep Metrics */}
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3.5rem] shadow-xl border border-slate-100 dark:border-slate-700 h-full flex flex-col">
                        <div className="flex items-center gap-4 mb-10">
                            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/40 rounded-2xl text-emerald-600">
                                <Sparkles size={24} />
                            </div>
                            <div>
                                <h4 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">Résultats Statistiques</h4>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Inférence Data Science</p>
                            </div>
                        </div>

                        {result ? (
                            <div className="space-y-8 animate-slide-up">
                                <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700">
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                                        <Activity size={14} className="text-emerald-500"/> Vecteurs Identifiés (Top 5)
                                    </div>
                                    <div className="flex gap-4 justify-center">
                                        {result.findings.result_vector.map((n, i) => (
                                            <motion.div 
                                                key={n} 
                                                initial={{ scale: 0 }} 
                                                animate={{ scale: 1 }} 
                                                transition={{ delay: i * 0.1 }}
                                            >
                                                <NumberBall number={n} size="md" confidence={result.findings.confidence_score} />
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-5 bg-indigo-50 dark:bg-indigo-900/30 rounded-3xl border border-indigo-100 dark:border-indigo-800/50">
                                        <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase mb-2">Confidence Score</div>
                                        <div className="text-3xl font-black text-indigo-700 dark:text-indigo-300">{(result.findings.confidence_score).toFixed(1)}%</div>
                                    </div>
                                    <div className="p-5 bg-emerald-50 dark:bg-emerald-900/30 rounded-3xl border border-emerald-100 dark:border-emerald-800/50">
                                        <div className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase mb-2">P-Value Accuracy</div>
                                        <div className="text-3xl font-black text-emerald-700 dark:text-emerald-300">{result.findings.p_value.toFixed(4)}</div>
                                    </div>
                                </div>

                                <div className="p-6 bg-slate-900 text-white rounded-[2rem] border border-slate-800 shadow-inner relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-10"><Binary size={40}/></div>
                                    <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <CheckCircle2 size={12}/> Conclusion du Kernel
                                    </h5>
                                    <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium italic">
                                        "{result.insight}"
                                    </p>
                                </div>
                                
                                <div className="space-y-4">
                                    <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">Pipeline d'analyse</h5>
                                    <ul className="space-y-2">
                                        {[
                                            "Preprocessing via Pandas DataFrame",
                                            "Time-Series Decomposition (Seasonal)",
                                            "Covariance Matrix Computing",
                                            "Stationarity Test (ADF)"
                                        ].map((step, i) => (
                                            <li key={i} className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                                                <ChevronRight size={10} className="text-emerald-500" /> {step}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 opacity-40">
                                <Database size={64} className="text-slate-300 mb-6" />
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
                                    Kernel Idle. Lancez l'analyse scientifique pour extraire le génome stochastique.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
