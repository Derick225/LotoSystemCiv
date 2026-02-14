
import React, { useState } from 'react';
import { useNexus } from '../NexusProvider';
import { calculateFusion } from '../../services/fusionService';
import { FusionResult } from '../../types';
import { NumberBall } from '../NumberBall';
import { TicketXRay } from '../TicketXRay';
import { saveTicket } from '../../services/userPreferencesService';
import { useToast } from '../ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, Zap, Brain, Hexagon, ArrowDown, Save, RefreshCw, Layers, GitMerge } from 'lucide-react';

export const ConvergenceTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history, stats, spectral, lastPrediction, globalWeights } = useNexus();
    const { showToast } = useToast();
    
    const [fusionResult, setFusionResult] = useState<FusionResult | null>(null);
    const [isFusing, setIsFusing] = useState(false);
    const [step, setStep] = useState(0); 

    const handleFusion = () => {
        if (history.length < 5) {
            showToast("Historique insuffisant pour la convergence.", "error");
            return;
        }
        setIsFusing(true);
        setStep(1); 
        
        // Séquence d'animation
        setTimeout(() => setStep(2), 600);  
        setTimeout(() => setStep(3), 1200); 
        
        setTimeout(() => {
            // Injection des poids ADN (globalWeights) pour une fusion contextuelle
            const result = calculateFusion(history, stats, spectral, lastPrediction, globalWeights);
            setFusionResult(result);
            setIsFusing(false);
            setStep(0);
        }, 1800);
    };

    const handleSave = async () => {
        if (!fusionResult) return;
        await saveTicket({
            numbers: fusionResult.finalTicket,
            drawName,
            strategy: `Hyper-Convergence (${fusionResult.confidence}%)`
        });
        showToast("Ticket Fusion sauvegardé.", "success");
    };

    return (
        <div className="space-y-10 animate-fade-in pb-20 w-full overflow-hidden">
            {/* Header / Control */}
            <div className="bg-slate-900 border border-indigo-500/20 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden text-center group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-pulse-slow"></div>
                <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none"><GitMerge size={140} /></div>
                
                <div className="relative z-10">
                    <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase mb-4">
                        Synthèse <span className="text-indigo-500">Vectorielle</span>
                    </h2>
                    <p className="text-slate-400 text-xs md:text-sm font-medium max-w-lg mx-auto mb-10 leading-relaxed">
                        Le moteur de synthèse agrège les signaux Logiques (Algorithmes), Physiques (Spectral) et Intuitifs (Oracle) pour produire une grille unique optimisée par votre ADN.
                    </p>
                    
                    <button 
                        onClick={handleFusion}
                        disabled={isFusing}
                        className="px-10 py-5 bg-white text-slate-900 hover:bg-indigo-50 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-3 mx-auto transition-all active:scale-95 disabled:opacity-50 min-w-[240px] group"
                    >
                        {isFusing ? <RefreshCw className="animate-spin" size={18}/> : <Hexagon size={18} className="group-hover:rotate-12 transition-transform"/>}
                        {isFusing ? 'Fusion en cours...' : 'Lancer la Synthèse'}
                    </button>
                </div>
            </div>

            {/* Source Streams */}
            <div className="grid grid-cols-3 gap-3 md:gap-6">
                {/* Python Node */}
                <div className={`p-4 rounded-[2.5rem] border transition-all duration-500 relative overflow-hidden text-center flex flex-col justify-between min-h-[140px] ${step >= 1 || fusionResult ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-500/30 shadow-lg' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60'}`}>
                    {step === 1 && <div className="absolute inset-0 bg-emerald-500/10 animate-pulse"></div>}
                    <div className="mt-2">
                        <Cpu className={`mx-auto mb-2 ${step >= 1 || fusionResult ? 'text-emerald-500' : 'text-slate-400'}`} size={24} />
                        <h3 className={`text-[9px] md:text-[10px] font-black uppercase tracking-widest ${step >= 1 || fusionResult ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>Logique</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 justify-center pb-2">
                        {fusionResult ? fusionResult.sources.python.slice(0,3).map(n => <span key={n} className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400">{n}</span>) : <span className="text-[9px] text-slate-400 italic">--</span>}
                    </div>
                </div>

                {/* Quantum Node */}
                <div className={`p-4 rounded-[2.5rem] border transition-all duration-500 relative overflow-hidden text-center flex flex-col justify-between min-h-[140px] ${step >= 2 || fusionResult ? 'bg-purple-50 dark:bg-purple-900/10 border-purple-500/30 shadow-lg' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60'}`}>
                    {step === 2 && <div className="absolute inset-0 bg-purple-500/10 animate-pulse"></div>}
                    <div className="mt-2">
                        <Zap className={`mx-auto mb-2 ${step >= 2 || fusionResult ? 'text-purple-500' : 'text-slate-400'}`} size={24} />
                        <h3 className={`text-[9px] md:text-[10px] font-black uppercase tracking-widest ${step >= 2 || fusionResult ? 'text-purple-600 dark:text-purple-400' : 'text-slate-500'}`}>Physique</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 justify-center pb-2">
                        {fusionResult ? fusionResult.sources.quantum.slice(0,3).map(n => <span key={n} className="px-1.5 py-0.5 rounded-md bg-purple-500/10 text-[9px] font-mono font-bold text-purple-600 dark:text-purple-400">{n}</span>) : <span className="text-[9px] text-slate-400 italic">--</span>}
                    </div>
                </div>

                {/* Oracle Node */}
                <div className={`p-4 rounded-[2.5rem] border transition-all duration-500 relative overflow-hidden text-center flex flex-col justify-between min-h-[140px] ${step >= 3 || fusionResult ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-500/30 shadow-lg' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60'}`}>
                    {step === 3 && <div className="absolute inset-0 bg-amber-500/10 animate-pulse"></div>}
                    <div className="mt-2">
                        <Brain className={`mx-auto mb-2 ${step >= 3 || fusionResult ? 'text-amber-500' : 'text-slate-400'}`} size={24} />
                        <h3 className={`text-[9px] md:text-[10px] font-black uppercase tracking-widest ${step >= 3 || fusionResult ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>Intuition</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 justify-center pb-2">
                        {fusionResult ? fusionResult.sources.oracle.slice(0,3).map(n => <span key={n} className="px-1.5 py-0.5 rounded-md bg-amber-500/10 text-[9px] font-mono font-bold text-amber-600 dark:text-amber-400">{n}</span>) : <span className="text-[9px] text-slate-400 italic">--</span>}
                    </div>
                </div>
            </div>

            {/* Animation Connector */}
            <div className="flex justify-center -my-6 relative z-10">
                <div className="bg-slate-900 p-3 rounded-full border border-slate-800 shadow-xl z-20">
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
                                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-6">
                                    <Hexagon size={12}/> Résultat de la Fusion
                                </div>
                                <div className="flex flex-wrap justify-center gap-3 md:gap-5 scale-110">
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

                            <div className="w-full max-w-xl space-y-8 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700/50">
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
                                
                                <TicketXRay numbers={fusionResult.finalTicket} score={fusionResult.confidence} showTitle={false} />
                                
                                <button 
                                    onClick={handleSave}
                                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95 hover:shadow-indigo-500/20"
                                >
                                    <Save size={16}/> Sauvegarder dans le Wallet
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
