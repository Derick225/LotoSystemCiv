
import React, { useState, useEffect, useCallback } from 'react';
import { runDecisionForest, calculateFeatureImportance, FEATURES_LABELS } from '../../services/decisionTreeService';
import type { ForestVote } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { useNexus } from '../NexusProvider';
import { LayoutGrid, Network, Cpu, Microscope, GitCommit, Sparkles, Ghost, EyeOff, ShieldAlert, CheckSquare, Square, RefreshCw } from 'lucide-react';
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

    const load = useCallback(async () => {
        if (history.length < 30) return;
        setLocalLoading(true);
        try {
            // Lancement du Worker Forest
            const res = await runDecisionForest(history, shadowMode, selectedFeatures);
            setCandidates(res);
            
            if (res.length > 0) {
                // Par défaut, on sélectionne le meilleur candidat
                setSelectedCandidate(res[0]);
                
                // Calcul de l'importance des features (post-training)
                const impMap = calculateFeatureImportance(null);
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

    const toggleFeature = (feature: string) => {
        setSelectedFeatures(prev => {
            const isSelected = prev.includes(feature);
            if (isSelected) {
                if (prev.length === 1) {
                    showToast("Au moins une caractéristique est requise.", "info");
                    return prev;
                }
                return prev.filter(f => f !== feature);
            }
            return [...prev, feature];
        });
    };

    if (nexusLoading || (localLoading && candidates.length === 0)) return (
        <div className="flex flex-col items-center justify-center p-20 gap-10 bg-slate-900/30 rounded-[3.5rem] border border-slate-800 border-dashed">
            <div className="relative">
                <div className="w-28 h-28 border-4 border-slate-800 border-t-indigo-600 rounded-full animate-spin"></div>
                <Network className="absolute inset-0 m-auto text-indigo-500 w-12 h-12 animate-pulse" />
            </div>
            <p className="font-black text-indigo-500 uppercase tracking-[0.5em] text-sm">Croissance de la Forêt Custom...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Header with Feature Selection */}
            <div className={`p-8 md:p-12 rounded-[3.5rem] border shadow-2xl relative overflow-hidden group transition-all duration-700 ${shadowMode ? 'bg-slate-950 border-rose-500/20' : 'bg-slate-900 border-slate-800'}`}>
                <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:rotate-12 transition-transform duration-1000">
                    {shadowMode ? <Ghost size={140} className="text-rose-500"/> : <GitCommit size={140} />}
                </div>
                
                <div className="relative z-10 flex flex-col xl:flex-row justify-between gap-12">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-4">
                            <Microscope className={shadowMode ? "text-rose-400" : "text-indigo-400"} size={24} />
                            <h3 className="text-xs font-black uppercase tracking-[0.4em] opacity-70">
                                {shadowMode ? 'Anti-Consensus Engine v7.0' : 'Random Forest Grid Custom'}
                            </h3>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-none mb-6">
                            Arbres de <span className={shadowMode ? "text-rose-500" : "text-indigo-500"}>{shadowMode ? 'Rupture' : 'Décision'}</span>
                        </h2>
                        
                        <div className="bg-black/20 p-6 rounded-3xl border border-white/5 space-y-4">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2">Sélecteur de Prédicteurs</h4>
                            <div className="flex flex-wrap gap-3">
                                {FEATURES_LABELS.map(f => (
                                    <button 
                                        key={f} 
                                        onClick={() => toggleFeature(f)}
                                        className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-2 transition-all border ${selectedFeatures.includes(f) ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400' : 'bg-slate-800/40 border-slate-700 text-slate-500 opacity-60'}`}
                                    >
                                        {selectedFeatures.includes(f) ? <CheckSquare size={12}/> : <Square size={12}/>}
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-6 min-w-[240px]">
                        <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 text-center shadow-inner w-full">
                            <div className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">Votes Positifs</div>
                            <div className="text-5xl font-black text-white">{candidates.length}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 w-full">
                            <button 
                                onClick={() => setShadowMode(!shadowMode)}
                                className={`py-4 px-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-xl ${shadowMode ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                            >
                                {shadowMode ? <Ghost size={16}/> : <EyeOff size={16}/>}
                                {shadowMode ? 'Shadow' : 'Normal'}
                            </button>
                            <button 
                                onClick={load}
                                disabled={localLoading}
                                className="py-4 px-4 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-indigo-600 text-white shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
                            >
                                <RefreshCw size={16} className={localLoading ? 'animate-spin' : ''}/>
                                Recalibrer
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Candidates Column */}
                <div className="lg:col-span-3 bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 h-fit max-h-[700px] overflow-y-auto custom-scrollbar">
                    <h4 className="font-black text-[10px] mb-8 uppercase tracking-widest text-slate-400 flex items-center gap-3">
                        <LayoutGrid size={16} className="text-indigo-500"/> {shadowMode ? 'Vecteurs Shadow' : 'Vecteurs Cibles'}
                    </h4>
                    <div className="space-y-3">
                        {candidates.slice(0, 15).map(c => (
                            <button 
                                key={c.candidate} 
                                onClick={() => setSelectedCandidate(c)} 
                                className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all transform active:scale-95 ${selectedCandidate?.candidate === c.candidate ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl scale-[1.02] z-10' : 'bg-slate-50 dark:bg-slate-900 border-transparent opacity-70'}`}
                            >
                                <div className="flex items-center gap-4">
                                    <NumberBall number={c.candidate} size="sm" selected={selectedCandidate?.candidate === c.candidate} />
                                    <span className="font-black text-sm">N°{c.candidate}</span>
                                </div>
                                <span className="text-xs font-black">{c.score}%</span>
                            </button>
                        ))}
                        {candidates.length === 0 && <p className="text-xs text-slate-400 italic text-center p-10">Aucun vecteur stable détecté.</p>}
                    </div>
                </div>

                {/* Analysis Column */}
                <div className="lg:col-span-9 space-y-8">
                    <div className={`p-10 md:p-14 rounded-[4rem] shadow-2xl border min-h-[400px] flex flex-col items-center justify-center relative overflow-hidden group/tree transition-colors duration-700 ${shadowMode ? 'bg-slate-950 border-rose-900/30' : 'bg-slate-950 border-slate-800'}`}>
                        {selectedCandidate ? (
                            <div className="text-center z-10 space-y-6 animate-scale-in">
                                <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest">
                                    <Sparkles size={12}/> Vote de la Forêt Optimisée
                                </div>
                                <div className="flex justify-center transform scale-150">
                                    <NumberBall number={selectedCandidate.candidate} size="xl" />
                                </div>
                                <div className="text-6xl font-black text-white">{selectedCandidate.score}<span className="text-2xl text-slate-500">%</span></div>
                                <p className="text-slate-400 max-w-md mx-auto text-sm font-medium leading-relaxed">
                                    "Sur 100 arbres de décision entraînés sur {selectedFeatures.length} critères, {selectedCandidate.score} ont validé ce vecteur comme étant une bifurcation critique."
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-slate-700">
                                <Cpu size={80} className="mb-8 opacity-5 animate-pulse" />
                                <p className="font-black text-[10px] uppercase tracking-[0.3em]">En attente d'inférence personnalisée</p>
                            </div>
                        )}
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="bg-white dark:bg-slate-800 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-10 flex items-center gap-3">
                                <Cpu size={16} className="text-emerald-500"/> Poids des Caractéristiques Choises
                            </h4>
                            <div className="h-56 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={globalImportance} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.05} />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 9, fontWeight: 'black', fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                        <Bar dataKey="val" radius={[0, 8, 8, 0]} barSize={16}>
                                            {globalImportance.map((_, index) => <Cell key={index} fill={shadowMode ? '#f43f5e' : '#6366f1'} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className={`p-10 rounded-[3.5rem] shadow-2xl relative overflow-hidden flex flex-col justify-between group text-white transition-colors duration-700 ${shadowMode ? 'bg-rose-600' : 'bg-indigo-600'}`}>
                            <div className="absolute top-0 right-0 p-10 opacity-20 group-hover:rotate-12 transition-transform duration-700">
                                {shadowMode ? <ShieldAlert size={60}/> : <Cpu size={60}/>}
                            </div>
                            <div>
                                <h4 className="text-2xl font-black mb-6 tracking-tighter">Diagnostic RF</h4>
                                <div className="space-y-4 border-l-2 border-white/20 pl-6">
                                    <p className="text-white/90 text-sm italic font-medium leading-relaxed">
                                        {shadowMode 
                                            ? "L'algorithme de rupture identifie les zones de silence stochastique. L'entraînement forcé sur vos critères affine la détection des signaux faibles."
                                            : "L'intelligence collective des arbres confirme une corrélation forte sur la base de vos prédicteurs sélectionnés."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
