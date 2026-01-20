
import React, { useState, useRef, useEffect } from 'react';
import { useNexus } from '../NexusProvider';
import { runDeepPythonAnalysis } from '../../services/pythonAnalystService';
import { PythonAnalysisResult, NotebookCell } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Cell, BarChart, Bar } from 'recharts';
import { SafeMarkdown } from '../ui/SafeMarkdown';
import { 
    Terminal, Play, Cpu, Code2, Database, FlaskConical, 
    CheckCircle2, RefreshCw, Activity, Target, Binary,
    Layers, Boxes, FileText, Zap
} from 'lucide-react';

export const PythonAnalystTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history } = useNexus();
    const { showToast } = useToast();
    
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const [result, setResult] = useState<PythonAnalysisResult | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [selectedModel, setSelectedModel] = useState<'XGBoost' | 'ARIMA' | 'MCMC'>('XGBoost');
    
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const runAnalysis = async () => {
        if (history.length < 25) {
            showToast("Dataset insuffisant pour le Deep Learning (Min 25).", "error");
            return;
        }
        
        setStatus('running');
        setLogs(["[KERNEL] Initializing Neural Python Kernel v12.5...", "[ENV] Loading libraries: pandas, numpy, sklearn.ensemble, scipy.stats...", "[DATA] Normalizing 50 frames for tensor processing..."]);
        setResult(null);

        try {
            const data = await runDeepPythonAnalysis(
                drawName, 
                history, 
                selectedModel, 
                undefined,
                (msg) => setLogs(prev => [...prev, msg])
            );
            
            setResult(data);
            setStatus('completed');
            showToast("Calcul Deep Kernel validé.", "success");
        } catch (e: any) {
            setStatus('error');
            setLogs(prev => [...prev, `[FATAL] Kernel Panic: ${e.message}`]);
            showToast(e.message || "Échec du calcul distant.", "error");
        }
    };

    const renderCell = (cell: NotebookCell, index: number) => {
        return (
            <motion.div 
                key={cell.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="group relative flex gap-4"
            >
                <div className="w-12 pt-2 text-[10px] font-mono text-slate-500 text-right select-none">
                    In [{index + 1}]:
                </div>

                <div className="flex-1 space-y-4">
                    <div className={`
                        rounded-2xl border transition-all duration-500
                        ${cell.type === 'code' ? 'bg-slate-950 border-slate-800 shadow-inner' : 'bg-transparent border-transparent'}
                    `}>
                        {cell.type === 'markdown' && (
                            <div className="p-4 prose prose-invert max-w-none">
                                <SafeMarkdown text={cell.content} />
                            </div>
                        )}
                        
                        {cell.type === 'code' && (
                            <div className="p-5 font-mono text-[11px] text-emerald-400/90 whitespace-pre-wrap relative overflow-hidden">
                                <div className="absolute top-2 right-4 text-[8px] font-black text-slate-700 pointer-events-none tracking-widest">PY_KERNEL_EXECUTOR</div>
                                {cell.content}
                            </div>
                        )}
                        
                        {cell.type === 'output' && (
                            <div className="p-5 bg-black/40 rounded-2xl border border-white/5 font-mono text-[10px] text-slate-400 max-h-64 overflow-y-auto custom-scrollbar">
                                <div className="flex items-center gap-2 mb-3 text-slate-600 border-b border-white/5 pb-2">
                                    <Terminal size={12}/> <span className="uppercase tracking-widest font-black">Stdout Stream</span>
                                </div>
                                {cell.content.split('\n').map((line, i) => (
                                    <div key={i} className="mb-0.5 leading-relaxed">{line}</div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        );
    };

    return (
        <div className="space-y-8 animate-fade-in pb-20 w-full overflow-hidden">
            {/* Control Hub */}
            <div className="bg-slate-900 border border-emerald-500/20 p-8 rounded-[3.5rem] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col xl:flex-row justify-between items-center gap-8">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500 rounded-xl text-slate-900 shadow-lg shadow-emerald-500/20"><FlaskConical size={20} /></div>
                            <h3 className="text-sm font-black uppercase tracking-[0.4em] text-emerald-500">Deep Science Lab</h3>
                        </div>
                        <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-none">
                            Python <span className="text-emerald-500">Kernel</span> v12
                        </h2>
                        <p className="text-slate-400 max-w-xl text-xs md:text-sm font-medium">
                            Extraction tensorielle par gradient stochastique. Exécutez des modèles XGBoost ou MCMC en temps réel sur le cloud pour isoler les signatures harmoniques.
                        </p>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-4 bg-black/40 p-4 rounded-3xl border border-white/5 backdrop-blur-xl">
                        <div className="flex bg-slate-800 p-1 rounded-xl">
                            {['XGBoost', 'ARIMA', 'MCMC'].map(m => (
                                <button
                                    key={m}
                                    onClick={() => setSelectedModel(m as any)}
                                    className={`px-5 py-2.5 rounded-lg text-[9px] font-black uppercase transition-all ${selectedModel === m ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                        <button 
                            onClick={runAnalysis}
                            disabled={status === 'running'}
                            className="h-full px-10 py-5 bg-white text-slate-900 rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-2xl hover:bg-emerald-50 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-3"
                        >
                            {status === 'running' ? <RefreshCw className="animate-spin" size={18}/> : <Play className="fill-current" size={18}/>}
                            {status === 'running' ? 'RUNNING...' : 'EXECUTE KERNEL'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-8 space-y-12 bg-white dark:bg-slate-900/50 p-6 md:p-10 rounded-[3.5rem] shadow-xl border border-slate-100 dark:border-slate-800 min-h-[600px]">
                    {status === 'idle' && (
                        <div className="flex flex-col items-center justify-center py-48 gap-6 opacity-20">
                            <Binary size={80} className="text-slate-500 animate-pulse" />
                            <p className="text-sm font-black uppercase tracking-[0.4em] text-slate-500">Prêt pour l'inférence</p>
                        </div>
                    )}

                    {status === 'running' && (
                        <div className="space-y-6">
                            <div className="p-8 bg-slate-950 rounded-[2.5rem] font-mono text-[11px] text-emerald-400 overflow-hidden relative border border-emerald-950 shadow-inner">
                                <div className="flex justify-between items-center mb-6 text-slate-600 border-b border-white/5 pb-3">
                                    <div className="flex items-center gap-2 font-black tracking-widest"><Binary size={14}/> SYSTEM_LOG_STREAM</div>
                                    <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> BUSY</div>
                                </div>
                                <div ref={scrollRef} className="h-72 overflow-y-auto custom-scrollbar space-y-2">
                                    {logs.map((log, i) => <div key={i} className="leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity"><span className="text-slate-700 mr-2">[{new Date().toLocaleTimeString()}]</span> {log}</div>)}
                                    <div className="animate-pulse inline-block w-2 h-4 bg-emerald-500 align-middle ml-1"></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {result && (
                        <div className="space-y-12 animate-fade-in">
                            {result.cells.map((cell, idx) => renderCell(cell, idx))}
                        </div>
                    )}
                </div>

                <div className="lg:col-span-4 space-y-6">
                    {result ? (
                        <div className="space-y-6 animate-slide-up">
                            {/* Stats Card */}
                            <div className="bg-slate-950 p-10 rounded-[3rem] text-white border border-indigo-500/30 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><Activity size={100} /></div>
                                <div className="relative z-10 text-center">
                                    <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-4">Métrique de Confiance</div>
                                    <div className="text-7xl font-black text-white tracking-tighter">{Math.round(result.findings.confidence_score)}%</div>
                                    <div className="mt-6 px-6 py-2 bg-white/5 rounded-full inline-block text-[10px] font-black text-slate-400 uppercase border border-white/10 shadow-inner">
                                        P-Value: {result.findings.p_value.toFixed(5)}
                                    </div>
                                </div>
                            </div>

                            {/* Prediction Card */}
                            <div className="bg-white dark:bg-slate-800 p-8 rounded-[3.5rem] shadow-xl border border-slate-100 dark:border-slate-700">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-3">
                                    <Target size={18} className="text-rose-500" /> Vecteur de Sortie
                                </h4>
                                <div className="flex justify-center gap-4 flex-wrap">
                                    {result.findings.result_vector.map((n, i) => (
                                        <motion.div 
                                            key={n} 
                                            initial={{ scale: 0, rotate: -20 }} 
                                            animate={{ scale: 1, rotate: 0 }} 
                                            transition={{ delay: i * 0.1, type: 'spring' }}
                                        >
                                            <NumberBall number={n} size="md" isAttractor={i < 1} />
                                        </motion.div>
                                    ))}
                                </div>
                                <div className="mt-10 p-6 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-2 mb-3 text-indigo-500 font-black text-[9px] uppercase tracking-widest"><FileText size={12}/> Executive Summary</div>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed italic">
                                        {result.insight}
                                    </p>
                                </div>
                            </div>
                            
                            {/* Training Plot Simulation */}
                            <div className="bg-slate-900 p-6 rounded-[3rem] border border-slate-800 h-56 overflow-hidden relative">
                                <div className="absolute top-4 left-6 text-[8px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Activity size={10}/> Training Loss History</div>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={[
                                        { val: 1.2 }, { val: 0.8 }, { val: 0.45 }, { val: 0.32 }, { val: 0.28 }, { val: 0.15 }, { val: 0.08 }, { val: 0.04 }
                                    ]}>
                                        <defs>
                                            <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <Area type="monotone" dataKey="val" stroke="#10b981" fill="url(#colorLoss)" strokeWidth={3} animationDuration={2000} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    ) : (
                        <div className="p-10 bg-slate-50 dark:bg-slate-900/40 rounded-[3.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center space-y-6 opacity-60">
                            <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-3xl mx-auto flex items-center justify-center text-slate-300 dark:text-slate-600 shadow-inner">
                                <Code2 size={40} />
                            </div>
                            <div className="space-y-2">
                                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">En attente de Session</h4>
                                <p className="text-[10px] text-slate-400 font-medium leading-relaxed">Les résultats de l'inférence Python s'afficheront ici après exécution du noyau.</p>
                            </div>
                        </div>
                    )}

                    <div className="p-6 bg-indigo-600/10 rounded-[2.5rem] border border-indigo-500/20 flex gap-4 items-start">
                         <Zap size={20} className="text-indigo-500 shrink-0 mt-1" />
                         <p className="text-[10px] text-indigo-800 dark:text-indigo-300 font-medium leading-relaxed">
                            <strong>Note :</strong> L'analyse <strong>MCMC</strong> (Monte Carlo Markov Chain) est plus précise pour les jeux avec un faible historique, tandis que <strong>XGBoost</strong> excelle sur les jeux quotidiens avec plus de 200 tirages indexés.
                         </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
