
import React, { useState, useEffect, useRef } from 'react';
import { runBacktestTraining, evolveNeuralDNA } from '../../services/trainingService';
import { getAlgoWeights } from '../../services/predictionEngine';
import type { AlgoWeights, TrainingReport } from '../../types';
import { useToast } from '../ui/Toast';
import { useNexus } from '../NexusProvider';
import { AlgoRadar } from '../AlgoRadar';
import { 
    Settings, RefreshCw, Activity, 
    TrendingUp, FlaskConical, Dna, Brain
} from 'lucide-react';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
    ResponsiveContainer, BarChart, Bar, Cell 
} from 'recharts';

interface TrainingTabProps { drawName: string; }

// Composant Visualiseur Génétique (Canvas Optimisé)
const GeneticLandscape: React.FC<{ telemetry: any[] }> = ({ telemetry }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || telemetry.length === 0) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        // Grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i < width; i += 30) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke(); }
        for (let i = 0; i < height; i += 30) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke(); }

        const fitnessValues = telemetry.map(t => t.bestFitness);
        const minFit = Math.min(...fitnessValues) * 0.95;
        const maxFit = Math.max(...fitnessValues) * 1.05;
        const range = maxFit - minFit || 1;

        if (telemetry.length > 1) {
            // Path Evolution
            ctx.beginPath();
            ctx.strokeStyle = '#6366f1'; 
            ctx.lineWidth = 3;
            ctx.shadowBlur = 15;
            ctx.shadowColor = 'rgba(99, 102, 241, 0.5)';

            const stepX = width / Math.max(10, telemetry.length - 1);

            telemetry.forEach((t, i) => {
                const x = i * stepX;
                const y = height - ((t.bestFitness - minFit) / range) * (height - 40) - 20;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Points & Diversity Clouds
            telemetry.forEach((t, i) => {
                const x = i * stepX;
                const y = height - ((t.bestFitness - minFit) / range) * (height - 40) - 20;
                
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();

                const particles = Math.floor(t.diversity * 20); 
                ctx.fillStyle = `rgba(16, 185, 129, ${0.3})`; 
                for (let j = 0; j < particles; j++) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = Math.random() * 20 * t.diversity;
                    ctx.beginPath();
                    ctx.arc(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
        }
    }, [telemetry]);

    return (
        <div className="relative w-full h-64 bg-slate-900 rounded-[2.5rem] border border-slate-800 overflow-hidden shadow-inner">
            <canvas ref={canvasRef} width={600} height={256} className="w-full h-full" />
            <div className="absolute top-4 left-4">
                <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest bg-black/40 px-2 py-1 rounded">Fitness Landscape</div>
                {telemetry.length > 0 && (
                    <div className="text-[8px] font-mono text-slate-500 mt-1">
                        Gen: {telemetry.length} | Max: {Math.max(...telemetry.map(t=>t.bestFitness)).toFixed(1)}
                    </div>
                )}
            </div>
        </div>
    );
};

export const TrainingTab: React.FC<TrainingTabProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { history, loading: nexusLoading, globalWeights, updateGlobalWeights } = useNexus();
    
    const [isEvolving, setIsEvolving] = useState(false);
    const [localLoading, setLocalLoading] = useState(false);
    const [report, setReport] = useState<TrainingReport | null>(null);
    const [telemetry, setTelemetry] = useState<any[]>([]);
    
    // État local initialisé avec les poids globaux actuels pour comparaison
    const [displayedWeights, setDisplayedWeights] = useState<AlgoWeights>(globalWeights);
    const [generations, setGenerations] = useState(15);
    const [sampleSize, setSampleSize] = useState(35);
    
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        // On met à jour l'affichage si le global change (via une autre source)
        setDisplayedWeights(globalWeights);
        return () => { isMounted.current = false; };
    }, [globalWeights]);

    const runFullEvolution = async () => {
        if (!history || history.length < 30) {
            showToast("Pas assez de données pour l'évolution.", "error");
            return;
        }
        setIsEvolving(true);
        setTelemetry([]);
        try {
            const result = await evolveNeuralDNA(
                drawName, 
                { generations, sampleSize },
                (data) => {
                    if (isMounted.current) setTelemetry(prev => [...prev, data]);
                }
            );
            
            if (isMounted.current) {
                setReport(result.report);
                setDisplayedWeights(result.bestWeights);
                
                // MISE À JOUR CRITIQUE : On pousse le nouvel ADN dans l'état global
                updateGlobalWeights(result.bestWeights);
                
                if (result.improvement > 0) {
                    showToast(`ADN optimisé et activé : +${result.improvement} pts.`, "success");
                } else {
                    showToast("L'ADN actuel est déjà optimal pour cet historique.", "info");
                }
            }
        } catch (e: any) {
            if (isMounted.current) {
                showToast(e.message, "error");
            }
        } finally {
            if (isMounted.current) setIsEvolving(false);
        }
    };

    const runSimpleTest = async () => {
        if (!history || history.length < 30) {
            showToast("Chargement de l'historique...", "info");
            return;
        }
        setLocalLoading(true);
        try {
            // Utilise les poids globaux actuels
            const res = await runBacktestTraining(drawName, history, sampleSize, undefined, globalWeights);
            if (isMounted.current) {
                setReport(res);
                showToast("Diagnostic du flux actuel terminé.", "info");
            }
        } catch (e: any) {
            if (isMounted.current) showToast(e.message, "error");
        } finally {
            if (isMounted.current) setLocalLoading(false);
        }
    };

    if (nexusLoading) return <div className="p-20 text-center animate-pulse text-indigo-500">Synchronisation des neurones...</div>;

    return (
        <div className="space-y-8 animate-fade-in pb-20 w-full overflow-hidden">
            {/* Hero Section Neural Lab */}
            <div className="bg-slate-950 text-white p-8 md:p-14 rounded-[3.5rem] shadow-2xl border border-white/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] -mr-32 -mt-32"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-12">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg animate-pulse"><FlaskConical size={20} /></div>
                            <h3 className="text-xs font-black uppercase tracking-[0.4em] text-indigo-400">Nexus Neural Lab v7.0</h3>
                        </div>
                        <h2 className="text-4xl md:text-7xl font-black text-white tracking-tighter leading-none">
                            Évolution de <span className="text-indigo-500">l'ADN Oracle</span>
                        </h2>
                        <p className="text-slate-400 mt-8 text-lg font-medium max-w-2xl leading-relaxed border-l-2 border-indigo-500/30 pl-6 italic">
                            Ajustement stochastique des poids algorithmiques par sélection naturelle. Les nouveaux paramètres sont immédiatement injectés dans le moteur de prédiction.
                        </p>
                    </div>
                    <div className="bg-white/5 backdrop-blur-2xl p-10 rounded-[3.5rem] border border-white/10 shadow-2xl flex flex-col items-center min-w-[300px]">
                        <Dna size={80} className={`mb-6 ${isEvolving ? 'text-indigo-500 animate-spin' : 'text-slate-700'}`} style={{ animationDuration: '3s' }} />
                        <div className="text-center">
                            <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Précision Actuelle</div>
                            <div className="text-5xl font-black text-white">{report ? report.score : '--'}%</div>
                            <div className="text-[8px] font-bold text-slate-500 uppercase mt-2 tracking-tighter">Calibration Nexus</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Configuration Panel */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700">
                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-10 flex items-center gap-2"><Settings size={14}/> Paramètres d'Évolution</h4>
                        <div className="space-y-8">
                            <div className="space-y-3">
                                <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase"><span>Générations</span> <span>{generations}</span></div>
                                <input type="range" min="5" max="50" step="5" value={generations} onChange={(e) => setGenerations(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-indigo-600" />
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase"><span>Fenêtre de test</span> <span>{sampleSize} tirages</span></div>
                                <input type="range" min="15" max="100" step="5" value={sampleSize} onChange={(e) => setSampleSize(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-indigo-600" />
                            </div>
                            <div className="grid grid-cols-1 gap-4 pt-4">
                                <button onClick={runSimpleTest} disabled={localLoading || isEvolving} className="w-full py-5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-300 font-black rounded-2xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95">
                                    <Activity size={16}/> Lancer Diagnostic
                                </button>
                                <button onClick={runFullEvolution} disabled={localLoading || isEvolving} className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50">
                                    {isEvolving ? <RefreshCw className="animate-spin" size={16}/> : <Brain size={16}/>}
                                    {isEvolving ? "Mutation en cours..." : "Optimiser l'ADN IA"}
                                </button>
                            </div>
                        </div>
                    </div>

                    <GeneticLandscape telemetry={telemetry} />
                </div>

                {/* Performance Visualizer */}
                <div className="lg:col-span-8 space-y-8">
                    {report ? (
                        <div className="animate-slide-up space-y-8">
                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700">
                                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-8">ADN Morphé (Nouveaux Poids)</h4>
                                    <AlgoRadar weights={displayedWeights} height={300} />
                                </div>
                                <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col justify-center text-center">
                                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-10">Distribution des Succès</h4>
                                    <div className="grid grid-cols-3 gap-6">
                                        {[
                                            { label: 'Min. 1 Hit', val: report.successRate + '%' },
                                            { label: 'Stabilité', val: report.stabilityLabel },
                                            { label: 'Régime', val: report.regimeInfo?.regime }
                                        ].map(stat => (
                                            <div key={stat.label}>
                                                <div className="text-xl font-black text-slate-800 dark:text-white">{stat.val}</div>
                                                <div className="text-[8px] font-bold text-slate-400 uppercase mt-1">{stat.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-12 h-40 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={Object.entries(report.winDistribution).map(([k, v]) => ({ name: k, val: v }))}>
                                                <Bar dataKey="val" radius={[8, 8, 0, 0]}>
                                                    {Object.entries(report.winDistribution).map((entry, index) => (
                                                        <Cell key={index} fill={index >= 2 ? '#6366f1' : '#cbd5e1'} />
                                                    ))}
                                                </Bar>
                                                <XAxis dataKey="name" hide />
                                                <YAxis hide />
                                                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase mt-4">Histogramme de fréquence des hits (0 à 5)</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-slate-800 p-10 rounded-[4rem] shadow-xl border border-slate-100 dark:border-slate-700">
                                <h4 className="text-sm font-black text-slate-800 dark:text-white mb-8 flex items-center gap-3 uppercase tracking-tighter">
                                    <TrendingUp className="text-indigo-600" /> Précision sur {report.totalTests} Tirages
                                </h4>
                                <div className="h-64 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={report.history.map(h => ({ date: h.date.split('/')[0], hits: h.hitCount })).reverse()}>
                                            <defs>
                                                <linearGradient id="colorHits" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.05} />
                                            <XAxis dataKey="date" tick={{fontSize: 9, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                                            <YAxis hide domain={[0, 5]} />
                                            <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                                            <Area type="monotone" dataKey="hits" stroke="#6366f1" strokeWidth={4} fill="url(#colorHits)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center p-20 bg-slate-50 dark:bg-slate-900/40 rounded-[4rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center">
                            <Dna size={80} className="text-slate-200 dark:text-slate-800 mb-8" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] max-w-sm">
                                Aucun rapport neural actif. Lancez une session d'entraînement pour générer un nouvel ADN et calibrer l'Oracle.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
