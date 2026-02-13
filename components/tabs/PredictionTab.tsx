
import React, { useState, useCallback, useEffect } from 'react';
import { useNexus } from '../NexusProvider';
import { generateMasterPrediction, getStrategyName, getAlgoWeights } from '../../services/predictionEngine';
import { savePredictionToHistory } from '../../services/predictionHistoryService';
import { saveTicket } from '../../services/userPreferencesService';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { NeuralHeatmapGrid } from '../NeuralHeatmapGrid';
import { ReliabilityMeter } from '../ReliabilityMeter';
import { RiskProfile } from '../../types';
import { QuantumTensionField } from '../QuantumTensionField';
import { AlgoRadar } from '../AlgoRadar';
import { 
    Zap, Cpu, Activity, Info, ShieldCheck, 
    Layers, Binary, Target, RefreshCw, Wallet, 
    Save, Wind, AlertTriangle, TrendingUp,
    MapPin, GitMerge, CheckCircle2, Crosshair, Scale, Gauge, Dna,
    Atom
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const PredictionTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { showToast } = useToast();
    const { 
        history, lastPrediction, setLastPrediction, loading: nexusLoading,
        globalWeights, updateGlobalWeights, spectral, wavelet, correlationMatrix, regularity, 
        calibration, volatility, regime, symbioticContext, fractal
    } = useNexus();

    const [isComputing, setIsComputing] = useState(false);
    const [computingStep, setComputingStep] = useState<string>("");
    const [riskProfile, setRiskProfile] = useState<RiskProfile>('BALANCED');
    const [showField, setShowField] = useState(false);
    const [activeDNA, setActiveDNA] = useState<string>("Standard");
    const [showDNA, setShowDNA] = useState(false);

    // Mise à jour du nom de l'ADN affiché
    useEffect(() => {
        if(globalWeights) setActiveDNA(getStrategyName(globalWeights));
    }, [globalWeights]);

    const runInference = useCallback(async () => {
        if (history.length < 5) {
            showToast("Historique insuffisant pour l'Oracle Base.", "error");
            return;
        }
        setIsComputing(true);
        setComputingStep("Initialisation du Noyau...");

        // FETCH CRITIQUE : On recharge les poids spécifiques pour être sûr à 100% que c'est la config du tirage
        // Ceci garantit que si l'utilisateur vient de l'onglet Tuning, ses changements sont appliqués
        const specificWeights = await getAlgoWeights(drawName);
        setActiveDNA(getStrategyName(specificWeights));
        
        // On met à jour le contexte global pour que les autres onglets soient sync
        updateGlobalWeights(specificWeights);

        const steps = [
            { msg: `Chargement ADN : ${getStrategyName(specificWeights)}`, delay: 400 },
            { msg: `Stratégie : ${riskProfile}`, delay: 1000 },
            { msg: "Injection Métriques Stochastiques...", delay: 1600 },
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
                // Sans ça, l'onglet Forensic ne pourra pas comparer
                await savePredictionToHistory(drawName, res);
                
                showToast("Prédiction générée via l'ADN actif.", "success");
            } catch (e) {
                showToast("Erreur lors de l'inférence.", "error");
                console.error(e);
            } finally {
                setIsComputing(false);
                setComputingStep("");
            }
        }, 3500);
    }, [drawName, history, spectral, wavelet, correlationMatrix, regularity, volatility, regime, symbioticContext, setLastPrediction, showToast, riskProfile, fractal, updateGlobalWeights]);

    const handleQuickSave = async () => {
        if (!lastPrediction) return;
        await saveTicket({
            numbers: lastPrediction.suggestedNumbers,
            drawName,
            strategy: `Oracle ${riskProfile} (${lastPrediction.confidence}%)`
        });
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

    const getProbColor = (score: number) => {
        if (score >= 80) return 'text-emerald-400';
        if (score >= 60) return 'text-indigo-400';
        if (score >= 40) return 'text-amber-400';
        return 'text-rose-400';
    };

    const getProbBarColor = (score: number) => {
        if (score >= 80) return 'bg-emerald-500';
        if (score >= 60) return 'bg-indigo-500';
        if (score >= 40) return 'bg-amber-500';
        return 'bg-rose-500';
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
        <div className="flex flex-col items-center justify-center min-h-[600px] bg-slate-900/50 rounded-[3rem] border border-white/5 animate-fade-in relative overflow-hidden group p-8">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50"></div>
            
            <div className="relative z-10 flex flex-col items-center w-full max-w-2xl text-center">
                <div className="w-24 h-24 bg-slate-900 rounded-[2rem] flex items-center justify-center shadow-2xl border border-slate-800 mb-8 group-hover:scale-110 transition-transform duration-500">
                    <Target size={48} className="text-indigo-500" />
                </div>
                <h3 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter mb-4">Oracle Base v24.0</h3>
                
                <div 
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 rounded-full border border-indigo-500/20 mb-8 cursor-pointer hover:bg-indigo-500/20 transition-all active:scale-95"
                    onClick={() => setShowDNA(!showDNA)}
                >
                    <Dna size={14} className="text-indigo-400"/>
                    <span className="text-xs font-bold text-indigo-200 uppercase tracking-widest">ADN Actif : {activeDNA}</span>
                </div>

                <AnimatePresence>
                    {showDNA && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0, mb: 0 }}
                            animate={{ opacity: 1, height: 'auto', mb: 32 }}
                            exit={{ opacity: 0, height: 0, mb: 0 }}
                            className="w-full max-w-md bg-slate-800/50 rounded-3xl p-6 border border-white/10 overflow-hidden text-left"
                        >
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 justify-center">
                                <Activity size={14} className="text-indigo-400"/> Composition Algorithmique
                            </h4>
                            <AlgoRadar weights={globalWeights} />
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
                            onClick={() => setRiskProfile(p.id)}
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

                <button 
                    onClick={runInference}
                    className="w-full md:w-auto px-16 py-6 bg-white text-slate-900 hover:bg-indigo-50 rounded-[2rem] font-black uppercase tracking-[0.2em] text-sm shadow-2xl flex items-center justify-center gap-4 transition-all active:scale-95 hover:shadow-indigo-500/20"
                >
                    <Zap fill="currentColor" size={20} /> Exécuter l'ADN
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Context HUD */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'ADN Source', val: activeDNA, icon: <Dna className="text-indigo-500"/>, action: () => setShowDNA(!showDNA) },
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
                            <div className="w-32 h-32 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
                            <Cpu className="absolute inset-0 m-auto text-indigo-500 animate-pulse" size={40} />
                        </div>
                        <div className="text-center space-y-3">
                            <p className="text-lg font-black uppercase tracking-[0.2em] text-white animate-pulse">{computingStep}</p>
                            <p className="text-xs text-slate-500 font-mono">Calcul tensoriel haute précision...</p>
                        </div>
                    </div>
                ) : (
                    <div className="relative z-10">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
                            <div>
                                <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-none mb-3">
                                    Vecteur <span className="text-indigo-500">Master</span>
                                </h2>
                                <div className="flex items-center gap-4">
                                    <span className="text-xs font-bold text-indigo-300 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20 flex items-center gap-2">
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
                        
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <button 
                                onClick={handleQuickSave}
                                className="px-12 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95"
                            >
                                <Save size={16} /> Sauvegarder Ticket
                            </button>
                            <button 
                                onClick={() => { setLastPrediction(null); }}
                                className="px-8 py-4 bg-slate-800 text-slate-300 hover:text-white rounded-2xl font-bold text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={16} /> Nouvelle Stratégie
                            </button>
                            <button 
                                onClick={() => setShowField(!showField)}
                                className={`px-8 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2 border ${showField ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-transparent text-slate-400'}`}
                            >
                                <Atom size={16} /> Champ Quantum
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
                <div className="grid lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-8 space-y-6">
                        <div className="flex items-center gap-3 px-4">
                            <Layers className="text-indigo-500" />
                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Matrice de Convergence</h3>
                        </div>
                        {showField ? (
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
                    </div>
                </div>
            )}
        </div>
    );
};
