
import React, { useState } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { calculateFusion } from '../../services/fusionService';
import { FusionResult, Prediction } from '../../types';
import { savePredictionToHistory } from '../../services/predictionHistoryService';
import { NumberBall } from '../NumberBall';
import { TicketXRay } from '../TicketXRay';
import { saveTicket } from '../../services/userPreferencesService';
import { useToast } from '../ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, Zap, Brain, Hexagon, ArrowDown, Save, RefreshCw, Layers, GitMerge, Activity, Network } from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';

export const ConvergenceTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const history = useNexusStore(state => state.history);
    const stats = useNexusStore(state => state.stats);
    const spectral = useNexusStore(state => state.spectral);
    const lastPrediction = useNexusStore(state => state.lastPrediction);
    const globalWeights = useNexusStore(state => state.globalWeights);
    const { showToast } = useToast();
    
    const [fusionResult, setFusionResult] = useState<FusionResult | null>(null);
    const [isFusing, setIsFusing] = useState(false);
    const [step, setStep] = useState(0); 

    const handleFusion = () => {
        audioEngine.play('click');
        if (history.length < 5) {
            audioEngine.play('error');
            showToast("Historique insuffisant pour la convergence.", "error");
            return;
        }
        audioEngine.play('loading');
        setIsFusing(true);
        setStep(1); 
        
        // Séquence d'animation
        setTimeout(() => setStep(2), 600);  
        setTimeout(() => setStep(3), 1200); 
        setTimeout(() => setStep(4), 1800);
        
        setTimeout(() => {
            // Injection des poids ADN (globalWeights) pour une fusion contextuelle
            const result = calculateFusion(history, stats, spectral, lastPrediction, globalWeights);
            setFusionResult(result);
            setIsFusing(false);
            setStep(0);
            audioEngine.play('success');
        }, 2400);
    };

    const handleSave = async () => {
        audioEngine.play('click');
        if (!fusionResult) return;
        await saveTicket({
            numbers: fusionResult.finalTicket,
            drawName,
            strategy: `Hyper-Convergence (${fusionResult.confidence}%)`
        });

        const predictionObj: Prediction = {
            suggestedNumbers: fusionResult.finalTicket,
            candidates: fusionResult.finalTicket,
            confidence: fusionResult.confidence,
            analysis: "Hyper-Convergence Fusion",
            breakdown: {},
            timestamp: Date.now()
        };
        await savePredictionToHistory(drawName, predictionObj, undefined, {
            spectral
        });

        audioEngine.play('success');
        showToast("Ticket Fusion sauvegardé et autopsié.", "success");
    };

    const getSourceIcon = (source: string) => {
        switch (source) {
            case 'python': return <Cpu size={12} className="text-emerald-500" />;
            case 'quantum': return <Zap size={12} className="text-purple-500" />;
            case 'oracle': return <Brain size={12} className="text-amber-500" />;
            default: return <Activity size={12} className="text-slate-500" />;
        }
    };

    const getSourceLabel = (source: string) => {
        switch (source) {
            case 'python': return 'Logique';
            case 'quantum': return 'Physique';
            case 'oracle': return 'Intuition';
            default: return 'Inconnu';
        }
    };

    return (
        <div className="space-y-10 animate-fade-in pb-20 w-full overflow-hidden">
            {/* Header / Control */}
            <div className="bg-slate-900 border border-indigo-500/20 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden text-center group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-pulse-slow"></div>
                <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                
                {/* Background Grid Pattern */}
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-50"></div>
                
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none"><GitMerge size={140} /></div>
                
                <div className="relative z-10">
                    <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-2xl mb-6 border border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                        <Network size={32} className="text-indigo-400" />
                    </div>
                    <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase mb-4">
                        Synthèse <span className="text-indigo-500">Vectorielle</span>
                    </h2>
                    <p className="text-slate-400 text-xs md:text-sm font-medium max-w-lg mx-auto mb-10 leading-relaxed">
                        Le moteur de synthèse agrège les signaux Logiques (Algorithmes), Physiques (Spectral) et Intuitifs (Oracle) pour produire une grille unique optimisée par votre ADN.
                    </p>
                    
                    <button 
                        onClick={handleFusion}
                        disabled={isFusing}
                        className="px-10 py-5 bg-white text-slate-900 hover:bg-indigo-50 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-[0_0_40px_rgba(255,255,255,0.2)] flex items-center justify-center gap-3 mx-auto transition-all active:scale-95 disabled:opacity-50 min-w-[240px] group relative overflow-hidden"
                    >
                        {isFusing && <div className="absolute inset-0 bg-indigo-100 animate-pulse"></div>}
                        <span className="relative z-10 flex items-center gap-3">
                            {isFusing ? <RefreshCw className="animate-spin" size={18}/> : <Hexagon size={18} className="group-hover:rotate-12 transition-transform"/>}
                            {isFusing ? 'Fusion en cours...' : 'Lancer la Synthèse'}
                        </span>
                    </button>
                </div>
            </div>

            {/* Source Streams */}
            <div className="grid grid-cols-3 gap-3 md:gap-6 relative">
                {/* Connection lines background */}
                <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-800/50 -z-10 hidden md:block"></div>

                {/* Python Node */}
                <div className={`p-4 rounded-[2.5rem] border transition-all duration-500 relative overflow-hidden text-center flex flex-col justify-between min-h-[140px] ${step >= 1 || fusionResult ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.15)] scale-105 z-10' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60'}`}>
                    {step === 1 && <div className="absolute inset-0 bg-emerald-500/10 animate-pulse"></div>}
                    <div className="mt-2 relative z-10">
                        <Cpu className={`mx-auto mb-2 ${step >= 1 || fusionResult ? 'text-emerald-500' : 'text-slate-400'}`} size={24} />
                        <h3 className={`text-[9px] md:text-[10px] font-black uppercase tracking-widest ${step >= 1 || fusionResult ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>Logique</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 justify-center pb-2 relative z-10">
                        {fusionResult ? fusionResult.sources.python.slice(0,3).map(n => <span key={n} className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400">{n}</span>) : <span className="text-[9px] text-slate-400 italic">--</span>}
                    </div>
                </div>

                {/* Quantum Node */}
                <div className={`p-4 rounded-[2.5rem] border transition-all duration-500 relative overflow-hidden text-center flex flex-col justify-between min-h-[140px] ${step >= 2 || fusionResult ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-500/40 shadow-[0_0_30px_rgba(168,85,247,0.15)] scale-105 z-10' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60'}`}>
                    {step === 2 && <div className="absolute inset-0 bg-purple-500/10 animate-pulse"></div>}
                    <div className="mt-2 relative z-10">
                        <Zap className={`mx-auto mb-2 ${step >= 2 || fusionResult ? 'text-purple-500' : 'text-slate-400'}`} size={24} />
                        <h3 className={`text-[9px] md:text-[10px] font-black uppercase tracking-widest ${step >= 2 || fusionResult ? 'text-purple-600 dark:text-purple-400' : 'text-slate-500'}`}>Physique</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 justify-center pb-2 relative z-10">
                        {fusionResult ? fusionResult.sources.quantum.slice(0,3).map(n => <span key={n} className="px-1.5 py-0.5 rounded-md bg-purple-500/10 text-[9px] font-mono font-bold text-purple-600 dark:text-purple-400">{n}</span>) : <span className="text-[9px] text-slate-400 italic">--</span>}
                    </div>
                </div>

                {/* Oracle Node */}
                <div className={`p-4 rounded-[2.5rem] border transition-all duration-500 relative overflow-hidden text-center flex flex-col justify-between min-h-[140px] ${step >= 3 || fusionResult ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.15)] scale-105 z-10' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60'}`}>
                    {step === 3 && <div className="absolute inset-0 bg-amber-500/10 animate-pulse"></div>}
                    <div className="mt-2 relative z-10">
                        <Brain className={`mx-auto mb-2 ${step >= 3 || fusionResult ? 'text-amber-500' : 'text-slate-400'}`} size={24} />
                        <h3 className={`text-[9px] md:text-[10px] font-black uppercase tracking-widest ${step >= 3 || fusionResult ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>Intuition</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 justify-center pb-2 relative z-10">
                        {fusionResult ? fusionResult.sources.oracle.slice(0,3).map(n => <span key={n} className="px-1.5 py-0.5 rounded-md bg-amber-500/10 text-[9px] font-mono font-bold text-amber-600 dark:text-amber-400">{n}</span>) : <span className="text-[9px] text-slate-400 italic">--</span>}
                    </div>
                </div>
            </div>

            {/* Animation Connector */}
            <div className="flex justify-center -my-6 relative z-10">
                <div className={`bg-slate-900 p-4 rounded-full border border-slate-800 shadow-2xl z-20 transition-all duration-500 ${step === 4 ? 'scale-125 border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.5)]' : ''}`}>
                    <ArrowDown className={`text-slate-500 ${isFusing ? 'animate-bounce text-indigo-500' : ''}`} size={24} />
                </div>
            </div>

            {/* Result Zone */}
            <AnimatePresence>
                {fusionResult && (
                    <motion.div 
                        initial={{ opacity: 0, y: 30, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="bg-white dark:bg-slate-800 p-8 md:p-10 rounded-[3.5rem] shadow-2xl border border-slate-100 dark:border-slate-700 relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-10 opacity-5"><Layers size={140}/></div>
                        
                        <div className="relative z-10 flex flex-col items-center gap-8">
                            <div className="text-center">
                                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-6 border border-indigo-500/20">
                                    <Hexagon size={12}/> Résultat de la Fusion
                                </div>
                                <div className="flex flex-wrap justify-center gap-3 md:gap-5 scale-110 mb-8">
                                    {fusionResult.finalTicket.map((n, i) => (
                                        <motion.div 
                                            key={n}
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ delay: i * 0.1, type: "spring" }}
                                        >
                                            <NumberBall number={n} size="xl" isAttractor />
                                        </motion.div>
                                    ))}
                                </div>
                            </div>

                            <div className="w-full max-w-2xl space-y-8">
                                {/* Matrice de Convergence (Nouveau) */}
                                <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700/50">
                                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4 px-2 flex items-center gap-2">
                                        <Activity size={14} className="text-indigo-500" /> Matrice de Convergence
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {fusionResult.convergedNumbers.filter(cn => fusionResult.finalTicket.includes(cn.number)).map(cn => (
                                            <div key={cn.number} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-black text-sm">
                                                        {cn.number}
                                                    </div>
                                                    <div className="flex gap-1">
                                                        {cn.sources.map(src => (
                                                            <div key={src} className="p-1.5 bg-slate-100 dark:bg-slate-900 rounded-lg" title={getSourceLabel(src)}>
                                                                {getSourceIcon(src)}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs font-black text-slate-700 dark:text-slate-300">{Math.round(cn.score)} pts</div>
                                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Score</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Métriques Globales */}
                                <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700/50">
                                    <div className="grid grid-cols-2 gap-6 mb-8">
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400 tracking-widest px-2">
                                                <span>Cohérence Totale</span>
                                                <span className="text-indigo-500 text-sm">{fusionResult.confidence}%</span>
                                            </div>
                                            <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-shimmer rounded-full" 
                                                    style={{ width: `${fusionResult.confidence}%`, backgroundSize: '200% 100%' }}
                                                ></div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400 tracking-widest px-2">
                                                <span>Entropie Résiduelle</span>
                                                <span className="text-amber-500 text-sm">{(fusionResult.entropy * 100).toFixed(1)}%</span>
                                            </div>
                                            <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full" 
                                                    style={{ width: `${fusionResult.entropy * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Distribution des Sources */}
                                    <div className="mb-8">
                                        <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 px-2 flex items-center gap-2">
                                            <Layers size={14} className="text-indigo-500" /> Poids des Vecteurs
                                        </h4>
                                        <div className="flex h-4 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 gap-0.5">
                                            {(() => {
                                                const ticketSources = fusionResult.convergedNumbers
                                                    .filter(cn => fusionResult.finalTicket.includes(cn.number))
                                                    .flatMap(cn => cn.sources);
                                                
                                                const total = ticketSources.length || 1;
                                                const pythonCount = ticketSources.filter(s => s === 'python').length;
                                                const quantumCount = ticketSources.filter(s => s === 'quantum').length;
                                                const oracleCount = ticketSources.filter(s => s === 'oracle').length;

                                                const pPct = (pythonCount / total) * 100;
                                                const qPct = (quantumCount / total) * 100;
                                                const oPct = (oracleCount / total) * 100;

                                                return (
                                                    <>
                                                        <div className="h-full bg-emerald-500 rounded-l-full transition-all duration-1000" style={{ width: `${pPct}%` }} title={`Logique: ${Math.round(pPct)}%`}></div>
                                                        <div className="h-full bg-purple-500 transition-all duration-1000" style={{ width: `${qPct}%` }} title={`Physique: ${Math.round(qPct)}%`}></div>
                                                        <div className="h-full bg-amber-500 rounded-r-full transition-all duration-1000" style={{ width: `${oPct}%` }} title={`Intuition: ${Math.round(oPct)}%`}></div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex justify-between mt-2 px-2 text-[9px] font-bold uppercase tracking-widest">
                                            <span className="text-emerald-500">Logique</span>
                                            <span className="text-purple-500">Physique</span>
                                            <span className="text-amber-500">Intuition</span>
                                        </div>
                                    </div>
                                    
                                    <TicketXRay numbers={fusionResult.finalTicket} score={fusionResult.confidence} showTitle={false} />
                                    
                                    <button 
                                        onClick={handleSave}
                                        className="w-full mt-6 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95 hover:shadow-indigo-500/20"
                                    >
                                        <Save size={16}/> Sauvegarder dans le Wallet
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
