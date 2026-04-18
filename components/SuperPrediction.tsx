import React, { useState } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { Brain, Zap, Target, Save, ShieldCheck, RefreshCw, Network, Combine } from 'lucide-react';
import { NumberBall } from './NumberBall';
import { useToast } from './ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { runNeuralEnsemble, EnsembleResult } from '../services/neuralEnsembleService';
import { generatePlatinumPrediction } from '../services/metaAnalystService';
import { saveTicket } from '../services/userPreferencesService';
import { savePredictionToHistory } from '../services/predictionHistoryService';
import { audioEngine } from '../utils/audioEngine';
import type { Prediction } from '../types';

export const SuperPrediction: React.FC = () => {
    const { showToast } = useToast();
    const history = useNexusStore(state => state.history);
    const drawName = useNexusStore(state => state.drawName);
    
    const [loading, setLoading] = useState(false);
    const [ensembleResult, setEnsembleResult] = useState<EnsembleResult | null>(null);
    const [oracleResult, setOracleResult] = useState<any | null>(null);
    const [primaryStrategy, setPrimaryStrategy] = useState<'ensemble' | 'oracle' | null>(null);
    const [superTicket, setSuperTicket] = useState<number[]>([]);

    const runAnalysis = async () => {
        audioEngine.play('click');
        if (history.length < 15) {
            showToast("Dataset insuffisant. 15 tirages minimum requis.", "error");
            audioEngine.play('error');
            return;
        }
        setLoading(true);
        audioEngine.play('scan');
        try {
            // Run both in parallel
            const [ensembleData, platinumData] = await Promise.all([
                runNeuralEnsemble(drawName, history, {}),
                generatePlatinumPrediction(drawName, history, undefined, undefined, undefined, 'BALANCED')
            ]);
            
            setEnsembleResult(ensembleData);
            setOracleResult(platinumData);
            setPrimaryStrategy('ensemble'); // default
            generateSuperTicket('ensemble', ensembleData.consensus, platinumData.scenarios[0]?.numbers || []);
            
            showToast("Analyse combinée terminée.", "success");
            audioEngine.play('success');
        } catch (e: any) {
            showToast("Erreur lors de la génération : " + e.message, "error");
            audioEngine.play('error');
        } finally {
            setLoading(false);
        }
    };

    const generateSuperTicket = (strategy: 'ensemble' | 'oracle', ensNums: number[], oraNums: number[]) => {
        let finalNums = new Set<number>();
        
        // Find intersection (common numbers)
        const common = ensNums.filter(n => oraNums.includes(n));
        common.forEach(n => finalNums.add(n));
        
        // Fill the rest based on primary strategy
        const primaryNums = strategy === 'ensemble' ? ensNums : oraNums;
        const secondaryNums = strategy === 'ensemble' ? oraNums : ensNums;
        
        for (const n of primaryNums) {
            if (finalNums.size < 4) finalNums.add(n);
        }
        for (const n of secondaryNums) {
            if (finalNums.size < 5) finalNums.add(n);
        }
        // Fallback if we still don't have 5 numbers
        let i = 1;
        while (finalNums.size < 5 && i <= 90) {
            if (history[0]?.machine.includes(i)) {
               finalNums.add(i);
            }
            i++;
        }
        
        const sortedArray = Array.from(finalNums).sort((a, b) => a - b).slice(0, 5);
        setSuperTicket(sortedArray);
    };

    const handleStrategyChange = (strategy: 'ensemble' | 'oracle') => {
        audioEngine.play('click');
        setPrimaryStrategy(strategy);
        if (ensembleResult && oracleResult) {
            generateSuperTicket(strategy, ensembleResult.consensus, oracleResult.scenarios[0]?.numbers || []);
        }
    };

    const handleSaveTicket = async () => {
        if (superTicket.length < 5) return;
        audioEngine.play('click');
        
        await saveTicket({
            numbers: superTicket,
            drawName,
            strategy: `SuperPrediction (${primaryStrategy === 'ensemble' ? 'Ensemble Neural' : 'Oracle IA'})`
        });

        const predictionObj: Prediction = {
            suggestedNumbers: superTicket,
            candidates: superTicket,
            confidence: 90,
            analysis: `Fusion SuperPrediction orientée ${primaryStrategy}`,
            breakdown: {},
            timestamp: Date.now()
        };
        await savePredictionToHistory(drawName, predictionObj);

        showToast("Super Prédiction sauvegardée avec succès.", "success");
        audioEngine.play('success');
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-8 animate-pulse p-8 bg-slate-900/50 rounded-[3rem] border border-white/5">
                <div className="relative">
                    <div className="w-32 h-32 rounded-full border-t-4 border-indigo-500 animate-spin"></div>
                    <Combine className="absolute inset-0 m-auto text-indigo-500 animate-pulse" size={48} />
                </div>
                <div className="text-center">
                    <h3 className="text-xl font-black text-white uppercase tracking-widest">Fusion Architecturale</h3>
                    <p className="text-xs text-indigo-400 font-mono mt-2">Corrélation des modèles IA en cours...</p>
                </div>
            </div>
        );
    }

    if (!ensembleResult || !oracleResult) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-900/50 rounded-[3rem] border border-white/5 animate-fade-in shadow-2xl">
                <div className="p-6 bg-gradient-to-br from-indigo-900 to-slate-900 rounded-full mb-6 border border-indigo-500/30">
                    <Combine size={48} className="text-indigo-400" />
                </div>
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">
                    Super <span className="text-indigo-500">Prédiction</span>
                </h2>
                <p className="text-slate-400 max-w-sm text-sm font-medium mb-8">
                    Le moteur ultime : croisez les probabilités de l'Ensemble Neural avec les projections de l'Oracle IA pour forger une combinaison hybride imparable.
                </p>
                <button 
                    onClick={runAnalysis}
                    className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.1em] shadow-xl shadow-indigo-600/30 transition-all active:scale-95 flex items-center gap-3"
                >
                    <Zap size={18} className="text-yellow-300"/> Générer la Super Prédiction
                </button>
            </div>
        );
    }

    const ensembleNums = ensembleResult.consensus;
    const oracleNums = oracleResult.scenarios[0]?.numbers || [];

    return (
        <div className="space-y-8 animate-fade-in">
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                <Combine className="text-indigo-500" /> Comparateur Stratégique
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Ensemble Neural Card */}
                <div 
                    onClick={() => handleStrategyChange('ensemble')}
                    className={`cursor-pointer p-6 rounded-[2rem] border transition-all duration-300 relative overflow-hidden group
                        ${primaryStrategy === 'ensemble' ? 'bg-slate-800 border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.2)]' : 'bg-slate-900/60 border-white/5 hover:border-indigo-500/30'}
                    `}
                >
                    {primaryStrategy === 'ensemble' && (
                        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                            <ShieldCheck size={100} className="text-indigo-500" />
                        </div>
                    )}
                    <div className="flex items-center gap-4 mb-6 relative z-10">
                        <div className={`p-3 rounded-xl ${primaryStrategy === 'ensemble' ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                            <Network className={`w-6 h-6 ${primaryStrategy === 'ensemble' ? 'text-white' : 'text-indigo-400'}`} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">Ensemble Neural</h3>
                            <p className="text-[10px] text-slate-400">Tactique mathématique pure</p>
                        </div>
                    </div>
                    <div className="flex justify-center gap-2 mb-4 relative z-10">
                        {ensembleNums.map((n: number) => (
                            <NumberBall key={n} number={n} size="sm" isAttractor={superTicket.includes(n)} />
                        ))}
                    </div>
                    {primaryStrategy === 'ensemble' && <div className="text-center text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-4">Poids Principal : 60%</div>}
                </div>

                {/* Oracle IA Card */}
                <div 
                    onClick={() => handleStrategyChange('oracle')}
                    className={`cursor-pointer p-6 rounded-[2rem] border transition-all duration-300 relative overflow-hidden group
                        ${primaryStrategy === 'oracle' ? 'bg-slate-800 border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.2)]' : 'bg-slate-900/60 border-white/5 hover:border-emerald-500/30'}
                    `}
                >
                    {primaryStrategy === 'oracle' && (
                        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                            <Brain size={100} className="text-emerald-500" />
                        </div>
                    )}
                    <div className="flex items-center gap-4 mb-6 relative z-10">
                        <div className={`p-3 rounded-xl ${primaryStrategy === 'oracle' ? 'bg-emerald-600' : 'bg-slate-800'}`}>
                            <Target className={`w-6 h-6 ${primaryStrategy === 'oracle' ? 'text-white' : 'text-emerald-400'}`} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">Oracle IA (Platinum)</h3>
                            <p className="text-[10px] text-slate-400">Intuition et Patterns Fluides</p>
                        </div>
                    </div>
                    <div className="flex justify-center gap-2 mb-4 relative z-10">
                        {oracleNums.map((n: number) => (
                            <NumberBall key={n} number={n} size="sm" selected={superTicket.includes(n)} />
                        ))}
                    </div>
                    {primaryStrategy === 'oracle' && <div className="text-center text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-4">Poids Principal : 60%</div>}
                </div>
            </div>

            {/* Final Fusion Result */}
            <div className="bg-gradient-to-t from-slate-950 to-slate-900 p-8 rounded-[3rem] border border-white/10 shadow-2xl relative overflow-hidden mt-8 text-center">
                <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50"></div>
                
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-8">Vecteur Final Hybride</h3>
                
                <div className="flex justify-center gap-4 md:gap-6 mb-10">
                    <AnimatePresence mode="popLayout">
                        {superTicket.map((n) => (
                            <motion.div
                                key={n}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                            >
                                <NumberBall number={n} size="xl" isAttractor={primaryStrategy === 'ensemble'} selected={primaryStrategy === 'oracle'} />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                <div className="flex justify-center gap-4">
                    <button 
                        onClick={runAnalysis}
                        className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                    >
                        <RefreshCw size={16} className="inline mr-2" /> Recalculer
                    </button>
                    <button 
                        onClick={handleSaveTicket}
                        className={`px-8 py-3 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all flex items-center gap-2
                            ${primaryStrategy === 'ensemble' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'}
                        `}
                    >
                        <Save size={16} /> Sauvegarder Synthèse
                    </button>
                </div>
            </div>
        </div>
    );
};
