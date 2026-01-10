
import React, { useState, useEffect, useCallback } from 'react';
import { runDecisionForest, calculateFeatureImportance, FEATURES_LABELS } from '../../services/decisionTreeService';
import type { ForestVote } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { useNexus } from '../NexusProvider';
import { Vote, Users, BrainCircuit, Ghost, EyeOff, ShieldCheck, Check, Sparkles, HelpCircle } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts';

interface DecisionTreeTabProps { drawName: string; }

export const DecisionTreeTab: React.FC<DecisionTreeTabProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { history, loading: nexusLoading } = useNexus();
    
    const [candidates, setCandidates] = useState<ForestVote[]>([]);
    const [selectedCandidate, setSelectedCandidate] = useState<ForestVote | null>(null);
    const [localLoading, setLocalLoading] = useState(true);
    const [shadowMode, setShadowMode] = useState(false);
    const [globalImportance, setGlobalImportance] = useState<any[]>([]);
    const [selectedFeatures, setSelectedFeatures] = useState<string[]>(FEATURES_LABELS);
    const [showExplanation, setShowExplanation] = useState(false);

    const load = useCallback(async () => {
        if (history.length < 30) return;
        setLocalLoading(true);
        try {
            // Lancement du Worker Forest
            const { votes, dataset } = await runDecisionForest(history, shadowMode, selectedFeatures);
            setCandidates(votes);
            
            if (votes.length > 0) {
                // Par défaut, on sélectionne le meilleur candidat
                setSelectedCandidate(votes[0]);
                
                // Calcul de l'importance des features (post-training)
                const impMap = calculateFeatureImportance(dataset, selectedFeatures);
                const impArray = Object.entries(impMap)
                    .map(([name, val]) => ({ name, val }))
                    .sort((a,b) => b.val - a.val);
                setGlobalImportance(impArray);
            } else {
                setSelectedCandidate(null);
                setGlobalImportance([]);
            }
        } catch (e) { 
            showToast("Calcul de bifurcation échoué", "error"); 
        } finally { 
            setLocalLoading(false); 
        }
    }, [history, shadowMode, selectedFeatures, showToast]);

    useEffect(() => { 
        if (history.length > 30) {
            load(); 
        } else {
            setLocalLoading(false);
        }
    }, [drawName, history, load]);

    if (nexusLoading || (localLoading && candidates.length === 0)) return (
        <div className="flex flex-col items-center justify-center p-20 gap-10 bg-slate-900/30 rounded-[3.5rem] border border-slate-800 border-dashed">
            <div className="relative">
                <div className="w-28 h-28 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin"></div>
                <Vote className="absolute inset-0 m-auto text-emerald-500 w-12 h-12 animate-pulse" />
            </div>
            <p className="font-black text-emerald-600 uppercase tracking-[0.3em] text-sm">Consultation des Sages...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Header Simplifié */}
            <div className={`p-8 md:p-12 rounded-[3.5rem] border shadow-2xl relative overflow-hidden transition-all duration-700 ${shadowMode ? 'bg-slate-950 border-rose-500/20' : 'bg-slate-900 border-slate-800'}`}>
                <div className="absolute top-0 right-0 p-12 opacity-5">
                    <BrainCircuit size={180} />
                </div>
                
                <div className="relative z-10 flex flex-col xl:flex-row justify-between gap-12 items-center">
                    <div className="flex-1 text-center xl:text-left">
                        <div className="flex items-center justify-center xl:justify-start gap-3 mb-4">
                            <div className={`p-3 rounded-2xl ${shadowMode ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                {shadowMode ? <Ghost size={24}/> : <Users size={24}/>}
                            </div>
                            <h3 className="text-xs font-black uppercase tracking-[0.4em] opacity-70">
                                {shadowMode ? 'Mode Contre-Intuitif' : 'Vote par Consensus'}
                            </h3>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-none mb-4">
                            L'Avis des <span className={shadowMode ? "text-rose-500" : "text-emerald-500"}>{shadowMode ? 'Dissidents' : 'Experts'}</span>
                        </h2>
                        <p className="text-slate-400 text-sm font-medium max-w-xl mx-auto xl:mx-0">
                            {shadowMode 
                                ? "Nous recherchons les numéros que tout le monde ignore mais qui ont une signature mathématique de 'Réveil imminent'." 
                                : "80 arbres de décision analysent l'historique. Voici les numéros qui obtiennent la majorité absolue des votes."}
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <button 
                            onClick={() => setShadowMode(!shadowMode)}
                            className={`px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex flex-col items-center gap-2 shadow-xl border ${shadowMode ? 'bg-rose-600 border-rose-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                        >
                            {shadowMode ? <EyeOff size={20}/> : <ShieldCheck size={20}/>}
                            <span>{shadowMode ? 'Chercher Logique' : 'Chercher Surprise'}</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Liste des Élus */}
                <div className="lg:col-span-4 bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 h-fit max-h-[700px] overflow-y-auto custom-scrollbar">
                    <div className="flex justify-between items-center mb-8">
                        <h4 className="font-black text-[10px] uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <Vote size={14} className={shadowMode ? "text-rose-500" : "text-emerald-500"}/> 
                            Résultats du Vote
                        </h4>
                        <div className="px-3 py-1 bg-slate-100 dark:bg-slate-900 rounded-full text-[9px] font-bold text-slate-500">
                            {candidates.length} Candidats
                        </div>
                    </div>

                    <div className="space-y-3">
                        {candidates.slice(0, 10).map((c, idx) => (
                            <button 
                                key={c.candidate} 
                                onClick={() => setSelectedCandidate(c)} 
                                className={`w-full flex items-center justify-between p-4 rounded-3xl border transition-all transform active:scale-95 ${selectedCandidate?.candidate === c.candidate ? (shadowMode ? 'bg-rose-600 border-rose-500 text-white shadow-lg scale-105' : 'bg-emerald-600 border-emerald-500 text-white shadow-lg scale-105') : 'bg-slate-50 dark:bg-slate-900 border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                            >
                                <div className="flex items-center gap-4">
                                    <span className={`text-[10px] font-black w-4 ${selectedCandidate?.candidate === c.candidate ? 'text-white/70' : 'text-slate-400'}`}>#{idx+1}</span>
                                    <NumberBall number={c.candidate} size="sm" selected={selectedCandidate?.candidate === c.candidate} />
                                    <div className="text-left">
                                        <div className="font-black text-sm">Numéro {c.candidate}</div>
                                        <div className={`text-[9px] font-medium ${selectedCandidate?.candidate === c.candidate ? 'text-white/80' : 'text-slate-400'}`}>
                                            {c.score}% d'approbation
                                        </div>
                                    </div>
                                </div>
                                {selectedCandidate?.candidate === c.candidate && <Check size={16} className="text-white"/>}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Détail du Candidat */}
                <div className="lg:col-span-8 space-y-8">
                    {selectedCandidate ? (
                        <div className={`p-10 rounded-[3.5rem] shadow-2xl relative overflow-hidden transition-all duration-500 ${shadowMode ? 'bg-gradient-to-br from-slate-900 to-rose-950 border border-rose-900' : 'bg-gradient-to-br from-slate-900 to-emerald-950 border border-emerald-900'}`}>
                            <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
                                <div className="flex flex-col items-center">
                                    <div className={`text-[10px] font-black uppercase tracking-widest mb-4 px-4 py-1 rounded-full border ${shadowMode ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>
                                        Élu par l'IA
                                    </div>
                                    <NumberBall number={selectedCandidate.candidate} size="xl" isAttractor />
                                </div>
                                
                                <div className="flex-1 text-center md:text-left">
                                    <div className="text-6xl font-black text-white mb-2">{selectedCandidate.score}%</div>
                                    <h4 className="text-lg font-bold text-slate-300 mb-6">De probabilité estimée par la forêt</h4>
                                    
                                    <div className="bg-black/30 p-6 rounded-3xl border border-white/10 backdrop-blur-md">
                                        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <Sparkles size={12}/> Pourquoi ce choix ?
                                        </h5>
                                        <p className="text-sm text-white font-medium leading-relaxed">
                                            {shadowMode 
                                                ? "Ce numéro est statistiquement 'oublié'. Il a accumulé un retard critique (Gap) sans être surjoué par la foule. C'est un candidat idéal pour une surprise."
                                                : "Ce numéro coche toutes les cases logiques : fréquence élevée récemment, bon écart temporel et validation par les algorithmes de voisinage."}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 rounded-[3.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-slate-400 p-10 text-center">
                            <Vote size={48} className="mb-4 opacity-20"/>
                            <p className="text-xs font-bold uppercase tracking-widest">Sélectionnez un candidat pour voir son analyse</p>
                        </div>
                    )}

                    {/* Explication Pédagogique */}
                    <div className="bg-indigo-50 dark:bg-indigo-900/10 p-6 rounded-[2.5rem] border border-indigo-100 dark:border-indigo-800/30 flex items-start gap-4">
                        <HelpCircle size={24} className="text-indigo-500 shrink-0 mt-1" />
                        <div>
                            <h5 className="text-xs font-black text-indigo-700 dark:text-indigo-400 uppercase mb-1">Comment ça marche ?</h5>
                            <p className="text-[11px] text-indigo-800/70 dark:text-indigo-200/70 leading-relaxed font-medium">
                                Imaginez 80 experts qui regardent le passé du loto. Chacun a sa spécialité (les écarts, les suites, les fréquences...). Ils votent tous. Ici, nous affichons uniquement les numéros qui ont convaincu la majorité du conseil.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
