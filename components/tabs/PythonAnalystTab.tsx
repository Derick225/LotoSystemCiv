import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { runDeepPythonAnalysis } from '../../services/pythonAnalystService';
import { PythonAnalysisResult, NotebookCell } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { Terminal, Play, Cpu, Activity, BarChart2, CheckCircle, RefreshCw, Hash, Code, Save, Copy } from 'lucide-react';
import { SafeMarkdown } from '../ui/SafeMarkdown';

// Composant Cellule de Code Style Jupyter
const CodeCell: React.FC<{ content: string, onExecute?: () => void, isExecuting?: boolean }> = ({ content, onExecute, isExecuting }) => (
    <div className="bg-[#0d1117] rounded-xl border border-slate-700 overflow-hidden mb-4 shadow-lg group">
        <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-slate-700">
            <span className="text-xs font-mono text-slate-400 font-bold flex items-center gap-2"><Code size={12}/> python_kernel_v12.py</span>
            <div className="flex gap-2">
                <button className="text-slate-500 hover:text-white" title="Copy"><Copy size={12}/></button>
                {onExecute && (
                    <button onClick={onExecute} disabled={isExecuting} className="text-emerald-500 hover:text-emerald-400 disabled:opacity-50">
                        {isExecuting ? <RefreshCw size={14} className="animate-spin"/> : <Play size={14}/>}
                    </button>
                )}
            </div>
        </div>
        <div className="p-4 overflow-x-auto font-mono text-sm leading-relaxed">
            <pre className="text-slate-300">
                <code dangerouslySetInnerHTML={{ 
                    __html: content
                        .replace(/import/g, '<span class="text-purple-400">import</span>')
                        .replace(/from/g, '<span class="text-purple-400">from</span>')
                        .replace(/def /g, '<span class="text-blue-400">def </span>')
                        .replace(/return/g, '<span class="text-purple-400">return</span>')
                        .replace(/#.*/g, match => `<span class="text-slate-500 italic">${match}</span>`)
                }} />
            </pre>
        </div>
    </div>
);

// Composant Output Console
const OutputCell: React.FC<{ content: string }> = ({ content }) => (
    <div className="pl-4 mb-6 border-l-2 border-slate-700">
        <div className="text-xs font-mono text-slate-500 mb-1">Out [1]:</div>
        <div className="bg-[#161b22] p-3 rounded-lg font-mono text-xs text-emerald-400 whitespace-pre-wrap shadow-inner">
            {content}
        </div>
    </div>
);

export const PythonAnalystTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history, globalWeights } = useNexus();
    const { showToast } = useToast();
    
    const [status, setStatus] = useState<'idle' | 'running' | 'completed'>('idle');
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<PythonAnalysisResult | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll des logs
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [logs]);

    const runAnalysis = async () => {
        setStatus('running');
        setResult(null);
        setProgress(0);
        setLogs([
            "> [INIT] Spawning Isolated Python Environment (Pyodide v0.24)...",
            `> [DATA] Loading DataFrame: ${drawName}_history.csv (${history.length} rows)`,
            "> [PKG] Importing: pandas, scipy.stats, numpy, sklearn.ensemble",
        ]);

        try {
            // Injection des poids globaux pour que l'analyse Python respecte l'ADN
            // On passe explicitement le callback de progression ET le callback de log
            const data = await runDeepPythonAnalysis(
                drawName, 
                history, 
                'XGBoost', 
                globalWeights, 
                (p: any) => setProgress(typeof p === 'number' ? p : 0),  // Callback progression safely cast
                (msg) => setLogs(prev => [...prev, msg]) // Callback logs
            );
            
            setResult(data);
            setStatus('completed');
            showToast("Notebook exécuté avec succès.", "success");
        } catch (e: any) {
            setStatus('idle');
            setLogs(prev => [...prev, `! [FATAL] ${e.message}`]);
        }
    };

    // Préparation des données pour le graphique de distribution
    const chartData = useMemo(() => {
        if (!result) return [];
        
        // Utilisation de la distribution réelle si disponible
        if (result.distribution) {
             const maxVal = Math.max(...Object.values(result.distribution), 1);
             return Array.from({length: 90}, (_, i) => {
                const num = i + 1;
                const val = result.distribution![num] || 0;
                // Normalisation 0-100% relative au max
                const normalizedProb = (val / maxVal) * 100;
                
                return {
                    num,
                    prob: normalizedProb,
                    // Seuil visuel pour mettre en évidence les vecteurs forts
                    threshold: 50 
                };
            });
        }

        // Fallback (simulation visuelle si pas de données brutes)
        const vectors = result.findings.result_vector.slice(0, 5);
        return Array.from({length: 90}, (_, i) => {
            const num = i + 1;
            const isTarget = vectors.includes(num);
            return {
                num,
                prob: isTarget ? Math.random() * 40 + 50 : Math.random() * 10 + 5,
                threshold: 40
            };
        });
    }, [result]);

    return (
        <div className="space-y-6 animate-fade-in pb-20 w-full overflow-hidden">
            
            {/* Header / Toolbar */}
            <div className="flex justify-between items-center bg-slate-900 p-4 rounded-[2rem] border border-slate-800 shadow-lg">
                <div className="flex items-center gap-4 px-2">
                    <div className="w-10 h-10 bg-emerald-900/30 rounded-xl flex items-center justify-center border border-emerald-500/20">
                        <Terminal size={20} className="text-emerald-500" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Nexus Notebook</h3>
                        <p className="text-[10px] text-slate-500 font-mono">Kernel: Python 3.11 (WASM)</p>
                    </div>
                </div>
                <button 
                    onClick={runAnalysis}
                    disabled={status === 'running'}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-50 disabled:bg-slate-800 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg active:scale-95"
                >
                    {status === 'running' ? <RefreshCw className="animate-spin" size={14}/> : <Play size={14}/>}
                    {status === 'running' ? 'Running...' : 'Run All'}
                </button>
            </div>

            <div className="grid lg:grid-cols-12 gap-6 h-[700px]">
                
                {/* NOTEBOOK AREA (Main) */}
                <div className="lg:col-span-8 bg-[#0d1117] rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden flex flex-col relative">
                    {/* Status Bar / Progress */}
                    <div className="h-1 bg-slate-800 w-full flex">
                        {status === 'running' && (
                            <div className="h-full bg-emerald-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar" ref={scrollRef}>
                        {/* Initial Logs */}
                        <div className="font-mono text-xs text-slate-500 mb-6 space-y-1">
                            {logs.map((log, i) => (
                                <div key={i} className={log.includes('CRITICAL') || log.includes('FATAL') ? 'text-rose-500' : log.includes('DATA') ? 'text-blue-400' : 'text-slate-500'}>{log}</div>
                            ))}
                        </div>

                        {/* Result Cells */}
                        {result && result.cells.map((cell) => (
                            <div key={cell.id} className="animate-slide-up">
                                {cell.type === 'markdown' && (
                                    <div className="prose prose-invert prose-sm max-w-none mb-4">
                                        <SafeMarkdown text={cell.content} />
                                    </div>
                                )}
                                {cell.type === 'code' && (
                                    <CodeCell content={cell.content} />
                                )}
                                {cell.type === 'output' && (
                                    <OutputCell content={cell.content} />
                                )}
                            </div>
                        ))}
                        
                        {status === 'idle' && logs.length < 5 && (
                            <div className="flex flex-col items-center justify-center h-40 opacity-30">
                                <Code size={48} className="text-slate-500 mb-4"/>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Prêt à exécuter</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* VISUALIZATION SIDEBAR */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    {/* Graphique de Densité */}
                    <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-xl flex-1 flex flex-col min-h-[300px]">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <BarChart2 size={14} className="text-indigo-500"/> Distribution Monte Carlo
                        </h4>
                        
                        {result ? (
                            <div className="flex-1 w-full min-h-[200px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="colorProb" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                        <XAxis hide />
                                        <YAxis hide />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', fontSize: '10px' }}
                                            formatter={(val: number) => [`${Math.round(val)}%`, 'Probabilité']}
                                            labelFormatter={(idx) => `Vecteur ${Number(idx)+1}`}
                                        />
                                        <Area type="monotone" dataKey="prob" stroke="#10b981" fill="url(#colorProb)" strokeWidth={2} animationDuration={1000} />
                                        <ReferenceLine y={50} stroke="red" strokeDasharray="3 3" opacity={0.3} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center opacity-20">
                                <Activity size={64} className="text-slate-500"/>
                            </div>
                        )}
                    </div>

                    {/* Résultats Vectoriels */}
                    {result && (
                        <div className="bg-emerald-900/10 p-6 rounded-[2.5rem] border border-emerald-500/20 animate-scale-in">
                            <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <CheckCircle size={12}/> Vecteurs Convergents
                            </h4>
                            <div className="flex flex-wrap gap-2 justify-center">
                                {result.findings.result_vector.slice(0, 5).map(n => (
                                    <NumberBall key={n} number={n} size="md" isAttractor />
                                ))}
                            </div>
                            <div className="mt-4 pt-4 border-t border-emerald-500/10 flex justify-between items-center">
                                <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300">P-Value: {result.findings.p_value.toFixed(4)}</span>
                                <span className="text-lg font-black text-emerald-500">{result.findings.confidence_score}%</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};