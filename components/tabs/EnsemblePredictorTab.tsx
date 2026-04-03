
import React, { useState, useEffect, useMemo } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { 
    Brain, Cpu, Zap, Activity, Layers, 
    ShieldCheck, RefreshCw, Save, 
    ChevronRight, Info, AlertCircle,
    Network, Binary, Terminal
} from 'lucide-react';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { runNeuralEnsemble, EnsembleAgent, EnsembleResult, backtestNeuralEnsemble, BacktestResult } from '../../services/neuralEnsembleService';
import { saveTicket } from '../../services/userPreferencesService';
import { savePredictionToHistory } from '../../services/predictionHistoryService';
import type { Prediction } from '../../types';

import { audioEngine } from '../../utils/audioEngine';

import { DRAW_SCHEDULE } from '../../constants';

export const EnsemblePredictorTab: React.FC = () => {
    const { showToast } = useToast();
    const history = useNexusStore(state => state.history);
    const drawName = useNexusStore(state => state.drawName);
    const setDrawName = useNexusStore(state => state.setDrawName);
    const refreshData = useNexusStore(state => state.refreshData);
    const spectral = useNexusStore(state => state.spectral);
    const fractal = useNexusStore(state => state.fractal);
    const volatility = useNexusStore(state => state.volatility);
    
    const [result, setResult] = useState<EnsembleResult | null>(null);
    const [backtest, setBacktest] = useState<BacktestResult[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [backtesting, setBacktesting] = useState(false);
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'agents' | 'consensus' | 'backtest'>('agents');

    const [backtestProgress, setBacktestProgress] = useState(0);

    const allDraws = useMemo(() => {
        const draws = new Set<string>();
        Object.values(DRAW_SCHEDULE).forEach(day => {
            Object.values(day).forEach(name => draws.add(name));
        });
        return Array.from(draws).sort();
    }, []);

    const handleDrawChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newDraw = e.target.value;
        audioEngine.play('click');
        setDrawName(newDraw);
        setResult(null); // Reset result when changing draw
        setBacktest(null);
        await refreshData(newDraw);
    };

    const runAnalysis = async () => {
        audioEngine.play('click');
        if (history.length < 15) {
            showToast("Dataset insuffisant pour l'Ensemble.", "error");
            audioEngine.play('error');
            return;
        }
        setLoading(true);
        audioEngine.play('scan');
        try {
            const data = await runNeuralEnsemble(drawName, history, { spectral, fractal, volatility });
            setResult(data);
            showToast("Ensemble Neural synchronisé.", "success");
            audioEngine.play('success');
        } catch (e: any) {
            showToast("Erreur Ensemble : " + e.message, "error");
            audioEngine.play('error');
        } finally {
            setLoading(false);
        }
    };

    const runBacktest = async () => {
        audioEngine.play('click');
        if (history.length < 20) {
            showToast("Dataset insuffisant pour le backtest.", "error");
            audioEngine.play('error');
            return;
        }
        setBacktesting(true);
        setBacktestProgress(0);
        audioEngine.play('scan');
        try {
            const data = await backtestNeuralEnsemble(
                drawName, 
                history, 
                { spectral, fractal, volatility }, 
                3,
                (current, total) => setBacktestProgress(Math.round((current / total) * 100))
            );
            setBacktest(data);
            showToast("Backtest terminé.", "success");
            audioEngine.play('success');
        } catch (e: any) {
            showToast("Erreur Backtest : " + e.message, "error");
            audioEngine.play('error');
        } finally {
            setBacktesting(false);
            setBacktestProgress(0);
        }
    };

    const handleSave = async (numbers: number[], strategy: string) => {
        audioEngine.play('click');
        await saveTicket({
            numbers,
            drawName,
            strategy: `Ensemble: ${strategy}`
        });

        const predictionObj: Prediction = {
            suggestedNumbers: numbers,
            candidates: numbers,
            confidence: 80, // Arbitrary confidence
            analysis: `Ensemble Predictor: ${strategy}`,
            breakdown: {},
            timestamp: Date.now()
        };
        await savePredictionToHistory(drawName, predictionObj);

        showToast("Ticket sauvegardé et autopsié.", "success");
        audioEngine.play('success');
    };

    const selectedAgent = result?.agents.find(a => a.id === selectedAgentId);

    const renderDrawSelector = () => (
        <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-2xl border border-white/5 mb-8">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                    <Layers size={20} className="text-indigo-400" />
                </div>
                <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-widest">Cible d'Analyse</h3>
                    <p className="text-[10px] text-slate-500 font-medium">Sélectionnez le tirage à prédire</p>
                </div>
            </div>
            <select
                value={drawName}
                onChange={handleDrawChange}
                className="bg-black/50 border border-white/10 text-white text-sm font-bold rounded-xl px-4 py-2 outline-none focus:border-indigo-500 transition-colors"
            >
                {allDraws.map(d => (
                    <option key={d} value={d}>{d}</option>
                ))}
            </select>
        </div>
    );

    if (loading) {
        return (
            <div className="animate-fade-in">
                {renderDrawSelector()}
                <div className="flex flex-col items-center justify-center min-h-[400px] gap-8 animate-pulse">
                    <div className="relative">
                        <div className="w-40 h-40 rounded-full border-t-4 border-indigo-500 animate-spin"></div>
                        <Brain className="absolute inset-0 m-auto text-indigo-500 animate-pulse" size={64} />
                    </div>
                    <div className="text-center">
                        <h3 className="text-2xl font-black text-white uppercase tracking-widest">Neural Ensemble</h3>
                        <p className="text-xs text-indigo-400 font-mono mt-2">Orchestration des agents tactiques...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!result) {
        return (
            <div className="animate-fade-in">
                {renderDrawSelector()}
                <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-slate-900/50 rounded-[3rem] border border-white/5">
                    <div className="p-8 bg-slate-900 rounded-full shadow-2xl mb-8 border border-white/5">
                        <Network size={80} className="text-indigo-500" />
                    </div>
                    <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter mb-4">
                        Neural <span className="text-indigo-500">Ensemble</span>
                    </h2>
                    <p className="text-slate-400 max-w-lg text-sm font-medium leading-relaxed mb-10">
                        Fusionnez les prédictions de 5 agents spécialisés (LSTM, Gap, Spectral, Fréquentiel, Chaos) pour obtenir un consensus probabiliste ultra-robuste.
                    </p>
                    <button 
                        onClick={() => { audioEngine.play('click'); runAnalysis(); }}
                        className="px-12 py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all active:scale-95 flex items-center gap-4 group"
                    >
                        <Zap size={20} className="group-hover:text-yellow-300 transition-colors"/> Lancer l'Orchestration
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {renderDrawSelector()}
            
            {/* Header / Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-900 p-5 rounded-[2rem] border border-white/5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Confiance</span>
                    <div className="text-2xl font-black text-white flex items-center gap-2 mt-1">
                        {result.confidence}%
                        <ShieldCheck size={18} className="text-emerald-500"/>
                    </div>
                </div>
                <div className="bg-slate-900 p-5 rounded-[2rem] border border-white/5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Agents Actifs</span>
                    <div className="text-2xl font-black text-white flex items-center gap-2 mt-1">
                        {result.agents.length}
                        <Cpu size={18} className="text-indigo-500"/>
                    </div>
                </div>
                <div className="bg-slate-900 p-5 rounded-[2rem] border border-white/5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Consensus</span>
                    <div className="text-2xl font-black text-emerald-400 flex items-center gap-2 mt-1">
                        Stable
                        <Activity size={18} className="text-emerald-500"/>
                    </div>
                </div>
                <button 
                    onClick={() => { audioEngine.play('click'); runAnalysis(); }}
                    className="bg-indigo-600 hover:bg-indigo-500 rounded-[2rem] flex flex-col items-center justify-center text-white transition-all group active:scale-95"
                >
                    <RefreshCw size={24} className="mb-1 group-hover:rotate-180 transition-transform duration-700"/>
                    <span className="text-[10px] font-black uppercase tracking-widest">Re-Synchroniser</span>
                </button>
            </div>

            {/* Navigation */}
            <div className="flex bg-slate-900/50 p-1.5 rounded-2xl border border-white/5 w-fit mx-auto">
                <button 
                    onClick={() => { audioEngine.play('click'); setActiveTab('agents'); }}
                    className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'agents' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Agents Tactiques
                </button>
                <button 
                    onClick={() => { audioEngine.play('click'); setActiveTab('consensus'); }}
                    className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'consensus' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Consensus Final
                </button>
                <button 
                    onClick={() => { audioEngine.play('click'); setActiveTab('backtest'); }}
                    className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'backtest' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Backtest
                </button>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'agents' ? (
                    <motion.div 
                        key="agents"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="grid lg:grid-cols-12 gap-8"
                    >
                        {/* Agents List */}
                        <div className="lg:col-span-7 space-y-4">
                            {result.agents.map((agent) => (
                                <button
                                    key={agent.id}
                                    onClick={() => { audioEngine.play('click'); setSelectedAgentId(agent.id); }}
                                    className={`
                                        w-full p-5 rounded-[2rem] border text-left transition-all group relative overflow-hidden
                                        ${selectedAgentId === agent.id 
                                            ? 'bg-slate-800 border-indigo-500/50 shadow-xl ring-1 ring-indigo-500/20' 
                                            : 'bg-slate-900/50 border-white/5 hover:bg-slate-800/50 hover:border-white/10'
                                        }
                                    `}
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${selectedAgentId === agent.id ? 'bg-indigo-600' : 'bg-slate-800'} transition-colors`}>
                                                <Binary size={18} className={selectedAgentId === agent.id ? 'text-white' : 'text-indigo-400'} />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-black text-white uppercase tracking-tight">{agent.name}</h4>
                                                <p className="text-[10px] text-slate-500 font-medium">{agent.description}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Confiance</div>
                                            <div className="text-lg font-black text-white">{agent.prediction.confidence}%</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5 mt-4">
                                        {agent.prediction.suggestedNumbers.map(n => (
                                            <NumberBall key={n} number={n} size="xs" />
                                        ))}
                                    </div>
                                    {selectedAgentId === agent.id && (
                                        <motion.div 
                                            layoutId="active-indicator"
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-500"
                                        >
                                            <ChevronRight size={24} />
                                        </motion.div>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Agent Details / Inspector */}
                        <div className="lg:col-span-5">
                            <AnimatePresence mode="wait">
                                {selectedAgent ? (
                                    <motion.div
                                        key={selectedAgent.id}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="bg-slate-950 p-8 rounded-[3rem] border border-slate-800 shadow-2xl h-full flex flex-col"
                                    >
                                        <div className="flex items-center gap-3 mb-8">
                                            <Terminal size={20} className="text-indigo-500" />
                                            <h4 className="text-xs font-black text-white uppercase tracking-widest">Analyse Agent</h4>
                                        </div>

                                        <div className="flex-1 space-y-8">
                                            <div>
                                                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Vecteur de Prédiction</h5>
                                                <div className="flex justify-center gap-3">
                                                    {selectedAgent.prediction.suggestedNumbers.map(n => (
                                                        <NumberBall key={n} number={n} size="md" />
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                                                <div className="flex items-start gap-3">
                                                    <Info size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                                                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed italic">
                                                        "{selectedAgent.prediction.analysis}"
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Candidats Secondaires</h5>
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedAgent.prediction.candidates.map(n => (
                                                        <NumberBall key={n} number={n} size="xs" />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <button 
                                            onClick={() => handleSave(selectedAgent.prediction.suggestedNumbers, selectedAgent.name)}
                                            className="w-full mt-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95"
                                        >
                                            <Save size={16}/> Sauvegarder ce Vecteur
                                        </button>
                                    </motion.div>
                                ) : (
                                    <div className="bg-slate-900/30 p-8 rounded-[3rem] border border-dashed border-white/10 h-full flex flex-col items-center justify-center text-center opacity-40">
                                        <Activity size={48} className="text-slate-600 mb-4 animate-pulse" />
                                        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Sélectionnez un agent pour inspecter ses données</p>
                                    </div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                ) : activeTab === 'consensus' ? (
                    <motion.div 
                        key="consensus"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="space-y-8"
                    >
                        {/* Consensus Card */}
                        <div className="bg-gradient-to-br from-indigo-900/40 to-slate-950 p-10 rounded-[4rem] border border-indigo-500/30 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none">
                                <ShieldCheck size={200} className="text-indigo-500" />
                            </div>
                            
                            <div className="relative z-10 text-center">
                                <h3 className="text-xs font-black text-indigo-400 uppercase tracking-[0.3em] mb-8">Consensus Neural Unifié</h3>
                                
                                <div className="flex justify-center gap-4 md:gap-6 mb-12">
                                    {result.consensus.map(n => (
                                        <NumberBall key={n} number={n} size="xl" isAttractor />
                                    ))}
                                </div>

                                <div className="max-w-2xl mx-auto bg-black/40 p-8 rounded-3xl border border-white/5 backdrop-blur-md">
                                    <div className="flex items-start gap-4 text-left">
                                        <AlertCircle size={24} className="text-indigo-500 shrink-0 mt-1" />
                                        <div>
                                            <h4 className="text-sm font-black text-white uppercase tracking-widest mb-2">Méta-Analyse de l'Oracle</h4>
                                            <p className="text-xs text-slate-400 font-medium leading-relaxed">
                                                {result.metaAnalysis}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <button 
                                    onClick={() => handleSave(result.consensus, "Consensus Ensemble")}
                                    className="mt-12 px-12 py-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-emerald-600/30 transition-all active:scale-95 flex items-center gap-4 mx-auto"
                                >
                                    <Save size={20}/> Valider le Consensus
                                </button>
                            </div>
                        </div>

                        {/* Confidence Breakdown */}
                        <div className="bg-slate-900 p-8 rounded-[3rem] border border-white/5">
                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-8 flex items-center gap-2">
                                <Activity size={16}/> Répartition de la Confiance
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                                {result.agents.map(agent => (
                                    <div key={agent.id} className="space-y-3">
                                        <div className="flex justify-between items-end">
                                            <span className="text-[10px] font-black text-white uppercase truncate max-w-[80px]">{agent.name}</span>
                                            <span className="text-[10px] font-mono text-indigo-400">{agent.prediction.confidence}%</span>
                                        </div>
                                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <motion.div 
                                                initial={{ width: 0 }}
                                                animate={{ width: `${agent.prediction.confidence}%` }}
                                                transition={{ duration: 1, delay: 0.5 }}
                                                className="h-full bg-indigo-500"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="backtest"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-8"
                    >
                        <div className="bg-slate-900 p-8 rounded-[3rem] border border-white/5">
                            <div className="flex justify-between items-center mb-10">
                                <div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-tight">Vérification Historique</h3>
                                    <p className="text-xs text-slate-500 font-medium">Performance de l'Ensemble sur les tirages passés</p>
                                </div>
                                <button 
                                    onClick={runBacktest}
                                    disabled={backtesting}
                                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-2 disabled:opacity-50 transition-all active:scale-95 relative overflow-hidden"
                                >
                                    {backtesting && (
                                        <div 
                                            className="absolute left-0 top-0 bottom-0 bg-indigo-400/30 transition-all duration-300" 
                                            style={{ width: `${backtestProgress}%` }}
                                        />
                                    )}
                                    <div className="relative z-10 flex items-center gap-2">
                                        {backtesting ? <RefreshCw className="animate-spin" size={14}/> : <Zap size={14}/>}
                                        {backtesting ? `Analyse... ${backtestProgress}%` : 'Lancer Backtest'}
                                    </div>
                                </button>
                            </div>

                            <div className="space-y-6">
                                {backtest ? backtest.map((bt, i) => (
                                    <div key={i} className="bg-black/40 p-6 rounded-3xl border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
                                        <div className="text-center md:text-left">
                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{bt.drawDate}</div>
                                            <div className="text-sm font-black text-white uppercase">Tirage Réel</div>
                                            <div className="flex gap-2 mt-2">
                                                {bt.actualNumbers.map(n => (
                                                    <NumberBall key={n} number={n} size="xs" />
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-center">
                                            <div className={`text-2xl font-black ${bt.hits > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                                                {bt.hits} HIT{bt.hits > 1 ? 'S' : ''}
                                            </div>
                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Précision</div>
                                        </div>

                                        <div className="text-center md:text-right">
                                            <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Prédiction Ensemble</div>
                                            <div className="flex gap-2 mt-2 justify-center md:justify-end">
                                                {bt.predictedNumbers.map(n => (
                                                    <NumberBall 
                                                        key={n} 
                                                        number={n} 
                                                        size="xs" 
                                                        isAttractor={bt.actualNumbers.includes(n)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="py-20 text-center opacity-30">
                                        <Activity size={48} className="mx-auto mb-4" />
                                        <p className="text-xs font-black uppercase tracking-widest">Aucune donnée de backtest disponible</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
