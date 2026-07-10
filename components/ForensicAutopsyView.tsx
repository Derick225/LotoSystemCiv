import { logger } from '../utils/logger';
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { BrainCircuit, Target, AlertTriangle, Lightbulb, Activity, RefreshCw, Cpu } from 'lucide-react';
import { useToast } from './ui/Toast';
import { audioEngine } from '../utils/audioEngine';
import { generateAutopsyAnalysis } from '../services/geminiService';
import { LearningService } from '../services/learningService';
import { useNexusStore } from '../store/useNexusStore';
import { ForensicReport, ForensicEvidence, AlgoWeights, NeuralFeedbackLog } from '../types';
import { normalizeWeights } from '../services/prediction/weightsManager';
import { logError, AppError } from '../utils/AppError';

interface ForensicAutopsyViewProps {
    snapshotId: string;
    drawResultId: string;
    existingReport?: ForensicReport;
    localReport?: ForensicReport;
}

export const ForensicAutopsyView: React.FC<ForensicAutopsyViewProps> = ({ snapshotId, drawResultId, existingReport, localReport }) => {
    const [loading, setLoading] = useState(!existingReport);
    const [report, setReport] = useState<ForensicReport | null>(existingReport || null);
    const [error, setError] = useState<string | null>(null);
    const { showToast } = useToast();
    const updateGlobalWeights = useNexusStore(state => state.updateGlobalWeights);
    const refreshData = useNexusStore(state => state.refreshData);
    const globalWeights = useNexusStore(state => state.globalWeights);
    const drawName = useNexusStore(state => state.drawName);
    const [balancing, setBalancing] = useState(false);

    const handleRebalance = async () => {
        const dName = report?.drawName || localReport?.drawName || drawName || "Loto 5/90";
        if (!report || !dName) return;
        audioEngine.play('scan');
        setBalancing(true);
        try {
            const result = await LearningService.triggerAutoLearning(dName, undefined);
            if (result && result.improvement && result.weights) {
                const oldW = { ...globalWeights };
                const newW = result.weights;
                await updateGlobalWeights(newW, dName);
                await refreshData(dName, true);
                
                // Enregistrement des logs de feedback neuronal
                const feedbackLogs: NeuralFeedbackLog[] = [];
                Object.keys(newW).forEach(algo => {
                    const oVal = Number(oldW[algo as keyof AlgoWeights]) || 0;
                    const nVal = Number(newW[algo as keyof AlgoWeights]) || 0;
                    const diff = nVal - oVal;
                    if (Math.abs(diff) > 0.0001) {
                        const impactPercentage = oVal > 0 ? (diff / oVal) * 100 : diff * 100;
                        feedbackLogs.push({
                            id: `log_${Date.now()}_${algo}_${Math.random().toString(36).substr(2, 5)}`,
                            timestamp: Date.now(),
                            drawName: dName,
                            algo,
                            oldWeight: oVal,
                            newWeight: nVal,
                            direction: diff > 0 ? 'BOOST' : (diff < 0 ? 'REDUCE' : 'STABILIZE'),
                            impactPercentage: parseFloat(impactPercentage.toFixed(2)),
                            reason: result.criticalDecision || result.message || "Rééquilibrage d'ADN post-tirage"
                        });
                    }
                });
                if (feedbackLogs.length > 0) {
                    useNexusStore.getState().addNeuralFeedbackLogs(feedbackLogs);
                }

                audioEngine.play('success');
                showToast(result.message, "success");
            } else {
                audioEngine.play('click');
                showToast(result?.message || "Aucun rééquilibrage critique nécessaire pour le moment.", "info");
            }
        } catch (e) {
            logError(new AppError("Échec du rééquilibrage ADN.", "REBALANCE_ERROR", "high", { error: e }));
            audioEngine.play('error');
            showToast("Échec du rééquilibrage ADN.", "error");
        } finally {
            setBalancing(false);
        }
    };

    const handleApplyAdjustments = async () => {
        if (!report || !report.proposedAdjustments || report.proposedAdjustments.length === 0) return;
        audioEngine.play('scan');
        setBalancing(true);
        try {
            const newWeights: AlgoWeights = { ...globalWeights };
            let updated = false;

            for (const adj of report.proposedAdjustments) {
                if (adj.algo && adj.proposedWeightChange) {
                    const algoKey = adj.algo as keyof AlgoWeights;
                    if (newWeights[algoKey] !== undefined) {
                        newWeights[algoKey] = Math.max(0, parseFloat((Number(newWeights[algoKey]) + adj.proposedWeightChange).toFixed(3)));
                        updated = true;
                    }
                }
            }

            if (updated) {
                const finalNormalized = normalizeWeights(newWeights);
                const targetDraw = report?.drawName || localReport?.drawName || drawName || "Loto 5/90";
                await updateGlobalWeights(finalNormalized, targetDraw);
                
                // Enregistrement des logs de feedback neuronal
                const feedbackLogs: NeuralFeedbackLog[] = [];
                report.proposedAdjustments.forEach(adj => {
                    const algoKey = adj.algo as keyof AlgoWeights;
                    const oldW = Number(globalWeights[algoKey]) || 0;
                    const newW = finalNormalized[algoKey] ?? 0;
                    const diff = newW - oldW;
                    if (Math.abs(diff) > 0.0001) {
                        const impactPercentage = oldW > 0 ? (diff / oldW) * 100 : diff * 100;
                        feedbackLogs.push({
                            id: `log_${Date.now()}_${adj.algo}_${Math.random().toString(36).substr(2, 5)}`,
                            timestamp: Date.now(),
                            drawName: targetDraw,
                            algo: adj.algo,
                            oldWeight: oldW,
                            newWeight: newW,
                            direction: diff > 0 ? 'BOOST' : (diff < 0 ? 'REDUCE' : 'STABILIZE'),
                            impactPercentage: parseFloat(impactPercentage.toFixed(2)),
                            reason: adj.reason || "Ajustement d'autopsie post-tirage"
                        });
                    }
                });
                
                if (feedbackLogs.length > 0) {
                    useNexusStore.getState().addNeuralFeedbackLogs(feedbackLogs);
                }

                audioEngine.play('success');
                showToast("Ajustements Auto-Tune appliqués avec succès.", "success");
            } else {
                audioEngine.play('click');
                showToast("Aucun ajustement direct applicable sur les algos connus.", "info");
            }
        } catch (e) {
            logError(new AppError("Échec de l'Auto-Tune.", "AUTOTUNE_ERROR", "high", { error: e }));
            audioEngine.play('error');
            showToast("Échec de l'Auto-Tune.", "error");
        } finally {
            setBalancing(false);
        }
    };

    const fetchOrGenerateReport = async () => {
        if (!existingReport && !localReport) setLoading(true);
        setError(null);
        try {
            let baseReport = existingReport || localReport;
            let actual: number[] = [];
            let machine: number[] = [];

            if (!baseReport && snapshotId) {
                try {
                    const { data: snapData } = await supabase
                        .from('prediction_snapshots')
                        .select('autopsy_report')
                        .eq('id', snapshotId)
                        .single();
                        
                    if (snapData?.autopsy_report) {
                        baseReport = snapData.autopsy_report;
                    }
                } catch(e) {
                    logError(new AppError("Impossible de récupérer le rapport.", "FETCH_REPORT_ERROR", "low", { error: e }));
                }
            }

            if (!baseReport) {
                throw new Error("Impossible de trouver le rapport d'autopsie initial (local ou distant).");
            }

            if (baseReport.aiAnalysis) {
                setReport(baseReport);
                setLoading(false);
                return;
            }

            let targetDrawName = baseReport.drawName;
            let targetDate = baseReport.date;
            try {
                if (drawResultId) {
                    const { data: resultData } = await supabase
                        .from('draw_results')
                        .select('gagnants, machine')
                        .eq('id', drawResultId)
                        .maybeSingle();

                    if (resultData) {
                        actual = resultData.gagnants || [];
                        machine = resultData.machine || [];
                    }
                }
            } catch (err) {
                logError(new AppError("Impossible de récupérer le tirage.", "FETCH_DRAW_ERROR", "low", { error: err }));
            }

            let predicted = baseReport.matches?.map((m: ForensicEvidence) => m.predicted) || [];
            predicted = Array.from(new Set(predicted)) as number[];
            
            if (actual.length === 0) {
                 actual = baseReport.matches?.filter((m: ForensicEvidence) => m.errorType === 'Hit').map((m: ForensicEvidence) => m.actual!).filter((n: number | null) => n !== null) as number[];
            }

            const exactHitsCount = baseReport.matches?.filter((m: ForensicEvidence) => m.errorType === 'Hit').length || 0;
            const nearMissesCount = baseReport.matches?.filter((m: ForensicEvidence) => ['Voisin', 'Miroir', 'Shadow'].includes(m.errorType)).length || 0;
            
            let machineHits = 0;
            if (machine && machine.length > 0) {
                predicted.forEach((n: number) => {
                    if (machine.includes(n)) machineHits++;
                });
            } else if (baseReport.matches) {
                machineHits = baseReport.matches.filter((m: ForensicEvidence) => m.errorType === 'Machine').length || 0;
            }

            const geminiResult = await generateAutopsyAnalysis(
                baseReport.drawName || localReport?.drawName || drawName || "Loto 5/90",
                predicted, 
                actual, 
                machine, 
                exactHitsCount, 
                nearMissesCount, 
                machineHits,
                baseReport.rmse,
                baseReport.spectralDeviations,
                baseReport.entropyCollapse,
                baseReport.benfordCompliance
            );
            
            let aiAnalysis = "Analyse non disponible.";
            let recommendations: string[] = ["Maintenir les paramètres actuels."];
            let modelUsed = "deterministic-fallback";

            if (geminiResult) {
                aiAnalysis = geminiResult.analysis;
                recommendations = geminiResult.recommendations;
                modelUsed = "gemini-2.5-flash";
            } else {
                if (exactHitsCount >= 3) aiAnalysis = "Excellente convergence des signaux. Le modèle a parfaitement capté la tendance.";
                else if (exactHitsCount === 2 && nearMissesCount >= 2) aiAnalysis = "Forte proximité. Léger décalage de phase détecté.";
                else if (nearMissesCount >= 3) aiAnalysis = "Décalage spectral important. Les numéros étaient adjacents.";
                else aiAnalysis = "Divergence totale. Le cycle a probablement subi une rupture brutale.";
            }

            const finalReport: ForensicReport = {
                ...baseReport,
                aiAnalysis,
                recommendations,
                modelUsed,
                isBlackSwan: geminiResult?.isBlackSwan || false
            };

            try {
                const { saveForensicReport, syncForensicReportsWithCloud } = await import('../services/postPredictionAnalysisService');
                saveForensicReport(finalReport);
                syncForensicReportsWithCloud().catch((e) => logger.error('Background sync failed', e));
            } catch (e) {
                logError(new AppError("Could not save to local storage", "LOCAL_SAVE_ERROR", "low", { error: e }));
            }

            const { data: { session } } = await supabase.auth.getSession();
            const activeUserId = session?.user?.id;

            if (activeUserId && snapshotId && targetDrawName && targetDate && drawResultId) {
                try {
                    const { error: upsertError } = await supabase.from('forensic_reports').upsert({
                        user_id: activeUserId,
                        prediction_id: snapshotId,
                        draw_name: targetDrawName,
                        draw_date: targetDate,
                        draw_result_id: drawResultId,
                        report_data: finalReport,
                        ai_model_used: modelUsed
                    }, { onConflict: 'prediction_id' });
                    
                    if (upsertError) console.warn("Forensic upsert issues (expected in generic mode)");

                    const { error: snapUpdateError } = await supabase.from('prediction_snapshots').update({
                        status: 'COMPLETED',
                        autopsy_report: finalReport,
                        updated_at: new Date().toISOString()
                    }).eq('id', snapshotId);
                    if (snapUpdateError) console.warn("Snapshot update rejected by RLS (expected in generic mode)");
                } catch(e) {
                    console.warn("Could not save autopsy to Supabase (RLS or offline)", e);
                }
            }

            setReport(finalReport);
            audioEngine.play('success');
            showToast("Autopsie générée avec succès", "success");

        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logError(new AppError("Autopsy Error", "AUTOPSY_ERROR", "high", { error: err }));
            setError(message || "Erreur lors de l'autopsie");
            audioEngine.play('error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (snapshotId && drawResultId) {
            fetchOrGenerateReport();

            const channel = supabase.channel(`sync-autopsy-${snapshotId}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'prediction_snapshots',
                        filter: `id=eq.${snapshotId}`
                    },
                    (payload) => {
                        if (payload.new && payload.new.autopsy_report) {
                            setReport(payload.new.autopsy_report);
                            setLoading(false);
                            showToast("Rapport Forensic synchronisé depuis le Cloud", "success");
                        }
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [snapshotId, drawResultId]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-4 bg-gray-900/50 rounded-xl border border-gray-800">
                <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                <p className="text-cyan-400 font-mono text-sm animate-pulse">Analyse Forensic en cours via Gemini 2.5 Flash...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-4 bg-red-900/20 rounded-xl border border-red-800/30">
                <AlertTriangle className="w-8 h-8 text-red-400" />
                <p className="text-red-400 font-mono text-sm">{error}</p>
                <button onClick={() => fetchOrGenerateReport()} className="px-4 py-2 bg-red-800/50 hover:bg-red-700/50 text-white rounded text-xs font-bold transition-colors">Réessayer l'Analyse</button>
            </div>
        );
    }

    if (!report) {
        return (
            <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-xl text-red-400 text-center">
                Impossible de charger l'autopsie.
            </div>
        );
    }

    return (
        <div className="space-y-6 bg-gray-900/80 p-6 rounded-xl border border-gray-800">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                <div className="flex items-center space-x-3">
                    <BrainCircuit className="w-6 h-6 text-purple-400" />
                    <h3 className="text-xl font-bold text-white">Rapport d'Autopsie IA</h3>
                </div>
                <div className="flex items-center gap-3">
                    {report.isBlackSwan && (
                        <div className="flex items-center space-x-2 bg-rose-900/40 border border-rose-500/50 px-3 py-1 rounded-full animate-pulse">
                            <span className="text-rose-400 font-black text-[10px] uppercase tracking-widest">⚠️ Cygne Noir</span>
                        </div>
                    )}
                    <div className="flex items-center space-x-2 bg-gray-800 px-3 py-1 rounded-full">
                        <Target className="w-4 h-4 text-cyan-400" />
                        <span className="text-cyan-400 font-mono font-bold">{report.divergenceMetric !== undefined ? 100 - report.divergenceMetric : 'N/A'}/100</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        <h4 className="text-sm font-semibold text-gray-400 mb-2 flex items-center">
                            <Activity className="w-4 h-4 mr-2 text-blue-400" />
                            Near Misses (+/- 1 & Ombres)
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {report?.nearMisses && report.nearMisses.length > 0 ? (
                                report.nearMisses.map((nm: { predicted: number; actual: number }, idx: number) => (
                                    <span key={idx} className="px-2 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded font-mono text-sm">
                                        Pré.{nm.predicted} ➔ Réel {nm.actual}
                                    </span>
                                ))
                            ) : (
                                <span className="text-gray-500 text-sm">Aucun near miss détecté</span>
                            )}
                        </div>
                    </div>
                    
                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        <h4 className="text-sm font-semibold text-gray-400 mb-2 flex items-center">
                            <Target className="w-4 h-4 mr-2 text-rose-400" />
                            Signaux Manqués
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {report?.missedSignals && report.missedSignals.length > 0 ? (
                                report.missedSignals.map((ms: { pattern: string }, idx: number) => (
                                    <span key={idx} className="px-2 py-1 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded font-mono text-xs">
                                        {ms.pattern}
                                    </span>
                                ))
                            ) : (
                                <span className="text-gray-500 text-sm">Aucune anomalie globale manquée</span>
                            )}
                        </div>
                    </div>
                    
                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        <h4 className="text-sm font-semibold text-gray-400 mb-2 flex items-center">
                            <Activity className="w-4 h-4 mr-2 text-indigo-400" />
                            Dérives Algorithmiques & Signatures
                        </h4>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {report?.algorithmicDrift && report.algorithmicDrift.length > 0 ? (
                                report.algorithmicDrift.map((drift: { algo: string; direction: string }, idx: number) => (
                                    <span key={idx} className={`px-2 py-1 rounded font-mono text-xs ${drift.direction === 'underestimating' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'}`}>
                                        {drift.algo} ({drift.direction === 'underestimating' ? 'Sous-évalué' : 'Sur-évalué'})
                                    </span>
                                ))
                            ) : (
                                <span className="text-gray-500 text-sm">Réseau Neuronal Stable (Aucune dérive)</span>
                            )}
                        </div>
                        
                        {report?.proposedAdjustments && report.proposedAdjustments.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-700/50">
                                <h5 className="text-xs font-semibold text-pink-400 mb-2 flex items-center uppercase tracking-wider">
                                    <Cpu className="w-3 h-3 mr-1" />
                                    Ajustements de Poids Proposés
                                </h5>
                                <div className="space-y-2">
                                    {report.proposedAdjustments.map((adj: { algo: string; proposedWeightChange: number; reason: string }, idx: number) => (
                                        <div key={idx} className="flex flex-col bg-gray-900/50 p-2 rounded text-xs border border-gray-800">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-mono text-gray-300 font-bold">{adj.algo}</span>
                                                <span className={`font-mono font-bold ${adj.proposedWeightChange > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {adj.proposedWeightChange > 0 ? '+' : ''}{adj.proposedWeightChange}
                                                </span>
                                            </div>
                                            <span className="text-gray-500 text-[10px] italic">{adj.reason}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 flex justify-end">
                                    <button 
                                        onClick={handleApplyAdjustments}
                                        disabled={balancing}
                                        className="flex items-center gap-2 bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/30 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
                                    >
                                        <Cpu className="w-3 h-3" />
                                        Auto-Tuner (Appliquer)
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        <h4 className="text-sm font-semibold text-gray-400 mb-2 flex items-center">
                            <AlertTriangle className="w-4 h-4 mr-2 text-orange-400" />
                            Précision Mathématique
                        </h4>
                        <div className="space-y-2">
                            <p className="text-orange-300 text-sm">RMSE (Standard): {report.rmse ? report.rmse.toFixed(2) : 'N/A'}</p>
                            <p className="text-pink-300 text-sm">Perte Topologique (Spatiale): {report.continuousTopologicalLoss !== undefined ? report.continuousTopologicalLoss.toFixed(3) : 'N/A'} <span className="text-gray-500 text-[10px]">(0 = Parfait, 5 = Bruit)</span></p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        <h4 className="text-sm font-semibold text-gray-400 mb-2">Analyse Post-Mortem</h4>
                        <p className="text-gray-300 text-sm leading-relaxed">{report.aiAnalysis || (report as { analysis?: string }).analysis}</p>
                    </div>

                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        <h4 className="text-sm font-semibold text-gray-400 mb-2 flex items-center">
                            <Lightbulb className="w-4 h-4 mr-2 text-green-400" />
                            Recommandations
                        </h4>
                        <ul className="text-green-300 text-sm leading-relaxed list-disc pl-4 space-y-1">
                            {Array.isArray(report.recommendations) ? (
                                report.recommendations.map((rec: string, i: number) => <li key={i}>{rec}</li>)
                            ) : (
                                <li>{report.recommendations}</li>
                            )}
                        </ul>
                    </div>
                </div>
            </div>

            <div className="flex justify-center pt-4 border-t border-gray-800">
                <button
                    onClick={handleRebalance}
                    disabled={balancing}
                    className={`flex items-center space-x-2 px-6 py-3 rounded-xl font-bold uppercase tracking-wider text-xs transition-all ${
                        balancing 
                        ? 'bg-purple-900/40 text-purple-400 cursor-wait animate-pulse' 
                        : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20'
                    }`}
                >
                    <Cpu className={`w-4 h-4 ${balancing ? 'animate-spin' : ''}`} />
                    <span>{balancing ? 'Rééquilibrage...' : 'Rééquilibrer via Forensic'}</span>
                </button>
            </div>
        </div>
    );
};
