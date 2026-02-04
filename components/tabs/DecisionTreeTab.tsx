
import React, { useState, useEffect, useCallback } from 'react';
import { runDecisionForest, calculateFeatureImportance, FEATURES_LABELS } from '../../services/decisionTreeService';
import type { ForestVote } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { useNexus } from '../NexusProvider';
import { Vote, Users, BrainCircuit, Ghost, EyeOff, ShieldCheck, Check, Sparkles, HelpCircle, Scale } from 'lucide-react';

interface DecisionTreeTabProps { drawName: string; }

type FilterMode = 'consensus' | 'average' | 'shadow';

export const DecisionTreeTab: React.FC<DecisionTreeTabProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { history, loading: nexusLoading } = useNexus();
    
    const [candidates, setCandidates] = useState<ForestVote[]>([]);
    const [selectedCandidate, setSelectedCandidate] = useState<ForestVote | null>(null);
    const [localLoading, setLocalLoading] = useState(true);
    const [filterMode, setFilterMode] = useState<FilterMode>('consensus');
    const [globalImportance, setGlobalImportance] = useState<any[]>([]);
    const [selectedFeatures, setSelectedFeatures] = useState<string[]>(FEATURES_LABELS);

    const load = useCallback(async () => {
        if (history.length < 30) return;
        setLocalLoading(true);
        try {
            // Lancement du Worker Forest avec le mode sélectionné
            const { votes, dataset } = await runDecisionForest(history, filterMode, selectedFeatures);
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
    }, [history, filterMode, selectedFeatures, showToast]);

    useEffect(() => { 
        if (history.length > 30) {
            load(); 
        } else {
            setLocalLoading(false);
        }
    }, [drawName, history, load, filterMode]); // Reload on filterMode change

    const getTheme = () => {
        if (filterMode === 'consensus') return { border: 'border-emerald-500', bg: 'bg-emerald-600', text: 'text-emerald-500', gradient: 'from-slate-900 to-emerald-950' };
        if (filterMode === 'average') return { border: 'border-blue-500', bg: 'bg-blue-600', text: 'text-blue-500', gradient: 'from-slate-900 to-blue-950' };
        return { border: 'border-rose-500', bg: 'bg-rose-600', text: 'text-rose-500', gradient: 'from-slate-900 to-rose-950' };
    };

    const theme = getTheme();

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
            <div className={`p-8 md:p-12 rounded-[3.5rem] border shadow-2xl relative overflow-hidden transition-all duration-700 ${filterMode === 'shadow' ? 'bg-slate-950 border-rose-500/20' : 'bg-slate-900 border-slate-800'}`}>
                <div className="absolute top-0 right-0 p-12 opacity-5">
                    <BrainCircuit size={180} />
                </div>
                
                <div className="relative z-10 flex flex-col xl:flex-row justify-between gap-12 items-center">
                    <div className="flex-1 text-center xl:text-left">
                        <div className="flex items-center justify-center xl:justify-start gap-3 mb-4">
                            <div className={`p-3 rounded-2xl bg-white/5 border border-white/10 ${theme.text}`}>
                                {filterMode === 'shadow' ? <Ghost size={24}/> : filterMode === 'average' ? <Scale size={24}/> : <Users size={24}/>}
                            </div>
                            <h3 className="text-xs font-black uppercase tracking-[0.4em] opacity-70">
                                {filterMode === 'shadow' ? 'Mode Dissidents' : filterMode === 'average' ? 'Mode Équilibre' : 'Vote Consensus'}
                            </h3>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-none mb-4">
                            L'Avis des <span className={theme.text}>{filterMode === 'shadow' ? 'Outsiders' : filterMode === 'average' ? 'Médians' : 'Experts'}</span>
                        </h2>
                        <p className="text-slate-400 text-sm font-medium max-w-xl mx-auto xl:mx-0">
                            {filterMode === 'shadow' 
                                ? "Cible les numéros ignorés mais mathématiquement mûrs (Contre-Intuitif)." 
                                : filterMode === 'average'
                                    ? "Cible la 'Zone Moyenne' (40-60%). Valeurs sûres, ni sur-jouées, ni oubliées."
                                    : "Cible la majorité absolue. Les favoris logiques du système (Score > 60%)."}
                        </p>
                    </div>

                    {/* SELECTEUR DE MODE */}
                    <div className="flex bg-slate-950 p-1.5 rounded-[2rem] border border-slate-800 shadow-inner">
                        <button 
                            onClick={() => setFilterMode('consensus')}
                            className={`px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${filterMode === 'consensus' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                        >
                            <ShieldCheck size={14}/> Top
                        </button>
                        <button 
                            onClick={() => setFilterMode('average')}
                            className={`px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${filterMode === 'average' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                        >
                            <Scale size={14}/> Moyen
                        </button>
                        <button 
                            onClick={() => setFilterMode('shadow')}
                            className={`px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${filterMode === 'shadow' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                        >
                            <EyeOff size={14}/> Ombre
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Liste des Élus */}
                <div className="lg:col-span-4 bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 h-fit max-h-[700px] overflow-y-auto custom-scrollbar">
                    <div className="flex justify-between items-center mb-8">
                        <h4 className={`font-black text-[10px] uppercase tracking-widest flex items-center gap-2 ${theme.text}`}>
                            <Vote size={14}/> 
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
                                className={`w-full flex items-center justify-between p-4 rounded-3xl border transition-all transform active:scale-95 ${selectedCandidate?.candidate === c.candidate ? `${theme.bg} ${theme.border} text-white shadow-lg scale-105` : 'bg-slate-50 dark:bg-slate-900 border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
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
                        {candidates.length === 0 && (
                            <div className="text-center py-10 text-slate-400 text-xs italic">
                                Aucun candidat dans cette zone.
                            </div>
                        )}
                    </div>
                </div>

                {/* Détail du Candidat */}
                <div className="lg:col-span-8 space-y-8">
                    {selectedCandidate ? (
                        <div className={`p-10 rounded-[3.5rem] shadow-2xl relative overflow-hidden transition-all duration-500 bg-gradient-to-br ${theme.gradient} border ${filterMode === 'shadow' ? 'border-rose-900' : filterMode === 'average' ? 'border-blue-900' : 'border-emerald-900'}`}>
                            <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
                                <div className="flex flex-col items-center">
                                    <div className={`text-[10px] font-black uppercase tracking-widest mb-4 px-4 py-1 rounded-full border bg-white/10 border-white/20 text-white`}>
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
                                            {filterMode === 'shadow' 
                                                ? "Ce numéro est statistiquement 'oublié'. Il a accumulé un retard critique (Gap) sans être surjoué par la foule. Candidat surprise."
                                                : filterMode === 'average'
                                                    ? "Ce numéro est dans le 'ventre mou' statistique. Il n'est pas sous les projecteurs, ce qui le rend moins sujet aux corrections brutales de probabilité."
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
                    <div className={`p-6 rounded-[2.5rem] border flex items-start gap-4 ${filterMode === 'average' ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/30' : 'bg-indigo-50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-800/30'}`}>
                        <HelpCircle size={24} className={`${theme.text} shrink-0 mt-1`} />
                        <div>
                            <h5 className={`text-xs font-black uppercase mb-1 ${theme.text}`}>Comment ça marche ?</h5>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                                Imaginez 80 experts qui regardent le passé du loto. Chacun a sa spécialité (les écarts, les suites, les fréquences...). Ils votent tous.
                                <br/><br/>
                                <strong>Top :</strong> Majorité absolue (&gt;60%).<br/>
                                <strong>Moyen :</strong> Avis partagé mais positif (40-60%). Souvent plus fiable sur le long terme.<br/>
                                <strong>Ombre :</strong> Avis minoritaire mais pertinent (Outsiders).
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
