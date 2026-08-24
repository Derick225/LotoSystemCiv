import { AlgoWeights, DrawResult } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { logger } from "../../utils/logger";
import { normalizeWeights } from "../prediction/weightsManager";
import { runForensicWorker } from "./trainingWorkers";
import { calculateTemporalDriftLearningRate } from "../mathService";

/**
 * Parseur de date local et robuste pour les formats DD/MM/YYYY et ISO.
 * Prévient les dysfonctionnements d'environnements (Vite, Capacitor, Node, Edge).
 */
export const parseLocalDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day, 12, 0, 0); // midi pour éviter les fuseaux horaires
      if (!isNaN(date.getTime())) return date;
    }
  }
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;
  return new Date();
};

/**
 * Applique le Online Learning via descente de coordonnées continue.
 * Ne dépend plus directement de Zustand (les poids sont retournés pour mise à jour).
 */
export const applyOnlineLearningCore = async (
  drawName: string,
  purifiedHistory: DrawResult[],
  currentWeights: AlgoWeights,
  temporalDepth: number = 100,
  userFeedbackScore?: number // RLHF factor (-1.0 à 1.0)
): Promise<AlgoWeights> => {
  if (!purifiedHistory || purifiedHistory.length < 2) {
    return currentWeights;
  }

  const targetDraw = purifiedHistory[0];
  const contextHistory = purifiedHistory.slice(1);

  const { generateMasterPrediction } = await import("../predictionEngine");

  // Régénérer la prédiction théorique effectuée sur ce tirage historique
  const prediction = await generateMasterPrediction(
    drawName,
    contextHistory,
    temporalDepth,
    currentWeights,
    undefined,
    undefined,
    true // skip training lock
  );

  const actualWinners = targetDraw.gagnants;
  const predicted = prediction.suggestedNumbers;
  const hits = predicted.filter((n) => actualWinners.includes(n)).length;

  // Signal de récompense continu RLHF
  const baseReward = hits / 5.0; // [0, 1]
  const rlhfSignal = userFeedbackScore ? userFeedbackScore * 0.5 : 0;
  const totalSignal = Math.max(
    -1.0,
    Math.min(1.0, baseReward * 2.0 - 1.0 + rlhfSignal)
  );

  // Modulation mathématique du Learning Rate avec dérive temporelle continue
  // Formule canonique : η(t) = η0 / (1 + λ * D_KL(P || Q))
  const baseLR = 1.0 / Math.sqrt(Math.max(10, purifiedHistory.length));
  const driftLr = calculateTemporalDriftLearningRate(purifiedHistory, baseLR, 10);
  const signalStrength = Math.abs(totalSignal);
  const historyReliability = Math.max(
    0.2,
    Math.min(1.0, purifiedHistory.length / 100.0)
  );
  // Plus de hits ou de rétroaction positive augmente la confiance
  const forensicConfidence = Math.max(0.5, Math.min(1.5, 1.0 + (hits - 2) * 0.1));
  const learningRate = driftLr.learningRate * signalStrength * historyReliability * forensicConfidence;

  const newWeights: Record<string, number> = { ...currentWeights } as any;
  const algoKeys = Object.keys(currentWeights) as AlgoKey[];

  algoKeys.forEach((algo) => {
    let algoScoreForWinners = 0;
    let algoScoreForLosers = 0;

    Object.keys(prediction.breakdown).forEach((numStr) => {
      const num = parseInt(numStr, 10);
      const val = Number(prediction.breakdown[num][algo]) || 0;
      if (actualWinners.includes(num)) {
        algoScoreForWinners += val;
      } else {
        algoScoreForLosers += val;
      }
    });

    algoScoreForWinners /= actualWinners.length || 1;
    algoScoreForLosers /= 90 - actualWinners.length || 1;

    // Discrimination Power
    const discriminationPower = algoScoreForWinners - algoScoreForLosers;

    // Top 5 Winner Presence
    const sortedForAlgo = Array.from({ length: 90 }, (_, i) => i + 1).sort(
      (a, b) =>
        (Number(prediction.breakdown[b]?.[algo]) || 0) -
        (Number(prediction.breakdown[a]?.[algo]) || 0)
    );
    const algoTop5 = sortedForAlgo.slice(0, 5);
    const algoTop5Hits = algoTop5.filter((n) => actualWinners.includes(n)).length;
    const top5WinnerPresence = algoTop5Hits / 5.0;

    // False Positive Burden
    const algoFalsePositives = algoTop5.filter((n) => !actualWinners.includes(n));
    const falsePositiveBurden =
      algoFalsePositives.reduce(
        (sum, n) => sum + (Number(prediction.breakdown[n]?.[algo]) || 0),
        0
      ) / 5.0;

    // Overconfidence
    const overconfidence = Math.max(0, falsePositiveBurden - top5WinnerPresence);

    // Signal de mise à jour composite
    const algoUpdateSignal =
      discriminationPower +
      top5WinnerPresence * 0.3 -
      falsePositiveBurden * 0.1 -
      overconfidence * 0.2;

    const step = algoUpdateSignal * learningRate * Math.sign(totalSignal);
    newWeights[algo] = Math.max(
      0.01,
      Math.min(1.0, (Number((currentWeights as any)[algo]) || 0.1) + step)
    );
  });

  const normalizedWeights = normalizeWeights(newWeights as any);

  logger.info(
    `[Online Learning] Tirage ${drawName} | Signal: ${totalSignal.toFixed(
      3
    )} | LR: ${learningRate.toFixed(4)}`
  );

  // Appliquer également de façon optionnelle les ajustements Forensic via le pont
  try {
    const { generateLearningSession, applyForensicAdjustments } = await import(
      "../forensicTrainingBridge"
    );
    const forensicReport = await runForensicWorker(drawName, actualWinners, contextHistory);
    const learningSession = await generateLearningSession(forensicReport, contextHistory);
    const finalWeights = await applyForensicAdjustments(
      learningSession,
      normalizedWeights,
      true
    );
    return finalWeights;
  } catch (err) {
    logger.warn(`[Online Learning] Pont Forensic ignoré pour cause de dépendances: ${err}`);
    return normalizedWeights;
  }
};

/**
 * Exécute une étape d'apprentissage complète liant Forensic et Training.
 */
export const runForensicTrainingStepCore = async (
  drawName: string,
  purifiedHistory: DrawResult[],
  currentWeights: AlgoWeights
): Promise<{ learningSession: any; updatedWeights: AlgoWeights }> => {
  if (!purifiedHistory || purifiedHistory.length < 2) {
    throw new Error(
      "Historique insuffisant pour l'évaluation forensic (minimum de 2 tirages)."
    );
  }

  logger.info(`[Forensic Training Step] Execution lancee pour le tirage: ${drawName}`);

  const { generateLearningSession, applyForensicAdjustments } = await import(
    "../forensicTrainingBridge"
  );

  const targetDraw = purifiedHistory[0];
  const contextHistory = purifiedHistory.slice(1);

  // Appel du worker forensic unifié avec timeout et fallback
  const forensicReport = await runForensicWorker(
    drawName,
    targetDraw.gagnants,
    contextHistory
  );

  const learningSession = await generateLearningSession(forensicReport, contextHistory);
  const updatedWeights = await applyForensicAdjustments(
    learningSession,
    currentWeights,
    true
  );

  return {
    learningSession,
    updatedWeights,
  };
};

export interface LoopSimulationStepResult {
  date: string;
  predictedStatic: number[];
  predictedLoop: number[];
  actual: number[];
  hitsStatic: number;
  hitsLoop: number;
  regime: string;
}

export interface LoopSimulationSummary {
  totalHitsStatic: number;
  totalHitsLoop: number;
  improvement: number;
  steps: LoopSimulationStepResult[];
}

/**
 * Simulation de boucle de feedback de replay déterministe.
 * Ne contient plus de padding d'historique artificiel; réduit le loopSize si insuffisant.
 */
export const runLoopSimulationCore = async (
  drawName: string,
  purifiedHistory: DrawResult[],
  loopSize: number,
  originalWeights: AlgoWeights,
  onProgress?: (progress: number, stepResult: LoopSimulationStepResult) => void,
  abortSignal?: AbortSignal
): Promise<LoopSimulationSummary> => {
  // Suppression de l'invention de tirages : limitation stricte à l'historique disponible
  const minimumHistoryRequired = 15;
  if (purifiedHistory.length < minimumHistoryRequired) {
    throw new Error(
      `Historique de tirages insuffisant pour simuler une boucle déterministe honnête (reçu ${purifiedHistory.length}, requis au moins ${minimumHistoryRequired}).`
    );
  }

  // Ajustement dynamique du loopSize pour éviter le débordement analytique
  const safeLoopSize = Math.min(loopSize, purifiedHistory.length - 11);

  let currentWeights = { ...originalWeights };
  const staticWeights = { ...originalWeights };

  let accumulatedHitsStatic = 0;
  let accumulatedHitsLoop = 0;
  const steps: LoopSimulationStepResult[] = [];

  const { generateMasterPrediction } = await import("../predictionEngine");
  const { generateLearningSession, applyForensicAdjustments } = await import(
    "../forensicTrainingBridge"
  );

  for (let idx = 0; idx < safeLoopSize; idx++) {
    if (abortSignal?.aborted) {
      throw new Error("Simulation interrompue.");
    }

    const historyIndex = safeLoopSize - idx;
    if (historyIndex >= purifiedHistory.length || historyIndex < 0) continue;

    const targetDraw = purifiedHistory[historyIndex];
    const contextHistory = purifiedHistory.slice(historyIndex + 1);

    if (contextHistory.length < 10) continue;

    // 1. Prédiction avec poids d'origine (statiques)
    const predStatic = await generateMasterPrediction(
      drawName,
      contextHistory,
      100,
      staticWeights,
      undefined,
      undefined,
      true
    );
    const hitsStatic = predStatic.suggestedNumbers.filter((n) =>
      targetDraw.gagnants.includes(n)
    ).length;
    accumulatedHitsStatic += hitsStatic;

    // 2. Prédiction avec poids continuellement optimisés
    const predLoop = await generateMasterPrediction(
      drawName,
      contextHistory,
      100,
      currentWeights,
      undefined,
      undefined,
      true
    );
    const hitsLoop = predLoop.suggestedNumbers.filter((n) =>
      targetDraw.gagnants.includes(n)
    ).length;
    accumulatedHitsLoop += hitsLoop;

    // 3. Appel du worker forensic unifié
    const forensicReport = await runForensicWorker(
      drawName,
      targetDraw.gagnants,
      contextHistory
    );

    // 4. Session d'apprentissage adaptative
    const learningSession = await generateLearningSession(forensicReport, contextHistory);
    currentWeights = await applyForensicAdjustments(
      learningSession,
      currentWeights,
      true
    );

    const stepResult: LoopSimulationStepResult = {
      date: parseLocalDate(targetDraw.date).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
      }),
      predictedStatic: predStatic.suggestedNumbers,
      predictedLoop: predLoop.suggestedNumbers,
      actual: targetDraw.gagnants,
      hitsStatic,
      hitsLoop,
      regime: forensicReport.catastropheControlParams?.regime || "STABLE_MONOSTABLE",
    };

    steps.push(stepResult);

    if (onProgress) {
      const percent = Math.round(((idx + 1) / safeLoopSize) * 100);
      onProgress(percent, stepResult);
    }
  }

  const improvementPercent =
    accumulatedHitsStatic > 0
      ? ((accumulatedHitsLoop - accumulatedHitsStatic) / accumulatedHitsStatic) * 100
      : accumulatedHitsLoop * 100;

  return {
    totalHitsStatic: accumulatedHitsStatic,
    totalHitsLoop: accumulatedHitsLoop,
    improvement: parseFloat(improvementPercent.toFixed(1)),
    steps,
  };
};
