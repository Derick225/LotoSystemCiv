import React, { useState, useEffect } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { 
    Brain, Cpu, Zap, Activity, Layers, 
    ShieldCheck, RefreshCw, Save, 
    ChevronRight, Info, AlertCircle,
    Network, Binary, Terminal, BarChart3, Target
} from 'lucide-react';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { runNeuralEnsemble, EnsembleResult } from '../../services/neuralEnsembleService';
import { generatePlatinumPrediction } from '../../services/metaAnalystService';
import { saveTicket } from '../../services/userPreferencesService';
import { savePredictionToHistory } from '../../services/predictionHistoryService';
import type { Prediction } from '../../types';
import { audioEngine } from '../../utils/audioEngine';
import { DRAW_SCHEDULE } from '../../constants';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export const PredictiveAnalyticsTab: React.FC = () => {
    const { showToast } = useToast();
    const history = useNexusStore(state => state.history);
    const drawName = useNexusStore(state => state.drawName);
    const setDrawName = useNexusStore(state => state.setDrawName);
    const refreshData = useNexusStore(state => state.refreshData);
    
    const [loading, setLoading] = useState(false);
    const [ensembleResult, setEnsembleResult] = useState<EnsembleResult | null>(null);
    const [platinumResult, setPlatinumResult] = useState<any | null>(null);
    const [activeView, setActiveView] = useState<'overview' | 'details'>('overview');

    const allDraws = React.useMemo(() => {
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
        setEnsembleResult(null);
        setPlatinumResult(null);
        await refreshData(newDraw);
    };

    const runSuperPrediction = async () => {
        audioEngine.play('click');
        if (history.length < 15) {
            showToast("Dataset insuffisant pour la Super Prédiction.", "error");
            audioEngine.play('error');
            return;
        }
        setLoading(true);
        audioEngine.play('scan');
        try {
            const ensembleData = await runNeuralEnsemble(drawName, history, {});
            const platinumData = await generatePlatinumPrediction(drawName, history, undefined, undefined, undefined, 'BALANCED');
            
            setEnsembleResult(ensembleData);
            setPlatinumResult(platinumData);
            
            showToast("Super Prédiction générée avec succès.", "success");
            audioEngine.play('success');
        } catch (e: any) {
            showToast("Erreur Super Prédiction : " + e.message, "error");
            audioEngine.play('error');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (numbers: number[], strategy: string) => {
        audioEngine.play('click');
        await saveTicket({
            numbers,
            drawName,
            strategy: `SuperPredictor: ${strategy}`
        });

        const predictionObj: Prediction = {
            suggestedNumbers: numbers,
            candidates: numbers,
            confidence: 85, // Arbitrary confidence
            analysis: `SuperPredictor: ${strategy}`,
            breakdown: {},
            timestamp: Date.now()
        };
        await savePredictionToHistory(drawName, predictionObj);

        showToast("Ticket sauvegardé et autopsié.", "success");
        audioEngine.play('success');
    };

    const renderDrawSelector = () => (
        <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-2xl border border-white/5 mb-8">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                    <Target size={20} className="text-indigo-400" />
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
                        <h3 className="text-2xl font-black text-white uppercase tracking-widest">Super Predictor</h3>
                        <p className="text-xs text-indigo-400 font-mono mt-2">Fusion des modèles prédictifs...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!ensembleResult || !platinumResult) {
        return (
            <div className="animate-fade-in">
                {renderDrawSelector()}
                <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-slate-900/50 rounded-[3rem] border border-white/5">
                    <div className="p-8 bg-slate-900 rounded-full shadow-2xl mb-8 border border-white/5">
                        <BarChart3 size={80} className="text-indigo-500" />
                    </div>
                    <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter mb-4">
                        Super <span className="text-indigo-500">Predictor</span>
                    </h2>
                    <p className="text-slate-400 max-w-lg text-sm font-medium leading-relaxed mb-10">
                        Combinez la puissance du Neural Ensemble et de l'analyse Platinum Elite pour obtenir les prédictions les plus fiables.
                    </p>
                    <button 
                        onClick={runSuperPrediction}
                        className="px-12 py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all active:scale-95 flex items-center gap-4 group"
                    >
                        <Zap size={20} className="group-hover:text-yellow-300 transition-colors"/> Lancer la Super Prédiction
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {renderDrawSelector()}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Consensus Neural Ensemble */}
                <div className="bg-slate-900/80 backdrop-blur-md p-6 rounded-[2rem] border border-indigo-500/20 shadow-2xl">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
                                <Network className="w-6 h-6 text-indigo-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white uppercase tracking-widest">Consensus Neural</h3>
                                <p className="text-xs text-slate-400">Fusion de 5 agents spécialisés</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-black text-white">{ensembleResult.confidence}%</div>
                            <div className="text-[10px] text-indigo-400 uppercase tracking-widest">Confiance</div>
                        </div>
                    </div>
                    <div className="flex justify-center gap-2 mb-6">
                        {ensembleResult.consensus.map((n: number, i: number) => (
                            <NumberBall key={i} number={n} />
                        ))}
                    </div>
                    <button 
                        onClick={() => handleSave(ensembleResult.consensus, 'Consensus Neural')}
                        className="w-full py-3 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded-xl font-black text-xs uppercase tracking-widest border border-indigo-500/30 transition-all flex items-center justify-center gap-2"
                    >
                        <Save size={16} /> Sauvegarder ce ticket
                    </button>
                </div>

                {/* Platinum Elite Scenarios */}
                {platinumResult.scenarios && platinumResult.scenarios.map((scenario: any, index: number) => (
                    <div key={index} className="bg-slate-900/80 backdrop-blur-md p-6 rounded-[2rem] border shadow-2xl" style={{ borderColor: `${scenario.color}30` }}>
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-3 rounded-xl border" style={{ backgroundColor: `${scenario.color}20`, borderColor: `${scenario.color}30` }}>
                                    <ShieldCheck className="w-6 h-6" style={{ color: scenario.color }} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-white uppercase tracking-widest">{scenario.name}</h3>
                                    <p className="text-xs text-slate-400">{scenario.description}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-black text-white">{scenario.probability}%</div>
                                <div className="text-[10px] uppercase tracking-widest" style={{ color: scenario.color }}>Probabilité</div>
                            </div>
                        </div>
                        <div className="flex justify-center gap-2 mb-6">
                            {scenario.numbers.map((n: number, i: number) => (
                                <NumberBall key={i} number={n} />
                            ))}
                        </div>
                        <button 
                            onClick={() => handleSave(scenario.numbers, scenario.name)}
                            className="w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest border transition-all flex items-center justify-center gap-2"
                            style={{ backgroundColor: `${scenario.color}20`, color: scenario.color, borderColor: `${scenario.color}30` }}
                        >
                            <Save size={16} /> Sauvegarder ce ticket
                        </button>
                    </div>
                ))}
            </div>

            {/* Platinum Meta Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Régime Stochastique</span>
                    <span className="text-sm font-bold text-white uppercase">{platinumResult.regime}</span>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Entropie du Système</span>
                    <span className="text-sm font-bold text-white uppercase">{platinumResult.entropy.toFixed(4)}</span>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Agents Neural</span>
                    <span className="text-sm font-bold text-white uppercase">{ensembleResult.agents.length} Actifs</span>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Confiance Globale</span>
                    <span className="text-sm font-bold text-white uppercase">{ensembleResult.confidence}%</span>
                </div>
            </div>

            {/* Insights */}
            <div className="bg-slate-900/50 p-6 rounded-[2rem] border border-white/5">
                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Activity size={18} className="text-indigo-400" /> Insights Prédictifs
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    {ensembleResult.agents.slice(0, 3).map((agent: any, idx: number) => (
                        <div key={idx} className="bg-slate-800/50 p-4 rounded-xl border border-white/5">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-white uppercase tracking-wider">{agent.name}</span>
                                <span className="text-[10px] text-indigo-400 font-mono">{agent.confidence}% conf.</span>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-3">
                                {agent.prediction.suggestedNumbers.slice(0, 5).map((n: number, i: number) => (
                                    <div key={i} className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white">
                                        {n}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <BarChart3 size={18} className="text-emerald-400" /> Vecteur de Consensus (Platinum)
                </h3>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={platinumResult.consensusVector.map((val: number, i: number) => ({ number: i + 1, value: val }))}>
                            <defs>
                                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                            <XAxis dataKey="number" stroke="#ffffff50" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis stroke="#ffffff50" fontSize={10} tickLine={false} axisLine={false} hide />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff20', borderRadius: '12px' }}
                                itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
                                labelStyle={{ color: '#94a3b8', fontSize: '12px' }}
                                formatter={(value: number) => [value.toFixed(4), 'Probabilité']}
                                labelFormatter={(label) => `Numéro ${label}`}
                            />
                            <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
