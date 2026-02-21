
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { generatePlatinumPrediction, savePlatinumHistory, getPlatinumHistory } from '../../services/metaAnalystService';
import { saveTicket } from '../../services/userPreferencesService';
import { useNexus } from '../NexusProvider';
import type { PlatinumResult, PlatinumScenario } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { TicketXRay } from '../TicketXRay';
import { 
    Activity, Layers, Zap, Hexagon, 
    BarChart3, RefreshCw, Radio, 
    Fingerprint, MousePointer2, AlertCircle, Save
} from 'lucide-react';
import { 
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, 
    CartesianGrid, ReferenceLine, Cell, AreaChart, Area 
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

interface MetaAnalystTabProps {
    drawName: string;
}

const ScenarioCard: React.FC<{ 
    scenario: PlatinumScenario; 
    isSelected: boolean; 
    onClick: () => void;
    onSave: () => void;
}> = ({ scenario, isSelected, onClick, onSave }) => {
    return (
        <motion.div 
            layout
            onClick={onClick}
            whileHover={{ y: -4 }}
            className={`
                relative p-5 rounded-2xl border cursor-pointer overflow-hidden flex flex-col justify-between h-full transition-all duration-300
                ${isSelected 
                    ? 'bg-slate-800 border-white/20 shadow-2xl ring-1 ring-white/10' 
                    : 'bg-slate-900/50 border-white/5 hover:bg-slate-800/50 hover:border-white/10'
                }
            `}
        >
            {isSelected && (
                <div 
                    className="absolute top-0 left-0 w-full h-1" 
                    style={{ backgroundColor: scenario.color }}
                />
            )}
            
            <div>
                <div className="flex justify-between items-start mb-3">
                    <span 
                        className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md"
                        style={{ color: scenario.color, backgroundColor: `${scenario.color}15` }}
                    >
                        {scenario.risk} RISK
                    </span>
                    <span className="text-xs font-bold text-white">{scenario.probability}%</span>
                </div>

                <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">{scenario.name}</h3>
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed">{scenario.description}</p>
            </div>

            <div className="mt-6 space-y-4">
                <div className="flex justify-between gap-1">
                    {scenario.numbers.map(n => (
                        <NumberBall key={n} number={n} size="sm" />
                    ))}
                </div>
                
                {isSelected && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onSave(); }}
                        className="w-full py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                        style={{ backgroundColor: scenario.color }}
                    >
                        <Save size={12}/> Sauvegarder
                    </button>
                )}
            </div>
        </motion.div>
    );
};

export const MetaAnalystTab: React.FC<MetaAnalystTabProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { history, loading: nexusLoading, spectral, fractal, volatility, correlationMatrix, regularity, symbioticContext } = useNexus();
    
    const [result, setResult] = useState<PlatinumResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    const runAnalysis = async () => {
        if (history.length < 15) {
             showToast("Dataset insuffisant pour la convergence.", "error");
             return;
        }
        setLoading(true);
        
        try {
            // Simulation de temps de calcul (UX)
            await new Promise(r => setTimeout(r, 1500)); 

            const data = await generatePlatinumPrediction(
                drawName, 
                history, 
                { spectral, fractal, volatility }, // Inject pre-computed metrics
                null,
                symbioticContext
            );
            
            setResult(data);
            setSelectedScenarioId('alpha'); // Select Conservative by default
            savePlatinumHistory(data);
            showToast("Convergence Tensorielle atteinte.", "success");
        } catch (e: any) {
            showToast("Erreur Hyper-Convergence : " + e.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (scenario: PlatinumScenario) => {
        await saveTicket({
            numbers: scenario.numbers,
            drawName,
            strategy: `Platinum ${scenario.name}`
        });
        showToast("Vecteur sécurisé.", "success");
    };

    // Data for the Spectrum Chart
    const spectrumData = useMemo(() => {
        if (!result) return [];
        // Convert [0, ..., val, ...] to [{n: 1, v: val}, ...] skipping index 0
        return Array.from({ length: 90 }, (_, i) => ({
            n: i + 1,
            v: Math.round(result.consensusVector[i + 1])
        }));
    }, [result]);

    const selectedScenario = result?.scenarios.find(s => s.id === selectedScenarioId);

    if (nexusLoading || loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[500px] gap-8 animate-pulse">
                <div className="relative">
                    <div className="w-32 h-32 rounded-full border-t-4 border-indigo-500 animate-spin"></div>
                    <Hexagon className="absolute inset-0 m-auto text-indigo-500 animate-pulse" size={48} />
                </div>
                <div className="text-center">
                    <h3 className="text-xl font-black text-white uppercase tracking-widest">Hyper-Convergence</h3>
                    <p className="text-xs text-indigo-400 font-mono mt-2">Fusion des tenseurs probabilistes...</p>
                </div>
            </div>
        );
    }

    if (!result) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[500px] p-8 text-center bg-slate-900/50 rounded-[3rem] border border-white/5">
                <div className="p-6 bg-slate-900 rounded-full shadow-2xl mb-8 border border-white/5">
                    <Layers size={64} className="text-slate-500" />
                </div>
                <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter mb-4">
                    Nexus <span className="text-indigo-500">Platinum</span>
                </h2>
                <p className="text-slate-400 max-w-md text-sm font-medium leading-relaxed mb-10">
                    Activez le moteur de fusion tensorielle pour générer un spectre de probabilité unifié à partir de tous les modèles disponibles.
                </p>
                <button 
                    onClick={runAnalysis}
                    className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 transition-all active:scale-95 flex items-center gap-3 group"
                >
                    <Zap size={18} className="group-hover:text-yellow-300 transition-colors"/> Initialiser le Système
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-20 w-full overflow-hidden">
            
            {/* 1. MISSION CONTROL HEADER */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-900 p-4 rounded-3xl border border-white/5 flex flex-col justify-between">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Cohérence</span>
                    <div className="text-2xl font-black text-white flex items-center gap-2">
                        {result.coherence}% 
                        <Activity size={16} className={result.coherence > 80 ? 'text-emerald-500' : 'text-amber-500'}/>
                    </div>
                </div>
                <div className="bg-slate-900 p-4 rounded-3xl border border-white/5 flex flex-col justify-between">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Entropie</span>
                    <div className="text-2xl font-black text-white flex items-center gap-2">
                        {result.entropy.toFixed(2)}
                        <Radio size={16} className="text-indigo-500"/>
                    </div>
                </div>
                <div className="bg-slate-900 p-4 rounded-3xl border border-white/5 flex flex-col justify-between">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Régime</span>
                    <div className={`text-xl font-black uppercase ${result.regime === 'STABLE' ? 'text-emerald-400' : result.regime === 'CHAOTIC' ? 'text-rose-400' : 'text-amber-400'}`}>
                        {result.regime}
                    </div>
                </div>
                <button onClick={runAnalysis} className="bg-indigo-600 hover:bg-indigo-500 rounded-3xl flex flex-col items-center justify-center text-white transition-colors group">
                    <RefreshCw size={20} className="mb-1 group-hover:rotate-180 transition-transform duration-700"/>
                    <span className="text-[9px] font-black uppercase tracking-widest">Re-Scan</span>
                </button>
            </div>

            {/* 2. HYPER-SPECTRUM CHART (The main visual) */}
            <div className="bg-slate-900 p-6 md:p-8 rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="flex justify-between items-center mb-6 px-2">
                    <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-3">
                        <BarChart3 className="text-indigo-500" size={20} /> Spectre de Probabilité
                    </h3>
                    {hoveredIndex !== null && (
                        <div className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full animate-fade-in">
                            <span className="text-[10px] font-bold text-indigo-300">Vecteur {hoveredIndex}</span>
                            <span className="text-xs font-black text-white">{spectrumData[hoveredIndex-1]?.v}%</span>
                        </div>
                    )}
                </div>

                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={spectrumData} onMouseMove={(e) => { if (e.activeTooltipIndex !== undefined) setHoveredIndex(e.activeTooltipIndex + 1); }} onMouseLeave={() => setHoveredIndex(null)}>
                            <defs>
                                <linearGradient id="spectrumBar" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#818cf8" />
                                    <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.4} />
                                </linearGradient>
                            </defs>
                            <Tooltip />
                            <Bar dataKey="v" radius={[2, 2, 0, 0]} animationDuration={1500}>
                                {spectrumData.map((entry, index) => (
                                    <Cell 
                                        key={`cell-${index}`} 
                                        fill={selectedScenario?.numbers.includes(entry.n) ? selectedScenario.color : (entry.v > 50 ? '#818cf8' : '#334155')}
                                        className="transition-all duration-300"
                                    />
                                ))}
                            </Bar>
                            <ReferenceLine y={50} stroke="#334155" strokeDasharray="3 3" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                
                {/* X-Axis Labels (Simplified) */}
                <div className="flex justify-between text-[9px] font-mono text-slate-600 px-1 mt-2">
                    <span>1</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span><span>60</span><span>70</span><span>80</span><span>90</span>
                </div>
            </div>

            {/* 3. SCENARIO SELECTOR */}
            <div className="grid md:grid-cols-3 gap-6">
                {result.scenarios.map((scenario) => (
                    <ScenarioCard 
                        key={scenario.id}
                        scenario={scenario}
                        isSelected={selectedScenarioId === scenario.id}
                        onClick={() => setSelectedScenarioId(scenario.id)}
                        onSave={() => handleSave(scenario)}
                    />
                ))}
            </div>

            {/* 4. DEEP INSPECTION (Conditional) */}
            <AnimatePresence>
                {selectedScenario && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-xl">
                            <div className="flex items-center gap-3 mb-6">
                                <Fingerprint className="text-slate-400" size={20} />
                                <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">
                                    Rayon-X : {selectedScenario.name}
                                </h4>
                            </div>
                            
                            <TicketXRay 
                                numbers={selectedScenario.numbers} 
                                score={selectedScenario.probability} // Use prob as a proxy for score visual
                                showTitle={false}
                            />
                            
                            <div className="mt-6 flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
                                <AlertCircle size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                                    Ce scénario est optimisé pour un régime <strong>{result.regime}</strong>. 
                                    La cohérence globale est de {result.coherence}%.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
};
