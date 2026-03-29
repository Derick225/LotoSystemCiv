
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { generateMasterPrediction, getStrategyName, getAlgoWeights, normalizeWeights } from '../../services/predictionEngine';
import { getOptimizedWeights } from '../../services/geminiService';
import { savePredictionToHistory } from '../../services/predictionHistoryService';
import { saveTicket } from '../../services/userPreferencesService';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { NeuralHeatmapGrid } from '../NeuralHeatmapGrid';
import { ReliabilityMeter } from '../ReliabilityMeter';
import { RiskProfile } from '../../types';
import { QuantumTensionField } from '../QuantumTensionField';
import { AlgoRadar } from '../AlgoRadar';
import { AutoTuner } from '../AutoTuner';
import { ChaosAttractor3D } from '../ChaosAttractor3D';
import { StrategyBattle } from '../StrategyBattle';
import { QuantumFractalAnalysis } from '../QuantumFractalAnalysis';
import { calculateShannonEntropy } from '../../services/mathService';
import { runSelfLearningLoop } from '../../services/selfLearningService';
import { 
    Zap, Cpu, Activity, Info, ShieldCheck, 
    Layers, Binary, Target, RefreshCw, Wallet, 
    Save, Wind, AlertTriangle, TrendingUp,
    MapPin, GitMerge, CheckCircle2, Crosshair, Scale, Gauge, Dna,
    Atom, Brain, FlaskConical, Box, Sparkles, BrainCircuit
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { audioEngine } from '../../utils/audioEngine';

export const PredictionTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { showToast } = useToast();
    
    const history = useNexusStore(state => state.history);
    const lastPrediction = useNexusStore(state => state.lastPrediction);
    const setLastPrediction = useNexusStore(state => state.setLastPrediction);
    const nexusLoading = useNexusStore(state => state.loading);
    const globalWeights = useNexusStore(state => state.globalWeights);
    const updateGlobalWeights = useNexusStore(state => state.updateGlobalWeights);
    const spectral = useNexusStore(state => state.spectral);
    const wavelet = useNexusStore(state => state.wavelet);
    const correlationMatrix = useNexusStore(state => state.correlationMatrix);
    const regularity = useNexusStore(state => state.regularity);
    const calibration = useNexusStore(state => state.calibration);
    const volatility = useNexusStore(state => state.volatility);
    const regime = useNexusStore(state => state.regime);
    const symbioticContext = useNexusStore(state => state.symbioticContext);
    const fractal = useNexusStore(state => state.fractal);
    const riskProfile = useNexusStore(state => state.riskProfile);
    const setRiskProfile = useNexusStore(state => state.setRiskProfile);

    const [isComputing, setIsComputing] = useState(false);
    const [computingStep, setComputingStep] = useState<string>("");
    const [showField, setShowField] = useState(false);
    const [show3D, setShow3D] = useState(false);
    const [activeDNA, setActiveDNA] = useState<string>("Standard");
    const [showDNA, setShowDNA] = useState(false);
    const [showAdvancedLab, setShowAdvancedLab] = useState(false);
    const [quantumMode, setQuantumMode] = useState(false);
    
    // États pour la Calibration IA
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optimizedWeights, setOptimizedWeights] = useState<any | null>(null);
    const [previousWeights, setPreviousWeights] = useState<any | null>(null);

    // Calcul de l'entropie en temps réel
    const currentEntropy = useMemo(() => {
        if (history.length === 0) return 0;
        return calculateShannonEntropy(history.slice(0, 10)).normalized;
    }, [history]);

    // Mise à jour du nom de l'ADN affiché
    useEffect(() => {
        if(globalWeights) setActiveDNA(getStrategyName(globalWeights));
    }, [globalWeights]);

    const handleAiOptimization = async () => {
        audioEngine.play('click');
        if (history.length < 10) {
            audioEngine.play('error');
            showToast("Historique insuffisant pour l'IA.", "error");
            return;
        }

        setIsOptimizing(true);
        setShowDNA(true); // Ouvrir le radar pour voir l'effet
        setPreviousWeights(globalWeights); // Sauvegarder l'état avant

        try {
            audioEngine.play('loading');
            showToast("Gemini: Analyse du régime stochastique...", "info");
            const newWeights = await getOptimizedWeights(drawName, history);
            
            if (newWeights) {
                const normalized = normalizeWeights(newWeights);
                setOptimizedWeights(normalized); // Pour la visualisation "Après"
                
                // On applique immédiatement pour le calcul
                await updateGlobalWeights(normalized);
                setActiveDNA(`IA Calibrée (${getStrategyName(normalized)})`);
                
                audioEngine.play('success');
                showToast("ADN muté par l'IA. Lancement de l'inférence...", "success");
                
                // Petit délai pour laisser l'utilisateur voir le radar changer
                setTimeout(() => runInference(normalized), 1500);
            } else {
                audioEngine.play('error');
                showToast("Le Cloud n'a pas répondu. Fallback standard.", "error");
                runInference();
            }
        } catch (e) {
            audioEngine.play('error');
            showToast("Erreur connexion IA.", "error");
            runInference();
        } finally {
            setIsOptimizing(false);
        }
    };

    const runInference = useCallback(async (forcedWeights?: any) => {
        audioEngine.play('click');
        if (history.length < 5) {
            audioEngine.play('error');
            showToast("Historique insuffisant pour l'Oracle Base.", "error");
            return;
        }
        setIsComputing(true);
        setComputingStep("Initialisation du Noyau...");
        audioEngine.play('loading');

        // FETCH CRITIQUE : Si pas de poids forcés (par l'IA), on recharge les poids persistants
        let specificWeights = forcedWeights || await getAlgoWeights(drawName);
        
        // Si le mode Quantum est activé, on booste les algos non-linéaires
        if (quantumMode) {
            specificWeights = normalizeWeights({
                ...specificWeights,
                fractal: (specificWeights.fractal || 0) * 1.5,
                spatial: (specificWeights.spatial || 0) * 1.5,
                ai_intuition: (specificWeights.ai_intuition || 0) * 1.5,
                wavelet: (specificWeights.wavelet || 0) * 1.5
            });
        }

        if (!forcedWeights) {
            // Si c'est un run manuel sans IA, on reset la vue comparative
            setPreviousWeights(null);
            setOptimizedWeights(null);
            setActiveDNA(quantumMode ? `Quantum ${getStrategyName(specificWeights)}` : getStrategyName(specificWeights));
            updateGlobalWeights(specificWeights);
        }

        const steps = [
            { msg: `Chargement ADN : ${getStrategyName(specificWeights)}`, delay: 400 },
            { msg: `Stratégie : ${riskProfile}`, delay: 1000 },
            { msg: quantumMode ? "Distorsion Quantique..." : "Injection Métriques Stochastiques...", delay: 1600 },
            { msg: "Calcul de la Résultante...", delay: 2200 },
            { msg: "Convergence Vectorielle...", delay: 2800 }
        ];

        let stepIndex = 0;
        const interval = setInterval(() => {
            if (stepIndex < steps.length) {
                setComputingStep(steps[stepIndex].msg);
                stepIndex++;
            }
        }, 600);

        setTimeout(async () => {
            clearInterval(interval);
            try {
                // On passe specificWeights explicitement
                const res = await generateMasterPrediction(drawName, history, specificWeights, {
                    spectral, wavelet, correlationMatrix, regularity, volatility, fractal
                }, symbioticContext || undefined, riskProfile);
                
                setLastPrediction(res);
                
                // CRITIQUE : Sauvegarde pour Forensic Hub
                await savePredictionToHistory(drawName, res, undefined, {
                    spectral, wavelet, correlationMatrix, regularity, volatility, fractal
                });
                
                if (!forcedWeights) {
                    audioEngine.play('success');
                    showToast("Prédiction générée via l'ADN actif.", "success");
                }
            } catch (e) {
                audioEngine.play('error');
                showToast("Erreur lors de l'inférence.", "error");
                console.error(e);
            } finally {
                setIsComputing(false);
                setComputingStep("");
            }
        }, 3500);
    }, [drawName, history, spectral, wavelet, correlationMatrix, regularity, volatility, regime, symbioticContext, setLastPrediction, showToast, riskProfile, fractal, updateGlobalWeights]);

    const handleQuickSave = async () => {
        audioEngine.play('click');
        if (!lastPrediction) return;
        await saveTicket({
            numbers: lastPrediction.suggestedNumbers,
            drawName,
            strategy: `Oracle ${riskProfile} (${lastPrediction.confidence}%)`
        });
        audioEngine.play('success');
        showToast("Ticket sécurisé dans le Portefeuille.", "success");
    };

    const getAlgoScore = (breakdown: any, weights: any) => {
        if (!breakdown || !weights) return 0;
        let score = 0;
        Object.keys(weights).forEach(k => {
            score += (breakdown[k] || 0) * (weights[k] || 0);
        });
        return Math.round(score);
    };

    const getProbBarColor = (score: number) => {
        if (score >= 80) return 'bg-emerald-500';
        if (score >= 60) return 'bg-indigo-500';
        if (score >= 40) return 'bg-amber-500';
        return 'bg-rose-500';
    };

    const getProbColor = (score: number) => {
        if (score >= 80) return 'text-emerald-500';
        if (score >= 60) return 'text-indigo-500';
        if (score >= 40) return 'text-amber-500';
        return 'text-rose-500';
    };

    if (nexusLoading) return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
            <Cpu className="text-indigo-500 animate-spin" size={48} />
            <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Synchronisation du Noyau...</p>
        </div>
    );

    const profiles: { id: RiskProfile, label: string, icon: any, color: string, desc: string }[] = [
        { id: 'PRUDENT', label: 'Prudent', icon: <ShieldCheck size={18} />, color: 'bg-emerald-600', desc: 'Favorise la stabilité de l\'ADN.' },
        { id: 'BALANCED', label: 'Équilibré', icon: <Scale size={18} />, color: 'bg-indigo-600', desc: 'Mix optimal Favoris/Outsiders.' },
        { id: 'AUDACIOUS', label: 'Audacieux', icon: <Target size={18} />, color: 'bg-amber-600', desc: 'Amplifie les poids "Gap" et "Momentum".' },
        { id: 'CHAOS', label: 'Chaos', icon: <AlertTriangle size={18} />, color: 'bg-rose-600', desc: 'Inverse la logique (Anti-Consensus).' }
    ];

    if (!lastPrediction && !isComputing) return (
        <div className={`flex flex-col items-center justify-center min-h-[600px] rounded-[3rem] border animate-fade-in relative overflow-hidden group p-8 transition-all duration-1000 ${quantumMode ? 'bg-indigo-950/40 border-indigo-500/30 shadow-[0_0_100px_rgba(99,102,241,0.15)]' : 'bg-slate-900/50 border-white/5'}`}>
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent ${quantumMode ? 'via-fuchsia-500' : 'via-indigo-500'} to-transparent opacity-50`}></div>
            
            {/* Top Bar: Auto-Tune & Quantum Mode */}
            <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
                <button 
                    onClick={async () => {
                        if (isOptimizing) return;
                        setIsOptimizing(true);
                        audioEngine.play('scan');
                        showToast("Auto-Tune en cours...", "info");
                        // Artificial delay for UX
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        await runSelfLearningLoop(drawName);
                        showToast("Poids algorithmiques calibrés avec succès.", "success");
                        audioEngine.play('success');
                        setIsOptimizing(false);
                    }}
                    disabled={isOptimizing}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all shadow-sm ${isOptimizing ? 'bg-emerald-900/50 border-emerald-500/30 text-emerald-400 cursor-not-allowed' : 'bg-slate-800/50 border-white/10 text-slate-400 hover:text-white hover:bg-emerald-500/20 hover:border-emerald-500/50 hover:text-emerald-300'}`}
                    title="Calibrer les poids selon l'historique récent"
                >
                    <BrainCircuit size={14} className={isOptimizing ? 'animate-pulse' : ''} />
                    <span className="text-xs font-black uppercase tracking-widest hidden sm:inline">
                        {isOptimizing ? 'Calibrage...' : 'Auto-Tune'}
                    </span>
                </button>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 rounded-full border border-white/5">
                        <Activity size={12} className={currentEntropy > 0.7 ? 'text-rose-400' : currentEntropy < 0.4 ? 'text-emerald-400' : 'text-amber-400'} />
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                            Entropie: {(currentEntropy * 100).toFixed(1)}%
                        </span>
                    </div>
                    <button 
                        onClick={() => { audioEngine.play('scan'); setQuantumMode(!quantumMode); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${quantumMode ? 'bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-300 shadow-[0_0_20px_rgba(217,70,239,0.3)]' : 'bg-slate-800/50 border-white/10 text-slate-400 hover:text-white'}`}
                    >
                        <Atom size={14} className={quantumMode ? 'animate-spin-slow' : ''} />
                        <span className="text-xs font-black uppercase tracking-widest">Quantum Mode</span>
                    </button>
                </div>
            </div>

            <div className="relative z-10 flex flex-col items-center w-full max-w-2xl text-center mt-8">
                <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center shadow-2xl border mb-8 group-hover:scale-110 transition-transform duration-500 ${quantumMode ? 'bg-fuchsia-900/30 border-fuchsia-500/30' : 'bg-slate-900 border-slate-800'}`}>
                    {isOptimizing ? <RefreshCw className="animate-spin text-purple-500" size={48}/> : <Target size={48} className={quantumMode ? 'text-fuchsia-400' : 'text-indigo-500'} />}
                </div>
                <h3 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter mb-2">
                    Oracle Nexus <span className={quantumMode ? 'text-fuchsia-500' : 'text-indigo-500'}>v25.0</span>
                </h3>
                <p className="text-sm font-medium text-slate-400 mb-6 uppercase tracking-[0.2em]">
                    {quantumMode ? 'Inférence Non-Linéaire Activée' : 'Moteur Stochastique Standard'}
                </p>
                
                <div 
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border mb-8 cursor-pointer transition-all active:scale-95 ${quantumMode ? 'bg-fuchsia-500/10 border-fuchsia-500/20 hover:bg-fuchsia-500/20' : 'bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20'}`}
                    onClick={() => { audioEngine.play('click'); setShowDNA(!showDNA); }}
                >
                    <Dna size={14} className={quantumMode ? 'text-fuchsia-400' : 'text-indigo-400'}/>
                    <span className={`text-xs font-bold uppercase tracking-widest ${quantumMode ? 'text-fuchsia-200' : 'text-indigo-200'}`}>ADN Actif : {activeDNA}</span>
                </div>

                <AnimatePresence>
                    {showDNA && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                            animate={{ opacity: 1, height: 'auto', marginBottom: 32 }}
                            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                            className="w-full max-w-md bg-slate-800/50 rounded-3xl p-6 border border-white/10 overflow-hidden text-left"
                        >
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 justify-center">
                                <Activity size={14} className="text-indigo-400"/> Composition Algorithmique
                            </h4>
                            {/* Affichage comparatif si optimisation en cours ou terminée */}
                            <AlgoRadar 
                                weights={optimizedWeights || globalWeights} 
                                previousWeights={isOptimizing || optimizedWeights ? (previousWeights || globalWeights) : undefined} 
                            />
                            {optimizedWeights && (
                                <p className="text-center text-[10px] text-emerald-400 mt-2 font-bold animate-pulse">
                                    ▲ Optimisation par Intelligence Artificielle appliquée
                                </p>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                <p className="text-slate-400 text-sm md:text-base font-medium mb-12 leading-relaxed max-w-lg mx-auto">
                    Configurez le profil de risque pour moduler l'influence de l'ADN algorithmique sur la sélection.
                </p>

                {/* Risk Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-12">
                    {profiles.map(p => (
                        <button
                            key={p.id}
                            onClick={() => { audioEngine.play('click'); setRiskProfile(p.id); }}
                            className={`p-6 rounded-[2rem] border transition-all flex flex-col items-center gap-3 text-center ${riskProfile === p.id ? `${p.color} border-transparent text-white shadow-xl scale-105 z-10` : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}
                        >
                            {p.icon}
                            <div>
                                <span className="text-xs font-black uppercase tracking-widest block mb-1">{p.label}</span>
                                <span className="text-[10px] font-medium opacity-80 leading-tight">{p.desc}</span>
                            </div>
                        </button>
                    ))}
                </div>

                <div className="flex gap-4 w-full justify-center">
                    <button 
                        onClick={() => runInference()}
                        disabled={isOptimizing}
                        className={`px-8 py-6 text-slate-900 rounded-[2rem] font-black uppercase tracking-[0.2em] text-sm shadow-2xl flex items-center justify-center gap-4 transition-all active:scale-95 disabled:opacity-50 ${quantumMode ? 'bg-fuchsia-400 hover:bg-fuchsia-300 shadow-fuchsia-500/20' : 'bg-white hover:bg-indigo-50 hover:shadow-indigo-500/20'}`}
                    >
                        {quantumMode ? <Sparkles fill="currentColor" size={20} /> : <Zap fill="currentColor" size={20} />} 
                        {quantumMode ? 'Exécuter Quantum' : 'Exécuter ADN'}
                    </button>
                    <button 
                        onClick={handleAiOptimization}
                        disabled={isOptimizing}
                        className="px-8 py-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] text-sm shadow-2xl flex items-center justify-center gap-4 transition-all active:scale-95 hover:shadow-purple-500/20 disabled:opacity-50"
                    >
                        {isOptimizing ? <RefreshCw className="animate-spin" size={20}/> : <Brain size={20} />} Calibration IA
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Context HUD */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'ADN Source', val: activeDNA, icon: <Dna className="text-indigo-500"/>, action: () => { audioEngine.play('click'); setShowDNA(!showDNA); } },
                    { label: 'Volatilité', val: `${volatility?.score || 0}%`, icon: <Wind className="text-amber-500"/> },
                    { label: 'Stratégie', val: riskProfile, icon: <Crosshair className="text-emerald-500"/> },
                    { label: 'Réalité T-1', val: `${lastPrediction?.realityAlignment || 0}%`, icon: <Gauge className="text-purple-500"/> }
                ].map((item, i) => (
                    <div 
                        key={i} 
                        className={`bg-slate-900 p-4 rounded-[2rem] border border-slate-800 flex items-center gap-4 shadow-lg ${item.action ? 'cursor-pointer hover:bg-slate-800 transition-colors' : ''}`}
                        onClick={item.action}
                    >
                        <div className="p-3 bg-slate-800 rounded-2xl">{item.icon}</div>
                        <div>
                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{item.label}</div>
                            <div className="text-white font-bold text-xs truncate max-w-[100px]">{item.val}</div>
                        </div>
                    </div>
                ))}
            </div>

            <AnimatePresence>
                {showDNA && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-slate-900/50 border border-slate-800 rounded-[2.5rem] p-6 overflow-hidden"
                    >
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Activity size={14} className="text-indigo-400"/> Composition Algorithmique
                        </h4>
                        <div className="max-w-2xl mx-auto">
                            <AlgoRadar weights={globalWeights} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Result Card */}
            <div className="bg-slate-950 p-8 md:p-12 rounded-[3.5rem] border border-indigo-500/20 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:scale-110 transition-transform"><Target size={200} /></div>
                
                {isComputing ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-8">
                        <div className="relative">
                            <div className={`w-32 h-32 border-4 border-slate-800 rounded-full animate-spin ${quantumMode ? 'border-t-fuchsia-500' : 'border-t-indigo-500'}`}></div>
                            {quantumMode ? (
                                <Atom className="absolute inset-0 m-auto text-fuchsia-500 animate-pulse" size={40} />
                            ) : (
                                <Cpu className="absolute inset-0 m-auto text-indigo-500 animate-pulse" size={40} />
                            )}
                        </div>
                        <div className="text-center space-y-3">
                            <p className="text-lg font-black uppercase tracking-[0.2em] text-white animate-pulse">{computingStep}</p>
                            <p className="text-xs text-slate-500 font-mono">
                                {quantumMode ? 'Distorsion probabiliste en cours...' : 'Calcul tensoriel haute précision...'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="relative z-10">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
                            <div>
                                <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-none mb-3">
                                    Vecteur <span className={quantumMode ? 'text-fuchsia-500' : 'text-indigo-500'}>{quantumMode ? 'Quantum' : 'Master'}</span>
                                </h2>
                                <div className="flex items-center gap-4">
                                    <span className={`text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-2 ${quantumMode ? 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20' : 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20'}`}>
                                        <Dna size={12}/> {activeDNA}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-6xl font-black text-white tracking-tighter leading-none">{lastPrediction?.confidence}%</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Indice de Confiance</span>
                            </div>
                        </div>

                        {/* Les Boules avec Badge Symbiotique et Probabilité */}
                        <div className="flex flex-wrap justify-center gap-4 md:gap-8 mb-12">
                            {lastPrediction?.suggestedNumbers.map((n, i) => {
                                const bd = lastPrediction.breakdown?.[n];
                                const isSpatialHot = symbioticContext?.spatialHotZones.includes(n);
                                const isOrchestrated = symbioticContext?.orchestrationBoosts[n] !== undefined;
                                const algoScore = getAlgoScore(bd, globalWeights);
                                const prob = Math.min(99, Math.max(1, algoScore)); // Clamp
                                
                                return (
                                    <motion.div 
                                        key={n} 
                                        initial={{ scale: 0, y: 30 }} 
                                        animate={{ scale: 1, y: 0 }} 
                                        transition={{ delay: i * 0.1, type: 'spring' }}
                                        className="flex flex-col items-center gap-4 group/ball"
                                    >
                                        <div className="relative">
                                            <NumberBall number={n} size="xl" isAttractor={i < 2} />
                                            {/* Badges d'enrichissement */}
                                            <div className="absolute -top-3 -right-3 flex flex-col gap-1">
                                                {isSpatialHot && <div className="bg-emerald-500 text-white rounded-full p-1.5 border-2 border-slate-950 shadow-md transform scale-0 group-hover/ball:scale-100 transition-transform" title="Zone Chaude Spatiale"><MapPin size={10} fill="currentColor"/></div>}
                                                {isOrchestrated && <div className="bg-indigo-500 text-white rounded-full p-1.5 border-2 border-slate-950 shadow-md transform scale-0 group-hover/ball:scale-100 transition-transform delay-75" title="Boost Orchestration"><Binary size={10}/></div>}
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col items-center opacity-80 group-hover/ball:opacity-100 transition-opacity">
                                            <div className="flex gap-0.5 h-1.5 w-12 bg-slate-800 rounded-full overflow-hidden mb-1.5">
                                                <div className={`h-full ${getProbBarColor(prob)}`} style={{ width: `${prob}%` }}></div>
                                            </div>
                                            <span className={`text-[10px] font-mono font-black uppercase tracking-tight ${getProbColor(prob)}`}>
                                                PROB: {prob}%
                                            </span>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                            <button 
                                onClick={handleQuickSave}
                                className="px-12 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95"
                            >
                                <Save size={16} /> Sauvegarder Ticket
                            </button>
                            <button 
                                onClick={() => { audioEngine.play('click'); setLastPrediction(null); }}
                                className="px-8 py-4 bg-slate-800 text-slate-300 hover:text-white rounded-2xl font-bold text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={16} /> Nouvelle Stratégie
                            </button>
                        </div>

                        {/* View Toggles */}
                        <div className="flex flex-wrap justify-center gap-3 border-t border-white/10 pt-8">
                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest w-full text-center mb-2">Modes de Visualisation</span>
                            <button 
                                onClick={() => { audioEngine.play('click'); setShowField(false); setShow3D(false); }}
                                className={`px-6 py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-colors flex items-center justify-center gap-2 border ${!showField && !show3D ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-transparent text-slate-400 hover:bg-slate-700'}`}
                            >
                                <Layers size={14} /> Grille Neurale
                            </button>
                            <button 
                                onClick={() => { audioEngine.play('click'); setShowField(true); setShow3D(false); }}
                                className={`px-6 py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-colors flex items-center justify-center gap-2 border ${showField && !show3D ? 'bg-fuchsia-600/20 border-fuchsia-500 text-fuchsia-300' : 'bg-slate-800 border-transparent text-slate-400 hover:bg-slate-700'}`}
                            >
                                <Atom size={14} /> Champ Quantum
                            </button>
                            <button 
                                onClick={() => { audioEngine.play('click'); setShow3D(true); setShowField(false); }}
                                className={`px-6 py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-colors flex items-center justify-center gap-2 border ${show3D ? 'bg-rose-600/20 border-rose-500 text-rose-300' : 'bg-slate-800 border-transparent text-slate-400 hover:bg-slate-700'}`}
                            >
                                <Box size={14} /> 3D Chaos
                            </button>
                        </div>

                        <div className="mt-10 bg-black/40 p-8 rounded-[2.5rem] border border-white/5 backdrop-blur-md">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-indigo-500/20 rounded-2xl text-indigo-400 shrink-0">
                                    <Info size={20} />
                                </div>
                                <div>
                                    <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Thèse d'Investissement</h5>
                                    <p className="text-slate-300 text-sm leading-relaxed font-medium">
                                        "{lastPrediction?.analysis}"
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {lastPrediction && (
                <div className="space-y-8">
                    {/* Quantum & Fractal Analysis */}
                    <QuantumFractalAnalysis prediction={lastPrediction} />

                    <div className="grid lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-8 space-y-6">
                        <div className="flex items-center gap-3 px-4">
                            <Layers className="text-indigo-500" />
                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Matrice de Convergence</h3>
                        </div>
                        {show3D ? (
                            <ChaosAttractor3D history={history} spectralData={spectral || []} />
                        ) : showField ? (
                            <QuantumTensionField breakdown={lastPrediction.breakdown || {}} suggestedNumbers={lastPrediction.suggestedNumbers} />
                        ) : (
                            <NeuralHeatmapGrid breakdown={lastPrediction.breakdown} suggestedNumbers={lastPrediction.suggestedNumbers} />
                        )}
                    </div>

                    <div className="lg:col-span-4 space-y-6">
                        {calibration && <ReliabilityMeter calibration={calibration} />}
                        
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Binary size={14} /> Alternatives (Outsiders)
                            </h4>
                            <div className="flex flex-wrap gap-3 justify-center">
                                {lastPrediction?.candidates.slice(0, 8).map(n => (
                                    <NumberBall key={n} number={n} size="sm" />
                                ))}
                            </div>
                            <p className="text-center text-[9px] text-slate-400 mt-6 font-bold uppercase tracking-widest">
                                Vecteurs secondaires à surveiller
                            </p>
                        </div>

                        {/* Protocole Shadow */}
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <GitMerge size={14} className="text-amber-500"/> Protocole Shadow (+/- 1)
                            </h4>
                            <div className="flex flex-wrap gap-2 justify-center">
                                {lastPrediction?.suggestedNumbers
                                    .flatMap(n => [n-1, n+1])
                                    .filter(n => n > 0 && n <= 90 && !lastPrediction?.suggestedNumbers.includes(n))
                                    .filter((n, i, self) => self.indexOf(n) === i) // Unique
                                    .slice(0, 10)
                                    .map((n, i) => (
                                    <NumberBall key={`shadow-${i}`} number={n} size="xs" />
                                ))}
                            </div>
                            <p className="text-center text-[9px] text-slate-400 mt-6 font-bold uppercase tracking-widest leading-relaxed">
                                Couverture des zones adjacentes pour contrer la dérive de ±1.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            )}

            {/* LABORATOIRE AVANCÉ */}
            <div className="mt-12 border-t border-white/10 pt-8">
                <button 
                    onClick={() => { audioEngine.play('click'); setShowAdvancedLab(!showAdvancedLab); }}
                    className="flex items-center gap-3 text-slate-400 hover:text-white transition-colors mb-6 mx-auto"
                >
                    <FlaskConical size={20} />
                    <span className="text-xs font-black uppercase tracking-widest">Laboratoire Avancé</span>
                </button>

                <AnimatePresence>
                    {showAdvancedLab && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="grid md:grid-cols-2 gap-8 overflow-hidden"
                        >
                            <AutoTuner />
                            <StrategyBattle />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};
