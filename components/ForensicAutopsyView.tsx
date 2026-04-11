import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { BrainCircuit, Target, AlertTriangle, Lightbulb, Activity, RefreshCw } from 'lucide-react';
import { useToast } from './ui/Toast';
import { audioEngine } from '../utils/audioEngine';

interface ForensicAutopsyViewProps {
    snapshotId: string;
    drawResultId: string;
}

export const ForensicAutopsyView: React.FC<ForensicAutopsyViewProps> = ({ snapshotId, drawResultId }) => {
    const [loading, setLoading] = useState(true);
    const [report, setReport] = useState<any>(null);
    const [snapshot, setSnapshot] = useState<any>(null);
    const { showToast } = useToast();

    const fetchOrGenerateReport = async () => {
        setLoading(true);
        try {
            // 1. Check if report already exists in prediction_snapshots
            const { data: snapData, error: snapError } = await supabase
                .from('prediction_snapshots')
                .select('*, forensic_reports(*)')
                .eq('id', snapshotId)
                .single();

            if (snapError) throw snapError;
            setSnapshot(snapData);

            if (snapData.autopsy_report && snapData.forensic_reports && snapData.forensic_reports.length > 0) {
                setReport(snapData.forensic_reports[0].report_data);
                setLoading(false);
                return;
            }

            // 2. If not, trigger Edge Function
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Non authentifié");

            const { data: result, error: invokeError } = await supabase.functions.invoke('forensic-autopsy', {
                body: { snapshotId, drawResultId }
            });

            if (invokeError) {
                throw new Error(invokeError.message || "Erreur lors de la génération de l'autopsie");
            }

            setReport(result.report.report_data || result.report);
            
            // Refresh snapshot to get near misses
            const { data: updatedSnap } = await supabase
                .from('prediction_snapshots')
                .select('*')
                .eq('id', snapshotId)
                .single();
            
            if (updatedSnap) setSnapshot(updatedSnap);

            audioEngine.play('success');
            showToast("Autopsie générée avec succès", "success");

        } catch (error: any) {
            console.error("Autopsy Error:", error);
            audioEngine.play('error');
            showToast(error.message || "Erreur lors de l'autopsie", "error");
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
                <p className="text-cyan-400 font-mono text-sm animate-pulse">Analyse Forensic en cours via Gemini 3.1 Pro...</p>
            </div>
        );
    }

    if (!report || !snapshot) {
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
                            {snapshot.near_misses && snapshot.near_misses.length > 0 ? (
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
