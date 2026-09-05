import React, { useState } from "react";
import type { ForensicReport } from "../types";
import { logError } from "../utils/AppError";
import { deleteForensicReportLocal } from "../services/postPredictionAnalysisService";
import { deleteForensicReportCloud } from "../services/syncService";
import { updatePredictionFeedback } from "../services/predictionHistoryService";
import { isSupabaseConfigured } from "../services/supabaseClient";
import { useToast } from "./ui/Toast";
import { applyBayesianForensicFeedback } from "../services/prediction/weightsManager";
import { generateLearningSession, applyForensicAdjustments } from "../services/forensicTrainingBridge";
import { purifyHistoryForDraw } from "../utils/arrayUtils";
import { useNexusStore } from "../store/useNexusStore";
import { audioEngine } from "../utils/audioEngine";
import {
  ThumbsUp,
  ThumbsDown,
  Meh,
  X as XIcon,
  Trash2,
  Cpu,
  Target,
  Brain,
  AlertTriangle,
  Sparkles,
  Sliders,
  CheckCircle2,
  Info,
  Dna,
  Activity,
  ShieldCheck,
  Zap,
  ArrowRight,
} from "lucide-react";

interface PredictionForensicsProps {
  report: ForensicReport;
  onClose: () => void;
  onDelete?: (id: string) => void;
}

export const PredictionForensics: React.FC<PredictionForensicsProps> = ({
  report,
  onClose,
  onDelete,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const [isApplyingAdjustments, setIsApplyingAdjustments] = useState(false);
  const [adjustmentsApplied, setAdjustmentsApplied] = useState(false);

  const handleDeleteReport = async () => {
    if (
      !window.confirm(
        "Êtes-vous sûr de vouloir supprimer définitivement ce rapport d'autopsie forensique ?",
      )
    )
      return;
    try {
      audioEngine.play("click");
      await deleteForensicReportLocal(report.id, report.predictionId);
      if (isSupabaseConfigured()) await deleteForensicReportCloud(report.id);
      showToast("Rapport d'autopsie définitivement supprimé", "success");
      if (onDelete) {
        onDelete(report.id);
      }
      onClose();
    } catch (error) {
      logError(error, { action: "delete_report_failed" });
      showToast("Erreur lors de la suppression du rapport", "error");
    }
  };

  const isHit = (n: number) => {
    if (!Array.isArray(report.matches)) return false;
    return report.matches.some(
      (m) => m.predicted === n && m.errorType === "Hit",
    );
  };

  const handleApplyRecommendedAdjustments = async () => {
    try {
      setIsApplyingAdjustments(true);
      audioEngine.play("click");
      const currentHistory = purifyHistoryForDraw(report.drawName, history);
      const session = await generateLearningSession(report, currentHistory);
      await applyForensicAdjustments(session, undefined, false);
      setAdjustmentsApplied(true);
      showToast("Ajustements forensiques appliqués aux poids du modèle.", "success");
      audioEngine.play("success");
    } catch (e: any) {
      logError(e, { action: "apply_forensic_adjustments" });
      showToast("Erreur lors de l'application des ajustements.", "error");
    } finally {
      setIsApplyingAdjustments(false);
    }
  };

  const handleFeedback = async (rating: "positive" | "neutral" | "negative") => {
    if (!report.predictionId) {
      showToast("ID de prédiction manquant", "error");
      return;
    }

    const userRating: "Visionnaire" | "Standard" | "Incohérente" = 
      rating === "positive" ? "Visionnaire" : 
      rating === "neutral" ? "Standard" : 
      "Incohérente";

    try {
      audioEngine.play("click");
      await updatePredictionFeedback(report.predictionId, {
        userRating,
        keyLearning: "Ajustement suite à l'autopsie forensique",
        userComment: ""
      });
      await applyBayesianForensicFeedback(report.drawName, report, userRating);
      showToast("Retour enregistré, poids ajustés (RLHF)", "success");
    } catch (e) {
      showToast("Erreur lors de l'enregistrement", "error");
    }
  };

  const verdictLabels: Record<string, string> = {
    anomalousdraw: "Tirage atypique (Déviance de distribution)",
    recentoverfit: "Sur-ajustement court terme (Recent-bias)",
    overconfidence: "Sur-calibration de confiance du modèle",
    structuralmisalignment: "Désalignement structurel",
    regimebreak: "Rupture de distribution statistique",
    normalnoise: "Bruit blanc stochastique standard"
  };

  const currentVerdict = report.failureMode || report.verdict || "normalnoise";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col my-auto max-h-[90vh]">
        {/* HEADER */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 rounded-t-3xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Brain size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                Autopsie Forensique & Diagnostic Post-Mortem
              </h2>
              <p className="text-[10px] text-slate-500 font-medium">
                {report.drawName} • {new Date(report.date).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDeleteReport}
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors"
              title="Supprimer l'autopsie"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <XIcon size={18} />
            </button>
          </div>
        </div>

        {/* CONTENT */}
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-6">
          {/* Top Row: Results & Post-Mortem Stability */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
              <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-3 flex items-center gap-2">
                <Target size={12} className="text-emerald-500" /> Numéros Réels Sortis
              </h3>
              <div className="flex gap-2 flex-wrap items-center">
                {report.combo?.map((n) => {
                  const hit = isHit(n);
                  return (
                    <div
                      key={n}
                      className={`w-9 h-9 rounded-2xl flex items-center justify-center text-xs font-black shadow-sm transition-transform ${
                        hit
                          ? "bg-emerald-500 text-white shadow-emerald-500/30 ring-2 ring-emerald-400"
                          : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {n}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">
                  Stabilité Post-Mortem
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-slate-800 dark:text-white">
                    {report.postMortemStabilityScore ?? report.forensicScore ?? 85}
                  </span>
                  <span className="text-xs text-slate-400 font-bold">/ 100</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2 py-0.5 text-[9px] font-black rounded-lg uppercase border ${
                  report.severity === 'critical'
                    ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                    : report.severity === 'high'
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                }`}>
                  Sévérité : {report.severity || 'low'}
                </span>
              </div>
            </div>
          </div>

          {/* Narrative Remarque & Diagnostic Verdict */}
          <div className="bg-indigo-500/5 border border-indigo-500/20 p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-500" />
                <h4 className="text-xs font-black uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                  Synthèse & Remarques d'Inférence
                </h4>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-500/20">
                {verdictLabels[currentVerdict] || currentVerdict}
              </span>
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {report.aiAnalysis || "Analyse post-mortem calculée continûment sur l'historique complet sans nombre magique."}
            </p>

            {report.dominantCauses && report.dominantCauses.length > 0 && (
              <div className="pt-2 border-t border-indigo-500/10">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">
                  Causes Dominantes Identifiées
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {report.dominantCauses.map((cause, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-medium border border-slate-200 dark:border-slate-700 flex items-center gap-1.5"
                    >
                      <Info size={11} className="text-indigo-500" />
                      {cause}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Statistical Deviations Grid */}
          {report.statisticalDeviations && (
            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
                <Sliders size={12} className="text-indigo-500" />
                Déviations Statistiques Réelles (Z-Scores & P-Values)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Somme (Z-Score)</span>
                  <span className="text-xs font-black font-mono text-slate-800 dark:text-white mt-1 block">
                    {report.statisticalDeviations.sumZScore !== undefined ? `${report.statisticalDeviations.sumZScore > 0 ? '+' : ''}${report.statisticalDeviations.sumZScore.toFixed(2)}σ` : "N/A"}
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Amplitude (Z-Score)</span>
                  <span className="text-xs font-black font-mono text-slate-800 dark:text-white mt-1 block">
                    {report.statisticalDeviations.amplitudeZScore !== undefined ? `${report.statisticalDeviations.amplitudeZScore > 0 ? '+' : ''}${report.statisticalDeviations.amplitudeZScore.toFixed(2)}σ` : "N/A"}
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Indice AC (Z-Score)</span>
                  <span className="text-xs font-black font-mono text-slate-800 dark:text-white mt-1 block">
                    {report.statisticalDeviations.acZScore !== undefined ? `${report.statisticalDeviations.acZScore > 0 ? '+' : ''}${report.statisticalDeviations.acZScore.toFixed(2)}σ` : "N/A"}
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">P-Valeur Parité</span>
                  <span className="text-xs font-black font-mono text-slate-800 dark:text-white mt-1 block">
                    {report.statisticalDeviations.parityPValue !== undefined ? `${(report.statisticalDeviations.parityPValue * 100).toFixed(1)}%` : "N/A"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Actionable Adjustments / Recommendations */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
                <Sliders size={12} className="text-indigo-500" />
                Ajustements Recommandés pour l'Entraînement
              </h4>
              {report.recommendedAdjustments && report.recommendedAdjustments.length > 0 && (
                <button
                  onClick={handleApplyRecommendedAdjustments}
                  disabled={isApplyingAdjustments || adjustmentsApplied}
                  className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                    adjustmentsApplied
                      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md active:scale-95 cursor-pointer"
                  }`}
                >
                  {adjustmentsApplied ? (
                    <>
                      <CheckCircle2 size={12} />
                      Ajustements Appliqués
                    </>
                  ) : (
                    <>
                      <Cpu size={12} />
                      {isApplyingAdjustments ? "Application..." : "Appliquer au Modèle"}
                    </>
                  )}
                </button>
              )}
            </div>

            {report.recommendedAdjustments && report.recommendedAdjustments.length > 0 ? (
              <div className="space-y-2">
                {report.recommendedAdjustments.map((adj, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                          adj.action === 'increase'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : adj.action === 'decrease'
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                        }`}>
                          {adj.action}
                        </span>
                        <span className="font-mono font-bold text-slate-800 dark:text-white">
                          {adj.target}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          (±{(adj.magnitude * 100).toFixed(0)}%)
                        </span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 text-[10px]">
                        {adj.reason}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                Aucun ajustement critique requis. Le modèle est aligné avec le régime de distribution.
              </p>
            )}
          </div>

          {/* SECTION DÉDIÉE : ANALYSE POST-MORTEM SYSTÉMATIQUE DE L'ADN ALGORITHMIQUE */}
          {report.dnaPostMortem && (
            <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-indigo-500/20 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-indigo-500/10">
                <div className="flex items-center gap-2">
                  <Dna size={18} className="text-indigo-500 animate-pulse" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white">
                    Analyse Post-Mortem de l'ADN Algorithmique & Rétroaction Continue
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-lg border border-emerald-500/20 flex items-center gap-1">
                    <ShieldCheck size={12} />
                    Rétroaction Continue Injectée
                  </span>
                </div>
              </div>

              {/* Métriques Quantitatives Précises de l'ADN */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Taux d'Erreur ADN</span>
                  <span className="text-xs font-black font-mono text-rose-500 mt-1 block">
                    {report.dnaPostMortem.dnaErrorRate.toFixed(1)}%
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Distance Wasserstein (W1)</span>
                  <span className="text-xs font-black font-mono text-indigo-500 mt-1 block">
                    {report.dnaPostMortem.dnaWassersteinDistance.toFixed(4)}
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Similarité Cosinus ADN</span>
                  <span className="text-xs font-black font-mono text-emerald-500 mt-1 block">
                    {(report.dnaPostMortem.dnaCosineSimilarity * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Divergence JS</span>
                  <span className="text-xs font-black font-mono text-amber-500 mt-1 block">
                    {report.dnaPostMortem.genomicProfileDivergence.toFixed(4)}
                  </span>
                </div>
              </div>

              {/* Biais Récurrents Identifiés */}
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Activity size={12} className="text-indigo-500" />
                  Biais Récurrents Identifiés dans l'ADN
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50">
                    <span className="text-slate-400 text-[9px] block">Déviation de Parité (Z-Score)</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                      {report.dnaPostMortem.recurrentBiases.paritySkewZScore > 0 ? "+" : ""}
                      {report.dnaPostMortem.recurrentBiases.paritySkewZScore.toFixed(2)}σ
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50">
                    <span className="text-slate-400 text-[9px] block">Gini Décades (Dispersion)</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                      {report.dnaPostMortem.recurrentBiases.decadeConcentrationGini.toFixed(3)}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50">
                    <span className="text-slate-400 text-[9px] block">Excès Hawkes (Auto-excitation)</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                      {report.dnaPostMortem.recurrentBiases.hawkesExcitationExcess.toFixed(2)}
                    </span>
                  </div>
                </div>

                {report.dnaPostMortem.recurrentBiases.dominantGeneBiases.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
                    <span className="text-[9px] text-slate-400 self-center font-bold">Gènes d'ADN Déviants :</span>
                    {report.dnaPostMortem.recurrentBiases.dominantGeneBiases.map((gene, idx) => (
                      <span
                        key={idx}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          gene.direction === "SUR"
                            ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                        }`}
                      >
                        {gene.gene} ({gene.direction === "SUR" ? "+" : "-"}{gene.biasPercent}%)
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Cartographie Continue des Facteurs de Dégradation de la Fiabilité */}
              {report.dnaPostMortem.reliabilityDegradationMap.length > 0 && (
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                    Cartographie Continue des Facteurs de Dégradation de la Fiabilité
                  </span>
                  <div className="space-y-2">
                    {report.dnaPostMortem.reliabilityDegradationMap.map((factor, idx) => (
                      <div key={idx} className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-100 dark:border-slate-700/50 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-700 dark:text-slate-200">{factor.factor}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                            factor.riskLevel === "CRITICAL"
                              ? "bg-rose-500/10 text-rose-500"
                              : factor.riskLevel === "HIGH"
                              ? "bg-amber-500/10 text-amber-500"
                              : factor.riskLevel === "MEDIUM"
                              ? "bg-indigo-500/10 text-indigo-500"
                              : "bg-emerald-500/10 text-emerald-500"
                          }`}>
                            {factor.riskLevel} ({(factor.degradationLevel * 100).toFixed(0)}%)
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-indigo-500">Remédiation :</span> {factor.continuousRemediation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Anomalies Documentées & Actions Correctives Ciblées */}
              {report.dnaPostMortem.classifiedAnomalies.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                    Anomalies Documentées & Actions Correctives Ciblées
                  </span>
                  <div className="space-y-2">
                    {report.dnaPostMortem.classifiedAnomalies.map((anom) => (
                      <div
                        key={anom.id}
                        className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-[11px]"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle size={12} className="text-amber-500" />
                            <span className="font-mono font-bold text-slate-800 dark:text-white">
                              {anom.category}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-rose-500">
                            Impact: {anom.impactScore}%
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-600 dark:text-slate-300">
                          {anom.description}
                        </p>
                        <div className="p-2 bg-indigo-500/5 rounded-lg border border-indigo-500/15 space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                              <Zap size={10} />
                              Action : {anom.correctiveAction.targetParameter}
                            </span>
                            <span className="font-mono text-slate-400">
                              Amortissement: {anom.correctiveAction.dampingFactor}
                            </span>
                          </div>
                          <div className="font-mono text-[9px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 p-1.5 rounded border border-slate-200 dark:border-slate-700">
                            {anom.correctiveAction.adjustmentFormula}
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            {anom.correctiveAction.explanation}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom Grid: Metrics & RLHF */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "RMSE", val: report.rmse?.toFixed(2) ?? "N/A" },
                {
                  label: "Brier Score",
                  val: report.brier_score?.toFixed(4) ?? "N/A",
                },
                {
                  label: "Divergence KL",
                  val: report.kl_divergence?.toFixed(4) ?? "N/A",
                },
                {
                  label: "Wasserstein",
                  val: report.wassersteinLoss?.toFixed(4) ?? "N/A",
                },
                {
                  label: "Entropie Shannon",
                  val: report.shannon_entropy?.toFixed(2) ?? "N/A",
                },
                {
                  label: "Topologie (Loss)",
                  val: report.continuousTopologicalLoss?.toFixed(4) ?? "N/A",
                },
              ].map((m, i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col"
                >
                  <span className="text-[9px] font-black uppercase text-slate-400">
                    {m.label}
                  </span>
                  <span className="text-sm font-black text-slate-800 dark:text-white font-mono mt-1">
                    {m.val}
                  </span>
                </div>
              ))}
            </div>

            {/* RLHF Section */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-indigo-500/30 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="font-black text-slate-800 dark:text-white uppercase text-[10px] tracking-wider flex items-center gap-2 mb-2">
                  <Brain size={14} className="text-indigo-500" />
                  RLHF (Reinforcement Learning Feedback)
                </h4>
                <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
                  Évaluez l'adéquation de la prédiction pour réajuster continûment les priors neuronaux et la matrice bayésienne.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleFeedback("positive")}
                  className="p-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-xl flex flex-col items-center gap-1 transition-all"
                >
                  <ThumbsUp size={16} />
                  <span className="text-[9px] font-bold uppercase">Succès</span>
                </button>
                <button
                  onClick={() => handleFeedback("neutral")}
                  className="p-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 rounded-xl flex flex-col items-center gap-1 transition-all"
                >
                  <Meh size={16} />
                  <span className="text-[9px] font-bold uppercase">Passable</span>
                </button>
                <button
                  onClick={() => handleFeedback("negative")}
                  className="p-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 rounded-xl flex flex-col items-center gap-1 transition-all"
                >
                  <ThumbsDown size={16} />
                  <span className="text-[9px] font-bold uppercase">Échec</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
