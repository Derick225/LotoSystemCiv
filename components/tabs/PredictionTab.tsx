
import React, { useState, useCallback } from 'react';
import { useNexus } from '../NexusProvider';
import { generateMasterPrediction } from '../../services/predictionEngine';
import { savePredictionToHistory } from '../../services/predictionHistoryService';
import { saveTicket } from '../../services/userPreferencesService';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { NeuralHeatmapGrid } from '../NeuralHeatmapGrid';
import { ReliabilityMeter } from '../ReliabilityMeter';
import { 
    Zap, Cpu, Activity, Info, ShieldCheck, 
    Layers, Binary, Target, RefreshCw, Wallet, 
    Save, Wind, AlertTriangle, TrendingUp,
    MapPin, GitMerge
} from 'lucide-react';
import { motion } from 'framer-motion';

export const PredictionTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { showToast } = useToast();
    const { 
        history, lastPrediction, setLastPrediction, loading: nexusLoading,
        globalWeights, spectral, wavelet, correlationMatrix, regularity, 
        calibration, volatility, regime, symbioticContext
    } = useNexus();

    const [isComputing, setIsComputing] = useState(false);

    const runInference = useCallback(async () => {
        if (history.length < 15) {
            showToast("Historique insuffisant pour l'Oracle Base.", "error");
            return;
        }
        setIsComputing(true);
        // Simulation d'un temps de calcul pour l'effet "Deep Thought"
        setTimeout(async () => {
            try {
                const res = await generateMasterPrediction(drawName, history, globalWeights, {
                    spectral, wavelet, correlationMatrix, regularity
                }, symbioticContext || undefined);
                
                setLastPrediction(res);
                await savePredictionToHistory(drawName, res);
                showToast("Convergence vectorielle établie.", "success");
            } catch (e) {
                showToast("Erreur lors de l'inférence.", "error");
            } finally {
                setIsComputing(false);
            }
        }, 800);
    }, [drawName, history, globalWeights, spectral, wavelet, correlationMatrix, regularity, symbioticContext, setLastPrediction, showToast]);

    const handleQuickSave = async () => {
        if (!lastPrediction) return;
        await saveTicket({
            numbers: lastPrediction.suggestedNumbers,
            drawName,
            strategy: `Oracle Base (${lastPrediction.confidence}%)`
        });
        showToast("Ticket sécurisé dans le Portefeuille.", "success");
    };

    if (nexusLoading) return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
            <Cpu className="text-indigo-500 animate-spin" size={48} />
            <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Synchronisation du Noyau...</p>
        </div>
    );

    // Écran d'accueil si pas de prédiction
    if (!lastPrediction && !isComputing) return (
        <div className="flex flex-col items-center justify-center min-h-[500px] bg-slate-900/50 rounded-[3rem] border border-white/5 animate-fade-in relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50"></div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.1),transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
            
            <div className="relative z-10 flex flex-col items-center">
                <div className="w-24 h-24 bg-slate-900 rounded-3xl flex items-center justify-center shadow-2xl border border-slate-800 mb-8 group-hover:scale-110 transition-transform duration-500">
                    <Target size={48} className="text-indigo-500" />
                </div>
                <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">Oracle Base v17.0</h3>
                <p className="text-slate-400 text-sm font-medium mb-10 max-w-md text-center leading-relaxed">
                    Moteur Symbiotique. Fusionne l'analyse fréquentielle, la topologie spatiale et la résonance orchestrale pour un ciblage vectoriel ultra-précis.
                </p>
                <button 
                    onClick={runInference}
                    className="px-12 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs shadow-2xl shadow-indigo-600/30 flex items-center gap-4 transition-all active:scale-95"
                >
                    <Zap fill="currentColor" size={16} /> Initialiser le Calcul
                </button>
            </div>
        </div>
    );

    const getRegimeIcon = () => {
        if (volatility?.score && volatility.score > 60) return <AlertTriangle className="text-rose-500" />;
        if (regime?.hurst && regime.hurst > 0.6) return <TrendingUp className="text-emerald-500" />;
        return <Activity className="text-indigo-500" />;
    };

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Context HUD */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 flex items-center gap-4 shadow-lg">
                    <div className="p-3 bg-slate-800 rounded-xl">{getRegimeIcon()}</div>
                    <div>
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Régime Flux</div>
                        <div className="text-white font-bold">{regime?.regime || 'Analyse...'}</div>
                    </div>
                </div>
                <div className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 flex items-center gap-4 shadow-lg">
                    <div className="p-3 bg-slate-800 rounded-xl text-amber-500"><Wind size={20} /></div>
                    <div>
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Volatilité</div>
                        <div className="text-white font-bold">{volatility?.score || 0}% / 100</div>
                    </div>
                </div>
                <div className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 flex items-center gap-4 shadow-lg">
                    <div className="p-3 bg-slate-800 rounded-xl text-emerald-500"><ShieldCheck size={20} /></div>
                    <div>
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Confiance IA</div>
                        <div className="text-white font-bold">{lastPrediction?.confidence || 0}%</div>
                    </div>
                </div>
            </div>

            {/* Main Result Card */}
            <div className="bg-slate-950 p-8 md:p-10 rounded-[3.5rem] border border-indigo-500/20 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Target size={180} /></div>
                
                {isComputing ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-6">
                        <RefreshCw className="animate-spin text-indigo-500" size={48} />
                        <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Convergence des vecteurs...</p>
                    </div>
                ) : (
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-none mb-2">
                                    Vecteur <span className="text-indigo-500">Symbiotique</span>
                                </h2>
                                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                    <GitMerge size={12}/> Fusion tensorielle active {lastPrediction?.symbiosisFactor ? `(Boost x${lastPrediction.symbiosisFactor})` : ''}
                                </p>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-black bg-white/10 px-3 py-1 rounded-full text-slate-300 uppercase border border-white/10">
                                    Build 17.0
                                </span>
                            </div>
                        </div>

                        {/* Les Boules avec Badge Symbiotique */}
                        <div className="grid grid-cols-5 gap-2 md:gap-4 mb-10">
                            {lastPrediction?.suggestedNumbers.map((n, i) => {
                                const bd = lastPrediction.breakdown?.[n];
                                // Détection des facteurs symbiotiques
                                const isSpatialHot = symbioticContext?.spatialHotZones.includes(n);
                                const isOrchestrated = symbioticContext?.orchestrationBoosts[n] !== undefined;
                                
                                return (
                                    <motion.div 
                                        key={n} 
                                        initial={{ scale: 0, y: 20 }} 
                                        animate={{ scale: 1, y: 0 }} 
                                        transition={{ delay: i * 0.1, type: 'spring' }}
                                        className="flex flex-col items-center gap-3"
                                    >
                                        <div className="relative">
                                            <NumberBall number={n} size="lg" isAttractor={i < 2} />
                                            {/* Badges Symbiotiques */}
                                            {isSpatialHot && <div className="absolute -top-1 -right-1 bg-emerald-500 text-white rounded-full p-1 border-2 border-slate-950" title="Zone Chaude Spatiale"><MapPin size={8} fill="currentColor"/></div>}
                                            {isOrchestrated && <div className="absolute -bottom-1 -left-1 bg-indigo-500 text-white rounded-full p-1 border-2 border-slate-950" title="Boost Orchestration"><Binary size={8}/></div>}
                                        </div>
                                        
                                        {/* Mini DNA Bar */}
                                        <div className="flex gap-0.5 h-1 w-8 md:w-12 bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500" style={{ width: `${(bd?.frequency || 0)}%` }} title="Fréquence"></div>
                                            <div className="h-full bg-amber-500" style={{ width: `${(bd?.gap || 0)}%` }} title="Écart"></div>
                                            <div className="h-full bg-indigo-500" style={{ width: `${(bd?.spectral || 0)}%` }} title="Spectral"></div>
                                        </div>
                                        <span className="text-[8px] font-black text-slate-500 uppercase">
                                            {(bd?.frequency || 0) > (bd?.gap || 0) ? 'FREQ' : 'GAP'}
                                        </span>
                                    </motion.div>
                                );
                            })}
                        </div>
                        
                        <div className="flex gap-4">
                            <button 
                                onClick={handleQuickSave}
                                className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95"
                            >
                                <Save size={16} /> Sauvegarder
                            </button>
                            <button 
                                onClick={runInference}
                                className="p-4 bg-slate-800 text-slate-400 rounded-2xl hover:text-white hover:bg-slate-700 transition-colors"
                            >
                                <RefreshCw size={18} />
                            </button>
                        </div>

                        <div className="mt-8 bg-black/30 p-6 rounded-2xl border border-white/5 backdrop-blur-md">
                            <div className="flex items-start gap-3">
                                <Info className="text-indigo-400 shrink-0 mt-1" size={16} />
                                <p className="text-slate-300 text-xs leading-relaxed font-medium">
                                    "{lastPrediction?.analysis}"
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 space-y-6">
                    <div className="flex items-center gap-3 px-4">
                        <Layers className="text-indigo-500" />
                        <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Matrice de Convergence</h3>
                    </div>
                    {/* Heatmap Grid */}
                    <NeuralHeatmapGrid breakdown={lastPrediction?.breakdown} suggestedNumbers={lastPrediction?.suggestedNumbers || []} />
                </div>

                <div className="lg:col-span-4 space-y-6">
                    {calibration && <ReliabilityMeter calibration={calibration} />}
                    
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Binary size={14} /> Alternatives
                        </h4>
                        <div className="flex flex-wrap gap-3 justify-center">
                            {lastPrediction?.candidates.slice(0, 8).map(n => (
                                <NumberBall key={n} number={n} size="sm" />
                            ))}
                        </div>
                        <p className="text-center text-[9px] text-slate-400 mt-6 font-bold uppercase tracking-widest">
                            Vecteurs secondaires
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
