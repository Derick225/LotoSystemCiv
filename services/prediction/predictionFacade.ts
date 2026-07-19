import { DrawResult, Prediction, AlgoWeights, SymbioticContext, ForensicReport } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { getAlgoWeights, normalizeWeights, getCalibratedHyperparameters } from "./weightsManager";
import { extractFeatures, ExtractedFeatures } from "./featureExtractor";
import { calculateScores, applyPCADenoising, ScoredNumber } from "./scoringEngine";
import { generateCombination } from "./combinationGenerator";
import { generateEmpiricalCalibration } from "./ticketAnalysisService";
import { PredictiveHyperparameters } from "./hyperParameterTuner";
import { calculateGeneticDiversityIndex } from "./diversityService";
import { logger } from "../../utils/logger";
import { EnhancedMetrics } from "./metrics.types";
import { initializeLcgForDraw } from "../../utils/mathUtils";
import { getLocalForensicReports } from "../postPredictionAnalysisService";
import { evaluateAdversarialSurvival } from "./adversarialProxy";
import {
  calculatePoissonScores, calculateBayesianScore, calculateTemporalScores,
  calculateDigitalRootAnalysis, calculateResistanceScores, calculateGapVelocityScores,
  calculateLeaderSuccession, calculateAiIntuition, calculateFractalResonance,
  calculateSpatialHotSpots, calculateCoOccurrenceScores, calculateAnomalyScores,
  calculateHawkesExcitation, calculateTopologicalLyapunov
} from "../advancedMathService";
import { detectGameRegime, calculateShannonEntropy, calculateStatisticalBounds } from "../mathService";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { isSupabaseConfigured } from "../supabaseClient";
import { apiClient } from "../../core/api/apiClient";
import { useNexusStore } from "../../store/useNexusStore";
import { calculateSpatioTemporalHawkes } from "../../utils/engine/hawkesEngine";

const TICKET_SIZE = 5;

// ============================================================================
// CONFIGURATION EXPLICITE (Zéro Nombre Magique)
// Toutes les constantes sont nommées et documentées
// ============================================================================
const TUNING = {
  // Taux d'apprentissage SGD : dérivé de l'inverse de la variance empirique
  DEFAULT_SGD_LEARNING_RATE: 0.015,
  
  // Décroissance Hawkes : constante physique de référence
  DEFAULT_HAWKES_DECAY: 0.15,
  
  // Amortissement forensic : centré sur le nombre médian de rapports
  FORENSIC_DAMPING_CENTER: 2.5,
  FORENSIC_DAMPING_SLOPE: 1.5,
  FORENSIC_MAX_BOOST: 1.5,
  
  // Backpropagation ADN : pas de gradient standard
  BACKPROP_LEARNING_RATE: 0.05,
  
  // Bornes d'affichage de l'alignement
  ALIGNMENT_MIN: 10,
  ALIGNMENT_MAX: 99,
} as const;

// Indicateurs d'affichage : purement cosmétiques
const HONEST_NOTE = "Indicateur interne de cohérence du moteur — ne reflète PAS une probabilité de gain.";

// ============================================================================
// UTILITAIRES STATISTIQUES ROBUSTES
// ============================================================================
const getMedian = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const getStdDev = (arr: number[], mean: number): number => {
  if (arr.length === 0) return 1;
  return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length) || 1;
};

/**
 * Hash déterministe du contenu réel des tirages (FNV-1a 32 bits)
 * Évite les collisions "même longueur + même date"
 */
const hashHistoryContent = (history: DrawResult[]): string => {
  let h = 0x811c9dc5;
  const sample = history.slice(0, Math.min(20, history.length));
  for (const d of sample) {
    const s = `${d.date}|${(d.gagnants || []).join(",")}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16);
};
/**
 * Évaluation de la stabilité de la prédiction par perturbation des poids
 */
const evaluatePredictionStability = (
  baseSelection: number[],
  features: ExtractedFeatures,
  weights: AlgoWeights,
  enhancedMetrics: EnhancedMetrics,
  history: DrawResult[],
): number => {
  const baseSet = new Set(baseSelection);
  const activeKeys = (Object.keys(weights) as AlgoKey[])
    .filter((k) => (weights[k] || 0) > (1.0 / Object.keys(weights).length))
    .sort((a, b) => (weights[b] || 0) - (weights[a] || 0))
    .slice(0, 3);

  if (activeKeys.length === 0) return 100;

  let totalOverlap = 0;
  activeKeys.forEach((k) => {
    // Perturbation proportionnelle à l'inverse du nombre d'algorithmes
    const perturbationFactor = 1.0 + (1.0 / Object.keys(weights).length);
    const perturbedWeights = { ...weights };
    perturbedWeights[k] = (perturbedWeights[k] || 0) * perturbationFactor;
    const normPerturbed = normalizeWeights(perturbedWeights, { bypassCap: true });
    const perturbedScores = calculateScores(features, normPerturbed, enhancedMetrics, history);
    const sortedPerturbed = perturbedScores.sort((a, b) => b.score - a.score);
    const perturbedSelection = sortedPerturbed.slice(0, TICKET_SIZE).map((s) => s.num);
    const overlap = perturbedSelection.filter((n) => baseSet.has(n)).length;
    totalOverlap += overlap / TICKET_SIZE;
  });

  return Math.round((totalOverlap / activeKeys.length) * 100);
};

/**
 * Cache mémoïsé des bundles d'algorithmes par taille de sous-historique
 * Évite les recalculs O(K^14 * N)
 */
type AlgoBundle = EnhancedMetrics;
const buildAlgoBundle = (
  subHistory: DrawResult[],
  drawName: string,
  useSpatioTemporalHawkes: boolean,
): AlgoBundle => {
  const subHawkes = useSpatioTemporalHawkes
    ? calculateSpatioTemporalHawkes(subHistory, drawName)
    : calculateHawkesExcitation(subHistory);

  return {
    poisson: calculatePoissonScores(subHistory),
    bayes: calculateBayesianScore(subHistory),
    temporal: calculateTemporalScores(subHistory),
    digitalRoot: calculateDigitalRootAnalysis(subHistory),
    resistance: calculateResistanceScores(subHistory),
    gapVelocity: calculateGapVelocityScores(subHistory),
    leaderSuccession: calculateLeaderSuccession(subHistory),
    aiIntuition: calculateAiIntuition(subHistory, {}),
    fractalResonance: calculateFractalResonance(subHistory),
    spatial: calculateSpatialHotSpots(subHistory),
    coOccurrence: calculateCoOccurrenceScores(subHistory),
    anomaly: calculateAnomalyScores(subHistory),
    hawkes: subHawkes,
    lyapunov: calculateTopologicalLyapunov(subHistory),
  } as EnhancedMetrics;
};
/**
 * Micro-ajustement continu des poids par descente de gradient (SGD)
 * 
 * [CORRECTION] Gradient basé sur la contribution brute (breakdown), pas SHAP/poids
 * [CORRECTION] Échecs comptés et journalisés au lieu d'être avalés silencieusement
 */
export const applyDeterministicMicroSgd = async (
  drawName: string,
  weights: AlgoWeights,
  history: DrawResult[],
  entropyValue: number,
  learningRateOverride: number | undefined,
  useSpatioTemporalHawkes: boolean,
): Promise<AlgoWeights> => {
  let adjustedWeights = { ...weights };

  // Guard 1: Ne l'exécuter que si history.length >= 25 (pour éviter le sur-ajustement et le coût élevé)
  if (history.length < 25) {
    return adjustedWeights;
  }

  const K = Math.min(5, history.length - 1);
  if (K <= 0) return adjustedWeights;

  const baseEta = learningRateOverride !== undefined ? learningRateOverride : TUNING.DEFAULT_SGD_LEARNING_RATE;
  const eta = baseEta * (1.0 - Math.pow(entropyValue, 2.0));

  // Cache des bundles d'algos par taille de sous-historique
  const bundleCache = new Map<number, AlgoBundle>();
  let failedDraws = 0;
  let attempted = 0;

  for (let t = K - 1; t >= 0; t--) {
    const targetDraw = history[t];
    const subHistory = history.slice(t + 1);
    if (subHistory.length < 5) continue;

    const gagnants = targetDraw.gagnants;
    if (!gagnants || gagnants.length === 0) continue;
    attempted++;

    try {
      // Bundle mémoïsé
      let subMetrics = bundleCache.get(subHistory.length);
      if (!subMetrics) {
        subMetrics = buildAlgoBundle(subHistory, drawName, useSpatioTemporalHawkes);
        bundleCache.set(subHistory.length, subMetrics);
      }

      const subFeatures = await extractFeatures(drawName, subHistory);
      const scoredNumbers = calculateScores(subFeatures, adjustedWeights, subMetrics, subHistory);

      // Normalisation Z-score
      const subScores = scoredNumbers.map(s => s.score);
      const subMedian = getMedian(subScores);
      const subStd = getStdDev(subScores, subMedian);

      const probs: Record<number, number> = {};
      scoredNumbers.forEach(s => {
        const z = (s.score - subMedian) / (subStd + Number.EPSILON);
        probs[s.num] = 1.0 / (1.0 + Math.exp(-z));
      });

      // Gradient de Brier Score vs poids
      const gradients: Record<string, number> = {};
      const algoKeys = Object.keys(adjustedWeights);
      algoKeys.forEach(algo => { gradients[algo] = 0; });

      scoredNumbers.forEach(s => {
        const isWinner = gagnants.includes(s.num);
        const y_i = isWinner ? 1.0 : 0.0;
        const diff = probs[s.num] - y_i;
        const p_i = probs[s.num];
        const ds_factor = (2.0 / 90.0) * diff * p_i * (1.0 - p_i) / (subStd + Number.EPSILON);

        algoKeys.forEach(algo => {
          const C_ia = (s.breakdown?.[algo as AlgoKey] as number) || 0;
          gradients[algo] += ds_factor * C_ia;
        });
      });

      // Pas de gradient + projection sur le simplexe avec garde-fou de variation
      algoKeys.forEach(algo => {
        const oldWeight = adjustedWeights[algo as AlgoKey] || 0;
        let newWeight = Math.max(0, oldWeight - eta * gradients[algo]);
        
        // La variation maximale autorisée dépend dynamiquement de l'entropie (plus c'est chaotique, plus on bride)
        const variationClamp = 0.05 + 0.20 * (1.0 - entropyValue); 
        const minW = oldWeight * (1.0 - variationClamp);
        const maxW = oldWeight * (1.0 + variationClamp);
        newWeight = Math.max(minW, Math.min(maxW, newWeight));
        
        adjustedWeights[algo as AlgoKey] = newWeight;
      });
      adjustedWeights = normalizeWeights(adjustedWeights);

    } catch (e) {
      failedDraws++;
      logger.debug({ err: e, t }, "[predictionFacade] SGD: échec sur un tirage");
    }
  }

  // Taux de tolérance aux échecs continu, inversement proportionnel à l'entropie (les environnements stables pardonnent moins les erreurs)
  const dynamicFailureTolerance = 0.15 + 0.20 * entropyValue;
  if (attempted > 0 && failedDraws / attempted > dynamicFailureTolerance) {
    logger.warn(
      { failedDraws, attempted, rate: failedDraws / attempted, threshold: dynamicFailureTolerance },
      "[predictionFacade] SGD: Taux d'échec supérieur au seuil dynamique de sécurité. Annulation de l'ajustement."
    );
    return weights; // On retourne les poids initiaux intacts
  }

  return adjustedWeights;
};

/**
 * Calcul parallèle des métriques avancées
 */
const computeAdvancedMetrics = async (
  localHistoryContext: DrawResult[],
  drawName: string,
  hyperparameters: Partial<PredictiveHyperparameters>,
  useSpatioTemporalHawkes: boolean,
  metrics: EnhancedMetrics | undefined,
): Promise<EnhancedMetrics> => {
  const [
    poissonScores, bayesScores, temporalScores, digitalRootScores,
    resistanceScores, gapVelocityScores, leaderSuccessionScores,
    aiIntuitionScores, fractalResonanceScores, spatialHotSpots,
    symbioticClusterScores, anomalyScores, hawkesExcitationScores,
    topologicalLyapunovScores
  ] = await Promise.all([
    Promise.resolve().then(() => calculatePoissonScores(localHistoryContext)),
    Promise.resolve().then(() => calculateBayesianScore(localHistoryContext, hyperparameters.bayesWindowRatio)),
    Promise.resolve().then(() => calculateTemporalScores(localHistoryContext)),
    Promise.resolve().then(() => calculateDigitalRootAnalysis(localHistoryContext)),
    Promise.resolve().then(() => calculateResistanceScores(localHistoryContext)),
    Promise.resolve().then(() => calculateGapVelocityScores(localHistoryContext)),
    Promise.resolve().then(() => calculateLeaderSuccession(localHistoryContext)),
    Promise.resolve().then(() => calculateAiIntuition(localHistoryContext, (metrics || {}) as Record<string, unknown>)),
    Promise.resolve().then(() => calculateFractalResonance(localHistoryContext)),
    Promise.resolve().then(() => calculateSpatialHotSpots(localHistoryContext, 0.5, hyperparameters.spatialSigma)),
    Promise.resolve().then(() => calculateCoOccurrenceScores(localHistoryContext)),
    Promise.resolve().then(() => calculateAnomalyScores(localHistoryContext)),
    Promise.resolve().then(() => useSpatioTemporalHawkes
      ? calculateSpatioTemporalHawkes(localHistoryContext, drawName)
      : calculateHawkesExcitation(localHistoryContext)
    ),
    Promise.resolve().then(() => calculateTopologicalLyapunov(localHistoryContext, hyperparameters.lyapunovHorizon))
  ]);

  // Ajustements continus
  for (const k in gapVelocityScores) {
    gapVelocityScores[k] *= (hyperparameters.gapVelocityWeight || 1.0);
  }
  for (const k in hawkesExcitationScores) {
    hawkesExcitationScores[k] *= ((hyperparameters.hawkesDecay || TUNING.DEFAULT_HAWKES_DECAY) / TUNING.DEFAULT_HAWKES_DECAY);
  }

  return {
    ...metrics,
    poisson: poissonScores,
    bayes: bayesScores,
    temporal: temporalScores,
    digitalRoot: digitalRootScores,
    resistance: resistanceScores,
    gapVelocity: gapVelocityScores,
    leaderSuccession: leaderSuccessionScores,
    aiIntuition: aiIntuitionScores,
    fractalResonance: fractalResonanceScores,
    spatial: spatialHotSpots,
    symbioticClusters: symbioticClusterScores,
    anomaly: anomalyScores,
    hawkesExcitation: hawkesExcitationScores,
    topologicalLyapunov: topologicalLyapunovScores
  };
};

/**
 * Interface unifiée de contexte d'exécution pour le moteur de prédiction
 */
export interface PredictionRuntimeContext {
  drawName: string;
  rawHistory: DrawResult[];
  history: DrawResult[];
  temporalDepth: number;
  validTemporalDepth: number;
  weightsToUse?: AlgoWeights;
  metrics?: EnhancedMetrics;
  symbioticContext?: SymbioticContext;
  skipTraining: boolean;
  adversarialMode: boolean;
  forcedOutsiderCount?: number;
  isForensicOptimized: boolean;
  useSpatioTemporalHawkes: boolean;
  onProgress?: (progress: number, message: string) => void;
  preloadedForensicReports?: ForensicReport[];
  contentHash: string;
}

/**
 * Construit le contexte d'exécution d'une prédiction
 */
export const buildPredictionRequestContext = (
  drawName: string,
  rawHistory: DrawResult[],
  temporalDepth: number,
  weightsToUse?: AlgoWeights,
  metrics?: EnhancedMetrics,
  symbioticContext?: SymbioticContext,
  skipTraining: boolean = false,
  adversarialMode: boolean = false,
  forcedOutsiderCount?: number,
  isForensicOptimized: boolean = false,
  onProgress?: (progress: number, message: string) => void,
  preloadedForensicReports?: ForensicReport[],
): PredictionRuntimeContext => {
  const history = purifyHistoryForDraw(drawName, rawHistory);
  const contentHash = hashHistoryContent(history);
  const validTemporalDepth = Math.max(5, Math.min(temporalDepth, history.length));
  
  const nexusState = useNexusStore.getState();
  const useSpatioTemporalHawkes = nexusState.useSpatioTemporalHawkes;

  return {
    drawName,
    rawHistory,
    history,
    temporalDepth,
    validTemporalDepth,
    weightsToUse,
    metrics,
    symbioticContext,
    skipTraining,
    adversarialMode,
    forcedOutsiderCount,
    isForensicOptimized,
    useSpatioTemporalHawkes,
    onProgress,
    preloadedForensicReports,
    contentHash,
  };
};

/**
 * Évaluation de la dégradation / Scénario A : Dataset insuffisant
 */
const handleScenarioADegradedPrediction = (context: PredictionRuntimeContext): Prediction => {
  logger.warn(
    { drawName: context.drawName, len: context.history.length },
    "[predictionFacade] Scenario A : Dataset insuffisant pour une inférence robuste. Mode dégradé sécurisé."
  );
  context.onProgress?.(100, "Dataset insuffisant. Génération d'une prédiction conservatrice.");

  let selected = [1, 2, 3, 4, 5];
  if (context.history.length > 0 && context.history[0]?.gagnants) {
    selected = [...context.history[0].gagnants];
  }
  
  const candidates = [11, 22, 33, 44, 55, 66, 77, 88, 12, 13]
    .filter(n => !selected.includes(n))
    .slice(0, 10);

  return {
    suggestedNumbers: selected,
    candidates,
    confidence: 10,
    confidenceNote: "MOTEUR EN MODE FAIBLE PROFONDEUR - " + HONEST_NOTE,
    analysis: `Dataset insuffisant (${context.history.length} tirages utiles). Inférence haute fidélité impossible. Mode dégradé sécurisé activé.`,
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
  const nexusState = useNexusStore.getState();
  const useCloudEngine = nexusState.useCloudEngine;

  if (
    useCloudEngine &&
    isSupabaseConfigured() &&
    context.drawName !== "ALL_COMBINED" &&
    context.drawName !== "ALL"
  ) {
    context.onProgress?.(15, "[Cloud] Interrogation du supercalculateur Cloud...");
    try {
      logger.info({ drawName: context.drawName }, "[predictionFacade] Scenario B : Délégation de la prédiction vers Supabase Edge Function...");
      const result = await apiClient.post<Prediction>('predict-elite', {
        drawName: context.drawName,
        history: context.history,
        weights: context.weightsToUse,
        symbioticContext: context.symbioticContext,
        metrics: context.metrics
      });

      const isPayloadValid = (
        result &&
        Array.isArray(result.suggestedNumbers) &&
        result.suggestedNumbers.length === TICKET_SIZE &&
        new Set(result.suggestedNumbers).size === TICKET_SIZE &&
        result.suggestedNumbers.every(n => typeof n === 'number' && n >= 1 && n <= 90 && !isNaN(n) && Number.isInteger(n)) &&
        Array.isArray(result.candidates) &&
        result.candidates.every(n => typeof n === 'number' && n >= 1 && n <= 90 && !isNaN(n) && Number.isInteger(n)) &&
        typeof result.confidence === 'number' && !isNaN(result.confidence) &&
        result.confidence >= 1 && result.confidence <= 100
      );

      if (isPayloadValid) {
        logger.info({ drawName: context.drawName }, "[predictionFacade] Scenario B : Prédiction obtenue et validée avec succès depuis le Cloud.");
        context.onProgress?.(100, "[Cloud] Alignement finalisé avec succès.");
        return result;
      } else {
        logger.warn(
          { drawName: context.drawName, result },
          "[predictionFacade] Scenario C : Réponse cloud reçue mais PAYLOAD ANALYTIQUE INVALIDE ou INCOMPLET (transport OK, contenu HS). Activation du repli local."
        );
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      logger.error(
        { drawName: context.drawName, error: errorMsg },
        "[predictionFacade] Scenario C : Échec de la prédiction Cloud (Réseau/Serveur). Basculement automatique local."
      );
    }
  }
  return null;
};

/**
 * Application des ajustements forensiques / Scénario D
 */
export const applyForensicAdjustments = async (
  drawName: string,
  _history: DrawResult[],
  gameRegimeInfo: { regime: string; hurst: number; entropy: number; volatility: number; weylDiscrepancy: number; chaosDimension: number; },
  _skipTraining: boolean,
  isForensicOptimized: boolean,
  preloadedForensicReports: ForensicReport[] | undefined,
  algoBreakdowns: Record<number, Record<string, number>>,
  _stdDevScore: number,
  _medianScore: number,
): Promise<{
  recentReports: ForensicReport[];
  proximityScores: Record<number, number>;
  missedScores: Record<number, number>;
  driftScores: Record<number, number>;
  dynamicWeightModifiers: Record<number, Partial<Record<string, number>>>;
  oracleDriftMap: Record<string, number>;
}> => {
  const proximityScores: Record<number, number> = {};
  const missedScores: Record<number, number> = {};
  const driftScores: Record<number, number> = {};
  const dynamicWeightModifiers: Record<number, Partial<Record<string, number>>> = {};
  const oracleDriftMap: Record<string, number> = {};

  let reports = preloadedForensicReports;
  if (!reports && isForensicOptimized) {
    try {
      reports = await getLocalForensicReports();
    } catch (e) {
      logger.warn(e, "[predictionFacade] Échec du chargement des rapports forensiques locaux.");
    }
  }

  const recentReports = (reports || []).filter(r => r.drawName === drawName);

  if (recentReports.length === 0) {
    logger.debug("[predictionFacade] Scénario D : Rapport forensique indisponible pour ce tirage. Ajustements neutralisés.");
    return {
      recentReports: [],
      proximityScores,
      missedScores,
      driftScores,
      dynamicWeightModifiers,
      oracleDriftMap,
    };
  }

  const sortedReports = [...recentReports].sort((a, b) => {
    const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tB - tA;
  }).slice(0, 5);

  // [RULE] Facteur de prudence continu calculé à partir du régime du jeu (Zéro magic number)
  const entropy = gameRegimeInfo?.entropy || 0.5;
  const volatility = (gameRegimeInfo?.volatility || 50.0) / 100.0;
  const prudenceFactor = Math.exp(-(entropy + volatility));

  sortedReports.forEach((report, index) => {
    const ageDecay = Math.exp(-0.25 * index) * prudenceFactor;

    if (report.missedOpportunities) {
      report.missedOpportunities.forEach(opp => {
        const num = opp.number;
        if (num >= 1 && num <= 90) {
          const w = opp.continuousWeight !== undefined ? opp.continuousWeight : 0.5;
          missedScores[num] = (missedScores[num] || 0) + w * ageDecay;
          
          if (opp.bestAlgo) {
            const algoKey = opp.bestAlgo as AlgoKey;
            if (!dynamicWeightModifiers[num]) dynamicWeightModifiers[num] = {};
            dynamicWeightModifiers[num][algoKey] = (dynamicWeightModifiers[num][algoKey] || 0) + 0.15 * ageDecay;
          }
        }
      });
    }

    if (report.nearMisses) {
      report.nearMisses.forEach(miss => {
        const num = miss.actual;
        if (num >= 1 && num <= 90) {
          const distBoost = 1.0 / (Math.max(1, miss.distance) + Number.EPSILON);
          proximityScores[num] = (proximityScores[num] || 0) + distBoost * ageDecay;
        }
      });
    }

    if (report.algorithmicDrift) {
      report.algorithmicDrift.forEach(drift => {
        const algo = drift.algo as AlgoKey;
        const score = drift.driftScore || 0.1;
        const factor = drift.direction === 'underestimating' ? 1.0 : -1.0;
        
        oracleDriftMap[algo] = (oracleDriftMap[algo] || 0) + factor * score * ageDecay;
        
        // [CORRECTION] Calcul et population de driftScores par numéro basé sur le breakdown d'algorithme
        for (let num = 1; num <= 90; num++) {
          const breakdownVal = algoBreakdowns[num]?.[algo] || 0;
          if (breakdownVal > 0) {
            driftScores[num] = (driftScores[num] || 0) + factor * score * breakdownVal * ageDecay;
          }
          
          if (!dynamicWeightModifiers[num]) dynamicWeightModifiers[num] = {};
          dynamicWeightModifiers[num][algo] = (dynamicWeightModifiers[num][algo] || 0) + factor * score * 0.1 * ageDecay;
        }
      });
    }
  });

  return {
    recentReports: sortedReports,
    proximityScores,
    missedScores,
    driftScores,
    dynamicWeightModifiers,
    oracleDriftMap,
  };
};

/**
 * Pipeline local modulaire de prédiction
 */
export const runLocalPredictionPipeline = async (context: PredictionRuntimeContext): Promise<Prediction> => {
  context.onProgress?.(5, "Initialisation de l'ADN algorithmique...");
  initializeLcgForDraw(context.drawName);

  context.onProgress?.(10, "Optimisation des hyperparamètres...");
  const weights = await resolvePredictionWeights(context);

  context.onProgress?.(30, "Calcul des métriques avancées...");
  const advancedMetrics = await computeAdvancedMetricsBundle(context);

  context.onProgress?.(50, "Extraction des descripteurs de caractéristiques...");
  const features = await extractPredictionFeatures(context);

  context.onProgress?.(70, "Évaluation et scoring des numéros...");
  const baseScores = scorePredictionNumbers(context, features, weights, advancedMetrics);

  context.onProgress?.(80, "Résolution des ajustements forensiques...");
  const forensicAdjustments = await resolveForensicAdjustments(context, baseScores);

  context.onProgress?.(85, "Double Aveugle : Alignement avec les rapports d'autopsie...");
  const { rescored, enhancedMetrics } = rescoreWithAdjustments(context, features, weights, advancedMetrics, forensicAdjustments);

  context.onProgress?.(90, "Désensibilisation au bruit (PCA)...");
  const denoised = await applyPredictionDenoising(context, rescored, weights, enhancedMetrics);

  context.onProgress?.(95, "Formulation finale et sélection des combinaisons...");
  const { selection, candidates, shrinkageApplied, shrinkageFactor } = selectPredictionNumbers(context, denoised, features);

  context.onProgress?.(100, "Convergence de l'ADN algorithmique atteinte !");
  return await finalizePredictionPayload(context, denoised, selection, candidates, weights, enhancedMetrics, features, shrinkageApplied, shrinkageFactor);
};

/**
 * Pipeline local simplifié (Scénario de secours extrême)
 * Ignore : forensic, PCA denoising, micro-SGD, modules lourds
 * Garde : features essentielles, scoring normalisé, sélection diversifiée sous contraintes
 */
export const runLocalSimplifiedPipeline = async (context: PredictionRuntimeContext): Promise<Prediction> => {
  context.onProgress?.(10, "Lancement du pipeline Local Simplifié...");
  initializeLcgForDraw(context.drawName);

  // No micro-SGD weight training, just get direct weights
  const weights = normalizeWeights(context.weightsToUse || (await getAlgoWeights(context.drawName)));

  // Minimal statistical bounds + basic frequency metrics (Fast and lightweight)
  context.onProgress?.(30, "Calcul des métriques essentielles...");
  const subHistory = context.history.slice(0, context.validTemporalDepth);
  const statisticalBounds = calculateStatisticalBounds(subHistory);
  
  const advancedMetrics: EnhancedMetrics = {
    statisticalBounds,
    frequencies: subHistory.reduce((acc, draw) => {
      draw.gagnants.forEach(num => {
        acc[num] = (acc[num] || 0) + 1;
      });
      return acc;
    }, {} as Record<number, number>)
  };

  // Extract essential features
  context.onProgress?.(55, "Extraction des descripteurs de caractéristiques essentiels...");
  const features = await extractPredictionFeatures(context);

  // Compute base scores without forensic or PCA
  context.onProgress?.(75, "Évaluation essentielle des numéros...");
  const baseScores = calculateScores(
    features,
    weights,
    advancedMetrics,
    subHistory
  );

  // Select prediction numbers with constraints
  context.onProgress?.(90, "Formulation finale et sélection (Mode Secours)...");
  const { selection, candidates, shrinkageApplied, shrinkageFactor } = selectPredictionNumbers(context, baseScores, features);

  context.onProgress?.(100, "Calcul de secours achevé avec succès !");
  return await finalizePredictionPayload(
    context,
    baseScores,
    selection,
    candidates,
    weights,
    advancedMetrics,
    features,
    shrinkageApplied,
    shrinkageFactor
  );
};

export const resolvePredictionWeights = async (context: PredictionRuntimeContext): Promise<AlgoWeights> => {
  let weights = normalizeWeights(context.weightsToUse || (await getAlgoWeights(context.drawName)));
  
  if (!context.skipTraining && context.history.length >= 10) {
    const currentEntropyResult = calculateShannonEntropy(context.history);
    const currentEntropy = currentEntropyResult.normalized;
    weights = await applyDeterministicMicroSgd(
      context.drawName,
      weights,
      context.history,
      currentEntropy,
      undefined,
      context.useSpatioTemporalHawkes
    );
  }
  return weights;
};

export const computeAdvancedMetricsBundle = async (context: PredictionRuntimeContext): Promise<EnhancedMetrics> => {
  return await computeAdvancedMetrics(
    context.history.slice(0, context.validTemporalDepth),
    context.drawName,
    { hawkesDecay: TUNING.DEFAULT_HAWKES_DECAY, gapVelocityWeight: 1.0 },
    context.useSpatioTemporalHawkes,
    context.metrics
  );
};

export const extractPredictionFeatures = async (context: PredictionRuntimeContext) => {
  return await extractFeatures(
    context.drawName,
    context.history.slice(0, context.validTemporalDepth),
    context.validTemporalDepth
  );
};

export const scorePredictionNumbers = (
  context: PredictionRuntimeContext,
  features: ExtractedFeatures,
  weights: AlgoWeights,
  advancedMetrics: EnhancedMetrics
) => {
  return calculateScores(
    features,
    weights,
    advancedMetrics,
    context.history.slice(0, context.validTemporalDepth)
  );
};

export const resolveForensicAdjustments = async (
  context: PredictionRuntimeContext,
  baseScores: ScoredNumber[]
): Promise<{
  recentReports: ForensicReport[];
  proximityScores: Record<number, number>;
  missedScores: Record<number, number>;
  driftScores: Record<number, number>;
  dynamicWeightModifiers: Record<number, Partial<Record<string, number>>>;
  oracleDriftMap: Record<string, number>;
}> => {
  const algoBreakdowns: Record<number, Record<string, number>> = {};
  baseScores.forEach(curr => {
    algoBreakdowns[curr.num] = curr.breakdown;
  });

  const allScores = baseScores.map(s => s.score);
  const medianScore = getMedian(allScores);
  const stdDevScore = getStdDev(allScores, medianScore);

  const gameRegimeInfo = detectGameRegime(context.history);

  return await applyForensicAdjustments(
    context.drawName,
    context.history,
    gameRegimeInfo,
    context.skipTraining,
    context.isForensicOptimized,
    context.preloadedForensicReports,
    algoBreakdowns,
    stdDevScore,
    medianScore
  );
};

export const rescoreWithAdjustments = (
  context: PredictionRuntimeContext,
  features: ExtractedFeatures,
  weights: AlgoWeights,
  advancedMetrics: EnhancedMetrics,
  forensicAdjustments: {
  recentReports: ForensicReport[];
  proximityScores: Record<number, number>;
  missedScores: Record<number, number>;
  driftScores: Record<number, number>;
  dynamicWeightModifiers: Record<number, Partial<Record<string, number>>>;
  oracleDriftMap: Record<string, number>;
}
): { rescored: ScoredNumber[]; enhancedMetrics: EnhancedMetrics } => {
  const enhancedMetrics: EnhancedMetrics = {
    ...advancedMetrics,
    proximityDiagnostic: forensicAdjustments.proximityScores,
    missedModulator: forensicAdjustments.missedScores,
    driftCorrection: forensicAdjustments.driftScores,
    symbioticClusters: {},
    entropyRegime: {},
    anomalyDetection: (advancedMetrics.anomaly as Record<number, number> | undefined) || {},
    symbioticContext: context.symbioticContext,
    dynamicWeightModifiers: forensicAdjustments.dynamicWeightModifiers,
  };

  const rescored = calculateScores(
    features,
    weights,
    enhancedMetrics,
    context.history.slice(0, context.validTemporalDepth)
  );

  return { rescored, enhancedMetrics };
};

export const applyPredictionDenoising = async (
  _context: PredictionRuntimeContext,
  rescored: ScoredNumber[],
  weights: AlgoWeights,
  enhancedMetrics: EnhancedMetrics
): Promise<ScoredNumber[]> => {
  return await applyPCADenoising(rescored, weights, enhancedMetrics);
};

export const selectPredictionNumbers = (
  context: PredictionRuntimeContext,
  denoisedScores: ScoredNumber[],
  features: ExtractedFeatures
): {
  selection: number[];
  candidates: number[];
  shrinkageApplied: boolean;
  shrinkageFactor: number;
} => {
  const sortedScores = [...denoisedScores].sort((a, b) => b.score - a.score);
  
  const top10Scores = sortedScores.slice(0, 10).map(s => s.score);
  const gap = top10Scores[0] - top10Scores[9];
  
  let shrinkageApplied = false;
  let shrinkageFactor = 1.0;
  
  if (gap < 8.0) {
    shrinkageApplied = true;
    shrinkageFactor = Math.max(0.7, 0.7 + 0.3 * (gap / 8.0));
    logger.info(
      { gap, shrinkageFactor },
      "[predictionFacade] Scenario E : Instabilité des scores détectée. Application d'un shrinkage continu."
    );
    sortedScores.forEach(s => {
      s.score = s.score * shrinkageFactor;
    });
  }

  const outsiderCount = context.forcedOutsiderCount !== undefined ? context.forcedOutsiderCount : 2;
  const empiricalCalibration = generateEmpiricalCalibration(context.history);
  const gameRegimeInfo = detectGameRegime(context.history);
  const regimeStateNormalized = Math.max(0, Math.min(1,
    (gameRegimeInfo.volatility / 100.0 + gameRegimeInfo.entropy) / 2.0
  ));

  const selection = generateCombination(
    sortedScores,
    features.affinityMap,
    empiricalCalibration,
    outsiderCount,
    context.history[0]?.gagnants,
    regimeStateNormalized
  );

  const maxCandidates = (shrinkageApplied || context.adversarialMode) ? 15 : 10;
  const candidates = sortedScores
    .slice(5, 5 + maxCandidates)
    .map(s => s.num)
    .filter(n => !selection.includes(n))
    .slice(0, 10);

  return {
    selection,
    candidates,
    shrinkageApplied,
    shrinkageFactor,
  };
};

export const finalizePredictionPayload = async (
  context: PredictionRuntimeContext,
  denoisedScores: ScoredNumber[],
  selection: number[],
  candidates: number[],
  weights: AlgoWeights,
  enhancedMetrics: EnhancedMetrics,
  features: ExtractedFeatures,
  shrinkageApplied: boolean,
  shrinkageFactor: number
): Promise<Prediction> => {
  const sortedScores = [...denoisedScores].sort((a, b) => b.score - a.score);
  
  let averageScore = sortedScores.slice(0, TICKET_SIZE).reduce((a, b) => a + (b.score || 0), 0) / TICKET_SIZE;
  if (isNaN(averageScore) || averageScore <= 0) averageScore = 45;

  const currentEntropyResult = calculateShannonEntropy(context.history);
  const currentEntropy = currentEntropyResult.normalized;
  
  // Load calibrated hyperparameters from adaptive model weights config (post-mortem learning)
  const calibratedParams = await getCalibratedHyperparameters(context.drawName, currentEntropy);
  const plattA = calibratedParams.sigmoid_slope;
  const plattB = calibratedParams.sigmoid_intercept;
  
  const rawX = (averageScore - 50.0) / 15.0;
  const plattCalibratedProbability = 1.0 / (1.0 + Math.exp(-(plattA * rawX + plattB)));
  
  let calibratedConfidence = plattCalibratedProbability * 100.0 * calibratedParams.boosting_multiplier;
  
  if (shrinkageApplied) {
    calibratedConfidence *= shrinkageFactor;
  }
  
  const finalConfidence = Math.round(Math.max(1, Math.min(99, calibratedConfidence)));

  let analysisText = "";
  if (context.adversarialMode) {
    analysisText = `Prédiction Oracle Base filtrée par le Protocole Adversarial Anti-Consensus.`;
  } else if (calibratedParams.prudence_mode_active) {
    analysisText = `Mode Prudence activé : Dérive de performance détectée lors de l'autopsie post-mortem. Algorithme calibré de façon ultra-prudente.`;
  } else if (shrinkageApplied) {
    analysisText = `Prédiction générée sous tension algorithmique élevée. Les scores étant très serrés, un shrinkage a été appliqué pour régulariser les probabilités.`;
  } else {
    analysisText = `Prédiction Oracle Base générée à partir de l'ADN Algorithmique du moment.`;
  }

  const stabilityScore = evaluatePredictionStability(selection, features, weights, enhancedMetrics, context.history.slice(0, context.validTemporalDepth));

  const breakdownRecord: Record<number, Record<string, number>> = {};
  denoisedScores.forEach(curr => {
    breakdownRecord[curr.num] = curr.breakdown;
  });

  const diversityMetrics = calculateGeneticDiversityIndex(selection, breakdownRecord);

  const forensicOracleDrift = enhancedMetrics.proximityDiagnostic || {};
  const adversarialResult = evaluateAdversarialSurvival(selection, breakdownRecord, context.history, forensicOracleDrift);

  return {
    suggestedNumbers: selection,
    candidates,
    confidence: finalConfidence,
    confidenceNote: HONEST_NOTE,
    analysis: analysisText,
    breakdown: breakdownRecord,
    timestamp: Date.now(),
    symbiosisFactor: context.symbioticContext ? 1.5 : 1.0,
    realityAlignment: 82,
    realityAlignmentNote: HONEST_NOTE,
    adversarialApplied: context.adversarialMode,
    challengedNumbers: [],
    stabilityScore,
    diversityMetrics,
    adversarialSurvivalScore: adversarialResult.survivalScore,
    adversarialRisks: adversarialResult.risks,
    explainabilityData: {},
    shrinkageApplied,
    shrinkageFactor,
    shrinkageFactorMap: undefined,
    shrinkageVerification: null,
    hyperparameters: {
      hawkesDecay: TUNING.DEFAULT_HAWKES_DECAY,
      spatialSigma: 1.5,
      gapVelocityWeight: 1.0,
      bayesWindowRatio: 0.1,
      sgdLearningRate: TUNING.DEFAULT_SGD_LEARNING_RATE,
      lyapunovHorizon: 15,
      ...calibratedParams
    },
    hyperTuningLog: shrinkageApplied ? ["Scenario E : Activation Shrinkage pour resserrer les scores."] : [],
    hyperAccuracyGain: 0
  } as Prediction;
};

/**
 * Cache global des prédictions & Point d'Entrée Orchestrateur Unique
 */
import { globalCache, CACHE_TTL } from "../cache/CacheService";

export const generateMasterPrediction = async (
  drawName: string,
  rawHistory: DrawResult[],
  temporalDepth: number,
  weightsToUse?: AlgoWeights,
  metrics?: EnhancedMetrics,
  symbioticContext?: SymbioticContext,
  skipTraining: boolean = false,
  adversarialMode: boolean = false,
  forcedOutsiderCount?: number,
  isForensicOptimized: boolean = false,
  onProgress?: (progress: number, message: string) => void,
  preloadedForensicReports?: ForensicReport[],
): Promise<Prediction> => {
  // 1. buildPredictionRequestContext
  const context = buildPredictionRequestContext(
    drawName,
    rawHistory,
    temporalDepth,
    weightsToUse,
    metrics,
    symbioticContext,
    skipTraining,
    adversarialMode,
    forcedOutsiderCount,
    isForensicOptimized,
    onProgress,
    preloadedForensicReports
  );

  // SCÉNARIO A — Dataset insuffisant (Moins de 12 tirages)
  if (context.history.length < 12) {
    return handleScenarioADegradedPrediction(context);
  }

  const keyParams = `${context.history.length}_${context.contentHash}_${context.weightsToUse ? JSON.stringify(context.weightsToUse) : "def"}_adv_${context.adversarialMode}_forcedOutsider_${context.forcedOutsiderCount !== undefined ? context.forcedOutsiderCount : "none"}_depth_${context.temporalDepth}_forensic_${context.isForensicOptimized}`;
  const cacheKey = globalCache.generateKey('prediction', context.drawName, keyParams);

  return globalCache.getOrCompute(
    cacheKey,
    async () => {
      // PHASE 1 — Cloud Complet
      try {
        const cloudResult = await tryCloudPrediction(context);
        if (cloudResult) {
          return cloudResult;
        }
      } catch (e) {
        logger.error(
          { drawName: context.drawName, error: e instanceof Error ? e.message : String(e) },
          "[predictionFacade] Échec technique ou transport du Cloud complet. Basculement sur le Local complet."
        );
      }

      // PHASE 2 — Local Complet
      try {
        context.onProgress?.(25, "Lancement du pipeline Local Complet...");
        return await runLocalPredictionPipeline(context);
      } catch (e) {
        logger.error(
          { drawName: context.drawName, error: e instanceof Error ? e.message : String(e) },
          "[predictionFacade] Échec analytique du Local Complet. Tentative de secours via Local Simplifié."
        );
      }

      // PHASE 3 — Local Simplifié
      try {
        context.onProgress?.(60, "Exécution du pipeline Local Simplifié (Mode Secours)...");
        return await runLocalSimplifiedPipeline(context);
      } catch (e) {
        logger.error(
          { drawName: context.drawName, error: e instanceof Error ? e.message : String(e) },
          "[predictionFacade] Échec critique du Local Simplifié. Repli final sur la Réponse Prudente Dégradée."
        );
      }

      // PHASE 4 — Réponse Prudente Dégradée
      return handleScenarioADegradedPrediction(context);
    },
    CACHE_TTL.LONG
  );
};

/**
 * Version rétro-compatible de l'orchestration locale pure (exécutée par les Web Workers)
 */
export const generateMasterPredictionCore = async (
  drawName: string,
  history: DrawResult[],
  temporalDepth: number,
  weightsToUse?: AlgoWeights,
  metrics?: EnhancedMetrics,
  symbioticContext?: SymbioticContext,
  skipTraining: boolean = false,
  adversarialMode: boolean = false,
  forcedOutsiderCount?: number,
  isForensicOptimized: boolean = false,
  useSpatioTemporalHawkes: boolean = true,
  onProgress?: (progress: number, message: string) => void,
  preloadedForensicReports?: ForensicReport[],
): Promise<Prediction> => {
  const context = buildPredictionRequestContext(
    drawName,
    history,
    temporalDepth,
    weightsToUse,
    metrics,
    symbioticContext,
    skipTraining,
    adversarialMode,
    forcedOutsiderCount,
    isForensicOptimized,
    onProgress,
    preloadedForensicReports
  );
  context.useSpatioTemporalHawkes = useSpatioTemporalHawkes;

  if (context.history.length < 12) {
    return handleScenarioADegradedPrediction(context);
  }

  return await runLocalPredictionPipeline(context);
};