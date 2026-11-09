import { useState, useMemo, useEffect, useCallback } from "react";
import { useNexusStore } from "../store/useNexusStore";
import { useToast } from "../components/ui/Toast";
import { audioEngine } from "../utils/audioEngine";
import { saveTicket } from "../services/userPreferencesService";
import {
  computeSystemInertiaMetrics,
  computeInertiaVectorScores,
  resolveOptimizedInertiaVector,
  runDeterministicInertiaBacktest,
  getPersistedInertiaCalibration,
  savePersistedInertiaCalibration,
  resetPersistedInertiaCalibration,
  DEFAULT_INERTIA_CALIBRATION,
  INERTIA_DAMPING_DOMAIN,
  SystemInertiaMetrics,
  InertiaOscillatorScore,
  InertiaResolvedVector,
  InertiaBacktestResult,
  InertiaCalibrationModifiers,
} from "../services/prediction/systemInertiaEngine";
import { computeRobustHurst } from "../services/mathCore";
import { purifyHistoryForDraw } from "../utils/arrayUtils";

export interface ScatterPoint {
  num: number;
  x: number;
  y: number;
  score: number;
  coherence: number;
  jaccard: number;
  damping: number;
  zScore: number;
  action: number;
}

export interface DampingRegimeInfo {
  label: string;
  color: string;
  note: string;
}

export interface DampingSweepVerdict {
  deltaHits: number;
  improved: boolean;
  atGridPoint: boolean;
}

export function useInertiaCybernetics(drawName: string) {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalRegime = useNexusStore((state) => state.regime);
  const navigateToModule = useNexusStore((state) => state.navigateToModule);

  // Interactive cybernetic calibration state variables
  const [viscosityGain, setViscosityGain] = useState<number>(1.0);
  const [massGain, setMassGain] = useState<number>(1.0);
  const [couplingGain, setCouplingGain] = useState<number>(1.0);
  const [jaccardGain, setJaccardGain] = useState<number>(1.0);
  const [dampingRatio, setDampingRatio] = useState<number>(0.5);

  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optimizedVector, setOptimizedVector] = useState<InertiaResolvedVector | null>(null);

  // Backtesting stats state for retroactive audits
  const [isBacktesting, setIsBacktesting] = useState<boolean>(false);
  const [backtestStats, setBacktestStats] = useState<InertiaBacktestResult | null>(null);

  // Load persisted calibration for active draw on mount / draw change (Tirage Isolation Rule)
  useEffect(() => {
    const saved = getPersistedInertiaCalibration(drawName);
    setViscosityGain(saved.viscosityGain);
    setMassGain(saved.massGain);
    setCouplingGain(saved.couplingGain);
    setJaccardGain(saved.jaccardGain ?? 1.0);
    setDampingRatio(saved.dampingRatio);
    setOptimizedVector(null);
    setBacktestStats(null);
  }, [drawName]);

  // Hurst mesuré sur l'historique PROPRE au tirage (estimateur R/S robuste) : source primaire.
  const pureHistory = useMemo(() => {
    return drawName ? purifyHistoryForDraw(drawName, history) : history;
  }, [drawName, history]);

  const measuredHurst = useMemo(() => {
    if (pureHistory.length < 10) return null;
    const signal = pureHistory
      .slice(0, 20)
      .flatMap((draw) => (Array.isArray(draw?.gagnants) ? draw.gagnants : []));
    return signal.length >= 10 ? computeRobustHurst(signal) : null;
  }, [pureHistory]);

  const storeHurst =
    typeof globalRegime?.hurst === "number" ? globalRegime.hurst : null;
  const hurst = measuredHurst ?? storeHurst ?? 0.5;
  const hurstIsMeasured = measuredHurst !== null || storeHurst !== null;

  // 100% Deterministic Statistical Computation based on the active history (Tirage Isolation)
  const computedMetrics: SystemInertiaMetrics = useMemo(() => {
    return computeSystemInertiaMetrics(history, drawName, hurst);
  }, [history, drawName, hurst]);

  const currentModifiers = useMemo(
    (): InertiaCalibrationModifiers => ({
      viscosityGain,
      massGain,
      couplingGain,
      jaccardGain,
      dampingRatio,
    }),
    [viscosityGain, massGain, couplingGain, jaccardGain, dampingRatio]
  );

  // Régime d'amortissement dérivé continûment de ζ
  const dampingRegime: DampingRegimeInfo = useMemo(() => {
    if (Math.abs(dampingRatio - 1.0) < INERTIA_DAMPING_DOMAIN.step / 2) {
      return {
        label: "(Critique)",
        color: "text-cyan-400",
        note: "ζ = 1.0 : Amortissement critique. Convergence optimale sans sur-oscillation.",
      };
    }
    return dampingRatio < 1.0
      ? {
          label: "(Sous-Amorti)",
          color: "text-emerald-400",
          note: "ζ < 1.0 : Régime oscillatoire pseudo-périodique. Cible la résonance cyclique des retours.",
        }
      : {
          label: "(Sur-Amorti)",
          color: "text-amber-400",
          note: "ζ > 1.0 : Dissipation thermique continue. Pénalise exponentiellement les grands écarts.",
        };
  }, [dampingRatio]);

  // Verdict du balayage ζ
  const dampingSweepVerdict: DampingSweepVerdict | null = useMemo(() => {
    if (!backtestStats) return null;
    const deltaHits = backtestStats.bestDampingHits - backtestStats.currentDampingHits;
    return {
      deltaHits,
      improved: deltaHits > 0,
      atGridPoint:
        Math.abs(dampingRatio - backtestStats.bestDamping) <
        INERTIA_DAMPING_DOMAIN.step / 2,
    };
  }, [backtestStats, dampingRatio]);

  // Mise à jour et persistance isolée par tirage
  const updateAndPersistModifiers = useCallback(
    (patch: Partial<InertiaCalibrationModifiers>) => {
      const nextModifiers: InertiaCalibrationModifiers = {
        viscosityGain: patch.viscosityGain !== undefined ? patch.viscosityGain : viscosityGain,
        massGain: patch.massGain !== undefined ? patch.massGain : massGain,
        couplingGain: patch.couplingGain !== undefined ? patch.couplingGain : couplingGain,
        jaccardGain: patch.jaccardGain !== undefined ? patch.jaccardGain : jaccardGain,
        dampingRatio: patch.dampingRatio !== undefined ? patch.dampingRatio : dampingRatio,
      };

      if (patch.viscosityGain !== undefined) setViscosityGain(patch.viscosityGain);
      if (patch.massGain !== undefined) setMassGain(patch.massGain);
      if (patch.couplingGain !== undefined) setCouplingGain(patch.couplingGain);
      if (patch.jaccardGain !== undefined) setJaccardGain(patch.jaccardGain);
      if (patch.dampingRatio !== undefined) setDampingRatio(patch.dampingRatio);

      savePersistedInertiaCalibration(drawName, nextModifiers);
    },
    [drawName, viscosityGain, massGain, couplingGain, jaccardGain, dampingRatio]
  );

  // Scores des oscillateurs d'inertie
  const oscillatorScores: InertiaOscillatorScore[] = useMemo(() => {
    return computeInertiaVectorScores(computedMetrics, currentModifiers);
  }, [computedMetrics, currentModifiers]);

  // Coordonnées pour l'espace de phase [U(g) vs A(f)]
  const scatterData: ScatterPoint[] = useMemo(() => {
    return oscillatorScores.map((item) => ({
      num: item.num,
      x: item.restoringPotential,
      y: item.phaseAttraction,
      score: item.score,
      coherence: item.fractalCoherence,
      jaccard: item.jaccardIndex,
      damping: item.dampingCorrection,
      zScore: item.zScore,
      action: item.hamiltonianAction,
    }));
  }, [oscillatorScores]);

  // Profils cybernétiques
  const applyPreset = useCallback(
    (type: "neutral" | "trend" | "critical" | "underdamped") => {
      audioEngine.play("click");
      switch (type) {
        case "neutral":
          updateAndPersistModifiers({
            viscosityGain: 1.0,
            massGain: 1.0,
            couplingGain: 1.0,
            jaccardGain: 1.0,
            dampingRatio: 0.5,
          });
          showToast(`Profil appliqué : Équilibre Harmonique Standard (${drawName})`, "info");
          break;
        case "trend":
          updateAndPersistModifiers({
            viscosityGain: 1.75,
            massGain: 1.5,
            couplingGain: 0.7,
            jaccardGain: 1.5,
            dampingRatio: 0.35,
          });
          showToast(`Profil appliqué : Persistance Forte & Tendance Jaccard (${drawName})`, "info");
          break;
        case "critical":
          updateAndPersistModifiers({
            viscosityGain: 0.8,
            massGain: 1.0,
            couplingGain: 1.6,
            jaccardGain: 0.8,
            dampingRatio: 1.0,
          });
          showToast(`Profil appliqué : Amortissement Critique (${drawName})`, "info");
          break;
        case "underdamped":
          updateAndPersistModifiers({
            viscosityGain: 1.2,
            massGain: 1.8,
            couplingGain: 1.2,
            jaccardGain: 1.6,
            dampingRatio: 0.2,
          });
          showToast(`Profil appliqué : Sous-Amorti Résonant (${drawName})`, "info");
          break;
      }
    },
    [drawName, updateAndPersistModifiers, showToast]
  );

  // Application de l'amortissement mesuré par le balayage Time Machine
  const handleApplyOptimalDamping = useCallback(() => {
    if (!backtestStats) return;
    if (backtestStats.bestDampingHits <= backtestStats.currentDampingHits) {
      audioEngine.play("error");
      showToast(
        `Aucune amélioration mesurée : sur les ${backtestStats.dampingCandidatesEvaluated} valeurs de ζ balayées, aucune ne dépasse les ${backtestStats.currentDampingHits} hits de la calibration en vigueur. Calibration inchangée.`,
        "info"
      );
      return;
    }
    const optimalZeta = backtestStats.bestDamping;
    audioEngine.play("success");
    updateAndPersistModifiers({ dampingRatio: optimalZeta });
    showToast(
      `ζ = ${optimalZeta.toFixed(2)} appliqué et mémorisé pour ${drawName} (+${
        backtestStats.bestDampingHits - backtestStats.currentDampingHits
      } hits rétro-actifs mesurés).`,
      "success"
    );
  }, [backtestStats, drawName, updateAndPersistModifiers, showToast]);

  // Résolution déterministe du vecteur stationnaire
  const triggerOptimization = useCallback(() => {
    if (pureHistory.length < 10) {
      showToast(
        "Historique insuffisant pour calibrer l'inertie stochastique (min. 10 tirages requis).",
        "error"
      );
      audioEngine.play("error");
      return;
    }

    audioEngine.play("scan");
    setIsOptimizing(true);

    const resolved = resolveOptimizedInertiaVector(oscillatorScores, computedMetrics);
    setOptimizedVector(resolved);
    setIsOptimizing(false);
    audioEngine.play("success");
    showToast("Optimisation de l'inertie de système achevée.", "success");
  }, [pureHistory.length, oscillatorScores, computedMetrics, showToast]);

  // Rétro-audit temporel (Time Machine)
  const runInertiaBacktest = useCallback(async () => {
    audioEngine.play("click");
    if (pureHistory.length < 12) {
      showToast(
        "Dataset insuffisant pour rétropoler l'inertie (min. 12 tirages requis).",
        "error"
      );
      return;
    }

    setIsBacktesting(true);
    audioEngine.play("loading");

    try {
      const result = await runDeterministicInertiaBacktest(
        pureHistory,
        drawName,
        currentModifiers,
        hurst
      );
      setBacktestStats(result);
      audioEngine.play("success");
      showToast(
        `Rétro-audit de l'inertie complété sur ${result.trials} tirages réels antérieurs.`,
        "success"
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast("Échec du rétro-audit : " + message, "error");
    } finally {
      setIsBacktesting(false);
    }
  }, [pureHistory, drawName, currentModifiers, hurst, showToast]);

  // Réinitialisation des contrôles
  const resetControls = useCallback(() => {
    audioEngine.play("click");
    resetPersistedInertiaCalibration(drawName);
    setViscosityGain(DEFAULT_INERTIA_CALIBRATION.viscosityGain);
    setMassGain(DEFAULT_INERTIA_CALIBRATION.massGain);
    setCouplingGain(DEFAULT_INERTIA_CALIBRATION.couplingGain);
    setJaccardGain(DEFAULT_INERTIA_CALIBRATION.jaccardGain);
    setDampingRatio(DEFAULT_INERTIA_CALIBRATION.dampingRatio);
    setOptimizedVector(null);
    setBacktestStats(null);
    showToast(`Paramètres d'inertie réinitialisés pour ${drawName}.`, "info");
  }, [drawName, showToast]);

  // Sauvegarde des tickets
  const handleSavePrimaryTicket = useCallback(async () => {
    if (!optimizedVector) return;
    audioEngine.play("click");
    try {
      await saveTicket({
        numbers: optimizedVector.primary,
        drawName,
        strategy: `Inertie Système Optimisée Primaire (${optimizedVector.globalStability}%)`,
      });
      audioEngine.play("success");
      showToast("Ticket d'inertie optimal mémorisé avec succès.", "success");
    } catch {
      showToast("Erreur lors de l'enregistrement.", "error");
    }
  }, [optimizedVector, drawName, showToast]);

  const handleSaveSecondaryTicket = useCallback(async () => {
    if (!optimizedVector || optimizedVector.secondary.length < 5) return;
    audioEngine.play("click");
    try {
      await saveTicket({
        numbers: optimizedVector.secondary.slice(0, 5),
        drawName,
        strategy: `Inertie Système Couverture Amortie Top 5 (${optimizedVector.globalStability}%)`,
      });
      audioEngine.play("success");
      showToast("Ticket de couverture amortie mémorisé avec succès.", "success");
    } catch {
      showToast("Erreur lors de l'enregistrement.", "error");
    }
  }, [optimizedVector, drawName, showToast]);

  const handleExportToCoveringDesigns = useCallback(() => {
    if (!optimizedVector) return;
    audioEngine.play("click");
    navigateToModule("Combinations");
    showToast("Vecteur d'inertie projeté vers le Générateur Combinatoire.", "info");
  }, [optimizedVector, navigateToModule, showToast]);

  return {
    viscosityGain,
    massGain,
    couplingGain,
    jaccardGain,
    dampingRatio,
    isOptimizing,
    optimizedVector,
    isBacktesting,
    backtestStats,
    setBacktestStats,
    pureHistory,
    hurst,
    hurstIsMeasured,
    computedMetrics,
    currentModifiers,
    dampingRegime,
    dampingSweepVerdict,
    scatterData,
    updateAndPersistModifiers,
    applyPreset,
    handleApplyOptimalDamping,
    triggerOptimization,
    runInertiaBacktest,
    resetControls,
    handleSavePrimaryTicket,
    handleSaveSecondaryTicket,
    handleExportToCoveringDesigns,
  };
}
