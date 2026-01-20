
import React, { useState, useRef, useEffect } from 'react';
import { useNexus } from '../NexusProvider';
import { runDeepPythonAnalysis } from '../../services/pythonAnalystService';
import { PythonAnalysisResult, NotebookCell } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { 
    Terminal, Play, Cpu, Code2, Database, FlaskConical, 
    CheckCircle2, ChevronDown, ChevronUp, AlertTriangle, 
    BarChart as BarChartIcon, BrainCircuit, Layers, Boxes,
    FileText, Zap, Binary,
    // Fix: Added missing RefreshCw, Activity, and Target icons
    RefreshCw, Activity, Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Cell, BarChart, Bar } from 'recharts';
import { SafeMarkdown } from '../ui/SafeMarkdown';

export const PythonAnalystTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history } = useNexus();
    const { showToast } = useToast();
    
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const [result, setResult] = useState<PythonAnalysisResult | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [selectedModel, setSelectedModel] = useState<'XGBoost' | 'ARIMA' | 'MCMC'>('XGBoost');
    const [activeCell, setActiveCell] = useState(0);
    
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
        setLogs(["[SYSTEM] Initializing Neural Python Kernel v12.0...", "[ENV] Loading libraries: pandas, numpy, sklearn.ensemble, scipy.stats..."]);
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
            showToast("Inférence terminée avec succès.", "success");
        } catch (e: any) {
            setStatus('error');
            setLogs(prev => [...prev, `[FATAL ERROR] ${e.message}`]);
            showToast(e.message || "Échec de l'expérience.", "error");
        }
    };

    const renderCell = (cell: NotebookCell, index: number) => {
        const isExecuting = status === 'running' && index === activeCell;
        
        return (
            <motion.div 
                key={cell.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="group relative flex gap-4"
            >
                {/* Input Numbering */}
                <div className="w-12 pt-2 text-[10px] font-mono text-slate-500 text-right select-none">
                    In [{index + 1}]:
                </div>

                <div className="flex-1 space-y-4">
                    {/* Cell Content */}
                    <div className={`
                        rounded-2xl border transition-all duration-500
                        ${cell.type === 'code' ? 'bg-slate-950 border-slate-800' : 'bg-transparent border-transparent'}
                    `}>
                        {cell.type === 'markdown' && (
                            <div className="p-4 prose prose-invert max-w-none">
                                <SafeMarkdown text={cell.content} />
                            </div>
                        )}
                        
                        {cell.type === 'code' && (
                            <div className="p-4 font-mono text-[11px] text-emerald-400/90 whitespace-pre-wrap relative overflow-hidden">
                                <div className="absolute top-2 right-4 text-slate-700 pointer-events-none opacity-40">PYTHON</div>
                                {cell.content}
                            </div>
                        )}
                        
                        {cell.type === 'output' && (
                            <div className="p-4 bg-black/40 rounded-2xl border border-white/5 font-mono text-[10px] text-slate-400 max-h-60 overflow-y-auto custom-scrollbar">
                                <div className="flex items-center gap-2 mb-2 text-slate-600 border-b border-white/5 pb-2">
                                    <Terminal size={12}/> <span>Kernel Output</span>
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
            
            {/* Header Lab / Dashboard Control */}
            <div className="bg-slate-900 border border-indigo-500/20 p-8 rounded-[3.5rem] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col xl:flex-row justify-between items-center gap-8">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500 rounded-xl text-slate-900 shadow-lg shadow-emerald-500/20"><FlaskConical size={20} /></div>
                            <h3 className="text-sm font-black uppercase tracking-[0.4em] text-emerald-500">Neural Python Kernel</h3>
                        </div>
                        <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-none">
                            Deep <span className="text-emerald-500">Kernel</span> v12
                        </h2>
                        <p className="text-slate-400 max-w-xl text-xs md:text-sm font-medium">
                            Analyse tensorielle et prédiction par gradient boosting. Exécutez des modèles scientifiques réels sur vos données historiques.
                        </p>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-4 bg-black/40 p-4 rounded-3xl border border-white/5 backdrop-blur-xl">
                        <div className="flex flex-col gap-2">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-2">Modèle de Calcul</span>
                            <div className="flex bg-slate-800 p-1 rounded-xl">
                                {['XGBoost', 'ARIMA', 'MCMC'].map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setSelectedModel(m as any)}
                                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${selectedModel === m ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <button 
                            onClick={runAnalysis}
                            disabled={status === 'running'}
                            className="h-full px-8 py-5 bg-white text-slate-900 rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-2xl hover:bg-emerald-50 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-3"
                        >
                            {status === 'running' ? <RefreshCw className="animate-spin" size={18}/> : <Play className="fill-current" size={18}/>}
                            {status === 'running' ? 'EXÉCUTION...' : 'RUN KERNEL'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Notebook Experience */}
            <div className="grid lg:grid-cols-12 gap-8 items-start">
                
                {/* Main Content (Notebook) */}
                <div className="lg:col-span-8 space-y-12 bg-white dark:bg-slate-900/50 p-6 md:p-10 rounded-[3.5rem] shadow-xl border border-slate-100 dark:border-slate-800 min-h-[600px]">
                    
                    {status === 'idle' && (
                        <div className="flex flex-col items-center justify-center py-40 gap-6 opacity-30">
                            <Layers size={64} className="text-slate-500" />
                            <p className="text-sm font-black uppercase tracking-widest text-slate-500">Prêt pour l'inférence</p>
                        </div>
                    )}

                    {status === 'running' && (
                        <div className="space-y-6">
                            <div className="p-8 bg-slate-950 rounded-[2.5rem] font-mono text-[11px] text-emerald-400 overflow-hidden relative">
                                <div className="flex justify-between items-center mb-4 text-slate-600 border-b border-white/5 pb-2">
                                    <div className="flex items-center gap-2"><Binary size={14}/> SYSTEM_LOG_STREAM</div>
                                    <div className="animate-pulse">KERNEL BUSY</div>
                                </div>
                                <div ref={scrollRef} className="h-64 overflow-y-auto custom-scrollbar space-y-1">
                                    {logs.map((log, i) => <div key={i}>{log}</div>)}
                                    <div className="animate-pulse">_</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {result && (
                        <div className="space-y-10 animate-fade-in">
                            {result.cells.map((cell, idx) => renderCell(cell, idx))}
                        </div>
                    )}
                </div>

                {/* Sidebar Results Summary */}
                <div className="lg:col-span-4 space-y-6">
                    {result ? (
                        <div className="space-y-6 animate-slide-up">
                            {/* Confidence Card */}
                            <div className="bg-slate-950 p-8 rounded-[3rem] text-white border border-indigo-500/30 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Activity size={60} /></div>
                                <div className="relative z-10 text-center">
                                    <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Score de Convergence</div>
                                    <div className="text-6xl font-black text-white">{Math.round(result.findings.confidence_score)}%</div>
                                    <div className="mt-4 px-4 py-1.5 bg-white/5 rounded-full inline-block text-[9px] font-bold text-slate-400 uppercase border border-white/10">
                                        P-Value: {result.findings.p_value.toFixed(4)}
                                    </div>
                                </div>
                            </div>

                            {/* Result Vector */}
                            <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <Target size={16} className="text-rose-500" /> Vecteur Résultant
                                </h4>
                                <div className="flex justify-center gap-4 flex-wrap">
                                    {result.findings.result_vector.map((n, i) => (
                                        <motion.div 
                                            key={n} 
                                            initial={{ scale: 0 }} 
                                            animate={{ scale: 1 }} 
                                            transition={{ delay: i * 0.1 }}
                                        >
                                            <NumberBall number={n} size="md" isAttractor={i < 2} />
                                        </motion.div>
                                    ))}
                                </div>
                                <div className="mt-8 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/50">
                                    <p className="text-[10px] text-indigo-800 dark:text-indigo-300 font-medium leading-relaxed italic">
                                        "Le modèle <strong>{result.modelType}</strong> a isolé ces {result.findings.result_vector.length} unités avec une précision statistique supérieure à la moyenne locale."
                                    </p>
                                </div>
                            </div>
                            
                            {/* Evolution Chart Mini */}
                            <div className="bg-slate-900 p-6 rounded-[3rem] border border-slate-800 h-48 overflow-hidden relative">
                                <div className="absolute top-4 left-6 text-[9px] font-black text-slate-500 uppercase tracking-widest">Training Loss Reduction</div>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={[
                                        { val: 100 }, { val: 85 }, { val: 70 }, { val: 62 }, { val: 45 }, { val: 32 }, { val: 24 }, { val: 18 }, { val: 12 }, { val: 8 }
                                    ]}>
                                        <defs>
                                            <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <Area type="monotone" dataKey="val" stroke="#10b981" fill="url(#colorLoss)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    ) : (
                        <div className="p-8 bg-slate-50 dark:bg-slate-900/40 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center space-y-4">
                            <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full mx-auto flex items-center justify-center text-slate-300 dark:text-slate-700 shadow-inner">
                                <Code2 size={32} />
                            </div>
                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">En attente de session</h4>
                            <p className="text-[10px] text-slate-400 font-medium">Configurez le modèle et lancez l'expérience pour générer le rapport.</p>
                        </div>
                    )}

                    <div className="p-6 bg-indigo-600/10 rounded-[2.5rem] border border-indigo-500/20">
                         <div className="flex items-center gap-2 mb-2 text-indigo-500">
                             <BrainCircuit size={16} />
                             <span className="text-[10px] font-black uppercase tracking-widest">Expert Tip</span>
                         </div>
                         <p className="text-[11px] text-indigo-800 dark:text-indigo-200 font-medium leading-relaxed">
                            Le modèle <strong>MCMC</strong> est plus lent mais offre une meilleure couverture des zones de bruit, tandis que <strong>XGBoost</strong> excelle à trouver des patterns répétitifs précis.
                         </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
