import React, { useState, useEffect, useMemo } from "react";
import {
  getAdaptiveRules,
  saveAdaptiveRules,
  getDefaultRules,
  normalizeWeights,
  saveAlgoWeights,
  getAlgoWeights,
  getStrategyName,
} from "../../services/predictionEngine";
import { runBayesianOptimization } from "../../services/bayesianOptimizer";
import { runSimulatedAnnealingOptimization } from "../../services/simulatedAnnealingOptimizer";
import type { AlgoWeights, AdaptiveRules } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { useToast } from "../ui/Toast";
import { useNexusStore } from "../../store/useNexusStore";
import {
  Sliders,
  Save,
  Scale,
  Gauge,
  RefreshCw,
  BrainCircuit,
  CheckCircle2,
  AlertTriangle,
  Dna,
  Microscope,
  TrendingUp,
  TrendingDown,
  Scan,
  Server,
  Cloud,
  Flame,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";
import { getLocalForensicReports } from "../../services/postPredictionAnalysisService";
import { applyForensicCalibration } from "../../services/prediction/weightsManager";

interface ExpertTuningPanelProps {
  selectedDrawName: string;
}

export const ExpertTuningPanel: React.FC<ExpertTuningPanelProps> = ({
  selectedDrawName,
}) => {
  const { showToast } = useToast();
  const updateGlobalWeights = useNexusStore(
    (state) => state.updateGlobalWeights,
  );
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const refreshData = useNexusStore((state) => state.refreshData);
  const history = useNexusStore((state) => state.history);
  const activeDrawName = useNexusStore((state) => state.drawName);
  const useCloudEngine = useNexusStore((state) => state.useCloudEngine);
  const setUseCloudEngine = useNexusStore((state) => state.setUseCloudEngine);
  const temporalDepth = useNexusStore((state) => state.temporalDepth);
  const setTemporalDepth = useNexusStore((state) => state.setTemporalDepth);

  const [localWeights, setLocalWeights] = useState<AlgoWeights>(
    {} as AlgoWeights,
  );
  const [rules, setRules] = useState<AdaptiveRules>(getDefaultRules());
  const [isDirty, setIsDirty] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [bayesProgress, setBayesProgress] = useState<{
    progress: number;
    score: number;
  } | null>(null);
  const [isAnnealing, setIsAnnealing] = useState(false);
  const [annealingProgress, setAnnealingProgress] = useState<{
    progress: number;
    bestScore: number;
    currentScore: number;
    temperature: number;
  } | null>(null);
  const [lastLearnStatus, setLastLearnStatus] = useState<string | null>(null);
  const [dnaName, setDnaName] = useState<string>("Chargement...");
  const [forensicInsights, setForensicInsights] = useState<
    Record<string, { action: string; improvement: number }>
  >({});

  const [originalWeights, setOriginalWeights] = useState<AlgoWeights>(
    {} as AlgoWeights,
  );

  // Vérification de la présence de données machine pour ce tirage
  const hasMachineDataInHistory = useMemo(() => {
    if (!history || history.length === 0) return false;
    const isolated = history.filter(
      (d) => !d.drawName || d.drawName.trim().toLowerCase() === selectedDrawName.trim().toLowerCase()
    );
    const sample = isolated.length > 0 ? isolated : history;
    return sample.some((d) => Array.isArray(d.machine) && d.machine.length > 0);
  }, [history, selectedDrawName]);

  useEffect(() => {
    let isMounted = true;
    const loadSpecificDNA = async () => {
      try {
        const specificWeights = await getAlgoWeights(selectedDrawName);
        if (!hasMachineDataInHistory) {
          specificWeights[AlgoKey.MACHINE_TRANSFER] = 0.0;
        }
        const specificRules = getAdaptiveRules(selectedDrawName);
        const lastDate = localStorage.getItem(
          `nexus_last_learn_${selectedDrawName}`,
        );

        // Load Forensic Insights
        const reports = await getLocalForensicReports();
        const insights: Record<
          string,
          { action: string; improvement: number }
        > = {};

        reports.slice(0, 5).forEach((r) => {
          r.counterfactuals?.forEach((cf) => {
            if (cf.algo && cf.action && cf.rankImprovement !== undefined) {
              if (
                !insights[cf.algo] ||
                cf.rankImprovement > (insights[cf.algo].improvement || 0)
              ) {
                insights[cf.algo] = {
                  action: cf.action,
                  improvement: cf.rankImprovement,
                };
              }
            }
          });
        });

        if (isMounted) {
          setLocalWeights(specificWeights);
          setOriginalWeights(specificWeights);
          setRules(specificRules);
          setDnaName(getStrategyName(specificWeights));
          setForensicInsights(insights);
          if (lastDate) setLastLearnStatus(lastDate);
          else setLastLearnStatus(null);
          setIsDirty(false);
        }
      } catch (e) {
        console.error("Erreur chargement ADN", e);
      }
    };

    loadSpecificDNA();
    return () => {
      isMounted = false;
    };
  }, [selectedDrawName]);

  // Synchronisation en temps réel avec le store si on est sur le tirage actif
  // Ceci garantit que si on valide un entraînement dans un autre onglet,
  // les changements ne disparaissent pas quand on revient ici.
  useEffect(() => {
    if (
      !isDirty &&
      selectedDrawName === activeDrawName &&
      globalWeights &&
      Object.keys(globalWeights).length > 0
    ) {
      const sanitized = { ...globalWeights };
      if (!hasMachineDataInHistory) {
        sanitized[AlgoKey.MACHINE_TRANSFER] = 0.0;
      }
      setLocalWeights(sanitized);
      setOriginalWeights(sanitized);
      setDnaName(getStrategyName(sanitized));
      setIsDirty(false);
    }
  }, [globalWeights, selectedDrawName, activeDrawName, isDirty, hasMachineDataInHistory]);

  // Forçage à 0% automatique si absence de données machine
  useEffect(() => {
    if (!hasMachineDataInHistory) {
      setLocalWeights((prev) => {
        if (!prev || (prev[AlgoKey.MACHINE_TRANSFER] || 0) === 0) return prev;
        return { ...prev, [AlgoKey.MACHINE_TRANSFER]: 0.0 };
      });
    }
  }, [hasMachineDataInHistory]);

  const totalWeight = useMemo((): number => {
    const vals = Object.values(localWeights) as number[];
    return vals.reduce((a, b) => a + (Number(b) || 0), 0);
  }, [localWeights]);

  const handleWeightChange = (key: AlgoKey, value: string) => {
    if (key === AlgoKey.MACHINE_TRANSFER && !hasMachineDataInHistory) {
      return;
    }
    audioEngine.play("click");
    const numValue = parseFloat(value);
    setLocalWeights((prev) => {
      const next = { ...prev, [key]: numValue };
      setDnaName(getStrategyName(next));
      return next;
    });
    setIsDirty(true);
  };

  const handleAutoNormalize = () => {
    audioEngine.play("click");
    if (totalWeight === 0) return;
    let normalized = normalizeWeights(localWeights);
    if (!hasMachineDataInHistory) {
      normalized[AlgoKey.MACHINE_TRANSFER] = 0.0;
      normalized = normalizeWeights(normalized);
      normalized[AlgoKey.MACHINE_TRANSFER] = 0.0;
    }
    setLocalWeights(normalized);
    setDnaName(getStrategyName(normalized));
    setIsDirty(true);
    showToast("Tensor Flow équilibré (Σ = 1.0).", "info");
  };

  const handleBayesianOptimization = async () => {
    audioEngine.play("scan");
    if (history.length < 25) {
      audioEngine.play("error");
      showToast(
        "Historique insuffisant pour l'optimisation Bayésienne (Min 25).",
        "error",
      );
      return;
    }

    setIsCalibrating(true);
    setBayesProgress({ progress: 0, score: 0 });
    showToast(`📊 Calibration Bayésienne en cours (TPE)...`, "info");

    try {
      const result = await runBayesianOptimization(
        selectedDrawName,
        {
          initialSamples: 10,
          bayesianIterations: 20,
        },
        (progress, best) => {
          setBayesProgress({ progress, score: best });
        },
      );

      if (result.improvement > 0) {
        setLocalWeights(result.bestWeights);
        setDnaName(getStrategyName(result.bestWeights));

        await saveAlgoWeights(selectedDrawName, result.bestWeights);
        if (selectedDrawName === activeDrawName) {
          await updateGlobalWeights(result.bestWeights);
          await refreshData(selectedDrawName, true);
        }

        audioEngine.play("success");
        showToast(
          `✅ Optimisation Bayésienne validée (+${result.improvement.toFixed(1)} Pts).`,
          "success",
        );
        setIsDirty(false);
      } else {
        audioEngine.play("error");
        showToast("Aucune amélioration trouvée par le modèle TPE.", "info");
      }
    } catch (e: unknown) {
      audioEngine.play("error");
      showToast(
        (e instanceof Error ? e.message : String(e)) ||
          "Erreur lors de l'optimisation.",
        "error",
      );
    } finally {
      setIsCalibrating(false);
      setBayesProgress(null);
    }
  };

  const handleSimulatedAnnealing = async () => {
    if (!selectedDrawName) return;
    if (history.length < 5) {
      showToast(
        "Historique de tirages insuffisant (minimum de 5 tirages requis pour calibrer l'algorithme).",
        "error",
      );
      return;
    }

    setIsAnnealing(true);
    setAnnealingProgress({ progress: 0, bestScore: 0, currentScore: 0, temperature: 0 });
    showToast(`🌡️ Optimisation par Recuit Simulé déterministe lancée...`, "info");

    try {
      const result = await runSimulatedAnnealingOptimization(
        selectedDrawName,
        localWeights,
        {
          historyDepth: temporalDepth
        },
        (prog) => {
          setAnnealingProgress(prog);
        },
      );

      if (result.improvement > 0) {
        setLocalWeights(result.bestWeights);
        setDnaName(getStrategyName(result.bestWeights));

        await saveAlgoWeights(selectedDrawName, result.bestWeights);
        if (selectedDrawName === activeDrawName) {
          await updateGlobalWeights(result.bestWeights);
          await refreshData(selectedDrawName, true);
        }

        audioEngine.play("success");
        showToast(
          `✅ Recuit Simulé validé (+${result.improvement.toFixed(1)} Pts d'ajustement).`,
          "success",
        );
        setIsDirty(false);
      } else {
        audioEngine.play("error");
        showToast("Aucune meilleure configuration trouvée par le recuit simulé.", "info");
      }
    } catch (e: unknown) {
      audioEngine.play("error");
      showToast(
        (e instanceof Error ? e.message : String(e)) ||
          "Erreur lors de l'optimisation par recuit.",
        "error",
      );
    } finally {
      setIsAnnealing(false);
      setAnnealingProgress(null);
    }
  };

  const handleApplyForensicPatches = () => {
    audioEngine.play("scan");
    const suggestions = Object.entries(forensicInsights).map(
      ([algo, data]) => ({
        algo,
        action: data.action,
        improvement: data.improvement,
      }),
    );

    if (suggestions.length === 0) {
      showToast("Aucun patch Forensic disponible pour le moment.", "info");
      return;
    }

    const calibrated = applyForensicCalibration(
      localWeights,
      suggestions,
      history.length,
    );
    setLocalWeights(calibrated);
    setDnaName(getStrategyName(calibrated));
    setIsDirty(true);
    audioEngine.play("success");
    showToast(
      `🧬 Calibration Forensic appliquée (${suggestions.length} facteurs).`,
      "success",
    );
  };

  const handleSave = async () => {
    audioEngine.play("click");
    let weightsToSave = { ...localWeights };

    // 1. Check Regulatory Safeguards (Human Validation for drastic changes)
    let totalShift = 0;
    (Object.keys(weightsToSave) as Array<AlgoKey>).forEach((k) => {
      totalShift += Math.abs(
        (weightsToSave[k] || 0) - (originalWeights[k] || 0),
      );
    });

    if (totalShift > 0.25) {
      // 25% global shift is a "drastic" re-calibration
      const confirmChange = window.confirm(
        `[Garde-fous Réglementaire] Changement structurel massif détecté (Dérive: ${(totalShift * 100).toFixed(1)}%). Voulez-vous vraiment écraser la matrice originelle ? Un audit de cette mutation sera enregistré.`,
      );
      if (!confirmChange) {
        showToast("Mutation annulée par l'opérateur.", "info");
        return;
      }
    }

    // Auto-correction was removed here to prevent "instant reverts" when the user clicks save.
    // The engine normalizes weights on the fly during predictions anyway.

    // 3. Audit trail local pour la reproductibilité et le rollback potentiel
    const auditLog = {
      timestamp: new Date().toISOString(),
      drawName: selectedDrawName,
      shift: totalShift,
      before: originalWeights,
      after: weightsToSave,
    };
    const audits = JSON.parse(
      localStorage.getItem("nexus_audit_trail") || "[]",
    );
    audits.unshift(auditLog);
    localStorage.setItem(
      "nexus_audit_trail",
      JSON.stringify(audits.slice(0, 50)),
    ); // Garder les 50 derniers max

    await saveAlgoWeights(selectedDrawName, weightsToSave);
    saveAdaptiveRules(selectedDrawName, rules);
    setOriginalWeights(weightsToSave);

    // Application immédiate si c'est le tirage en cours
    if (selectedDrawName === activeDrawName) {
      await updateGlobalWeights(weightsToSave);
      await refreshData(selectedDrawName, true); // CRITIQUE : Force le recalcul des prédictions
    }

    setIsDirty(false);
    audioEngine.play("success");
    showToast(
      `Configuration ADN cristallisée pour ${selectedDrawName}.`,
      "success",
    );
  };

  const categories = useMemo(() => {
    return [
      {
        name: "Core & Stats",
        keys: [
          AlgoKey.FREQUENCY,
          AlgoKey.MARKOV,
          AlgoKey.BAYES,
          AlgoKey.GAPS,
          AlgoKey.MOMENTUM,
          AlgoKey.GAP_SEQUENCE,
          AlgoKey.GAP_PATTERN,
          AlgoKey.SEQUENCE_PATTERN,
          AlgoKey.GAP_CADENCE,
          AlgoKey.GAP_TREND,
          AlgoKey.INTER_MONTHLY_RESONANCE,
          AlgoKey.GAP_BAND_SEQUENCE,
          AlgoKey.MACHINE_TRANSFER,
        ],
      },
      {
        name: "Mathematical & Structural",
        keys: [
          AlgoKey.SPECTRAL,
          AlgoKey.FRACTAL,
          AlgoKey.TEMPORAL,
          AlgoKey.SHADOW_PROBABILITY,
          AlgoKey.ISOLATION_ANOMALY,
        ],
      },
      {
        name: "Advanced Dynamics",
        keys: [
          AlgoKey.SPATIAL,
          AlgoKey.AFFINITY,
          AlgoKey.JACCARD,
          AlgoKey.NETWORK_CORRELATION,
          AlgoKey.ECHO_STATE,
          AlgoKey.DERIVED_NEIGHBOR,
        ],
      },
    ];
  }, []);

  const isBalanced = Math.abs(totalWeight - 1.0) < 0.02;

  return (
    <div className="animate-fade-in w-full">
      <div className="bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden relative group">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none group-hover:bg-indigo-600/10 transition-colors duration-500"></div>

        <div className="bg-slate-900/80 backdrop-blur-md p-6 md:p-8 border-b border-white/5 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 w-full">
            <div className="flex items-center gap-6 w-full md:w-auto">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
                <Dna size={32} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-black text-white uppercase tracking-tighter">
                    Console Neurale
                  </h2>
                  <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-black uppercase text-slate-400 border border-white/5">
                    {selectedDrawName}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                    {dnaName}
                  </span>
                  {lastLearnStatus && (
                    <span className="text-[10px] text-emerald-500 font-medium ml-2 flex items-center gap-1">
                      <CheckCircle2 size={10} /> Synchro {lastLearnStatus}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 w-full md:w-auto mt-4 md:mt-0 justify-stretch md:justify-end">
              <button
                onClick={handleApplyForensicPatches}
                disabled={isCalibrating || isAnnealing}
                className="flex-1 md:flex-none justify-center bg-white/5 hover:bg-white/10 text-slate-300 px-3 py-3 md:px-6 md:py-4 rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest border border-white/5 transition-all flex items-center gap-1.5 md:gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Appliquer les suggestions Forensic"
              >
                <Microscope
                  size={14}
                  className="text-rose-500 shrink-0 md:w-4 md:h-4"
                />
                <span className="whitespace-nowrap">Patch</span>
              </button>
              <button
                onClick={handleBayesianOptimization}
                disabled={isCalibrating || isAnnealing}
                className="flex-1 md:flex-none justify-center px-3 py-3 md:px-6 md:py-4 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-1.5 md:gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed min-w-[130px]"
                title="Optimisation Bayésienne TPE"
              >
                {isCalibrating && bayesProgress !== null ? (
                  <RefreshCw
                    className="animate-spin shrink-0 md:w-4 md:h-4"
                    size={14}
                  />
                ) : (
                  <Scan size={14} className="shrink-0 md:w-4 md:h-4" />
                )}
                <span className="whitespace-nowrap">
                  {isCalibrating && bayesProgress !== null
                    ? `TPE: ${bayesProgress.progress}%`
                    : "Bayes-Tune"}
                </span>
              </button>
              <button
                onClick={handleSimulatedAnnealing}
                disabled={isCalibrating || isAnnealing}
                className="flex-1 md:flex-none justify-center px-3 py-3 md:px-6 md:py-4 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-1.5 md:gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed min-w-[130px]"
                title="Optimisation par Recuit Simulé déterministe"
              >
                {isAnnealing && annealingProgress !== null ? (
                  <RefreshCw
                    className="animate-spin shrink-0 md:w-4 md:h-4"
                    size={14}
                  />
                ) : (
                  <Flame size={14} className="shrink-0 md:w-4 md:h-4" />
                )}
                <span className="whitespace-nowrap">
                  {isAnnealing && annealingProgress !== null
                    ? `SA: ${annealingProgress.progress}%`
                    : "SA-Tune"}
                </span>
              </button>
            </div>
          </div>
          
          {bayesProgress && (
            <div className="w-full px-2">
              <div className="flex justify-between text-[10px] uppercase font-black tracking-widest text-teal-400 mb-2">
                <span>Optimisation Bayésienne TPE</span>
                <span>
                  Meilleur Score: {bayesProgress.score.toFixed(1)} Pts
                </span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 transition-all duration-300"
                  style={{ width: `${bayesProgress.progress}%` }}
                />
              </div>
            </div>
          )}

          {annealingProgress && (
            <div className="w-full px-2">
              <div className="flex justify-between text-[10px] uppercase font-black tracking-widest text-amber-400 mb-2">
                <span>Recuit Simulé Déterministe</span>
                <span>
                  Temp: {annealingProgress.temperature.toFixed(4)} | Score: {annealingProgress.bestScore.toFixed(1)} Pts
                </span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-300"
                  style={{ width: `${annealingProgress.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col xl:flex-row min-h-[600px]">
          <div className="xl:w-1/3 bg-slate-900/30 p-8 flex flex-col border-b xl:border-b-0 xl:border-r border-white/5 relative">
            {/* Infrastructure & Long Term Memory Panel */}
            <div className="mb-8 p-6 bg-slate-900 border border-slate-800 rounded-3xl relative overflow-hidden group">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2 mb-6">
                <Server size={14} /> Config Infrastructure
              </h4>

              <div className="space-y-6 relative z-10">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-300">
                      Profondeur Mémoire
                    </span>
                    <span className="text-[10px] font-mono text-indigo-400">
                      {temporalDepth} tirages
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="500"
                    step="10"
                    value={temporalDepth || 100}
                    onChange={(e) => setTemporalDepth(Number(e.target.value))}
                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <p className="text-[9px] text-slate-500 mt-2 font-bold uppercase tracking-widest">
                    Limite du contexte historique et des cycles fractals.
                  </p>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div>
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                      <Cloud
                        size={14}
                        className={
                          useCloudEngine ? "text-indigo-400" : "text-slate-500"
                        }
                      />
                      Délégation Cloud
                    </span>
                    <p className="text-[9px] text-slate-500 mt-1 font-bold uppercase tracking-widest max-w-[150px]">
                      {useCloudEngine
                        ? "Nœuds distants (Haute précision)."
                        : "Calcul local Edge (Mode dégradé)."}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setUseCloudEngine(!useCloudEngine);
                    }}
                    className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${useCloudEngine ? "bg-indigo-600" : "bg-slate-700"}`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${useCloudEngine ? "right-1" : "left-1"}`}
                    />
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-6 flex-1">
              <div className="flex justify-between items-center">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
                  <Gauge size={14} /> Radar Harmonique
                </h4>
                {!isBalanced && (
                  <span className="text-xs font-black text-rose-500 bg-rose-500/10 px-2 py-1 rounded animate-pulse flex items-center gap-1">
                    <AlertTriangle size={10} /> Instable
                  </span>
                )}
              </div>
              <div className="w-full space-y-4 px-2 mt-4">
                {Object.entries(localWeights)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([key, val]) => (
                    <div key={key} className="w-full">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-slate-400 capitalize">
                          {key.replace(/([A-Z])/g, " $1").trim()}
                        </span>
                        <span className="text-[10px] font-mono text-indigo-400 font-bold">
                          {((val as number) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full h-1 bg-slate-800/50 rounded-full overflow-hidden relative">
                        <div
                          className="absolute top-0 left-0 h-full bg-indigo-500 rounded-full transition-all duration-300"
                          style={{ width: `${(val as number) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="mt-8 bg-black/40 p-6 rounded-3xl border border-white/5 relative overflow-hidden">
              <div className="flex justify-between items-end mb-2 relative z-10">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Masse Tensorielle
                </span>
                <span
                  className={`text-3xl font-black ${isBalanced ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {totalWeight.toFixed(3)}
                </span>
              </div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-1">
                <div
                  className={`h-full transition-all duration-300 ease-out ${isBalanced ? "bg-emerald-500 shadow-[0_0_10px_#10b981]" : "bg-rose-500 shadow-[0_0_10px_#f43f5e]"}`}
                  style={{ width: `${Math.min(100, totalWeight * 100)}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-600 text-right font-mono">
                Cible: 1.000
              </p>
            </div>
          </div>

          <div className="xl:w-2/3 bg-white dark:bg-slate-900 p-8 flex flex-col">
            <div className="flex justify-between items-center mb-8">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                <Sliders size={14} /> ADN Algorithmique
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={handleAutoNormalize}
                  className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-500 transition-colors"
                  title="Normaliser les poids"
                >
                  <Scale size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 max-h-[500px] space-y-12">
              {categories.map((cat) => (
                <div key={cat.name} className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="h-[1px] flex-1 bg-slate-100 dark:bg-slate-800"></div>
                    <h5 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                      {cat.name}
                    </h5>
                    <div className="h-[1px] flex-1 bg-slate-100 dark:bg-slate-800"></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                    {cat.keys.map((key) => {
                      const isMachineTransfer = key === AlgoKey.MACHINE_TRANSFER;
                      const isMachineDisabled = isMachineTransfer && !hasMachineDataInHistory;
                      const val = isMachineDisabled ? 0 : ((localWeights[key] as number) ?? 0);
                      const percent = (val * 100).toFixed(1);
                      const isActive = val > 0.05;

                      return (
                        <div key={String(key)} className={`group ${isMachineDisabled ? "opacity-50" : ""}`}>
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                              <label
                                className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isActive ? "text-indigo-600 dark:text-indigo-300" : "text-slate-400"}`}
                              >
                                {String(key).replace(/_/g, " ")}
                              </label>
                              {isMachineDisabled && (
                                <span className="text-[9px] font-mono text-amber-500 font-bold">
                                  [Verrouillé à 0%]
                                </span>
                              )}
                              {forensicInsights[key] && !isMachineDisabled && (
                                <span
                                  className={`p-1 rounded-md text-[10px] animate-pulse ${forensicInsights[key].action === "REDUCE" ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"}`}
                                  title={`Suggestion Forensic: ${forensicInsights[key].action} (Amélioration: +${forensicInsights[key].improvement}%)`}
                                >
                                  {forensicInsights[key].action === "REDUCE" ? (
                                    <TrendingDown size={10} />
                                  ) : (
                                    <TrendingUp size={10} />
                                  )}
                                </span>
                              )}
                            </div>
                            <span
                              className={`text-[10px] font-mono font-bold ${isActive ? "text-slate-800 dark:text-white" : "text-slate-400"}`}
                            >
                              {percent}%
                            </span>
                          </div>
                          <div className="relative h-10 flex items-center">
                            <div className="absolute w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-100 ${isActive ? "bg-gradient-to-r from-indigo-500 to-purple-500" : "bg-slate-300 dark:bg-slate-700"}`}
                                style={{
                                  width: `${Math.min(100, val * 100)}%`,
                                }}
                              ></div>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="0.5"
                              step="0.001"
                              value={val}
                              disabled={isMachineDisabled}
                              onChange={(e) =>
                                handleWeightChange(key, e.target.value)
                              }
                              className="absolute w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                            />
                            <div
                              className={`absolute h-4 w-4 rounded-full border-2 border-white shadow-md transition-all duration-100 pointer-events-none ${isActive ? "bg-indigo-600 scale-110" : "bg-slate-400"}`}
                              style={{
                                left: `calc(${Math.min(100, val * 200)}% - 8px)`,
                              }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={handleSave}
                disabled={!isDirty}
                className="px-10 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center gap-3 transition-all active:scale-95"
              >
                <Save size={16} /> Enregistrer Configuration
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
