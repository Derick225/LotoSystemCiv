import React, { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  Cpu,
  Layers,
  Scale,
  RefreshCw,
  Play,
  FileText,
  Sliders,
  Target,
  TrendingUp,
  X,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  Zap,
} from "lucide-react";
import { useNexusStore } from "../store/useNexusStore";
import { useToast } from "./ui/Toast";
import { audioEngine } from "../utils/audioEngine";
import { NumberBall } from "./NumberBall";
import {
  runStrictDrawValidation,
  extractDrawAlgorithmicParameters,
  validateStructuralTicketStrictly,
  StrictValidationReport,
  DrawAlgorithmicParameters,
} from "../services/prediction/strictValidationService";
import {
  enforceStrictWeightsProof,
  saveAlgoWeights,
  AlgoWeightProofItem,
  AlgoWeightsProofReport,
} from "../services/prediction/weightsManager";

interface StrictDrawValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  drawName: string;
}

export const StrictDrawValidationModal: React.FC<StrictDrawValidationModalProps> = ({
  isOpen,
  onClose,
  drawName,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const lastPrediction = useNexusStore((state) => state.lastPrediction);

  const [activeTab, setActiveTab] = useState<"audit" | "weightsProof" | "structural" | "historical">("audit");
  const [filterStatus, setFilterStatus] = useState<"all" | "PROUVE" | "DAMPED" | "VIOLATION">("all");
  const [testDepth, setTestDepth] = useState<number>(15);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isFixingWeights, setIsFixingWeights] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [progressStep, setProgressStep] = useState<string>("");
  const [report, setReport] = useState<StrictValidationReport | null>(null);
  const [liveParams, setLiveParams] = useState<DrawAlgorithmicParameters | null>(null);
  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);

  // Charger immédiatement les paramètres algorithmiques actifs du tirage dès l'ouverture
  useEffect(() => {
    if (!isOpen || !drawName) return;
    let active = true;

    extractDrawAlgorithmicParameters(drawName, history)
      .then((params) => {
        if (active) {
          setLiveParams(params);
        }
      })
      .catch((err) => {
        console.warn("[StrictValidationModal] Erreur chargement paramètres:", err);
      });

    return () => {
      active = false;
    };
  }, [isOpen, drawName, history]);

  // Déclencheur de la validation stricte complète
  const handleExecuteValidation = async () => {
    setIsRunning(true);
    setProgress(0);
    setProgressStep("Initialisation de la validation stricte...");
    audioEngine.play("scan");

    try {
      const result = await runStrictDrawValidation({
        drawName,
        rawHistory: history,
        prediction: lastPrediction?.drawName === drawName ? lastPrediction : null,
        testDepth,
        onProgress: (p, step) => {
          setProgress(p);
          setProgressStep(step);
        },
      });

      setReport(result);
      setLiveParams(result.parameters);
      audioEngine.play("success");
      showToast(
        `Validation stricte terminée : ${result.historical.testedDraws} tirages audités (${result.historical.resonanceRate}% résonance).`,
        "success"
      );
    } catch (err: any) {
      console.error("[StrictValidationModal] Erreur validation stricte:", err);
      audioEngine.play("error");
      showToast(err.message || "Erreur lors de la validation stricte du tirage.", "error");
    } finally {
      setIsRunning(false);
    }
  };

  // Correction stricte des poids par élimination des surpondérations non confirmées
  const handleApplyStrictWeightsProof = async () => {
    if (!drawName) return;
    setIsFixingWeights(true);
    audioEngine.play("click");
    try {
      const updatedWeights = enforceStrictWeightsProof(drawName, history, liveParams?.activeWeights);
      await saveAlgoWeights(drawName, updatedWeights);
      const updatedParams = await extractDrawAlgorithmicParameters(drawName, history);
      setLiveParams(updatedParams);
      if (report) {
        setReport({
          ...report,
          parameters: updatedParams,
        });
      }
      audioEngine.play("success");
      showToast(
        "Correction stricte appliquée : tous les algorithmes non prouvés ont été amortis sous l'espérance neutre.",
        "success"
      );
    } catch (err: any) {
      console.error("[StrictValidationModal] Erreur correction stricte:", err);
      audioEngine.play("error");
      showToast(err.message || "Erreur lors de l'application de la correction stricte.", "error");
    } finally {
      setIsFixingWeights(false);
    }
  };

  const proofReport = liveParams?.algoWeightsProof;

  const filteredProofItems = useMemo(() => {
    if (!proofReport?.items) return [];
    if (filterStatus === "PROUVE") {
      return proofReport.items.filter((it) => it.status === "PROUVE");
    }
    if (filterStatus === "DAMPED") {
      return proofReport.items.filter((it) => it.status === "DECOTE_CONFORME" || it.status === "NEUTRE");
    }
    if (filterStatus === "VIOLATION") {
      return proofReport.items.filter((it) => it.status === "SURPONDERE_NON_CONFIRME");
    }
    return proofReport.items;
  }, [proofReport, filterStatus]);

  if (!isOpen) return null;

  const verdictBadge = (verdict?: string) => {
    if (verdict === "CONFORME") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Conforme aux Directives Mathématiques
        </span>
      );
    }
    if (verdict === "CONFORME_AVEC_RECOMMANDATIONS" || verdict === "SOUS_OPTIMAL") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5" />
          Conforme avec Recommandations
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
        <XCircle className="w-3.5 h-3.5" />
        Non Conforme
      </span>
    );
  };

  return (
    <div
      id="strict-draw-validation-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      <div
        id="strict-draw-validation-modal-container"
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-100">
                  Validation Stricte du Tirage : {drawName}
                </h3>
                {report && verdictBadge(report.overallVerdict)}
              </div>
              <p className="text-xs text-slate-400">
                Audit mathématique temps réel et validation out-of-sample avec les paramètres actuels du tirage
              </p>
            </div>
          </div>

          <button
            id="strict-validation-close-btn"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-2 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar & Controls */}
        <div className="px-6 py-3 bg-slate-950/50 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              id="tab-btn-audit"
              onClick={() => setActiveTab("audit")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === "audit"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              Paramètres & Conformité
            </button>
            <button
              id="tab-btn-weights-proof"
              onClick={() => setActiveTab("weightsProof")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === "weightsProof"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              Preuve des Poids ({proofReport ? `${proofReport.complianceRate}%` : "100%"})
            </button>
            <button
              id="tab-btn-structural"
              onClick={() => setActiveTab("structural")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === "structural"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              Ticket Actuel
            </button>
            <button
              id="tab-btn-historical"
              onClick={() => setActiveTab("historical")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === "historical"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Évaluation Out-Of-Sample
            </button>
          </div>

          {/* Launch Controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Profondeur d'audit :</label>
              <select
                id="strict-validation-depth-select"
                value={testDepth}
                disabled={isRunning}
                onChange={(e) => setTestDepth(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:border-cyan-500 focus:outline-none"
              >
                <option value={5}>5 tirages</option>
                <option value={10}>10 tirages</option>
                <option value={15}>15 tirages</option>
                <option value={20}>20 tirages</option>
                <option value={30}>30 tirages</option>
              </select>
            </div>

            <button
              id="strict-validation-run-btn"
              disabled={isRunning}
              onClick={handleExecuteValidation}
              className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-md hover:shadow-cyan-500/20 transition-all cursor-pointer"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Audit en cours ({progress}%)...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Lancer la Validation Stricte
                </>
              )}
            </button>
          </div>
        </div>

        {/* Progress bar during run */}
        {isRunning && (
          <div className="bg-slate-950 px-6 py-2 border-b border-slate-800/80">
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>{progressStep}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-cyan-500 h-1.5 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: PARAMETERS & COMPLIANCE AUDIT */}
          {activeTab === "audit" && (
            <div className="space-y-6">
              {/* Parameter cards grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Card 1: Identification & Famille */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    Famille Inter-Tirages
                  </div>
                  <div className="text-sm font-bold text-slate-100">
                    {liveParams?.family?.name || "Autonome / Hors Famille"}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {liveParams?.family ? (
                      <span className="text-emerald-400">Étanche ({liveParams.family.shortName})</span>
                    ) : (
                      "Aucune corrélation inter-tirages permise"
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-800/60 flex justify-between text-xs text-slate-400">
                    <span>Historique purifié :</span>
                    <span className="font-semibold text-slate-200">
                      {liveParams?.historySize || 0} tirages
                    </span>
                  </div>
                </div>

                {/* Card 2: Configuration Algorithmique */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    <Cpu className="w-3.5 h-3.5 text-blue-400" />
                    Moteur & Profondeur
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-300 py-1">
                    <span>Profondeur temporelle :</span>
                    <span className="font-semibold text-cyan-300">{liveParams?.temporalDepth || 100}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-300 py-1">
                    <span>Optimisation Forensic :</span>
                    <span
                      className={`font-semibold ${
                        liveParams?.isForensicOptimized ? "text-emerald-400" : "text-slate-400"
                      }`}
                    >
                      {liveParams?.isForensicOptimized ? "Actif" : "Inactif"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-300 py-1">
                    <span>Hawkes Spatio-Temporel :</span>
                    <span
                      className={`font-semibold ${
                        liveParams?.useSpatioTemporalHawkes ? "text-emerald-400" : "text-slate-400"
                      }`}
                    >
                      {liveParams?.useSpatioTemporalHawkes ? "Actif" : "Standard"}
                    </span>
                  </div>
                </div>

                {/* Card 3: Règle Transfert Machine */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    <Scale className="w-3.5 h-3.5 text-amber-400" />
                    Numéros Machine
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-300 py-1">
                    <span>Machine disponible :</span>
                    <span
                      className={`font-semibold ${
                        liveParams?.hasMachineNumbers ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {liveParams?.hasMachineNumbers ? "Oui" : "Non"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-300 py-1">
                    <span>Poids Transfert Machine :</span>
                    <span
                      className={`font-semibold ${
                        liveParams?.isMachineTransferCompliant ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {((liveParams?.machineTransferWeight || 0) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    {liveParams?.isMachineTransferCompliant ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Règle d'or respectée (zéro poids si pas de machine)
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Violation : Poids machine actif sans données
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Empirical Calibration Card */}
              {liveParams?.empiricalCalibration && (
                <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      Calibration Empirique Continue du Tirage (Sans seuil arbitraire)
                    </h4>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Hurst = {liveParams.hurstExponent.toFixed(3)} | Entropie ={" "}
                      {liveParams.shannonEntropy.toFixed(3)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[11px]">Somme Empirique (Moyenne ± Std)</div>
                      <div className="text-sm font-semibold text-slate-200 mt-0.5">
                        {liveParams.empiricalCalibration.meanSum.toFixed(0)} ±{" "}
                        {liveParams.empiricalCalibration.stdSum.toFixed(0)}
                      </div>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[11px]">Valeur AC (Moyenne ± Std)</div>
                      <div className="text-sm font-semibold text-slate-200 mt-0.5">
                        {liveParams.empiricalCalibration.meanAC.toFixed(1)} ±{" "}
                        {liveParams.empiricalCalibration.stdAC.toFixed(1)}
                      </div>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[11px]">Lambda Consécutifs (Poisson)</div>
                      <div className="text-sm font-semibold text-slate-200 mt-0.5">
                        {liveParams.empiricalCalibration.lambdaConsecutives.toFixed(3)}
                      </div>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[11px]">Étendue / Amplitude Moyenne</div>
                      <div className="text-sm font-semibold text-slate-200 mt-0.5">
                        {liveParams.empiricalCalibration.meanAmplitude.toFixed(0)} ±{" "}
                        {liveParams.empiricalCalibration.stdAmplitude.toFixed(0)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Compliance Audit Table */}
              <div className="bg-slate-950/40 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Audit de Conformité aux Directives Architecturales (AGENTS.md)
                  </h4>
                </div>

                <div className="divide-y divide-slate-800/60 text-xs">
                  {(report?.complianceAudit || [
                    {
                      id: "rule_isolation",
                      principle: "Isolation Stricte des Données",
                      status: "CONFORME",
                      description: `Historique purifié pour "${drawName}". Zéro pollution croisée inter-tirages.`,
                    },
                    {
                      id: "rule_machine_transfer",
                      principle: "Règle Numéros Machine",
                      status: liveParams?.isMachineTransferCompliant ? "CONFORME" : "NON_CONFORME",
                      description: liveParams?.hasMachineNumbers
                        ? "Données machines présentes et traitées."
                        : `Poids Transfert Machine = ${(liveParams?.machineTransferWeight || 0).toFixed(4)} (0.00 requis).`,
                    },
                    {
                      id: "rule_families",
                      principle: "Familles Inter-Tirages Étanches",
                      status: liveParams?.family ? "CONFORME" : "ATTENTION",
                      description: liveParams?.family
                        ? `Famille ${liveParams.family.name} (${liveParams.family.shortName}). Zéro interférence extérieure.`
                        : "Tirage isolé sans transfert inter-tirages.",
                    },
                    {
                      id: "rule_deterministic",
                      principle: "100% Déterminisme & Zéro Hasard",
                      status: "CONFORME",
                      description: "Inférence 100% déterministe via LCG seedé et convolutions différentiables.",
                    },
                  ]).map((item, idx) => (
                    <div key={idx} className="p-3.5 flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-200">{item.principle}</div>
                        <div className="text-slate-400 mt-0.5">{item.description}</div>
                      </div>
                      <div>
                        {item.status === "CONFORME" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            Conforme
                          </span>
                        )}
                        {item.status === "ATTENTION" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <AlertTriangle className="w-3 h-3" />
                            Attention
                          </span>
                        )}
                        {item.status === "NON_CONFORME" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <XCircle className="w-3 h-3" />
                            Non Conforme
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 1.5: ALGORITHM WEIGHTS PROOF VALIDATION */}
          {activeTab === "weightsProof" && (
            <div className="space-y-6">
              {/* Proof Principle & Action Banner */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 shadow-inner">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Scale className="w-5 h-5 text-cyan-400" />
                      <h4 className="text-sm font-bold text-slate-100">
                        Validation Stricte des Poids par Preuve de Confirmation de Réussite
                      </h4>
                      {proofReport && (
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            proofReport.isStrictlyValid
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          }`}
                        >
                          {proofReport.isStrictlyValid ? "100% Conforme" : "Surpondération Détectée"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                      Directive mathématique absolue : <strong className="text-slate-200">« Qu'aucun algorithme ne soit surpondéré ou prioritaire sans preuve empirique de confirmation de réussite »</strong>.
                      Tout algorithme sous l'espérance neutre (Z ≤ 0 ou succès ≤ 5.56%) doit impérativement avoir un poids ≤ 4.17% (amorti continu).
                    </p>
                  </div>

                  <button
                    id="btn-apply-strict-weights-proof"
                    disabled={isFixingWeights || (proofReport?.isStrictlyValid ?? false)}
                    onClick={handleApplyStrictWeightsProof}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-md shrink-0 cursor-pointer ${
                      proofReport?.isStrictlyValid
                        ? "bg-slate-800/80 text-slate-400 border border-slate-700/50 cursor-not-allowed"
                        : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-500/20"
                    }`}
                  >
                    {isFixingWeights ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Application du calibrage strict...
                      </>
                    ) : proofReport?.isStrictlyValid ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        Poids 100% Certifiés par Preuve
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Appliquer la Correction Stricte par Preuve
                      </>
                    )}
                  </button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-800/70">
                  <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] font-medium text-slate-400">Taux de Conformité</div>
                    <div className={`text-lg font-bold mt-0.5 ${
                      (proofReport?.complianceRate || 0) === 100 ? "text-emerald-400" : "text-amber-400"
                    }`}>
                      {proofReport?.complianceRate || 100}%
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {proofReport?.items.length || 24} algorithmes audités
                    </div>
                  </div>

                  <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] font-medium text-slate-400">Algorithmes Prouvés (Z &gt; 0)</div>
                    <div className="text-lg font-bold text-cyan-400 mt-0.5">
                      {proofReport?.provenCount || 0} / 24
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Surpondération légitime
                    </div>
                  </div>

                  <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] font-medium text-slate-400">Amortis Conformes (Z ≤ 0)</div>
                    <div className="text-lg font-bold text-blue-400 mt-0.5">
                      {proofReport?.unprovenDampedCount || 0}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Poids &le; seuil neutre 4.17%
                    </div>
                  </div>

                  <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] font-medium text-slate-400">Surpondérations Non Prouvées</div>
                    <div className={`text-lg font-bold mt-0.5 ${
                      (proofReport?.unconfirmedBoostsCount || 0) === 0 ? "text-emerald-400" : "text-rose-400"
                    }`}>
                      {proofReport?.unconfirmedBoostsCount || 0}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {(proofReport?.unconfirmedBoostsCount || 0) === 0 ? "Zéro déviation" : "À corriger d'urgence"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setFilterStatus("all")}
                    className={`px-3 py-1 rounded-lg transition-colors ${
                      filterStatus === "all" ? "bg-slate-800 text-slate-200 font-semibold" : "text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    Tous ({proofReport?.items.length || 24})
                  </button>
                  <button
                    onClick={() => setFilterStatus("PROUVE")}
                    className={`px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 ${
                      filterStatus === "PROUVE" ? "bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30" : "text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Prouvés ({proofReport?.provenCount || 0})
                  </button>
                  <button
                    onClick={() => setFilterStatus("DAMPED")}
                    className={`px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 ${
                      filterStatus === "DAMPED" ? "bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30" : "text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    <Info className="w-3 h-3 text-blue-400" />
                    Amortis ({proofReport?.unprovenDampedCount || 0})
                  </button>
                  {(proofReport?.unconfirmedBoostsCount || 0) > 0 && (
                    <button
                      onClick={() => setFilterStatus("VIOLATION")}
                      className={`px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 ${
                        filterStatus === "VIOLATION" ? "bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/30" : "text-rose-400 hover:text-rose-300"
                      }`}
                    >
                      <AlertTriangle className="w-3 h-3 text-rose-400" />
                      Non Confirmés ({proofReport?.unconfirmedBoostsCount || 0})
                    </button>
                  )}
                </div>

                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span>Espérance Neutre : <strong className="text-slate-300">4.17%</strong></span>
                  <span>•</span>
                  <span>Hasard Pur (5/90) : <strong className="text-slate-300">5.56%</strong></span>
                </div>
              </div>

              {/* Algorithm Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredProofItems.map((item) => {
                  const weightPct = item.weight * 100;
                  const baselineWeightPct = item.baselineWeight * 100;
                  const hitRatePct = item.empiricalHitRate * 100;
                  const baselineHitRatePct = item.baselineRate * 100;

                  return (
                    <div
                      key={item.key}
                      className={`p-4 rounded-xl border transition-all ${
                        item.status === "PROUVE"
                          ? "bg-slate-950/60 border-slate-800 hover:border-emerald-500/30"
                          : item.status === "SURPONDERE_NON_CONFIRME"
                          ? "bg-rose-950/20 border-rose-800/60 hover:border-rose-700"
                          : "bg-slate-950/40 border-slate-800/80 hover:border-slate-700"
                      }`}
                    >
                      {/* Top row: Name & Status */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="font-semibold text-sm text-slate-200">{item.name}</div>
                          <div className="text-[11px] font-mono text-slate-400">{item.key}</div>
                        </div>

                        <div>
                          {item.status === "PROUVE" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              Prouvé (Z = +{item.proofScore.toFixed(2)})
                            </span>
                          )}
                          {item.status === "DECOTE_CONFORME" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              <Info className="w-3 h-3" />
                              Amorti Conforme
                            </span>
                          )}
                          {item.status === "NEUTRE" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                              Neutre (4.17%)
                            </span>
                          )}
                          {item.status === "SURPONDERE_NON_CONFIRME" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              <AlertTriangle className="w-3 h-3" />
                              Non Confirmé
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Two Comparative Metrics Bars */}
                      <div className="space-y-2.5 mb-3 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60 text-xs">
                        {/* 1. Active Weight vs Neutral Baseline */}
                        <div>
                          <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                            <span>Poids Actif : <strong className="text-slate-200">{weightPct.toFixed(2)}%</strong></span>
                            <span>Seuil Neutre : {baselineWeightPct.toFixed(2)}%</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                item.status === "SURPONDERE_NON_CONFIRME"
                                  ? "bg-rose-500"
                                  : item.status === "PROUVE"
                                  ? "bg-emerald-400"
                                  : "bg-cyan-500"
                              }`}
                              style={{ width: `${Math.min(100, (weightPct / 15.0) * 100)}%` }}
                            />
                          </div>
                        </div>

                        {/* 2. Empirical Hit Rate vs Pure Chance Baseline */}
                        <div>
                          <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                            <span>
                              Taux de Sortie : <strong className={item.hasProof ? "text-emerald-400" : "text-slate-300"}>{hitRatePct.toFixed(1)}%</strong>
                            </span>
                            <span>Hasard 5/90 : {baselineHitRatePct.toFixed(1)}% ({item.relativeGain.toFixed(2)}x)</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                item.hasProof ? "bg-emerald-500" : "bg-slate-500"
                              }`}
                              style={{ width: `${Math.min(100, (hitRatePct / 15.0) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Narrative Justification */}
                      <p className="text-[11px] text-slate-400 leading-normal">
                        {item.justification}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: STRUCTURAL TICKET VALIDATION */}
          {activeTab === "structural" && (
            <div className="space-y-6">
              {lastPrediction?.suggestedNumbers && lastPrediction.suggestedNumbers.length >= 5 ? (
                <>
                  {/* Current numbers display */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-slate-400">Vecteur de Prédiction Analysé :</div>
                      <div className="text-sm font-bold text-slate-200 mt-1">
                        {lastPrediction.drawName} ({new Date(lastPrediction.timestamp || Date.now()).toLocaleDateString()})
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {lastPrediction.suggestedNumbers.map((num, i) => (
                        <NumberBall key={i} number={num} size="md" />
                      ))}
                    </div>
                  </div>

                  {/* Structural Checks List */}
                  {report?.structural ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Tests de Validité Statistique & Harmonique (Score : {report.structural.score}/100)
                        </h4>
                        {verdictBadge(report.structural.verdict)}
                      </div>

                      <div className="grid grid-cols-1 gap-2.5">
                        {report.structural.checks.map((c, i) => (
                          <div
                            key={i}
                            className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                              c.passed
                                ? "bg-slate-950/40 border-slate-800"
                                : "bg-amber-950/10 border-amber-800/30"
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-200">{c.title}</span>
                                <span className="text-[11px] font-mono text-cyan-400">
                                  Observé : {c.observedValue}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  (Attendu : {c.targetRange})
                                </span>
                              </div>
                              <p className="text-xs text-slate-400">{c.details}</p>
                            </div>

                            <div>
                              {c.passed ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                                  <CheckCircle2 className="w-4 h-4" />
                                  Validé
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-semibold">
                                  <AlertTriangle className="w-4 h-4" />
                                  Écart
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800">
                      <p className="text-xs">
                        Cliquez sur "Lancer la Validation Stricte" pour évaluer la conformité mathématique complète du ticket.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800">
                  <Info className="w-8 h-8 mx-auto text-slate-500 mb-2" />
                  <p className="text-sm font-semibold text-slate-300">
                    Aucune prédiction active trouvée pour "{drawName}".
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Générez une prédiction dans l'onglet Oracle Base pour auditer la structure du ticket.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: HISTORICAL OUT-OF-SAMPLE EVALUATION */}
          {activeTab === "historical" && (
            <div className="space-y-6">
              {report ? (
                <>
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
                      <div className="text-[11px] text-slate-400">Taux de Résonance (≥ 1 hit)</div>
                      <div className="text-lg font-bold text-cyan-400 mt-0.5">
                        {report.historical.resonanceRate}%
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Théorique Aléatoire : 25.4%
                      </div>
                    </div>

                    <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
                      <div className="text-[11px] text-slate-400">Hits Moyens / Tirage</div>
                      <div className="text-lg font-bold text-emerald-400 mt-0.5">
                        {report.historical.avgDirectHits}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Gain Alpha : {report.historical.alphaGain}x
                      </div>
                    </div>

                    <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
                      <div className="text-[11px] text-slate-400">Z-Score de Significativité</div>
                      <div
                        className={`text-lg font-bold mt-0.5 ${
                          report.historical.zScore >= 1.96 ? "text-emerald-400" : "text-slate-300"
                        }`}
                      >
                        {report.historical.zScore > 0 ? `+${report.historical.zScore}` : report.historical.zScore}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {report.historical.zScore >= 1.96 ? "Significatif (p < 0.05)" : "Non significatif"}
                      </div>
                    </div>

                    <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
                      <div className="text-[11px] text-slate-400">Erreur Topologique Moyenne</div>
                      <div className="text-lg font-bold text-amber-400 mt-0.5">
                        {report.historical.avgTopologicalLoss}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Distance circulaire mod 90
                      </div>
                    </div>
                  </div>

                  {/* Historical Steps Table */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Détail des {report.steps.length} Simulations Out-of-Sample Rétrospectives
                      </h4>
                    </div>

                    <div className="divide-y divide-slate-800/60 text-xs">
                      {report.steps.map((step, idx) => (
                        <div key={idx} className="p-3.5 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-200">
                                Tirage #{idx + 1} ({step.date.slice(0, 10)})
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                  step.hitCount >= 2
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : step.hitCount === 1
                                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                                    : "bg-slate-800 text-slate-400"
                                }`}
                              >
                                {step.hitCount} Hit{step.hitCount > 1 ? "s" : ""} Direct
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-400">
                              Confiance : {step.confidence}% | Perte Topo : {step.topologicalLoss}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-6 text-[11px]">
                            {/* Gagnants réels */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">Réels :</span>
                              <div className="flex items-center gap-1">
                                {step.actualGagnants.map((n, i) => (
                                  <span
                                    key={i}
                                    className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                                      step.directHits.includes(n)
                                        ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/50"
                                        : "bg-slate-800 text-slate-300"
                                    }`}
                                  >
                                    {n}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Prédits */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">Suggérés :</span>
                              <div className="flex items-center gap-1">
                                {step.suggestedNumbers.map((n, i) => (
                                  <span
                                    key={i}
                                    className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                                      step.directHits.includes(n)
                                        ? "bg-emerald-500 text-white"
                                        : "bg-cyan-950 text-cyan-300 border border-cyan-800"
                                    }`}
                                  >
                                    {n}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Near misses */}
                            {step.nearMisses.length > 0 && (
                              <div className="text-[10px] text-amber-400 flex items-center gap-1">
                                <span>Frôlés :</span>
                                {step.nearMisses.map((m, mi) => (
                                  <span key={mi}>
                                    {m.num} ({m.type === "voisin" ? `±1 de ${m.match}` : `miroir de ${m.match}`})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800">
                  <TrendingUp className="w-8 h-8 mx-auto text-slate-500 mb-2" />
                  <p className="text-sm font-semibold text-slate-300">
                    Aucune simulation out-of-sample n'a encore été exécutée.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Cliquez sur "Lancer la Validation Stricte" ci-dessus pour évaluer l'exactitude des paramètres sur {testDepth} tirages passés.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>Moteur d'Audit Stricte Déterministe • Zéro Fuite de Données</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
