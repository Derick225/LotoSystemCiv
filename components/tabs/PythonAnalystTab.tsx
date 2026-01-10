
import React, { useState } from 'react';
import { useNexus } from '../NexusProvider';
import { runDeepPythonAnalysis } from '../../services/pythonAnalystService';
import { PythonAnalysisResult } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { Terminal, Play, Cpu, Code2, Database, FlaskConical, CheckCircle2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const PythonAnalystTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history } = useNexus();
    const { showToast } = useToast();
    
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const [result, setResult] = useState<PythonAnalysisResult | null>(null);
    const [showCode, setShowCode] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);

    const runAnalysis = async () => {
        if (history.length < 20) {
            showToast("Pas assez de données pour la science (Min 20).", "error");
            return;
        }
        
        setStatus('running');
        setLogs([]);
        setResult(null);

        try {
            const data = await runDeepPythonAnalysis(
                drawName, 
                history, 
                'XGBoost', 
                undefined,
                (msg) => setLogs(prev => [...prev, msg].slice(-8)) // Garder les 8 derniers logs
            );
            
            setResult(data);
            setStatus('completed');
            showToast("Analyse terminée avec succès.", "success");

        } catch (e: any) {
            setStatus('error');
            console.error("ANALYSIS FAILED:", e); 
            showToast(e.message || "Erreur du laboratoire.", "error");
        }
    };

    const getConfidenceLabel = (score: number) => {
        if (score > 85) return { text: "Certitude Scientifique Élevée", color: "text-emerald-500", bg: "bg-emerald-500" };
        if (score > 60) return { text: "Probabilité Mathématique Forte", color: "text-indigo-500", bg: "bg-indigo-500" };
        return { text: "Signal Statistique Faible", color: "text-amber-500", bg: "bg-amber-500" };
    };

    return (
        <div className="space-y-8 animate-fade-in pb-12 w-full overflow-hidden">
            
            {/* Header Hero : Le Laboratoire */}
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-1000"></div>
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-10">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-emerald-600 rounded-xl shadow-lg"><FlaskConical size={18} className="text-white" /></div>
                            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-400">Laboratoire de Données</h3>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-none mb-6">
                            Deep <span className="text-emerald-500">Learning</span>
                        </h2>
                        <p className="text-slate-400 max-w-2xl text-sm font-medium leading-relaxed border-l-2 border-emerald-500/30 pl-6">
                            Utilisez la puissance du langage Python pour détecter des micro-patterns invisibles à l'œil nu. Une analyse scientifique pure, sans superstition.
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
                        {status === 'running' ? 'Calcul en cours...' : 'Lancer l\'Expérience'}
                    </button>
                </div>
            </div>

            {/* Zone de Résultat */}
            <div className="grid lg:grid-cols-1 gap-8">
                
                {status === 'running' && (
                    <div className="bg-white dark:bg-slate-800 p-12 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 text-center animate-pulse">
                        <div className="mb-6 flex justify-center">
                            <Cpu size={64} className="text-emerald-500 animate-spin-slow" />
                        </div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white mb-4">Traitement des Données</h3>
                        <div className="space-y-2 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                            {logs.map((log, i) => (
                                <div key={i}>{log}</div>
                            ))}
                        </div>
                    </div>
                )}

                {status === 'completed' && result && (
                    <div className="space-y-8 animate-slide-up">
                        {/* Carte de Conclusion (Top Priority) */}
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-[3.5rem] shadow-xl border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                            
                            <div className="flex flex-col md:flex-row gap-10 items-start">
                                {/* Score Visuel */}
                                <div className="flex-shrink-0 text-center mx-auto md:mx-0">
                                    <div className="relative w-40 h-40 flex items-center justify-center">
                                        <svg className="w-full h-full transform -rotate-90">
                                            <circle cx="50%" cy="50%" r="45%" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                                            <circle cx="50%" cy="50%" r="45%" fill="none" stroke="#10b981" strokeWidth="10" strokeDasharray="283" strokeDashoffset={283 - (283 * result.findings.confidence_score / 100)} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <span className="text-4xl font-black text-slate-800 dark:text-white">{result.findings.confidence_score.toFixed(0)}%</span>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase">Confiance</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Rapport Textuel */}
                                <div className="flex-1 space-y-6">
                                    <div>
                                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase mb-3 ${getConfidenceLabel(result.findings.confidence_score).color} bg-opacity-10 border border-current`}>
                                            <CheckCircle2 size={12} /> {getConfidenceLabel(result.findings.confidence_score).text}
                                        </div>
                                        <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Conclusion du Scientifique</h3>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 italic">
                                            "{result.insight}"
                                        </p>
                                    </div>

                                    {/* Vecteurs Résultats */}
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Vecteurs Identifiés (Top 5)</h4>
                                        <div className="flex gap-3 flex-wrap">
                                            {result.findings.result_vector.map((n, i) => (
                                                <motion.div key={n} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.1 }}>
                                                    <NumberBall number={n} size="md" />
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
                                className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-emerald-500 transition-colors"
                            >
                                {showCode ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                {showCode ? "Masquer les détails techniques" : "Voir le code source Python & Logs"}
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
                                    <div className="grid lg:grid-cols-2 gap-8">
                                        <div className="bg-slate-950 rounded-[2rem] p-6 font-mono text-[10px] text-emerald-400/80 overflow-x-auto border border-slate-800 shadow-inner">
                                            <div className="flex items-center gap-2 mb-4 text-slate-500 border-b border-slate-800 pb-2">
                                                <Terminal size={14}/> <span>Console Output</span>
                                            </div>
                                            {result.stdout.map((line, i) => (
                                                <div key={i} className="mb-1">{line}</div>
                                            ))}
                                        </div>
                                        <div className="bg-slate-900 rounded-[2rem] p-6 font-mono text-[10px] text-slate-300 overflow-x-auto border border-slate-800 shadow-inner">
                                            <div className="flex items-center gap-2 mb-4 text-slate-500 border-b border-slate-800 pb-2">
                                                <Code2 size={14}/> <span>Script.py</span>
                                            </div>
                                            <pre>{result.script}</pre>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {status === 'idle' && (
                    <div className="flex flex-col items-center justify-center p-12 text-center opacity-50">
                        <Database size={48} className="text-slate-400 mb-4" />
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Le laboratoire est prêt. En attente d'instruction.</p>
                    </div>
                )}
                
                {status === 'error' && (
                    <div className="p-8 bg-rose-50 dark:bg-rose-900/20 rounded-[2.5rem] border border-rose-200 dark:border-rose-800 text-center">
                        <AlertTriangle size={32} className="text-rose-500 mx-auto mb-4" />
                        <h3 className="text-lg font-black text-rose-700 dark:text-rose-300">Échec de l'Expérience</h3>
                        <p className="text-sm text-rose-600 dark:text-rose-400 mt-2">Le noyau Python n'a pas pu converger ou l'API ne répond pas.</p>
                        <p className="text-xs text-rose-500 mt-4 opacity-70">Ouvrez la console du navigateur (F12) pour voir les détails techniques.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
