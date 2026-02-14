import React, { useState, useEffect, useRef } from 'react';
import { evolveNeuralDNA, runBacktestTraining } from '../../services/trainingService';
import { normalizeWeights, getAlgoWeights } from '../../services/predictionEngine';
import { useNexus } from '../NexusProvider';
import { AlgoRadar } from '../AlgoRadar';
import { useToast } from '../ui/Toast';
import { audioEngine } from '../../utils/audioEngine';
import { 
    Dna, Play, Save, X, Activity, Microscope, 
    ArrowRight, TrendingUp, Zap, Cpu, Terminal, RefreshCw, BarChart2
} from 'lucide-react';
import type { AlgoWeights, TrainingReport } from '../../types';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend, BarChart, Bar, Cell } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

// --- SUB-COMPONENTS ---

const LogTerminal: React.FC<{ logs: string[] }> = ({ logs }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [logs]);

    return (
        <div className="bg-[#0d1117] rounded-2xl border border-slate-800 p-4 font-mono text-[10px] h-40 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2 mb-2 text-slate-500">
                <Terminal size={12} /> <span>NEXUS_KERNEL_LOGS</span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                {logs.map((log, i) => (
                    <div key={i} className="text-emerald-500/80">
                        <span className="text-slate-600 mr-2">[{new Date().toLocaleTimeString().split(' ')[0]}]</span>
                        {log}
                    </div>
                ))}
                {logs.length === 0 && <span className="text-slate-700 italic">En attente du processus...</span>}
            </div>
        </div>
    );
};

export const TrainingTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { showToast } = useToast();
    const { globalWeights, updateGlobalWeights, refreshData, history } = useNexus();
    
    // Config
    const [generations, setGenerations] = useState(50);
    const [sampleSize, setSampleSize] = useState(100);
    
    // State
    const [status, setStatus] = useState<'idle' | 'running' | 'completed'>('idle');
    const [evolutionData, setEvolutionData] = useState<any[]>([]);
    const [liveWeights, setLiveWeights] = useState<AlgoWeights>(globalWeights);
    const [logs, setLogs] = useState<string[]>([]);
    const [finalReport, setFinalReport] = useState<TrainingReport | null>(null);
    const [improvement, setImprovement] = useState(0);
    
    // Benchmark state
    const [initialScore, setInitialScore] = useState<number | null>(null);

    // Initial Load Baseline
    useEffect(() => {
        const loadBaseline = async () => {
            if (history.length > 50 && initialScore === null) {
                try {
                    const baseReport = await runBacktestTraining(drawName, history, sampleSize, undefined, globalWeights);
                    setInitialScore(baseReport.score);
                } catch (e) {
                    console.warn("Baseline calc error");
                }
            }
        };
        loadBaseline();
    }, [drawName, history, globalWeights]);

    // Handlers
    const addLog = (msg: string) => setLogs(prev => [...prev.slice(-19), msg]);

    const handleStartTraining = async () => {
        setStatus('running');
        setEvolutionData([]);
        setLogs(["Initialisation du Cluster Génétique...", "Analyse de la base de données importée...", `Population initiale: ${history.length} entrées`]);
        audioEngine.play('scan');
        
        try {
            const result = await evolveNeuralDNA(
                drawName, 
                { generations, sampleSize }, 
                (data) => {
                    // Callback télémétrie temps réel
                    setEvolutionData(prev => [...prev, data]);
                    setLiveWeights(data.bestGenome); // Visuel live
                    
                    if (data.gen === 1) addLog("Première génération complétée.");
                    if (data.gen % 10 === 0) addLog(`Checkpoint Gen ${data.gen}: Fitness ${data.bestFitness.toFixed(1)}`);
                    if (data.diversity < 0.05) addLog("⚠️ Diversité critique : Injection de mutations forcées.");
                }
            );

            if (result.report) {
                setFinalReport(result.report);
                setImprovement(result.improvement);
                setLiveWeights(result.bestWeights); // Final best
                setStatus('completed');
                addLog("Convergence atteinte. Solution optimale isolée.");
                audioEngine.play('success');
                showToast("Optimisation terminée avec succès.", "success");
            }

        } catch (e: any) {
            console.error(e);
            setStatus('idle');
            addLog(`ERREUR CRITIQUE: ${e.message}`);
            showToast("Échec de l'entraînement.", "error");
            audioEngine.play('error');
        }
    };

    const handleApply = async () => {
        if (finalReport) {
            const safeWeights = normalizeWeights(liveWeights);
            await updateGlobalWeights(safeWeights);
            await refreshData(drawName, true);
            setStatus('idle');
            showToast("ADN Neuronal mis à jour avec les nouveaux paramètres.", "success");
            audioEngine.play('boot');
        }
    };

    const benchmarkData = [
        { name: 'Actuel', score: initialScore || 0, fill: '#6366f1' },
        { name: 'Optimisé', score: finalReport ? finalReport.score : 0, fill: '#10b981' }
    ];

    return (
        <div className="space-y-6 md:space-y-8 animate-fade-in pb-24 w-full overflow-hidden">
            
            {/* Header Control Panel */}
            <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-[3rem] shadow-2xl relative overflow-hidden">
                {/* Background Decor */}
                <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none"><Dna size={180} /></div>
                
                <div className="relative z-10 flex flex-col lg:flex-row gap-8 items-center justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg"><Microscope size={20} className="text-white"/></div>
                            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-indigo-400">Laboratoire d'Évolution</h3>
                        </div>
                        <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter">Neural <span className="text-emerald-500">Darwinism</span></h2>
                        <p className="text-slate-400 text-xs md:text-sm font-medium mt-2 max-w-lg">
                            Utilisez l'historique importé pour calibrer les poids. Le système va simuler des milliers de combinaisons pour trouver l'ADN parfait.
                        </p>
                    </div>

                    <div className="flex flex-col gap-4 min-w-[280px] w-full lg:w-auto bg-black/20 p-6 rounded-[2.5rem] border border-white/5 backdrop-blur-sm">
                        <div className="space-y-3">
                            <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                                <span>Générations</span>
                                <span className="text-indigo-400">{generations}</span>
                            </div>
                            <input 
                                type="range" min="20" max="200" step="10" 
                                value={generations} onChange={(e) => setGenerations(Number(e.target.value))}
                                disabled={status === 'running'}
                                className="w-full h-2 bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-500"
                            />
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                                <span>Profondeur (Tirages)</span>
                                <span className="text-emerald-400">{sampleSize}</span>
                            </div>
                            <input 
                                type="range" min="50" max="300" step="50" 
                                value={sampleSize} onChange={(e) => setSampleSize(Number(e.target.value))}
                                disabled={status === 'running'}
                                className="w-full h-2 bg-slate-800 rounded-full appearance-none cursor-pointer accent-emerald-500"
                            />
                        </div>
                        
                        {status === 'idle' ? (
                            <button 
                                onClick={handleStartTraining}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95 group mt-2"
                            >
                                <Play size={16} className="fill-current group-hover:scale-110 transition-transform"/> Lancer l'Évolution
                            </button>
                        ) : status === 'running' ? (
                            <div className="w-full py-4 bg-slate-800 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 cursor-wait">
                                <RefreshCw size={16} className="animate-spin text-indigo-500"/> Calcul en cours...
                            </div>
                        ) : (
                            <div className="flex gap-2 mt-2">
                                <button onClick={() => setStatus('idle')} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-xs uppercase"><X size={16}/></button>
                                <button onClick={handleApply} className="flex-[3] py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs uppercase flex items-center justify-center gap-2 shadow-lg animate-pulse">
                                    <Save size={16}/> Appliquer Optimisation
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* LIVE MONITORING DASHBOARD */}
            <div className="grid lg:grid-cols-12 gap-8">
                
                {/* GAUCHE : Visualisation Graphique */}
                <div className="lg:col-span-8 space-y-6">
                    {/* Fitness Chart */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] shadow-xl border border-slate-200 dark:border-slate-800 h-80 relative overflow-hidden">
                        <div className="flex justify-between items-center mb-4 px-2">
                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <TrendingUp size={14} className="text-emerald-500"/> Trajectoire d'Apprentissage
                            </h4>
                            {evolutionData.length > 0 && (
                                <div className="flex gap-4 text-[9px] font-bold text-slate-400">
                                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Best Fitness</span>
                                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Moyenne</span>
                                </div>
                            )}
                        </div>
                        
                        {evolutionData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={evolutionData}>
                                    <defs>
                                        <linearGradient id="colorFit" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                    <XAxis dataKey="gen" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                                    <YAxis hide domain={['auto', 'auto']} />
                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                                    <Area type="monotone" dataKey="bestFitness" stroke="#10b981" strokeWidth={3} fill="url(#colorFit)" animationDuration={300} isAnimationActive={false} />
                                    <Area type="monotone" dataKey="avgFitness" stroke="#6366f1" strokeWidth={2} fill="transparent" strokeDasharray="5 5" isAnimationActive={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-xs uppercase font-bold tracking-widest opacity-50">
                                En attente de données...
                            </div>
                        )}
                    </div>

                    {/* Comparaison Radar */}
                    <div className="bg-slate-950 p-8 rounded-[3rem] border border-slate-800 shadow-xl flex flex-col md:flex-row items-center gap-10 relative overflow-hidden">
                         {/* Scanline Effect */}
                         <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] pointer-events-none opacity-20"></div>

                         <div className="w-full md:w-1/2 relative z-10">
                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Activity size={14} className="text-indigo-500"/> Mutation ADN
                            </h4>
                            <div className="h-64 flex items-center justify-center">
                                <AlgoRadar weights={liveWeights} previousWeights={status !== 'idle' ? globalWeights : undefined} />
                            </div>
                         </div>

                         <div className="w-full md:w-1/2 relative z-10 flex flex-col gap-4">
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                <div className="text-[9px] font-black text-slate-500 uppercase mb-1">Score Actuel</div>
                                <div className="text-2xl font-black text-slate-300">
                                    {initialScore ? initialScore.toFixed(1) : '--'}
                                </div>
                            </div>
                            <div className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/30 relative overflow-hidden">
                                <div className="absolute -right-4 -top-4 bg-emerald-500/20 w-20 h-20 rounded-full blur-xl"></div>
                                <div className="text-[9px] font-black text-emerald-400 uppercase mb-1">Score Optimisé</div>
                                <div className="text-3xl font-black text-emerald-400 flex items-center gap-2">
                                    {finalReport ? finalReport.score.toFixed(1) : '--'}
                                    {improvement > 0 && <span className="text-xs bg-emerald-500 text-white px-2 py-1 rounded-lg">+{improvement.toFixed(1)}%</span>}
                                </div>
                            </div>

                            {/* Benchmark Bar Chart */}
                            {finalReport && (
                                <div className="h-32 w-full mt-2">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={benchmarkData} layout="vertical">
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="name" type="category" width={60} tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}} />
                                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', fontSize: '10px' }} />
                                            <Bar dataKey="score" barSize={16} radius={[0, 4, 4, 0]}>
                                                {benchmarkData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                         </div>
                    </div>
                </div>

                {/* DROITE : Logs & Metrics */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    {/* Live Metrics */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-md border border-slate-200 dark:border-slate-700">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Cpu size={14}/> Télémétrie</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                                <div className="text-[8px] font-bold text-slate-500 uppercase">Diversité</div>
                                <div className="text-lg font-black text-indigo-500">
                                    {evolutionData.length > 0 ? (evolutionData[evolutionData.length-1].diversity * 100).toFixed(1) + '%' : '--'}
                                </div>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                                <div className="text-[8px] font-bold text-slate-500 uppercase">Génération</div>
                                <div className="text-lg font-black text-slate-700 dark:text-white">
                                    {evolutionData.length > 0 ? `${evolutionData[evolutionData.length-1].gen}/${generations}` : '--'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Console Logs */}
                    <div className="flex-1">
                        <LogTerminal logs={logs} />
                    </div>

                    {/* Info Box */}
                    <div className="p-5 bg-indigo-50 dark:bg-indigo-900/20 rounded-[2rem] border border-indigo-100 dark:border-indigo-800/50">
                        <p className="text-[10px] text-indigo-800 dark:text-indigo-300 font-medium leading-relaxed italic">
                            "Le moteur compare les résultats sur votre fichier historique. Un score > 85 indique que l'ADN est parfaitement calibré pour ce type de tirage."
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};