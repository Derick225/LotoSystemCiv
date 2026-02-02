
import React, { useState, useEffect } from 'react';
import type { ForensicReport, ForensicEvidence, AlgoWeights, AdaptiveRules, PredictionFeedback } from '../types';
import { NumberBall } from './NumberBall';
import { TicketXRay } from './TicketXRay';
import { calculateCorrectionsFromForensics, getAlgoWeights, getAdaptiveRules } from '../services/predictionEngine';
import { updatePredictionFeedback } from '../services/predictionHistoryService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { invokeEdgeFunction } from '../services/apiClient';
import { useToast } from './ui/Toast';
import { useNexus } from './NexusProvider';
import { ThumbsUp, ThumbsDown, Meh, CheckCircle2, MessageSquare, BrainCircuit, X as XIcon, AlertOctagon, ScanLine, GitMerge, Microscope, ArrowRight } from 'lucide-react';

interface PredictionForensicsProps {
    report: ForensicReport;
    onClose: () => void;
}

export const PredictionForensics: React.FC<PredictionForensicsProps> = ({ report, onClose }) => {
    const { showToast } = useToast();
    const { updateGlobalWeights } = useNexus();
    
    const [applying, setApplying] = useState(false);
    const [submittingFeedback, setSubmittingFeedback] = useState(false);
    const [feedbackSent, setFeedbackSent] = useState(false);
    const [userRating, setUserRating] = useState<PredictionFeedback['userRating'] | null>(null);
    const [userComment, setUserComment] = useState('');
    
    const [correctionPlan, setCorrectionPlan] = useState<{ newWeights: AlgoWeights, newRules: AdaptiveRules, reasoning: string[] } | null>(null);
    const [originalWeights, setOriginalWeights] = useState<AlgoWeights | null>(null);
    
    const predictedTicket = report.matches.map(m => m.predicted).sort((a,b) => a-b);

    useEffect(() => {
        const prepCorrection = async () => {
            const currentWeights = await getAlgoWeights(report.drawName);
            const currentRules = getAdaptiveRules(report.drawName);
            setOriginalWeights(currentWeights);
            const plan = calculateCorrectionsFromForensics(currentWeights, currentRules, report);
            setCorrectionPlan(plan);
        }
        prepCorrection();
    }, [report]);

    const handleApplyCorrection = async () => {
        if (!correctionPlan) return;
        setApplying(true);
        try {
            updateGlobalWeights(correctionPlan.newWeights);
            showToast("🧬 ADN Muté & Sauvegardé : Le système a appris.", "success");
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
    
    const getBadgeColor = (type: ForensicEvidence['errorType']) => {
        switch(type) {
            case 'Hit': return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700';
            case 'Voisin': return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700';
            case 'Miroir': return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700';
            case 'Shadow': return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700';
            default: return 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
        }
    };

    const getConnectorStyle = (type: ForensicEvidence['errorType']) => {
        switch(type) {
            case 'Hit': return 'stroke-emerald-500 stroke-[3px]';
            case 'Voisin': return 'stroke-blue-400 stroke-[2px] stroke-dasharray-4';
            case 'Miroir': return 'stroke-purple-400 stroke-[2px] stroke-dasharray-2';
            case 'Shadow': return 'stroke-amber-400 stroke-[2px] stroke-dasharray-1';
            default: return 'stroke-transparent';
        }
    };

    const getWeightDiff = (key: string) => {
        if (!originalWeights || !correctionPlan) return 0;
        const oldVal = (originalWeights[key as keyof AlgoWeights] || 0) * 100;
        const newVal = (correctionPlan.newWeights[key as keyof AlgoWeights] || 0) * 100;
        return parseFloat((newVal - oldVal).toFixed(2));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in">
            <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 relative">
                
                {/* Header */}
                <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-between items-center">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="p-2 bg-indigo-500 rounded-xl text-white shadow-lg shadow-indigo-500/30">
                                <Microscope size={24} />
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Autopsie Balistique</h3>
                        </div>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">
                            Tirage {report.drawName} • {report.date}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white dark:bg-slate-800 rounded-full hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-500 transition shadow-sm border border-slate-200 dark:border-slate-700">
                        <XIcon size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-10">
                    
                    {/* VISUAL WIRING CHART */}
                    <section className="bg-slate-100 dark:bg-slate-950/50 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-800 relative overflow-hidden">
                        <h4 className="font-black text-slate-400 dark:text-slate-500 mb-8 uppercase text-xs tracking-[0.3em] text-center">Trajectoire des Vecteurs</h4>
                        
                        <div className="relative flex justify-between items-stretch gap-10">
                            {/* PREDICTED COLUMN */}
                            <div className="flex flex-col gap-6 items-center z-10">
                                <span className="text-[10px] font-black text-indigo-500 uppercase bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1 rounded-full">Prédiction IA</span>
                                {report.matches.map((m, i) => (
                                    <div key={`pred-${i}`} className="relative group">
                                        <NumberBall number={m.predicted} size="md" glow={m.errorType === 'Hit'} />
                                        <div className="absolute top-1/2 -right-4 w-2 h-2 bg-slate-300 rounded-full -translate-y-1/2" id={`p-node-${i}`}></div>
                                    </div>
                                ))}
                            </div>

                            {/* SVG CONNECTIONS LAYER */}
                            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                                {report.matches.map((m, i) => {
                                    if (m.actual === null) return null;
                                    const y1 = 100 + (i * 64);
                                    const actualIndex = report.matches.findIndex(rm => rm.actual === m.actual);
                                    if (actualIndex === -1) return null;
                                    const y2 = 100 + (actualIndex * 64);
                                    return (
                                        <path 
                                            key={i}
                                            d={`M 80 ${y1} C 200 ${y1}, 200 ${y2}, 320 ${y2}`}
                                            fill="none"
                                            className={getConnectorStyle(m.errorType)}
                                        />
                                    );
                                })}
                            </svg>

                            {/* ACTUAL COLUMN */}
                            <div className="flex flex-col gap-6 items-center z-10">
                                <span className="text-[10px] font-black text-emerald-500 uppercase bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 rounded-full">Résultat Réel</span>
                                {report.matches.map((m, i) => (
                                    <div key={`act-${i}`} className="relative">
                                        <div className="absolute top-1/2 -left-4 w-2 h-2 bg-slate-300 rounded-full -translate-y-1/2"></div>
                                        {m.actual !== null ? (
                                            <div className="relative">
                                                <NumberBall number={m.actual} size="md" />
                                                <div className={`absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase border bg-white dark:bg-slate-900 ${getBadgeColor(m.errorType)}`}>
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
                    </section>

                    {/* CORRECTION PLAN */}
                    {correctionPlan && (
                        <div className="p-8 border-2 border-indigo-500/30 rounded-[2.5rem] bg-indigo-50/50 dark:bg-indigo-900/10 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-6 opacity-10"><GitMerge size={80}/></div>
                            <div className="flex justify-between items-center mb-6">
                                <h4 className="text-sm font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300 flex items-center gap-3">
                                    <BrainCircuit size={18}/> Plan d'Auto-Correction
                                </h4>
                                <span className="text-[9px] font-bold text-slate-400 bg-white/20 px-2 py-1 rounded">Gradient Descent</span>
                            </div>
                            
                            <div className="grid md:grid-cols-2 gap-8">
                                {/* Reasoning List */}
                                <div className="space-y-3">
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Logique de Mutation</div>
                                    {correctionPlan.reasoning.length > 0 ? correctionPlan.reasoning.map((reason, i) => (
                                        <div key={i} className="flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300 bg-white/60 dark:bg-black/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800">
                                            <span className="text-indigo-500 mt-0.5">•</span> 
                                            <span className="leading-relaxed">{reason}</span>
                                        </div>
                                    )) : <div className="text-xs text-slate-400 italic">Aucune correction nécessaire.</div>}
                                </div>

                                {/* Weights Diff Visualization */}
                                <div className="flex flex-col">
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Ajustement des Poids</div>
                                    <div className="flex-1 bg-white/40 dark:bg-black/20 rounded-xl p-4 border border-indigo-100 dark:border-indigo-800 overflow-y-auto max-h-[200px] custom-scrollbar space-y-2">
                                        {Object.keys(correctionPlan.newWeights).map((key) => {
                                            const diff = getWeightDiff(key);
                                            if (Math.abs(diff) < 0.1) return null;
                                            return (
                                                <div key={key} className="flex justify-between items-center text-[10px]">
                                                    <span className="font-bold text-slate-600 dark:text-slate-300 uppercase">{key}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-slate-400">{(originalWeights?.[key as keyof AlgoWeights] || 0 * 100).toFixed(1)}%</span>
                                                        <ArrowRight size={10} className="text-slate-400"/>
                                                        <span className={`font-black ${diff > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                            {((correctionPlan.newWeights[key as keyof AlgoWeights] || 0) * 100).toFixed(1)}%
                                                        </span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${diff > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                            {diff > 0 ? '+' : ''}{diff}%
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <button 
                                        onClick={handleApplyCorrection} 
                                        disabled={correctionPlan.reasoning.length === 0 || applying}
                                        className="w-full mt-4 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-indigo-600/30 active:scale-95 transition-all flex items-center justify-center gap-3 group"
                                    >
                                        <BrainCircuit size={18} className={applying ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-700"}/> 
                                        {applying ? 'Mutation...' : 'Appliquer le Gradient'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid md:grid-cols-2 gap-8">
                        {report.missedOpportunities.length > 0 && (
                            <section>
                                <h4 className="font-black text-slate-700 dark:text-slate-300 mb-6 uppercase text-xs tracking-widest flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                                    <AlertOctagon size={14} className="text-amber-500"/> Signaux Manqués
                                </h4>
                                <div className="space-y-3">
                                    {report.missedOpportunities.map((miss, idx) => (
                                        <div key={idx} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 p-4 rounded-2xl flex items-center gap-4 hover:scale-[1.02] transition-transform">
                                            <NumberBall number={miss.number} size="sm" />
                                            <div className="flex-1">
                                                <div className="text-xs font-bold text-amber-900 dark:text-amber-200">Vecteur {miss.number} manqué</div>
                                                <div className="text-[10px] text-amber-700/80 dark:text-amber-300/70 mt-0.5 font-medium leading-tight">{miss.reason}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        <section>
                            <h4 className="font-black text-slate-700 dark:text-slate-300 mb-6 uppercase text-xs tracking-widest flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                                <ScanLine size={14} className="text-indigo-500"/> Scanner Structurel
                            </h4>
                            <TicketXRay numbers={predictedTicket} score={50} showTitle={false} />
                        </section>
                    </div>

                    <section className="bg-slate-50 dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-3 mb-6">
                            <MessageSquare size={18} className="text-slate-400"/>
                            <h4 className="font-black text-slate-600 dark:text-slate-300 uppercase text-xs tracking-widest">Évaluation RLHF</h4>
                        </div>
                        
                        {feedbackSent ? (
                            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 text-center animate-fade-in">
                                <p className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center gap-2">
                                    <CheckCircle2 size={16}/> Signal RL transmis
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <div className="flex justify-center gap-4">
                                    {[{ id: 'Visionnaire', icon: <ThumbsUp size={18}/>, color: 'bg-emerald-500' }, { id: 'Standard', icon: <Meh size={18}/>, color: 'bg-amber-500' }, { id: 'Incohérente', icon: <ThumbsDown size={18}/>, color: 'bg-rose-500' }].map((rate) => (
                                        <button 
                                            key={rate.id} 
                                            onClick={() => setUserRating(rate.id as any)} 
                                            className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all transform active:scale-95 ${userRating === rate.id ? `${rate.color} text-white shadow-lg scale-105` : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'}`}
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
                                        placeholder="Observation technique..." 
                                        className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs outline-none focus:border-indigo-500 transition-colors" 
                                    />
                                    <button 
                                        onClick={handleSubmitFeedback} 
                                        disabled={!userRating || submittingFeedback} 
                                        className="px-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50 hover:opacity-90 transition-opacity"
                                    >
                                        {submittingFeedback ? '...' : 'Envoyer'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
};
