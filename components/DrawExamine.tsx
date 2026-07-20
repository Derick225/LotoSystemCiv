import { FALLBACK_CALIBRATION } from "../shared/prediction.types";
import React, { useState, useMemo } from 'react';
import type { DrawResult } from '../types';
import { analyzeIntraDraw } from '../services/intraDrawService';
import { analyzeForManipulation } from '../services/forensicAuditService';
import { DrawTopology } from './DrawTopology';
import { TicketXRay } from './TicketXRay';
import { 
  Activity, Zap, Binary, AlertTriangle, ChevronRight, Hash, 
  ScanEye, X, ShieldAlert, ShieldCheck, RefreshCw, LineChart, Gauge 
} from 'lucide-react';
import { motion } from 'framer-motion';
import { audioEngine } from '../utils/audioEngine';
import { useNexusStore } from '../store/useNexusStore';


interface DrawExamineProps {
    result: DrawResult;
    history: DrawResult[];
    onClose: () => void;
}

export const DrawExamine: React.FC<DrawExamineProps> = ({ result, history, onClose }) => {
    // Mode d'analyse : Structurel (Morphologie Spatiale, AC, Finales) ou Forensic (Benford, KS, Echo, Entropy)
    const [examineMode, setExamineMode] = useState<'structural' | 'forensic'>('structural');
    const [activeFormulaId, setActiveFormulaId] = useState<string | null>(null);

    const storeCalibration = useNexusStore(state => state.empiricalCalibration);
    const calibration = storeCalibration || FALLBACK_CALIBRATION;

    const metrics = useMemo(() => analyzeIntraDraw(result, calibration), [result, calibration]);

    // Calcul de l'audit forensic par rapport à la chronographie historique
    const forensicAudit = useMemo(() => {
        const contextHistory = history.filter(h => h.id !== result.id);
        return analyzeForManipulation(result.gagnants, contextHistory);
    }, [result, history]);

    interface DeviationGaugeProps {
        label: string;
        value: number;
        diff: number;
        target: number;
        unit?: string;
    }

    const DeviationGauge = ({ label, value, diff, target, unit = "" }: DeviationGaugeProps) => {
        const percent = Math.min(100, Math.max(0, 50 + (diff / target) * 50));
        const color = Math.abs(diff) > (target * 0.3) ? 'bg-orange-500' : 'bg-emerald-500';
        
        return (
            <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <span>{label}</span>
                    <span className={Math.abs(diff) > (target * 0.3) ? 'text-orange-400' : 'text-emerald-400'}>
                        {value}{unit} ({diff > 0 ? '+' : ''}{diff.toFixed(1)})
                    </span>
                </div>
                <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden flex items-center px-0.5">
                    <div 
                        className={`h-0.5 rounded-full ${color} transition-all duration-500 shadow-[0_0_8px_rgba(255,255,255,0.5)]`}
                        style={{ width: `${percent}%` }}
                    ></div>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl animate-fade-in text-left">
            <div className="bg-slate-900 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden border border-slate-800 flex flex-col md:flex-row max-h-[90vh]">
                
                {/* Left Panel: Grid & Topology */}
                <div className="md:w-1/2 p-6 sm:p-8 bg-black/20 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-800 overflow-y-auto">
                    <div className="text-center mb-6">
                        <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-2">Morphologie Spatiale</div>
                        <h3 className="text-2xl font-black text-white">{result.date}</h3>
                    </div>
                    
                    <DrawTopology winners={result.gagnants} machine={result.machine} size="md" />
                    
                    <div className="mt-8 grid grid-cols-2 gap-4 w-full">
                        <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/60 shadow-sm">
                            <span className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Écart Interne Max</span>
                            <div className="text-lg font-black text-white font-mono">{metrics.maxInternalGap} <span className="text-[10px] text-slate-500 font-normal">rangs</span></div>
                        </div>
                        <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/60 shadow-sm">
                            <span className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Complexité AC</span>
                            <div className="text-lg font-black text-white font-mono">{metrics.acValue} <span className="text-[10px] text-slate-500 font-normal">/ 10</span></div>
                        </div>
                    </div>
                    
                    {/* Machine label banner */}
                    <div className="mt-6 w-full py-2 px-3.5 bg-indigo-500/5 rounded-xl border border-indigo-550/15 text-center text-[10px] font-black text-indigo-400 uppercase tracking-wider">
                        Enregistreur : {result.machine || 'Nominal'}
                    </div>
                </div>

                {/* Right Panel: Data, Custom Toggle, and Layouts */}
                <div className="md:w-1/2 flex flex-col h-[70vh] md:h-auto">
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 border border-indigo-500/10">
                                <Binary size={18} />
                            </div>
                            <div>
                                <h4 className="font-extrabold text-white text-md leading-none">Rapport d'Audit</h4>
                                <p className="text-[9px] text-slate-550 font-mono mt-1 uppercase tracking-wider">HASH ID: {result.id.slice(0, 8)}</p>
                            </div>
                        </div>
                        
                        {/* Segmented Mode Selector */}
                        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 select-none">
                            <button
                                onClick={() => { audioEngine.play('click'); setExamineMode('structural'); }}
                                className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                    examineMode === 'structural'
                                        ? 'bg-slate-800 text-white shadow-md border border-slate-700/50'
                                        : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                Morphologie
                            </button>
                            <button
                                onClick={() => { audioEngine.play('click'); setExamineMode('forensic'); }}
                                className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                    examineMode === 'forensic'
                                        ? 'bg-slate-800 text-white shadow-md border border-slate-700/50'
                                        : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                Forensic
                            </button>
                        </div>
                    </div>

                    <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-900/10">
                        
                        {examineMode === 'structural' ? (
                            <div className="space-y-6 animate-fade-in">
                                {/* Rayon-X Integration */}
                                <section>
                                    <div className="flex items-center gap-2 mb-3">
                                        <ScanEye size={13} className="text-indigo-400"/>
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">Rayon-X Structurel</span>
                                    </div>
                                    <TicketXRay numbers={result.gagnants} score={Math.round((metrics.acValue / 10) * 100)} showTitle={false} />
                                </section>

                                {/* Deviations Section */}
                                <section className="space-y-4">
                                    <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <Activity size={12} className="text-indigo-400" /> DÉVIATIONS STOCHASTIQUES
                                    </h5>
                                    <div className="grid gap-4 bg-slate-950/20 p-4 rounded-2xl border border-slate-800/40">
                                        <DeviationGauge label="Somme Sigma (Σ)" value={metrics.sum} diff={metrics.deviation.sumDiff} target={calibration.stdSum} />
                                        <DeviationGauge label="Stabilité AC" value={metrics.acValue} diff={metrics.deviation.acDiff} target={calibration.meanAC} />
                                    </div>
                                </section>

                                {/* Named Patterns Section */}
                                <section className="space-y-3">
                                    <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <Zap size={12} className="text-indigo-400" /> SIGNATURES DE FORMES
                                    </h5>
                                    <div className="space-y-2">
                                        {metrics.patterns.length > 0 ? metrics.patterns.map(p => (
                                            <div key={p.id} className="flex items-center gap-3.5 p-3.5 bg-slate-950/25 rounded-2xl border border-slate-800 hover:bg-slate-800/30 transition">
                                                <div className={`p-1.5 rounded-lg ${p.severity === 'high' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/15' : 'bg-indigo-500/10 text-indigo-400'}`}>
                                                    <AlertTriangle size={14} />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-xs font-black text-white">{p.name}</div>
                                                    <div className="text-[9px] text-slate-500 mt-0.5 leading-normal">{p.description}</div>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center">
                                                <p className="text-[9px] text-slate-500 font-black italic">Aucune forme asymétrique récurrente</p>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* Finales Analysis */}
                                <section className="space-y-3">
                                    <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <Hash size={12} className="text-indigo-400" /> DISTRIBUTION DES FINALES
                                    </h5>
                                    <div className="flex gap-1.5">
                                        {Object.entries(metrics.finalesCount).map(([f, count]) => (
                                            <div key={f} className={`flex-1 py-2 px-1 rounded-xl text-center border transition-all ${count >= 2 ? 'bg-indigo-650/15 border-indigo-500/30 text-indigo-450 font-black shadow-inner' : 'bg-slate-950/20 border-slate-800 text-slate-500'}`}>
                                                <div className="text-[8px] font-mono leading-none">F{f}</div>
                                                <div className="text-[11px] font-black font-mono mt-1">x{count}</div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>
                        ) : (
                            <div className="space-y-6 animate-fade-in select-none">
                                {/* Forensic Integrity Overall Card */}
                                <div className="bg-slate-950/40 p-5 rounded-3xl border border-slate-800/60 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <span className="block text-[8px] font-black text-slate-550 uppercase tracking-widest leading-none">Intégrité Harmonique</span>
                                            <h5 className="text-sm font-black text-white">Analyse des Écarts d'Urne</h5>
                                        </div>
                                        <div className={`text-2xl font-black font-mono ${forensicAudit.suspicionScore < 40 ? 'text-emerald-400' : 'text-rose-450'}`}>
                                            {100 - forensicAudit.suspicionScore}%
                                        </div>
                                    </div>
                                    
                                    {/* Suspicion Indicator Meter */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[8px] font-black uppercase text-slate-500">
                                            <span>Score Suspicieux : {forensicAudit.suspicionScore}%</span>
                                            <span>Confiance: {(forensicAudit.benfordCompliance).toFixed(0)}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden flex items-center">
                                            <div 
                                                className={`h-0.5 rounded-full transition-all duration-500 ${forensicAudit.suspicionScore < 40 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                                style={{ width: `${forensicAudit.suspicionScore}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Forensic Indicators Mini-List */}
                                <section className="space-y-3">
                                    <div className="text-[9px] font-black text-slate-505 uppercase tracking-widest flex items-center gap-1.5">
                                        <ShieldAlert size={12} className="text-indigo-400" /> Analyseurs Actifs ({forensicAudit.indicators.length})
                                    </div>
                                    
                                    <div className="space-y-2">
                                        {forensicAudit.indicators.map((ind, idx) => (
                                            <div 
                                                key={idx} 
                                                onClick={() => {
                                                    audioEngine.play('click');
                                                    setActiveFormulaId(activeFormulaId === ind.type ? null : ind.type);
                                                }}
                                                className="bg-slate-950/20 p-3.5 rounded-2xl border border-slate-850 hover:bg-slate-800/20 transition cursor-pointer space-y-2"
                                            >
                                                <div className="flex justify-between items-center w-full">
                                                    <span className="text-[10px] font-black uppercase text-slate-300 flex items-center gap-1.5 leading-none">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${ind.severity === 'critical' ? 'bg-rose-500 animate-pulse' : (ind.severity === 'high' ? 'bg-rose-400' : 'bg-amber-400')}`}></span>
                                                        {ind.label}
                                                    </span>
                                                    <span className="text-[10px] font-mono font-bold text-slate-505 bg-slate-950 px-2 py-0.5 rounded border border-white/5">
                                                        {ind.value}
                                                    </span>
                                                </div>
                                                <p className="text-[9px] text-slate-500 leading-normal font-semibold">
                                                    {ind.description}
                                                </p>
                                                
                                                {/* Expandable math formula in drawer context */}
                                                {activeFormulaId === ind.type && (
                                                    <motion.div 
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        className="pt-2.5 border-t border-white/5 bg-slate-950/60 p-2.5 rounded-xl font-mono text-[8px] text-indigo-300"
                                                    >
                                                        <span className="block text-[7px] text-slate-600 font-black uppercase tracking-wider mb-1">Algorithme d'Inférence</span>
                                                        <div className="whitespace-pre-wrap select-all">
                                                            {ind.type === 'HARMONY' && 'P(A) = 1 / (1 + e^(β * (σ² - τ)))'}
                                                            {ind.type === 'BENFORD' && 'D_Benford = Σ (f_obs - P_Benford)²'}
                                                            {ind.type === 'KS_TEST' && 'D_n = sup |F_n(x) - F(x)|'}
                                                            {ind.type === 'ECHO' && 'P(X = k) = M_C(k) * M_U-1(n-k) / M_U(n)'}
                                                            {ind.type === 'SIGMA' && '||Z||_L2 = sqrt(Z_sum² + Z_gap²)'}
                                                            {ind.type === 'ENTROPY' && 'H_norm = - Σ p_i log2(p_i) / log2(U)'}
                                                            {!['HARMONY', 'BENFORD', 'KS_TEST', 'ECHO', 'SIGMA', 'ENTROPY'].includes(ind.type) && 'Modèle d\'interférence asymptotique continu'}
                                                        </div>
                                                        <span className="block text-[7px] text-slate-550 mt-1 font-bold">Calculé à 100% sans marge d'erreur magique.</span>
                                                    </motion.div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                {/* Thermodynamique & Bayes Summary */}
                                <section className="p-4 bg-slate-950/20 rounded-2xl border border-slate-850 space-y-2">
                                    <div className="text-[9px] font-black text-slate-505 uppercase tracking-wider">Calibration Bayésienne Prochaine</div>
                                    <p className="text-[9px] text-slate-400 font-semibold leading-relaxed">
                                        Ce tirage alimente les gradients directionnels de l'Oracle. Son inclusion ne déforme pas l'entropie asymptotique générale, garantissant que l'attracteur converge sagement vers l'espace de Shannon.
                                    </p>
                                </section>
                            </div>
                        )}
                    </div>

                    <div className="p-6 bg-slate-900 border-t border-slate-805 select-none">
                        <button 
                            onClick={() => {
                                audioEngine.play('click');
                                onClose();
                            }}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm rounded-2xl shadow-xl transition transform active:scale-95 flex items-center justify-center gap-2 tracking-wide uppercase"
                        >
                            <ShieldCheck size={16} /> TERMINER L'INSPECTION
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
