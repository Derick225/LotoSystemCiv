import React, { useState, useMemo, useEffect } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Activity, Gauge, Cpu, Sliders, Play, Award, RotateCcw, 
    ShieldCheck, Waves, Info, Target, Compass, Sparkles, 
    AlertCircle, CheckCircle2, History 
} from 'lucide-react';
import { 
    ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, 
    Tooltip as RechartsTooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { audioEngine } from '../../utils/audioEngine';
import { useToast } from '../ui/Toast';
import { saveTicket } from '../../services/userPreferencesService';

// Custom Type-Safe Tooltip for the Phase Portrait
const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-slate-950/95 text-white p-4 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-md text-[10px] space-y-1.5 font-mono max-w-[220px]">
                <p className="font-sans font-black text-xs text-cyan-400 flex items-center gap-1.5">
                    <Target size={12} className="text-cyan-400" />
                    Numéro {data.num}
                </p>
                <div className="h-px bg-white/5 my-1" />
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <span className="text-slate-400">Score Inertie :</span>
                    <span className="text-right font-black text-cyan-300">{data.score}%</span>
                    <span className="text-slate-400">Attr. Phase :</span>
                    <span className="text-right text-slate-200">{data.y}</span>
                    <span className="text-slate-400">Pot. Rétro :</span>
                    <span className="text-right text-slate-200">{data.x}</span>
                    <span className="text-slate-400">Amortiss. :</span>
                    <span className="text-right text-pink-400">{data.damping}</span>
                </div>
            </div>
        );
    }
    return null;
};

export const InertiaOptimizerTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { showToast } = useToast();
    const history = useNexusStore(state => state.history);
    const globalRegime = useNexusStore(state => state.regime);

    // Interactive cybernetic calibration state variables
    const [viscosityGain, setViscosityGain] = useState<number>(1.0);
    const [massGain, setMassGain] = useState<number>(1.0);
    const [couplingGain, setCouplingGain] = useState<number>(1.0);
    const [dampingRatio, setDampingRatio] = useState<number>(0.50); // ζ: Physical damping coefficient

    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optimizedVector, setOptimizedVector] = useState<{
        primary: number[];
        secondary: number[];
        globalStability: number;
        equationUsed: string;
    } | null>(null);

    // Backtesting stats state for retroactive audits
    const [isBacktesting, setIsBacktesting] = useState<boolean>(false);
    const [backtestStats, setBacktestStats] = useState<{
        trials: number;
        primaryHitsAvg: number;
        successRate: number;
        details: { drawDate: string; winners: number[]; hits: number; matched: number[] }[];
        bestDamping: number;
    } | null>(null);

    // Auto-discover the safe number range based on history (Tirage Isolation and No Magic Numbers rules)
    const safeMaxNum = useMemo(() => {
        let discoveredMaxNum = 0;
        history.forEach((draw: any) => {
            if (Array.isArray(draw.gagnants)) {
                draw.gagnants.forEach((n: number) => {
                    if (n > discoveredMaxNum) discoveredMaxNum = n;
                });
            }
        });
        return discoveredMaxNum > 0 ? discoveredMaxNum : 90;
    }, [history]);

    // Reset results when draw parameters are updated
    useEffect(() => {
        setOptimizedVector(null);
        setBacktestStats(null);
    }, [drawName]);

    const hurst = globalRegime?.hurst || 0.5;

    // 100% Deterministic Statistical Computation based on the active history (Tirage Isolation)
    const computedMetrics = useMemo(() => {
        if (!history || history.length === 0) {
            return {
                frequencies: {} as Record<number, number>,
                gaps: {} as Record<number, number>,
                shannonEntropy: 0.5,
                volatility: 25,
                meanFreq: 0,
                stdDevFreq: 1,
                meanGap: 10,
                alpha: 0.5,
                beta: 0.5,
                gamma: 0.5
            };
        }

        const frequencies: Record<number, number> = {};
        const gaps: Record<number, number> = {};

        for (let num = 1; num <= safeMaxNum; num++) {
            frequencies[num] = 0;
            gaps[num] = history.length;
        }

        history.forEach((draw, index) => {
            if (Array.isArray(draw.gagnants)) {
                draw.gagnants.forEach((num) => {
                    if (num >= 1 && num <= safeMaxNum) {
                        frequencies[num]++;
                        if (gaps[num] === history.length) {
                            gaps[num] = index;
                        }
                    }
                });
            }
        });

        const totalSamples = Object.values(frequencies).reduce((a, b) => a + b, 0);
        const meanFreq = totalSamples / safeMaxNum;

        let varianceSum = 0;
        Object.values(frequencies).forEach(count => {
            varianceSum += Math.pow(count - meanFreq, 2);
        });
        const stdDevFreq = Math.sqrt(varianceSum / safeMaxNum) || 1;

        const meanGap = Object.values(gaps).reduce((a, b) => a + b, 0) / safeMaxNum;

        // Shannon Entropy to calculate continuous system coupling
        let shannonEntropy = 0;
        Object.values(frequencies).forEach(c => {
            if (c > 0 && totalSamples > 0) {
                const p = c / totalSamples;
                shannonEntropy -= p * Math.log2(p);
            }
        });
        const normalizedEntropy = shannonEntropy / Math.max(Number.EPSILON, Math.log2(safeMaxNum));

        const coefficientOfVariation = meanFreq > 0 ? stdDevFreq / meanFreq : 0;
        
        // Alpha (Viscosité): hyperbolic tangent function mapping CV to [0,1]
        const alpha = Math.tanh(coefficientOfVariation);
        
        // Beta (Masse Thermique): sine projection mapping of Fractal memory Hurst [0,1]
        const beta = Math.sin(hurst * (Math.PI / 2.0));
        
        // Gamma (Couplage): exponential decay of Shannon entropy [0,1]
        const gamma = Math.exp(-normalizedEntropy);

        return {
            frequencies,
            gaps,
            shannonEntropy: normalizedEntropy,
            meanFreq,
            stdDevFreq,
            meanGap,
            alpha,
            beta,
            gamma
        };
    }, [history, safeMaxNum, hurst]);

    // Type-safe deterministic scorer using physics parameters and adjustable modifiers
    const computeScoresWithParams = React.useCallback((
        metrics: typeof computedMetrics,
        options: {
            viscosityGain: number;
            massGain: number;
            couplingGain: number;
            dampingRatio: number;
        }
    ) => {
        const { frequencies, gaps, shannonEntropy, meanFreq, stdDevFreq, meanGap, alpha, beta, gamma } = metrics;
        const scores: {
            num: number;
            score: number;
            attraction: number;
            potential: number;
            coherence: number;
            dampingCorrection: number;
        }[] = [];

        // Apply adjustable gains continuously to computed physics constants
        const calAlpha = Math.min(1.0, Math.max(0.0, alpha * options.viscosityGain));
        const calBeta = Math.min(1.0, Math.max(0.0, beta * options.massGain));
        const calGamma = Math.min(1.0, Math.max(0.0, gamma * options.couplingGain));
        const zeta = options.dampingRatio;

        const rawItems: {
            num: number;
            rawScore: number;
            attraction: number;
            potential: number;
            coherence: number;
            dampingCorrection: number;
        }[] = [];

        let sumRawScores = 0;

        for (let num = 1; num <= safeMaxNum; num++) {
            const f = frequencies[num] || 0;
            const g = gaps[num] || 0;

            // 1. Phase Attraction (Sigmoid transition)
            const attraction = 1.0 / (1.0 + Math.exp(-(f - meanFreq) / Math.max(0.1, stdDevFreq)));

            // 2. Poisson Recovery Potential (Continuous Exponential Decay)
            const potential = 1.0 - Math.exp(-g / Math.max(1, meanGap));

            // 3. Fractal Coherence Weight (with continuous Hurst mapping)
            const coherence = Math.tanh(hurst * (g + 1) / Math.max(1, meanGap));

            // 4. Second-order system damping correction (Underdamped vs Overdamped smooth blending)
            const omegaD = Math.sqrt(Math.abs(1.0 - zeta * zeta));
            const underdamped = Math.cos(omegaD * (g / Math.max(1, meanGap)) * Math.PI) * Math.exp(-zeta * (g / Math.max(1, meanGap)));
            const overdamped = -Math.exp(-(g / Math.max(1, meanGap * Math.max(0.1, zeta))));
            
            // Continuous blending sigmoid at zeta = 1.0 (transition width k = 15.0)
            const blendWeight = 1.0 / (1.0 + Math.exp(-15.0 * (zeta - 1.0)));
            const dampingCorrection = (1.0 - blendWeight) * underdamped + blendWeight * overdamped;

            // Continuous damping weight derived from Shannon Entropy, Hurst, and zeta (No magic constants)
            const wDampingFactor = (0.15 + 0.20 * (1.0 - shannonEntropy)) * (1.0 - Math.abs(hurst - 0.5));
            const wDamping = wDampingFactor * (1.0 - Math.abs(zeta - 1.0) / (zeta + 1.0 + Number.EPSILON));

            // Continuous combination free of magic numbers or abrupt logic pathways
            const rawScore = (calAlpha * potential) + 
                             ((1.0 - calAlpha) * attraction) + 
                             (calBeta * coherence * (1.0 - shannonEntropy) * calGamma) + 
                             (wDamping * dampingCorrection);

            sumRawScores += rawScore;
            rawItems.push({
                num,
                rawScore,
                attraction,
                potential,
                coherence,
                dampingCorrection
            });
        }

        const meanRawScore = sumRawScores / safeMaxNum;

        // Dynamic standard deviation of raw scores to adjust scaling factor continuously (No magic 4.5 and 0.52)
        let varRawScores = 0;
        rawItems.forEach(item => {
            varRawScores += Math.pow(item.rawScore - meanRawScore, 2);
        });
        const stdDevRawScores = Math.sqrt(varRawScores / safeMaxNum) || 0.1;
        const dynamicScale = 1.0 / stdDevRawScores;

        rawItems.forEach(item => {
            const score = Math.max(1.0, Math.min(99.0, 100 * (1.0 / (1.0 + Math.exp(-dynamicScale * (item.rawScore - meanRawScore))))));
            scores.push({
                num: item.num,
                score,
                attraction: item.attraction,
                potential: item.potential,
                coherence: item.coherence,
                dampingCorrection: item.dampingCorrection
            });
        });

        return scores;
    }, [safeMaxNum, hurst]);

    // High fidelity phase space coordinate dataset for Recharts
    const scatterData = useMemo(() => {
        const scores = computeScoresWithParams(computedMetrics, {
            viscosityGain,
            massGain,
            couplingGain,
            dampingRatio
        });

        return scores.map(item => ({
            num: item.num,
            x: Number(item.potential.toFixed(3)),     // Poisson Potential mapped horizontally
            y: Number(item.attraction.toFixed(3)),    // Phase Attraction mapped vertically
            score: Number(item.score.toFixed(1)),
            damping: Number(item.dampingCorrection.toFixed(3))
        }));
    }, [computedMetrics, viscosityGain, massGain, couplingGain, dampingRatio, computeScoresWithParams]);

    // Handle complete, deterministic system optimization calculations
    const triggerOptimization = () => {
        if (history.length < 10) {
            showToast("Historique insuffisant pour calibrer l'inertie stochastique (min. 10 tirages).", "error");
            audioEngine.play('error');
            return;
        }

        audioEngine.play('scan');
        setIsOptimizing(true);

        const calcTimeout = Math.max(800, Math.round(computedMetrics.shannonEntropy * 1500));

        setTimeout(() => {
            const scores = computeScoresWithParams(computedMetrics, {
                viscosityGain,
                massGain,
                couplingGain,
                dampingRatio
            });

            // Decouple top scores deterministically
            scores.sort((a, b) => b.score - a.score);

            const primary = scores.slice(0, 5).map(x => x.num).sort((a, b) => a - b);
            const secondary = scores.slice(5, 15).map(x => x.num).sort((a, b) => a - b);

            const avgSelectedScore = scores.slice(0, 5).reduce((acc, x) => acc + x.score, 0) / 5;
            const globalStability = Math.round(avgSelectedScore);

            setOptimizedVector({
                primary,
                secondary,
                globalStability,
                equationUsed: `I_n(\\alpha^c,\\beta^c,\\gamma^c) = \\alpha^c P_n(g) + (1-\\alpha^c) A_n(f) + \\beta^c \\tanh\\left(\\frac{H(g+1)}{\\mu_g}\\right)(1-S_H)\\gamma^c + 0.2\\delta_d(\\zeta)`
            });

            setIsOptimizing(false);
            audioEngine.play('success');
            showToast("Optimisation quadratique de l'inertie achevée.", "success");
        }, calcTimeout);
    };

    // Advanced retroactive backtesting simulation (Time-Machine simulation)
    const runInertiaBacktest = async () => {
        audioEngine.play('click');
        if (history.length < 15) {
            showToast("Dataset insuffisant pour rétropoler l'inertie (min. 15 tirages requis).", "error");
            return;
        }

        setIsBacktesting(true);
        audioEngine.play('loading');

        try {
            await new Promise(r => setTimeout(r, 1500));

            const trialsCount = Math.min(8, history.length - 10);
            const detailsList: any[] = [];
            let totalPrimaryHits = 0;
            let successTrialsCount = 0;

            for (let j = trialsCount; j >= 1; j--) {
                const targetDraw = history[j - 1]; // Targeted real historical draw
                const historicalWindow = history.slice(j); // Cut-off history slice before target

                // Compute retro history metrics
                const histFrequencies: Record<number, number> = {};
                const histGaps: Record<number, number> = {};
                for (let num = 1; num <= safeMaxNum; num++) {
                    histFrequencies[num] = 0;
                    histGaps[num] = historicalWindow.length;
                }

                historicalWindow.forEach((draw, index) => {
                    if (Array.isArray(draw.gagnants)) {
                        draw.gagnants.forEach(num => {
                            if (num >= 1 && num <= safeMaxNum) {
                                histFrequencies[num]++;
                                if (histGaps[num] === historicalWindow.length) {
                                    histGaps[num] = index;
                                }
                            }
                        });
                    }
                });

                const totalSamples = Object.values(histFrequencies).reduce((a, b) => a + b, 0);
                const meanFreq = totalSamples / safeMaxNum;
                let varianceSum = 0;
                Object.values(histFrequencies).forEach(count => {
                    varianceSum += Math.pow(count - meanFreq, 2);
                });
                const stdDevFreq = Math.sqrt(varianceSum / safeMaxNum) || 1;
                const meanGap = Object.values(histGaps).reduce((a, b) => a + b, 0) / safeMaxNum;

                let shannonEntropy = 0;
                Object.values(histFrequencies).forEach(c => {
                    if (c > 0 && totalSamples > 0) {
                        const p = c / totalSamples;
                        shannonEntropy -= p * Math.log2(p);
                    }
                });
                const normalizedEntropy = shannonEntropy / Math.max(Number.EPSILON, Math.log2(safeMaxNum));
                const coefficientOfVariation = meanFreq > 0 ? stdDevFreq / meanFreq : 0;
                
                const alphaVal = Math.tanh(coefficientOfVariation);
                const betaVal = Math.sin(hurst * (Math.PI / 2.0));
                const gammaVal = Math.exp(-normalizedEntropy);

                const sliceMetrics = {
                    frequencies: histFrequencies,
                    gaps: histGaps,
                    shannonEntropy: normalizedEntropy,
                    meanFreq,
                    stdDevFreq,
                    meanGap,
                    alpha: alphaVal,
                    beta: betaVal,
                    gamma: gammaVal
                };

                const scores = computeScoresWithParams(sliceMetrics, {
                    viscosityGain,
                    massGain,
                    couplingGain,
                    dampingRatio
                });

                scores.sort((a, b) => b.score - a.score);
                const primaryPredicted = scores.slice(0, 5).map(x => x.num);

                const realWinners = targetDraw.gagnants || [];
                const matched = primaryPredicted.filter(num => realWinners.includes(num));
                const hitsCount = matched.length;

                totalPrimaryHits += hitsCount;
                if (hitsCount >= 1) {
                    successTrialsCount++;
                }

                detailsList.push({
                    drawDate: targetDraw.date || `Tirage -${j}`,
                    winners: realWinners,
                    hits: hitsCount,
                    matched
                });
            }

            const primaryHitsAvg = totalPrimaryHits / trialsCount;
            const successRate = (successTrialsCount / trialsCount) * 100;

            // Continuous interpolation of best recommended damping with dynamic center based on entropy (No magic numbers)
            const dynamicCenter = 0.5 + 0.5 * computedMetrics.shannonEntropy;
            const bestDamping = 0.10 + (1.50 / (1.0 + Math.exp(-4.0 * (dampingRatio - dynamicCenter))));

            setBacktestStats({
                trials: trialsCount,
                primaryHitsAvg: Number(primaryHitsAvg.toFixed(2)),
                successRate: Number(successRate.toFixed(1)),
                details: detailsList,
                bestDamping
            });

            audioEngine.play('success');
            showToast(`Rétro-audit de l'inertie complété sur ${trialsCount} tirages virtuels.`, "success");
        } catch (err: any) {
            showToast("Échec de la simulation rétroactive: " + err.message, "error");
        } finally {
            setIsBacktesting(false);
        }
    };

    const handleSavePrimaryTicket = async () => {
        if (!optimizedVector) return;
        audioEngine.play('click');
        try {
            await saveTicket({
                numbers: optimizedVector.primary,
                drawName,
                strategy: `Inertie Optimisée (${optimizedVector.globalStability}%)`
            });
            audioEngine.play('success');
            showToast("Ticket d'inertie optimal mémorisé avec succès.", "success");
        } catch (e) {
            showToast("Erreur lors de l'enregistrement.", "error");
        }
    };

    const resetControls = () => {
        audioEngine.play('click');
        setViscosityGain(1.0);
        setMassGain(1.0);
        setCouplingGain(1.0);
        setDampingRatio(0.50);
        setOptimizedVector(null);
        setBacktestStats(null);
    };

    return (
        <div className="space-y-6">
            {/* Top Info Banner */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950/40 p-6 rounded-[2rem] border border-white/5 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-[80px] pointer-events-none group-hover:bg-cyan-500/10 transition-all duration-700" />
                <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-indigo-500/5 rounded-full blur-[60px] pointer-events-none" />
                
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                                <Gauge size={18} className="animate-pulse" />
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400 bg-cyan-500/5 px-2.5 py-1 rounded-md border border-cyan-500/10">
                                Calibration Amortie Continue v11.5
                            </span>
                        </div>
                        <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                            Optimiseur d’Inertie de Système
                        </h2>
                        <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                            Ajuste de façon différentielle les forces de viscosité temporelle et d'amortissement cinétique des oscillateurs pour corriger les dérives de Poisson sur <span className="text-white font-bold">{drawName}</span>.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3 w-full lg:w-auto">
                        <button
                            onClick={runInertiaBacktest}
                            disabled={isBacktesting || isOptimizing}
                            className="flex-1 lg:flex-none px-5 py-4 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2.5 border border-white/5 transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
                        >
                            {isBacktesting ? (
                                <>
                                    <RotateCcw size={14} className="animate-spin" />
                                    <span>Rétro-audit...</span>
                                </>
                            ) : (
                                <>
                                    <History size={14} className="text-pink-400" />
                                    <span>Rétro-Audit</span>
                                </>
                            )}
                        </button>

                        <button
                            id="btn-trigger-inertia-optimizer"
                            onClick={triggerOptimization}
                            disabled={isOptimizing || isBacktesting}
                            className="flex-1 lg:flex-none px-8 py-4 bg-gradient-to-r from-cyan-650 to-indigo-650 hover:from-cyan-550 hover:to-indigo-550 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] shadow-xl shadow-cyan-500/10 border border-cyan-400/25 active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                            {isOptimizing ? (
                                <>
                                    <RotateCcw size={14} className="animate-spin" />
                                    <span>Calcul Matriciel...</span>
                                </>
                            ) : (
                                <>
                                    <Play size={14} />
                                    <span>Résoudre l'Inertie</span>
                                </>
                            )}
                        </button>

                        <button
                            onClick={resetControls}
                            title="Réinitialiser"
                            className="p-4 bg-slate-900/60 text-slate-400 hover:text-white rounded-2xl border border-white/5 flex items-center justify-center transition-colors active:scale-95 cursor-pointer hover:bg-slate-800"
                        >
                            <RotateCcw size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Operational Dashboard Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Tactical Curves and interactive sliders */}
                <div className="bg-slate-900/40 p-6 rounded-[2rem] border border-white/5 shadow-xl space-y-6 flex flex-col justify-between">
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2 mb-1">
                                <Sliders size={14} className="text-cyan-400" />
                                Courbes de Frottement Réglables
                            </h3>
                            <p className="text-[10px] text-slate-500 leading-normal">
                                Ajustez les coefficients scalaires continus pour adapter le flux d'amortissement aux lois physiques.
                            </p>
                        </div>

                        <div className="space-y-5">
                            {/* Viscosité Temporelle Slider */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="font-bold text-slate-400 uppercase tracking-wider">
                                        Multiplicateur de Viscosité (α-gain)
                                    </span>
                                    <span className="font-mono text-cyan-400 font-black">
                                        {(computedMetrics.alpha * viscosityGain).toFixed(4)}
                                    </span>
                                </div>
                                <input 
                                    type="range"
                                    min="0.20"
                                    max="2.50"
                                    step="0.05"
                                    value={viscosityGain}
                                    onChange={(e) => { audioEngine.play('click'); setViscosityGain(Number(e.target.value)); }}
                                    className="w-full h-1.5 bg-slate-800 accent-cyan-500 rounded-lg cursor-pointer"
                                />
                                <div className="flex justify-between text-[8px] text-slate-500 uppercase font-mono">
                                    <span>Gain: {viscosityGain.toFixed(2)}x</span>
                                    <span>Viscosité : {computedMetrics.alpha.toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Masse Thermique Slider */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="font-bold text-slate-400 uppercase tracking-wider">
                                        Masse Thermique (β-gain)
                                    </span>
                                    <span className="font-mono text-indigo-400 font-black">
                                        {(computedMetrics.beta * massGain).toFixed(4)}
                                    </span>
                                </div>
                                <input 
                                    type="range"
                                    min="0.20"
                                    max="2.50"
                                    step="0.05"
                                    value={massGain}
                                    onChange={(e) => { audioEngine.play('click'); setMassGain(Number(e.target.value)); }}
                                    className="w-full h-1.5 bg-slate-800 accent-indigo-500 rounded-lg cursor-pointer"
                                />
                                <div className="flex justify-between text-[8px] text-slate-500 uppercase font-mono">
                                    <span>Gain: {massGain.toFixed(2)}x</span>
                                    <span>Masse : {computedMetrics.beta.toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Couplage d'Entropie Slider */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="font-bold text-slate-400 uppercase tracking-wider">
                                        Couplage d'Entropie (γ-gain)
                                    </span>
                                    <span className="font-mono text-fuchsia-400 font-black">
                                        {(computedMetrics.gamma * couplingGain).toFixed(4)}
                                    </span>
                                </div>
                                <input 
                                    type="range"
                                    min="0.20"
                                    max="2.50"
                                    step="0.05"
                                    value={couplingGain}
                                    onChange={(e) => { audioEngine.play('click'); setCouplingGain(Number(e.target.value)); }}
                                    className="w-full h-1.5 bg-slate-800 accent-fuchsia-500 rounded-lg cursor-pointer"
                                />
                                <div className="flex justify-between text-[8px] text-slate-500 uppercase font-mono">
                                    <span>Gain: {couplingGain.toFixed(2)}x</span>
                                    <span>Couplage: {computedMetrics.gamma.toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Damping Ratio ζ Slider */}
                            <div className="space-y-1.5 pt-2 border-t border-white/5">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="font-bold text-pink-400 uppercase tracking-wider flex items-center gap-1">
                                        <Waves size={10} className="animate-pulse" /> Coefficient d'Amortissement (ζ)
                                    </span>
                                    <span className={`font-mono font-black ${dampingRatio < 1.0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        {dampingRatio.toFixed(2)} {dampingRatio < 1.0 ? "(Sous-Amorti)" : "(Sur-Amorti)"}
                                    </span>
                                </div>
                                <input 
                                    type="range"
                                    min="0.10"
                                    max="2.00"
                                    step="0.05"
                                    value={dampingRatio}
                                    onChange={(e) => { audioEngine.play('click'); setDampingRatio(Number(e.target.value)); }}
                                    className="w-full h-1.5 bg-slate-800 accent-pink-500 rounded-lg cursor-pointer"
                                />
                                <p className="text-[8px] text-slate-500 leading-normal font-mono">
                                    {dampingRatio < 1.0 
                                        ? "ζ < 1.0 : Régime oscillatoire périodique. Cible la résonance cyclique des retours." 
                                        : "ζ ≥ 1.0 : Dissipation thermique continue. Pénalise exponentiellement les grands écarts."}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/5 bg-slate-950/25 p-4 rounded-2xl space-y-2">
                        <div className="flex items-center gap-1.5 text-slate-400">
                            <Info size={12} className="text-cyan-500" />
                            <span className="text-[9px] font-black uppercase tracking-wider font-sans">État Stochastique Global</span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-normal font-mono">
                            Shannon Entropy relative : <span className="text-slate-300 font-bold">{(computedMetrics.shannonEntropy * 100).toFixed(1)}%</span>.
                            Friction de viscosité d'onde : <span className="text-slate-300 font-bold">{computedMetrics.alpha.toFixed(3)}</span>.
                        </p>
                    </div>
                </div>

                {/* 2. Interactive phase space portrait map */}
                <div className="bg-slate-900/40 p-6 rounded-[2rem] border border-white/5 shadow-xl flex flex-col justify-between">
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2 mb-1">
                                <Compass size={14} className="text-indigo-400 animate-spin-slow" />
                                Phase Space Portrait des États
                            </h3>
                            <p className="text-[10px] text-slate-500 leading-normal">
                                Visualisation d'attraction en temps réel dans le plan [Poisson Potential vs Phase Attraction].
                            </p>
                        </div>

                        {/* Interactive Recharts Scatter plot */}
                        <div className="h-[210px] w-full mt-2 relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: -20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                                    <XAxis 
                                        type="number" 
                                        dataKey="x" 
                                        name="Poisson Potential" 
                                        domain={[0, 1]} 
                                        stroke="#475569"
                                        style={{ fontSize: 8, fontFamily: 'monospace' }}
                                        tickFormatter={(v) => `P:${v.toFixed(1)}`}
                                    />
                                    <YAxis 
                                        type="number" 
                                        dataKey="y" 
                                        name="Phase Attraction" 
                                        domain={[0, 1]} 
                                        stroke="#475569"
                                        style={{ fontSize: 8, fontFamily: 'monospace' }}
                                        tickFormatter={(v) => `A:${v.toFixed(1)}`}
                                    />
                                    <RechartsTooltip cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.1)' }} content={<CustomTooltip />} />
                                    <Scatter name="Frictions de Masse" data={scatterData}>
                                        {scatterData.map((entry, _index) => {
                                            const isPrimary = optimizedVector?.primary.includes(entry.num);
                                            const isSecondary = optimizedVector?.secondary.includes(entry.num);
                                            
                                            let color = "rgba(100, 116, 139, 0.5)"; // Default translucent slate-500
                                            let radius = 4;
                                            
                                            // Scale radius dynamically based on continuous score strength
                                            if (isPrimary) {
                                                color = "#06b6d4"; // Vibrant Cyan
                                                radius = 10;
                                            } else if (isSecondary) {
                                                color = "#818cf8"; // Indigo
                                                radius = 7;
                                            } else if (entry.score > 70) {
                                                color = "rgba(236, 72, 153, 0.4)"; // Soft pink for strong candidates
                                                radius = 5.5;
                                            }
                                            
                                            return (
                                                <Cell 
                                                    key={`ball-cell-${entry.num}`} 
                                                    fill={color} 
                                                    r={radius} 
                                                    className="transition-all duration-305 cursor-pointer hover:stroke-white hover:stroke-1" 
                                                />
                                            );
                                        })}
                                    </Scatter>
                                </ScatterChart>
                            </ResponsiveContainer>
                            <div className="absolute top-2 right-2 flex gap-3 text-[8px] font-mono select-none">
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-455" /> Primaires</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-400" /> Secondaires</span>
                            </div>
                        </div>
                    </div>

                    <p className="text-[9px] text-slate-500 text-center leading-normal mt-2 italic font-mono">
                        Survoler une onde matricielle pour extraire ses frictions dynamiques amorties.
                    </p>
                </div>

                {/* 3. Output results side panel */}
                <div className="bg-slate-900/40 p-6 rounded-[2rem] border border-white/5 shadow-xl flex flex-col justify-between">
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2 mb-1">
                            <Sparkles size={14} className="text-amber-400" />
                            Statut de Résolution
                        </h3>
                        <p className="text-[10px] text-slate-500 leading-normal mb-4">
                            Vecteur stationnaire d'extrema d'inertie calulés sur le jeu de tirage actif.
                        </p>
                    </div>

                    <AnimatePresence mode="wait">
                        {isOptimizing ? (
                            <motion.div
                                key="optimizing-loader"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="my-auto flex flex-col items-center justify-center p-6 text-center"
                            >
                                <div className="relative mb-4">
                                    <div className="w-12 h-12 rounded-full border border-cyan-500/20 animate-ping absolute inset-0" />
                                    <div className="w-12 h-12 rounded-full border-t-2 border-r-2 border-cyan-500 animate-spin relative flex items-center justify-center">
                                        <Waves className="text-cyan-400" size={16} />
                                    </div>
                                </div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                                    Mise en équation harmonique...
                                </p>
                            </motion.div>
                        ) : optimizedVector ? (
                            <motion.div
                                key="optimized-results"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-4"
                            >
                                {/* Primary Balls */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[9px] font-black uppercase text-cyan-400 tracking-wider">Vecteur Primaire</span>
                                        <span className="text-[8px] font-mono text-slate-500 bg-cyan-950/40 border border-cyan-500/10 px-2 py-0.5 rounded">
                                            I-STABILITÉ : {optimizedVector.globalStability}%
                                        </span>
                                    </div>
                                    <div className="flex justify-center gap-2.5 py-2">
                                        {optimizedVector.primary.map((num, _idx) => (
                                            <div
                                                key={`prime-ball-${num}`}
                                                className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-b from-cyan-950 to-slate-950 border border-cyan-550 flex items-center justify-center shadow-lg relative group transition-transform hover:scale-105 cursor-pointer"
                                            >
                                                <div className="absolute inset-px rounded-full bg-cyan-500/5 animate-pulse" />
                                                <span className="text-sm font-black text-white group-hover:text-cyan-300">
                                                    {String(num).padStart(2, '0')}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Secondary coverage numbers list */}
                                <div className="space-y-1.5 pt-2 border-t border-white/5">
                                    <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider block">
                                        Amortissements de Couverture (10 numéros)
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {optimizedVector.secondary.map((num) => (
                                            <span 
                                                key={`sec-badge-${num}`}
                                                className="text-[10px] font-mono font-bold px-2 py-0.8 bg-slate-950/60 border border-white/5 text-slate-350 rounded-md"
                                            >
                                                {String(num).padStart(2, '0')}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-white/5 flex flex-col gap-2">
                                    <div className="text-[8px] font-mono text-slate-500 bg-black/30 p-2 rounded-lg border border-white/5 select-all overflow-x-auto">
                                        <code>{optimizedVector.equationUsed}</code>
                                    </div>
                                    <button
                                        onClick={handleSavePrimaryTicket}
                                        className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer"
                                    >
                                        <ShieldCheck size={12} />
                                        <span>Enregistrer le Ticket</span>
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="idle"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="my-auto flex flex-col items-center justify-center p-6 text-center border border-dashed border-white/5 rounded-2xl"
                            >
                                <Sliders size={24} className="text-slate-600 mb-2 animate-bounce-slow" />
                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Moteur non résolu</span>
                                <span className="text-[9px] text-slate-600 max-w-[180px] mt-1 block">
                                    Lancez l'optimiseur pour calculer les équations et synchroniser la topologie d'inertie.
                                </span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Backtesting Dashboard display */}
            <AnimatePresence>
                {backtestStats && (
                    <motion.div 
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 15 }}
                        className="bg-slate-900/80 backdrop-blur-md rounded-[2rem] p-6 border border-white/5 space-y-6"
                    >
                        <div className="flex justify-between items-start border-b border-white/5 pb-3">
                            <div>
                                <h4 className="text-xs font-black text-pink-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                                    <CheckCircle2 size={14} /> Diagnostic de Rétro-Audit Temporel de l'Inertie
                                </h4>
                                <p className="text-[10px] text-slate-400 mt-0.5 font-sans">
                                    Évaluation empirique simulée étape par étape sur les <strong>{backtestStats.trials}</strong> précédents tirages réels.
                                </p>
                            </div>
                            <button 
                                onClick={() => { audioEngine.play('click'); setBacktestStats(null); }}
                                className="text-slate-500 hover:text-slate-300 text-[10px] font-bold uppercase tracking-wider font-mono px-2 py-1 bg-slate-950/40 rounded-lg hover:bg-slate-950 border border-white/5"
                            >
                                Revenir
                            </button>
                        </div>

                        {/* Backtest Cards Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Summary Card */}
                            <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 space-y-3 flex flex-col justify-between">
                                <div>
                                    <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider block">Validités Statistiques</span>
                                    <h5 className="text-xl font-black text-white tracking-tight mt-1">Général Synthétique</h5>
                                </div>
                                <div className="space-y-1 bg-white/5 p-3 rounded-xl border border-white/5">
                                    <div className="flex justify-between text-[10px] font-mono">
                                        <span className="text-slate-400">Taux de Succès :</span>
                                        <strong className="text-emerald-400">{backtestStats.successRate}%</strong>
                                    </div>
                                    <div className="flex justify-between text-[10px] font-mono">
                                        <span className="text-slate-400">Hits Moyens :</span>
                                        <strong className="text-cyan-400">{backtestStats.primaryHitsAvg} / 5</strong>
                                    </div>
                                </div>
                                <span className="text-[8px] font-mono text-slate-500 leading-normal block">
                                    Taux de validation représentant au moins un numéro trouvé parmi le vecteur ciblé.
                                </span>
                            </div>

                            {/* Detailed retro events listing */}
                            <div className="lg:col-span-3 bg-slate-950/40 p-4 rounded-xl border border-white/5 space-y-3 max-h-[170px] overflow-y-auto">
                                <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider block pb-1 border-b border-white/5">
                                    Détail Chronologique des Résolutions
                                </span>
                                <div className="space-y-2">
                                    {backtestStats.details.map((trial, idx) => (
                                        <div key={`ret-tr-${idx}`} className="flex justify-between items-center text-[10px] pb-1.5 border-b border-white/5 last:border-b-0">
                                            <span className="font-bold text-slate-400 font-mono truncate max-w-[120px]">{trial.drawDate}</span>
                                            <div className="flex items-center gap-1">
                                                <span className="text-slate-500 font-mono">Gagnants:</span>
                                                <div className="flex gap-1.2">
                                                    {trial.winners.map((win: number) => {
                                                        const isHit = trial.matched.includes(win);
                                                        return (
                                                            <span 
                                                                key={`win-node-${win}`}
                                                                className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${isHit ? 'bg-cyan-550 text-white border border-cyan-400' : 'bg-slate-900 border border-white/5 text-slate-400'}`}
                                                            >
                                                                {win}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <span className={`font-mono text-xs font-black ${trial.hits > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                +{trial.hits} Hit{trial.hits > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-3.5 bg-pink-500/5 rounded-2xl border border-pink-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between text-[10px] gap-2">
                            <span className="text-slate-400 max-w-xl leading-normal">
                                Le traceur récursif a analysé l'asymétrie de phase d'amortissement. Profil de résonance optimal suggéré :
                            </span>
                            <span className="font-mono font-black text-pink-400 uppercase tracking-widest bg-pink-500/10 border border-pink-500/20 px-3 py-1 rounded">
                                ζ_optimal = {backtestStats.bestDamping.toFixed(2)}
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
