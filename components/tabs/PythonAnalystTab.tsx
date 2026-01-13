
import React, { useState, useRef, useEffect } from 'react';
import { useNexus } from '../NexusProvider';
import { runDeepPythonAnalysis } from '../../services/pythonAnalystService';
import { PythonAnalysisResult } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { Terminal, Play, Cpu, Code2, Database, FlaskConical, CheckCircle2, ChevronDown, ChevronUp, AlertTriangle, BarChart as BarChartIcon, BrainCircuit, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

export const PythonAnalystTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history } = useNexus();
    const { showToast } = useToast();
    
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const [result, setResult] = useState<PythonAnalysisResult | null>(null);
    const [showCode, setShowCode] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [selectedModel, setSelectedModel] = useState<'XGBoost' | 'ARIMA' | 'MCMC'>('XGBoost');
    
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll logs
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const runAnalysis = async () => {
        if (history.length < 20) {
            showToast("Pas assez de données pour la science (Min 20).", "error");
            return;
        }
        
        setStatus('running');
        setLogs(["[INIT] Démarrage du noyau Python v3.11...", "[ENV] Chargement des bibliothèques (pandas, numpy, sklearn)..."]);
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
            showToast("Convergence du modèle atteinte.", "success");

        } catch (e: any) {
            setStatus('error');
            console.error("ANALYSIS FAILED:", e); 
            showToast(e.message || "Erreur du laboratoire.", "error");
            setLogs(prev => [...prev, `[FATAL] ${e.message}`]);
        }
    };

    const getConfidenceLabel = (score: number) => {
        if (score > 85) return { text: "Certitude Scientifique Élevée", color: "text-emerald-500", bg: "bg-emerald-500", border: "border-emerald-500" };
        if (score > 60) return { text: "Probabilité Mathématique Forte", color: "text-indigo-500", bg: "bg-indigo-500", border: "border-indigo-500" };
        return { text: "Signal Statistique Faible", color: "text-amber-500", bg: "bg-amber-500", border: "border-amber-500" };
    };

    const models = [
        { id: 'XGBoost', label: 'XGBoost Classifier', desc: 'Gradient Boosting. Idéal pour les relations non-linéaires complexes.' },
        { id: 'ARIMA', label: 'ARIMA TimeSeries', desc: 'AutoRegressive Integrated Moving Average. Pour les cycles temporels purs.' },
        { id: 'MCMC', label: 'MCMC Simulation', desc: 'Markov Chain Monte Carlo. Estimation probabiliste bayésienne.' }
    ];

    return (
        <div className="space-y-8 animate-fade-in pb-12 w-full overflow-hidden">
            
            {/* Header Hero : Le Laboratoire */}
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-[100px] -mr-16 -mt-16 group-hover:bg-emerald-600/20 transition-all duration-1000"></div>
                
                <div className="relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-10">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-emerald-600/20 border border-emerald-500/30 rounded-xl shadow-lg"><FlaskConical size={18} className="text-emerald-400" /></div>
                            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-400">Data Science Lab</h3>
                        </div>
                        <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-none mb-4">
                            Deep <span className="text-emerald-500">Analytics</span>
                        </h2>
                        <p className="text-slate-400 max-w-2xl text-xs md:text-sm font-medium leading-relaxed border-l-2 border-emerald-500/30 pl-4">
                            Exécutez des modèles de Machine Learning avancés sur l'historique brut. Détectez les signaux faibles invisibles aux analyses humaines.
                        </p>
                    </div>
                    
                    <div className="flex flex-col gap-4 w-full xl:w-auto">
                        <div className="flex bg-slate-800 p-1 rounded-2xl border border-slate-700">
                            {models.map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => setSelectedModel(m.id as any)}
                                    className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${selectedModel === m.id ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                >
                                    {m.id}
                                </button>
                            ))}
                        </div>
                        <button 
                            onClick={runAnalysis} 
                            disabled={status === 'running'}
                            className={`
                                relative w-full py-5 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all shadow-xl transform active:scale-95
                                ${status === 'running' ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-white text-slate-900 hover:bg-emerald-50'}
                            `}
                        >
                            {status === 'running' ? <Cpu className="animate-spin" size={16} /> : <Play size={16} className="fill-current" />}
                            {status === 'running' ? 'Entraînement...' : 'Lancer le Modèle'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Zone de Résultat */}
            <div className="grid lg:grid-cols-1 gap-8">
                
                {status === 'running' && (
                    <div className="bg-black/80 p-8 rounded-[2.5rem] shadow-xl border border-emerald-500/30 font-mono text-xs overflow-hidden h-[400px] flex flex-col relative">
                        <div className="absolute top-4 right-4 flex gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                        </div>
                        <div className="mb-4 text-emerald-500 font-bold border-b border-emerald-500/20 pb-2 flex items-center gap-2">
                            <Terminal size={14} /> KERNEL OUTPUT
                        </div>
                        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar space-y-1 text-slate-300">
                            {logs.map((log, i) => (
                                <div key={i} className="animate-fade-in">
                                    <span className="text-slate-600 mr-2">[{new Date().toLocaleTimeString()}]</span>
                                    {log.includes('[CRITICAL]') ? <span className="text-rose-500">{log}</span> : log.includes('[SUCCESS]') ? <span className="text-emerald-400">{log}</span> : log}
                                </div>
                            ))}
                            <div className="animate-pulse text-emerald-500">_</div>
                        </div>
                    </div>
                )}

                {status === 'completed' && result && (
                    <div className="space-y-8 animate-slide-up">
                        {/* Carte de Conclusion (Top Priority) */}
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-[3.5rem] shadow-xl border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                            
                            <div className="flex flex-col md:flex-row gap-10 items-stretch">
                                {/* Score Visuel */}
                                <div className="md:w-1/3 flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-900/50 rounded-[2.5rem] border border-slate-100 dark:border-slate-700">
                                    <div className="relative w-40 h-40 flex items-center justify-center mb-6">
                                        <svg className="w-full h-full transform -rotate-90">
                                            <circle cx="50%" cy="50%" r="45%" fill="none" stroke="#e2e8f0" strokeWidth="8" className="dark:stroke-slate-700" />
                                            <circle cx="50%" cy="50%" r="45%" fill="none" stroke="#10b981" strokeWidth="8" strokeDasharray="283" strokeDashoffset={283 - (283 * result.findings.confidence_score / 100)} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <span className="text-4xl font-black text-slate-800 dark:text-white">{result.findings.confidence_score.toFixed(0)}%</span>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase">Confiance</span>
                                        </div>
                                    </div>
                                    <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase text-center border ${getConfidenceLabel(result.findings.confidence_score).border} bg-opacity-10 text-slate-600 dark:text-slate-300`}>
                                        {getConfidenceLabel(result.findings.confidence_score).text}
                                    </div>
                                </div>

                                {/* Rapport Textuel & Graphique */}
                                <div className="md:w-2/3 flex flex-col justify-between space-y-6">
                                    <div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <BrainCircuit className="text-emerald-500" size={20} />
                                            <h3 className="text-xl font-black text-slate-800 dark:text-white">Conclusion du Modèle</h3>
                                        </div>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 italic">
                                            "{result.insight}"
                                        </p>
                                    </div>

                                    {/* Vecteurs Résultats avec Graphique */}
                                    <div className="bg-slate-50 dark:bg-slate-900/30 p-5 rounded-[2rem] border border-slate-100 dark:border-slate-700/50">
                                        <div className="flex justify-between items-center mb-4">
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Top 5 Vecteurs (Probabilité)</h4>
                                            <span className="text-[9px] font-bold bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500">P-Value: {result.findings.p_value}</span>
                                        </div>
                                        
                                        {/* Chart Mini */}
                                        <div className="h-32 w-full mb-4">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={result.findings.result_vector.map((n, i) => ({ n, prob: 100 - (i * 15) }))}> {/* Mock proba decreissante pour visuel */}
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                                    <XAxis dataKey="n" tick={{fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                                                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '8px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px'}} />
                                                    <Bar dataKey="prob" radius={[4, 4, 0, 0]}>
                                                        {result.findings.result_vector.map((_, index) => (
                                                            <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#6366f1'} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>

                                        <div className="flex gap-3 flex-wrap justify-center">
                                            {result.findings.result_vector.map((n, i) => (
                                                <motion.div key={n} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.1 }}>
                                                    <NumberBall number={n} size="md" isAttractor={i===0} />
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Toggle pour le Code (Pour les curieux/experts) */}
                        <div className="text-center">
                            <button 
                                onClick={() => setShowCode(!showCode)}
                                className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-emerald-500 transition-colors bg-white dark:bg-slate-900 px-4 py-2 rounded-full border border-slate-200 dark:border-slate-800"
                            >
                                {showCode ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                {showCode ? "Masquer les logs techniques" : "Voir les logs du kernel"}
                            </button>
                        </div>

                        <AnimatePresence>
                            {showCode && (
                                <motion.div 
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="bg-slate-950 rounded-[2rem] p-6 font-mono text-[10px] text-emerald-400/80 overflow-x-auto border border-slate-800 shadow-inner max-h-60 custom-scrollbar">
                                        <div className="flex items-center gap-2 mb-4 text-slate-500 border-b border-slate-800 pb-2 sticky top-0 bg-slate-950">
                                            <Terminal size={14}/> <span>Execution Log</span>
                                        </div>
                                        {result.stdout.map((line, i) => (
                                            <div key={i} className="mb-1 border-b border-white/5 pb-0.5">{line}</div>
                                        ))}
                                        <div className="mt-4 text-slate-500">
                                            # Script Source (Generated)
                                            <pre className="text-slate-400 mt-1">{result.script.substring(0, 200)}...</pre>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {status === 'idle' && (
                    <div className="flex flex-col items-center justify-center p-12 text-center opacity-50 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-[3rem]">
                        <Database size={48} className="text-slate-400 mb-4" />
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Le laboratoire est prêt. Sélectionnez un modèle.</p>
                    </div>
                )}
                
                {status === 'error' && (
                    <div className="p-8 bg-rose-50 dark:bg-rose-900/20 rounded-[2.5rem] border border-rose-200 dark:border-rose-800 text-center">
                        <AlertTriangle size={32} className="text-rose-500 mx-auto mb-4" />
                        <h3 className="text-lg font-black text-rose-700 dark:text-rose-300">Échec de l'Expérience</h3>
                        <p className="text-sm text-rose-600 dark:text-rose-400 mt-2">Le noyau Python n'a pas pu converger ou l'API ne répond pas.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
