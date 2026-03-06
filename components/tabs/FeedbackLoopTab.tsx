
import React, { useState, useEffect } from 'react';
import { useNexus } from '../NexusProvider';
import { PredictionHistoryItem, DrawResult, AlgoWeights } from '../../types';
import { getPredictionHistoryAsync } from '../../services/predictionHistoryService';
import { Brain, CheckCircle, XCircle, TrendingUp, AlertTriangle, ArrowRight, Save, History, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { calculateGap, calculateFrequency } from '../../services/mathService';

interface MissedNumberAnalysis {
    number: number;
    gap: number;
    frequency: number;
    isRepeat: boolean;
    reason: string;
    suggestedAdjustment: keyof AlgoWeights;
    adjustmentValue: number;
}

export const FeedbackLoopTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history: drawHistory, globalWeights, updateGlobalWeights, refreshData } = useNexus();
    const [predictions, setPredictions] = useState<PredictionHistoryItem[]>([]);
    const [selectedPred, setSelectedPred] = useState<PredictionHistoryItem | null>(null);
    const [missedAnalysis, setMissedAnalysis] = useState<MissedNumberAnalysis[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadHistory();
    }, [drawName]);

    const loadHistory = async () => {
        setLoading(true);
        const preds = await getPredictionHistoryAsync(drawName);
        // Filter only those that have a result available in drawHistory
        const validPreds = preds.filter(p => {
            // Find draw that matches prediction timestamp (approximate match or by ID)
            // Ideally we link by ID, but for now let's try to find a draw that happened AFTER the prediction
            // Actually, the prediction is for a specific draw date.
            // Let's assume prediction.timestamp is close to the draw date.
            // Simple check: do we have a draw in history with date >= prediction date?
            // Better: Find the draw result that corresponds to this prediction.
            // We'll search for a draw with the same date or slightly after.
            return findMatchingDraw(p, drawHistory) !== undefined;
        }).sort((a, b) => b.timestamp - a.timestamp);
        
        setPredictions(validPreds);
        setLoading(false);
    };

    const findMatchingDraw = (pred: PredictionHistoryItem, history: DrawResult[]): DrawResult | undefined => {
        // Try to find a draw with the same date string
        const predDate = new Date(pred.timestamp).toLocaleDateString('fr-FR');
        return history.find(d => d.date === predDate);
    };

    const handleSelectPrediction = (pred: PredictionHistoryItem) => {
        setSelectedPred(pred);
        analyzePrediction(pred);
    };

    const analyzePrediction = (pred: PredictionHistoryItem) => {
        const matchingDraw = findMatchingDraw(pred, drawHistory);
        if (!matchingDraw) return;

        const winningNumbers = matchingDraw.gagnants;
        const predictedNumbers = pred.prediction.suggestedNumbers;
        
        const missed = winningNumbers.filter(n => !predictedNumbers.includes(n));
        
        // Analyze why we missed them
        // We need the history *before* this draw to calculate metrics
        const drawIndex = drawHistory.findIndex(d => d.id === matchingDraw.id);
        const pastHistory = drawHistory.slice(drawIndex + 1); // History strictly before the draw

        const analysisResults: MissedNumberAnalysis[] = missed.map(num => {
            const gap = calculateGap(pastHistory, num);
            const freq = calculateFrequency(pastHistory, num, 50); // last 50 draws
            const isRepeat = pastHistory[0]?.gagnants.includes(num) || false;

            let reason = "Raison inconnue";
            let suggestedAdjustment: keyof AlgoWeights = 'ai_intuition';
            let adjustmentValue = 0;

            if (isRepeat) {
                reason = "Répétition immédiate (Twin/Markov)";
                suggestedAdjustment = 'twin';
                adjustmentValue = 0.05;
            } else if (gap > 20) {
                reason = `Écart critique élevé (${gap})`;
                suggestedAdjustment = 'gap';
                adjustmentValue = 0.05;
            } else if (freq > 8) {
                reason = `Frequence élevée (${freq}/50)`;
                suggestedAdjustment = 'frequency';
                adjustmentValue = 0.05;
            } else if (gap < 3) {
                reason = "Sortie récente (Hot)";
                suggestedAdjustment = 'momentum';
                adjustmentValue = 0.05;
            } else {
                reason = "Pattern complexe (Spectral/Chaos)";
                suggestedAdjustment = 'spectral';
                adjustmentValue = 0.05;
            }

            return {
                number: num,
                gap,
                frequency: freq,
                isRepeat,
                reason,
                suggestedAdjustment,
                adjustmentValue
            };
        });

        setMissedAnalysis(analysisResults);
    };

    const applyLesson = (analysis: MissedNumberAnalysis) => {
        if (!globalWeights) return;

        const currentWeight = globalWeights[analysis.suggestedAdjustment] || 0;
        const newWeight = Math.min(1, currentWeight + analysis.adjustmentValue);
        
        const newWeights = {
            ...globalWeights,
            [analysis.suggestedAdjustment]: newWeight
        };

        updateGlobalWeights(newWeights);
        
        // Visual feedback could be added here
        alert(`Leçon intégrée : Poids de ${analysis.suggestedAdjustment} augmenté de ${(analysis.adjustmentValue * 100).toFixed(0)}%`);
    };

    return (
        <div className="flex flex-col md:flex-row gap-6 min-h-[600px] animate-fade-in">
            {/* Sidebar: History List */}
            <div className="w-full md:w-1/3 space-y-4">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-slate-400 font-bold uppercase text-xs tracking-widest flex items-center gap-2">
                        <History size={14} /> Historique Prédictions
                    </h3>
                    <button onClick={loadHistory} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>

                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                    {predictions.length === 0 && (
                        <div className="text-center py-10 text-slate-500 text-xs italic">
                            Aucune prédiction archivée avec résultat connu.
                        </div>
                    )}
                    {predictions.map(pred => {
                        const match = findMatchingDraw(pred, drawHistory);
                        const hits = match ? pred.prediction.suggestedNumbers.filter(n => match.gagnants.includes(n)).length : 0;
                        const isSelected = selectedPred?.id === pred.id;

                        return (
                            <div 
                                key={pred.id}
                                onClick={() => handleSelectPrediction(pred)}
                                className={`
                                    p-4 rounded-xl border cursor-pointer transition-all hover:scale-[1.02]
                                    ${isSelected 
                                        ? 'bg-indigo-900/30 border-indigo-500/50 shadow-lg shadow-indigo-900/20' 
                                        : 'bg-slate-900/50 border-white/5 hover:bg-slate-800/50'}
                                `}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-mono text-slate-400">
                                        {new Date(pred.timestamp).toLocaleDateString('fr-FR')}
                                    </span>
                                    <div className={`px-2 py-1 rounded-md text-[10px] font-black ${hits >= 3 ? 'bg-emerald-500/20 text-emerald-400' : hits > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                        {hits}/5 HITS
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {pred.prediction.suggestedNumbers.map(n => (
                                        <span key={n} className={`
                                            w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold
                                            ${match?.gagnants.includes(n) ? 'bg-emerald-500 text-white shadow-emerald-500/50 shadow-sm' : 'bg-slate-800 text-slate-500'}
                                        `}>
                                            {n}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Main Content: Analysis & Feedback */}
            <div className="flex-1 bg-slate-900/80 rounded-[2rem] border border-white/10 p-6 md:p-8 relative overflow-hidden">
                {!selectedPred ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40">
                        <Brain size={80} className="text-slate-600" />
                        <p className="text-sm font-medium text-slate-400 max-w-xs">
                            Sélectionnez une prédiction passée pour lancer l'analyse post-mortem et extraire des leçons.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-8 animate-slide-up">
                        <div className="flex items-center justify-between border-b border-white/5 pb-6">
                            <div>
                                <h2 className="text-2xl font-black text-white mb-1">Analyse Post-Mortem</h2>
                                <p className="text-xs text-slate-400 font-mono">ID: {selectedPred.id.slice(0, 8)} • Confiance Initiale: {selectedPred.prediction.confidence}%</p>
                            </div>
                            <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                                <TrendingUp className="text-indigo-400" size={24} />
                            </div>
                        </div>

                        {/* Result Visualization */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold uppercase text-slate-500 tracking-widest">Comparaison Réalité</h3>
                            <div className="flex flex-wrap gap-4">
                                <div className="flex-1 bg-slate-950/50 p-4 rounded-xl border border-white/5">
                                    <span className="block text-[10px] text-slate-500 mb-2 uppercase">Prédiction IA</span>
                                    <div className="flex gap-2">
                                        {selectedPred.prediction.suggestedNumbers.map(n => {
                                            const isHit = findMatchingDraw(selectedPred, drawHistory)?.gagnants.includes(n);
                                            return (
                                                <div key={n} className={`
                                                    w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm border
                                                    ${isHit ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-800 border-slate-700 text-slate-500 opacity-50'}
                                                `}>
                                                    {n}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="flex items-center text-slate-600">
                                    <ArrowRight size={20} />
                                </div>
                                <div className="flex-1 bg-slate-950/50 p-4 rounded-xl border border-white/5">
                                    <span className="block text-[10px] text-slate-500 mb-2 uppercase">Tirage Réel</span>
                                    <div className="flex gap-2">
                                        {findMatchingDraw(selectedPred, drawHistory)?.gagnants.map(n => (
                                            <div key={n} className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-slate-900 font-bold text-sm shadow-lg">
                                                {n}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Missed Opportunities Analysis */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold uppercase text-rose-500 tracking-widest flex items-center gap-2">
                                <AlertTriangle size={14} /> Opportunités Manquées
                            </h3>
                            <div className="grid grid-cols-1 gap-3">
                                {missedAnalysis.map((analysis) => (
                                    <motion.div 
                                        key={analysis.number}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="bg-slate-800/40 border border-white/5 p-4 rounded-xl flex items-center justify-between group hover:bg-slate-800/60 transition-colors"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 font-black text-lg">
                                                {analysis.number}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-200">{analysis.reason}</p>
                                                <div className="flex gap-3 text-[10px] text-slate-500 mt-1">
                                                    <span>Gap: {analysis.gap}</span>
                                                    <span>Freq: {analysis.frequency}</span>
                                                    <span>Repeat: {analysis.isRepeat ? 'OUI' : 'NON'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <button 
                                            onClick={() => applyLesson(analysis)}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-900/20"
                                        >
                                            <Save size={14} />
                                            <span>Apprendre : Boost {analysis.suggestedAdjustment}</span>
                                        </button>
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-emerald-900/20 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-3">
                            <CheckCircle className="text-emerald-400 shrink-0 mt-0.5" size={18} />
                            <div>
                                <h4 className="text-sm font-bold text-emerald-300 mb-1">Système d'Apprentissage Actif</h4>
                                <p className="text-xs text-emerald-400/70 leading-relaxed">
                                    En validant ces leçons, vous ajustez les poids neuronaux du Nexus pour qu'il reconnaisse mieux ces patterns à l'avenir. C'est ainsi que Platinum Elite devient plus intelligent après chaque tirage.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
