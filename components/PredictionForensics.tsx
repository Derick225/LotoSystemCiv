
import React, { useState, useEffect, useMemo } from 'react';
import type { ForensicReport, ForensicEvidence, AlgoWeights, AdaptiveRules, PredictionFeedback } from '../types';
import { NumberBall } from './NumberBall';
import { calculateCorrectionsFromForensics, getAlgoWeights, getAdaptiveRules, saveAlgoWeights, normalizeWeights } from '../services/predictionEngine';
import { updatePredictionFeedback } from '../services/predictionHistoryService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { invokeEdgeFunction } from '../services/apiClient';
import { useToast } from './ui/Toast';
import { useNexus } from './NexusProvider';
import { 
    ThumbsUp, ThumbsDown, Meh, CheckCircle2, MessageSquare, BrainCircuit, X as XIcon, 
    AlertOctagon, ScanLine, GitMerge, Microscope, ArrowRight, Activity, Zap, PlayCircle, BarChart3, RefreshCw 
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine, Cell } from 'recharts';

interface PredictionForensicsProps {
    report: ForensicReport;
    onClose: () => void;
}

export const PredictionForensics: React.FC<PredictionForensicsProps> = ({ report, onClose }) => {
    const { showToast } = useToast();
    const { updateGlobalWeights, refreshData } = useNexus();
    
    const [activeTab, setActiveTab] = useState<'ballistic' | 'spectral' | 'simulation'>('ballistic');
    const [applying, setApplying] = useState(false);
    const [submittingFeedback, setSubmittingFeedback] = useState(false);
    const [feedbackSent, setFeedbackSent] = useState(false);
    const [userRating, setUserRating] = useState<PredictionFeedback['userRating'] | null>(null);
    const [userComment, setUserComment] = useState('');
    
    const [bestScenario, setBestScenario] = useState<any | null>(null);

    // Détermination du meilleur scénario contrefactuel au chargement
    useEffect(() => {
        if (report.counterfactuals && report.counterfactuals.length > 0) {
            setBestScenario(report.counterfactuals[0]);
        }
    }, [report]);

    const handleApplyCorrection = async () => {
        if (!bestScenario) return;
        setApplying(true);
        try {
            // 1. Charger les poids actuels
            const currentWeights = await getAlgoWeights(report.drawName);
            
            // 2. Appliquer le boost suggéré par le scénario contrefactuel
            const key = bestScenario.algo as keyof AlgoWeights;
            // Boost significatif (+15% relatif)
            const boost = 0.15; 
            
            const newWeights = { ...currentWeights };
            newWeights[key] = (newWeights[key] || 0) + boost;
            
            const normalized = normalizeWeights(newWeights);

            // 3. Sauvegarde et Mise à jour
            await saveAlgoWeights(report.drawName, normalized);
            await updateGlobalWeights(normalized);
            await refreshData(report.drawName, true); // Recalculer pour voir l'effet

            showToast(`🧬 Mutation ADN : ${bestScenario.algo} renforcé.`, "success");
            setTimeout(onClose, 1500);
        } catch(e) {
            showToast("Erreur d'assimilation.", "error");
            setApplying(false);
        }
    };

    const handleSubmitFeedback = async () => {
        if (!report.predictionId || !userRating) return;
        setSubmittingFeedback(true);
        try {
            updatePredictionFeedback(report.predictionId, {
                keyLearning: userRating === 'Visionnaire' ? 'Résonance validée' : 'Décalage structurel',
                userRating,
                userComment
            });

            if (isSupabaseConfigured()) {
                await invokeEdgeFunction('process-rlhf', {
                    body: {
                        predictionId: report.predictionId,
                        rating: userRating,
                        drawName: report.drawName,
                        actualHits: report.matches.filter(m => m.errorType === 'Hit').length,
                        user_comment: userComment
                    }
                });
            }

            setFeedbackSent(true);
            showToast("Signal RL envoyé au Cloud.", "success");

        } catch (e) {
            showToast("Feedback sauvegardé localement.", "info");
            setFeedbackSent(true);
        } finally {
            setSubmittingFeedback(false);
        }
    };
    
    // Visualization Data
    const spectralChartData = useMemo(() => {
        return report.spectralDeviations?.map(d => ({
            num: d.number,
            prediction: d.predictedEnergy,
            realite: d.actualEnergy,
            delta: d.delta,
            // Couleur dynamique pour la barre Delta
            fill: d.delta > 50 ? '#f43f5e' : '#fbbf24'
        })) || [];
    }, [report]);

    const simChartData = useMemo(() => {
        // On compare le nombre de hits potentiels par algo
        return report.counterfactuals?.slice(0, 6).map(c => ({
            algo: c.algo.charAt(0).toUpperCase() + c.algo.slice(1),
            hits: c.potentialHits,
            color: c.potentialHits >= 3 ? '#10b981' : '#6366f1'
        })) || [];
    }, [report]);

    const getBadgeColor = (type: ForensicEvidence['errorType']) => {
        switch(type) {
            case 'Hit': return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700';
            case 'Voisin': return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700';
            case 'Miroir': return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700';
            case 'Shadow': return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700';
            default: return 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in">
            <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 relative">
                
                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500 rounded-2xl text-white shadow-lg shadow-indigo-500/30">
                            <Microscope size={28} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Forensic Hub</h3>
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                Tirage {report.drawName} • {report.date} 
                                {report.rmse && <span className="bg-slate-200 dark:bg-slate-800 px-2 rounded text-[9px]">RMSE: {report.rmse.toFixed(2)}</span>}
                            </p>
                        </div>
                    </div>
                    
                    {/* Navigation Tabs */}
                    <div className="flex bg-slate-200 dark:bg-slate-900 p-1 rounded-2xl">
                        <button onClick={() => setActiveTab('ballistic')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'ballistic' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-white' : 'text-slate-500'}`}>Balistique</button>
                        <button onClick={() => setActiveTab('spectral')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'spectral' ? 'bg-white dark:bg-slate-700 shadow text-purple-600 dark:text-white' : 'text-slate-500'}`}>Spectral</button>
                        <button onClick={() => setActiveTab('simulation')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'simulation' ? 'bg-white dark:bg-slate-700 shadow text-emerald-600 dark:text-white' : 'text-slate-500'}`}>Simulation</button>
                    </div>

                    <button onClick={onClose} className="p-3 bg-white dark:bg-slate-800 rounded-full hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-500 transition shadow-sm border border-slate-200 dark:border-slate-700">
                        <XIcon size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-10 bg-slate-50/50 dark:bg-slate-900/50">
                    
                    {/* TAB 1: BALLISTIC ANALYSIS */}
                    {activeTab === 'ballistic' && (
                        <div className="animate-slide-up space-y-8">
                            <section className="bg-white dark:bg-slate-950/50 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                                <h4 className="font-black text-slate-400 dark:text-slate-500 mb-8 uppercase text-xs tracking-[0.3em] text-center flex items-center justify-center gap-2">
                                    <ScanLine size={14}/> Trajectoire Vectorielle
                                </h4>
                                
                                <div className="relative flex flex-col md:flex-row justify-between items-center gap-10 md:gap-20">
                                    {/* PREDICTED */}
                                    <div className="flex flex-col gap-4 items-center z-10 w-full md:w-auto">
                                        <span className="text-[9px] font-black text-indigo-500 uppercase bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1 rounded-full">Prédiction IA</span>
                                        <div className="flex flex-wrap md:flex-col gap-3 justify-center">
                                            {report.matches.map((m, i) => (
                                                <div key={`pred-${i}`} className="relative group">
                                                    <NumberBall number={m.predicted} size="md" glow={m.errorType === 'Hit'} />
                                                    {m.errorType !== 'Hit' && m.errorType !== 'None' && (
                                                        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                                                            {m.errorType} ({m.delta})
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* CONNECTORS */}
                                    <div className="hidden md:flex flex-col items-center gap-2 opacity-30 flex-1">
                                        <ArrowRight size={24} className="text-slate-400"/>
                                        <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-400 to-transparent"></div>
                                        <span className="text-[9px] font-mono text-slate-500">MAPPING</span>
                                    </div>

                                    {/* ACTUAL */}
                                    <div className="flex flex-col gap-4 items-center z-10 w-full md:w-auto">
                                        <span className="text-[9px] font-black text-emerald-500 uppercase bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 rounded-full">Résultat Réel</span>
                                        <div className="flex flex-wrap md:flex-col gap-3 justify-center">
                                            {report.matches.map((m, i) => (
                                                <div key={`act-${i}`} className="relative">
                                                    {m.actual !== null ? (
                                                        <div className="relative">
                                                            <NumberBall number={m.actual} size="md" />
                                                            <div className={`absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase border ${getBadgeColor(m.errorType)}`}>
                                                                {m.errorType === 'None' ? 'Miss' : m.errorType}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-300 font-bold">?</div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <div className="grid md:grid-cols-2 gap-6">
                                {report.missedOpportunities.length > 0 && (
                                    <section className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700">
                                        <h4 className="font-black text-slate-700 dark:text-slate-300 mb-4 uppercase text-xs tracking-widest flex items-center gap-2">
                                            <AlertOctagon size={14} className="text-amber-500"/> Signaux Manqués
                                        </h4>
                                        <div className="space-y-3">
                                            {report.missedOpportunities.slice(0, 4).map((miss, idx) => (
                                                <div key={idx} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 p-3 rounded-2xl flex items-center gap-3">
                                                    <NumberBall number={miss.number} size="sm" />
                                                    <div className="flex-1">
                                                        <div className="text-[10px] text-amber-700/80 dark:text-amber-300/70 font-medium leading-tight">{miss.reason}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}
                                
                                <section className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700">
                                    <h4 className="font-black text-slate-700 dark:text-slate-300 mb-4 uppercase text-xs tracking-widest flex items-center gap-2">
                                        <Activity size={14} className="text-indigo-500"/> Dérive Algorithmique
                                    </h4>
                                    <div className="space-y-2">
                                        {report.scoreDivergence.length > 0 ? report.scoreDivergence.map((div, i) => (
                                            <div key={i} className="flex justify-between items-center text-xs">
                                                <span className="font-bold text-slate-600 dark:text-slate-400 capitalize">{div.algo}</span>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                        <div className="h-full bg-indigo-500" style={{ width: `${div.impact}%` }}></div>
                                                    </div>
                                                    <span className="font-mono font-black text-indigo-500">{div.impact}%</span>
                                                </div>
                                            </div>
                                        )) : <p className="text-xs text-slate-400 italic">Aucune divergence majeure.</p>}
                                    </div>
                                </section>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: SPECTRAL DEVIATION */}
                    {activeTab === 'spectral' && (
                        <div className="animate-slide-up space-y-6">
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 h-[400px]">
                                <h4 className="font-black text-slate-700 dark:text-slate-300 mb-6 uppercase text-xs tracking-widest flex items-center gap-2">
                                    <Zap size={14} className="text-purple-500"/> Déviation Énergétique (Prédiction vs Réalité)
                                </h4>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={spectralChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                        <XAxis dataKey="num" tick={{ fontSize: 10 }} />
                                        <YAxis />
                                        <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', fontSize: '11px', color: '#fff' }} />
                                        <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                                        <Bar dataKey="prediction" name="Énergie Prédite" fill="#8884d8" radius={[4, 4, 0, 0]} barSize={20} />
                                        <Bar dataKey="realite" name="Énergie Réelle" fill="#82ca9d" radius={[4, 4, 0, 0]} barSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            
                            <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-2xl border border-purple-100 dark:border-purple-800/30 text-xs text-purple-800 dark:text-purple-300 font-medium">
                                <p className="leading-relaxed">
                                    <strong>Interprétation :</strong> Une grande différence (barre verte vs violette) indique que le modèle spectral a mal calibré la "chaleur" du numéro. 
                                    Si la barre verte est haute mais la violette basse, l'algorithme "Spectral" doit être renforcé (+Poids).
                                </p>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: COUNTERFACTUAL SIMULATION */}
                    {activeTab === 'simulation' && (
                        <div className="animate-slide-up space-y-6">
                            <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-6 opacity-10"><PlayCircle size={100} /></div>
                                <h4 className="text-white font-black uppercase text-sm tracking-widest mb-4 flex items-center gap-2">
                                    <BrainCircuit size={18} className="text-emerald-400"/> Moteur Contrefactuel ("What If")
                                </h4>
                                <p className="text-slate-400 text-xs mb-6 max-w-lg">
                                    Simulation temps réel : Performances des algorithmes isolés sur ce tirage. 
                                </p>

                                {bestScenario ? (
                                    <div className="space-y-6">
                                        {/* Chart Comparatif */}
                                        <div className="h-48 w-full bg-black/30 rounded-2xl p-4 border border-white/5">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={simChartData} layout="vertical">
                                                    <XAxis type="number" hide />
                                                    <YAxis dataKey="algo" type="category" width={80} tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 'bold'}} />
                                                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', fontSize: '10px' }} />
                                                    <Bar dataKey="hits" radius={[0, 4, 4, 0]} barSize={16}>
                                                        {simChartData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>

                                        <div className="flex items-start gap-3 text-xs text-slate-300 bg-white/5 p-4 rounded-xl border border-white/5">
                                            <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
                                                <Zap size={16}/>
                                            </div>
                                            <div>
                                                <span className="text-emerald-400 font-bold block mb-1">DÉCOUVERTE MAJEURE</span>
                                                L'algorithme <strong className="text-white">{bestScenario.algo}</strong> a isolé {bestScenario.potentialHits} gagnants ({bestScenario.potentialNumbers.join(', ')}). 
                                                Le renforcer aurait amélioré la précision.
                                            </div>
                                        </div>
                                        
                                        <button 
                                            onClick={handleApplyCorrection} 
                                            disabled={applying}
                                            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl uppercase text-xs tracking-widest shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95 group"
                                        >
                                            {applying ? <RefreshCw className="animate-spin" size={16}/> : <GitMerge size={16}/>}
                                            Appliquer le Patch Cognitif
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center text-slate-500 text-xs italic py-10">
                                        Aucun scénario contrefactuel significatif trouvé (Performance standard).
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* FEEDBACK SECTION (Always visible at bottom) */}
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-8">
                        <div className="flex items-center gap-3 mb-4">
                            <MessageSquare size={18} className="text-slate-400"/>
                            <h4 className="font-black text-slate-600 dark:text-slate-300 uppercase text-xs tracking-widest">Feedback Opérateur (RLHF)</h4>
                        </div>
                        
                        {feedbackSent ? (
                            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 text-center animate-fade-in">
                                <p className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center gap-2">
                                    <CheckCircle2 size={16}/> Signal RL transmis avec succès
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex gap-2 justify-center">
                                    {[{ id: 'Visionnaire', icon: <ThumbsUp size={16}/>, color: 'bg-emerald-500' }, { id: 'Standard', icon: <Meh size={16}/>, color: 'bg-amber-500' }, { id: 'Incohérente', icon: <ThumbsDown size={16}/>, color: 'bg-rose-500' }].map((rate) => (
                                        <button 
                                            key={rate.id} 
                                            onClick={() => setUserRating(rate.id as any)} 
                                            className={`flex-1 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all transform active:scale-95 ${userRating === rate.id ? `${rate.color} text-white shadow-lg scale-105` : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                        >
                                            {rate.icon} {rate.id}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={userComment} 
                                        onChange={(e) => setUserComment(e.target.value)} 
                                        placeholder="Observation technique optionnelle..." 
                                        className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs outline-none focus:border-indigo-500 transition-colors" 
                                    />
                                    <button 
                                        onClick={handleSubmitFeedback} 
                                        disabled={!userRating || submittingFeedback} 
                                        className="px-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50 hover:opacity-90 transition-opacity"
                                    >
                                        Envoyer
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
