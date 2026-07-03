
import React from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { Activity, X, ArrowRight, Zap, Target, Signal, AlertTriangle, Layers } from 'lucide-react';
import { getNumberColor } from '../../constants';
import { audioEngine } from '../../utils/audioEngine';
import { motion, AnimatePresence } from 'framer-motion';
import { detectForcedSymmetry } from '../../services/mathService';

export const GlobalNumberHUD: React.FC = () => {
    const hoveredNumber = useNexusStore(state => state.hoveredNumber);
    const setHoveredNumber = useNexusStore(state => state.setHoveredNumber);
    const setInspectingNumber = useNexusStore(state => state.setInspectingNumber);
    const stats = useNexusStore(state => state.stats);
    const gaps = useNexusStore(state => state.gaps);
    const spectral = useNexusStore(state => state.spectral);
    const history = useNexusStore(state => state.history);
    const lastPrediction = useNexusStore(state => state.lastPrediction);

    // Récupération instantanée des données depuis le contexte
    const numStat = stats.find(s => s.number === hoveredNumber);
    const numGap = gaps.find(g => g.number === hoveredNumber);
    const numSpec = spectral.find(s => s.number === hoveredNumber);

    const freq = numStat ? numStat.count : 0;
    const gap = numGap ? numGap.gap : 0;
    const energy = numSpec ? numSpec.energy : 0;

    // Détermination de l'état
    let status = 'Neutre';
    let statusColor = 'text-slate-400';
    let gradient = 'from-slate-500/20 to-slate-900/5';
    
    if (energy > 80 && gap < 10) { 
        status = 'BOUILLANT'; 
        statusColor = 'text-rose-500'; 
        gradient = 'from-rose-500/30 to-purple-900/10';
    } else if (gap > 25) { 
        status = 'DORMEUR'; 
        statusColor = 'text-indigo-400'; 
        gradient = 'from-indigo-500/30 to-slate-900/10';
    } else if (freq > 10) { 
        status = 'FRÉQUENT'; 
        statusColor = 'text-emerald-400'; 
        gradient = 'from-emerald-500/30 to-teal-900/10';
    } else if (energy > 50) {
        status = 'EN CHAUFFE';
        statusColor = 'text-orange-400';
        gradient = 'from-orange-500/20 to-red-900/5';
    }

    // Diagnostic mathématique de Symétrie Forcée
    const symmetryAnalysis = React.useMemo(() => {
        if (!hoveredNumber) return null;

        const getDigitMirror = (x: number): number => {
            if (x < 10) return x * 10;
            if (x % 10 === 0) return Math.floor(x / 10);
            return (x % 10) * 10 + Math.floor(x / 10);
        };

        const mirrorTarget = getDigitMirror(hoveredNumber);

        // Tirage contextuel : prédiction active ou dernier tirage historique
        const activeTirage = lastPrediction?.suggestedNumbers && lastPrediction.suggestedNumbers.length > 0 
            ? lastPrediction.suggestedNumbers 
            : (history && history.length > 0 ? history[0].gagnants : []);

        const isPredictionMode = !!(lastPrediction?.suggestedNumbers && lastPrediction.suggestedNumbers.length > 0);

        // Analyse complète de symétrie sur ce tirage
        const analysis = detectForcedSymmetry(activeTirage, history);

        // Relations spécifiques du numéro survolé avec le tirage actif
        const neighbors = activeTirage.filter(n => Math.abs(n - hoveredNumber) === 1);
        const sameEndings = activeTirage.filter(n => n !== hoveredNumber && n % 10 === hoveredNumber % 10);
        const digitMirrors = activeTirage.filter(n => n !== hoveredNumber && getDigitMirror(n) === hoveredNumber);
        const centerMirrors = activeTirage.filter(n => n !== hoveredNumber && n + hoveredNumber === 91);

        return {
            analysis,
            isPredictionMode,
            hasSelfRelations: neighbors.length > 0 || sameEndings.length > 0 || digitMirrors.length > 0 || centerMirrors.length > 0,
            relations: {
                neighbors,
                sameEndings,
                digitMirrors,
                centerMirrors
            },
            mirrorTarget,
            tirageName: isPredictionMode ? "Prédiction Active" : "Dernier Tirage (Historique)"
        };
    }, [hoveredNumber, lastPrediction, history]);

    const handleClose = () => {
        audioEngine.play('click');
        setHoveredNumber(null);
    };

    const handleDeepScan = (e: React.MouseEvent) => {
        e.stopPropagation();
        audioEngine.play('click');
        setInspectingNumber(hoveredNumber);
        setHoveredNumber(null);
    };

    return (
        <AnimatePresence>
            {hoveredNumber && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm"
                    onClick={handleClose}
                >
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="glass-card neural-border rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col items-center gap-6 min-w-[280px] max-w-sm w-full relative overflow-hidden pointer-events-auto"
                        onClick={(e) => e.stopPropagation()} 
                    >
                        {/* Background FX Glow */}
                        <div className={`absolute top-0 inset-x-0 h-48 bg-gradient-to-b ${gradient} opacity-50 pointer-events-none`}></div>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

                        {/* Close Button */}
                        <button 
                            onClick={handleClose}
                            className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors z-20"
                        >
                            <X size={18} />
                        </button>

                        {/* Boule Visuelle */}
                        <motion.div 
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", delay: 0.1 }}
                            className={`w-28 h-28 rounded-full flex items-center justify-center font-black text-6xl text-white shadow-[0_0_40px_rgba(255,255,255,0.1)] ring-4 ring-white/5 relative z-10 ${getNumberColor(hoveredNumber)}`}
                        >
                            <span className="drop-shadow-md">{hoveredNumber}</span>
                            
                            {/* Inner glow / Ping */}
                            {status === 'BOUILLANT' && (
                                <span className="absolute inset-0 rounded-full ring-4 ring-rose-500/50 animate-ping opacity-20"></span>
                            )}
                        </motion.div>

                        <div className="w-full space-y-5 relative z-10">
                            {/* Header Status */}
                            <div className="flex justify-between items-center border-b border-white/10 pb-3">
                                <span className={`text-[11px] font-black uppercase tracking-widest ${statusColor} flex items-center gap-2 bg-white/5 px-3 py-1 rounded-full`}>
                                    <Activity size={14} className={status === 'BOUILLANT' ? 'animate-pulse' : ''} /> {status}
                                </span>
                                <span className="text-[10px] font-mono text-slate-400 bg-black/30 px-2 py-1 rounded-md">
                                    ID: #{hoveredNumber.toString().padStart(2, '0')}
                                </span>
                            </div>

                            {/* Metrics Grid */}
                            <div className="grid grid-cols-3 gap-3 text-center">
                                {/* Frequency */}
                                <div className="flex flex-col items-center justify-between p-3 bg-gradient-to-b from-white/10 to-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                                    <span className="text-xs font-bold text-slate-400 uppercase mb-2 flex flex-col items-center gap-1">
                                        <Target size={12} className="text-emerald-400/70" />
                                        Sorties
                                    </span>
                                    <span className="text-2xl font-black text-white">
                                        {freq}
                                    </span>
                                    {/* Mini gauge */}
                                    <div className="w-full h-1 bg-black/40 rounded-full mt-2 overflow-hidden">
                                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (freq / 15) * 100)}%` }}></div>
                                    </div>
                                </div>

                                {/* Gap */}
                                <div className="flex flex-col items-center justify-between p-3 bg-gradient-to-b from-white/10 to-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                                    <span className="text-xs font-bold text-slate-400 uppercase mb-2 flex flex-col items-center gap-1">
                                        <Activity size={12} className="text-indigo-400/70" />
                                        Écart
                                    </span>
                                    <span className="text-2xl font-black text-white">
                                        {gap}
                                    </span>
                                    <div className="w-full h-1 bg-black/40 rounded-full mt-2 overflow-hidden flex transform -scale-x-100">
                                        {/* Reverse gauge: small gap is full width, large gap is low width */}
                                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.max(0, 100 - (gap / 30) * 100)}%` }}></div>
                                    </div>
                                </div>

                                {/* Energy */}
                                <div className="flex flex-col items-center justify-between p-3 bg-gradient-to-b from-white/10 to-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                                    <span className="text-xs font-bold text-slate-400 uppercase mb-2 flex flex-col items-center gap-1">
                                        <Zap size={12} className={`${energy > 70 ? 'text-rose-400/70' : 'text-amber-400/70'}`} />
                                        Énergie
                                    </span>
                                    <span className={`text-2xl font-black ${energy > 70 ? 'text-rose-400' : energy > 40 ? 'text-amber-400' : 'text-white'}`}>
                                        {Math.round(energy)}
                                    </span>
                                    <div className="w-full h-1 bg-black/40 rounded-full mt-2 overflow-hidden">
                                        <div className={`h-full rounded-full ${energy > 70 ? 'bg-rose-500' : energy > 40 ? 'bg-amber-500' : 'bg-slate-500'}`} style={{ width: `${Math.min(100, energy)}%` }}></div>
                                    </div>
                                </div>
                            </div>

                            {/* Panel d'Analyse de Symétrie Forcée */}
                            {symmetryAnalysis && (
                                <div className="space-y-2.5 p-3.5 bg-slate-950/40 border border-white/5 rounded-2xl relative overflow-hidden">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-1.5">
                                            <Layers size={12} className="text-indigo-400" />
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tension de Symétrie</span>
                                        </div>
                                        <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">{symmetryAnalysis.tirageName}</span>
                                    </div>

                                    {/* Indicator Gauge */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="font-medium text-slate-400">Index Stochastique</span>
                                            <span className={`font-mono font-black ${symmetryAnalysis.analysis.isAnomalous ? 'text-rose-400' : 'text-indigo-400'}`}>
                                                {symmetryAnalysis.analysis.tensionIndex}%
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden relative">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-500 ${symmetryAnalysis.analysis.isAnomalous ? 'bg-gradient-to-r from-orange-500 to-rose-500 animate-pulse' : 'bg-gradient-to-r from-indigo-500 to-violet-500'}`}
                                                style={{ width: `${symmetryAnalysis.analysis.tensionIndex}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Critical Danger Alert Notification */}
                                    {symmetryAnalysis.analysis.isAnomalous && (
                                        <motion.div 
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="flex gap-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[10px] text-rose-300 leading-normal"
                                        >
                                            <AlertTriangle size={14} className="text-rose-400 shrink-0 self-start mt-0.5 animate-pulse" />
                                            <div>
                                                <span className="font-black uppercase tracking-wide block text-[8px] text-rose-400 mb-0.5">⚠️ ALERTE STRUCTURELLE : SYMÉTRIE FORCÉE</span>
                                                Le tirage actif exhibe des configurations symétriques non-naturelles. Risque d'attracteur stochastique focalisé.
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Relations for Hovered Number */}
                                    <div className="space-y-1.5 pt-2 border-t border-white/5">
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Affinités du #{hoveredNumber} :</span>
                                        
                                        {!symmetryAnalysis.hasSelfRelations ? (
                                            <span className="text-[10px] text-slate-400 block italic">Aucune liaison symétrique active dans le tirage.</span>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-2 text-[9px]">
                                                {symmetryAnalysis.relations.neighbors.length > 0 && (
                                                    <div className="bg-white/[0.02] p-1.5 rounded-lg border border-white/5">
                                                        <span className="text-indigo-300 block font-semibold leading-none mb-0.5">Voisinage direct</span>
                                                        <span className="text-white font-mono">{symmetryAnalysis.relations.neighbors.join(', ')}</span>
                                                    </div>
                                                )}
                                                {symmetryAnalysis.relations.sameEndings.length > 0 && (
                                                    <div className="bg-white/[0.02] p-1.5 rounded-lg border border-white/5">
                                                        <span className="text-emerald-300 block font-semibold leading-none mb-0.5">Même finale</span>
                                                        <span className="text-white font-mono">{symmetryAnalysis.relations.sameEndings.join(', ')}</span>
                                                    </div>
                                                )}
                                                {symmetryAnalysis.relations.digitMirrors.length > 0 && (
                                                    <div className="bg-amber-500/5 p-1.5 rounded-lg border border-amber-500/15">
                                                        <span className="text-amber-300 block font-semibold leading-none mb-0.5">Miroir Chiffre</span>
                                                        <span className="text-white font-mono">{symmetryAnalysis.relations.digitMirrors.join(', ')}</span>
                                                    </div>
                                                )}
                                                {symmetryAnalysis.relations.centerMirrors.length > 0 && (
                                                    <div className="bg-purple-500/5 p-1.5 rounded-lg border border-purple-500/15">
                                                        <span className="text-purple-300 block font-semibold leading-none mb-0.5">Iso-Centre</span>
                                                        <span className="text-white font-mono">{symmetryAnalysis.relations.centerMirrors.join(', ')}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Deep Scan Action */}
                            <motion.button 
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleDeepScan}
                                className="w-full py-4 mt-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all group relative overflow-hidden"
                            >
                                <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer"></span>
                                <Signal size={16} className="text-white/80" /> 
                                Analyse Profonde
                                <ArrowRight size={16} className="group-hover:translate-x-1 group-hover:text-white transition-all text-white/50" />
                            </motion.button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
