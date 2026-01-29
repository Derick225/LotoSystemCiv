
import React, { useState } from 'react';
import { evolveNeuralDNA } from '../../services/trainingService';
import { normalizeWeights } from '../../services/predictionEngine';
import { useNexus } from '../NexusProvider';
import { AlgoRadar } from '../AlgoRadar';
import { useToast } from '../ui/Toast';
import { audioEngine } from '../../utils/audioEngine';
import { 
    Dna, Play, Save, X, Activity, Sliders, 
    ArrowRight, TrendingUp, Microscope, AlertOctagon 
} from 'lucide-react';
import type { AlgoWeights, TrainingReport } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';

export const TrainingTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { showToast } = useToast();
    const { globalWeights, updateGlobalWeights, refreshData } = useNexus();
    
    // Config State
    const [generations, setGenerations] = useState(30);
    const [sampleSize, setSampleSize] = useState(50);
    
    // Process State
    const [status, setStatus] = useState<'idle' | 'training' | 'review'>('idle');
    const [progress, setProgress] = useState(0);
    
    // Result State
    const [candidateWeights, setCandidateWeights] = useState<AlgoWeights | null>(null);
    const [report, setReport] = useState<TrainingReport | null>(null);
    const [improvement, setImprovement] = useState(0);

    const handleStartTraining = async () => {
        setStatus('training');
        setProgress(0);
        audioEngine.play('scan');
        
        try {
            // Simulation de progression pour l'UX
            const progressInterval = setInterval(() => {
                setProgress(p => Math.min(p + 5, 90));
            }, 500);

            const result = await evolveNeuralDNA(
                drawName, 
                { generations, sampleSize }, 
                (data) => console.log("Gen Log:", data) // Telemetry log
            );

            clearInterval(progressInterval);
            setProgress(100);
            
            if (result.report) {
                // Normalisation préventive pour l'affichage
                const normalizedCandidate = normalizeWeights(result.bestWeights);
                
                setCandidateWeights(normalizedCandidate);
                setReport(result.report);
                setImprovement(result.improvement);
                setStatus('review');
                audioEngine.play('success');
                showToast("Cycle d'évolution terminé. Examen requis.", "success");
            } else {
                throw new Error("Aucun résultat généré.");
            }

        } catch (e: any) {
            console.error(e);
            setStatus('idle');
            showToast("Échec de l'entraînement : " + e.message, "error");
            audioEngine.play('error');
        }
    };

    const handleApply = async () => {
        if (candidateWeights) {
            // Normalisation stricte finale (double sécurité)
            const safeWeights = normalizeWeights(candidateWeights);
            await updateGlobalWeights(safeWeights);
            await refreshData(drawName, true);
            setStatus('idle');
            setCandidateWeights(null);
            showToast("Nouvel ADN Neuronal injecté et normalisé.", "success");
            audioEngine.play('boot');
        }
    };

    const handleDiscard = () => {
        setStatus('idle');
        setCandidateWeights(null);
        showToast("Mutation rejetée. Retour aux paramètres précédents.", "info");
    };

    const getWeightDiff = (key: keyof AlgoWeights) => {
        if (!candidateWeights) return 0;
        const oldVal = (globalWeights[key] || 0) * 100;
        const newVal = (candidateWeights[key] || 0) * 100;
        return newVal - oldVal;
    };

    return (
        <div className="space-y-8 animate-fade-in pb-24">
            {/* Header Configuration */}
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-10 opacity-5"><Dna size={140} /></div>
                
                <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center justify-between">
                    <div>
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2 flex items-center gap-3">
                            <Microscope className="text-indigo-500" /> Centre d'Entraînement
                        </h3>
                        <p className="text-slate-400 text-xs font-medium max-w-lg">
                            Lancez un algorithme génétique pour faire évoluer les poids de l'IA. 
                            Le système va simuler des milliers de combinaisons pour trouver l'ADN optimal pour <strong>{drawName}</strong>.
                        </p>
                    </div>

                    <div className="bg-black/30 p-6 rounded-[2rem] border border-white/5 flex flex-col gap-4 min-w-[280px]">
                        <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                                <span>Générations (Itérations)</span>
                                <span className="text-indigo-400">{generations}</span>
                            </div>
                            <input 
                                type="range" min="10" max="100" step="5" 
                                value={generations} onChange={(e) => setGenerations(Number(e.target.value))}
                                disabled={status !== 'idle'}
                                className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                                <span>Profondeur (Tirages)</span>
                                <span className="text-emerald-400">{sampleSize}</span>
                            </div>
                            <input 
                                type="range" min="20" max="100" step="10" 
                                value={sampleSize} onChange={(e) => setSampleSize(Number(e.target.value))}
                                disabled={status !== 'idle'}
                                className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-emerald-500"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Zone */}
            <div className="flex justify-center">
                {status === 'idle' && (
                    <button 
                        onClick={handleStartTraining}
                        className="group relative px-12 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/30 transition-all active:scale-95 flex items-center gap-4 overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500 rounded-[2rem]"></div>
                        <Play size={18} fill="currentColor" className="relative z-10" /> 
                        <span className="relative z-10">Lancer Évolution</span>
                    </button>
                )}

                {status === 'training' && (
                    <div className="w-full max-w-xl bg-slate-900/50 p-6 rounded-[2rem] border border-indigo-500/20 text-center animate-pulse">
                        <div className="flex justify-center mb-4">
                            <Activity className="text-indigo-400 animate-spin" size={32} />
                        </div>
                        <h4 className="text-white font-black uppercase text-sm mb-2">Calcul HPC en cours...</h4>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 font-mono">Mutation des chromosomes : {Math.round(progress)}%</p>
                    </div>
                )}
            </div>

            {/* Review Zone */}
            {status === 'review' && candidateWeights && report && (
                <div className="animate-slide-up space-y-8">
                    <div className="bg-slate-50 dark:bg-slate-900 border-2 border-indigo-500/30 p-8 rounded-[3rem] relative overflow-hidden">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8 border-b border-slate-200 dark:border-slate-800 pb-6">
                            <div>
                                <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                                    <AlertOctagon className="text-indigo-500" /> Candidat Trouvé
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">L'IA propose une nouvelle configuration génétique.</p>
                            </div>
                            <div className="flex items-center gap-4 bg-white dark:bg-black/20 px-6 py-3 rounded-2xl border border-slate-200 dark:border-slate-700">
                                <div className="text-center">
                                    <div className="text-[9px] font-black uppercase text-slate-400">Score Actuel</div>
                                    <div className="text-lg font-black text-slate-600 dark:text-slate-300">{(report.score - improvement).toFixed(1)}</div>
                                </div>
                                <ArrowRight className="text-indigo-500" />
                                <div className="text-center">
                                    <div className="text-[9px] font-black uppercase text-indigo-400">Nouveau Score</div>
                                    <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{report.score.toFixed(1)}</div>
                                </div>
                                <div className={`px-3 py-1 rounded-lg text-xs font-black ${improvement >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {improvement > 0 ? '+' : ''}{improvement.toFixed(1)}%
                                </div>
                            </div>
                        </div>

                        <div className="grid lg:grid-cols-2 gap-10">
                            <div>
                                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">Visualisation Radar</h4>
                                <div className="h-64 flex items-center justify-center">
                                    <AlgoRadar weights={candidateWeights} previousWeights={globalWeights} height={250} />
                                </div>
                            </div>
                            
                            <div>
                                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">Mutations Clés</h4>
                                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                                    {Object.keys(candidateWeights).map((key) => {
                                        const diff = getWeightDiff(key as keyof AlgoWeights);
                                        if (Math.abs(diff) < 0.5) return null; // Ignorer les changements mineurs
                                        
                                        return (
                                            <div key={key} className="flex justify-between items-center p-3 bg-white dark:bg-black/20 rounded-xl border border-slate-100 dark:border-slate-800">
                                                <span className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-300">{key}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-mono text-slate-500">{(globalWeights[key as keyof AlgoWeights]! * 100).toFixed(1)}%</span>
                                                    <ArrowRight size={10} className="text-slate-300" />
                                                    <span className={`text-xs font-bold ${diff > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                        {(candidateWeights[key as keyof AlgoWeights]! * 100).toFixed(1)}%
                                                    </span>
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${diff > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 flex gap-4">
                            <button 
                                onClick={handleDiscard}
                                className="flex-1 py-4 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-300 dark:hover:bg-slate-700 transition flex items-center justify-center gap-2"
                            >
                                <X size={16} /> Rejeter
                            </button>
                            <button 
                                onClick={handleApply}
                                className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition flex items-center justify-center gap-2"
                            >
                                <Save size={16} /> Appliquer la Mutation
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
