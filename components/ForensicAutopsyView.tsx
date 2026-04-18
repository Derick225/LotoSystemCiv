import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { BrainCircuit, Target, AlertTriangle, Lightbulb, Activity, RefreshCw } from 'lucide-react';
import { useToast } from './ui/Toast';
import { audioEngine } from '../utils/audioEngine';
import { generateAutopsyAnalysis } from '../services/geminiService';

interface ForensicAutopsyViewProps {
    snapshotId: string;
    drawResultId: string;
    existingReport?: any;
    localReport?: any;
}

export const ForensicAutopsyView: React.FC<ForensicAutopsyViewProps> = ({ snapshotId, drawResultId, existingReport, localReport }) => {
    const [loading, setLoading] = useState(!existingReport);
    const [report, setReport] = useState<any>(existingReport || null);
    const [snapshot, setSnapshot] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const { showToast } = useToast();

    const fetchOrGenerateReport = async () => {
        if (!existingReport) setLoading(true);
        setError(null);
        try {
            let predicted: number[] = [];
            let actual: number[] = [];
            let machine: number[] = [];
            let userId: string | null = null;
            let targetDrawName: string | null = null;
            let targetDate: string | null = null;
            let targetResultId: string | null = null;
            let nearMissesDetails: any[] = [];

            // 1. Essayer de récupérer depuis Supabase
            try {
                const { data: snapData } = await supabase
                    .from('prediction_snapshots')
                    .select('*')
                    .eq('id', snapshotId)
                    .single();

                if (snapData) {
                    setSnapshot(snapData);
                    if (existingReport) {
                        setLoading(false);
                        return;
                    }
                    if (snapData.autopsy_report) {
                        setReport(snapData.autopsy_report);
                        setLoading(false);
                        return;
                    }
                    predicted = snapData.predicted_numbers || [];
                    userId = snapData.user_id;
                    targetDrawName = snapData.draw_name;
                }
            } catch (err) {
                console.warn("Could not fetch prediction_snapshot from Supabase. Falling back to localReport.");
            }

            try {
                const { data: resultData } = await supabase
                    .from('draw_results')
                    .select('*')
                    .eq('id', drawResultId)
                    .single();

                if (resultData) {
                    actual = resultData.gagnants || [];
                    machine = resultData.machine || [];
                    targetDate = resultData.date;
                    targetResultId = resultData.id;
                }
            } catch (err) {
               console.warn("Could not fetch draw_results from Supabase. Falling back to localReport.");
            }

            // 2. Fallback complet sur localReport (PredictionHistoryItem -> ForensicReport)
            if (predicted.length === 0 && localReport && localReport.matches) {
                predicted = localReport.matches.map((m: any) => m.predicted).filter((v: any, i: number, a: any) => a.indexOf(v) === i);
            }
            if (actual.length === 0 && localReport && localReport.matches) {
                actual = localReport.matches.filter((m: any) => m.errorType === 'Hit').map((m: any) => m.actual);
                // Impossible de déduire tous les gagnants exacts depuis les matchs uniquement,
                // mais si on en a besoin on va devoir utiliser ce qu'on a.
            }
            
            if (predicted.length === 0) {
                 throw new Error("Données de prédiction introuvables. Le tirage n'est peut-être pas correctement lié.");
            }

            // 3. Calculate deterministic metrics
            let exactHits = 0;
            let nearMissesCount = 0;
            let machineHits = 0;

            predicted.forEach((p: number) => {
                if (actual && actual.length > 0 && actual.includes(p)) {
                    exactHits++;
                } else if (actual && actual.length > 0) {
                    if (actual.includes(p - 1)) { nearMissesCount++; nearMissesDetails.push({ predicted: p, actual: p - 1, type: '-1' }); }
                    if (actual.includes(p + 1)) { nearMissesCount++; nearMissesDetails.push({ predicted: p, actual: p + 1, type: '+1' }); }
                }
                if (machine && machine.length > 0 && machine.includes(p)) machineHits++;
            });

            // Fallback si "actual" était vide mais que le localReport avait l'info
            if (exactHits === 0 && localReport && localReport.matches) {
                 exactHits = localReport.matches.filter((m: any) => m.errorType === 'Hit').length;
                 nearMissesCount = localReport.matches.filter((m: any) => m.errorType === 'Voisin').length;
            }

            const scoreDivergence = Math.abs(5 - exactHits) * 20;

            // 4. Call Gemini for analysis
            let aiAnalysis = "Analyse non disponible.";
            let recommendations: string[] = ["Maintenir les paramètres actuels."];
            let modelUsed = "deterministic-fallback";

            const geminiResult = await generateAutopsyAnalysis(predicted, actual, machine, exactHits, nearMissesCount, machineHits);
            
            if (geminiResult) {
                aiAnalysis = geminiResult.analysis;
                recommendations = geminiResult.recommendations;
                modelUsed = "gemini-2.5-flash";
            } else {
                // Fallback
                if (exactHits >= 3) aiAnalysis = "Excellente convergence des signaux. Le modèle a parfaitement capté la tendance.";
                else if (exactHits === 2 && nearMissesCount >= 2) aiAnalysis = "Forte proximité. Léger décalage de phase détecté.";
                else if (nearMissesCount >= 3) aiAnalysis = "Décalage spectral important. Les numéros étaient adjacents.";
                else aiAnalysis = "Divergence totale. Le cycle a probablement subi une rupture brutale.";
                
                if (scoreDivergence > 30) recommendations = ["Réduire le poids de l'historique long terme."];
            }

            const finalReport = {
                matches: exactHits,
                nearMisses: nearMissesCount,
                scoreDivergence,
                aiAnalysis,
                recommendations,
                modelUsed
            };

            // 5. Save to database (only if user is authenticated and snapshot exists in Supabase)
            if (userId && snapshotId && targetDrawName && targetDate && targetResultId) {
                try {
                    await supabase.from('forensic_reports').insert({
                        user_id: userId,
                        prediction_id: snapshotId,
                        draw_name: targetDrawName,
                        draw_date: targetDate,
                        draw_result_id: targetResultId,
                        report_data: finalReport,
                        ai_model_used: modelUsed
                    });

                    await supabase.from('prediction_snapshots').update({
                        status: 'COMPLETED',
                        actual_numbers: actual,
                        near_misses: nearMissesDetails,
                        autopsy_report: finalReport,
                        updated_at: new Date().toISOString()
                    }).eq('id', snapshotId);
                } catch(e) {
                    console.warn("Could not save to Supabase.");
                }
            }

            setReport(finalReport);
            audioEngine.play('success');
            showToast("Autopsie générée avec succès", "success");

        } catch (err: any) {
            console.error("Autopsy Error:", err);
            setError(err.message || "Erreur lors de l'autopsie");
            audioEngine.play('error');
            // Toast removed to avoid spam, error will be visible
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (snapshotId && drawResultId) {
            fetchOrGenerateReport();
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
                <div className="flex items-center space-x-2 bg-gray-800 px-3 py-1 rounded-full">
                    <Target className="w-4 h-4 text-cyan-400" />
                    <span className="text-cyan-400 font-mono font-bold">{report.scoreDivergence !== undefined ? 100 - report.scoreDivergence : 'N/A'}/100</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Metrics & Near Misses */}
                <div className="space-y-4">
                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        <h4 className="text-sm font-semibold text-gray-400 mb-2 flex items-center">
                            <Activity className="w-4 h-4 mr-2 text-blue-400" />
                            Near Misses (+/- 1)
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {snapshot?.near_misses && snapshot.near_misses.length > 0 ? (
                                snapshot.near_misses.map((nm: any, idx: number) => (
                                    <span key={idx} className="px-2 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded font-mono text-sm">
                                        {nm.predicted || nm} ({nm.type || '?'})
                                    </span>
                                ))
                            ) : (
                                <span className="text-gray-500 text-sm">Aucun near miss détecté</span>
                            )}
                        </div>
                    </div>

                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        <h4 className="text-sm font-semibold text-gray-400 mb-2 flex items-center">
                            <AlertTriangle className="w-4 h-4 mr-2 text-orange-400" />
                            Divergence
                        </h4>
                        <p className="text-orange-300 text-sm">Score de divergence: {report.scoreDivergence}</p>
                    </div>
                </div>

                {/* Analysis & Recommendations */}
                <div className="space-y-4">
                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        <h4 className="text-sm font-semibold text-gray-400 mb-2">Analyse Post-Mortem</h4>
                        <p className="text-gray-300 text-sm leading-relaxed">{report.aiAnalysis || report.analysis}</p>
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
        </div>
    );
};
