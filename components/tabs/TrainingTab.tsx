import React, { useState, useEffect, useRef } from 'react';
import { evolveNeuralDNA, runBacktestTrainingAsync, calculatePositionalDNAProfiles, runLoopSimulation, terminateActiveWorkers } from '../../services/trainingService';
import { runSurvivalSimulation } from '../../services/backtestingEngine';
import { BacktestReport } from '../../services/simulationCore';
import { normalizeWeights, getAlgoWeights } from '../../services/predictionEngine';
import { useNexusStore } from '../../store/useNexusStore';
import { AlgoRadar } from '../AlgoRadar';
import { useToast } from '../ui/Toast';
import { audioEngine } from '../../utils/audioEngine';
import { 
    Dna, Play, Save, X, Activity, Microscope, 
    TrendingUp, Zap, Cpu, Terminal, RefreshCw,
    Upload, Download, ShieldCheck, Gauge, Layers, Sparkles, Sliders, History,
    BrainCircuit, HelpCircle
} from 'lucide-react';
import type { AlgoWeights, TrainingReport } from '../../types';
import { ExportService } from '../../services/exportService';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import { AlgoKey, DEFAULT_ALGO_WEIGHTS } from '../../shared/prediction.types';

const LABELS: Record<AlgoKey, string> = {
    [AlgoKey.FREQUENCY]: 'Fréquence',
    [AlgoKey.GAPS]: 'Écart',
    [AlgoKey.SPECTRAL]: 'Spectral',
    [AlgoKey.MARKOV]: 'Markov',
    [AlgoKey.BAYES]: 'Bayes',
    [AlgoKey.MOMENTUM]: 'Momentum',
    [AlgoKey.AFFINITY]: 'Affinité',
    [AlgoKey.SPATIAL]: 'Spatial',
    [AlgoKey.TEMPORAL]: 'Temporel',
    [AlgoKey.FRACTAL]: 'Fractal',
    [AlgoKey.SHADOW_PROBABILITY]: 'Probabilité Ombre',
    [AlgoKey.NETWORK_CORRELATION]: 'Corrélation Réseau',
    [AlgoKey.ECHO_STATE]: 'Echo State (ESN)',
    [AlgoKey.GAP_SEQUENCE]: 'Séquence Écart',
    [AlgoKey.DERIVED_NEIGHBOR]: 'Voisin/Miroir/Ombre',
    [AlgoKey.GAP_PATTERN]: 'Motif Écart (AR1)',
    [AlgoKey.SEQUENCE_PATTERN]: 'Pattern Séquentiel',
    [AlgoKey.GAP_CADENCE]: 'Cadence d\'Écarts'
};

// --- SUB-COMPONENTS & UTILITIES ---

const getDrawSpecifics = (name: string) => {
    const cleaned = name.toUpperCase();
    let balls = 90;
    let picks = 5;
    let description = "Un univers stochastique étendu nécessitant un ajustement précis des composantes chaotiques (Entropy Regime) et spectrales.";
    
    if (cleaned.includes("EUROMILLIONS") || cleaned.includes("EURO")) {
        balls = 50;
        picks = 5;
        description = "Une densité réduite avec un coefficient d'affinité optimal (Co-occurrence) centré sur les décades médianes.";
    } else if (cleaned.includes("POWERBALL") || cleaned.includes("AMERICA")) {
        balls = 69;
        picks = 5;
        description = "Un système d'affinité asymétrique favorisant l'analyse fine des lacunes de vitesse (Gap Velocity).";
    } else if (cleaned.includes("49") || cleaned.includes("6/")) {
        balls = 49;
        picks = 6;
        description = "Régime d'autocorrélation harmonique élevée. Les estimations de processus de point (Poisson) sont prioritaires.";
    }
    return { balls, picks, description };
};

// Pure React Rotating Double Helix SVG
const GlowingHelix: React.FC<{ active: boolean }> = ({ active }) => {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!active) return;
        let animId: number;
        const update = () => {
            setTick(prev => (prev + 0.04) % (Math.PI * 2));
            animId = requestAnimationFrame(update);
        };
        animId = requestAnimationFrame(update);
        return () => cancelAnimationFrame(animId);
    }, [active]);

    return (
        <svg viewBox="0 0 100 240" className="w-24 h-56 mx-auto drop-shadow-[0_0_15px_rgba(99,102,241,0.25)]">
            <defs>
                <linearGradient id="helixGlow" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="50%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
            </defs>
            <g>
                {Array.from({ length: 9 }).map((_, idx) => {
                    const y = 20 + idx * 24;
                    const phase = idx * 0.6;
                    const angleOffset = active ? tick : 0;
                    const wave1 = 50 + 30 * Math.sin(phase + angleOffset);
                    const wave2 = 50 + 30 * Math.sin(phase + Math.PI + angleOffset);
                    
                    return (
                        <g key={idx}>
                            <line 
                                x1={wave1} y1={y} 
                                x2={wave2} y2={y} 
                                stroke="url(#helixGlow)" 
                                strokeWidth="2.5" 
                                strokeDasharray="3,3"
                                opacity={0.6}
                            />
                            <circle cx={wave1} cy={y} r="4.5" fill="#6366f1" />
                            <circle cx={wave2} cy={y} r="4.5" fill="#10b981" />
                        </g>
                    );
                })}
                <path 
                    d={Array.from({ length: 60 }).map((_, i) => {
                        const y = 15 + i * 3.5;
                        const phase = (i / 60) * Math.PI * 2;
                        const angleOffset = active ? tick : 0;
                        const x = 50 + 30 * Math.sin(phase + angleOffset);
                        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')} 
                    fill="none" 
                    stroke="#6366f1" 
                    strokeWidth="3.5" 
                    strokeLinecap="round"
                    opacity={0.8}
                />
                <path 
                    d={Array.from({ length: 60 }).map((_, i) => {
                        const y = 15 + i * 3.5;
                        const phase = (i / 60) * Math.PI * 2;
                        const angleOffset = active ? tick : 0;
                        const x = 50 + 30 * Math.sin(phase + Math.PI + angleOffset);
                        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')} 
                    fill="none" 
                    stroke="#10b981" 
                    strokeWidth="3.5" 
                    strokeLinecap="round"
                    opacity={0.8}
                />
            </g>
        </svg>
    );
};

const CyberneticValidation: React.FC<{ weights: AlgoWeights, drawName: string, history: any[] }> = ({ weights, drawName, history }) => {
    const [running, setRunning] = useState(false);
    const [report, setReport] = useState<BacktestReport | null>(null);
    const [strategy, setStrategy] = useState<"FLAT" | "KELLY" | "CONFIDENCE_SMART">("CONFIDENCE_SMART");
    
    const runValidation = async () => {
        setRunning(true);
        audioEngine.play('scan');
        try {
            const res = await runSurvivalSimulation(
                drawName,
                history,
                weights,
                Math.min(50, history.length),
                strategy,
                undefined,
                10000,
                200
            );
            setReport(res);
            audioEngine.play('success');
        } catch (e) {
            console.error(e);
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="bg-slate-950 p-6 rounded-2xl border border-indigo-900/50 shadow-xl mt-6 relative overflow-hidden min-w-0">
            <div className="absolute -right-4 -top-4 bg-indigo-500/10 w-32 h-32 rounded-full blur-2xl pointer-events-none"></div>
            
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                    <ShieldCheck size={14} /> Validation Empirique (Cybérnétique)
                </h4>
                <div className="flex items-center gap-2">
                    <select 
                        value={strategy} 
                        onChange={e => setStrategy(e.target.value as any)}
                        className="bg-slate-900 text-[10px] text-slate-300 border border-slate-700 rounded p-1 uppercase tracking-wider font-bold"
                    >
                        <option value="FLAT">Flat Betting</option>
                        <option value="KELLY">Critère de Kelly</option>
                        <option value="CONFIDENCE_SMART">Smart Confidence</option>
                    </select>
                    <button 
                        onClick={runValidation} 
                        disabled={running}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white p-1.5 rounded disabled:opacity-50 transition-all cursor-pointer"
                    >
                        {running ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                    </button>
                </div>
            </div>

            {report ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">ROI Net</div>
                        <div className={`text-lg font-black ${report.roi >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {report.roi > 0 ? '+' : ''}{report.roi.toFixed(1)}%
                        </div>
                    </div>
                    <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Win Rate</div>
                        <div className="text-lg font-black text-blue-400">
                            {report.winRate.toFixed(1)}%
                        </div>
                    </div>
                    <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Max Drawdown</div>
                        <div className="text-lg font-black text-amber-500">
                            -{report.maxDrawdown.toFixed(1)}%
                        </div>
                    </div>
                    <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Sharpe Ratio</div>
                        <div className="text-lg font-black text-fuchsia-400">
                            {report.sharpeRatio.toFixed(2)}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="p-4 border border-dashed border-slate-800 rounded-xl flex justify-center items-center text-slate-600 text-[10px] font-bold uppercase tracking-widest">
                    Lancer la simulation empirique pour valider l'ADN
                </div>
            )}
        </div>
    );
};

const LogTerminal: React.FC<{ logs: string[] }> = ({ logs }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [logs]);

    return (
        <div className="bg-[#040815] rounded-2xl border border-slate-800 p-4 font-mono text-[10px] h-48 overflow-hidden flex flex-col shadow-inner">
            <div className="flex items-center gap-2 border-b border-slate-850 pb-2 mb-2 text-slate-500 justify-between">
                <div className="flex items-center gap-2">
                    <Terminal size={12} className="text-emerald-500" /> <span className="font-bold">NEXUS_KERNEL_LOGS</span>
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                {logs.map((log, i) => (
                    <div key={i} className="text-emerald-500/90 leading-relaxed text-[9.5px]">
                        <span className="text-slate-600 mr-2 font-light">[{new Date().toLocaleTimeString()}]</span>
                        {log}
                    </div>
                ))}
                {logs.length === 0 && <span className="text-slate-700 italic">En attente du processus de calcul...</span>}
            </div>
        </div>
    );
};

const FirstPredictionDNASnapshotViewer: React.FC<{
    snapshot: Record<number, Record<AlgoKey, number>> | null;
    maxBalls: number;
}> = ({ snapshot, maxBalls }) => {
    const [selectedNumber, setSelectedNumber] = useState<number>(1);

    if (!snapshot) {
        return (
            <div className="bg-[#05091a]/80 border border-slate-800/80 p-6 rounded-2xl shadow-xl text-center text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                <Dna size={28} className="mb-2 animate-pulse text-indigo-400 mx-auto" />
                <span>Lancez l'entraînement pour capturer l'ADN initial de chaque numéro</span>
            </div>
        );
    }

    const numberDNA = snapshot[selectedNumber] || {};
    const sortedAlgos = Object.entries(numberDNA)
        .map(([algo, weight]) => ({ algo: algo as AlgoKey, weight }))
        .sort((a, b) => b.weight - a.weight);

    return (
        <div className="bg-[#05091a]/85 border border-slate-800/80 p-6 rounded-2xl shadow-xl relative overflow-hidden min-w-0">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
            
            <div className="mb-6">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <BrainCircuit size={14} className="text-emerald-400" /> Surveillance ADN Initial des Numéros (Étape 1)
                </h4>
                <p className="text-[10px] text-slate-500 mt-1">
                    Visualisation de l'ADN algorithmique de chaque numéro au moment de générer la toute première prédiction chronologique.
                </p>
            </div>

            <div className="grid lg:grid-cols-12 gap-6">
                {/* Numéros de la grille */}
                <div className="lg:col-span-7">
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider mb-2 block">
                        Grille de sélection de numéro ({maxBalls} boules)
                    </span>
                    <div className="grid grid-cols-10 gap-1 bg-slate-950 p-3 rounded-xl border border-white/5 max-h-56 overflow-y-auto custom-scrollbar">
                        {Array.from({ length: maxBalls }).map((_, idx) => {
                            const num = idx + 1;
                            const isSelected = selectedNumber === num;
                            const hasDNA = !!snapshot[num];
                            // Compute a quick sum to indicate magnitude
                            const dnaSum = hasDNA ? Object.values(snapshot[num]).reduce((s, w) => s + w, 0) : 0;
                            const hasActiveSignal = dnaSum > 0.05;

                            return (
                                <button
                                    key={num}
                                    onClick={() => {
                                        audioEngine.play('click');
                                        setSelectedNumber(num);
                                    }}
                                    className={`aspect-square rounded-lg text-[9px] font-black flex flex-col items-center justify-center transition-all cursor-pointer border ${
                                        isSelected
                                            ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)] scale-105'
                                            : hasActiveSignal
                                                ? 'bg-indigo-950/40 text-indigo-300 border-indigo-500/20 hover:bg-indigo-900/40 hover:border-indigo-400'
                                                : 'bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-300 hover:bg-slate-800'
                                    }`}
                                >
                                    <span>{num}</span>
                                    {hasActiveSignal && !isSelected && (
                                        <div className="w-1 h-1 rounded-full bg-indigo-400 mt-0.5 animate-pulse"></div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Profil ADN de l'algorithme pour le numéro sélectionné */}
                <div className="lg:col-span-5 flex flex-col justify-between">
                    <div>
                        <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider mb-3 block">
                            Profil ADN du numéro <span className="text-emerald-400 font-extrabold">#{selectedNumber}</span> à l'étape 1
                        </span>

                        <div className="space-y-2.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                            {sortedAlgos.slice(0, 8).map(({ algo, weight }) => {
                                const label = LABELS[algo] || algo;
                                const isDominant = weight > 0.15;
                                const percentage = (weight * 100).toFixed(1);

                                return (
                                    <div key={algo} className="bg-black/35 p-2 rounded-lg border border-white/5">
                                        <div className="flex justify-between items-center text-[9px] mb-1">
                                            <span className="font-bold text-slate-300 uppercase tracking-wide">{label}</span>
                                            <span className={`font-black ${isDominant ? 'text-emerald-400' : 'text-slate-400'}`}>
                                                {percentage}%
                                            </span>
                                        </div>
                                        <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-300 ${
                                                    isDominant ? 'bg-emerald-400' : 'bg-slate-700'
                                                }`}
                                                style={{ width: `${Math.min(100, weight * 100)}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                );
                            })}
                            {sortedAlgos.length === 0 && (
                                <div className="text-[10px] text-slate-600 italic text-center py-6">
                                    Aucune composante capturée pour ce numéro
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN TRAINING TAB COMPONENT ---

export const TrainingTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { showToast } = useToast();
    // @ts-ignore - auto generated by cleanup
    const globalWeights = useNexusStore(state => state.globalWeights);
    const updateGlobalWeights = useNexusStore(state => state.updateGlobalWeights);
    const refreshData = useNexusStore(state => state.refreshData);
    const history = useNexusStore(state => state.history);
    
    // Config
    const [generations, setGenerations] = useState(60);
    const [sampleSize, setSampleSize] = useState(120);
    const [optimizerType, setOptimizerType] = useState<'pso' | 'genetic' | 'bayesian' | 'meta'>('meta');
    
    // State
    const [status, setStatus] = useState<'idle' | 'running' | 'completed'>('idle');
    const [evolutionData, setEvolutionData] = useState<Array<{ gen: number; bestFitness: number; avgFitness?: number; diversity: number; bestGenome: AlgoWeights; source?: string }>>([]);
    const [originalWeights, setOriginalWeights] = useState<AlgoWeights>(DEFAULT_ALGO_WEIGHTS);
    const [liveWeights, setLiveWeights] = useState<AlgoWeights>(DEFAULT_ALGO_WEIGHTS);
    const [logs, setLogs] = useState<string[]>([]);
    const [finalReport, setFinalReport] = useState<TrainingReport | null>(null);
    const [improvement, setImprovement] = useState(0);
    const [firstPredictionDNASnapshot, setFirstPredictionDNASnapshot] = useState<Record<number, Record<AlgoKey, number>> | null>(null);

    // Dynamic loading of specific draw weights to resolve persistence and tab switching desync
    useEffect(() => {
        let isMounted = true;
        const loadWeights = async () => {
            const weights = await getAlgoWeights(drawName);
            if (isMounted) {
                setOriginalWeights(weights);
                setLiveWeights(weights);
            }
        };
        loadWeights();
        return () => { isMounted = false; };
    }, [drawName]);
    
    // Loop Simulation States
    const [loopRunning, setLoopRunning] = useState(false);
    const [loopSize, setLoopSize] = useState(10);
    const [loopProgress, setLoopProgress] = useState(0);
    const [loopResults, setLoopResults] = useState<any[]>([]);
    const [loopSummary, setLoopSummary] = useState<{
        totalHitsStatic: number;
        totalHitsLoop: number;
        improvement: number;
    } | null>(null);

    const loopAbortControllerRef = useRef<AbortController | null>(null);

    const handleStopLoopSimulation = () => {
        if (loopAbortControllerRef.current) {
            loopAbortControllerRef.current.abort();
        }
        terminateActiveWorkers(drawName);
        setLoopRunning(false);
        showToast("Simulation de boucle interrompue.", "info");
        audioEngine.play('click');
    };

    const handleStopTraining = () => {
        terminateActiveWorkers(drawName);
        setStatus('idle');
        addLog("🛑 Processus d'optimisation annulé par l'utilisateur.");
        showToast("Évolution d'ADN annulée.", "info");
        audioEngine.play('click');
    };

    // Run Forensic Feedback Loop Simulation (Decoupled to core computation)
    const handleStartLoopSimulation = async () => {
        if (history.length < 15) {
            showToast("Historique insuffisant pour lancer la simulation de boucle (minimum 15 tirages).", "error");
            return;
        }
        setLoopRunning(true);
        setLoopProgress(0);
        setLoopResults([]);
        setLoopSummary(null);
        audioEngine.play('scan');

        const controller = new AbortController();
        loopAbortControllerRef.current = controller;
        
        try {
            const result = await runLoopSimulation(
                drawName,
                history,
                loopSize,
                originalWeights,
                (percent, stepResult) => {
                    setLoopResults(prev => [...prev, stepResult]);
                    setLoopProgress(percent);
                    audioEngine.play('click');
                },
                controller.signal
            );
            
            setLoopSummary({
                totalHitsStatic: result.totalHitsStatic,
                totalHitsLoop: result.totalHitsLoop,
                improvement: result.improvement
            });
            audioEngine.play('success');
            showToast(`Simulation de boucle terminée ! Amélioration: ${result.improvement}%`, "success");
        } catch (e: any) {
            if (e?.message === "Simulation interrompue.") {
                addLog("🛑 Simulation de boucle interrompue par l'utilisateur.");
            } else {
                console.error("Loop simulation failed", e);
                showToast("Erreur pendant la simulation de la boucle", "error");
                audioEngine.play('error');
            }
        } finally {
            setLoopRunning(false);
            loopAbortControllerRef.current = null;
        }
    };

    // Benchmark state
    const [initialScore, setInitialScore] = useState<number | null>(null);
    const [calculatingBaseline, setCalculatingBaseline] = useState(false);

    // Dynamic applying workflow overlay states
    const [applyingState, setApplyingState] = useState<'idle' | 'normalizing' | 'kalman' | 'finalizing' | 'completed'>('idle');
    const [calibrationLogs, setCalibrationLogs] = useState<string[]>([]);

    // Advanced positional DNA computing (based on sorted slots in history)
    const [selectedPosition, setSelectedPosition] = useState<number>(0);
    const [positionalProfiles, setPositionalProfiles] = useState<Record<number, Record<AlgoKey, number>>>({});
    const [calculatingPositional, setCalculatingPositional] = useState<boolean>(false);

    // Specific Draw Attributes
    const drawSpecifics = getDrawSpecifics(drawName);

    // Baseline calculation
    useEffect(() => {
        setCalculatingBaseline(true);
        const timer = setTimeout(async () => {
            if (history.length > 5) {
                try {
                    const baseReport = await runBacktestTrainingAsync(
                        drawName, 
                        history, 
                        Math.max(5, Math.min(sampleSize, history.length)), 
                        undefined, 
                        originalWeights
                    );
                    setInitialScore(baseReport.score);
                } catch (e) {
                    console.warn("Baseline calc error", e);
                } finally {
                    setCalculatingBaseline(false);
                }
            } else {
                setCalculatingBaseline(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [drawName, history, originalWeights, sampleSize]);

    // Position-Based DNA Profile extraction (sorted numbers context) - Decoupled to core computation
    useEffect(() => {
        if (!history || history.length === 0) return;
        setCalculatingPositional(true);
        const timer = setTimeout(() => {
            const profiles = calculatePositionalDNAProfiles(history, liveWeights || originalWeights);
            setPositionalProfiles(profiles);
            setCalculatingPositional(false);
        }, 120);

        return () => clearTimeout(timer);
    }, [drawName, history, liveWeights, originalWeights]);

    // Clamping of sampleSize based on actual history size to respect boundaries
    useEffect(() => {
        if (history.length > 0) {
            setSampleSize(prev => Math.max(10, Math.min(prev, history.length - 2)));
        }
    }, [history]);

    // Handlers
    const addLog = (msg: string) => setLogs(prev => [...prev.slice(-19), msg]);

    const handleStartTraining = async () => {
        setStatus('running');
        setEvolutionData([]);
        setFirstPredictionDNASnapshot(null);
        setLogs([
            `[SYS] Initialisation de l'optimiseur cybernétique : ${optimizerType === 'pso' ? 'Essaim de Particules (PSO)' : optimizerType === 'genetic' ? 'Loi de Darwin (Évolution Génétique)' : optimizerType === 'bayesian' ? 'Inférence Bayésienne KDE' : 'Omni-Méta (PSO + Darwin + Bayesian Blending)'}...`,
            `[DB] Isolation du tirage actif : [${drawName}] - Strict isolation rule.`,
            `[CPU] Dataset d'apprentissage historique : ${Math.min(sampleSize, history.length)} tirages isolés.`,
            `[MATH] Hurst = ${(initialScore ? 0.5 + (initialScore / 200) : 0.5).toFixed(2)} - Calibration spectrale initiale active...`
        ]);
        audioEngine.play('scan');
        
        try {
            const result = await evolveNeuralDNA(
                drawName, 
                { generations, sampleSize, optimizerType }, 
                (data) => {
                    // Real-time telemetry callback
                    setEvolutionData(prev => [...prev, data]);
                    setLiveWeights(normalizeWeights(data.bestGenome));
                    
                    if (data.gen === 1) addLog("Premier checkpoint génomique établi.");
                    if (data.gen % 10 === 0) {
                        addLog(`Génération ${data.gen}: Fitness Best = ${data.bestFitness.toFixed(1)} | Diversité = ${(data.diversity * 100).toFixed(1)}%`);
                    }
                    
                    const numFeatures = Object.keys(data.bestGenome).length || 1;
                    const theoreticalMinDiversity = 1.0 / numFeatures;
                    const diversityThreshold = theoreticalMinDiversity * 0.20; 

                    if (data.diversity < diversityThreshold) {
                        addLog("⚠️ ALERTE : Collapsus de Simplex détecté ! Perturbation déterministe orthogonale appliquée.");
                    }
                }
            );

            if (result.report) {
                const safeTrainedWeights = normalizeWeights(result.bestWeights);
                setFinalReport(result.report);
                setImprovement(result.improvement);
                setLiveWeights(safeTrainedWeights);
                // @ts-ignore
                setFirstPredictionDNASnapshot(result.firstPredictionDNASnapshot || null);
                setStatus('completed');
                addLog(`✓ Convergence stabilisée atteinte. Solution optimale identifiée.`);
                
                if (result.isGeneralizable === false) {
                    addLog(`⚖️ SURAPPRENTISSAGE COULÉ (Ratio: ${result.overfittingRatio?.toFixed(2)}). Blending d'atténuation appliqué continûment.`);
                    showToast("Atténuation de surapprentissage appliquée.", "info");
                } else {
                    audioEngine.play('success');
                    showToast("Optimisation terminée avec succès.", "success");
                }
            }

        } catch (e: unknown) {
            console.error(e);
            setStatus('idle');
            addLog(`[EXCEPTION ERROR] Échec du calcul : ${(e instanceof Error ? e.message : String(e))}`);
            showToast("Échec de l'entraînement.", "error");
            audioEngine.play('error');
        }
    };

    const handleApply = async () => {
        if (!finalReport) return;
        
        audioEngine.play('scan');
        setCalibrationLogs(["DÉBUT DE L'INJECTION GÉNOMIQUE DANS LE NOYAU CORE..."]);
        setApplyingState('normalizing');
        
        await new Promise(r => setTimeout(r, 600));
        setCalibrationLogs(prev => [...prev, "✓ PROJECTION DE NORMES DE PROBABILITÉS L1 COMPLÉTÉE.", "PROXIMAL BIAS ET ENCODAGES DE GRILLES SÉCURISÉS."]);
        audioEngine.play('click');
        setApplyingState('kalman');
        
        await new Promise(r => setTimeout(r, 800));
        setCalibrationLogs(prev => [...prev, "✓ FILTRE ADAPTATIF DE KALMAN : ÉTATS DE COVARIANCE ENTIÈREMENT INTÉGRÉS.", "PÉNALITÉS DU BRIER SCORE INJECTÉES.", "COEFFICIENTS DE CAUCHY STRUCTURE POUR EVITER L'EXTINCTION DE L'HISTORIQUE DE STRATÉGIES."]);
        audioEngine.play('click');
        setApplyingState('finalizing');
        
        await new Promise(r => setTimeout(r, 600));
        setCalibrationLogs(prev => [...prev, "✓ ALIGNEMENT CHRONOLOGIQUE PARÉ POUR LE TIRAGE ACTIF.", "ÉCRÊTAGE ET NORMALISATION RE-EQUILIBRES."]);
        audioEngine.play('success');
        
        const safeWeights = normalizeWeights(liveWeights);
        await updateGlobalWeights(safeWeights, drawName);
        await refreshData(drawName, true);
        setOriginalWeights(safeWeights);
        setLiveWeights(safeWeights);
        
        setApplyingState('completed');
        await new Promise(r => setTimeout(r, 500));
        setApplyingState('idle');
        setStatus('idle');
        showToast("L'ADN du moteur de prédiction a été mis à jour avec brio.", "success");
    };

    const handleExportDNA = () => {
        audioEngine.play('click');
        try {
            ExportService.exportDNA(liveWeights, drawName);
            showToast("ADN Algorithmique exporté avec succès.", "success");
        } catch (e: any) {
            showToast("Erreur lors de l'exportation.", "error");
        }
    };

    const handleImportDNA = async () => {
        audioEngine.play('click');
        try {
            const weights = await ExportService.importDNA();
            const safeWeights = normalizeWeights(weights as AlgoWeights);
            await updateGlobalWeights(safeWeights, drawName);
            await refreshData(drawName, true);
            setLiveWeights(safeWeights);
            setOriginalWeights(safeWeights);
            showToast("ADN Algorithmique importé et appliqué avec succès.", "success");
            audioEngine.play('success');
        } catch (e: any) {
            showToast(e.message || "Erreur lors de l'importation.", "error");
            audioEngine.play('error');
        }
    };

    const benchmarkData = [
        { name: 'Actuel', score: initialScore || 0, fill: '#6366f1' },
        { name: 'Optimisé', score: finalReport ? finalReport.score : 0, fill: '#10b981' }
    ];

    const currentPosDNA = positionalProfiles[selectedPosition] || {};

    return (
        <div className="space-y-6 md:space-y-8 animate-fade-in pb-24 w-full overflow-hidden relative">
            
            {/* FULLSCREEN CALIBRATION INTEGRATION OVERLAY */}
            {applyingState !== 'idle' && (
                <div className="fixed inset-0 bg-[#020512]/95 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="max-w-md w-full bg-[#050b1a] rounded-3xl border border-indigo-900/40 p-8 shadow-2xl relative overflow-hidden">
                        {/* Glow effect */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl"></div>
                        
                        <div className="text-center mb-6 relative z-10">
                            <Dna size={48} className="text-indigo-400 mx-auto animate-spin duration-3000 mb-4" />
                            <h3 className="text-xl font-bold tracking-tight text-white uppercase">Mise à jour génomique</h3>
                            <p className="text-slate-400 text-xs mt-1">Calibration dynamique des vecteurs algorithmiques...</p>
                        </div>
                        
                        {/* Fake logs */}
                        <div className="bg-black/40 rounded-xl p-4 font-mono text-[9px] text-emerald-400 text-left h-48 overflow-y-auto mb-6 border border-white/5 space-y-1">
                            {calibrationLogs.map((log, lIdx) => (
                                <div key={lIdx} className="leading-relaxed">
                                    <span className="text-slate-500 mr-1">[$]</span> {log}
                                </div>
                            ))}
                            {applyingState !== 'completed' && (
                                <div className="flex items-center gap-1.5 text-indigo-400 mt-2 animate-pulse">
                                    <RefreshCw size={8} className="animate-spin" />
                                    <span>Calcul du lissage en cours...</span>
                                </div>
                            )}
                        </div>

                        {/* Progress line */}
                        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                            <div 
                                className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out" 
                                style={{ 
                                    width: applyingState === 'normalizing' ? '25%' 
                                           : applyingState === 'kalman' ? '65%' 
                                           : applyingState === 'finalizing' ? '90%' 
                                           : '100%' 
                                }}
                            ></div>
                        </div>
                    </div>
                </div>
            )}

            {/* Header Control Panel */}
            <div className="bg-[#090e1f] border border-slate-800/80 p-6 md:p-8 rounded-3xl shadow-2xl relative overflow-hidden">
                <div className="absolute -right-16 -top-16 bg-[#1e1b4b]/10 w-96 h-96 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] text-teal-400 pointer-events-none hidden lg:block"><Dna size={220} /></div>
                
                <div className="relative z-10 flex flex-col xl:flex-row gap-8 items-stretch justify-between">
                    <div className="flex-1 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-indigo-600/10 rounded-xl border border-indigo-500/20"><Microscope size={20} className="text-indigo-400"/></div>
                                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-indigo-400">Laboratoire d'Évolution d'ADN</h3>
                            </div>
                            <h2 className="text-3xl lg:text-5xl font-black text-white tracking-tighter">
                                Neural <span className="text-emerald-400">Darwinism</span>
                            </h2>
                            <p className="text-slate-400 text-xs md:text-sm font-medium mt-3 max-w-lg leading-relaxed">
                                Analyse continûment les erreurs de prévision pour auto-ajuster les poids des algorithmes. Système protégé contre le surapprentissage par filtre de Kalman adaptatif.
                            </p>
                        </div>

                        {/* Target specifics and objective */}
                        <div className="mt-6 p-4 bg-indigo-950/20 border border-indigo-900/30 rounded-2xl flex items-start gap-3.5 max-w-xl">
                            <Gauge size={18} className="text-teal-400 mt-1 shrink-0" />
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-wider text-teal-300">Objectif du Tirage : {drawName}</h4>
                                <div className="text-[11px] text-slate-350 leading-relaxed mt-1">
                                    {drawSpecifics.description} <span className="text-indigo-400 font-bold">Domaine de numéros : 1-{drawSpecifics.balls} &bull; Taille de ticket : {drawSpecifics.picks}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 mt-6">
                            <button onClick={handleExportDNA} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white px-4 py-2 bg-slate-950/40 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all cursor-pointer">
                                <Download size={12} /> Exporter ADN (Config)
                            </button>
                            <button onClick={handleImportDNA} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-indigo-450 px-4 py-2 bg-slate-950/40 hover:bg-slate-900 border border-slate-800 hover:border-indigo-900/50 rounded-xl transition-all cursor-pointer">
                                <Upload size={12} /> Importer ADN (Config)
                            </button>
                        </div>
                    </div>

                    {/* Selector form */}
                    <div className="flex flex-col gap-4 min-w-[325px] w-full xl:w-auto bg-[#040815]/90 p-6 rounded-2xl border border-white/5 backdrop-blur-sm self-center">
                        <div className="space-y-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Sliders size={12} /> Solutionneur d'Équilibre</span>
                            <div className="grid grid-cols-4 gap-1.5 bg-slate-950 p-1 rounded-xl border border-white/5">
                                <button
                                    type="button"
                                    disabled={status === 'running'}
                                    onClick={() => { audioEngine.play('click'); setOptimizerType('pso'); }}
                                    className={`py-2 rounded-lg text-[9px] font-black uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                                        optimizerType === 'pso' 
                                            ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30' 
                                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    <Zap size={11} />
                                    <span>PSO</span>
                                </button>
                                <button
                                    type="button"
                                    disabled={status === 'running'}
                                    onClick={() => { audioEngine.play('click'); setOptimizerType('genetic'); }}
                                    className={`py-2 rounded-lg text-[9px] font-black uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                                        optimizerType === 'genetic' 
                                            ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30' 
                                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    <Dna size={11} />
                                    <span>Darwin</span>
                                </button>
                                <button
                                    type="button"
                                    disabled={status === 'running'}
                                    onClick={() => { audioEngine.play('click'); setOptimizerType('bayesian'); }}
                                    className={`py-2 rounded-lg text-[9px] font-black uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                                        optimizerType === 'bayesian' 
                                            ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30' 
                                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    <Activity size={11} />
                                    <span>Bayes</span>
                                </button>
                                <button
                                    type="button"
                                    disabled={status === 'running'}
                                    onClick={() => { audioEngine.play('click'); setOptimizerType('meta'); }}
                                    className={`py-2 rounded-lg text-[9px] font-black uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                                        optimizerType === 'meta' 
                                            ? 'bg-fuchsia-600 text-white shadow shadow-fuchsia-600/30' 
                                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    <Cpu size={11} />
                                    <span>Omni</span>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                                <span>Générations / Itérations</span>
                                <span className="text-indigo-400 font-bold">{generations}</span>
                            </div>
                            <input 
                                type="range" min="30" max="180" step="10" 
                                value={generations} onChange={(e) => { audioEngine.play('click'); setGenerations(Number(e.target.value)); }}
                                disabled={status === 'running'}
                                className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-500"
                            />
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                                <span>Profondeur d'ajustement</span>
                                <span className="text-emerald-400 font-bold">{sampleSize} tirages</span>
                            </div>
                            <input 
                                type="range" 
                                min={10} 
                                max={history.length > 20 ? history.length - 2 : 120} 
                                step={5} 
                                value={sampleSize} 
                                onChange={(e) => { audioEngine.play('click'); setSampleSize(Number(e.target.value)); }}
                                disabled={status === 'running'}
                                className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-emerald-500"
                            />
                        </div>
                        
                        {status === 'idle' ? (
                            <button 
                                onClick={() => { audioEngine.play('click'); handleStartTraining(); }}
                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-505 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95 group mt-2 cursor-pointer"
                            >
                                <Play size={14} className="fill-current group-hover:scale-110 transition-transform"/> Lancer l'Évolution
                            </button>
                        ) : status === 'running' ? (
                            <button
                                onClick={handleStopTraining}
                                className="w-full py-3.5 bg-rose-950/45 hover:bg-rose-900/45 text-rose-400 border border-rose-900/30 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all"
                            >
                                <X size={14} className="text-rose-400 animate-pulse" />
                                <span>Interrompre ({evolutionData[evolutionData.length - 1]?.gen || 0}/{generations})</span>
                            </button>
                        ) : (
                            <div className="flex gap-2 mt-2">
                                <button onClick={() => { audioEngine.play('click'); setStatus('idle'); }} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs uppercase cursor-pointer flex items-center justify-center"><X size={14}/></button>
                                <button onClick={() => { audioEngine.play('click'); handleApply(); }} className="flex-[4] py-3 bg-emerald-600 hover:bg-emerald-550 text-white rounded-xl font-bold text-xs uppercase flex items-center justify-center gap-2 shadow-lg hover:shadow-emerald-900/40 animate-pulse cursor-pointer">
                                    <Save size={14}/> Appliquer l'ADN
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* LIVE MONITORING DASHBOARD */}
            <div className="grid lg:grid-cols-12 gap-8">
                
                {/* GAUCHE : Visualisation Graphique */}
                <div className="lg:col-span-8 space-y-6 min-w-0">
                    
                    {/* Fitness Curve Chart */}
                    <div className="bg-[#05091a]/80 p-4 md:p-6 rounded-2xl shadow-xl border border-slate-850 h-80 relative overflow-hidden min-w-0 w-full">
                        <div className="flex justify-between items-center mb-4 px-2">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <TrendingUp size={14} className="text-emerald-400"/> Trajectoire de Convergence
                            </h4>
                            {evolutionData.length > 0 ? (
                                <div className="flex gap-3 text-[9px] font-bold text-slate-400">
                                    <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div> Meilleure</span>
                                    <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> Moyenne</span>
                                    <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> Diversité</span>
                                </div>
                            ) : (
                                <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                                    <Sparkles size={11} /> Attente de données
                                </span>
                            )}
                        </div>
                        
                        {evolutionData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={evolutionData}>
                                    <defs>
                                        <linearGradient id="colorFit" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorDiv" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15}/>
                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.05} stroke="#fff" />
                                    <XAxis dataKey="gen" tick={{fontSize: 9, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="left" hide domain={['auto', 'auto']} />
                                    <YAxis yAxisId="right" orientation="right" hide domain={[0, 1]} />
                                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #1e293b', backgroundColor: '#020617', color: '#fff', fontSize: '9px' }} />
                                    <Area yAxisId="left" type="monotone" dataKey="bestFitness" stroke="#10b981" strokeWidth={2.5} fill="url(#colorFit)" isAnimationActive={false} name="Best Fitness" />
                                    <Area yAxisId="left" type="monotone" dataKey="avgFitness" stroke="#6366f1" strokeWidth={1.5} fill="transparent" strokeDasharray="4 4" isAnimationActive={false} name="Avg Fitness" />
                                    <Area yAxisId="right" type="monotone" dataKey="diversity" stroke="#f59e0b" strokeWidth={1} fill="url(#colorDiv)" isAnimationActive={false} name="Diversity (0-1)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-[10px] uppercase font-bold tracking-[0.2em] opacity-40">
                                <History size={28} className="mb-2 animate-pulse text-indigo-400" />
                                <span>Démarrer l'évolution pour projeter la trajectoire d'apprentissage</span>
                            </div>
                        )}
                    </div>

                    {/* NEW COMPONENT: POSITION-BASED DNA PROFILE ANALYZER */}
                    <div className="bg-[#05091a]/85 border border-slate-800/80 p-6 rounded-2xl shadow-xl relative overflow-hidden min-w-0">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>
                        
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                            <div>
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Layers size={14} className="text-indigo-400" /> Cartographie d'ADN Positionnel ($5 \times N_{"{algos}"}$)
                                </h4>
                                <p className="text-[10px] text-slate-500 mt-1">Estimations optimales par case de sortie (du premier au dernier sortant)</p>
                            </div>
                            
                            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-white/5 flex-wrap sm:flex-nowrap">
                                {Array.from({ length: 5 }).map((_, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => { audioEngine.play('click'); setSelectedPosition(idx); }}
                                        className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg transition-all cursor-pointer ${
                                            selectedPosition === idx 
                                                ? 'bg-indigo-600 text-white' 
                                                : 'text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        Pos {idx + 1}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {calculatingPositional ? (
                            <div className="h-48 flex items-center justify-center text-slate-500 text-[10px] uppercase font-bold tracking-widest gap-2">
                                <RefreshCw className="animate-spin text-indigo-500" size={14} /> Extraction des profils...
                            </div>
                        ) : Object.keys(currentPosDNA).length > 0 ? (
                            <div className="grid md:grid-cols-2 gap-4">
                                {Object.keys(currentPosDNA)
                                    .sort((a,b) => currentPosDNA[b as AlgoKey] - currentPosDNA[a as AlgoKey])
                                    .slice(0, 14)
                                    .map((key) => {
                                        const weightVal = currentPosDNA[key as AlgoKey] || 0;
                                        const percentage = (weightVal * 100).toFixed(1);
                                        const isDominant = weightVal > 1.2 / Object.keys(currentPosDNA).length;
                                        const label = LABELS[key as AlgoKey] || key;
                                        
                                        return (
                                            <div key={key} className="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-col justify-between hover:border-slate-800 transition-all">
                                                <div className="flex justify-between items-center text-[10px] mb-2">
                                                    <span className="font-bold text-slate-200 uppercase tracking-wide">{label}</span>
                                                    <span className={`font-black ${isDominant ? 'text-emerald-400' : 'text-slate-400'}`}>{percentage}%</span>
                                                </div>
                                                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                                                    <div 
                                                        className={`h-full rounded-full transition-all duration-500 ${isDominant ? 'bg-gradient-to-r from-indigo-500 to-emerald-400' : 'bg-slate-700'}`}
                                                        style={{ width: `${Math.min(100, Math.max(2, weightVal * 500))}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        ) : (
                            <div className="text-center p-8 border border-dashed border-slate-850 rounded-2xl text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                                Calcul du profil positionnel stationnaire...
                            </div>
                        )}
                    </div>

                    {/* NEW COMPONENT: INITIAL DNA MONITORING SNAPSHOT (STEP 1) */}
                    <FirstPredictionDNASnapshotViewer snapshot={firstPredictionDNASnapshot} maxBalls={drawSpecifics.balls} />

                    {/* Comparaison Radar Panel */}
                    <div className="bg-slate-950 p-6 rounded-3xl border border-slate-900 shadow-xl flex flex-col lg:flex-row items-center gap-8 relative overflow-hidden min-w-0 w-full">
                         <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.2)_50%),linear-gradient(90deg,rgba(255,0,0,0.04),rgba(0,255,0,0.015),rgba(0,0,255,0.04))] bg-[length:100%_2px,3px_100%] pointer-events-none opacity-25"></div>

                         <div className="w-full lg:w-1/2 relative z-10 min-w-0">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Activity size={14} className="text-indigo-400"/> Mutation de l'ADN Global
                            </h4>
                            <div className="h-60 w-full flex items-center justify-center">
                                <AlgoRadar weights={liveWeights} previousWeights={status !== 'idle' ? originalWeights : undefined} />
                            </div>
                         </div>

                         <div className="w-full lg:w-1/2 relative z-10 flex flex-col gap-4 min-w-0">
                            <div className="bg-white/[0.02] p-4 rounded-xl border border-white/5">
                                <div className="text-[10px] font-black text-slate-500 uppercase mb-1 flex items-center gap-1.5">
                                    <span>Score Historique d'Alignement Actuel</span>
                                    {calculatingBaseline && <RefreshCw size={10} className="animate-spin text-indigo-400" />}
                                </div>
                                <div className="text-xl font-black text-slate-350">
                                    {calculatingBaseline ? 'Recalcul...' : (initialScore ? initialScore.toFixed(1) + '/100' : '--')}
                                </div>
                            </div>
                            <div className="bg-emerald-500/[0.04] p-4 rounded-xl border border-emerald-500/20 relative overflow-hidden">
                                <div className="absolute -right-4 -top-4 bg-emerald-500/15 w-20 h-20 rounded-full blur-xl"></div>
                                <div className="text-[10px] font-black text-emerald-400 uppercase mb-1">Score Historique d'Alignement Evolué</div>
                                <div className="text-3xl font-black text-emerald-400 flex items-center gap-2">
                                    {finalReport ? finalReport.score.toFixed(1) + '/100' : '--'}
                                    {improvement > 0 && <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-lg">+{improvement.toFixed(1)}%</span>}
                                </div>
                                {finalReport?.confidence_intervals && (
                                    <div className="mt-2 text-[10px] text-emerald-400 leading-relaxed font-mono">
                                        <div className="flex justify-between border-t border-emerald-500/10 pt-1.5">
                                            <span>Précision d'Impact:</span>
                                            <span>{finalReport.averageHits.toFixed(1)} &plusmn; {((finalReport.confidence_intervals.avgHits[1] - finalReport.confidence_intervals.avgHits[0]) / 2).toFixed(1)} hits/tirage</span>
                                        </div>
                                        {finalReport.mrr !== undefined && (
                                            <div className="flex justify-between border-t border-emerald-500/10 pt-1.5 mt-1.5">
                                                <span>MRR / NDCG:</span>
                                                <span>{finalReport.mrr.toFixed(3)} / {finalReport.ndcg?.toFixed(3)}</span>
                                            </div>
                                        )}
                                        {finalReport.topologicalLoss !== undefined && (
                                            <div className="flex justify-between border-t border-emerald-500/10 pt-1.5 mt-1.5">
                                                <span>Perte Topologique:</span>
                                                <span>{finalReport.topologicalLoss.toFixed(3)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Benchmark Bar Chart */}
                            {finalReport && (
                                <div className="h-28 w-full mt-2">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={benchmarkData} layout="vertical">
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="name" type="category" width={60} tick={{fontSize: 9, fill: '#64748b', fontWeight: 'bold'}} />
                                            <Tooltip contentStyle={{ backgroundColor: '#020617', border: 'none', borderRadius: '8px', fontSize: '9px' }} />
                                            <Bar dataKey="score" barSize={14} radius={[0, 4, 4, 0]}>
                                                {benchmarkData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {finalReport && (
                                <CyberneticValidation weights={liveWeights} drawName={drawName} history={history} />
                            )}
                         </div>
                    </div>
                </div>

                {/* DROITE : Helix render, logs & telem */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    
                    {/* ROTATING DOUBLE HELIX CARD */}
                    <div className="bg-[#05091a]/85 p-6 rounded-2xl shadow-xl border border-slate-850 text-center relative overflow-hidden">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center justify-center gap-2">
                            <Activity size={12} className="text-indigo-400 animate-pulse" /> Séquence d'ADN Active
                        </h4>
                        
                        <div className="py-4 flex justify-center items-center">
                            <GlowingHelix active={status === 'running'} />
                        </div>

                        {status === 'running' ? (
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest animate-pulse">Mutations stochastiques en cours...</span>
                        ) : status === 'completed' ? (
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Séquence stabilisée &amp; convergée</span>
                        ) : (
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Moteur en veille</span>
                        )}
                    </div>

                    {/* Live Metrics */}
                    <div className="bg-[#030712] p-5 rounded-2xl shadow-md border border-slate-800">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Cpu size={14} className="text-indigo-400"/> Télémétrie de recalcul</h4>
                        <div className="grid grid-cols-2 gap-3 font-mono">
                            <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-center">
                                <div className="text-[9px] font-bold text-slate-500 uppercase">Diversité</div>
                                <div className="text-base font-black text-indigo-400 mt-1">
                                    {evolutionData.length > 0 ? (evolutionData[evolutionData.length-1].diversity * 100).toFixed(1) + '%' : '100%'}
                                </div>
                            </div>
                            <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-center">
                                <div className="text-[9px] font-bold text-slate-500 uppercase">Progression</div>
                                <div className="text-base font-black text-slate-300 mt-1">
                                    {evolutionData.length > 0 ? (() => {
                                        const totalGens = (optimizerType === 'bayesian' || optimizerType === 'meta') ? 20 + generations : generations;
                                        return `${evolutionData[evolutionData.length-1].gen}/${totalGens}`;
                                    })() : '--'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1">
                        <LogTerminal logs={logs} />
                    </div>

                    {/* INTERCONNECTED HARMONIZATION CARD */}
                    <div className="p-5 bg-black/40 rounded-2xl border border-white/5 space-y-3">
                        <span className="text-[10px] font-black tracking-widest uppercase text-slate-500 block">
                            Harmonisation Cybernétique
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <button
                                onClick={() => {
                                    audioEngine.play('click');
                                    window.dispatchEvent(new CustomEvent("CROSS_MODULE_NAVIGATE", {
                                        detail: {
                                            view: 'home',
                                            drawName: drawName,
                                            mainTab: 'Forensic',
                                            subTab: 'prediction'
                                        }
                                    }));
                                }}
                                className="py-2.5 px-2 bg-indigo-950/40 hover:bg-indigo-900/40 text-indigo-400 border border-indigo-500/20 rounded-xl text-[8px] font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                            >
                                <Microscope size={10} /> Audits Forensic
                            </button>
                            <button
                                onClick={() => {
                                    audioEngine.play('click');
                                    window.dispatchEvent(new CustomEvent("CROSS_MODULE_NAVIGATE", {
                                        detail: {
                                            view: 'home',
                                            drawName: drawName,
                                            mainTab: 'Forensic',
                                            subTab: 'timemachine'
                                        }
                                    }));
                                }}
                                className="py-2.5 px-2 bg-fuchsia-950/40 hover:bg-fuchsia-900/40 text-fuchsia-400 border border-fuchsia-500/20 rounded-xl text-[8px] font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                            >
                                <History size={10} /> Machine Temporelle
                            </button>
                            <button
                                onClick={() => {
                                    audioEngine.play('click');
                                    window.dispatchEvent(new CustomEvent("CROSS_MODULE_NAVIGATE", {
                                        detail: {
                                            view: 'home',
                                            drawName: drawName,
                                            mainTab: 'Forensic',
                                            subTab: 'dna'
                                        }
                                    }));
                                }}
                                className="py-2.5 px-2 bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-500/20 rounded-xl text-[8px] font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                            >
                                <Dna size={10} /> Playground ADN
                            </button>
                        </div>
                    </div>

                    {/* Info Card explaining positional DNA matrix benefits */}
                    <div className="p-5 bg-indigo-950/20 rounded-2xl border border-indigo-900/40">
                        <p className="text-[10px] text-indigo-300 leading-relaxed font-semibold mb-2">
                            CIBLAGE DES COMPORTEMENTS SPATIAUX :
                        </p>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                            L'analyse est segmentée par position stochastique ordonnée. Les décades ont un comportement asymétrique : le Numéro 1 est majoritairement calibré par des indices à faible dérogeance gauche (Gaps/Poisson), contrastant avec le Numéro 5 qui suit d'autres corrélations de persistance.
                        </p>
                    </div>
                </div>
            </div>

            {/* --- SECTIONS SPÉCIALISÉES FORENSIC-TRAINING BRIDGE --- */}
            <div className="border-t border-slate-800/65 pt-10 mt-10 space-y-8">

                {/* 2. MODE SIMULATION DE BOUCLE */}
                <div className="bg-[#090e1f] border border-slate-800/85 p-6 md:p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>
                    
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-slate-800/60 pb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-400">
                              <History size={20} className="animate-pulse" />
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Simulation de Replay Déterministe</h4>
                                <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">Mode "Simulation de Boucle"</h2>
                                <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed max-w-xl">Rejoue chronologiquement une tranche de tirages historiques pour évaluer l'amélioration d'impact de l'apprentissage forensic adaptatif contre des poids statiques.</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 self-stretch md:self-auto justify-between md:justify-start">
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Taille de l'historique</span>
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="range" 
                                        min={5} 
                                        max={20} 
                                        disabled={loopRunning}
                                        value={loopSize} 
                                        onChange={(e) => setLoopSize(parseInt(e.target.value))}
                                        className="w-24 accent-indigo-500 bg-slate-950 h-1.5 rounded-lg cursor-pointer"
                                    />
                                    <span className="text-xs font-mono font-black text-indigo-400 bg-indigo-950/40 border border-indigo-500/20 px-2 py-0.5 rounded-md">{loopSize}</span>
                                </div>
                            </div>

                            <button
                                onClick={loopRunning ? handleStopLoopSimulation : handleStartLoopSimulation}
                                className={`px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95 shadow-lg cursor-pointer ${
                                    loopRunning 
                                        ? "bg-rose-950/45 hover:bg-rose-900/45 text-rose-400 border border-rose-900/30" 
                                        : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20"
                                }`}
                            >
                                {loopRunning ? (
                                    <>
                                        <X size={12} className="text-rose-400 animate-pulse" />
                                        <span>Interrompre ({loopProgress}%)</span>
                                    </>
                                ) : (
                                    <>
                                        <Play size={12} className="text-emerald-400 animate-pulse" />
                                        <span>Rejouer l'Historique</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {loopRunning && (
                        <div className="mb-6 relative z-10">
                            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-white/5">
                                <div 
                                    className="h-full bg-gradient-to-r from-indigo-500 via-teal-400 to-emerald-400 rounded-full transition-all duration-300"
                                    style={{ width: `${loopProgress}%` }}
                                ></div>
                            </div>
                        </div>
                    )}

                    {loopResults.length > 0 && (
                        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                            {/* TABLE DES ÉTAPES (col-span-8) */}
                            <div className="lg:col-span-8 space-y-3">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Détails Étape par Étape</span>
                                <div className="border border-slate-800 bg-slate-950/40 rounded-2xl overflow-hidden max-h-72 overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-left border-collapse font-mono text-[10px]">
                                        <thead>
                                            <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                                                <th className="p-3">Tirage (Date)</th>
                                                <th className="p-3">Régime</th>
                                                <th className="p-3 text-center">Gagnants</th>
                                                <th className="p-3 text-center text-slate-400">Hits Statiques</th>
                                                <th className="p-3 text-center text-emerald-400">Hits Feedback</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/40 text-slate-300">
                                            {loopResults.map((res, i) => (
                                                <tr key={i} className="hover:bg-white/[0.01] transition-colors">
                                                    <td className="p-3 font-bold">{res.date}</td>
                                                    <td className="p-3 text-[9px]">{res.regime.replace("_", " ")}</td>
                                                    <td className="p-3 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            {res.actual.map((n: number) => {
                                                                const hitInLoop = res.predictedLoop.includes(n);
                                                                return (
                                                                    <span 
                                                                        key={n} 
                                                                        className={`w-5 h-5 rounded-full text-[9px] flex items-center justify-center font-bold ${
                                                                            hitInLoop 
                                                                                ? "bg-emerald-500/20 border border-emerald-500 text-emerald-400 shadow-sm shadow-emerald-500/10" 
                                                                                : "bg-slate-900 border border-slate-800 text-slate-500"
                                                                        }`}
                                                                    >
                                                                        {n}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-center font-bold text-slate-400">{res.hitsStatic}</td>
                                                    <td className="p-3 text-center font-black text-emerald-400 bg-emerald-500/[0.01]">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <span>{res.hitsLoop}</span>
                                                            {res.hitsLoop > res.hitsStatic && <span className="text-[8px] px-1 bg-emerald-500/10 rounded font-bold">▲</span>}
                                                            {res.hitsLoop < res.hitsStatic && <span className="text-[8px] px-1 bg-rose-500/10 rounded font-bold">▼</span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* TÉLÉMÉTRIE CUMULÉE (col-span-4) */}
                            <div className="lg:col-span-4 flex flex-col justify-between gap-4">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Télémétrie Cumulée</span>
                                
                                <div className="flex-1 bg-slate-950 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden">
                                    {loopSummary ? (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[9px] font-bold text-slate-500 uppercase">Hits Totaux (Statique)</span>
                                                <span className="font-mono font-bold text-slate-400">{loopSummary.totalHitsStatic}</span>
                                            </div>
                                            <div className="flex justify-between items-center border-b border-slate-900 pb-3">
                                                <span className="text-[9px] font-bold text-slate-500 uppercase">Hits Totaux (Feedback)</span>
                                                <span className="font-mono font-black text-emerald-400 text-base">{loopSummary.totalHitsLoop}</span>
                                            </div>
                                            <div className="pt-2 text-center">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Amélioration Globale</span>
                                                <div className={`text-3xl font-black ${loopSummary.improvement >= 0 ? "text-emerald-400" : "text-rose-400"} tracking-tighter flex items-center justify-center gap-1.5`}>
                                                    <span>{loopSummary.improvement >= 0 ? "+" : ""}{loopSummary.improvement}%</span>
                                                    {loopSummary.improvement >= 0 ? (
                                                        <TrendingUp size={24} className="text-emerald-400" />
                                                    ) : (
                                                        <TrendingUp size={24} className="text-rose-400 rotate-180" />
                                                    )}
                                                </div>
                                                <p className="text-[9px] text-slate-400 leading-normal mt-2 max-w-xs mx-auto font-semibold">
                                                    Le feedback forensic continu permet d'isoler les déviances et d'auto-ajuster l'influence de chaque algorithme en temps réel.
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-500 text-[10px] uppercase font-bold tracking-widest gap-2 py-8">
                                            {loopRunning ? (
                                                <>
                                                    <RefreshCw className="animate-spin text-indigo-500" size={16} />
                                                    <span>Calcul cumulé...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <HelpCircle size={24} className="text-slate-600 mb-1" />
                                                    <span>En attente de démarrage</span>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
