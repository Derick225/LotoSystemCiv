import { DrawResult, Prediction } from "../../types";
import { logger } from "../../utils/logger";
import { isSupabaseConfigured } from "../supabaseClient";
import { apiClient } from "../../core/api/apiClient";
import { TUNING } from "./microSgd";
import { useNexusStore } from "../../store/useNexusStore";
import type { PredictionRuntimeContext } from "./predictionOrchestrator";

export const HONEST_NOTE = "Indicateur interne de cohérence du moteur — ne reflète PAS une probabilité de gain.";
const TICKET_SIZE = 5;

/**
 * Récupération sécurisée de l'état du store Zustand sans crash dans les Web Workers ou SSR
 */
export const getStoreStateSafely = () => {
  if (typeof window !== 'undefined') {
    try {
      const state = useNexusStore.getState();
      if (state) {
        return {
          useSpatioTemporalHawkes: state.useSpatioTemporalHawkes ?? true,
          useCloudEngine: state.useCloudEngine ?? false,
        };
      }
    } catch {
      // Ignorer si le store n'est pas initialisé
    }
  }
  return { useSpatioTemporalHawkes: true, useCloudEngine: false };
};

/**
 * Évaluation de la dégradation / Scénario A : Dataset insuffisant
 * Génère une prédiction dégradée utile basée sur les fréquences empiriques du court historique
 */
export const handleScenarioADegradedPrediction = (context: PredictionRuntimeContext): Prediction => {
  logger.warn(
    { drawName: context.drawName, len: context.history.length },
    "[predictionScenarios] Scenario A : Dataset insuffisant pour une inférence complexe. Mode dégradé statistique utile."
  );
  context.onProgress?.(100, "Dataset insuffisant. Génération d'une prédiction basée sur les fréquences empiriques.");

  const freqMap: Record<number, number> = {};
  for (const d of context.history) {
    for (const num of d.gagnants || []) {
      freqMap[num] = (freqMap[num] || 0) + 1;
    }
  }

  const sortedNums = Object.keys(freqMap)
    .map(Number)
    .sort((a, b) => (freqMap[b] || 0) - (freqMap[a] || 0));

  let selected: number[] = [];
  if (sortedNums.length >= 5) {
    selected = sortedNums.slice(0, 5);
  } else if (context.history.length > 0 && context.history[0]?.gagnants?.length >= 5) {
    selected = context.history[0].gagnants.slice(0, 5);
  } else {
    selected = [1, 2, 3, 4, 5];
  }

  const candidatePool = sortedNums.length > 5 ? sortedNums.slice(5) : [11, 22, 33, 44, 55, 66, 77, 88, 12, 13];
  const candidates = candidatePool
    .filter(n => !selected.includes(n))
    .slice(0, 10);

  return {
    suggestedNumbers: selected,
    candidates,
    confidence: 10,
    confidenceNote: "MOTEUR EN MODE FAIBLE PROFONDEUR - " + HONEST_NOTE,
    analysis: `Dataset insuffisant (${context.history.length} tirages utiles). Inférence statistique empirique activée.`,
    breakdown: {},
    timestamp: Date.now(),
    symbiosisFactor: 1.0,
    realityAlignment: 10,
    realityAlignmentNote: HONEST_NOTE,
    adversarialApplied: false,
    challengedNumbers: [],
    stabilityScore: 10,
    diversityMetrics: {
      meanSimilarity: 0,
      diversityScore: 100,
      penalty: 0,
      isMonoculture: false,
      pairwiseSimilarities: [],
      dominantAlgo: null
    },
    adversarialSurvivalScore: 0,
    adversarialRisks: ["Dataset insuffisant pour audit antagoniste"],
    explainabilityData: {},
    shrinkageApplied: true,
    shrinkageFactor: 1.0,
    hyperparameters: {
      hawkesDecay: TUNING.DEFAULT_HAWKES_DECAY,
      spatialSigma: 1.5,
      gapVelocityWeight: 1.0,
      bayesWindowRatio: 0.1,
      sgdLearningRate: TUNING.DEFAULT_SGD_LEARNING_RATE,
      lyapunovHorizon: 15
    },
    hyperTuningLog: ["Ajustement impossible : dataset trop court (< 12)"],
    hyperAccuracyGain: 0
  } as Prediction;
};

/**
 * Délégation au supercalculateur Cloud / Scénario B & C
 */
export const tryCloudPrediction = async (context: PredictionRuntimeContext): Promise<Prediction | null> => {
  const useCloudEngine = context.useCloudEngine ?? getStoreStateSafely().useCloudEngine;

  if (
    useCloudEngine &&
    isSupabaseConfigured() &&
    context.drawName !== "ALL_COMBINED" &&
    context.drawName !== "ALL"
  ) {
    context.onProgress?.(15, "[Cloud] Interrogation du supercalculateur Cloud...");
    try {
      logger.info({ drawName: context.drawName }, "[predictionScenarios] Scenario B : Délégation de la prédiction vers Supabase Edge Function...");
      const result = await apiClient.post<Prediction>('predict-elite', {
        drawName: context.drawName,
        history: context.history,
        weights: context.weightsToUse,
        symbioticContext: context.symbioticContext,
        metrics: context.metrics
      }, { suppressErrorLogging: true });

      const isPayloadValid = (
        result &&
        Array.isArray(result.suggestedNumbers) &&
        result.suggestedNumbers.length === TICKET_SIZE &&
        new Set(result.suggestedNumbers).size === TICKET_SIZE &&
        result.suggestedNumbers.every((n: number) => typeof n === 'number' && n >= 1 && n <= 90 && !isNaN(n) && Number.isInteger(n)) &&
        Array.isArray(result.candidates) &&
        result.candidates.every((n: number) => typeof n === 'number' && n >= 1 && n <= 90 && !isNaN(n) && Number.isInteger(n)) &&
        typeof result.confidence === 'number' && !isNaN(result.confidence) &&
        result.confidence >= 1 && result.confidence <= 100
      );

      if (isPayloadValid) {
        logger.info({ drawName: context.drawName }, "[predictionScenarios] Scenario B : Prédiction obtenue et validée avec succès depuis le Cloud.");
        context.onProgress?.(100, "[Cloud] Alignement finalisé avec succès.");
        return result;
      } else {
        logger.warn(
          { drawName: context.drawName, result },
          "[predictionScenarios] Scenario C : Réponse cloud reçue mais PAYLOAD ANALYTIQUE INVALIDE ou INCOMPLET (transport OK, contenu HS). Activation du repli local."
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('CLOUD_PREDICTION_FALLBACK', {
            detail: {
              drawName: context.drawName,
              error: "Payload cloud analytique invalide ou incomplet."
            }
          }));
        }
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      logger.warn(
        { drawName: context.drawName, error: errorMsg },
        "[predictionScenarios] Scenario C : Échec de la prédiction Cloud (Réseau/Serveur). Basculement automatique local."
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('CLOUD_PREDICTION_FALLBACK', {
          detail: {
            drawName: context.drawName,
            error: errorMsg
          }
        }));
      }
    }
  }
  return null;
};
