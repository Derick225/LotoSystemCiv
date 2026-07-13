import React, { useState, useEffect, useMemo } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { generateMasterPrediction } from '../../services/prediction/predictionFacade';
import { Prediction, AlgoWeights } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { NumberBall } from '../NumberBall';
import { Sliders, Save, Cpu, ShieldAlert, BarChart2 } from 'lucide-react';
import { debounce } from 'lodash';
import { useToast } from '../ui/Toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { audioEngine } from '../../utils/audioEngine';
import { useAlgorithmSync } from '../../hooks/useAlgorithmSync';
import { AlgoRadar } from '../AlgoRadar';

export const WhatIfSimulatorTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const history = useNexusStore(state => state.history);
    const { weights: globalWeights, labels: LABELS } = useAlgorithmSync();
    const temporalDepth = useNexusStore(state => state.temporalDepth);
    const [customWeights, setCustomWeights] = useState<AlgoWeights>(globalWeights);
    const [prediction, setPrediction] = useState<Prediction | null>(null);
    const [isSimulating, setIsSimulating] = useState(false);
    const { showToast } = useToast();

    // Scenarios (local state, could be moved to store/localStorage later)
    const [scenarios, setScenarios] = useState<Record<string, AlgoWeights>>({});

    useEffect(() => {
        setCustomWeights(globalWeights);
    }, [globalWeights]);

    const runSimulation = async (weights: AlgoWeights) => {
        setIsSimulating(true);
        try {
            const pred = await generateMasterPrediction(
                drawName,
                history,
                temporalDepth,
                weights,
                undefined,
                undefined,
                true // skipTraining
            );
            setPrediction(pred);
        } catch (error) {
            console.error("Simulation error:", error);
            showToast("Erreur lors de la simulation", "error");
        } finally {
            setIsSimulating(false);
        }
    };

    // Debounced runner for smooth slider changes
    const debouncedRunSimulation = useMemo(
        () => debounce((w: AlgoWeights) => runSimulation(w), 300),
        [drawName, history, temporalDepth]
    );

    const handleWeightChange = (key: string, value: number) => {
        const newWeights = { ...customWeights, [key]: value };
        setCustomWeights(newWeights);
        debouncedRunSimulation(newWeights);
    };

    const handleSaveScenario = (name: string) => {
        if (!name) return;
        setScenarios(prev => ({ ...prev, [name]: customWeights }));
        showToast(`Scénario "${name}" sauvegardé`, "success");
        audioEngine.play('success');
    };

    const handleLoadScenario = (name: string) => {
        const w = scenarios[name];
        if (w) {
            setCustomWeights(w);
            runSimulation(w);
        }
    };

    const chartData = useMemo(() => {
        if (!prediction) return [];
        return prediction.candidates.slice(0, 10).map((num, i) => ({
            num,
            score: 100 - i * 5, // Approximate score for display
        }));
    }, [prediction]);

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                        <Sliders className="text-indigo-500" />
                        Simulateur What-If Continue
                    </h2>
                    <p className="text-sm text-slate-500">Expérimentation déterministe avec feedback instantané</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => handleSaveScenario('Stable')} className="px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 flex items-center gap-1">
                        <Save size={14} /> Sauver Stable
                    </button>
                    <button onClick={() => handleSaveScenario('Chaotique')} className="px-3 py-1.5 text-xs font-semibold bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 flex items-center gap-1">
                        <Save size={14} /> Sauver Chaotique
                    </button>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-6">
                {/* Sliders Area */}
                <div className="lg:col-span-4 space-y-4 bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
                    <h3 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-4">
                        <Cpu size={16} className="text-indigo-400" /> Ajustement des Poids (Hyper-paramètres)
                    </h3>
                    
                    <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                        {[
                            {
                                name: "Fréquentiel & Transition",
                                keys: [AlgoKey.FREQUENCY, AlgoKey.MARKOV, AlgoKey.BAYES, AlgoKey.GAPS, AlgoKey.MOMENTUM, AlgoKey.GAP_SEQUENCE, AlgoKey.GAP_PATTERN, AlgoKey.SEQUENCE_PATTERN, AlgoKey.GAP_CADENCE, AlgoKey.GAP_TREND]
                            },
                            {
                                name: "Mathématique & Structural",
                                keys: [AlgoKey.SPECTRAL, AlgoKey.FRACTAL, AlgoKey.TEMPORAL, AlgoKey.SHADOW_PROBABILITY]
                            },
                            {
                                name: "Dynamiques Avancées",
                                keys: [AlgoKey.SPATIAL, AlgoKey.AFFINITY, AlgoKey.NETWORK_CORRELATION, AlgoKey.ECHO_STATE, AlgoKey.DERIVED_NEIGHBOR]
                            }
                        ].map((cat) => (
                            <div key={cat.name} className="space-y-4 border-b border-slate-100 dark:border-slate-700/50 pb-4 last:border-0 last:pb-0">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">{cat.name}</h4>
                                <div className="space-y-4">
                                    {cat.keys.map((key) => {
                                        const val = customWeights[key] || 0;
                                        const label = LABELS[key] || key;
                                        return (
                                            <div key={key} className="space-y-1">
                                                <div className="flex justify-between text-xs font-medium">
                                                    <span className="text-slate-700 dark:text-slate-300 font-semibold">{label}</span>
                                                    <span className="text-indigo-600 dark:text-indigo-400">{(val * 100).toFixed(1)}%</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="0" max="1" step="0.01" 
                                                    value={val} 
                                                    onChange={(e) => handleWeightChange(key, parseFloat(e.target.value))}
                                                    className="w-full accent-indigo-500"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {Object.keys(scenarios).length > 0 && (
                        <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-700">
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Scénarios Sauvegardés</h4>
                            <div className="flex flex-wrap gap-2">
                                {Object.keys(scenarios).map(sc => (
                                    <button 
                                        key={sc}
                                        onClick={() => handleLoadScenario(sc)}
                                        className="px-3 py-1 text-xs font-medium rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
                                    >
                                        {sc}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Live Preview Area */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                        {isSimulating && (
                            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10 flex items-center justify-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                            </div>
                        )}
                        <h3 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-6">
                            <BarChart2 size={16} className="text-emerald-400" /> Top 10 Candidats - Impact Live
                        </h3>
                        
                        {!prediction ? (
                            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                                Modifiez un slider pour lancer la simulation
                            </div>
                        ) : (
                            <div className="space-y-8">
                                <div className="flex flex-wrap gap-4 justify-center">
                                    {prediction.suggestedNumbers.map(n => (
                                        <NumberBall key={n} number={n} size="lg" isAttractor={true} />
                                    ))}
                                </div>
                                <div className="h-64 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={prediction.candidates.slice(0, 10).map((n, i) => ({ num: n, score: 100 - i * 5 }))} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                                            <XAxis dataKey="num" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                            <Tooltip cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }} contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#1e293b', color: '#fff' }} />
                                            <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                                                {chartData.map((data) => (
                                                    <Cell key={data.num} fill={prediction.suggestedNumbers.includes(data.num) ? '#10b981' : '#818cf8'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="bg-indigo-50 dark:bg-indigo-900/10 p-4 rounded-xl text-sm text-indigo-800 dark:text-indigo-300 flex items-start gap-3">
                                    <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                                    <p>Stabilité Stochastique évaluée à {prediction.stabilityScore}%. Diversité: {(prediction.diversityMetrics?.diversityScore || 0).toFixed(2)}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Dynamic Algorithm Radar Comparison Widget */}
                    <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-2 mb-2">
                            <Cpu size={16} className="text-indigo-400" />
                            <h3 className="font-bold text-slate-700 dark:text-slate-300">
                                Comparaison de l'Empreinte ADN (Simulé vs Global)
                            </h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                            Ce widget compare dynamiquement la configuration simulée ("Optimisé IA") ajustée par vos curseurs de gauche avec l'empreinte de base ("Standard") configurée au niveau de l'ADN Global de l'application.
                        </p>
                        <div className="h-72">
                            <AlgoRadar weights={customWeights} previousWeights={globalWeights} height={280} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
